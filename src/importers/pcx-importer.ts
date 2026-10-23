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
