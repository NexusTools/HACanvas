import type { RasterBlendPreset } from "./transition-types.js";

export const LUMA_WIPE_TRANSITION: RasterBlendPreset = {
    id: "luma_wipe",
    name: "Luminance Threshold Wipe",
    category: "Wipe & Sweep",
    description: "Reveals Keyframe B progressively from bright to dark regions using a soft feathered luminance mask.",
    builtIn: true,
    code: `// Luminance Threshold Wipe
const k = helpers.clamp01(t);
const feather = 0.18;
const total = width * height * 4;
for (let i = 0; i < total; i += 4) {
    const lumaA = helpers.luminance(bufA[i], bufA[i + 1], bufA[i + 2]) / 255;
    const lumaB = helpers.luminance(bufB[i], bufB[i + 1], bufB[i + 2]) / 255;
    const luma = (lumaA + lumaB) * 0.5;
    const mask = helpers.smoothstep(luma - feather, luma + feather, k * (1 + feather * 2) - feather);
    const inv = 1 - mask;
    outBuf[i]     = helpers.clamp255(bufA[i]     * inv + bufB[i]     * mask);
    outBuf[i + 1] = helpers.clamp255(bufA[i + 1] * inv + bufB[i + 1] * mask);
    outBuf[i + 2] = helpers.clamp255(bufA[i + 2] * inv + bufB[i + 2] * mask);
    outBuf[i + 3] = helpers.clamp255(bufA[i + 3] * inv + bufB[i + 3] * mask);
}`
};
