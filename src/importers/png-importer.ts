import zlib from "node:zlib";
import type { DocumentMetadataSpec } from "../types/document-metadata-types.js";
import {
    hasMeaningfulMetadata,
    parseXmpPacketString,
    parseExifTiffPayload
} from "../exporters/exif-xmp-metadata-exporter.js";

export function extractPngMetadata(pngBuf: Buffer): DocumentMetadataSpec {
    const out: DocumentMetadataSpec = {};
    if (!pngBuf || pngBuf.length < 8 || pngBuf[0] !== 137 || pngBuf[1] !== 80) return out;

    let offset = 8;
    while (offset + 8 <= pngBuf.length) {
        const length = pngBuf.readUInt32BE(offset);
        const type = pngBuf.toString("ascii", offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd > pngBuf.length) break;
        const chunkData = pngBuf.subarray(dataStart, dataEnd);

        if (type === "eXIf") {
            const exifMeta = parseExifTiffPayload(chunkData);
            const existingTitle = out.title;
            const existingDesc = out.description;
            Object.assign(out, exifMeta, {
                gps: { ...(out.gps || {}), ...(exifMeta.gps || {}) }
            });
            if (existingTitle) out.title = existingTitle;
            if (existingDesc) out.description = existingDesc;
            if (out.gps && Object.keys(out.gps).length === 0) delete out.gps;
        } else if (type === "tEXt") {
            const nulIdx = chunkData.indexOf(0);
            if (nulIdx > 0) {
                const key = chunkData.subarray(0, nulIdx).toString("latin1").trim();
                const val = chunkData.subarray(nulIdx + 1).toString("latin1").trim();
                const kl = key.toLowerCase();
                if (kl === "title") out.title = val;
                else if (kl === "author" || kl === "artist") out.author = val;
                else if (kl === "description") out.description = val;
                else if (kl === "subject") out.subject = val;
                else if (kl === "copyright") out.copyright = val;
                else if (kl === "comment") out.comment = val;
                else if (kl === "software") out.software = val;
                else if (kl === "creation time") out.createdAt = val;
                else if (kl === "make") out.make = val;
                else if (kl === "model") out.model = val;
                else if (kl === "keywords") out.keywords = val.split(",").map(s => s.trim()).filter(Boolean);
                else if (kl === "gps:latitude" && !Number.isNaN(parseFloat(val))) {
                    out.gps = out.gps || {};
                    out.gps.latitude = parseFloat(val);
                } else if (kl === "gps:longitude" && !Number.isNaN(parseFloat(val))) {
                    out.gps = out.gps || {};
                    out.gps.longitude = parseFloat(val);
                } else if (kl === "gps:altitude" && !Number.isNaN(parseFloat(val))) {
                    out.gps = out.gps || {};
                    out.gps.altitude = parseFloat(val);
                } else if (kl === "gps:location") {
                    out.gps = out.gps || {};
                    out.gps.locationName = val;
                } else if (kl === "gps:country") {
                    out.gps = out.gps || {};
                    out.gps.country = val;
                }
            }
        } else if (type === "iTXt") {
            const str = chunkData.toString("utf8");
            if (str.includes("<x:xmpmeta")) {
                const xmpMeta = parseXmpPacketString(str);
                for (const [k, v] of Object.entries(xmpMeta)) {
                    if (v !== undefined && k !== "gps" && !(out as any)[k]) (out as any)[k] = v;
                }
                if (xmpMeta.gps) {
                    out.gps = { ...xmpMeta.gps, ...(out.gps || {}) };
                }
            }
        } else if (type === "IEND") {
            break;
        }
        offset = dataEnd + 4;
    }

    return out;
}

function paethPredictor(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

export function decodePngToRgba(pngBuf: Buffer): { width: number; height: number; rgba: Buffer } {
    if (pngBuf.length < 8 || pngBuf[0] !== 137 || pngBuf[1] !== 80 || pngBuf[2] !== 78 || pngBuf[3] !== 71) {
        throw new Error("Invalid PNG signature.");
    }

    let width = 0;
    let height = 0;
    let bitDepth = 8;
    let colorType = 6;
    const idatChunks: Buffer[] = [];
    let palette: Buffer | null = null;
    let trns: Buffer | null = null;

    let offset = 8;
    while (offset + 8 <= pngBuf.length) {
        const length = pngBuf.readUInt32BE(offset);
        const type = pngBuf.toString("ascii", offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd > pngBuf.length) break;

        const chunkData = pngBuf.subarray(dataStart, dataEnd);
        if (type === "IHDR") {
            width = chunkData.readUInt32BE(0);
            height = chunkData.readUInt32BE(4);
            bitDepth = chunkData[8];
            colorType = chunkData[9];
        } else if (type === "PLTE") {
            palette = chunkData;
        } else if (type === "tRNS") {
            trns = chunkData;
        } else if (type === "IDAT") {
            idatChunks.push(chunkData);
        } else if (type === "IEND") {
            break;
        }
        offset = dataEnd + 4;
    }

    if (width <= 0 || height <= 0 || idatChunks.length === 0) {
        throw new Error("Invalid PNG: missing IHDR or IDAT chunks.");
    }

    const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
    const channels =
        colorType === 6 ? 4 :
        colorType === 2 ? 3 :
        colorType === 4 ? 2 : 1;

    const bytesPerPixel = Math.max(1, Math.ceil((channels * bitDepth) / 8));
    const stride = Math.ceil((width * channels * bitDepth) / 8);

    const unfiltered = Buffer.alloc(height * stride);
    let srcPos = 0;

    for (let y = 0; y < height; y++) {
        const filterType = inflated[srcPos++];
        const rowStart = y * stride;
        const prevRowStart = (y - 1) * stride;

        for (let x = 0; x < stride; x++) {
            const rawByte = inflated[srcPos++] || 0;
            const left = x >= bytesPerPixel ? unfiltered[rowStart + x - bytesPerPixel] : 0;
            const up = y > 0 ? unfiltered[prevRowStart + x] : 0;
            const upLeft = y > 0 && x >= bytesPerPixel ? unfiltered[prevRowStart + x - bytesPerPixel] : 0;

            let val = rawByte;
            if (filterType === 1) val = (rawByte + left) & 0xff;
            else if (filterType === 2) val = (rawByte + up) & 0xff;
            else if (filterType === 3) val = (rawByte + ((left + up) >> 1)) & 0xff;
            else if (filterType === 4) val = (rawByte + paethPredictor(left, up, upLeft)) & 0xff;
            unfiltered[rowStart + x] = val;
        }
    }

    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        const rowOffset = y * stride;
        for (let x = 0; x < width; x++) {
            const dstIdx = (y * width + x) * 4;
            if (colorType === 6) {
                const sIdx = rowOffset + x * (bitDepth === 16 ? 8 : 4);
                rgba[dstIdx] = unfiltered[sIdx];
                rgba[dstIdx + 1] = unfiltered[sIdx + (bitDepth === 16 ? 2 : 1)];
                rgba[dstIdx + 2] = unfiltered[sIdx + (bitDepth === 16 ? 4 : 2)];
                rgba[dstIdx + 3] = unfiltered[sIdx + (bitDepth === 16 ? 6 : 3)];
            } else if (colorType === 2) {
                const sIdx = rowOffset + x * (bitDepth === 16 ? 6 : 3);
                rgba[dstIdx] = unfiltered[sIdx];
                rgba[dstIdx + 1] = unfiltered[sIdx + (bitDepth === 16 ? 2 : 1)];
                rgba[dstIdx + 2] = unfiltered[sIdx + (bitDepth === 16 ? 4 : 2)];
                rgba[dstIdx + 3] = 255;
            } else if (colorType === 4) {
                const sIdx = rowOffset + x * 2;
                const g = unfiltered[sIdx];
                rgba[dstIdx] = g;
                rgba[dstIdx + 1] = g;
                rgba[dstIdx + 2] = g;
                rgba[dstIdx + 3] = unfiltered[sIdx + 1];
            } else if (colorType === 0) {
                const g = unfiltered[rowOffset + x];
                rgba[dstIdx] = g;
                rgba[dstIdx + 1] = g;
                rgba[dstIdx + 2] = g;
                rgba[dstIdx + 3] = 255;
            } else if (colorType === 3 && palette) {
                const palIdx = unfiltered[rowOffset + x];
                rgba[dstIdx] = palette[palIdx * 3] || 0;
                rgba[dstIdx + 1] = palette[palIdx * 3 + 1] || 0;
                rgba[dstIdx + 2] = palette[palIdx * 3 + 2] || 0;
                rgba[dstIdx + 3] = trns && palIdx < trns.length ? trns[palIdx] : 255;
            }
        }
    }

    return { width, height, rgba };
}

// ============================================================================
// 2. GIMP-Compatible Format Decoders & Encoders (BMP, TGA, PCX, ICO, PNM, Farbfeld, GIF)
// ============================================================================

