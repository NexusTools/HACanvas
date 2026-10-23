export interface TgaExportOptions {
    /** Use Truevision Run-Length Encoding (Image Type 10 vs 2). Default false. */
    rle?: boolean;
    /** Origin corner ("top_left" or "bottom_left"). Default "top_left". */
    origin?: "bottom_left" | "top_left";
    /** Bits per pixel (32 = BGRA, 24 = BGR). Default 32. */
    bpp?: 24 | 32;
}

export function encodeRgbaToTga(
    width: number,
    height: number,
    rgba: Buffer,
    options: TgaExportOptions = {}
): Buffer {
    const bpp = options.bpp === 24 ? 24 : 32;
    const bytesPerPixel = bpp === 24 ? 3 : 4;
    const topDown = options.origin !== "bottom_left";
    const useRle = Boolean(options.rle);

    const header = Buffer.alloc(18, 0);
    header[2] = useRle ? 10 : 2; // 10 = RLE True-Color, 2 = Uncompressed True-Color
    header.writeUInt16LE(width, 12);
    header.writeUInt16LE(height, 14);
    header[16] = bpp;
    header[17] = (topDown ? 0x20 : 0x00) | (bpp === 32 ? 0x08 : 0x00);

    const totalPixels = width * height;
    const rawBody = Buffer.alloc(totalPixels * bytesPerPixel);
    for (let y = 0; y < height; y++) {
        const srcRow = topDown ? y : height - 1 - y;
        for (let x = 0; x < width; x++) {
            const srcOff = (srcRow * width + x) * 4;
            const dstOff = (y * width + x) * bytesPerPixel;
            rawBody[dstOff] = rgba[srcOff + 2] || 0;     // B
            rawBody[dstOff + 1] = rgba[srcOff + 1] || 0; // G
            rawBody[dstOff + 2] = rgba[srcOff] || 0;     // R
            if (bytesPerPixel === 4) {
                rawBody[dstOff + 3] = rgba[srcOff + 3] ?? 255; // A
            }
        }
    }

    if (!useRle) {
        return Buffer.concat([header, rawBody]);
    }

    // RLE packet encoding per scanline (never cross scanline boundaries per TGA spec)
    const rleChunks: Buffer[] = [header];
    const pixelsMatch = (idxA: number, idxB: number): boolean => {
        const offA = idxA * bytesPerPixel;
        const offB = idxB * bytesPerPixel;
        for (let c = 0; c < bytesPerPixel; c++) {
            if (rawBody[offA + c] !== rawBody[offB + c]) return false;
        }
        return true;
    };

    for (let y = 0; y < height; y++) {
        const rowStart = y * width;
        const rowEnd = rowStart + width;
        let p = rowStart;
        while (p < rowEnd) {
            let runLen = 1;
            while (p + runLen < rowEnd && runLen < 128 && pixelsMatch(p, p + runLen)) {
                runLen++;
            }
            if (runLen >= 2) {
                const pkt = Buffer.alloc(1 + bytesPerPixel);
                pkt[0] = 0x80 | (runLen - 1);
                rawBody.copy(pkt, 1, p * bytesPerPixel, (p + 1) * bytesPerPixel);
                rleChunks.push(pkt);
                p += runLen;
            } else {
                let rawLen = 1;
                while (
                    p + rawLen < rowEnd &&
                    rawLen < 128 &&
                    !(p + rawLen + 1 < rowEnd && pixelsMatch(p + rawLen, p + rawLen + 1))
                ) {
                    rawLen++;
                }
                const pkt = Buffer.alloc(1 + rawLen * bytesPerPixel);
                pkt[0] = rawLen - 1;
                rawBody.copy(pkt, 1, p * bytesPerPixel, (p + rawLen) * bytesPerPixel);
                rleChunks.push(pkt);
                p += rawLen;
            }
        }
    }

    return Buffer.concat(rleChunks);
}

/**
 * Decodes ZSoft PCX (ported from GIMP `plug-ins/common/file-pcx.c`).
 */
