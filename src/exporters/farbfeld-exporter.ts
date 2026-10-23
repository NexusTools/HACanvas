export interface FarbfeldExportOptions {
    /** Expand 8-bit channels with linear gamma curve when writing 16-bit BE channels */
    applyGamma?: boolean;
}

export function encodeRgbaToFarbfeld(
    width: number,
    height: number,
    rgba: Buffer,
    options: FarbfeldExportOptions = {}
): Buffer {
    const out = Buffer.alloc(16 + width * height * 8);
    out.write("farbfeld", 0, "ascii");
    out.writeUInt32BE(width, 8);
    out.writeUInt32BE(height, 12);
    let dst = 16;
    const useGamma = Boolean(options.applyGamma);
    for (let i = 0; i < width * height * 4; i++) {
        const v8 = rgba[i] || 0;
        if (useGamma && (i & 3) !== 3) {
            const v16 = Math.min(65535, Math.max(0, Math.round(Math.pow(v8 / 255, 2.2) * 65535)));
            out.writeUInt16BE(v16, dst);
            dst += 2;
        } else {
            out[dst++] = v8;
            out[dst++] = v8;
        }
    }
    return out;
}

/**
 * Supported GIMP Windows Icon (`.ico`) per-layer format bit depths:
 * - `32`: 32 bpp, 8-bit alpha, no palette
 * - `24`: 24 bpp, 1-bit alpha, no palette
 * - `8`:  8 bpp, 1-bit alpha, 256-slot palette
 * - `4`:  4 bpp, 1-bit alpha, 16-slot palette
 * - `1`:  1 bpp, 1-bit alpha, 2-slot palette
 */
