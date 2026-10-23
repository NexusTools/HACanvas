import type { RasterBlendPreset } from "./transition-types.js";

export const CHROMATIC_MORPH_TRANSITION: RasterBlendPreset = {
    id: "chromatic_morph",
    name: "Chromatic RGB Phase Blend",
    category: "Light & Chromatic",
    description: "Staggers Red, Green, and Blue channel transition curves for a prismatic chromatic shift.",
    builtIn: true,
    code: `// Chromatic RGB Phase Offset Blend
const k = helpers.clamp01(t);
const tR = helpers.clamp01(k * 1.25);
const tG = k;
const tB = helpers.clamp01((k - 0.2) * 1.25);
const total = width * height * 4;
for (let i = 0; i < total; i += 4) {
    outBuf[i]     = helpers.clamp255(bufA[i]     * (1 - tR) + bufB[i]     * tR);
    outBuf[i + 1] = helpers.clamp255(bufA[i + 1] * (1 - tG) + bufB[i + 1] * tG);
    outBuf[i + 2] = helpers.clamp255(bufA[i + 2] * (1 - tB) + bufB[i + 2] * tB);
    outBuf[i + 3] = helpers.clamp255(bufA[i + 3] * (1 - k)  + bufB[i + 3] * k);
}`
};
