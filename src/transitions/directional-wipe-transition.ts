import type { RasterBlendPreset } from "./transition-types.js";

export const DIRECTIONAL_WIPE_TRANSITION: RasterBlendPreset = {
    id: "directional_wipe",
    name: "Directional Horizontal Wipe",
    category: "Wipe & Sweep",
    description: "Sweeps Keyframe B across Keyframe A from left to right with a smooth feathered edge.",
    builtIn: true,
    code: `// Directional Horizontal Wipe (Left -> Right)
const k = helpers.clamp01(t);
const feather = 0.12;
const invW = width > 1 ? 1 / (width - 1) : 1;
for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
        const u = x * invW;
        const mask = helpers.smoothstep(u - feather, u + feather, k * (1 + feather * 2) - feather);
        const inv = 1 - mask;
        const i = rowOffset + x * 4;
        outBuf[i]     = helpers.clamp255(bufA[i]     * inv + bufB[i]     * mask);
        outBuf[i + 1] = helpers.clamp255(bufA[i + 1] * inv + bufB[i + 1] * mask);
        outBuf[i + 2] = helpers.clamp255(bufA[i + 2] * inv + bufB[i + 2] * mask);
        outBuf[i + 3] = helpers.clamp255(bufA[i + 3] * inv + bufB[i + 3] * mask);
    }
}`
};
