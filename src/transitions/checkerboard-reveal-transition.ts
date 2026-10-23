import type { RasterBlendPreset } from "./transition-types.js";

export const CHECKERBOARD_REVEAL_TRANSITION: RasterBlendPreset = {
    id: "checkerboard_reveal",
    name: "Checkerboard Tile Reveal",
    category: "Iris & Geometric",
    description: "Staggers square checkerboard tiles across the canvas to flip from Keyframe A to Keyframe B.",
    builtIn: true,
    code: `// Checkerboard Staggered Tile Reveal
const k = helpers.clamp01(t);
const tile = Math.max(8, Math.round(Math.min(width, height) / 8));
for (let y = 0; y < height; y++) {
    const gy = Math.floor(y / tile);
    for (let x = 0; x < width; x++) {
        const gx = Math.floor(x / tile);
        const phase = ((gx + gy) & 1) * 0.35 + ((x % tile) / tile) * 0.65;
        const mask = helpers.smoothstep(phase - 0.1, phase + 0.1, k * 1.2 - 0.1);
        const inv = 1 - mask;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(bufA[i]     * inv + bufB[i]     * mask);
        outBuf[i + 1] = helpers.clamp255(bufA[i + 1] * inv + bufB[i + 1] * mask);
        outBuf[i + 2] = helpers.clamp255(bufA[i + 2] * inv + bufB[i + 2] * mask);
        outBuf[i + 3] = helpers.clamp255(bufA[i + 3] * inv + bufB[i + 3] * mask);
    }
}`
};
