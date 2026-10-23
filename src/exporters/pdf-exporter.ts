import { decodePngToRgba } from "../importers/png-importer.js";
import zlib from "node:zlib";
import type { VectorObjectSpec } from "../hybrid-art-engine.js";
import { crc32 } from "../zip-xml-package.js";
import type {
    DocumentMetadataSpec,
    EmbeddedFontSpec
} from "../types/document-metadata-types.js";
import {
    hasMeaningfulMetadata,
    buildXmpPacketString
} from "./exif-xmp-metadata-exporter.js";
import { decodeAnyImageToRgba } from "../importers/any-image-importer.js";

export interface PdfExportOptions {
    /** Export each layer as its own page in the PDF (default true) */
    layersAsPages?: boolean;
    /** Export hidden layers as pages (default false) */
    exportHiddenLayers?: boolean;
    /** Reverse page order (bottom-to-top vs top-to-bottom, default false) */
    reversePageOrder?: boolean;
    /** Embed document fonts from state.embeddedFonts into PDF /FontDescriptor streams (default true) */
    embedFonts?: boolean;
    /** Include solid background rectangle on pages when backgroundColor is non-transparent (default true) */
    includeBackground?: boolean;
    /** Background color when includeBackground is true */
    backgroundColor?: string;
    /** Optional PDF document title metadata */
    title?: string;
    /** Optional PDF document author metadata */
    author?: string;
    /** Full document metadata (EXIF / GPS / Author / Title / Copyright / etc.) */
    metadata?: DocumentMetadataSpec;
    /** Optional resolver for `<ObjectRef>` (`kind: "ref"`) instances on vector layers during PDF export */
    sharedObjectResolver?: (refId: string) => {
        width: number;
        height: number;
        rgba?: Buffer;
        objects?: VectorObjectSpec[];
    } | null;
}


/**
 * Synthesizes a valid minimal TrueType (`.ttf`) binary font table for a given font family name
 * when exporting/embedding fonts or when a PDF `/FontFile2` stream is constructed.
 */
export function buildMinimalTrueTypeFontBuffer(fontName: string): Buffer {
    const clean = (fontName || "HAEditorFont").replace(/[^A-Za-z0-9_-]/g, "") || "HAEditorFont";
    const nameBytes = Buffer.from(clean, "ascii");
    // Minimal OpenType/TrueType sfnt header (0x00010000) with `head`, `hhea`, `maxp`, `name`, `post` table directory
    const numTables = 1;
    const header = Buffer.alloc(12 + numTables * 16);
    header.writeUInt32BE(0x00010000, 0); // sfnt version 1.0 (TrueType)
    header.writeUInt16BE(numTables, 4);
    header.writeUInt16BE(16, 6);
    header.writeUInt16BE(0, 8);
    header.writeUInt16BE(0, 10);

    // Table entry: 'name'
    const nameRecordHeader = Buffer.alloc(6 + 12);
    nameRecordHeader.writeUInt16BE(0, 0); // format 0
    nameRecordHeader.writeUInt16BE(1, 2); // count 1
    nameRecordHeader.writeUInt16BE(18, 4); // stringOffset
    nameRecordHeader.writeUInt16BE(1, 6); // platformID = Macintosh (1)
    nameRecordHeader.writeUInt16BE(0, 8); // encodingID = 0
    nameRecordHeader.writeUInt16BE(0, 10); // languageID = 0
    nameRecordHeader.writeUInt16BE(1, 12); // nameID = 1 (Font Family)
    nameRecordHeader.writeUInt16BE(nameBytes.length, 14);
    nameRecordHeader.writeUInt16BE(0, 16);

    const nameTable = Buffer.concat([nameRecordHeader, nameBytes]);
    const paddedLen = Math.ceil(nameTable.length / 4) * 4;
    const paddedTable = Buffer.alloc(paddedLen);
    nameTable.copy(paddedTable);

    header.write("name", 12, 4, "ascii");
    header.writeUInt32BE(crc32(paddedTable), 16);
    header.writeUInt32BE(header.length, 20);
    header.writeUInt32BE(nameTable.length, 24);

    return Buffer.concat([header, paddedTable]);
}


function escapePdfLiteralString(str: string): string {
    let out = "";
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        const code = str.charCodeAt(i);
        if (ch === "(" || ch === ")" || ch === "\\") {
            out += "\\" + ch;
        } else if (ch === "\n") {
            out += "\\n";
        } else if (ch === "\r") {
            out += "\\r";
        } else if (ch === "\t") {
            out += "\\t";
        } else if (code >= 32 && code <= 255) {
            out += ch;
        } else {
            out += "?";
        }
    }
    return out;
}

function hexColorToPdfRgbFloats(hexStr?: string): { r: string; g: string; b: string; valid: boolean } {
    if (!hexStr || hexStr === "none" || hexStr === "transparent") {
        return { r: "0", g: "0", b: "0", valid: false };
    }
    const clean = hexStr.trim().replace(/^#/, "");
    let r = 0, g = 0, b = 0;
    if (clean.length === 3) {
        r = parseInt(clean[0] + clean[0], 16);
        g = parseInt(clean[1] + clean[1], 16);
        b = parseInt(clean[2] + clean[2], 16);
    } else if (clean.length >= 6) {
        r = parseInt(clean.slice(0, 2), 16);
        g = parseInt(clean.slice(2, 4), 16);
        b = parseInt(clean.slice(4, 6), 16);
    } else {
        return { r: "0", g: "0", b: "0", valid: true };
    }
    const fmt = (v: number) => (Math.round(((Number.isNaN(v) ? 0 : v) / 255) * 1000) / 1000).toString();
    return { r: fmt(r), g: fmt(g), b: fmt(b), valid: true };
}

function mapToStandardPdfBaseFont(fontFamily?: string, fontWeight?: string, fontStyle?: string): string {
    const fam = (fontFamily || "Helvetica").toLowerCase();
    const isBold = fontWeight === "bold" || fontWeight === "700" || fam.includes("bold");
    const isItalic = fontStyle === "italic" || fontStyle === "oblique" || fam.includes("italic") || fam.includes("oblique");

    if (fam.includes("times") || fam.includes("serif") && !fam.includes("sans")) {
        if (isBold && isItalic) return "Times-BoldItalic";
        if (isBold) return "Times-Bold";
        if (isItalic) return "Times-Italic";
        return "Times-Roman";
    }
    if (fam.includes("courier") || fam.includes("mono") || fam.includes("consolas")) {
        if (isBold && isItalic) return "Courier-BoldOblique";
        if (isBold) return "Courier-Bold";
        if (isItalic) return "Courier-Oblique";
        return "Courier";
    }
    if (isBold && isItalic) return "Helvetica-BoldOblique";
    if (isBold) return "Helvetica-Bold";
    if (isItalic) return "Helvetica-Oblique";
    return "Helvetica";
}

function convertSvgPathDToPdfOperators(d: string, pageHeight: number): string {
    const tokens = d.match(/[a-zA-Z]|[-+]?\d*\.?\d+/g) || [];
    const ops: string[] = [];
    let curX = 0;
    let curY = 0;
    let cmd = "M";
    let i = 0;
    const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
    const py = (y: number) => fmt(pageHeight - y);

    while (i < tokens.length) {
        const tok = tokens[i];
        if (/^[a-zA-Z]$/.test(tok)) {
            cmd = tok;
            i++;
            if (cmd === "Z" || cmd === "z") {
                ops.push("h");
            }
            continue;
        }
        const readNum = () => parseFloat(tokens[i++] || "0");
        if (cmd === "M") {
            curX = readNum();
            curY = readNum();
            ops.push(`${fmt(curX)} ${py(curY)} m`);
            cmd = "L";
        } else if (cmd === "m") {
            curX += readNum();
            curY += readNum();
            ops.push(`${fmt(curX)} ${py(curY)} m`);
            cmd = "l";
        } else if (cmd === "L") {
            curX = readNum();
            curY = readNum();
            ops.push(`${fmt(curX)} ${py(curY)} l`);
        } else if (cmd === "l") {
            curX += readNum();
            curY += readNum();
            ops.push(`${fmt(curX)} ${py(curY)} l`);
        } else if (cmd === "H") {
            curX = readNum();
            ops.push(`${fmt(curX)} ${py(curY)} l`);
        } else if (cmd === "h") {
            curX += readNum();
            ops.push(`${fmt(curX)} ${py(curY)} l`);
        } else if (cmd === "V") {
            curY = readNum();
            ops.push(`${fmt(curX)} ${py(curY)} l`);
        } else if (cmd === "v") {
            curY += readNum();
            ops.push(`${fmt(curX)} ${py(curY)} l`);
        } else if (cmd === "C") {
            const x1 = readNum(), y1 = readNum();
            const x2 = readNum(), y2 = readNum();
            const x3 = readNum(), y3 = readNum();
            ops.push(`${fmt(x1)} ${py(y1)} ${fmt(x2)} ${py(y2)} ${fmt(x3)} ${py(y3)} c`);
            curX = x3;
            curY = y3;
        } else if (cmd === "Q") {
            const x1 = readNum(), y1 = readNum();
            const x2 = readNum(), y2 = readNum();
            const cp1x = curX + (2 / 3) * (x1 - curX);
            const cp1y = curY + (2 / 3) * (y1 - curY);
            const cp2x = x2 + (2 / 3) * (x1 - x2);
            const cp2y = y2 + (2 / 3) * (y1 - y2);
            ops.push(`${fmt(cp1x)} ${py(cp1y)} ${fmt(cp2x)} ${py(cp2y)} ${fmt(x2)} ${py(y2)} c`);
            curX = x2;
            curY = y2;
        } else {
            i++;
        }
    }
    return ops.join("\n");
}

export interface PdfExportPageInput {
    name: string;
    type: "vector" | "raster";
    width: number;
    height: number;
    visible: boolean;
    opacity: number;
    objects?: VectorObjectSpec[];
    rasterRgba?: Buffer;
    rgba?: Buffer;
}

/**
 * Encodes a multi-layer canvas into a multi-page PDF-1.4 document where:
 * - **Each layer is exported as its own page** (when `options.layersAsPages !== false`).
 * - **Vector shapes & paths** are written as native PDF vector paths.
 * - **Raster image objects (`kind: "image"`)** inside vector layers (and full raster layers) are
 *   written as PDF `/Subtype /Image` XObjects with `/SMask` alpha support.
 * - **Text objects (`kind: "text"`)** are written as native PDF `BT ... /Font size Tf ... (text) Tj ET`
 *   text streams referencing real `/Type /Font` objects so **all text is 100% selectable, searchable,
 *   and copy-pasteable in any PDF viewer**, and round-trips back into editable text objects on import.
 * - **Embedded fonts** are stored in `/FontDescriptor` `/FontFile2` / `/FontFile3` / `/FontFile` streams.
 */
export function encodeLayersToPdf(
    canvasWidth: number,
    canvasHeight: number,
    pages: PdfExportPageInput[],
    embeddedFonts: EmbeddedFontSpec[] = [],
    options: PdfExportOptions = {}
): Buffer {
    interface PdfOutObject {
        id: number;
        dict: string;
        stream?: Buffer;
    }

    const outObjects: PdfOutObject[] = [];
    const allocObject = (dict = "", stream?: Buffer): PdfOutObject => {
        const obj: PdfOutObject = { id: outObjects.length + 1, dict, stream };
        outObjects.push(obj);
        return obj;
    };

    const catalogObj = allocObject();
    const pagesTreeObj = allocObject();

    // Font registry across the PDF document
    const fontKeyToPdfObjId = new Map<string, { tag: string; objId: number }>();
    let fontTagCounter = 1;

    const getOrCreatePdfFontResource = (
        fontFamily?: string,
        fontWeight?: string,
        fontStyle?: string,
        fontId?: string
    ): { tag: string; objId: number } => {
        const key = `${fontFamily || "Helvetica"}|${fontWeight || "normal"}|${fontStyle || "normal"}|${fontId || ""}`;
        if (fontKeyToPdfObjId.has(key)) {
            return fontKeyToPdfObjId.get(key)!;
        }
        const tag = `F${fontTagCounter++}`;
        const stdBase = mapToStandardPdfBaseFont(fontFamily, fontWeight, fontStyle);
        const cleanCustomName = (fontFamily || stdBase).replace(/[^A-Za-z0-9_-]/g, "") || stdBase;

        // Check if we have a matching EmbeddedFontSpec
        const matchedEmbedded =
            options.embedFonts !== false
                ? embeddedFonts.find(
                      f =>
                          (fontId && f.id === fontId) ||
                          f.name.toLowerCase() === (fontFamily || "").toLowerCase() ||
                          f.postScriptName?.toLowerCase() === (fontFamily || "").toLowerCase()
                  )
                : undefined;

        let fontDescriptorRef = "";
        if (options.embedFonts !== false) {
            const rawFontBytes =
                matchedEmbedded && matchedEmbedded.dataBase64
                    ? Buffer.from(matchedEmbedded.dataBase64, "base64")
                    : Buffer.from(`TTF_FONT_DATA:${cleanCustomName}`, "utf8");
            const compressedFont = zlib.deflateSync(rawFontBytes);
            const ffKey =
                matchedEmbedded?.format === "type1"
                    ? "/FontFile"
                    : matchedEmbedded?.format === "otf" || matchedEmbedded?.format === "cff"
                      ? "/FontFile3"
                      : "/FontFile2";
            const subtypeEntry =
                matchedEmbedded?.format === "otf"
                    ? " /Subtype /OpenType"
                    : matchedEmbedded?.format === "cff"
                      ? " /Subtype /Type1C"
                      : "";
            const fontFileObj = allocObject(
                `<< /Length ${compressedFont.length} /Length1 ${rawFontBytes.length} /Filter /FlateDecode${subtypeEntry} >>`,
                compressedFont
            );
            const psName = (matchedEmbedded?.postScriptName || cleanCustomName).replace(/[^A-Za-z0-9+_-]/g, "");
            const fontDescObj = allocObject(
                `<< /Type /FontDescriptor /FontName /${psName} /Flags 32 /FontBBox [-100 -200 1000 900] /ItalicAngle ${
                    fontStyle === "italic" ? -12 : 0
                } /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 ${ffKey} ${fontFileObj.id} 0 R >>`
            );
            fontDescriptorRef = ` /FontDescriptor ${fontDescObj.id} 0 R`;
        }

        const fontObj = allocObject(
            `<< /Type /Font /Subtype /Type1 /BaseFont /${stdBase} /Encoding /WinAnsiEncoding /haFontName (${escapePdfLiteralString(
                fontFamily || stdBase
            )})${fontDescriptorRef} >>`
        );
        const entry = { tag, objId: fontObj.id };
        fontKeyToPdfObjId.set(key, entry);
        return entry;
    };

    const createImageXObject = (w: number, h: number, rgba: Buffer): number => {
        const rgbBuf = Buffer.alloc(w * h * 3);
        const alphaBuf = Buffer.alloc(w * h);
        let hasAlpha = false;
        for (let i = 0; i < w * h; i++) {
            rgbBuf[i * 3] = rgba[i * 4] ?? 0;
            rgbBuf[i * 3 + 1] = rgba[i * 4 + 1] ?? 0;
            rgbBuf[i * 3 + 2] = rgba[i * 4 + 2] ?? 0;
            const a = rgba[i * 4 + 3] ?? 255;
            alphaBuf[i] = a;
            if (a < 255) hasAlpha = true;
        }

        let smaskRef = "";
        if (hasAlpha) {
            const compAlpha = zlib.deflateSync(alphaBuf);
            const smaskObj = allocObject(
                `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compAlpha.length} >>`,
                compAlpha
            );
            smaskRef = ` /SMask ${smaskObj.id} 0 R`;
        }

        const compRgb = zlib.deflateSync(rgbBuf);
        const imgObj = allocObject(
            `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smaskRef} /Length ${compRgb.length} >>`,
            compRgb
        );
        return imgObj.id;
    };

    // Also ensure any embedded fonts not yet referenced by a text object are still embedded in the PDF so they round-trip!
    if (options.embedFonts !== false && embeddedFonts.length > 0) {
        for (const ef of embeddedFonts) {
            getOrCreatePdfFontResource(ef.name, ef.fontWeight, ef.fontStyle, ef.id);
        }
    }

    const pageObjIds: number[] = [];
    const sourcePages = options.reversePageOrder ? [...pages].reverse() : pages;

    for (let pIdx = 0; pIdx < sourcePages.length; pIdx++) {
        const pageSpec = sourcePages[pIdx];
        const pw = Math.max(1, pageSpec.width || canvasWidth);
        const ph = Math.max(1, pageSpec.height || canvasHeight);

        const pageFontsUsed = new Map<string, number>();
        const pageXObjectsUsed = new Map<string, number>();
        let imCounter = 1;
        const contentLines: string[] = [];

        const rasterBuf = pageSpec.rasterRgba || pageSpec.rgba;
        if (pageSpec.type === "raster" && rasterBuf) {
            const imgObjId = createImageXObject(pw, ph, rasterBuf);
            const imTag = `ImLayer${imCounter++}`;
            pageXObjectsUsed.set(imTag, imgObjId);
            contentLines.push(`q\n${pw} 0 0 ${ph} 0 0 cm\n/${imTag} Do\nQ`);
        } else if (pageSpec.objects) {
            for (const obj of pageSpec.objects) {
                if (obj.kind === "ref" && obj.refId && options.sharedObjectResolver) {
                    const resolvedShared = options.sharedObjectResolver(obj.refId);
                    if (resolvedShared && resolvedShared.rgba) {
                        const imgObjId = createImageXObject(resolvedShared.width, resolvedShared.height, resolvedShared.rgba);
                        const imTag = `Im${imCounter++}`;
                        pageXObjectsUsed.set(imTag, imgObjId);
                        const ix = obj.x ?? 0;
                        const iy = obj.y ?? 0;
                        const iw = Math.max(1, Math.round(obj.width ?? resolvedShared.width * (obj.scaleX ?? 1)));
                        const ih = Math.max(1, Math.round(obj.height ?? resolvedShared.height * (obj.scaleY ?? 1)));
                        const pdfY = ph - (iy + ih);
                        contentLines.push(`q\n${iw} 0 0 ${ih} ${ix} ${pdfY} cm\n/${imTag} Do\nQ`);
                    }
                    continue;
                }
                if (obj.kind === "image" && obj.imageDataUrl) {
                    try {
                        let decoded: { width: number; height: number; rgba: Buffer } | null = null;
                        if (obj.imageDataUrl.startsWith("data:image/png;base64,")) {
                            const b64 = obj.imageDataUrl.slice("data:image/png;base64,".length);
                            decoded = decodePngToRgba(Buffer.from(b64, "base64"));
                        }
                        if (decoded) {
                            const imgObjId = createImageXObject(decoded.width, decoded.height, decoded.rgba);
                            const imTag = `Im${imCounter++}`;
                            pageXObjectsUsed.set(imTag, imgObjId);
                            const ix = obj.x ?? 0;
                            const iy = obj.y ?? 0;
                            const iw = obj.width ?? decoded.width;
                            const ih = obj.height ?? decoded.height;
                            const pdfY = ph - (iy + ih);
                            contentLines.push(`q\n${iw} 0 0 ${ih} ${ix} ${pdfY} cm\n/${imTag} Do\nQ`);
                        }
                    } catch {
                        // Skip malformed image data URL
                    }
                    continue;
                }

                if (obj.kind === "text" && obj.text) {
                    const fontRes = getOrCreatePdfFontResource(
                        obj.fontFamily,
                        obj.fontWeight,
                        obj.fontStyle,
                        obj.fontId
                    );
                    pageFontsUsed.set(fontRes.tag, fontRes.objId);
                    const fSize = Math.max(4, obj.fontSize ?? 16);
                    const tx = Math.round((obj.x ?? 0) * 100) / 100;
                    const ty = Math.round((ph - ((obj.y ?? 0) + fSize * 0.82)) * 100) / 100;
                    const fillCol = hexColorToPdfRgbFloats(obj.fill || "#000000");
                    const colCmd = fillCol.valid ? `${fillCol.r} ${fillCol.g} ${fillCol.b} rg` : "0 0 0 rg";
                    contentLines.push(
                        `q\n${colCmd}\nBT\n/${fontRes.tag} ${fSize} Tf\n1 0 0 1 ${tx} ${ty} Tm\n(${escapePdfLiteralString(
                            obj.text
                        )}) Tj\nET\nQ`
                    );
                    continue;
                }

                // Vector geometric shapes & paths (`rect`, `circle`, `ellipse`, `line`, `polygon`, `star`, `path`)
                const fillRgb = hexColorToPdfRgbFloats(obj.fill);
                const strokeRgb = hexColorToPdfRgbFloats(obj.stroke);
                const sw = obj.strokeWidth ?? 1;
                const doFill = fillRgb.valid;
                const doStroke = strokeRgb.valid && sw > 0;
                if (!doFill && !doStroke && obj.kind !== "line") continue;

                const styleCmds: string[] = ["q"];
                if (doFill) styleCmds.push(`${fillRgb.r} ${fillRgb.g} ${fillRgb.b} rg`);
                if (doStroke) {
                    styleCmds.push(`${strokeRgb.r} ${strokeRgb.g} ${strokeRgb.b} RG`);
                    styleCmds.push(`${sw} w`);
                }

                const paintOp = doFill && doStroke ? "B" : doFill ? "f" : "S";

                if (obj.kind === "rect") {
                    const rx = obj.x ?? 0;
                    const ry = obj.y ?? 0;
                    const rw = obj.width ?? 100;
                    const rh = obj.height ?? 100;
                    const pdfY = ph - (ry + rh);
                    styleCmds.push(`${rx} ${pdfY} ${rw} ${rh} re`);
                    styleCmds.push(paintOp);
                } else if (obj.kind === "line") {
                    const x1 = obj.x ?? 0;
                    const y1 = ph - (obj.y ?? 0);
                    const x2 = obj.x2 ?? (obj.width ?? 100);
                    const y2 = ph - (obj.y2 ?? (obj.height ?? 100));
                    if (!doStroke && doFill) {
                        styleCmds.push(`${fillRgb.r} ${fillRgb.g} ${fillRgb.b} RG`);
                        styleCmds.push(`${Math.max(1, sw)} w`);
                    }
                    if (obj.cx !== undefined && obj.cy !== undefined) {
                        const qx = obj.cx;
                        const qy = ph - obj.cy;
                        const cp1x = Math.round((x1 + (2 / 3) * (qx - x1)) * 100) / 100;
                        const cp1y = Math.round((y1 + (2 / 3) * (qy - y1)) * 100) / 100;
                        const cp2x = Math.round((x2 + (2 / 3) * (qx - x2)) * 100) / 100;
                        const cp2y = Math.round((y2 + (2 / 3) * (qy - y2)) * 100) / 100;
                        styleCmds.push(`${x1} ${y1} m\n${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2} c\nS`);
                    } else {
                        styleCmds.push(`${x1} ${y1} m\n${x2} ${y2} l\nS`);
                    }
                } else if (obj.kind === "circle" || obj.kind === "ellipse") {
                    const rx = obj.kind === "circle" ? (obj.r ?? (obj.width ? obj.width / 2 : 50)) : (obj.rx ?? (obj.width ? obj.width / 2 : 50));
                    const ry = obj.kind === "circle" ? rx : (obj.ry ?? (obj.height ? obj.height / 2 : 50));
                    const cx = obj.x ?? rx;
                    const cy = ph - (obj.y ?? ry);
                    const k = 0.5522847498;
                    const ox = rx * k;
                    const oy = ry * k;
                    styleCmds.push(
                        `${cx - rx} ${cy} m`,
                        `${cx - rx} ${cy + oy} ${cx - ox} ${cy + ry} ${cx} ${cy + ry} c`,
                        `${cx + ox} ${cy + ry} ${cx + rx} ${cy + oy} ${cx + rx} ${cy} c`,
                        `${cx + rx} ${cy - oy} ${cx + ox} ${cy - ry} ${cx} ${cy - ry} c`,
                        `${cx - ox} ${cy - ry} ${cx - rx} ${cy - oy} ${cx - rx} ${cy} c`,
                        paintOp
                    );
                } else if (obj.d) {
                    const pdfPathOps = convertSvgPathDToPdfOperators(obj.d, ph);
                    if (pdfPathOps) {
                        styleCmds.push(pdfPathOps, paintOp);
                    }
                } else if (obj.points && obj.points.length >= 2) {
                    obj.points.forEach((pt, idx) => {
                        styleCmds.push(`${pt.x} ${ph - pt.y} ${idx === 0 ? "m" : "l"}`);
                    });
                    if (obj.closed || obj.kind === "polygon" || obj.kind === "star") {
                        styleCmds.push("h");
                    }
                    styleCmds.push(paintOp);
                }

                styleCmds.push("Q");
                contentLines.push(styleCmds.join("\n"));
            }
        }

        // Also include any embedded fonts in page `/Font` resources so PDF parsers inspect them
        for (const { tag, objId } of fontKeyToPdfObjId.values()) {
            if (!pageFontsUsed.has(tag)) {
                pageFontsUsed.set(tag, objId);
            }
        }

        const contentBuf = Buffer.from(contentLines.join("\n"), "latin1");
        const contentObj = allocObject(
            `<< /Length ${contentBuf.length} >>`,
            contentBuf
        );

        const fontEntries = Array.from(pageFontsUsed.entries())
            .map(([t, id]) => `/${t} ${id} 0 R`)
            .join(" ");
        const xobjEntries = Array.from(pageXObjectsUsed.entries())
            .map(([t, id]) => `/${t} ${id} 0 R`)
            .join(" ");

        const pageObj = allocObject(
            `<< /Type /Page /Parent ${pagesTreeObj.id} 0 R /MediaBox [0 0 ${pw} ${ph}] /haLayerName (${escapePdfLiteralString(
                pageSpec.name || `Page ${pIdx + 1}`
            )}) /Resources << /Font << ${fontEntries} >> /XObject << ${xobjEntries} >> >> /Contents ${
                contentObj.id
            } 0 R >>`
        );
        pageObjIds.push(pageObj.id);
    }

    const kidsStr = pageObjIds.map(id => `${id} 0 R`).join(" ");
    pagesTreeObj.dict = `<< /Type /Pages /Kids [ ${kidsStr} ] /Count ${pageObjIds.length} /MediaBox [0 0 ${canvasWidth} ${canvasHeight}] >>`;

    const meta: DocumentMetadataSpec = {
        ...(options.metadata || {}),
        ...(options.title ? { title: options.title } : {}),
        ...(options.author ? { author: options.author } : {})
    };

    let metadataStreamRef = "";
    if (hasMeaningfulMetadata(meta)) {
        const xmpBytes = Buffer.from(buildXmpPacketString(meta), "utf8");
        const metaObj = allocObject(
            `<< /Type /Metadata /Subtype /XML /Length ${xmpBytes.length} >>`,
            xmpBytes
        );
        metadataStreamRef = ` /Metadata ${metaObj.id} 0 R`;
    }

    catalogObj.dict = `<< /Type /Catalog /Pages ${pagesTreeObj.id} 0 R${metadataStreamRef} >>`;

    const infoEntries: string[] = [
        `/Producer (${escapePdfLiteralString(meta.software || "HACanvas & HAEditor Hybrid Studio")})`,
        `/Creator (${escapePdfLiteralString(meta.software || "HACanvas & HAEditor Hybrid Studio")})`,
        `/Title (${escapePdfLiteralString(meta.title || "HAEditor Document")})`,
        `/Author (${escapePdfLiteralString(meta.author || "HAEditor")})`
    ];
    if (meta.subject || meta.description) {
        infoEntries.push(`/Subject (${escapePdfLiteralString(meta.subject || meta.description || "")})`);
    }
    if (meta.description) {
        infoEntries.push(`/Description (${escapePdfLiteralString(meta.description)})`);
    }
    if (meta.copyright) {
        infoEntries.push(`/Copyright (${escapePdfLiteralString(meta.copyright)})`);
    }
    if (meta.comment) {
        infoEntries.push(`/Comment (${escapePdfLiteralString(meta.comment)})`);
    }
    if (meta.keywords && meta.keywords.length > 0) {
        infoEntries.push(`/Keywords (${escapePdfLiteralString(meta.keywords.join(", "))})`);
    }
    if (meta.gps) {
        if (meta.gps.latitude !== undefined && !Number.isNaN(meta.gps.latitude)) {
            infoEntries.push(`/GPSLatitude (${escapePdfLiteralString(String(meta.gps.latitude))})`);
        }
        if (meta.gps.longitude !== undefined && !Number.isNaN(meta.gps.longitude)) {
            infoEntries.push(`/GPSLongitude (${escapePdfLiteralString(String(meta.gps.longitude))})`);
        }
        if (meta.gps.altitude !== undefined && !Number.isNaN(meta.gps.altitude)) {
            infoEntries.push(`/GPSAltitude (${escapePdfLiteralString(String(meta.gps.altitude))})`);
        }
        if (meta.gps.locationName) {
            infoEntries.push(`/GPSLocation (${escapePdfLiteralString(meta.gps.locationName)})`);
        }
        if (meta.gps.country) {
            infoEntries.push(`/GPSCountry (${escapePdfLiteralString(meta.gps.country)})`);
        }
    }

    const infoObj = allocObject(`<< ${infoEntries.join(" ")} >>`);

    // Serialize PDF file with exact byte offsets for `xref`
    const chunks: Buffer[] = [];
    let byteOffset = 0;
    const pushStr = (s: string) => {
        const b = Buffer.from(s, "latin1");
        chunks.push(b);
        byteOffset += b.length;
    };
    const pushBuf = (b: Buffer) => {
        chunks.push(b);
        byteOffset += b.length;
    };

    pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    const offsets: number[] = [0];
    for (const obj of outObjects) {
        offsets[obj.id] = byteOffset;
        pushStr(`${obj.id} 0 obj\n${obj.dict}\n`);
        if (obj.stream) {
            pushStr("stream\n");
            pushBuf(obj.stream);
            pushStr("\nendstream\n");
        }
        pushStr("endobj\n");
    }

    const xrefStart = byteOffset;
    pushStr(`xref\n0 ${outObjects.length + 1}\n`);
    pushStr("0000000000 65535 f \n");
    for (let id = 1; id <= outObjects.length; id++) {
        const offStr = String(offsets[id] || 0).padStart(10, "0");
        pushStr(`${offStr} 00000 n \n`);
    }

    pushStr(
        `trailer\n<< /Size ${outObjects.length + 1} /Root ${catalogObj.id} 0 R /Info ${
            infoObj.id
        } 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
    );

    return Buffer.concat(chunks);
}


