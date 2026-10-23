import type { RasterBlendPreset } from "./transition-types.js";

export const PIXEL_DISSOLVE_TRANSITION: RasterBlendPreset = {
    id: "pixel_dissolve",
    name: "Deterministic Pixel Dissolve",
    category: "Dissolve & Fade",
    description: "Dissolves individual pixels between Keyframe A and Keyframe B using a deterministic 2D spatial hash.",
    builtIn: true,
    code: `// Deterministic 2D Dither / Pixel Dissolve
const k = helpers.clamp01(t);
for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
        const threshold = helpers.hash2d(x, y);
        const useB = k >= threshold;
        const src = useB ? bufB : bufA;
        const i = rowOffset + x * 4;
        outBuf[i]     = src[i];
        outBuf[i + 1] = src[i + 1];
        outBuf[i + 2] = src[i + 2];
        outBuf[i + 3] = src[i + 3];
    }
}`
};
