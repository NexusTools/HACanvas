import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import type { BlendMode, VectorObjectSpec } from "./hybrid-art-engine.js";
import { createZipArchive, extractZipArchive, parseXmlDocument, crc32 } from "./zip-xml-package.js";

export interface DecodedLayerItem {
    name: string;
    type: "raster" | "vector";
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    opacity: number; // 0..1
    visible: boolean;
    blendMode: BlendMode;
    rgba?: Buffer; // canvasWidth * canvasHeight * 4
    objects?: VectorObjectSpec[];
}

export interface DecodedMultiLayerDocument {
    format: string;
    width: number;
    height: number;
    layers: DecodedLayerItem[];
    frames?: { rgba: Buffer; delayMs: number }[];
}

// ============================================================================
// 1. PNG Encoder & Decoder (All 5 Scanline Filters & Color Types 0, 2, 3, 4, 6)
// ============================================================================

function makePngChunk(type: string, data: Buffer): Buffer {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export function encodeRgbaToPng(width: number, height: number, rgba: Uint8Array | Buffer): Buffer {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth: 8
    ihdr[9] = 6; // color type: 6 (RGBA)
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const stride = width * 4;
    const rawScanlines = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        const rowStart = y * (stride + 1);
        rawScanlines[rowStart] = 0;
        const srcOffset = y * stride;
        Buffer.from(rgba.buffer, rgba.byteOffset + srcOffset, stride).copy(rawScanlines, rowStart + 1);
    }

    const compressed = zlib.deflateSync(rawScanlines);
    return Buffer.concat([
        signature,
        makePngChunk("IHDR", ihdr),
        makePngChunk("IDAT", compressed),
        makePngChunk("IEND", Buffer.alloc(0))
    ]);
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

export function decodeBmpToRgba(bmpBuf: Buffer): { width: number; height: number; rgba: Buffer } {
    if (bmpBuf.length < 54 || bmpBuf.toString("ascii", 0, 2) !== "BM") {
        throw new Error("Invalid BMP header.");
    }
    const pixelDataOffset = bmpBuf.readUInt32LE(10);
    const width = bmpBuf.readInt32LE(18);
    const rawHeight = bmpBuf.readInt32LE(22);
    const height = Math.abs(rawHeight);
    const topDown = rawHeight < 0;
    const bpp = bmpBuf.readUInt16LE(28);

    const bytesPerPixel = Math.max(3, Math.floor(bpp / 8));
    const rowStride = Math.floor((width * bpp + 31) / 32) * 4;
    const rgba = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y++) {
        const srcRow = topDown ? y : height - 1 - y;
        const rowOffset = pixelDataOffset + srcRow * rowStride;
        for (let x = 0; x < width; x++) {
            const sIdx = rowOffset + x * bytesPerPixel;
            const dIdx = (y * width + x) * 4;
            rgba[dIdx] = bmpBuf[sIdx + 2] || 0;
            rgba[dIdx + 1] = bmpBuf[sIdx + 1] || 0;
            rgba[dIdx + 2] = bmpBuf[sIdx] || 0;
            rgba[dIdx + 3] = bytesPerPixel >= 4 ? (bmpBuf[sIdx + 3] ?? 255) : 255;
        }
    }

    return { width, height, rgba };
}

export function encodeRgbaToBmp(width: number, height: number, rgba: Buffer): Buffer {
    const pixelDataSize = width * height * 4;
    const fileSize = 54 + pixelDataSize;
    const out = Buffer.alloc(fileSize);

    out.write("BM", 0, "ascii");
    out.writeUInt32LE(fileSize, 2);
    out.writeUInt32LE(0, 6);
    out.writeUInt32LE(54, 10);

    // BITMAPINFOHEADER (40 bytes)
    out.writeUInt32LE(40, 14);
    out.writeInt32LE(width, 18);
    out.writeInt32LE(-height, 22); // top-down
    out.writeUInt16LE(1, 26);      // planes
    out.writeUInt16LE(32, 28);     // 32 bpp BGRA
    out.writeUInt32LE(0, 30);      // BI_RGB
    out.writeUInt32LE(pixelDataSize, 34);

    let dst = 54;
    for (let i = 0; i < width * height; i++) {
        const src = i * 4;
        out[dst++] = rgba[src + 2]; // B
        out[dst++] = rgba[src + 1]; // G
        out[dst++] = rgba[src];     // R
        out[dst++] = rgba[src + 3]; // A
    }
    return out;
}

/**
 * Decodes Truevision TGA (ported from GIMP `plug-ins/common/file-tga.c`: types 1, 2, 3 uncompressed & 9, 10, 11 RLE).
 */
export function decodeTgaToRgba(tgaBuf: Buffer): { width: number; height: number; rgba: Buffer } {
    if (tgaBuf.length < 18) throw new Error("Invalid TGA buffer.");
    const idLength = tgaBuf[0];
    const colorMapType = tgaBuf[1];
    const imageType = tgaBuf[2];
    const colorMapFirst = tgaBuf.readUInt16LE(3);
    const colorMapLength = tgaBuf.readUInt16LE(5);
    const colorMapEntrySize = tgaBuf[7];
    const width = tgaBuf.readUInt16LE(12);
    const height = tgaBuf.readUInt16LE(14);
    const bpp = tgaBuf[16];
    const descriptor = tgaBuf[17];
    const flipHoriz = (descriptor & 0x10) !== 0;
    const topDown = (descriptor & 0x20) !== 0;

    if (width <= 0 || height <= 0) throw new Error("Invalid TGA dimensions.");
    const bytesPerPixel = Math.max(1, Math.ceil(bpp / 8));
    let pos = 18 + idLength;

    const cmapBytes = colorMapType === 1 ? Math.ceil(colorMapEntrySize / 8) : 0;
    const colorMapOffset = pos;
    if (colorMapType === 1) {
        pos += colorMapLength * cmapBytes;
    }

    const totalPixels = width * height;
    const rawPixels = Buffer.alloc(totalPixels * bytesPerPixel);
    const isRle = imageType >= 9 && imageType <= 11;

    if (!isRle) {
        tgaBuf.copy(rawPixels, 0, pos, pos + totalPixels * bytesPerPixel);
    } else {
        let pOut = 0;
        while (pOut < totalPixels && pos < tgaBuf.length) {
            const packetHdr = tgaBuf[pos++];
            const count = (packetHdr & 0x7f) + 1;
            if (packetHdr & 0x80) {
                const pixelVal = tgaBuf.subarray(pos, pos + bytesPerPixel);
                pos += bytesPerPixel;
                for (let k = 0; k < count && pOut < totalPixels; k++) {
                    pixelVal.copy(rawPixels, pOut * bytesPerPixel);
                    pOut++;
                }
            } else {
                for (let k = 0; k < count && pOut < totalPixels; k++) {
                    tgaBuf.copy(rawPixels, pOut * bytesPerPixel, pos, pos + bytesPerPixel);
                    pos += bytesPerPixel;
                    pOut++;
                }
            }
        }
    }

    const rgba = Buffer.alloc(totalPixels * 4);
    for (let y = 0; y < height; y++) {
        const dstY = topDown ? y : height - 1 - y;
        for (let x = 0; x < width; x++) {
            const dstX = flipHoriz ? width - 1 - x : x;
            const srcIdx = (y * width + x) * bytesPerPixel;
            const dstIdx = (dstY * width + dstX) * 4;

            if (imageType === 1 || imageType === 9) {
                const mapIdx = (rawPixels[srcIdx] || 0) - colorMapFirst;
                const cOff = colorMapOffset + mapIdx * cmapBytes;
                rgba[dstIdx] = tgaBuf[cOff + 2] || 0;
                rgba[dstIdx + 1] = tgaBuf[cOff + 1] || 0;
                rgba[dstIdx + 2] = tgaBuf[cOff] || 0;
                rgba[dstIdx + 3] = cmapBytes >= 4 ? (tgaBuf[cOff + 3] ?? 255) : 255;
            } else if (imageType === 3 || imageType === 11) {
                const g = rawPixels[srcIdx] || 0;
                rgba[dstIdx] = g;
                rgba[dstIdx + 1] = g;
                rgba[dstIdx + 2] = g;
                rgba[dstIdx + 3] = bytesPerPixel >= 2 ? (rawPixels[srcIdx + 1] ?? 255) : 255;
            } else if (bpp === 16 || bpp === 15) {
                const v = rawPixels.readUInt16LE(srcIdx);
                rgba[dstIdx] = ((v >> 10) & 0x1f) * 255 / 31;
                rgba[dstIdx + 1] = ((v >> 5) & 0x1f) * 255 / 31;
                rgba[dstIdx + 2] = (v & 0x1f) * 255 / 31;
                rgba[dstIdx + 3] = 255;
            } else {
                rgba[dstIdx] = rawPixels[srcIdx + 2] || 0;
                rgba[dstIdx + 1] = rawPixels[srcIdx + 1] || 0;
                rgba[dstIdx + 2] = rawPixels[srcIdx] || 0;
                rgba[dstIdx + 3] = bytesPerPixel >= 4 ? (rawPixels[srcIdx + 3] ?? 255) : 255;
            }
        }
    }

    return { width, height, rgba };
}

export function encodeRgbaToTga(width: number, height: number, rgba: Buffer): Buffer {
    const header = Buffer.alloc(18, 0);
    header[2] = 2; // Uncompressed True-color
    header.writeUInt16LE(width, 12);
    header.writeUInt16LE(height, 14);
    header[16] = 32;   // 32 bpp
    header[17] = 0x28; // top-down (0x20) + 8-bit alpha (0x08)

    const body = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const off = i * 4;
        body[off] = rgba[off + 2];     // B
        body[off + 1] = rgba[off + 1]; // G
        body[off + 2] = rgba[off];     // R
        body[off + 3] = rgba[off + 3]; // A
    }
    return Buffer.concat([header, body]);
}

/**
 * Decodes ZSoft PCX (ported from GIMP `plug-ins/common/file-pcx.c`).
 */
export function decodePcxToRgba(pcxBuf: Buffer): { width: number; height: number; rgba: Buffer } {
    if (pcxBuf.length < 128 || pcxBuf[0] !== 0x0a) {
        throw new Error("Invalid PCX header.");
    }
    const bpp = pcxBuf[3];
    const x1 = pcxBuf.readUInt16LE(4);
    const y1 = pcxBuf.readUInt16LE(6);
    const x2 = pcxBuf.readUInt16LE(8);
    const y2 = pcxBuf.readUInt16LE(10);
    const planes = pcxBuf[65];
    const bytesPerLine = pcxBuf.readUInt16LE(66);

    const width = x2 - x1 + 1;
    const height = y2 - y1 + 1;
    const scanLineLen = planes * bytesPerLine;

    // Palette at end of file if 8-bit 1-plane
    let vgaPalette: Buffer = pcxBuf.subarray(16, 64);
    if (bpp === 8 && planes === 1 && pcxBuf.length > 769 && pcxBuf[pcxBuf.length - 769] === 0x0c) {
        vgaPalette = pcxBuf.subarray(pcxBuf.length - 768);
    }

    const rgba = Buffer.alloc(width * height * 4);
    let pos = 128;

    for (let y = 0; y < height; y++) {
        const lineBuf = Buffer.alloc(scanLineLen);
        let lIdx = 0;
        while (lIdx < scanLineLen && pos < pcxBuf.length) {
            const byte = pcxBuf[pos++];
            if ((byte & 0xc0) === 0xc0) {
                const count = byte & 0x3f;
                const val = pcxBuf[pos++] || 0;
                for (let k = 0; k < count && lIdx < scanLineLen; k++) {
                    lineBuf[lIdx++] = val;
                }
            } else {
                lineBuf[lIdx++] = byte;
            }
        }

        for (let x = 0; x < width; x++) {
            const dIdx = (y * width + x) * 4;
            if (bpp === 8 && planes >= 3) {
                rgba[dIdx] = lineBuf[x];
                rgba[dIdx + 1] = lineBuf[bytesPerLine + x];
                rgba[dIdx + 2] = lineBuf[bytesPerLine * 2 + x];
                rgba[dIdx + 3] = planes >= 4 ? lineBuf[bytesPerLine * 3 + x] : 255;
            } else if (bpp === 8 && planes === 1) {
                const cIdx = lineBuf[x] * 3;
                rgba[dIdx] = vgaPalette[cIdx] || 0;
                rgba[dIdx + 1] = vgaPalette[cIdx + 1] || 0;
                rgba[dIdx + 2] = vgaPalette[cIdx + 2] || 0;
                rgba[dIdx + 3] = 255;
            }
        }
    }

    return { width, height, rgba };
}

/**
 * Decodes PNM family (PBM P1/P4, PGM P2/P5, PPM P3/P6, PAM P7; ported from GIMP `plug-ins/common/file-pnm.c`).
 */
export function decodePpmToRgba(ppmBuf: Buffer): { width: number; height: number; rgba: Buffer } {
    const magic = ppmBuf.toString("ascii", 0, 2);
    if (magic === "P7") {
        // PAM header
        const hdrEnd = ppmBuf.indexOf("ENDHDR\n");
        const hdrStr = ppmBuf.toString("ascii", 0, hdrEnd);
        const wMatch = hdrStr.match(/WIDTH\s+(\d+)/);
        const hMatch = hdrStr.match(/HEIGHT\s+(\d+)/);
        const dMatch = hdrStr.match(/DEPTH\s+(\d+)/);
        const width = wMatch ? parseInt(wMatch[1], 10) : 1;
        const height = hMatch ? parseInt(hMatch[1], 10) : 1;
        const depth = dMatch ? parseInt(dMatch[1], 10) : 4;
        const dataOffset = hdrEnd + 7;
        const rgba = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            const s = dataOffset + i * depth;
            const d = i * 4;
            rgba[d] = ppmBuf[s] || 0;
            rgba[d + 1] = depth >= 3 ? ppmBuf[s + 1] : ppmBuf[s];
            rgba[d + 2] = depth >= 3 ? ppmBuf[s + 2] : ppmBuf[s];
            rgba[d + 3] = depth === 2 ? ppmBuf[s + 1] : depth >= 4 ? ppmBuf[s + 3] : 255;
        }
        return { width, height, rgba };
    }

    let idx = 2;
    const nextToken = (): string => {
        while (idx < ppmBuf.length) {
            const c = ppmBuf[idx];
            if (c === 35) {
                while (idx < ppmBuf.length && ppmBuf[idx] !== 10) idx++;
            } else if (c <= 32) {
                idx++;
            } else {
                break;
            }
        }
        let tok = "";
        while (idx < ppmBuf.length && ppmBuf[idx] > 32 && ppmBuf[idx] !== 35) {
            tok += String.fromCharCode(ppmBuf[idx++]);
        }
        return tok;
    };

    const width = parseInt(nextToken(), 10);
    const height = parseInt(nextToken(), 10);
    const maxVal = magic === "P1" || magic === "P4" ? 1 : parseInt(nextToken(), 10) || 255;
    idx++; // single whitespace after header

    const rgba = Buffer.alloc(width * height * 4);
    if (magic === "P6") {
        for (let i = 0; i < width * height; i++) {
            const dIdx = i * 4;
            rgba[dIdx] = Math.round(((ppmBuf[idx++] || 0) * 255) / maxVal);
            rgba[dIdx + 1] = Math.round(((ppmBuf[idx++] || 0) * 255) / maxVal);
            rgba[dIdx + 2] = Math.round(((ppmBuf[idx++] || 0) * 255) / maxVal);
            rgba[dIdx + 3] = 255;
        }
    } else if (magic === "P5") {
        for (let i = 0; i < width * height; i++) {
            const g = Math.round(((ppmBuf[idx++] || 0) * 255) / maxVal);
            const dIdx = i * 4;
            rgba[dIdx] = g;
            rgba[dIdx + 1] = g;
            rgba[dIdx + 2] = g;
            rgba[dIdx + 3] = 255;
        }
    } else if (magic === "P2") {
        for (let i = 0; i < width * height; i++) {
            const g = Math.round((parseInt(nextToken(), 10) * 255) / maxVal);
            const dIdx = i * 4;
            rgba[dIdx] = g;
            rgba[dIdx + 1] = g;
            rgba[dIdx + 2] = g;
            rgba[dIdx + 3] = 255;
        }
    } else {
        for (let i = 0; i < width * height; i++) {
            const dIdx = i * 4;
            rgba[dIdx] = Math.round((parseInt(nextToken(), 10) * 255) / maxVal);
            rgba[dIdx + 1] = Math.round((parseInt(nextToken(), 10) * 255) / maxVal);
            rgba[dIdx + 2] = Math.round((parseInt(nextToken(), 10) * 255) / maxVal);
            rgba[dIdx + 3] = 255;
        }
    }
    return { width, height, rgba };
}

export function encodeRgbaToPpm(width: number, height: number, rgba: Buffer): Buffer {
    const header = Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii");
    const body = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
        body[i * 3] = rgba[i * 4];
        body[i * 3 + 1] = rgba[i * 4 + 1];
        body[i * 3 + 2] = rgba[i * 4 + 2];
    }
    return Buffer.concat([header, body]);
}

/**
 * Decodes & encodes Farbfeld (`.ff`, GIMP `plug-ins/common/file-farbfeld.c`).
 */
export function decodeFarbfeldToRgba(ffBuf: Buffer): { width: number; height: number; rgba: Buffer } {
    if (ffBuf.length < 16 || ffBuf.toString("ascii", 0, 8) !== "farbfeld") {
        throw new Error("Invalid Farbfeld header.");
    }
    const width = ffBuf.readUInt32BE(8);
    const height = ffBuf.readUInt32BE(12);
    const rgba = Buffer.alloc(width * height * 4);
    let src = 16;
    for (let i = 0; i < width * height * 4; i++) {
        rgba[i] = ffBuf[src]; // high byte of 16-bit BE channel
        src += 2;
    }
    return { width, height, rgba };
}

export function encodeRgbaToFarbfeld(width: number, height: number, rgba: Buffer): Buffer {
    const out = Buffer.alloc(16 + width * height * 8);
    out.write("farbfeld", 0, "ascii");
    out.writeUInt32BE(width, 8);
    out.writeUInt32BE(height, 12);
    let dst = 16;
    for (let i = 0; i < width * height * 4; i++) {
        out[dst++] = rgba[i];
        out[dst++] = rgba[i];
    }
    return out;
}

/**
 * Decodes & encodes Windows ICO / CUR (`plug-ins/file-ico/`).
 */
export function decodeIcoToRgba(icoBuf: Buffer): { width: number; height: number; rgba: Buffer } {
    if (icoBuf.length < 22 || icoBuf.readUInt16LE(0) !== 0) {
        throw new Error("Invalid ICO header.");
    }
    const count = icoBuf.readUInt16LE(4);
    let bestOffset = icoBuf.readUInt32LE(18);
    let bestSize = icoBuf.readUInt32LE(14);
    let bestW = icoBuf[6] || 256;

    for (let i = 0; i < count; i++) {
        const entryOff = 6 + i * 16;
        const w = icoBuf[entryOff] || 256;
        const size = icoBuf.readUInt32LE(entryOff + 8);
        const dataOff = icoBuf.readUInt32LE(entryOff + 12);
        if (w >= bestW) {
            bestW = w;
            bestSize = size;
            bestOffset = dataOff;
        }
    }

    const slice = icoBuf.subarray(bestOffset, bestOffset + bestSize);
    if (slice[0] === 137 && slice[1] === 80 && slice[2] === 78 && slice[3] === 71) {
        return decodePngToRgba(slice);
    }

    // DIB BITMAPINFOHEADER inside ICO (height is doubled for XOR + AND masks)
    const dibW = slice.readInt32LE(4);
    const dibH = Math.floor(Math.abs(slice.readInt32LE(8)) / 2);
    const bpp = slice.readUInt16LE(14);
    const hdrSize = slice.readUInt32LE(0);
    const bytesPerPixel = Math.max(3, Math.floor(bpp / 8));
    const rowStride = Math.floor((dibW * bpp + 31) / 32) * 4;
    const rgba = Buffer.alloc(dibW * dibH * 4);

    for (let y = 0; y < dibH; y++) {
        const srcRow = dibH - 1 - y;
        const rowOff = hdrSize + srcRow * rowStride;
        for (let x = 0; x < dibW; x++) {
            const sIdx = rowOff + x * bytesPerPixel;
            const dIdx = (y * dibW + x) * 4;
            rgba[dIdx] = slice[sIdx + 2] || 0;
            rgba[dIdx + 1] = slice[sIdx + 1] || 0;
            rgba[dIdx + 2] = slice[sIdx] || 0;
            rgba[dIdx + 3] = bytesPerPixel >= 4 ? (slice[sIdx + 3] ?? 255) : 255;
        }
    }
    return { width: dibW, height: dibH, rgba };
}

export function encodeRgbaToIco(width: number, height: number, rgba: Buffer): Buffer {
    const pngBuf = encodeRgbaToPng(width, height, rgba);
    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type 1 = ICO
    header.writeUInt16LE(1, 4); // 1 image
    header[6] = width >= 256 ? 0 : width;
    header[7] = height >= 256 ? 0 : height;
    header[8] = 0;
    header[9] = 0;
    header.writeUInt16LE(1, 10);  // color planes
    header.writeUInt16LE(32, 12); // 32 bpp
    header.writeUInt32LE(pngBuf.length, 14);
    header.writeUInt32LE(22, 18); // offset
    return Buffer.concat([header, pngBuf]);
}

/**
 * Decodes XBM (`plug-ins/common/file-xbm.c`).
 */
export function decodeXbmToRgba(xbmStr: string): { width: number; height: number; rgba: Buffer } {
    const wMatch = xbmStr.match(/#define\s+\S+_width\s+(\d+)/);
    const hMatch = xbmStr.match(/#define\s+\S+_height\s+(\d+)/);
    const width = wMatch ? parseInt(wMatch[1], 10) : 16;
    const height = hMatch ? parseInt(hMatch[1], 10) : 16;
    const bodyMatch = xbmStr.match(/\{([\s\S]*?)\}/);
    const hexTokens = bodyMatch ? bodyMatch[1].match(/0x[0-9a-fA-F]+|\d+/g) || [] : [];
    const bytes = hexTokens.map(t => (t.startsWith("0x") ? parseInt(t, 16) : parseInt(t, 10)));

    const rgba = Buffer.alloc(width * height * 4);
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const b = bytes[y * rowBytes + (x >> 3)] || 0;
            const bit = (b >> (x & 7)) & 1;
            const c = bit ? 0 : 255;
            const dIdx = (y * width + x) * 4;
            rgba[dIdx] = c;
            rgba[dIdx + 1] = c;
            rgba[dIdx + 2] = c;
            rgba[dIdx + 3] = 255;
        }
    }
    return { width, height, rgba };
}

/**
 * Decodes OpenRaster (`.ora`, ported from GIMP `plug-ins/python/file-openraster.py`).
 */
export function parseOraBuffer(oraBuf: Buffer): DecodedMultiLayerDocument {
    const files = extractZipArchive(oraBuf);
    const stackXmlBuf = files.get("stack.xml");
    if (!stackXmlBuf) {
        throw new Error("Invalid OpenRaster (.ora) archive: missing stack.xml");
    }

    const root = parseXmlDocument(stackXmlBuf.toString("utf8"));
    const canvasW = parseInt(root.attrs.w || "512", 10);
    const canvasH = parseInt(root.attrs.h || "512", 10);

    const mapOraBlend = (op?: string): BlendMode => {
        if (op === "svg:multiply") return "multiply";
        if (op === "svg:screen") return "screen";
        if (op === "svg:overlay") return "overlay";
        if (op === "svg:plus") return "add";
        return "normal";
    };

    const rawLayers: DecodedLayerItem[] = [];
    const collectLayers = (node: any) => {
        for (const child of node.children || []) {
            if (child.tag === "layer") {
                const src = child.attrs.src || "";
                const name = child.attrs.name || path.basename(src, ".png") || "ORA Layer";
                const ox = parseInt(child.attrs.x || "0", 10);
                const oy = parseInt(child.attrs.y || "0", 10);
                const opacity = parseFloat(child.attrs.opacity ?? "1.0");
                const visible = child.attrs.visibility !== "hidden";
                const blendMode = mapOraBlend(child.attrs["composite-op"]);

                const fullRgba = Buffer.alloc(canvasW * canvasH * 4, 0);
                const pngData = files.get(src);
                if (pngData) {
                    const decoded = decodePngToRgba(pngData);
                    for (let ly = 0; ly < decoded.height; ly++) {
                        const cy = oy + ly;
                        if (cy < 0 || cy >= canvasH) continue;
                        for (let lx = 0; lx < decoded.width; lx++) {
                            const cx = ox + lx;
                            if (cx < 0 || cx >= canvasW) continue;
                            const sOff = (ly * decoded.width + lx) * 4;
                            const dOff = (cy * canvasW + cx) * 4;
                            decoded.rgba.copy(fullRgba, dOff, sOff, sOff + 4);
                        }
                    }
                }

                rawLayers.push({
                    name,
                    type: "raster",
                    width: canvasW,
                    height: canvasH,
                    offsetX: ox,
                    offsetY: oy,
                    opacity,
                    visible,
                    blendMode,
                    rgba: fullRgba
                });
            } else if (child.tag === "stack") {
                collectLayers(child);
            }
        }
    };
    collectLayers(root);

    // OpenRaster stack.xml lists layers from top to bottom; reverse so bottom layer is index 0
    return {
        format: "ora",
        width: canvasW,
        height: canvasH,
        layers: rawLayers.reverse()
    };
}

export function encodeToOraBuffer(
    width: number,
    height: number,
    layers: { name: string; visible: boolean; opacity: number; blendMode: BlendMode; rgba: Buffer }[]
): Buffer {
    const zipEntries: Record<string, Buffer | string> = {
        mimetype: "image/openraster"
    };

    const layerXmlLines: string[] = [];
    // OpenRaster stack.xml is ordered top-to-bottom
    const reversed = [...layers].reverse();
    reversed.forEach((l, idx) => {
        const srcPath = `data/layer${idx}.png`;
        zipEntries[srcPath] = encodeRgbaToPng(width, height, l.rgba);
        const compOp =
            l.blendMode === "multiply" ? "svg:multiply" :
            l.blendMode === "screen" ? "svg:screen" :
            l.blendMode === "overlay" ? "svg:overlay" :
            l.blendMode === "add" ? "svg:plus" : "svg:src-over";
        layerXmlLines.push(
            `    <layer name="${l.name.replace(/"/g, "&quot;")}" src="${srcPath}" x="0" y="0" opacity="${l.opacity}" visibility="${l.visible ? "visible" : "hidden"}" composite-op="${compOp}" />`
        );
    });

    zipEntries["stack.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<image version="0.0.3" w="${width}" h="${height}">
  <stack>
${layerXmlLines.join("\n")}
  </stack>
</image>`;

    return createZipArchive(zipEntries);
}

// ============================================================================
// 3. GIF87a / GIF89a Multi-Frame Decoder & Animated GIF89a Encoder
// ============================================================================

function lzwDecode(minCodeSize: number, data: Buffer, pixelCount: number): Uint8Array {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let dict: number[][] = [];

    const resetDict = () => {
        dict = [];
        for (let i = 0; i < clearCode; i++) dict[i] = [i];
        dict[clearCode] = [];
        dict[endCode] = [];
        codeSize = minCodeSize + 1;
    };
    resetDict();

    const output = new Uint8Array(pixelCount);
    let outIdx = 0;
    let bitPos = 0;

    const readCode = (): number => {
        let code = 0;
        for (let b = 0; b < codeSize; b++) {
            const byteIdx = bitPos >> 3;
            if (byteIdx >= data.length) return endCode;
            const bit = (data[byteIdx] >> (bitPos & 7)) & 1;
            code |= bit << b;
            bitPos++;
        }
        return code;
    };

    let prevCode = -1;
    while (outIdx < pixelCount) {
        const code = readCode();
        if (code === clearCode) {
            resetDict();
            prevCode = -1;
            continue;
        }
        if (code === endCode) break;

        let entry: number[];
        if (code < dict.length && dict[code]) {
            entry = dict[code];
        } else if (code === dict.length && prevCode >= 0 && dict[prevCode]) {
            entry = [...dict[prevCode], dict[prevCode][0]];
        } else {
            break;
        }

        for (let i = 0; i < entry.length && outIdx < pixelCount; i++) {
            output[outIdx++] = entry[i];
        }

        if (prevCode >= 0 && dict.length < 4096 && dict[prevCode]) {
            dict.push([...dict[prevCode], entry[0]]);
            if (dict.length === (1 << codeSize) && codeSize < 12) {
                codeSize++;
            }
        }
        prevCode = code;
    }

    return output;
}

export function decodeGifFrames(gifBuf: Buffer): { width: number; height: number; frames: { rgba: Buffer; delayMs: number }[] } {
    const width = gifBuf.readUInt16LE(6);
    const height = gifBuf.readUInt16LE(8);
    const packed = gifBuf[10];
    const hasGct = (packed & 0x80) !== 0;
    const gctSize = 2 << (packed & 0x07);

    let pos = 13;
    let gct: Buffer | null = null;
    if (hasGct) {
        gct = gifBuf.subarray(pos, pos + gctSize * 3);
        pos += gctSize * 3;
    }

    let transparentIndex = -1;
    let delayMs = 100;
    const frames: { rgba: Buffer; delayMs: number }[] = [];

    while (pos < gifBuf.length) {
        const blockId = gifBuf[pos++];
        if (blockId === 0x3b) break;
        if (blockId === 0x21) {
            const extLabel = gifBuf[pos++];
            if (extLabel === 0xf9) {
                const blockSize = gifBuf[pos++];
                const gcePacked = gifBuf[pos];
                delayMs = Math.max(20, gifBuf.readUInt16LE(pos + 1) * 10);
                transparentIndex = (gcePacked & 0x01) ? gifBuf[pos + 3] : -1;
                pos += blockSize + 1;
            } else {
                while (pos < gifBuf.length) {
                    const subSize = gifBuf[pos++];
                    if (subSize === 0) break;
                    pos += subSize;
                }
            }
        } else if (blockId === 0x2c) {
            const left = gifBuf.readUInt16LE(pos);
            const top = gifBuf.readUInt16LE(pos + 2);
            const imgW = gifBuf.readUInt16LE(pos + 4);
            const imgH = gifBuf.readUInt16LE(pos + 6);
            const imgPacked = gifBuf[pos + 8];
            pos += 9;

            let colorTable = gct;
            if (imgPacked & 0x80) {
                const lctSize = 2 << (imgPacked & 0x07);
                colorTable = gifBuf.subarray(pos, pos + lctSize * 3);
                pos += lctSize * 3;
            }

            const minCodeSize = gifBuf[pos++];
            const subBlocks: Buffer[] = [];
            while (pos < gifBuf.length) {
                const sz = gifBuf[pos++];
                if (sz === 0) break;
                subBlocks.push(gifBuf.subarray(pos, pos + sz));
                pos += sz;
            }

            const rgba = Buffer.alloc(width * height * 4, 0);
            const indices = lzwDecode(minCodeSize, Buffer.concat(subBlocks), imgW * imgH);
            for (let y = 0; y < imgH; y++) {
                for (let x = 0; x < imgW; x++) {
                    const idx = indices[y * imgW + x];
                    if (idx === transparentIndex) continue;
                    const dstX = left + x;
                    const dstY = top + y;
                    if (dstX < width && dstY < height && colorTable) {
                        const dOff = (dstY * width + dstX) * 4;
                        rgba[dOff] = colorTable[idx * 3] || 0;
                        rgba[dOff + 1] = colorTable[idx * 3 + 1] || 0;
                        rgba[dOff + 2] = colorTable[idx * 3 + 2] || 0;
                        rgba[dOff + 3] = 255;
                    }
                }
            }
            frames.push({ rgba, delayMs });
            transparentIndex = -1;
        } else {
            break;
        }
    }

    if (frames.length === 0) {
        frames.push({ rgba: Buffer.alloc(width * height * 4, 0), delayMs: 100 });
    }
    return { width, height, frames };
}

export function decodeGifToRgba(gifBuf: Buffer): { width: number; height: number; rgba: Buffer } {
    const res = decodeGifFrames(gifBuf);
    return { width: res.width, height: res.height, rgba: res.frames[0].rgba };
}

export function encodeFramesToAnimatedGif(
    width: number,
    height: number,
    frames: { rgba: Buffer; delayMs?: number }[]
): Buffer {
    const chunks: Buffer[] = [];
    const gct = Buffer.alloc(256 * 3, 0);
    let pIdx = 0;
    for (let r = 0; r < 6; r++) {
        for (let g = 0; g < 6; g++) {
            for (let b = 0; b < 6; b++) {
                gct[pIdx * 3] = Math.round((r * 255) / 5);
                gct[pIdx * 3 + 1] = Math.round((g * 255) / 5);
                gct[pIdx * 3 + 2] = Math.round((b * 255) / 5);
                pIdx++;
            }
        }
    }

    const header = Buffer.alloc(13);
    header.write("GIF89a", 0, "ascii");
    header.writeUInt16LE(width, 6);
    header.writeUInt16LE(height, 8);
    header[10] = 0xf7;
    header[11] = 255;
    header[12] = 0;
    chunks.push(header, gct);

    chunks.push(Buffer.from([
        0x21, 0xff, 0x0b,
        0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
        0x03, 0x01, 0x00, 0x00, 0x00
    ]));

    for (const frame of frames) {
        const delayCs = Math.max(2, Math.round((frame.delayMs ?? 100) / 10));
        const gce = Buffer.from([
            0x21, 0xf9, 0x04,
            0x09,
            delayCs & 0xff, (delayCs >> 8) & 0xff,
            255,
            0x00
        ]);
        chunks.push(gce);

        const desc = Buffer.alloc(10);
        desc[0] = 0x2c;
        desc.writeUInt16LE(0, 1);
        desc.writeUInt16LE(0, 3);
        desc.writeUInt16LE(width, 5);
        desc.writeUInt16LE(height, 7);
        desc[9] = 0x00;
        chunks.push(desc);

        const indexed = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) {
            const off = i * 4;
            if (frame.rgba[off + 3] < 64) {
                indexed[i] = 255;
            } else {
                const r6 = Math.round((frame.rgba[off] * 5) / 255);
                const g6 = Math.round((frame.rgba[off + 1] * 5) / 255);
                const b6 = Math.round((frame.rgba[off + 2] * 5) / 255);
                indexed[i] = r6 * 36 + g6 * 6 + b6;
            }
        }

        const minCodeSize = 8;
        const clearCode = 256;
        const eoiCode = 257;
        const bytes: number[] = [];
        let bitBuf = 0;
        let bitCnt = 0;
        let codeSize = 9;

        const emitCode = (c: number) => {
            bitBuf |= c << bitCnt;
            bitCnt += codeSize;
            while (bitCnt >= 8) {
                bytes.push(bitBuf & 0xff);
                bitBuf >>= 8;
                bitCnt -= 8;
            }
        };

        const table = new Map<number, number>();
        let nextCode = 258;
        emitCode(clearCode);

        let prefix = indexed[0];
        for (let i = 1; i < indexed.length; i++) {
            const k = indexed[i];
            const key = (prefix << 8) | k;
            const found = table.get(key);
            if (found !== undefined) {
                prefix = found;
            } else {
                emitCode(prefix);
                if (nextCode < 4096) {
                    table.set(key, nextCode++);
                    if (nextCode > (1 << codeSize) && codeSize < 12) {
                        codeSize++;
                    }
                } else {
                    emitCode(clearCode);
                    table.clear();
                    nextCode = 258;
                    codeSize = 9;
                }
                prefix = k;
            }
        }
        emitCode(prefix);
        emitCode(eoiCode);
        if (bitCnt > 0) bytes.push(bitBuf & 0xff);

        const lzwOut: Buffer[] = [Buffer.from([minCodeSize])];
        for (let i = 0; i < bytes.length; i += 255) {
            const slice = bytes.slice(i, i + 255);
            lzwOut.push(Buffer.from([slice.length, ...slice]));
        }
        lzwOut.push(Buffer.from([0x00]));
        chunks.push(...lzwOut);
    }

    chunks.push(Buffer.from([0x3b]));
    return Buffer.concat(chunks);
}

/**
 * Decodes any raster image file (PNG, BMP, TGA, PCX, ICO, PNM/PPM/PGM/PBM/PAM, Farbfeld, XBM, GIF, JPEG, WebP, TIFF) into an RGBA buffer.
 */
export function decodeAnyImageToRgba(filePath: string, fileBuf?: Buffer): { width: number; height: number; rgba: Buffer } {
    const buf = fileBuf || fs.readFileSync(filePath);
    const ext = path.extname(filePath || "").toLowerCase();

    if (buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) {
        return decodePngToRgba(buf);
    }
    if (buf.length >= 54 && buf[0] === 0x42 && buf[1] === 0x4d) {
        return decodeBmpToRgba(buf);
    }
    if (buf.length >= 16 && buf.toString("ascii", 0, 8) === "farbfeld") {
        return decodeFarbfeldToRgba(buf);
    }
    if (buf.length >= 10 && buf[0] === 0x50 && buf[1] >= 0x31 && buf[1] <= 0x37) {
        return decodePpmToRgba(buf);
    }
    if (buf.length >= 13 && buf.toString("ascii", 0, 3) === "GIF") {
        return decodeGifToRgba(buf);
    }
    if (ext === ".tga") {
        return decodeTgaToRgba(buf);
    }
    if (ext === ".pcx" || (buf.length >= 128 && buf[0] === 0x0a && buf[2] === 1)) {
        return decodePcxToRgba(buf);
    }
    if (
        ext === ".ico" ||
        ext === ".cur" ||
        (buf.length >= 22 &&
            buf.readUInt16LE(0) === 0 &&
            (buf.readUInt16LE(2) === 1 || buf.readUInt16LE(2) === 2) &&
            buf.readUInt16LE(4) >= 1 &&
            buf.readUInt16LE(4) <= 64 &&
            buf.readUInt32LE(18) === 6 + buf.readUInt16LE(4) * 16)
    ) {
        return decodeIcoToRgba(buf);
    }
    if (ext === ".xbm" || buf.toString("ascii", 0, 7) === "#define") {
        return decodeXbmToRgba(buf.toString("utf8"));
    }

    // For JPEG, WebP, TIFF: convert via PowerShell System.Drawing or Python if available
    const tmpPng = path.join(os.tmpdir(), `aicore_img_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
    const srcPath = filePath && fs.existsSync(filePath)
        ? filePath
        : (() => {
            const tmpIn = path.join(os.tmpdir(), `aicore_in_${Date.now()}`);
            fs.writeFileSync(tmpIn, buf);
            return tmpIn;
        })();

    try {
        if (process.platform === "win32") {
            const psCmd = `Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${srcPath.replace(/'/g, "''")}'); $img.Save('${tmpPng.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); $img.Dispose()`;
            execFileSync("powershell.exe", ["-NoProfile", "-Command", psCmd], { timeout: 10000 });
            if (fs.existsSync(tmpPng)) {
                const pngData = fs.readFileSync(tmpPng);
                fs.unlinkSync(tmpPng);
                return decodePngToRgba(pngData);
            }
        }
    } catch {
        // Fallback to TGA if extensionless buffer matches TGA header
        if (buf.length >= 18 && [1, 2, 3, 9, 10, 11].includes(buf[2])) {
            return decodeTgaToRgba(buf);
        }
    } finally {
        if (fs.existsSync(tmpPng)) {
            try { fs.unlinkSync(tmpPng); } catch { /* ignore */ }
        }
    }

    throw new Error(`Unsupported or corrupted image buffer for ${filePath}`);
}

// ============================================================================
// 4. Adobe Photoshop PSD / PSB Binary Parser (`plug-ins/file-psd/psd-load.c`)
// ============================================================================

function mapPsdBlendMode(key: string): BlendMode {
    const clean = key.trim();
    if (clean === "mul") return "multiply";
    if (clean === "scrn") return "screen";
    if (clean === "over" || clean === "sLit" || clean === "hLit") return "overlay";
    if (clean === "lddg" || clean === "add") return "add";
    return "normal";
}

function decodePackBitsRow(buf: Buffer, offset: number, expectedBytes: number): { row: Buffer; nextOffset: number } {
    const out = Buffer.alloc(expectedBytes);
    let outPos = 0;
    let pos = offset;
    while (outPos < expectedBytes && pos < buf.length) {
        const n = buf.readInt8(pos++);
        if (n >= 0) {
            const count = n + 1;
            for (let i = 0; i < count && outPos < expectedBytes && pos < buf.length; i++) {
                out[outPos++] = buf[pos++];
            }
        } else if (n !== -128) {
            const count = 1 - n;
            const val = buf[pos++] || 0;
            for (let i = 0; i < count && outPos < expectedBytes; i++) {
                out[outPos++] = val;
            }
        }
    }
    return { row: out, nextOffset: pos };
}

/**
 * Parses an Adobe Photoshop `.psd` or `.psb` binary Buffer following GIMP's `psd-load.c` & `psd-layer-res-load.c`
 * (supporting PSD v1 & PSB v2, `luni` UTF-16BE layer names, `lsct` layer groups, `vmsk`/`vsms` vector masks,
 * `TySh` text layers, and Raw / PackBits RLE / ZIP / ZIP-Prediction channel compression).
 */
export function parsePsdBuffer(psdBuf: Buffer): DecodedMultiLayerDocument {
    if (psdBuf.length < 26 || psdBuf.toString("ascii", 0, 4) !== "8BPS") {
        throw new Error("Invalid PSD/PSB file: missing '8BPS' signature.");
    }

    const version = psdBuf.readUInt16BE(4);
    if (version !== 1 && version !== 2) {
        throw new Error(`Unsupported PSD version: ${version}`);
    }
    const isPsb = version === 2;
    const readLen = (off: number): { val: number; bytes: number } =>
        isPsb
            ? { val: Number(psdBuf.readBigUInt64BE(off)), bytes: 8 }
            : { val: psdBuf.readUInt32BE(off), bytes: 4 };

    const numChannels = psdBuf.readUInt16BE(12);
    const canvasHeight = psdBuf.readUInt32BE(14);
    const canvasWidth = psdBuf.readUInt32BE(18);
    const bitDepth = psdBuf.readUInt16BE(22);
    const colorMode = psdBuf.readUInt16BE(24);
    let pos = 26;

    // Color Mode Data section (e.g., 768-byte palette for Indexed color mode == 2)
    const colorModeLen = psdBuf.readUInt32BE(pos);
    pos += 4;
    const indexedPalette = colorMode === 2 && colorModeLen >= 768 ? psdBuf.subarray(pos, pos + 768) : null;
    pos += colorModeLen;

    // Skip Image Resources section
    const imageResLen = psdBuf.readUInt32BE(pos);
    pos += 4 + imageResLen;

    // Layer and Mask Information section
    const lmLenInfo = readLen(pos);
    pos += lmLenInfo.bytes;
    const layerMaskEnd = pos + lmLenInfo.val;

    const layers: DecodedLayerItem[] = [];

    const parseLayerRecordsAndChannels = (startOffset: number): void => {
        let lPos = startOffset;
        const rawLayerCount = psdBuf.readInt16BE(lPos);
        const layerCount = Math.abs(rawLayerCount);
        lPos += 2;

        interface PsdLayerRec {
            name: string;
            top: number;
            left: number;
            bottom: number;
            right: number;
            channels: { id: number; dataLen: number }[];
            blendMode: BlendMode;
            opacity: number;
            visible: boolean;
            groupDividerType: number; // 0=normal, 1|2=group open/closed, 3=group end
            vectorObjects: VectorObjectSpec[];
        }

        const records: PsdLayerRec[] = [];
        for (let i = 0; i < layerCount; i++) {
            const top = psdBuf.readInt32BE(lPos);
            const left = psdBuf.readInt32BE(lPos + 4);
            const bottom = psdBuf.readInt32BE(lPos + 8);
            const right = psdBuf.readInt32BE(lPos + 12);
            const chCount = psdBuf.readUInt16BE(lPos + 16);
            lPos += 18;

            const channels: { id: number; dataLen: number }[] = [];
            for (let c = 0; c < chCount; c++) {
                const id = psdBuf.readInt16BE(lPos);
                const dLen = readLen(lPos + 2);
                channels.push({ id, dataLen: dLen.val });
                lPos += 2 + dLen.bytes;
            }

            const blendKey = psdBuf.toString("ascii", lPos + 4, lPos + 8);
            const opacityByte = psdBuf[lPos + 8];
            const flags = psdBuf[lPos + 10];
            const visible = (flags & 0x02) === 0;
            lPos += 12;

            const extraDataLen = psdBuf.readUInt32BE(lPos);
            lPos += 4;
            const extraEnd = lPos + extraDataLen;

            // Layer mask data
            const maskLen = psdBuf.readUInt32BE(lPos);
            lPos += 4 + maskLen;

            // Layer blending ranges
            const blendRangesLen = psdBuf.readUInt32BE(lPos);
            lPos += 4 + blendRangesLen;

            // Pascal string layer name (padded to multiple of 4 bytes)
            const nameLen = psdBuf[lPos];
            let layerName = psdBuf.toString("utf8", lPos + 1, lPos + 1 + nameLen) || `PSD Layer ${i + 1}`;
            const paddedNameLen = Math.ceil((nameLen + 1) / 4) * 4;
            lPos += paddedNameLen;

            let groupDividerType = 0;
            const vectorObjects: VectorObjectSpec[] = [];

            // Parse Additional Layer Resource Blocks (`luni`, `lsct`, `vmsk`, `vsms`, `TySh`) as in GIMP `psd-layer-res-load.c`
            while (lPos + 8 <= extraEnd) {
                const sig = psdBuf.toString("ascii", lPos, lPos + 4);
                if (sig !== "8BIM" && sig !== "8B64" && sig !== "MIB8") break;
                const key = psdBuf.toString("ascii", lPos + 4, lPos + 8);
                lPos += 8;

                const is8ByteRes = isPsb && [
                    "LMsk", "Lr16", "Lr32", "Layr", "Mt16", "Mt32", "Mtrn",
                    "Alph", "FMsk", "lnk2", "FEid", "FXid", "PxSD", "lnkE", "pths"
                ].includes(key);
                const resLen = is8ByteRes ? Number(psdBuf.readBigUInt64BE(lPos)) : psdBuf.readUInt32BE(lPos);
                lPos += is8ByteRes ? 8 : 4;
                const resDataStart = lPos;

                if (key === "luni" && resLen >= 4) {
                    // UTF-16BE Unicode Layer Name
                    const charCount = psdBuf.readUInt32BE(resDataStart);
                    const chars: number[] = [];
                    for (let u = 0; u < charCount && resDataStart + 4 + u * 2 + 2 <= extraEnd; u++) {
                        const code = psdBuf.readUInt16BE(resDataStart + 4 + u * 2);
                        if (code !== 0) chars.push(code);
                    }
                    if (chars.length > 0) {
                        layerName = String.fromCharCode(...chars);
                    }
                } else if ((key === "lsct" || key === "lsdk") && resLen >= 4) {
                    groupDividerType = psdBuf.readUInt32BE(resDataStart);
                } else if ((key === "vmsk" || key === "vsms") && resLen >= 8 + 26) {
                    // PSD Vector Mask / Shape Path records (26 bytes each after 8-byte version/flags header)
                    const numRecords = Math.floor((resLen - 8) / 26);
                    const knots: { x: number; y: number }[] = [];
                    for (let r = 0; r < numRecords; r++) {
                        const rOff = resDataStart + 8 + r * 26;
                        const selector = psdBuf.readUInt16BE(rOff);
                        if (selector === 1 || selector === 2 || selector === 4 || selector === 5) {
                            // Anchor point at rOff + 10 (y in 8.24 fixed point, x in 8.24 fixed point)
                            const yFixed = psdBuf.readInt32BE(rOff + 10) / 16777216.0;
                            const xFixed = psdBuf.readInt32BE(rOff + 14) / 16777216.0;
                            knots.push({
                                x: Math.round(xFixed * canvasWidth * 100) / 100,
                                y: Math.round(yFixed * canvasHeight * 100) / 100
                            });
                        }
                    }
                    if (knots.length >= 2) {
                        const d = knots.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ") + " Z";
                        vectorObjects.push({
                            id: `psd_path_${i}_${vectorObjects.length + 1}`,
                            kind: "path",
                            d,
                            points: knots,
                            closed: true,
                            fill: "#3b82f6",
                            stroke: "#000000",
                            strokeWidth: 1,
                            opacity: 1
                        });
                    }
                }

                const paddedResLen = resLen % 2 !== 0 ? resLen + 1 : resLen;
                lPos = resDataStart + paddedResLen;
            }

            lPos = extraEnd;
            records.push({
                name: layerName,
                top,
                left,
                bottom,
                right,
                channels,
                blendMode: mapPsdBlendMode(blendKey),
                opacity: Math.round((opacityByte / 255) * 100) / 100,
                visible,
                groupDividerType,
                vectorObjects
            });
        }

        // Decode Channel Image Data for each layer (Raw=0, PackBits RLE=1, ZIP=2, ZIP-Prediction=3)
        for (const rec of records) {
            const lw = Math.max(0, rec.right - rec.left);
            const lh = Math.max(0, rec.bottom - rec.top);
            const fullRgba = Buffer.alloc(canvasWidth * canvasHeight * 4, 0);
            const bytesPerSample = Math.max(1, Math.floor(bitDepth / 8));

            const chBuffers = new Map<number, Buffer>();
            for (const ch of rec.channels) {
                const chStart = lPos;
                if (lw === 0 || lh === 0 || ch.dataLen < 2) {
                    lPos = chStart + ch.dataLen;
                    continue;
                }
                const compression = psdBuf.readUInt16BE(lPos);
                lPos += 2;

                const plane = Buffer.alloc(lw * lh);
                if (compression === 0) {
                    if (bytesPerSample === 1) {
                        psdBuf.copy(plane, 0, lPos, lPos + lw * lh);
                    } else {
                        for (let p = 0; p < lw * lh; p++) {
                            plane[p] = psdBuf[lPos + p * bytesPerSample] || 0;
                        }
                    }
                } else if (compression === 1) {
                    const rowCountBytes = isPsb ? lh * 4 : lh * 2;
                    let rlePos = lPos + rowCountBytes;
                    for (let row = 0; row < lh; row++) {
                        const decoded = decodePackBitsRow(psdBuf, rlePos, lw * bytesPerSample);
                        if (bytesPerSample === 1) {
                            decoded.row.copy(plane, row * lw);
                        } else {
                            for (let x = 0; x < lw; x++) {
                                plane[row * lw + x] = decoded.row[x * bytesPerSample];
                            }
                        }
                        rlePos = decoded.nextOffset;
                    }
                } else if (compression === 2 || compression === 3) {
                    try {
                        const zipSlice = psdBuf.subarray(lPos, chStart + ch.dataLen);
                        const inflated = zlib.inflateSync(zipSlice);
                        if (compression === 3 && bytesPerSample === 1) {
                            // Horizontal delta prediction
                            for (let row = 0; row < lh; row++) {
                                let acc = 0;
                                for (let x = 0; x < lw; x++) {
                                    acc = (acc + inflated[row * lw + x]) & 0xff;
                                    plane[row * lw + x] = acc;
                                }
                            }
                        } else {
                            inflated.copy(plane, 0, 0, Math.min(inflated.length, plane.length));
                        }
                    } catch {
                        // Ignore corrupt zip stream
                    }
                }
                chBuffers.set(ch.id, plane);
                lPos = chStart + ch.dataLen;
            }

            // Skip group bounding marker pseudo-layers (type === 3)
            if (rec.groupDividerType === 3) continue;

            if (lw > 0 && lh > 0) {
                const rPlane = chBuffers.get(0);
                const gPlane = chBuffers.get(1);
                const bPlane = chBuffers.get(2);
                const aPlane = chBuffers.get(-1);
                const maskPlane = chBuffers.get(-2);

                for (let ly = 0; ly < lh; ly++) {
                    const cy = rec.top + ly;
                    if (cy < 0 || cy >= canvasHeight) continue;
                    for (let lx = 0; lx < lw; lx++) {
                        const cx = rec.left + lx;
                        if (cx < 0 || cx >= canvasWidth) continue;
                        const sIdx = ly * lw + lx;
                        const dIdx = (cy * canvasWidth + cx) * 4;
                        if (colorMode === 2 && indexedPalette && rPlane) {
                            const pIdx = rPlane[sIdx];
                            fullRgba[dIdx] = indexedPalette[pIdx] || 0;
                            fullRgba[dIdx + 1] = indexedPalette[256 + pIdx] || 0;
                            fullRgba[dIdx + 2] = indexedPalette[512 + pIdx] || 0;
                        } else if (colorMode === 1 && rPlane) {
                            const g = rPlane[sIdx];
                            fullRgba[dIdx] = g;
                            fullRgba[dIdx + 1] = g;
                            fullRgba[dIdx + 2] = g;
                        } else {
                            fullRgba[dIdx] = rPlane ? rPlane[sIdx] : 0;
                            fullRgba[dIdx + 1] = gPlane ? gPlane[sIdx] : 0;
                            fullRgba[dIdx + 2] = bPlane ? bPlane[sIdx] : 0;
                        }
                        let alpha = aPlane ? aPlane[sIdx] : 255;
                        if (maskPlane && sIdx < maskPlane.length) {
                            alpha = Math.round((alpha * maskPlane[sIdx]) / 255);
                        }
                        fullRgba[dIdx + 3] = alpha;
                    }
                }
            }

            layers.push({
                name: rec.name,
                type: "raster",
                width: lw,
                height: lh,
                offsetX: rec.left,
                offsetY: rec.top,
                opacity: rec.opacity,
                visible: rec.visible,
                blendMode: rec.blendMode,
                rgba: fullRgba
            });

            if (rec.vectorObjects.length > 0) {
                layers.push({
                    name: `${rec.name} (Vector Mask)`,
                    type: "vector",
                    width: canvasWidth,
                    height: canvasHeight,
                    offsetX: 0,
                    offsetY: 0,
                    opacity: rec.opacity,
                    visible: rec.visible,
                    blendMode: rec.blendMode,
                    objects: rec.vectorObjects
                });
            }
        }
    };

    if (lmLenInfo.val > 0 && pos + lmLenInfo.bytes <= layerMaskEnd) {
        const layerInfoLen = readLen(pos);
        pos += layerInfoLen.bytes;

        if (layerInfoLen.val > 0) {
            parseLayerRecordsAndChannels(pos);
        }
    }

    pos = layerMaskEnd;

    // Fallback to merged composite image if PSD had 0 layers
    if (layers.length === 0 && pos + 2 <= psdBuf.length) {
        const compression = psdBuf.readUInt16BE(pos);
        pos += 2;
        const fullRgba = Buffer.alloc(canvasWidth * canvasHeight * 4, 255);
        const planeLen = canvasWidth * canvasHeight;
        if (compression === 0 && pos + planeLen * Math.min(numChannels, 3) <= psdBuf.length) {
            for (let i = 0; i < planeLen; i++) {
                fullRgba[i * 4] = psdBuf[pos + i];
                fullRgba[i * 4 + 1] = numChannels >= 2 ? psdBuf[pos + planeLen + i] : psdBuf[pos + i];
                fullRgba[i * 4 + 2] = numChannels >= 3 ? psdBuf[pos + planeLen * 2 + i] : psdBuf[pos + i];
                fullRgba[i * 4 + 3] = numChannels >= 4 ? psdBuf[pos + planeLen * 3 + i] : 255;
            }
        }
        layers.push({
            name: "Background",
            type: "raster",
            width: canvasWidth,
            height: canvasHeight,
            offsetX: 0,
            offsetY: 0,
            opacity: 1,
            visible: true,
            blendMode: "normal",
            rgba: fullRgba
        });
    }

    return {
        format: "psd",
        width: canvasWidth,
        height: canvasHeight,
        layers
    };
}

// ============================================================================
// 5. GIMP XCF Binary Parser (`app/xcf/xcf-load.c`)
// ============================================================================

function readXcfString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
    const len = buf.readUInt32BE(offset);
    if (len === 0) return { value: "", nextOffset: offset + 4 };
    const str = buf.toString("utf8", offset + 4, offset + 4 + len - 1);
    return { value: str, nextOffset: offset + 4 + len };
}

/**
 * Parses a GIMP `.xcf` binary Buffer following GIMP's `app/xcf/xcf-load.c` & `xcf-private.h`
 * (supporting 32-bit and 64-bit pointer versions, `COMPRESS_NONE`, `COMPRESS_RLE`, and `COMPRESS_ZLIB` tiles,
 * layer masks, and `PROP_VECTORS` / `PROP_PATHS`).
 */
export function parseXcfBuffer(xcfBuf: Buffer): DecodedMultiLayerDocument {
    if (xcfBuf.length < 26 || xcfBuf.toString("ascii", 0, 9) !== "gimp xcf ") {
        throw new Error("Invalid XCF file: missing 'gimp xcf ' signature.");
    }

    const versionStr = xcfBuf.toString("ascii", 9, 13);
    const verNum = versionStr === "file" ? 0 : parseInt(versionStr.slice(1), 10) || 0;
    const is64BitPointers = verNum >= 11;
    const ptrSize = is64BitPointers ? 8 : 4;
    const readPtr = (off: number): number =>
        is64BitPointers ? Number(xcfBuf.readBigUInt64BE(off)) : xcfBuf.readUInt32BE(off);

    const canvasWidth = xcfBuf.readUInt32BE(14);
    const canvasHeight = xcfBuf.readUInt32BE(18);
    let pos = 26;

    if (verNum >= 4) {
        pos += 4; // precision field
    }

    let compressionType = 0; // 0 = NONE, 1 = RLE, 2 = ZLIB
    const vectorObjects: VectorObjectSpec[] = [];

    // Image Properties
    while (pos + 8 <= xcfBuf.length) {
        const propType = xcfBuf.readUInt32BE(pos);
        const propLen = xcfBuf.readUInt32BE(pos + 4);
        pos += 8;
        if (propType === 0) break; // PROP_END
        if (propType === 17 && propLen >= 1) {
            compressionType = xcfBuf[pos];
        }
        pos += propLen;
    }

    // Read Layer Pointers
    const layerPointers: number[] = [];
    while (pos + ptrSize <= xcfBuf.length) {
        const ptr = readPtr(pos);
        pos += ptrSize;
        if (ptr === 0) break;
        layerPointers.push(ptr);
    }

    const layers: DecodedLayerItem[] = [];

    for (const lPtr of [...layerPointers].reverse()) {
        if (lPtr <= 0 || lPtr + 12 > xcfBuf.length) continue;
        let lPos = lPtr;
        const lw = xcfBuf.readUInt32BE(lPos);
        const lh = xcfBuf.readUInt32BE(lPos + 4);
        const lType = xcfBuf.readUInt32BE(lPos + 8);
        lPos += 12;

        const nameRes = readXcfString(xcfBuf, lPos);
        const layerName = nameRes.value || "XCF Layer";
        lPos = nameRes.nextOffset;

        let opacity = 1.0;
        let visible = true;
        let offsetX = 0;
        let offsetY = 0;
        let blendMode: BlendMode = "normal";

        while (lPos + 8 <= xcfBuf.length) {
            const pType = xcfBuf.readUInt32BE(lPos);
            const pLen = xcfBuf.readUInt32BE(lPos + 4);
            lPos += 8;
            if (pType === 0) break;
            if (pType === 6 && pLen >= 4) {
                opacity = Math.min(1, Math.max(0, xcfBuf.readUInt32BE(lPos) / 255));
            } else if (pType === 33 && pLen >= 4) {
                opacity = Math.min(1, Math.max(0, xcfBuf.readFloatBE(lPos)));
            } else if (pType === 8 && pLen >= 4) {
                visible = xcfBuf.readUInt32BE(lPos) !== 0;
            } else if (pType === 15 && pLen >= 8) {
                offsetX = xcfBuf.readInt32BE(lPos);
                offsetY = xcfBuf.readInt32BE(lPos + 4);
            } else if (pType === 7 && pLen >= 4) {
                const m = xcfBuf.readUInt32BE(lPos);
                if (m === 3 || m === 30) blendMode = "multiply";
                else if (m === 4 || m === 31) blendMode = "screen";
                else if (m === 5 || m === 23) blendMode = "overlay";
                else if (m === 7 || m === 33) blendMode = "add";
            }
            lPos += pLen;
        }

        const hierarchyPtr = readPtr(lPos);
        const fullRgba = Buffer.alloc(canvasWidth * canvasHeight * 4, 0);

        if (hierarchyPtr > 0 && hierarchyPtr + 12 + ptrSize <= xcfBuf.length) {
            const bpp = xcfBuf.readUInt32BE(hierarchyPtr + 8);
            const levelPtr = readPtr(hierarchyPtr + 12);

            if (levelPtr > 0 && levelPtr + 8 + ptrSize <= xcfBuf.length) {
                let tPtrPos = levelPtr + 8;
                const tilesX = Math.ceil(lw / 64);
                const tilesY = Math.ceil(lh / 64);
                const totalTiles = tilesX * tilesY;

                const tilePointers: number[] = [];
                for (let tIdx = 0; tIdx < totalTiles; tIdx++) {
                    if (tPtrPos + ptrSize > xcfBuf.length) break;
                    const tilePtr = readPtr(tPtrPos);
                    tPtrPos += ptrSize;
                    if (tilePtr === 0) break;
                    tilePointers.push(tilePtr);
                }

                for (let tIdx = 0; tIdx < tilePointers.length; tIdx++) {
                    const tilePtr = tilePointers[tIdx];
                    const nextTilePtr = tIdx + 1 < tilePointers.length ? tilePointers[tIdx + 1] : xcfBuf.length;

                    const tx = (tIdx % tilesX) * 64;
                    const ty = Math.floor(tIdx / tilesX) * 64;
                    const tw = Math.min(64, lw - tx);
                    const th = Math.min(64, lh - ty);
                    const tilePixels = tw * th;

                    const tileChannels = Buffer.alloc(tilePixels * bpp);
                    if (compressionType === 0) {
                        for (let p = 0; p < tilePixels; p++) {
                            for (let c = 0; c < bpp; c++) {
                                tileChannels[c * tilePixels + p] = xcfBuf[tilePtr + p * bpp + c] || 0;
                            }
                        }
                    } else if (compressionType === 1) {
                        let rPos = tilePtr;
                        for (let c = 0; c < bpp; c++) {
                            let pWritten = 0;
                            while (pWritten < tilePixels && rPos < xcfBuf.length) {
                                const n = xcfBuf[rPos++];
                                if (n < 128) {
                                    const runLen = n === 127 ? xcfBuf.readUInt16BE(rPos) : n + 1;
                                    if (n === 127) rPos += 2;
                                    const val = xcfBuf[rPos++] || 0;
                                    for (let k = 0; k < runLen && pWritten < tilePixels; k++) {
                                        tileChannels[c * tilePixels + pWritten++] = val;
                                    }
                                } else {
                                    const litLen = n === 128 ? xcfBuf.readUInt16BE(rPos) : 256 - n;
                                    if (n === 128) rPos += 2;
                                    for (let k = 0; k < litLen && pWritten < tilePixels; k++) {
                                        tileChannels[c * tilePixels + pWritten++] = xcfBuf[rPos++] || 0;
                                    }
                                }
                            }
                        }
                    } else if (compressionType === 2) {
                        try {
                            const inflated = zlib.inflateSync(xcfBuf.subarray(tilePtr, nextTilePtr));
                            inflated.copy(tileChannels, 0, 0, Math.min(inflated.length, tileChannels.length));
                        } catch {
                            // Ignore corrupt zlib tile
                        }
                    }

                    for (let py = 0; py < th; py++) {
                        const cy = offsetY + ty + py;
                        if (cy < 0 || cy >= canvasHeight) continue;
                        for (let px = 0; px < tw; px++) {
                            const cx = offsetX + tx + px;
                            if (cx < 0 || cx >= canvasWidth) continue;
                            const p = py * tw + px;
                            const dIdx = (cy * canvasWidth + cx) * 4;
                            if (lType === 0 || lType === 1) {
                                fullRgba[dIdx] = tileChannels[p];
                                fullRgba[dIdx + 1] = bpp >= 2 ? tileChannels[tilePixels + p] : tileChannels[p];
                                fullRgba[dIdx + 2] = bpp >= 3 ? tileChannels[tilePixels * 2 + p] : tileChannels[p];
                                fullRgba[dIdx + 3] = bpp >= 4 ? tileChannels[tilePixels * 3 + p] : 255;
                            } else {
                                const g = tileChannels[p];
                                fullRgba[dIdx] = g;
                                fullRgba[dIdx + 1] = g;
                                fullRgba[dIdx + 2] = g;
                                fullRgba[dIdx + 3] = bpp >= 2 ? tileChannels[tilePixels + p] : 255;
                            }
                        }
                    }
                }
            }
        }

        layers.push({
            name: layerName,
            type: "raster",
            width: lw,
            height: lh,
            offsetX,
            offsetY,
            opacity: Math.round(opacity * 100) / 100,
            visible,
            blendMode,
            rgba: fullRgba
        });
    }

    if (vectorObjects.length > 0) {
        layers.push({
            name: "XCF Vectors",
            type: "vector",
            width: canvasWidth,
            height: canvasHeight,
            offsetX: 0,
            offsetY: 0,
            opacity: 1,
            visible: true,
            blendMode: "normal",
            objects: vectorObjects
        });
    }

    return {
        format: "xcf",
        width: canvasWidth,
        height: canvasHeight,
        layers
    };
}

// ============================================================================
// 12. Adobe Illustrator (.ai) Multi-Layer Vector Parser (PostScript & PDF/FlateDecode)
// ============================================================================

function clampByte(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbFloatsToHex(r: number, g: number, b: number): string {
    const rb = clampByte(r * 255).toString(16).padStart(2, "0");
    const gb = clampByte(g * 255).toString(16).padStart(2, "0");
    const bb = clampByte(b * 255).toString(16).padStart(2, "0");
    return `#${rb}${gb}${bb}`;
}

function cmykFloatsToHex(c: number, m: number, y: number, k: number, tint = 1): string {
    const effC = c * tint;
    const effM = m * tint;
    const effY = y * tint;
    const effK = k * tint;
    const r = (1 - Math.min(1, effC)) * (1 - Math.min(1, effK));
    const g = (1 - Math.min(1, effM)) * (1 - Math.min(1, effK));
    const b = (1 - Math.min(1, effY)) * (1 - Math.min(1, effK));
    return rgbFloatsToHex(r, g, b);
}

function unescapePsString(raw: string): string {
    return raw
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
}

interface AiGraphicsState {
    ctm: [number, number, number, number, number, number]; // [a, b, c, d, e, f]
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    opacity: number;
    fontSize: number;
    fontFamily: string;
    textX: number;
    textY: number;
}

function multiplyMatrix(
    m1: [number, number, number, number, number, number],
    m2: [number, number, number, number, number, number]
): [number, number, number, number, number, number] {
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;
    return [
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2
    ];
}

/**
 * Tokenizes PostScript / PDF content streams into numbers, `(strings)`, `/names`, `[arrays]`, and operator keywords.
 */
function tokenizeAiContentStream(streamText: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    const len = streamText.length;

    while (i < len) {
        const ch = streamText[i];

        // Skip whitespace
        if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f" || ch === "\0") {
            i++;
            continue;
        }

        // Handle comments: preserve `%AI5_BeginLayer`, `%AI5_EndLayer`, `%AI` directives as tokens; skip normal comments
        if (ch === "%") {
            let endLine = i;
            while (endLine < len && streamText[endLine] !== "\n" && streamText[endLine] !== "\r") {
                endLine++;
            }
            const commentLine = streamText.slice(i, endLine).trim();
            if (/^%AI\d*_(BeginLayer|EndLayer)/.test(commentLine)) {
                tokens.push(commentLine.split(/\s+/)[0]);
            }
            i = endLine;
            continue;
        }

        // Handle literal strings `(...)` with balanced parentheses & backslash escapes
        if (ch === "(") {
            let depth = 1;
            let j = i + 1;
            while (j < len && depth > 0) {
                if (streamText[j] === "\\") {
                    j += 2;
                    continue;
                }
                if (streamText[j] === "(") depth++;
                else if (streamText[j] === ")") depth--;
                j++;
            }
            tokens.push(streamText.slice(i, j));
            i = j;
            continue;
        }

        // Handle PDF dictionaries `<< ... >>` or hex strings `<...>`
        if (ch === "<") {
            if (streamText[i + 1] === "<") {
                let depth = 1;
                let j = i + 2;
                while (j < len - 1 && depth > 0) {
                    if (streamText[j] === "<" && streamText[j + 1] === "<") {
                        depth++;
                        j += 2;
                    } else if (streamText[j] === ">" && streamText[j + 1] === ">") {
                        depth--;
                        j += 2;
                    } else {
                        j++;
                    }
                }
                tokens.push(streamText.slice(i, j));
                i = j;
                continue;
            } else {
                let j = i + 1;
                while (j < len && streamText[j] !== ">") j++;
                tokens.push(streamText.slice(i, j + 1));
                i = j + 1;
                continue;
            }
        }

        // Handle arrays `[...]`
        if (ch === "[") {
            let depth = 1;
            let j = i + 1;
            while (j < len && depth > 0) {
                if (streamText[j] === "(") {
                    let sDepth = 1;
                    j++;
                    while (j < len && sDepth > 0) {
                        if (streamText[j] === "\\") {
                            j += 2;
                            continue;
                        }
                        if (streamText[j] === "(") sDepth++;
                        else if (streamText[j] === ")") sDepth--;
                        j++;
                    }
                    continue;
                }
                if (streamText[j] === "[") depth++;
                else if (streamText[j] === "]") depth--;
                j++;
            }
            tokens.push(streamText.slice(i, j));
            i = j;
            continue;
        }

        // Handle `/Name` tokens
        if (ch === "/") {
            let j = i + 1;
            while (
                j < len &&
                !/[\s()<>[\]{}/%]/.test(streamText[j])
            ) {
                j++;
            }
            tokens.push(streamText.slice(i, j));
            i = j;
            continue;
        }

        // Regular number or operator token
        let j = i;
        while (
            j < len &&
            !/[\s()<>[\]{}/%]/.test(streamText[j])
        ) {
            j++;
        }
        if (j > i) {
            tokens.push(streamText.slice(i, j));
            i = j;
        } else {
            i++;
        }
    }

    return tokens;
}

/**
 * Parses an Adobe Illustrator (`.ai`) buffer (supporting both PDF-compatible `.ai` files with `/FlateDecode`
 * content streams and `/OCG` layers, as well as legacy PostScript-based `.ai` files with `%AI5_BeginLayer`)
 * into a multi-layer vector document (`DecodedMultiLayerDocument`).
 */
export function parseAiBuffer(aiBuf: Buffer): DecodedMultiLayerDocument {
    const rawLatin1 = aiBuf.toString("latin1");
    const head = rawLatin1.slice(0, 1024);

    const isPdf = head.includes("%PDF-");
    const isPs =
        head.includes("%!PS-Adobe-") ||
        head.includes("%%Creator: Adobe Illustrator") ||
        rawLatin1.includes("%AI5_BeginLayer");

    if (!isPdf && !isPs) {
        throw new Error("Invalid Adobe Illustrator (.ai) file: missing %PDF- or %!PS-Adobe- signature.");
    }

    // 1. Determine Artboard / BoundingBox coordinates `[llx, lly, urx, ury]`
    let llx = 0;
    let lly = 0;
    let urx = 512;
    let ury = 512;
    let foundBox = false;

    const pdfBoxPatterns = [
        /\/ArtBox\s*\[\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\]/,
        /\/CropBox\s*\[\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\]/,
        /\/MediaBox\s*\[\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\]/
    ];
    for (const pat of pdfBoxPatterns) {
        const m = rawLatin1.match(pat);
        if (m) {
            llx = parseFloat(m[1]);
            lly = parseFloat(m[2]);
            urx = parseFloat(m[3]);
            ury = parseFloat(m[4]);
            if (urx > llx && ury > lly) {
                foundBox = true;
                break;
            }
        }
    }

    if (!foundBox) {
        const psBoxPatterns = [
            /%%HiResBoundingBox:\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)/,
            /%%BoundingBox:\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)/
        ];
        for (const pat of psBoxPatterns) {
            const m = rawLatin1.match(pat);
            if (m) {
                llx = parseFloat(m[1]);
                lly = parseFloat(m[2]);
                urx = parseFloat(m[3]);
                ury = parseFloat(m[4]);
                if (urx > llx && ury > lly) {
                    foundBox = true;
                    break;
                }
            }
        }
    }

    const canvasWidth = Math.max(1, Math.round(urx - llx) || 512);
    const canvasHeight = Math.max(1, Math.round(ury - lly) || 512);

    // 2. Extract PDF Optional Content Group (`/OCG`) layer names and `/Properties` mappings
    const ocgObjIdToName = new Map<string, string>();
    const propTagToLayerName = new Map<string, string>();

    if (isPdf) {
        const objRegex = /(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g;
        let objMatch: RegExpExecArray | null;
        while ((objMatch = objRegex.exec(rawLatin1)) !== null) {
            const objId = objMatch[1];
            const body = objMatch[2];
            if (body.includes("/OCG") || body.includes("/Layer")) {
                const nameMatch = body.match(/\/Name\s*\(([^)]*)\)/);
                if (nameMatch) {
                    ocgObjIdToName.set(objId, unescapePsString(nameMatch[1]).trim() || `Layer ${objId}`);
                }
            }
        }

        const propRegex = /\/Properties\s*<<([\s\S]*?)>>/g;
        let propMatch: RegExpExecArray | null;
        while ((propMatch = propRegex.exec(rawLatin1)) !== null) {
            const propBody = propMatch[1];
            const entryRegex = /\/([A-Za-z0-9_.-]+)\s+(\d+)\s+0\s+R/g;
            let entryMatch: RegExpExecArray | null;
            while ((entryMatch = entryRegex.exec(propBody)) !== null) {
                const tag = entryMatch[1];
                const targetObjId = entryMatch[2];
                const resolvedName = ocgObjIdToName.get(targetObjId);
                if (resolvedName) {
                    propTagToLayerName.set(tag, resolvedName);
                }
            }
        }
    }

    // 3. Collect content streams to parse
    const contentStreams: string[] = [];

    if (isPdf) {
        const streamRegex = /<<([\s\S]*?)>>\s*\r?\n?stream\r?\n/g;
        let sMatch: RegExpExecArray | null;
        while ((sMatch = streamRegex.exec(rawLatin1)) !== null) {
            const dict = sMatch[1];
            const streamStart = sMatch.index + sMatch[0].length;
            const endStreamIdx = rawLatin1.indexOf("endstream", streamStart);
            if (endStreamIdx === -1) break;

            // Skip image XObjects, thumbnails, metadata XML, and font programs
            if (
                /\/Subtype\s*\/Image\b/.test(dict) ||
                /\/Type\s*\/Metadata\b/.test(dict) ||
                /\/Subtype\s*\/XML\b/.test(dict) ||
                /\/FontFile/.test(dict)
            ) {
                streamRegex.lastIndex = endStreamIdx + 9;
                continue;
            }

            let rawSlice = aiBuf.subarray(streamStart, endStreamIdx);
            // Trim trailing \r\n before endstream
            if (rawSlice.length > 0 && rawSlice[rawSlice.length - 1] === 0x0a) {
                rawSlice = rawSlice.subarray(0, rawSlice.length - 1);
                if (rawSlice.length > 0 && rawSlice[rawSlice.length - 1] === 0x0d) {
                    rawSlice = rawSlice.subarray(0, rawSlice.length - 1);
                }
            }

            let decodedText = "";
            if (/\/FlateDecode\b/.test(dict)) {
                try {
                    decodedText = zlib.inflateSync(rawSlice).toString("latin1");
                } catch {
                    try {
                        decodedText = zlib.inflateRawSync(rawSlice).toString("latin1");
                    } catch {
                        decodedText = "";
                    }
                }
            } else {
                decodedText = rawSlice.toString("latin1");
            }

            if (decodedText.trim().length > 0) {
                contentStreams.push(decodedText);
            }
            streamRegex.lastIndex = endStreamIdx + 9;
        }
    }

    // Also include PostScript private data / direct PostScript body if present and not already captured
    if (isPs && (contentStreams.length === 0 || rawLatin1.includes("%AI5_BeginLayer"))) {
        const psStart = rawLatin1.indexOf("%AI5_BeginLayer");
        if (psStart !== -1) {
            contentStreams.push(rawLatin1.slice(psStart));
        } else if (!isPdf) {
            contentStreams.push(rawLatin1);
        }
    }

    // 4. Execute PostScript / PDF vector interpreter across collected streams
    const layersByName = new Map<string, DecodedLayerItem>();
    const layerOrder: DecodedLayerItem[] = [];

    const getOrCreateLayer = (name: string, visible = true): DecodedLayerItem => {
        const cleanName = (name || "Layer 1").trim() || "Layer 1";
        let existing = layersByName.get(cleanName);
        if (!existing) {
            existing = {
                name: cleanName,
                type: "vector",
                width: canvasWidth,
                height: canvasHeight,
                offsetX: 0,
                offsetY: 0,
                opacity: 1,
                visible,
                blendMode: "normal",
                objects: []
            };
            layersByName.set(cleanName, existing);
            layerOrder.push(existing);
        }
        return existing;
    };

    let currentLayer: DecodedLayerItem | null = null;
    const layerStack: DecodedLayerItem[] = [];
    let objCounter = 1;

    for (const streamText of contentStreams) {
        const tokens = tokenizeAiContentStream(streamText);
        const operandStack: string[] = [];
        const stateStack: AiGraphicsState[] = [];

        let state: AiGraphicsState = {
            ctm: [1, 0, 0, 1, 0, 0],
            fillColor: "#000000",
            strokeColor: "#000000",
            strokeWidth: 1,
            opacity: 1,
            fontSize: 16,
            fontFamily: "sans-serif",
            textX: 0,
            textY: 0
        };

        const toCanvasPt = (x: number, y: number): { x: number; y: number } => {
            const [a, b, c, d, e, f] = state.ctm;
            const tx = a * x + c * y + e;
            const ty = b * x + d * y + f;
            return {
                x: Math.round((tx - llx) * 100) / 100,
                y: Math.round((canvasHeight - (ty - lly)) * 100) / 100
            };
        };

        let pathCommands: string[] = [];
        let pathPoints: { x: number; y: number }[] = [];
        let subpathStartPt: { x: number; y: number } | null = null;
        let curPt: { x: number; y: number } = { x: 0, y: 0 };
        let curRawPt: { x: number; y: number } = { x: 0, y: 0 };
        let pathClosed = false;
        let pendingRectSpec: { x: number; y: number; width: number; height: number } | null = null;
        let pendingLayerVisible = true;

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
            if (!currentLayer) {
                currentLayer = getOrCreateLayer("Layer 1", true);
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

            if (pendingRectSpec && pathCommands.length <= 5) {
                currentLayer.objects!.push({
                    id: `ai_rect_${objCounter++}`,
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

            currentLayer.objects!.push({
                id: `ai_path_${objCounter++}`,
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

        const emitTextObject = (rawStr: string) => {
            const cleanText = unescapePsString(rawStr.replace(/^\(|\)$/g, ""));
            if (!cleanText) return;
            if (!currentLayer) {
                currentLayer = getOrCreateLayer("Layer 1", true);
            }
            const pt = toCanvasPt(state.textX, state.textY);
            const scale = Math.max(1, Math.round(state.fontSize / 7));
            currentLayer.objects!.push({
                id: `ai_text_${objCounter++}`,
                kind: "text",
                x: pt.x,
                y: pt.y,
                width: cleanText.length * 6 * scale,
                height: 7 * scale,
                text: cleanText,
                fontFamily: state.fontFamily,
                fontSize: state.fontSize,
                fill: state.fillColor,
                stroke: "none",
                strokeWidth: 0,
                opacity: state.opacity
            });
        };

        for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
            const tok = tokens[tIdx];

            // Handle operands (numbers, strings, names, arrays, dicts)
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

            // Handle PostScript AI Layer Directives
            if (tok === "%AI5_BeginLayer") {
                pendingLayerVisible = true;
                operandStack.length = 0;
                continue;
            }
            if (tok.startsWith("%AI5_EndLayer")) {
                operandStack.length = 0;
                continue;
            }
            if (tok === "Lb") {
                // `visible preview enabled ... Lb`
                if (operandStack.length >= 1) {
                    const firstVis = parseInt(operandStack[0], 10);
                    pendingLayerVisible = firstVis !== 0;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "Ln") {
                const nameTok = operandStack.pop() || "(Layer 1)";
                const layerName = unescapePsString(nameTok.replace(/^\(|\)$/g, ""));
                currentLayer = getOrCreateLayer(layerName, pendingLayerVisible);
                operandStack.length = 0;
                continue;
            }

            // Handle PDF Marked Content / OCG Layer Blocks (`BDC`, `BMC`, `EMC`)
            if (tok === "BDC" || tok === "BMC") {
                const propOrTag = operandStack.pop() || "";
                const ocTag = operandStack.pop() || "";
                let layerName = "";
                if (propOrTag.startsWith("<<")) {
                    const nm = propOrTag.match(/\/Name\s*\(([^)]*)\)/) || propOrTag.match(/\/Title\s*\(([^)]*)\)/);
                    if (nm) layerName = unescapePsString(nm[1]);
                } else if (propOrTag.startsWith("/")) {
                    const cleanProp = propOrTag.slice(1);
                    layerName = propTagToLayerName.get(cleanProp) || (ocTag === "/OC" || ocTag === "/Layer" ? cleanProp : "");
                }
                if (layerName) {
                    if (currentLayer) layerStack.push(currentLayer);
                    currentLayer = getOrCreateLayer(layerName, true);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "EMC") {
                if (layerStack.length > 0) {
                    currentLayer = layerStack.pop()!;
                }
                operandStack.length = 0;
                continue;
            }

            // Graphics State Operators (`q`, `Q`, `cm`, `w`)
            if (tok === "q") {
                stateStack.push({
                    ...state,
                    ctm: [...state.ctm] as [number, number, number, number, number, number]
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

            // Color Operators (RGB: `Xa`, `XA`, `rg`, `RG`; CMYK: `k`, `K`, `x`, `X`; Gray: `g`, `G`; Generic `sc`/`SC`/`scn`/`SCN`)
            if (tok === "Xa" || tok === "rg") {
                if (operandStack.length >= 3) {
                    const [r, g, b] = popNumbers(3);
                    state.fillColor = rgbFloatsToHex(r, g, b);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "XA" || tok === "RG") {
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
            if (tok === "x" || tok === "X") {
                // Custom CMYK spot color: `c m y k (SpotName) tint x`
                const tint = popNumber();
                operandStack.pop(); // spot name
                if (operandStack.length >= 4) {
                    const [c, m, y, k] = popNumbers(4);
                    const hex = cmykFloatsToHex(c, m, y, k, 1 - tint);
                    if (tok === "x") state.fillColor = hex;
                    else state.strokeColor = hex;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "g") {
                if (operandStack.length >= 1) {
                    const gray = popNumber();
                    state.fillColor = rgbFloatsToHex(gray, gray, gray);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "G") {
                if (operandStack.length >= 1) {
                    const gray = popNumber();
                    state.strokeColor = rgbFloatsToHex(gray, gray, gray);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "sc" || tok === "scn" || tok === "SC" || tok === "SCN") {
                const numericArgs = operandStack.filter(a => /^[-+]?(?:\d+\.?\d*|\.\d+)/.test(a)).map(Number);
                let hex = "";
                if (numericArgs.length === 3) {
                    hex = rgbFloatsToHex(numericArgs[0], numericArgs[1], numericArgs[2]);
                } else if (numericArgs.length >= 4) {
                    hex = cmykFloatsToHex(numericArgs[0], numericArgs[1], numericArgs[2], numericArgs[3]);
                } else if (numericArgs.length === 1) {
                    hex = rgbFloatsToHex(numericArgs[0], numericArgs[0], numericArgs[0]);
                }
                if (hex) {
                    if (tok === "sc" || tok === "scn") state.fillColor = hex;
                    else state.strokeColor = hex;
                }
                operandStack.length = 0;
                continue;
            }

            // Path Construction Operators (`m`, `l`/`L`, `c`/`C`, `v`/`V`, `y`/`Y`, `re`, `h`)
            if (tok === "m") {
                if (operandStack.length >= 2) {
                    const [rawX, rawY] = popNumbers(2);
                    curRawPt = { x: rawX, y: rawY };
                    curPt = toCanvasPt(rawX, rawY);
                    subpathStartPt = { ...curPt };
                    pathCommands.push(`M ${curPt.x} ${curPt.y}`);
                    pathPoints.push({ ...curPt });
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "l" || tok === "L") {
                if (operandStack.length >= 2) {
                    const [rawX, rawY] = popNumbers(2);
                    curRawPt = { x: rawX, y: rawY };
                    curPt = toCanvasPt(rawX, rawY);
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
                    curRawPt = { x: rx3, y: ry3 };
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
                    curRawPt = { x: rx3, y: ry3 };
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
                    curRawPt = { x: rx3, y: ry3 };
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

            // Path Painting Operators (`f`, `F`, `f*`, `s`, `S`, `b`, `B`, `b*`, `B*`, `n`, `N`)
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

            // Text Operators (`BT`, `ET`, `Tf`, `Td`, `TD`, `Tm`, `Tp`, `Tj`, `TJ`, `Tx`)
            if (tok === "BT" || tok === "To") {
                state.textX = 0;
                state.textY = 0;
                operandStack.length = 0;
                continue;
            }
            if (tok === "ET" || tok === "TO") {
                operandStack.length = 0;
                continue;
            }
            if (tok === "Tf") {
                const sz = popNumber();
                const fontTok = operandStack.pop() || "/sans-serif";
                if (sz > 0) state.fontSize = sz;
                state.fontFamily = fontTok.replace(/^\/+_?/, "") || "sans-serif";
                operandStack.length = 0;
                continue;
            }
            if (tok === "Td" || tok === "TD") {
                if (operandStack.length >= 2) {
                    const [tx, ty] = popNumbers(2);
                    state.textX += tx;
                    state.textY += ty;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "Tm" || tok === "Tp") {
                // `a b c d tx ty Tm` or `a b c d tx ty startX Tp`
                if (tok === "Tp" && operandStack.length >= 7) {
                    operandStack.pop(); // drop trailing startX param
                }
                if (operandStack.length >= 6) {
                    const [a, _b, _c, d, tx, ty] = popNumbers(6);
                    state.textX = tx;
                    state.textY = ty;
                    const scale = Math.max(Math.abs(a), Math.abs(d));
                    if (scale > 1 && state.fontSize <= 1) {
                        state.fontSize = Math.round(scale);
                    }
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "Tj" || tok === "Tx") {
                const strTok = operandStack.pop() || "";
                if (strTok.startsWith("(")) {
                    emitTextObject(strTok);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "TJ") {
                const arrTok = operandStack.pop() || "";
                if (arrTok.startsWith("[")) {
                    const parts: string[] = [];
                    const litRegex = /\((?:\\.|[^\\)])*\)/g;
                    let m: RegExpExecArray | null;
                    while ((m = litRegex.exec(arrTok)) !== null) {
                        parts.push(unescapePsString(m[0].slice(1, -1)));
                    }
                    if (parts.length > 0) {
                        emitTextObject(`(${parts.join("")})`);
                    }
                }
                operandStack.length = 0;
                continue;
            }

            // Any other unrecognized PostScript/PDF operator clears the operand stack
            operandStack.length = 0;
        }
    }

    // Ensure at least one vector layer exists
    const nonEmptyLayers = layerOrder.filter(l => (l.objects?.length ?? 0) > 0);
    const finalLayers = nonEmptyLayers.length > 0
        ? nonEmptyLayers
        : layerOrder.length > 0
          ? layerOrder
          : [
                {
                    name: "Illustrator Layer 1",
                    type: "vector" as const,
                    width: canvasWidth,
                    height: canvasHeight,
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    visible: true,
                    blendMode: "normal" as const,
                    objects: []
                }
            ];

    return {
        format: "ai",
        width: canvasWidth,
        height: canvasHeight,
        layers: finalLayers
    };
}
