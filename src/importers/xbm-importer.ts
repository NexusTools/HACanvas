export function decodeXbmToRgba(xbmStr: string): { width: number; height: number; rgba: Buffer } {
    const wMatch = xbmStr.match(/#define\s+\S+_width\s+(\d+)/);
    const hMatch = xbmStr.match(/#define\s+\S+_height\s+(\d+)/);
    const width = wMatch ? parseInt(wMatch[1], 10) : 16;
    const height = hMatch ? parseInt(hMatch[1], 10) : 16;
    const bodyMatch = xbmStr.match(/\{([\s\S]*?)\}/);
    const hexTokens = bodyMatch ? bodyMatch[1].match(/0x[0-9a-fA-F]+|\d+/g) || [] : [];
    const bytes = hexTokens.map(t => (t.startsWith("0x") ? parseInt(t, 16) : parseInt(t, 10)));

    const rgba = Buffer.alloc(width * height * 4);
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const b = bytes[y * rowBytes + (x >> 3)] || 0;
            const bit = (b >> (x & 7)) & 1;
            const c = bit ? 0 : 255;
            const dIdx = (y * width + x) * 4;
            rgba[dIdx] = c;
            rgba[dIdx + 1] = c;
            rgba[dIdx + 2] = c;
            rgba[dIdx + 3] = 255;
        }
    }
    return { width, height, rgba };
}

/**
 * Decodes OpenRaster (`.ora`, ported from GIMP `plug-ins/python/file-openraster.py`).
 */
