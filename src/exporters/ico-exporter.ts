import { encodeRgbaToPng } from "./png-exporter.js";

export type IcoIconFormatBpp = 1 | 4 | 8 | 24 | 32;

export interface IcoLayerEntryInput {
    layerId?: string;
    name?: string;
    width: number;
    height: number;
    rgba: Buffer;
    /** Bits per pixel for this layer's icon entry (32, 24, 8, 4, or 1). Default 32. */
    bpp?: IcoIconFormatBpp;
    /** Whether to store this icon entry as a compressed PNG stream inside the .ico (GIMP "Compressed (PNG)" checkbox). Default true for >=256px, configurable per layer. */
    compressed?: boolean;
    /** Optional target icon width override (1..256). */
    targetWidth?: number;
    /** Optional target icon height override (1..256). */
    targetHeight?: number;
    /** Alpha threshold (0..255, default 128) for 1-bit AND mask on non-32bpp icons. */
    alphaThreshold?: number;
}

export interface IcoDirectoryEntryInfo {
    index: number;
    width: number;
    height: number;
    colorCount: number;
    planes: number;
    bpp: number;
    byteSize: number;
    dataOffset: number;
    compressedPng: boolean;
}

export function resampleRgbaNearestOrBilinear(
    src: Buffer,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number
): Buffer {
    if (srcW === dstW && srcH === dstH) return Buffer.from(src);
    const out = Buffer.alloc(dstW * dstH * 4);
    for (let y = 0; y < dstH; y++) {
        const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
        for (let x = 0; x < dstW; x++) {
            const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
            const sOff = (sy * srcW + sx) * 4;
            const dOff = (y * dstW + x) * 4;
            out[dOff] = src[sOff];
            out[dOff + 1] = src[sOff + 1];
            out[dOff + 2] = src[sOff + 2];
            out[dOff + 3] = src[sOff + 3];
        }
    }
    return out;
}

function buildAdaptivePaletteForIco(
    rgba: Buffer,
    width: number,
    height: number,
    maxColors: number,
    alphaThreshold: number
): { palette: Array<{ r: number; g: number; b: number }>; indices: Uint8Array; alphaBits: Uint8Array } {
    const total = width * height;
    const indices = new Uint8Array(total);
    const alphaBits = new Uint8Array(total); // 1 = transparent in ICO AND mask, 0 = opaque

    if (maxColors <= 2) {
        const palette = [
            { r: 0, g: 0, b: 0 },
            { r: 255, g: 255, b: 255 }
        ];
        for (let i = 0; i < total; i++) {
            const off = i * 4;
            const a = rgba[off + 3] ?? 255;
            if (a < alphaThreshold) {
                alphaBits[i] = 1;
                indices[i] = 0;
            } else {
                const lum = 0.299 * rgba[off] + 0.587 * rgba[off + 1] + 0.114 * rgba[off + 2];
                indices[i] = lum >= 128 ? 1 : 0;
            }
        }
        return { palette, indices, alphaBits };
    }

    // Collect color popularity histogram (quantized to 5-5-5 bits to cluster similar shades)
    const freqMap = new Map<number, { r: number; g: number; b: number; count: number }>();
    for (let i = 0; i < total; i++) {
        const off = i * 4;
        const a = rgba[off + 3] ?? 255;
        if (a < alphaThreshold) {
            alphaBits[i] = 1;
            continue;
        }
        const r = rgba[off];
        const g = rgba[off + 1];
        const b = rgba[off + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const existing = freqMap.get(key);
        if (existing) {
            existing.count++;
        } else {
            freqMap.set(key, { r, g, b, count: 1 });
        }
    }

    const sortedColors = Array.from(freqMap.values()).sort((a, b) => b.count - a.count);
    const palette: Array<{ r: number; g: number; b: number }> = [{ r: 0, g: 0, b: 0 }];
    for (const c of sortedColors) {
        if (palette.length >= maxColors) break;
        palette.push({ r: c.r, g: c.g, b: c.b });
    }
    while (palette.length < maxColors) {
        const idx = palette.length;
        const v = Math.round((idx * 255) / Math.max(1, maxColors - 1));
        palette.push({ r: v, g: v, b: v });
    }

    // Map each pixel to nearest palette slot
    for (let i = 0; i < total; i++) {
        if (alphaBits[i] === 1) {
            indices[i] = 0;
            continue;
        }
        const off = i * 4;
        const r = rgba[off];
        const g = rgba[off + 1];
        const b = rgba[off + 2];
        let bestSlot = 0;
        let bestDist = Infinity;
        const startSlot = sortedColors.length > 0 && palette.length > 1 ? 1 : 0;
        for (let s = startSlot; s < palette.length; s++) {
            const p = palette[s];
            const dr = r - p.r;
            const dg = g - p.g;
            const db = b - p.b;
            const d = dr * dr + dg * dg + db * db;
            if (d < bestDist) {
                bestDist = d;
                bestSlot = s;
                if (d === 0) break;
            }
        }
        indices[i] = bestSlot;
    }

    return { palette, indices, alphaBits };
}

function encodeSingleIcoEntry(entry: IcoLayerEntryInput): {
    width: number;
    height: number;
    bpp: IcoIconFormatBpp;
    colorCount: number;
    payload: Buffer;
} {
    const rawW = entry.targetWidth || entry.width || 32;
    const rawH = entry.targetHeight || entry.height || 32;
    const w = Math.max(1, Math.min(256, Math.round(rawW)));
    const h = Math.max(1, Math.min(256, Math.round(rawH)));
    const bpp: IcoIconFormatBpp =
        entry.bpp === 1 || entry.bpp === 4 || entry.bpp === 8 || entry.bpp === 24 || entry.bpp === 32
            ? entry.bpp
            : 32;
    const alphaThreshold = entry.alphaThreshold ?? 128;
    const compressed = entry.compressed !== undefined ? Boolean(entry.compressed) : false;

    const scaledRgba = resampleRgbaNearestOrBilinear(entry.rgba, entry.width, entry.height, w, h);

    if (compressed) {
        // When compressed (PNG-in-ICO) is enabled, still honor the user's chosen bit-depth/alpha quantizer visually
        let pngRgba = scaledRgba;
        if (bpp !== 32) {
            pngRgba = Buffer.from(scaledRgba);
            if (bpp === 24) {
                for (let i = 0; i < w * h * 4; i += 4) {
                    pngRgba[i + 3] = pngRgba[i + 3] < alphaThreshold ? 0 : 255;
                }
            } else {
                const maxColors = 1 << bpp;
                const quant = buildAdaptivePaletteForIco(pngRgba, w, h, maxColors, alphaThreshold);
                for (let i = 0; i < w * h; i++) {
                    const off = i * 4;
                    if (quant.alphaBits[i] === 1) {
                        pngRgba[off] = 0;
                        pngRgba[off + 1] = 0;
                        pngRgba[off + 2] = 0;
                        pngRgba[off + 3] = 0;
                    } else {
                        const c = quant.palette[quant.indices[i]] || { r: 0, g: 0, b: 0 };
                        pngRgba[off] = c.r;
                        pngRgba[off + 1] = c.g;
                        pngRgba[off + 2] = c.b;
                        pngRgba[off + 3] = 255;
                    }
                }
            }
        }
        const pngPayload = encodeRgbaToPng(w, h, pngRgba);
        return {
            width: w,
            height: h,
            bpp,
            colorCount: bpp === 4 ? 16 : bpp === 1 ? 2 : 0,
            payload: pngPayload
        };
    }

    // Standard Windows ICO DIB (BITMAPINFOHEADER + Palette + Bottom-Up XOR Mask + Bottom-Up 1-bit AND Mask)
    const andRowStride = Math.floor((w + 31) / 32) * 4;
    const andMask = Buffer.alloc(andRowStride * h, 0);
    for (let y = 0; y < h; y++) {
        const srcRow = h - 1 - y;
        for (let x = 0; x < w; x++) {
            const a = scaledRgba[(srcRow * w + x) * 4 + 3] ?? 255;
            if (a < alphaThreshold) {
                andMask[y * andRowStride + (x >> 3)] |= 1 << (7 - (x & 7));
            }
        }
    }

    const xorRowStride = Math.floor((w * bpp + 31) / 32) * 4;
    const xorMask = Buffer.alloc(xorRowStride * h, 0);
    let paletteBuf = Buffer.alloc(0);

    if (bpp === 32) {
        for (let y = 0; y < h; y++) {
            const srcRow = h - 1 - y;
            const dstRowStart = y * xorRowStride;
            for (let x = 0; x < w; x++) {
                const sIdx = (srcRow * w + x) * 4;
                const dIdx = dstRowStart + x * 4;
                xorMask[dIdx] = scaledRgba[sIdx + 2];     // B
                xorMask[dIdx + 1] = scaledRgba[sIdx + 1]; // G
                xorMask[dIdx + 2] = scaledRgba[sIdx];     // R
                xorMask[dIdx + 3] = scaledRgba[sIdx + 3]; // A
            }
        }
    } else if (bpp === 24) {
        for (let y = 0; y < h; y++) {
            const srcRow = h - 1 - y;
            const dstRowStart = y * xorRowStride;
            for (let x = 0; x < w; x++) {
                const sIdx = (srcRow * w + x) * 4;
                const a = scaledRgba[sIdx + 3] ?? 255;
                if (a >= alphaThreshold) {
                    const dIdx = dstRowStart + x * 3;
                    xorMask[dIdx] = scaledRgba[sIdx + 2];     // B
                    xorMask[dIdx + 1] = scaledRgba[sIdx + 1]; // G
                    xorMask[dIdx + 2] = scaledRgba[sIdx];     // R
                }
            }
        }
    } else {
        const numColors = 1 << bpp;
        const quant = buildAdaptivePaletteForIco(scaledRgba, w, h, numColors, alphaThreshold);
        paletteBuf = Buffer.alloc(numColors * 4, 0);
        for (let i = 0; i < numColors; i++) {
            const c = quant.palette[i] || { r: 0, g: 0, b: 0 };
            paletteBuf[i * 4] = c.b;
            paletteBuf[i * 4 + 1] = c.g;
            paletteBuf[i * 4 + 2] = c.r;
            paletteBuf[i * 4 + 3] = 0;
        }
        for (let y = 0; y < h; y++) {
            const srcRow = h - 1 - y;
            const dstRowStart = y * xorRowStride;
            for (let x = 0; x < w; x++) {
                const pIdx = quant.indices[srcRow * w + x] || 0;
                if (bpp === 8) {
                    xorMask[dstRowStart + x] = pIdx & 0xff;
                } else if (bpp === 4) {
                    const byteOff = dstRowStart + (x >> 1);
                    if ((x & 1) === 0) {
                        xorMask[byteOff] |= (pIdx & 0x0f) << 4;
                    } else {
                        xorMask[byteOff] |= pIdx & 0x0f;
                    }
                } else if (bpp === 1) {
                    if (pIdx & 1) {
                        xorMask[dstRowStart + (x >> 3)] |= 1 << (7 - (x & 7));
                    }
                }
            }
        }
    }

    const dibHeader = Buffer.alloc(40, 0);
    dibHeader.writeUInt32LE(40, 0);
    dibHeader.writeInt32LE(w, 4);
    dibHeader.writeInt32LE(h * 2, 8); // doubled height for XOR + AND masks
    dibHeader.writeUInt16LE(1, 12);   // planes
    dibHeader.writeUInt16LE(bpp, 14);
    dibHeader.writeUInt32LE(0, 16);   // BI_RGB
    dibHeader.writeUInt32LE(xorMask.length + andMask.length, 20);
    if (bpp <= 8) {
        dibHeader.writeUInt32LE(1 << bpp, 32);
    }

    const payload = Buffer.concat([dibHeader, paletteBuf, xorMask, andMask]);
    return {
        width: w,
        height: h,
        bpp,
        colorCount: bpp === 4 ? 16 : bpp === 1 ? 2 : 0,
        payload
    };
}

/**
 * Encodes multiple canvas layers into a multi-icon Windows `.ico` file (ported from GIMP `plug-ins/file-ico/ico-save.c`).
 * Each layer is stored as its own `ICONDIRENTRY` in the `.ico` directory with its configured bit depth (`1|4|8|24|32` bpp)
 * and compression mode (`compressed: true` PNG stream vs `compressed: false` DIB bitmap + AND/XOR masks).
 */
export function encodeLayersToIco(entries: IcoLayerEntryInput[]): Buffer {
    if (!entries || entries.length === 0) {
        throw new Error("encodeLayersToIco requires at least 1 icon layer entry.");
    }
    const encodedEntries = entries.map(e => encodeSingleIcoEntry(e));
    const count = encodedEntries.length;
    const dirHeaderSize = 6 + count * 16;
    const dirBuf = Buffer.alloc(dirHeaderSize, 0);

    dirBuf.writeUInt16LE(0, 0);     // idReserved = 0
    dirBuf.writeUInt16LE(1, 2);     // idType = 1 (ICO)
    dirBuf.writeUInt16LE(count, 4); // idCount

    let currentOffset = dirHeaderSize;
    encodedEntries.forEach((enc, idx) => {
        const entryOff = 6 + idx * 16;
        dirBuf[entryOff] = enc.width >= 256 ? 0 : enc.width;
        dirBuf[entryOff + 1] = enc.height >= 256 ? 0 : enc.height;
        dirBuf[entryOff + 2] = enc.colorCount;
        dirBuf[entryOff + 3] = 0; // reserved
        dirBuf.writeUInt16LE(1, entryOff + 4); // color planes
        dirBuf.writeUInt16LE(enc.bpp, entryOff + 6); // bits per pixel
        dirBuf.writeUInt32LE(enc.payload.length, entryOff + 8);
        dirBuf.writeUInt32LE(currentOffset, entryOff + 12);
        currentOffset += enc.payload.length;
    });

    return Buffer.concat([dirBuf, ...encodedEntries.map(e => e.payload)]);
}

/**
 * Inspects a Windows `.ico` or `.cur` binary Buffer and returns metadata for every icon directory entry.
 */

export function encodeRgbaToIco(
    width: number,
    height: number,
    rgba: Buffer,
    options: { bpp?: IcoIconFormatBpp; compressed?: boolean } = {}
): Buffer {
    return encodeLayersToIco([
        {
            width,
            height,
            rgba,
            bpp: options.bpp ?? 32,
            compressed: options.compressed ?? true
        }
    ]);
}

/**
 * Decodes XBM (`plug-ins/common/file-xbm.c`).
 */
