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

    const bytesPerPixel = Math.max(2, Math.floor(bpp / 8));
    const rowStride = Math.floor((width * bpp + 31) / 32) * 4;
    const rgba = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y++) {
        const srcRow = topDown ? y : height - 1 - y;
        const rowOffset = pixelDataOffset + srcRow * rowStride;
        for (let x = 0; x < width; x++) {
            const sIdx = rowOffset + x * bytesPerPixel;
            const dIdx = (y * width + x) * 4;
            if (bpp === 16) {
                const v = bmpBuf.readUInt16LE(sIdx);
                rgba[dIdx] = Math.round(((v >> 11) & 0x1f) * 255 / 31);
                rgba[dIdx + 1] = Math.round(((v >> 5) & 0x3f) * 255 / 63);
                rgba[dIdx + 2] = Math.round((v & 0x1f) * 255 / 31);
                rgba[dIdx + 3] = 255;
            } else {
                rgba[dIdx] = bmpBuf[sIdx + 2] || 0;
                rgba[dIdx + 1] = bmpBuf[sIdx + 1] || 0;
                rgba[dIdx + 2] = bmpBuf[sIdx] || 0;
                rgba[dIdx + 3] = bytesPerPixel >= 4 ? (bmpBuf[sIdx + 3] ?? 255) : 255;
            }
        }
    }

    return { width, height, rgba };
}

