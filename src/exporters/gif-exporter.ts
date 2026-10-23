export interface GifExportOptions {
    /** Loop animation forever via NETSCAPE2.0 extension block (default true) */
    loop?: boolean;
    /** Default delay between frames in milliseconds when not specified on a frame (default 100) */
    defaultDelayMs?: number;
    /** Frame disposal method: "unspecified" (0), "combine" / do not dispose (1), or "replace" / restore background (2) */
    disposal?: "unspecified" | "combine" | "replace";
    /** Apply ordered Bayer dithering when quantizing to the 216-color palette */
    dither?: boolean;
    /** Optional GIF comment block string */
    comment?: string;
}

const BAYER_4X4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
];

export function encodeFramesToAnimatedGif(
    width: number,
    height: number,
    frames: { rgba: Buffer; delayMs?: number }[],
    options: GifExportOptions = {}
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

    if (options.comment && options.comment.trim().length > 0) {
        const msg = Buffer.from(options.comment.trim().slice(0, 250), "ascii");
        chunks.push(Buffer.from([0x21, 0xfe, msg.length]), msg, Buffer.from([0x00]));
    }

    if (options.loop !== false && frames.length > 1) {
        chunks.push(Buffer.from([
            0x21, 0xff, 0x0b,
            0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
            0x03, 0x01, 0x00, 0x00, 0x00
        ]));
    }

    const disposalCode =
        options.disposal === "combine" ? 1 :
        options.disposal === "unspecified" ? 0 : 2;
    const gcePacked = ((disposalCode & 0x07) << 2) | 0x01; // + transparent color flag
    const useDither = Boolean(options.dither);
    const fallbackDelay = options.defaultDelayMs ?? 100;

    for (const frame of frames) {
        const delayCs = Math.max(2, Math.round((frame.delayMs ?? fallbackDelay) / 10));
        const gce = Buffer.from([
            0x21, 0xf9, 0x04,
            gcePacked,
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
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                const off = i * 4;
                if (frame.rgba[off + 3] < 64) {
                    indexed[i] = 255;
                } else {
                    const bias = useDither ? (BAYER_4X4[y & 3][x & 3] - 7.5) * 2.2 : 0;
                    const r = Math.min(255, Math.max(0, frame.rgba[off] + bias));
                    const g = Math.min(255, Math.max(0, frame.rgba[off + 1] + bias));
                    const b = Math.min(255, Math.max(0, frame.rgba[off + 2] + bias));
                    const r6 = Math.round((r * 5) / 255);
                    const g6 = Math.round((g * 5) / 255);
                    const b6 = Math.round((b * 5) / 255);
                    indexed[i] = r6 * 36 + g6 * 6 + b6;
                }
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

