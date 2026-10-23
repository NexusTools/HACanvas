export interface BmpExportOptions {
    /** Bits per pixel: 32 (BGRA), 24 (BGR), or 16 (R5G6B5). Default 32. */
    bpp?: 16 | 24 | 32;
    /** Top-down scanline order (negative height) vs bottom-up. Default true. */
    topDown?: boolean;
    /** Write BITMAPV4HEADER with sRGB color space information. Default false. */
    writeColorSpace?: boolean;
}

export function encodeRgbaToBmp(
    width: number,
    height: number,
    rgba: Buffer,
    options: BmpExportOptions = {}
): Buffer {
    const bpp = options.bpp === 16 || options.bpp === 24 || options.bpp === 32 ? options.bpp : 32;
    const topDown = options.topDown !== false;
    const writeColorSpace = Boolean(options.writeColorSpace);
    const dibHeaderSize = writeColorSpace ? 108 : 40;
    const pixelDataOffset = 14 + dibHeaderSize;
    const rowStride = Math.floor((width * bpp + 31) / 32) * 4;
    const pixelDataSize = rowStride * height;
    const fileSize = pixelDataOffset + pixelDataSize;
    const out = Buffer.alloc(fileSize, 0);

    out.write("BM", 0, "ascii");
    out.writeUInt32LE(fileSize, 2);
    out.writeUInt32LE(0, 6);
    out.writeUInt32LE(pixelDataOffset, 10);

    // DIB Header (40-byte BITMAPINFOHEADER or 108-byte BITMAPV4HEADER)
    out.writeUInt32LE(dibHeaderSize, 14);
    out.writeInt32LE(width, 18);
    out.writeInt32LE(topDown ? -height : height, 22);
    out.writeUInt16LE(1, 26); // planes
    out.writeUInt16LE(bpp, 28);
    out.writeUInt32LE(0, 30); // BI_RGB
    out.writeUInt32LE(pixelDataSize, 34);
    out.writeInt32LE(3780, 38); // ~96 DPI X
    out.writeInt32LE(3780, 42); // ~96 DPI Y
    if (writeColorSpace) {
        out.writeUInt32LE(0x00ff0000, 54); // R mask
        out.writeUInt32LE(0x0000ff00, 58); // G mask
        out.writeUInt32LE(0x000000ff, 62); // B mask
        out.writeUInt32LE(bpp === 32 ? 0xff000000 : 0, 66); // A mask
        out.write("sRGB", 70, "ascii"); // LCS_sRGB
    }

    for (let y = 0; y < height; y++) {
        const srcRow = topDown ? y : height - 1 - y;
        const dstRowStart = pixelDataOffset + y * rowStride;
        for (let x = 0; x < width; x++) {
            const src = (srcRow * width + x) * 4;
            const r = rgba[src] || 0;
            const g = rgba[src + 1] || 0;
            const b = rgba[src + 2] || 0;
            const a = rgba[src + 3] ?? 255;
            if (bpp === 32) {
                const dst = dstRowStart + x * 4;
                out[dst] = b;
                out[dst + 1] = g;
                out[dst + 2] = r;
                out[dst + 3] = a;
            } else if (bpp === 24) {
                const dst = dstRowStart + x * 3;
                out[dst] = b;
                out[dst + 1] = g;
                out[dst + 2] = r;
            } else {
                const dst = dstRowStart + x * 2;
                const r5 = (r >> 3) & 0x1f;
                const g6 = (g >> 2) & 0x3f;
                const b5 = (b >> 3) & 0x1f;
                out.writeUInt16LE((r5 << 11) | (g6 << 5) | b5, dst);
            }
        }
    }
    return out;
}

/**
 * Decodes Truevision TGA (ported from GIMP `plug-ins/common/file-tga.c`: types 1, 2, 3 uncompressed & 9, 10, 11 RLE).
 */
