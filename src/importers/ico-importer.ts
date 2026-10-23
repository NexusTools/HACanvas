import path from "node:path";
import type { DecodedLayerItem, DecodedMultiLayerDocument } from "../types/document-metadata-types.js";
import type { IcoDirectoryEntryInfo, IcoIconFormatBpp } from "../exporters/ico-exporter.js";
import { decodePngToRgba } from "./png-importer.js";

export function inspectIcoBuffer(icoBuf: Buffer): IcoDirectoryEntryInfo[] {
    if (icoBuf.length < 6 || icoBuf.readUInt16LE(0) !== 0) {
        throw new Error("Invalid ICO header.");
    }
    const count = icoBuf.readUInt16LE(4);
    const out: IcoDirectoryEntryInfo[] = [];
    for (let i = 0; i < count; i++) {
        const entryOff = 6 + i * 16;
        if (entryOff + 16 > icoBuf.length) break;
        const w = icoBuf[entryOff] || 256;
        const h = icoBuf[entryOff + 1] || 256;
        const colorCount = icoBuf[entryOff + 2];
        const planes = icoBuf.readUInt16LE(entryOff + 4);
        const bpp = icoBuf.readUInt16LE(entryOff + 6);
        const byteSize = icoBuf.readUInt32LE(entryOff + 8);
        const dataOffset = icoBuf.readUInt32LE(entryOff + 12);
        const isPng =
            dataOffset + 4 <= icoBuf.length &&
            icoBuf[dataOffset] === 137 &&
            icoBuf[dataOffset + 1] === 80 &&
            icoBuf[dataOffset + 2] === 78 &&
            icoBuf[dataOffset + 3] === 71;
        out.push({
            index: i,
            width: w,
            height: h,
            colorCount,
            planes,
            bpp: bpp || 32,
            byteSize,
            dataOffset,
            compressedPng: isPng
        });
    }
    return out;
}

function decodeSingleIcoEntrySlice(slice: Buffer): { width: number; height: number; bpp: number; rgba: Buffer } {
    if (slice.length >= 8 && slice[0] === 137 && slice[1] === 80 && slice[2] === 78 && slice[3] === 71) {
        const decoded = decodePngToRgba(slice);
        return { ...decoded, bpp: 32 };
    }

    // DIB BITMAPINFOHEADER inside ICO (height is doubled for XOR + AND masks)
    const hdrSize = slice.readUInt32LE(0);
    const dibW = slice.readInt32LE(4);
    const dibH = Math.max(1, Math.floor(Math.abs(slice.readInt32LE(8)) / 2));
    const bpp = slice.readUInt16LE(14) || 32;
    const clrUsed = slice.readUInt32LE(32);
    const paletteEntries = bpp <= 8 ? (clrUsed > 0 ? clrUsed : 1 << bpp) : 0;
    const paletteOffset = hdrSize;
    const xorOffset = paletteOffset + paletteEntries * 4;
    const xorRowStride = Math.floor((dibW * bpp + 31) / 32) * 4;
    const andOffset = xorOffset + xorRowStride * dibH;
    const andRowStride = Math.floor((dibW + 31) / 32) * 4;
    const rgba = Buffer.alloc(dibW * dibH * 4);

    for (let y = 0; y < dibH; y++) {
        const srcRow = dibH - 1 - y;
        const xorRowOff = xorOffset + srcRow * xorRowStride;
        const andRowOff = andOffset + srcRow * andRowStride;
        for (let x = 0; x < dibW; x++) {
            const dIdx = (y * dibW + x) * 4;
            const andBit =
                andRowOff + (x >> 3) < slice.length
                    ? (slice[andRowOff + (x >> 3)] >> (7 - (x & 7))) & 1
                    : 0;
            if (bpp === 32) {
                const sIdx = xorRowOff + x * 4;
                rgba[dIdx] = slice[sIdx + 2] || 0;
                rgba[dIdx + 1] = slice[sIdx + 1] || 0;
                rgba[dIdx + 2] = slice[sIdx] || 0;
                const alpha = slice[sIdx + 3] ?? 255;
                rgba[dIdx + 3] = alpha === 0 && andBit === 1 ? 0 : alpha;
            } else if (bpp === 24) {
                const sIdx = xorRowOff + x * 3;
                rgba[dIdx] = slice[sIdx + 2] || 0;
                rgba[dIdx + 1] = slice[sIdx + 1] || 0;
                rgba[dIdx + 2] = slice[sIdx] || 0;
                rgba[dIdx + 3] = andBit === 1 ? 0 : 255;
            } else {
                let palIdx = 0;
                if (bpp === 8) {
                    palIdx = slice[xorRowOff + x] || 0;
                } else if (bpp === 4) {
                    const byteVal = slice[xorRowOff + (x >> 1)] || 0;
                    palIdx = (x & 1) === 0 ? (byteVal >> 4) & 0x0f : byteVal & 0x0f;
                } else if (bpp === 1) {
                    const byteVal = slice[xorRowOff + (x >> 3)] || 0;
                    palIdx = (byteVal >> (7 - (x & 7))) & 1;
                }
                const pOff = paletteOffset + palIdx * 4;
                rgba[dIdx] = slice[pOff + 2] || 0;
                rgba[dIdx + 1] = slice[pOff + 1] || 0;
                rgba[dIdx + 2] = slice[pOff] || 0;
                rgba[dIdx + 3] = andBit === 1 ? 0 : 255;
            }
        }
    }
    return { width: dibW, height: dibH, bpp, rgba };
}

/**
 * Decodes all icon entries in a Windows `.ico` / `.cur` file into separate layers of a `DecodedMultiLayerDocument`
 * (matching GIMP's `file-ico` behavior where each icon resource is a layer).
 */
export function decodeIcoToLayers(icoBuf: Buffer, filePath?: string): DecodedMultiLayerDocument {
    const entries = inspectIcoBuffer(icoBuf);
    if (entries.length === 0) {
        throw new Error("ICO file contains no icon entries.");
    }
    let maxW = 1;
    let maxH = 1;
    const decodedList = entries.map((e, idx) => {
        const slice = icoBuf.subarray(e.dataOffset, e.dataOffset + e.byteSize);
        const dec = decodeSingleIcoEntrySlice(slice);
        if (dec.width > maxW) maxW = dec.width;
        if (dec.height > maxH) maxH = dec.height;
        return {
            entry: e,
            index: idx,
            ...dec
        };
    });

    const baseName = filePath ? path.basename(filePath, path.extname(filePath)) : "Icon";
    const layers: DecodedLayerItem[] = decodedList.map(item => ({
        name:
            decodedList.length === 1 && filePath
                ? path.basename(filePath)
                : `${baseName} #${item.index + 1} (${item.width}x${item.height}, ${item.entry.bpp || item.bpp}bpp${item.entry.compressedPng ? " PNG" : ""})`,
        type: "raster",
        width: item.width,
        height: item.height,
        offsetX: 0,
        offsetY: 0,
        opacity: 1,
        visible: true,
        blendMode: "normal",
        rgba: item.rgba
    }));

    return {
        format: "ico",
        width: maxW,
        height: maxH,
        layers
    };
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
    const decoded = decodeSingleIcoEntrySlice(slice);
    return { width: decoded.width, height: decoded.height, rgba: decoded.rgba };
}

