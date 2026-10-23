import type { RasterBlendPreset } from "./transition-types.js";

export const CROSSFADE_TRANSITION: RasterBlendPreset = {
    id: "crossfade",
    name: "Crossfade (Smooth Alpha Dissolve)",
    category: "Dissolve & Fade",
    description: "Smoothly cross-dissolves RGBA channels between Keyframe A and Keyframe B using premultiplied-aware interpolation.",
    builtIn: true,
    code: `// Crossfade (Smooth Alpha Dissolve)
// Parameters: bufA, bufB, outBuf, width, height, t, rawT, helpers, gimp, gegl
const k = helpers.clamp01(t);
const inv = 1 - k;
const total = width * height * 4;
for (let i = 0; i < total; i += 4) {
    const a0 = bufA[i + 3] / 255;
    const a1 = bufB[i + 3] / 255;
    const outA = a0 * inv + a1 * k;
    if (outA <= 1e-5) {
        outBuf[i] = 0;
        outBuf[i + 1] = 0;
        outBuf[i + 2] = 0;
        outBuf[i + 3] = 0;
    } else {
        outBuf[i]     = helpers.clamp255((bufA[i]     * a0 * inv + bufB[i]     * a1 * k) / outA);
        outBuf[i + 1] = helpers.clamp255((bufA[i + 1] * a0 * inv + bufB[i + 1] * a1 * k) / outA);
        outBuf[i + 2] = helpers.clamp255((bufA[i + 2] * a0 * inv + bufB[i + 2] * a1 * k) / outA);
        outBuf[i + 3] = helpers.clamp255(outA * 255);
    }
}`
};
