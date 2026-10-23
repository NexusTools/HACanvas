import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import type { VectorObjectSpec, SharedObjectCanvasSpec } from "../hybrid-art-engine.js";
import type {
    DecodedLayerItem,
    DecodedMultiLayerDocument,
    DocumentMetadataSpec,
    EmbeddedFontSpec
} from "../types/document-metadata-types.js";
import {
    hasMeaningfulMetadata,
    parseXmpPacketString
} from "../exporters/exif-xmp-metadata-exporter.js";
import { encodeRgbaToPng } from "../exporters/png-exporter.js";
import { extractJpegExifMetadata } from "./exif-xmp-metadata-importer.js";
import { decodeAnyImageToRgba } from "./any-image-importer.js";
import {
    clampByte,
    rgbFloatsToHex,
    cmykFloatsToHex,
    unescapePsString,
    multiplyMatrix,
    tokenizeAiContentStream
} from "./ai-importer.js";

interface PdfRawObject {
    id: number;
    dict: string;
    rawStream: Buffer | null;
    decodedStream: Buffer | null;
}

function parseToUnicodeCMap(cmapText: string): Map<number, string> {
    const map = new Map<number, string>();
    // Parse `beginbfchar ... endbfchar`
    const bfCharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
    let m: RegExpExecArray | null;
    while ((m = bfCharRegex.exec(cmapText)) !== null) {
        const pairRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
        let pm: RegExpExecArray | null;
        while ((pm = pairRegex.exec(m[1])) !== null) {
            const code = parseInt(pm[1], 16);
            const hexDst = pm[2];
            let str = "";
            for (let i = 0; i < hexDst.length; i += 4) {
                const cp = parseInt(hexDst.slice(i, i + 4), 16);
                if (!Number.isNaN(cp)) str += String.fromCodePoint(cp);
            }
            if (str) map.set(code, str);
        }
    }
    // Parse `beginbfrange ... endbfrange`
    const bfRangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = bfRangeRegex.exec(cmapText)) !== null) {
        const rangeRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
        let rm: RegExpExecArray | null;
        while ((rm = rangeRegex.exec(m[1])) !== null) {
            const start = parseInt(rm[1], 16);
            const end = parseInt(rm[2], 16);
            let dst = parseInt(rm[3], 16);
            for (let c = start; c <= end && c - start <= 1024; c++) {
                map.set(c, String.fromCodePoint(dst++));
            }
        }
    }
    return map;
}

function decodePdfStringToken(tok: string, toUnicode?: Map<number, string>): string {
    if (tok.startsWith("(") && tok.endsWith(")")) {
        const inner = tok.slice(1, -1);
        const raw = unescapePsString(inner);
        if (toUnicode && toUnicode.size > 0) {
            let mapped = "";
            for (let i = 0; i < raw.length; i++) {
                const code = raw.charCodeAt(i);
                mapped += toUnicode.get(code) ?? raw[i];
            }
            return mapped;
        }
        return raw;
    }
    if (tok.startsWith("<") && tok.endsWith(">") && !tok.startsWith("<<")) {
        const hex = tok.slice(1, -1).replace(/\s+/g, "");
        if (hex.length === 0) return "";
        if (toUnicode && toUnicode.size > 0) {
            // Try 2-byte codes if even multiple of 4 and CMap has >255 keys, else 1-byte codes
            const hasTwoByte = Array.from(toUnicode.keys()).some(k => k > 255);
            const step = hasTwoByte && hex.length % 4 === 0 ? 4 : 2;
            let out = "";
            for (let i = 0; i < hex.length; i += step) {
                const code = parseInt(hex.slice(i, i + step), 16);
                out += toUnicode.get(code) ?? (code >= 32 && code <= 126 ? String.fromCharCode(code) : "");
            }
            if (out) return out;
        }
        // Check UTF-16BE BOM (`FEFF`)
        if (hex.toUpperCase().startsWith("FEFF")) {
            let out = "";
            for (let i = 4; i + 3 < hex.length; i += 4) {
                const cp = parseInt(hex.slice(i, i + 4), 16);
                if (!Number.isNaN(cp) && cp > 0) out += String.fromCodePoint(cp);
            }
            return out;
        }
        let out = "";
        for (let i = 0; i + 1 < hex.length; i += 2) {
            const b = parseInt(hex.slice(i, i + 2), 16);
            if (!Number.isNaN(b) && b > 0) out += String.fromCharCode(b);
        }
        return out;
    }
    return "";
}

function cleanPdfFontMetadata(rawBaseFont: string): {
    cleanName: string;
    postScriptName: string;
    fontWeight: string;
    fontStyle: string;
} {
    const postScriptName = rawBaseFont.replace(/^\/+/, "").trim() || "sans-serif";
    const withoutSubset = postScriptName.replace(/^[A-Z]{6}\+/, "");
    const lower = withoutSubset.toLowerCase();
    const fontWeight = lower.includes("bold") || lower.includes("black") || lower.includes("heavy") ? "bold" : "normal";
    const fontStyle = lower.includes("italic") || lower.includes("oblique") ? "italic" : "normal";
    // Strip trailing style suffix like `-BoldItalic`, `-Bold`, `,Bold` for clean family name if present
    const cleanFamily = withoutSubset
        .replace(/[-,](BoldItalic|BoldOblique|Bold|Italic|Oblique|Regular|Roman|Medium)$/i, "")
        .trim() || withoutSubset;
    return {
        cleanName: cleanFamily,
        postScriptName,
        fontWeight,
        fontStyle
    };
}


/**
 * Parses a multi-page PDF document buffer into `DecodedMultiLayerDocument`:
 * - **Each PDF page is opened as its own Vector Layer** (`"Page 1"`, `"Page 2"`, ...).
 * - **Raster images (`Do` Image XObjects & inline images)** inside each page are placed as
 *   editable `kind: "image"` raster objects directly inside the page's vector layer.
 * - **Text objects (`BT ... ET`, `Tf`, `Tj`, `TJ`)** are imported as editable `kind: "text"`
 *   vector objects retaining their `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `fontId`, and `fill`.
 * - **Embedded fonts (`/FontFile`, `/FontFile2`, `/FontFile3`)** are extracted from the PDF and returned in
 *   `embeddedFonts` so they are stored inside the `.hacanvas` package and listed in the Embedded Fonts panel.
 */
export function parsePdfBuffer(pdfBuf: Buffer): DecodedMultiLayerDocument {
    const rawLatin1 = pdfBuf.toString("latin1");
    if (!rawLatin1.slice(0, 1024).includes("%PDF-")) {
        throw new Error("Invalid PDF file: missing %PDF- header signature.");
    }

    // 1. Parse all indirect PDF objects (`N M obj ... endobj`)
    const objects = new Map<number, PdfRawObject>();
    const objRegex = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g;
    let match: RegExpExecArray | null;
    while ((match = objRegex.exec(rawLatin1)) !== null) {
        const objId = parseInt(match[1], 10);
        const body = match[3];
        const bodyStartInBuf = match.index + match[0].indexOf(body);

        const streamMatch = /<<([\s\S]*?)>>\s*\r?\n?stream(\r?\n)/.exec(body);
        if (streamMatch) {
            const dict = streamMatch[1];
            const streamDataRelStart = streamMatch.index + streamMatch[0].length;
            const endStreamRelIdx = body.indexOf("endstream", streamDataRelStart);
            if (endStreamRelIdx !== -1) {
                let rawSlice = pdfBuf.subarray(
                    bodyStartInBuf + streamDataRelStart,
                    bodyStartInBuf + endStreamRelIdx
                );
                if (rawSlice.length > 0 && rawSlice[rawSlice.length - 1] === 0x0a) {
                    rawSlice = rawSlice.subarray(0, rawSlice.length - 1);
                    if (rawSlice.length > 0 && rawSlice[rawSlice.length - 1] === 0x0d) {
                        rawSlice = rawSlice.subarray(0, rawSlice.length - 1);
                    }
                }
                let decodedSlice: Buffer | null = rawSlice;
                if (/\/FlateDecode\b/.test(dict) && !/\/DCTDecode\b/.test(dict)) {
                    try {
                        decodedSlice = zlib.inflateSync(rawSlice);
                    } catch {
                        try {
                            decodedSlice = zlib.inflateRawSync(rawSlice);
                        } catch {
                            decodedSlice = rawSlice;
                        }
                    }
                }
                objects.set(objId, {
                    id: objId,
                    dict,
                    rawStream: rawSlice,
                    decodedStream: decodedSlice
                });
                continue;
            }
        }

        objects.set(objId, {
            id: objId,
            dict: body,
            rawStream: null,
            decodedStream: null
        });
    }

    // 1b. Also unpack `/Type /ObjStm` compressed object streams if present
    for (const obj of Array.from(objects.values())) {
        if (/\/Type\s*\/ObjStm\b/.test(obj.dict) && obj.decodedStream) {
            const nMatch = obj.dict.match(/\/N\s+(\d+)/);
            const firstMatch = obj.dict.match(/\/First\s+(\d+)/);
            if (nMatch && firstMatch) {
                const n = parseInt(nMatch[1], 10);
                const firstOffset = parseInt(firstMatch[1], 10);
                const text = obj.decodedStream.toString("latin1");
                const headerPairs = text.slice(0, firstOffset).trim().split(/\s+/).map(Number);
                for (let i = 0; i < n && i * 2 + 1 < headerPairs.length; i++) {
                    const subObjId = headerPairs[i * 2];
                    const subOffset = firstOffset + headerPairs[i * 2 + 1];
                    const nextOffset =
                        i + 1 < n && (i + 1) * 2 + 1 < headerPairs.length
                            ? firstOffset + headerPairs[(i + 1) * 2 + 1]
                            : text.length;
                    if (!objects.has(subObjId) && subOffset < text.length) {
                        objects.set(subObjId, {
                            id: subObjId,
                            dict: text.slice(subOffset, nextOffset),
                            rawStream: null,
                            decodedStream: null
                        });
                    }
                }
            }
        }
    }

    // 2. Extract Embedded Fonts (`/FontDescriptor` -> `/FontFile`, `/FontFile2`, `/FontFile3` & `/Type /Font`)
    const embeddedFonts: EmbeddedFontSpec[] = [];
    const fontStreamObjToSpec = new Map<number, EmbeddedFontSpec>();
    const fontDescObjToSpec = new Map<number, EmbeddedFontSpec>();
    let fontCounter = 1;

    const registerFontStream = (
        streamObjId: number,
        rawName: string,
        subtypeHint: "ttf" | "otf" | "type1" | "cff"
    ): EmbeddedFontSpec | undefined => {
        if (fontStreamObjToSpec.has(streamObjId)) {
            return fontStreamObjToSpec.get(streamObjId);
        }
        const streamObj = objects.get(streamObjId);
        const fontBuf = streamObj?.decodedStream || streamObj?.rawStream;
        if (!fontBuf || fontBuf.length === 0) return undefined;

        const meta = cleanPdfFontMetadata(rawName);
        let format: EmbeddedFontSpec["format"] = subtypeHint;
        if (fontBuf.length >= 4) {
            const magic = fontBuf.toString("ascii", 0, 4);
            if (magic === "OTTO") format = "otf";
            else if (magic === "wOFF") format = "woff";
            else if (magic === "wOF2") format = "woff2";
            else if (fontBuf.readUInt32BE(0) === 0x00010000 || magic === "true") format = "ttf";
        }
        const mimeMap: Record<EmbeddedFontSpec["format"], string> = {
            ttf: "font/ttf",
            otf: "font/otf",
            woff: "font/woff",
            woff2: "font/woff2",
            type1: "font/type1",
            cff: "font/cff"
        };

        const spec: EmbeddedFontSpec = {
            id: `pdf_font_${fontCounter++}`,
            name: meta.cleanName,
            family: meta.cleanName,
            postScriptName: meta.postScriptName,
            format,
            mimeType: mimeMap[format],
            dataBase64: fontBuf.toString("base64"),
            byteLength: fontBuf.length,
            fontWeight: meta.fontWeight,
            weight: meta.fontWeight,
            fontStyle: meta.fontStyle,
            style: meta.fontStyle,
            source: "Extracted from PDF"
        };
        embeddedFonts.push(spec);
        fontStreamObjToSpec.set(streamObjId, spec);
        return spec;
    };

    for (const [objId, obj] of objects.entries()) {
        if (/\/Type\s*\/FontDescriptor\b/.test(obj.dict) || /\/FontFile[23]?\s+\d+\s+\d+\s+R/.test(obj.dict)) {
            const nameMatch = obj.dict.match(/\/FontName\s*\/([^\s/<>\[\]()]+)/);
            const rawFontName = nameMatch ? nameMatch[1] : `EmbeddedFont_${objId}`;
            const ff2 = obj.dict.match(/\/FontFile2\s+(\d+)\s+\d+\s+R/);
            const ff3 = obj.dict.match(/\/FontFile3\s+(\d+)\s+\d+\s+R/);
            const ff1 = obj.dict.match(/\/FontFile\s+(\d+)\s+\d+\s+R/);

            let spec: EmbeddedFontSpec | undefined;
            if (ff2) {
                spec = registerFontStream(parseInt(ff2[1], 10), rawFontName, "ttf");
            } else if (ff3) {
                const subObj = objects.get(parseInt(ff3[1], 10));
                const isOtf = subObj && /\/Subtype\s*\/OpenType\b/.test(subObj.dict);
                spec = registerFontStream(parseInt(ff3[1], 10), rawFontName, isOtf ? "otf" : "cff");
            } else if (ff1) {
                spec = registerFontStream(parseInt(ff1[1], 10), rawFontName, "type1");
            }
            if (spec) {
                fontDescObjToSpec.set(objId, spec);
            }
        }
    }

    // Map PDF `/Type /Font` objects -> resolved font metadata + optional `EmbeddedFontSpec` + `/ToUnicode` CMap
    interface ResolvedPdfFont {
        fontFamily: string;
        postScriptName: string;
        fontWeight: string;
        fontStyle: string;
        fontId?: string;
        toUnicode?: Map<number, string>;
    }
    const fontObjMap = new Map<number, ResolvedPdfFont>();

    const parseFontDict = (dictText: string, selfObjId?: number): ResolvedPdfFont => {
        const baseMatch =
            dictText.match(/\/haFontName\s*\(([^)]+)\)/) ||
            dictText.match(/\/BaseFont\s*\/([^\s/<>\[\]()]+)/) ||
            dictText.match(/\/FontName\s*\/([^\s/<>\[\]()]+)/);
        const rawBase = baseMatch ? baseMatch[1] : "Helvetica";
        const meta = cleanPdfFontMetadata(rawBase);

        let linkedSpec: EmbeddedFontSpec | undefined;
        const fdRef = dictText.match(/\/FontDescriptor\s+(\d+)\s+\d+\s+R/);
        if (fdRef) {
            linkedSpec = fontDescObjToSpec.get(parseInt(fdRef[1], 10));
        }
        // Check DescendantFonts (for Type0 / CID fonts)
        if (!linkedSpec) {
            const descMatch = dictText.match(/\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/);
            if (descMatch) {
                const cidObj = objects.get(parseInt(descMatch[1], 10));
                if (cidObj) {
                    const cidFd = cidObj.dict.match(/\/FontDescriptor\s+(\d+)\s+\d+\s+R/);
                    if (cidFd) {
                        linkedSpec = fontDescObjToSpec.get(parseInt(cidFd[1], 10));
                    }
                }
            }
        }
        if (!linkedSpec) {
            linkedSpec = embeddedFonts.find(
                f => f.postScriptName === meta.postScriptName || f.name === meta.cleanName
            );
        }

        let toUnicode: Map<number, string> | undefined;
        const tuRef = dictText.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
        if (tuRef) {
            const tuObj = objects.get(parseInt(tuRef[1], 10));
            if (tuObj?.decodedStream) {
                toUnicode = parseToUnicodeCMap(tuObj.decodedStream.toString("latin1"));
            }
        }

        const resolved: ResolvedPdfFont = {
            fontFamily: linkedSpec ? linkedSpec.name : meta.cleanName,
            postScriptName: meta.postScriptName,
            fontWeight: linkedSpec?.fontWeight || meta.fontWeight,
            fontStyle: linkedSpec?.fontStyle || meta.fontStyle,
            fontId: linkedSpec?.id,
            toUnicode
        };
        if (selfObjId !== undefined) {
            fontObjMap.set(selfObjId, resolved);
        }
        return resolved;
    };

    for (const [objId, obj] of objects.entries()) {
        if (/\/Type\s*\/Font\b/.test(obj.dict)) {
            parseFontDict(obj.dict, objId);
        }
    }

    // 3. Helper to decode `/Subtype /Image` XObject streams into RGBA + PNG Data URLs
    const imageObjCache = new Map<number, { width: number; height: number; rgba: Buffer; dataUrl: string }>();
    const docSharedObjects: Record<string, SharedObjectCanvasSpec> = {};
    const docSharedObjectRasters: Record<string, { layerId: string; width: number; height: number; rgba: Buffer }> = {};
    const imgObjToSharedId = new Map<number, string>();

    const decodePdfImageXObject = (imgObjId: number): { width: number; height: number; rgba: Buffer; dataUrl: string } | null => {
        if (imageObjCache.has(imgObjId)) return imageObjCache.get(imgObjId)!;
        const imgObj = objects.get(imgObjId);
        if (!imgObj || !/\/Subtype\s*\/Image\b/.test(imgObj.dict)) return null;

        const wMatch = imgObj.dict.match(/\/Width\s+(\d+)/);
        const hMatch = imgObj.dict.match(/\/Height\s+(\d+)/);
        const bpcMatch = imgObj.dict.match(/\/BitsPerComponent\s+(\d+)/);
        const w = wMatch ? parseInt(wMatch[1], 10) : 0;
        const h = hMatch ? parseInt(hMatch[1], 10) : 0;
        const bpc = bpcMatch ? parseInt(bpcMatch[1], 10) : 8;
        if (w <= 0 || h <= 0) return null;

        // Check for optional `/SMask N 0 R` alpha mask stream
        let alphaMaskBuf: Buffer | null = null;
        const smaskMatch = imgObj.dict.match(/\/SMask\s+(\d+)\s+\d+\s+R/);
        if (smaskMatch) {
            const smaskObj = objects.get(parseInt(smaskMatch[1], 10));
            if (smaskObj?.decodedStream && smaskObj.decodedStream.length >= w * h) {
                alphaMaskBuf = smaskObj.decodedStream;
            }
        }

        // If JPEG (`/DCTDecode`), try decoding to PNG or wrap as data:image/jpeg;base64
        if (/\/DCTDecode\b/.test(imgObj.dict) && imgObj.rawStream) {
            try {
                const tmpJpg = path.join(os.tmpdir(), `ha_pdf_img_${Date.now()}_${imgObjId}.jpg`);
                fs.writeFileSync(tmpJpg, imgObj.rawStream);
                try {
                    const dec = decodeAnyImageToRgba(tmpJpg, imgObj.rawStream);
                    if (alphaMaskBuf && alphaMaskBuf.length >= dec.width * dec.height) {
                        for (let i = 0; i < dec.width * dec.height; i++) {
                            dec.rgba[i * 4 + 3] = alphaMaskBuf[i];
                        }
                    }
                    const pngDataUrl = `data:image/png;base64,${encodeRgbaToPng(dec.width, dec.height, dec.rgba).toString("base64")}`;
                    const res = { width: dec.width, height: dec.height, rgba: dec.rgba, dataUrl: pngDataUrl };
                    imageObjCache.set(imgObjId, res);
                    return res;
                } finally {
                    if (fs.existsSync(tmpJpg)) {
                        try { fs.unlinkSync(tmpJpg); } catch { /* ignore */ }
                    }
                }
            } catch {
                const jpgDataUrl = `data:image/jpeg;base64,${imgObj.rawStream.toString("base64")}`;
                const fallbackRgba = Buffer.alloc(w * h * 4, 200);
                const res = { width: w, height: h, rgba: fallbackRgba, dataUrl: jpgDataUrl };
                imageObjCache.set(imgObjId, res);
                return res;
            }
        }

        const rawPixels = imgObj.decodedStream || imgObj.rawStream;
        if (!rawPixels || rawPixels.length === 0) return null;

        const rgba = Buffer.alloc(w * h * 4, 255);
        const isGray = /\/DeviceGray\b/.test(imgObj.dict);
        const isCmyk = /\/DeviceCMYK\b/.test(imgObj.dict);

        if (isGray) {
            if (bpc === 1) {
                const rowBytes = Math.ceil(w / 8);
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const byteIdx = y * rowBytes + (x >> 3);
                        const bit = (rawPixels[byteIdx] >> (7 - (x & 7))) & 1;
                        const v = bit ? 255 : 0;
                        const dst = (y * w + x) * 4;
                        rgba[dst] = v;
                        rgba[dst + 1] = v;
                        rgba[dst + 2] = v;
                        rgba[dst + 3] = alphaMaskBuf ? alphaMaskBuf[y * w + x] : 255;
                    }
                }
            } else {
                for (let i = 0; i < w * h && i < rawPixels.length; i++) {
                    const v = rawPixels[i];
                    rgba[i * 4] = v;
                    rgba[i * 4 + 1] = v;
                    rgba[i * 4 + 2] = v;
                    rgba[i * 4 + 3] = alphaMaskBuf ? alphaMaskBuf[i] : 255;
                }
            }
        } else if (isCmyk && rawPixels.length >= w * h * 4) {
            for (let i = 0; i < w * h; i++) {
                const c = rawPixels[i * 4] / 255;
                const m = rawPixels[i * 4 + 1] / 255;
                const y = rawPixels[i * 4 + 2] / 255;
                const k = rawPixels[i * 4 + 3] / 255;
                rgba[i * 4] = Math.round(255 * (1 - c) * (1 - k));
                rgba[i * 4 + 1] = Math.round(255 * (1 - m) * (1 - k));
                rgba[i * 4 + 2] = Math.round(255 * (1 - y) * (1 - k));
                rgba[i * 4 + 3] = alphaMaskBuf ? alphaMaskBuf[i] : 255;
            }
        } else if (rawPixels.length >= w * h * 4 && !alphaMaskBuf) {
            // 4-channel RGBA stream
            rawPixels.copy(rgba, 0, 0, w * h * 4);
        } else {
            // Standard 3-channel `/DeviceRGB` stream
            for (let i = 0; i < w * h; i++) {
                const sIdx = i * 3;
                rgba[i * 4] = rawPixels[sIdx] ?? 0;
                rgba[i * 4 + 1] = rawPixels[sIdx + 1] ?? 0;
                rgba[i * 4 + 2] = rawPixels[sIdx + 2] ?? 0;
                rgba[i * 4 + 3] = alphaMaskBuf && i < alphaMaskBuf.length ? alphaMaskBuf[i] : 255;
            }
        }

        const pngBuf = encodeRgbaToPng(w, h, rgba);
        const res = {
            width: w,
            height: h,
            rgba,
            dataUrl: `data:image/png;base64,${pngBuf.toString("base64")}`
        };
        imageObjCache.set(imgObjId, res);
        return res;
    };

    // 4. Collect all `/Type /Page` objects in document page order
    const pageObjects: PdfRawObject[] = [];
    const visitedPages = new Set<number>();

    const collectPagesFromNode = (nodeId: number) => {
        if (visitedPages.has(nodeId)) return;
        visitedPages.add(nodeId);
        const node = objects.get(nodeId);
        if (!node) return;
        if (/\/Type\s*\/Page\b(?!s)/.test(node.dict)) {
            pageObjects.push(node);
            return;
        }
        const kidsMatch = node.dict.match(/\/Kids\s*\[([\s\S]*?)\]/);
        if (kidsMatch) {
            const refRegex = /(\d+)\s+\d+\s+R/g;
            let rm: RegExpExecArray | null;
            while ((rm = refRegex.exec(kidsMatch[1])) !== null) {
                collectPagesFromNode(parseInt(rm[1], 10));
            }
        }
    };

    // Find `/Type /Catalog` -> `/Pages N 0 R`
    for (const obj of objects.values()) {
        if (/\/Type\s*\/Catalog\b/.test(obj.dict)) {
            const pagesRef = obj.dict.match(/\/Pages\s+(\d+)\s+\d+\s+R/);
            if (pagesRef) {
                collectPagesFromNode(parseInt(pagesRef[1], 10));
            }
        }
    }
    // Fallback: any `/Type /Page` not yet visited
    for (const obj of objects.values()) {
        if (/\/Type\s*\/Page\b(?!s)/.test(obj.dict) && !visitedPages.has(obj.id)) {
            pageObjects.push(obj);
        }
    }

    // Global fallback MediaBox if inherited from `/Type /Pages`
    let defaultBox: [number, number, number, number] = [0, 0, 612, 792];
    const globalBoxMatch = rawLatin1.match(
        /\/(?:CropBox|MediaBox)\s*\[\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\]/
    );
    if (globalBoxMatch) {
        defaultBox = [
            parseFloat(globalBoxMatch[1]),
            parseFloat(globalBoxMatch[2]),
            parseFloat(globalBoxMatch[3]),
            parseFloat(globalBoxMatch[4])
        ];
    }

    // Global fallback font & XObject maps across the PDF in case resources are inherited or shared
    const globalFontResources = new Map<string, ResolvedPdfFont>();
    const globalImageResources = new Map<string, number>();

    const extractResourceMapsFromDict = (
        dictStr: string,
        fontMap: Map<string, ResolvedPdfFont>,
        imgMap: Map<string, number>
    ) => {
        // Resolve indirect `/Resources N 0 R` if present
        let fullResStr = dictStr;
        const resRef = dictStr.match(/\/Resources\s+(\d+)\s+\d+\s+R/);
        if (resRef) {
            const resObj = objects.get(parseInt(resRef[1], 10));
            if (resObj) fullResStr += "\n" + resObj.dict;
        }

        // Resolve indirect `/Font N 0 R`
        const fontDictRef = fullResStr.match(/\/Font\s+(\d+)\s+\d+\s+R/);
        if (fontDictRef) {
            const fdObj = objects.get(parseInt(fontDictRef[1], 10));
            if (fdObj) fullResStr += "\n<< /Font << " + fdObj.dict + " >> >>";
        }

        // Parse `/Font << /F1 10 0 R /F2 << /BaseFont /... >> >>`
        const fontRefRegex = /\/([A-Za-z0-9_.-]+)\s+(\d+)\s+\d+\s+R/g;
        let fm: RegExpExecArray | null;
        while ((fm = fontRefRegex.exec(fullResStr)) !== null) {
            const tag = fm[1];
            const targetId = parseInt(fm[2], 10);
            if (fontObjMap.has(targetId)) {
                fontMap.set(tag, fontObjMap.get(targetId)!);
            } else {
                const targetObj = objects.get(targetId);
                if (targetObj && /\/Subtype\s*\/Image\b/.test(targetObj.dict)) {
                    imgMap.set(tag, targetId);
                }
            }
        }

        // Also check inline font definitions `/F1 << /Type /Font /BaseFont /... >>`
        const inlineFontRegex = /\/([A-Za-z0-9_.-]+)\s*<<([^>]*\/BaseFont\s*\/[^\s/<>\[\]()]+[^>]*)>>/g;
        while ((fm = inlineFontRegex.exec(fullResStr)) !== null) {
            fontMap.set(fm[1], parseFontDict(fm[2]));
        }
    };

    for (const obj of objects.values()) {
        extractResourceMapsFromDict(obj.dict, globalFontResources, globalImageResources);
    }

    // If no explicit `/Type /Page` objects were found (e.g. minimal single-stream PDF), synthesize 1 page from all content streams
    if (pageObjects.length === 0) {
        const allStreams: Buffer[] = [];
        for (const obj of objects.values()) {
            if (
                obj.decodedStream &&
                !/\/Subtype\s*\/Image\b/.test(obj.dict) &&
                !/\/FontFile/.test(obj.dict) &&
                !/\/Type\s*\/Metadata\b/.test(obj.dict)
            ) {
                allStreams.push(obj.decodedStream);
            }
        }
        pageObjects.push({
            id: 1,
            dict: `<< /Type /Page /MediaBox [${defaultBox.join(" ")}] >>`,
            rawStream: null,
            decodedStream: Buffer.concat(allStreams)
        });
    }

    let docWidth = Math.max(1, Math.round(defaultBox[2] - defaultBox[0]) || 612);
    let docHeight = Math.max(1, Math.round(defaultBox[3] - defaultBox[1]) || 792);
    const layers: DecodedLayerItem[] = [];
    let objCounter = 1;

    // 5. Interpret each PDF page into its own Vector Layer (`Page 1`, `Page 2`, ...)
    pageObjects.forEach((pageObj, pageIndex) => {
        let [llx, lly, urx, ury] = defaultBox;
        const boxMatch = pageObj.dict.match(
            /\/(?:CropBox|MediaBox)\s*\[\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\]/
        );
        if (boxMatch) {
            llx = parseFloat(boxMatch[1]);
            lly = parseFloat(boxMatch[2]);
            urx = parseFloat(boxMatch[3]);
            ury = parseFloat(boxMatch[4]);
        }
        const pageW = Math.max(1, Math.round(urx - llx) || docWidth);
        const pageH = Math.max(1, Math.round(ury - lly) || docHeight);
        if (pageIndex === 0) {
            docWidth = pageW;
            docHeight = pageH;
        }

        const pageFonts = new Map<string, ResolvedPdfFont>(globalFontResources);
        const pageImages = new Map<string, number>(globalImageResources);
        extractResourceMapsFromDict(pageObj.dict, pageFonts, pageImages);

        // Collect content stream text for this page
        const streamParts: string[] = [];
        if (pageObj.decodedStream) {
            streamParts.push(pageObj.decodedStream.toString("latin1"));
        } else {
            const contentsArrMatch = pageObj.dict.match(/\/Contents\s*\[([\s\S]*?)\]/);
            if (contentsArrMatch) {
                const refRe = /(\d+)\s+\d+\s+R/g;
                let rm: RegExpExecArray | null;
                while ((rm = refRe.exec(contentsArrMatch[1])) !== null) {
                    const cObj = objects.get(parseInt(rm[1], 10));
                    if (cObj?.decodedStream) {
                        streamParts.push(cObj.decodedStream.toString("latin1"));
                    }
                }
            } else {
                const contentsSingleMatch = pageObj.dict.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
                if (contentsSingleMatch) {
                    const cObj = objects.get(parseInt(contentsSingleMatch[1], 10));
                    if (cObj?.decodedStream) {
                        streamParts.push(cObj.decodedStream.toString("latin1"));
                    }
                }
            }
        }

        const labelMatch = pageObj.dict.match(/\/haLayerName\s*\(([^)]*)\)/);
        const layerName = labelMatch
            ? unescapePsString(labelMatch[1]).trim() || `Page ${pageIndex + 1}`
            : `Page ${pageIndex + 1}`;

        const pageObjectsList: VectorObjectSpec[] = [];
        const fullStreamText = streamParts.join("\n");
        const tokens = tokenizeAiContentStream(fullStreamText);

        interface PdfPageGraphicsState {
            ctm: [number, number, number, number, number, number];
            fillColor: string;
            strokeColor: string;
            strokeWidth: number;
            opacity: number;
            fontTag: string;
            fontFamily: string;
            fontWeight: string;
            fontStyle: string;
            fontId?: string;
            fontSize: number;
            textLeading: number;
            textMatrix: [number, number, number, number, number, number];
            textLineMatrix: [number, number, number, number, number, number];
        }

        let state: PdfPageGraphicsState = {
            ctm: [1, 0, 0, 1, 0, 0],
            fillColor: "#000000",
            strokeColor: "#000000",
            strokeWidth: 1,
            opacity: 1,
            fontTag: "F1",
            fontFamily: "sans-serif",
            fontWeight: "normal",
            fontStyle: "normal",
            fontSize: 16,
            textLeading: 16,
            textMatrix: [1, 0, 0, 1, 0, 0],
            textLineMatrix: [1, 0, 0, 1, 0, 0]
        };
        const stateStack: PdfPageGraphicsState[] = [];
        const operandStack: string[] = [];

        const toCanvasPt = (x: number, y: number): { x: number; y: number } => {
            const [a, b, c, d, e, f] = state.ctm;
            const tx = a * x + c * y + e;
            const ty = b * x + d * y + f;
            return {
                x: Math.round((tx - llx) * 100) / 100,
                y: Math.round((pageH - (ty - lly)) * 100) / 100
            };
        };

        let pathCommands: string[] = [];
        let pathPoints: { x: number; y: number }[] = [];
        let subpathStartPt: { x: number; y: number } | null = null;
        let curPt: { x: number; y: number } = { x: 0, y: 0 };
        let pathClosed = false;
        let pendingRectSpec: { x: number; y: number; width: number; height: number } | null = null;

        const resetPath = () => {
            pathCommands = [];
            pathPoints = [];
            subpathStartPt = null;
            pathClosed = false;
            pendingRectSpec = null;
        };

        const popNumber = (): number => {
            const tok = operandStack.pop();
            return tok !== undefined ? parseFloat(tok) : 0;
        };

        const popNumbers = (count: number): number[] => {
            const out: number[] = [];
            for (let k = 0; k < count; k++) {
                out.unshift(popNumber());
            }
            return out;
        };

        const emitCurrentPath = (doFill: boolean, doStroke: boolean, closeFirst: boolean) => {
            if (pathCommands.length === 0 && !pendingRectSpec) {
                resetPath();
                return;
            }
            if (closeFirst && !pathClosed) {
                pathCommands.push("Z");
                if (subpathStartPt && pathPoints.length > 0) {
                    pathPoints.push({ ...subpathStartPt });
                }
                pathClosed = true;
            }

            const fill = doFill ? state.fillColor : "none";
            const stroke = doStroke ? state.strokeColor : "none";

            // Skip full-page background rect if it matches pure white at index 0 unless stroked
            if (pendingRectSpec && pathCommands.length <= 5) {
                pageObjectsList.push({
                    id: `pdf_p${pageIndex + 1}_rect_${objCounter++}`,
                    kind: "rect",
                    x: pendingRectSpec.x,
                    y: pendingRectSpec.y,
                    width: pendingRectSpec.width,
                    height: pendingRectSpec.height,
                    fill,
                    stroke,
                    strokeWidth: state.strokeWidth,
                    opacity: state.opacity
                });
                resetPath();
                return;
            }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of pathPoints) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
            if (!Number.isFinite(minX)) {
                minX = 0;
                minY = 0;
                maxX = 100;
                maxY = 100;
            }

            pageObjectsList.push({
                id: `pdf_p${pageIndex + 1}_path_${objCounter++}`,
                kind: "path",
                d: pathCommands.join(" "),
                points: pathPoints,
                closed: pathClosed,
                x: Math.floor(minX),
                y: Math.floor(minY),
                width: Math.max(1, Math.ceil(maxX - minX)),
                height: Math.max(1, Math.ceil(maxY - minY)),
                fill,
                stroke,
                strokeWidth: state.strokeWidth,
                opacity: state.opacity
            });
            resetPath();
        };

        const emitPdfText = (decodedText: string) => {
            if (!decodedText) return;
            const combined = multiplyMatrix(state.textMatrix, state.ctm);
            const tx = combined[4];
            const ty = combined[5];
            const scaleY = Math.hypot(state.textMatrix[2], state.textMatrix[3]) || 1;
            const ctmScaleY = Math.hypot(state.ctm[2], state.ctm[3]) || 1;
            const effFontSize = Math.max(6, Math.round(state.fontSize * scaleY * ctmScaleY));
            const canvasX = Math.round((tx - llx) * 100) / 100;
            // In PDF, (tx, ty) is the text baseline; convert to top-left canvas Y
            const baselineCanvasY = pageH - (ty - lly);
            const canvasY = Math.max(0, Math.round(baselineCanvasY - effFontSize * 0.82));
            const scale = Math.max(1, Math.round(effFontSize / 7));

            pageObjectsList.push({
                id: `pdf_p${pageIndex + 1}_text_${objCounter++}`,
                kind: "text",
                x: Math.round(canvasX),
                y: Math.round(canvasY),
                width: Math.max(16, Math.round(decodedText.length * Math.max(6 * scale, effFontSize * 0.58))),
                height: Math.max(12, effFontSize),
                text: decodedText,
                fontFamily: state.fontFamily,
                fontSize: effFontSize,
                fontWeight: state.fontWeight,
                fontStyle: state.fontStyle,
                fontId: state.fontId,
                fill: state.fillColor,
                stroke: "none",
                strokeWidth: 0,
                opacity: state.opacity
            });
        };

        for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
            const tok = tokens[tIdx];

            if (
                tok.startsWith("(") ||
                tok.startsWith("/") ||
                tok.startsWith("[") ||
                tok.startsWith("<") ||
                /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(tok)
            ) {
                operandStack.push(tok);
                continue;
            }

            if (tok === "q") {
                stateStack.push({
                    ...state,
                    ctm: [...state.ctm] as [number, number, number, number, number, number],
                    textMatrix: [...state.textMatrix] as [number, number, number, number, number, number],
                    textLineMatrix: [...state.textLineMatrix] as [number, number, number, number, number, number]
                });
                continue;
            }
            if (tok === "Q") {
                if (stateStack.length > 0) {
                    state = stateStack.pop()!;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "cm") {
                if (operandStack.length >= 6) {
                    const [a, b, c, d, e, f] = popNumbers(6);
                    state.ctm = multiplyMatrix([a, b, c, d, e, f], state.ctm);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "w") {
                const wVal = popNumber();
                if (wVal > 0) state.strokeWidth = wVal;
                operandStack.length = 0;
                continue;
            }

            // Color operators
            if (tok === "rg" || tok === "Xa") {
                if (operandStack.length >= 3) {
                    const [r, g, b] = popNumbers(3);
                    state.fillColor = rgbFloatsToHex(r, g, b);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "RG" || tok === "XA") {
                if (operandStack.length >= 3) {
                    const [r, g, b] = popNumbers(3);
                    state.strokeColor = rgbFloatsToHex(r, g, b);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "k") {
                if (operandStack.length >= 4) {
                    const [c, m, y, k] = popNumbers(4);
                    state.fillColor = cmykFloatsToHex(c, m, y, k);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "K") {
                if (operandStack.length >= 4) {
                    const [c, m, y, k] = popNumbers(4);
                    state.strokeColor = cmykFloatsToHex(c, m, y, k);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "g") {
                if (operandStack.length >= 1) {
                    const g = popNumber();
                    state.fillColor = rgbFloatsToHex(g, g, g);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "G") {
                if (operandStack.length >= 1) {
                    const g = popNumber();
                    state.strokeColor = rgbFloatsToHex(g, g, g);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "sc" || tok === "scn" || tok === "SC" || tok === "SCN") {
                const nums = operandStack.filter(a => /^[-+]?(?:\d+\.?\d*|\.\d+)/.test(a)).map(Number);
                let hex = "";
                if (nums.length === 3) hex = rgbFloatsToHex(nums[0], nums[1], nums[2]);
                else if (nums.length >= 4) hex = cmykFloatsToHex(nums[0], nums[1], nums[2], nums[3]);
                else if (nums.length === 1) hex = rgbFloatsToHex(nums[0], nums[0], nums[0]);
                if (hex) {
                    if (tok === "sc" || tok === "scn") state.fillColor = hex;
                    else state.strokeColor = hex;
                }
                operandStack.length = 0;
                continue;
            }

            // Image & Form XObject invocation (`Do` operator): creates a Shared Object containing a raster layer and places an `<ObjectRef>` (`kind: "ref"`) on the page's vector layer!
            if (tok === "Do") {
                const nameTok = operandStack.pop() || "";
                const cleanTag = nameTok.replace(/^\/+/, "");
                const imgObjId = pageImages.get(cleanTag);
                if (imgObjId !== undefined) {
                    const decodedImg = decodePdfImageXObject(imgObjId);
                    if (decodedImg) {
                        const p0 = toCanvasPt(0, 0);
                        const p1 = toCanvasPt(1, 1);
                        const p2 = toCanvasPt(1, 0);
                        const p3 = toCanvasPt(0, 1);
                        const minX = Math.min(p0.x, p1.x, p2.x, p3.x);
                        const minY = Math.min(p0.y, p1.y, p2.y, p3.y);
                        const maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
                        const maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
                        const boxW = Math.max(1, Math.round(maxX - minX));
                        const boxH = Math.max(1, Math.round(maxY - minY));

                        let sharedId = imgObjToSharedId.get(imgObjId);
                        if (!sharedId) {
                            sharedId = `pdf_raster_obj_${imgObjId}`;
                            const rasterLayerId = `${sharedId}_layer_1`;
                            imgObjToSharedId.set(imgObjId, sharedId);
                            docSharedObjects[sharedId] = {
                                id: sharedId,
                                name: `PDF/Raster Assets/Image_${imgObjId}`,
                                category: "PDF/Raster Assets",
                                width: decodedImg.width,
                                height: decodedImg.height,
                                layers: [
                                    {
                                        id: rasterLayerId,
                                        name: `Raster Image ${imgObjId}`,
                                        type: "raster",
                                        visible: true,
                                        locked: false,
                                        opacity: 1,
                                        blendMode: "normal",
                                        objects: []
                                    }
                                ]
                            };
                            docSharedObjectRasters[sharedId] = {
                                layerId: rasterLayerId,
                                width: decodedImg.width,
                                height: decodedImg.height,
                                rgba: decodedImg.rgba
                            };
                        }

                        pageObjectsList.push({
                            id: `pdf_p${pageIndex + 1}_ref_${objCounter++}`,
                            kind: "ref",
                            refId: sharedId,
                            x: Math.round(minX),
                            y: Math.round(minY),
                            width: boxW,
                            height: boxH,
                            scaleX: Number((boxW / Math.max(1, decodedImg.width)).toFixed(4)),
                            scaleY: Number((boxH / Math.max(1, decodedImg.height)).toFixed(4)),
                            opacity: state.opacity
                        });
                    }
                }
                operandStack.length = 0;
                continue;
            }

            // Path construction operators
            if (tok === "m") {
                if (operandStack.length >= 2) {
                    const [rx, ry] = popNumbers(2);
                    curPt = toCanvasPt(rx, ry);
                    subpathStartPt = { ...curPt };
                    pathCommands.push(`M ${curPt.x} ${curPt.y}`);
                    pathPoints.push({ ...curPt });
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "l" || tok === "L") {
                if (operandStack.length >= 2) {
                    const [rx, ry] = popNumbers(2);
                    curPt = toCanvasPt(rx, ry);
                    pathCommands.push(`L ${curPt.x} ${curPt.y}`);
                    pathPoints.push({ ...curPt });
                    pendingRectSpec = null;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "c" || tok === "C") {
                if (operandStack.length >= 6) {
                    const [rx1, ry1, rx2, ry2, rx3, ry3] = popNumbers(6);
                    const p0 = { ...curPt };
                    const p1 = toCanvasPt(rx1, ry1);
                    const p2 = toCanvasPt(rx2, ry2);
                    const p3 = toCanvasPt(rx3, ry3);
                    pathCommands.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
                    for (let s = 1; s <= 12; s++) {
                        const t = s / 12;
                        const mt = 1 - t;
                        pathPoints.push({
                            x: Math.round((mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x) * 100) / 100,
                            y: Math.round((mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y) * 100) / 100
                        });
                    }
                    curPt = p3;
                    pendingRectSpec = null;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "v" || tok === "V") {
                if (operandStack.length >= 4) {
                    const [rx2, ry2, rx3, ry3] = popNumbers(4);
                    const p0 = { ...curPt };
                    const p1 = { ...curPt };
                    const p2 = toCanvasPt(rx2, ry2);
                    const p3 = toCanvasPt(rx3, ry3);
                    pathCommands.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
                    for (let s = 1; s <= 12; s++) {
                        const t = s / 12;
                        const mt = 1 - t;
                        pathPoints.push({
                            x: Math.round((mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x) * 100) / 100,
                            y: Math.round((mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y) * 100) / 100
                        });
                    }
                    curPt = p3;
                    pendingRectSpec = null;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "y" || tok === "Y") {
                if (operandStack.length >= 4) {
                    const [rx1, ry1, rx3, ry3] = popNumbers(4);
                    const p0 = { ...curPt };
                    const p1 = toCanvasPt(rx1, ry1);
                    const p3 = toCanvasPt(rx3, ry3);
                    const p2 = { ...p3 };
                    pathCommands.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
                    for (let s = 1; s <= 12; s++) {
                        const t = s / 12;
                        const mt = 1 - t;
                        pathPoints.push({
                            x: Math.round((mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x) * 100) / 100,
                            y: Math.round((mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y) * 100) / 100
                        });
                    }
                    curPt = p3;
                    pendingRectSpec = null;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "re") {
                if (operandStack.length >= 4) {
                    const [rx, ry, rw, rh] = popNumbers(4);
                    const p1 = toCanvasPt(rx, ry);
                    const p2 = toCanvasPt(rx + rw, ry);
                    const p3 = toCanvasPt(rx + rw, ry + rh);
                    const p4 = toCanvasPt(rx, ry + rh);
                    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
                    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
                    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
                    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

                    if (pathCommands.length === 0 && state.ctm[1] === 0 && state.ctm[2] === 0) {
                        pendingRectSpec = {
                            x: Math.round(minX),
                            y: Math.round(minY),
                            width: Math.max(1, Math.round(maxX - minX)),
                            height: Math.max(1, Math.round(maxY - minY))
                        };
                    }
                    pathCommands.push(`M ${p4.x} ${p4.y} L ${p3.x} ${p3.y} L ${p2.x} ${p2.y} L ${p1.x} ${p1.y} Z`);
                    pathPoints.push(p4, p3, p2, p1, { ...p4 });
                    pathClosed = true;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "h") {
                if (!pathClosed && pathCommands.length > 0) {
                    pathCommands.push("Z");
                    if (subpathStartPt && pathPoints.length > 0) {
                        pathPoints.push({ ...subpathStartPt });
                    }
                    pathClosed = true;
                }
                operandStack.length = 0;
                continue;
            }

            // Path painting operators
            if (tok === "f" || tok === "f*") {
                emitCurrentPath(true, false, true);
                operandStack.length = 0;
                continue;
            }
            if (tok === "F") {
                emitCurrentPath(true, false, false);
                operandStack.length = 0;
                continue;
            }
            if (tok === "s") {
                emitCurrentPath(false, true, true);
                operandStack.length = 0;
                continue;
            }
            if (tok === "S") {
                emitCurrentPath(false, true, false);
                operandStack.length = 0;
                continue;
            }
            if (tok === "b" || tok === "b*") {
                emitCurrentPath(true, true, true);
                operandStack.length = 0;
                continue;
            }
            if (tok === "B" || tok === "B*") {
                emitCurrentPath(true, true, false);
                operandStack.length = 0;
                continue;
            }
            if (tok === "n" || tok === "N") {
                resetPath();
                operandStack.length = 0;
                continue;
            }

            // Text operators (`BT`, `ET`, `Tf`, `TL`, `Td`, `TD`, `Tm`, `T*`, `Tj`, `TJ`, `'`, `"`)
            if (tok === "BT") {
                state.textMatrix = [1, 0, 0, 1, 0, 0];
                state.textLineMatrix = [1, 0, 0, 1, 0, 0];
                operandStack.length = 0;
                continue;
            }
            if (tok === "ET") {
                operandStack.length = 0;
                continue;
            }
            if (tok === "TL") {
                state.textLeading = popNumber();
                operandStack.length = 0;
                continue;
            }
            if (tok === "Tf") {
                const sz = popNumber();
                const fontTok = operandStack.pop() || "/F1";
                const cleanTag = fontTok.replace(/^\/+/, "");
                state.fontTag = cleanTag;
                if (sz > 0) state.fontSize = sz;
                const resolvedFont = pageFonts.get(cleanTag);
                if (resolvedFont) {
                    state.fontFamily = resolvedFont.fontFamily;
                    state.fontWeight = resolvedFont.fontWeight;
                    state.fontStyle = resolvedFont.fontStyle;
                    state.fontId = resolvedFont.fontId;
                } else {
                    const meta = cleanPdfFontMetadata(cleanTag);
                    state.fontFamily = meta.cleanName;
                    state.fontWeight = meta.fontWeight;
                    state.fontStyle = meta.fontStyle;
                    state.fontId = undefined;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "Td" || tok === "TD") {
                if (operandStack.length >= 2) {
                    const [tx, ty] = popNumbers(2);
                    if (tok === "TD") {
                        state.textLeading = -ty;
                    }
                    state.textLineMatrix = multiplyMatrix([1, 0, 0, 1, tx, ty], state.textLineMatrix);
                    state.textMatrix = [...state.textLineMatrix] as [number, number, number, number, number, number];
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "Tm") {
                if (operandStack.length >= 6) {
                    const [a, b, c, d, e, f] = popNumbers(6);
                    state.textMatrix = [a, b, c, d, e, f];
                    state.textLineMatrix = [a, b, c, d, e, f];
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "T*") {
                state.textLineMatrix = multiplyMatrix([1, 0, 0, 1, 0, -state.textLeading], state.textLineMatrix);
                state.textMatrix = [...state.textLineMatrix] as [number, number, number, number, number, number];
                operandStack.length = 0;
                continue;
            }
            if (tok === "Tj" || tok === "'" || tok === '"') {
                if (tok === "'" || tok === '"') {
                    state.textLineMatrix = multiplyMatrix([1, 0, 0, 1, 0, -state.textLeading], state.textLineMatrix);
                    state.textMatrix = [...state.textLineMatrix] as [number, number, number, number, number, number];
                }
                const strTok = operandStack.pop() || "";
                const resolvedFont = pageFonts.get(state.fontTag);
                const decoded = decodePdfStringToken(strTok, resolvedFont?.toUnicode);
                if (decoded) {
                    emitPdfText(decoded);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "TJ") {
                const arrTok = operandStack.pop() || "";
                if (arrTok.startsWith("[")) {
                    const resolvedFont = pageFonts.get(state.fontTag);
                    const inner = arrTok.slice(1, -1);
                    const subTokens = tokenizeAiContentStream(inner);
                    let built = "";
                    for (const st of subTokens) {
                        if (st.startsWith("(") || st.startsWith("<")) {
                            built += decodePdfStringToken(st, resolvedFont?.toUnicode);
                        } else {
                            const shift = parseFloat(st);
                            if (!Number.isNaN(shift) && shift < -180 && !built.endsWith(" ")) {
                                built += " ";
                            }
                        }
                    }
                    if (built) {
                        emitPdfText(built);
                    }
                }
                operandStack.length = 0;
                continue;
            }

            operandStack.length = 0;
        }

        layers.push({
            name: layerName,
            type: "vector",
            width: pageW,
            height: pageH,
            offsetX: 0,
            offsetY: 0,
            opacity: 1,
            visible: true,
            blendMode: "normal",
            objects: pageObjectsList
        });
    });

    // Extract PDF Document Metadata from `/Info` dictionary and `/Type /Metadata` XMP stream
    let extractedMetadata: DocumentMetadataSpec = {};
    for (const obj of objects.values()) {
        if (/\/Type\s*\/Metadata\b/.test(obj.dict) && obj.decodedStream) {
            const xmpStr = obj.decodedStream.toString("utf8");
            if (xmpStr.includes("<x:xmpmeta")) {
                extractedMetadata = { ...extractedMetadata, ...parseXmpPacketString(xmpStr) };
            }
        }
        if (/\/(?:Title|Author|Subject|Keywords|Creator|Producer|Copyright|GPSLatitude|GPSLongitude)\s*\(/.test(obj.dict)) {
            const getPdfInfoField = (field: string): string | undefined => {
                const re = new RegExp(`\\/${field}\\s*\\(((?:\\\\.|[^\\\\)])*)\\)`);
                const m = obj.dict.match(re);
                return m ? unescapePsString(m[1]).trim() : undefined;
            };
            const title = getPdfInfoField("Title");
            const author = getPdfInfoField("Author");
            const subject = getPdfInfoField("Subject");
            const description = getPdfInfoField("Description") || subject;
            const keywordsStr = getPdfInfoField("Keywords");
            const copyright = getPdfInfoField("Copyright");
            const comment = getPdfInfoField("Comment");
            const software = getPdfInfoField("Creator") || getPdfInfoField("Producer");
            const gpsLat = getPdfInfoField("GPSLatitude");
            const gpsLon = getPdfInfoField("GPSLongitude");
            const gpsAlt = getPdfInfoField("GPSAltitude");
            const gpsLoc = getPdfInfoField("GPSLocation");
            const gpsCountry = getPdfInfoField("GPSCountry");

            if (title) extractedMetadata.title = title;
            if (author) extractedMetadata.author = author;
            if (subject) extractedMetadata.subject = subject;
            if (description && !extractedMetadata.description) extractedMetadata.description = description;
            if (copyright) extractedMetadata.copyright = copyright;
            if (comment) extractedMetadata.comment = comment;
            if (software && !extractedMetadata.software) extractedMetadata.software = software;
            if (keywordsStr) {
                extractedMetadata.keywords = keywordsStr.split(",").map(s => s.trim()).filter(Boolean);
            }
            if (gpsLat !== undefined || gpsLon !== undefined || gpsAlt !== undefined || gpsLoc || gpsCountry) {
                extractedMetadata.gps = extractedMetadata.gps || {};
                if (gpsLat !== undefined && !Number.isNaN(parseFloat(gpsLat))) {
                    extractedMetadata.gps.latitude = parseFloat(gpsLat);
                }
                if (gpsLon !== undefined && !Number.isNaN(parseFloat(gpsLon))) {
                    extractedMetadata.gps.longitude = parseFloat(gpsLon);
                }
                if (gpsAlt !== undefined && !Number.isNaN(parseFloat(gpsAlt))) {
                    extractedMetadata.gps.altitude = parseFloat(gpsAlt);
                }
                if (gpsLoc) extractedMetadata.gps.locationName = gpsLoc;
                if (gpsCountry) extractedMetadata.gps.country = gpsCountry;
            }
        }
    }

    return {
        format: "pdf",
        width: docWidth,
        height: docHeight,
        layers,
        embeddedFonts,
        ...(Object.keys(docSharedObjects).length > 0
            ? { sharedObjects: docSharedObjects, sharedObjectRasters: docSharedObjectRasters }
            : {}),
        ...(hasMeaningfulMetadata(extractedMetadata) ? { metadata: extractedMetadata } : {})
    };
}

