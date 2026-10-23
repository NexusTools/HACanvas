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

