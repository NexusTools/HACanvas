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

