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

