import type { RasterBlendPreset } from "./transition-types.js";

export const RIPPLE_WARP_TRANSITION: RasterBlendPreset = {
    id: "ripple_warp_transition",
    name: "Liquid Ripple Warp",
    category: "Displacement & Optical",
    description: "Warps Keyframe A into Keyframe B through a sinusoidal liquid ripple wave that peaks at t = 0.5.",
    builtIn: true,
    code: `// Liquid Ripple Wave Warp Transition
const k = helpers.clamp01(t);
const inv = 1 - k;
const amp = Math.sin(k * Math.PI) * Math.min(width, height) * 0.08;
for (let y = 0; y < height; y++) {
    const dx = Math.sin(y * 0.15 + k * Math.PI * 4) * amp;
    for (let x = 0; x < width; x++) {
        const dy = Math.cos(x * 0.15 + k * Math.PI * 4) * amp;
        const pA = gimp.bilinear(bufA, width, height, x + dx * k, y + dy * k);
        const pB = gimp.bilinear(bufB, width, height, x - dx * inv, y - dy * inv);
        helpers.setPixel(
            outBuf, width, height, x, y,
            pA[0] * inv + pB[0] * k,
            pA[1] * inv + pB[1] * k,
            pA[2] * inv + pB[2] * k,
            pA[3] * inv + pB[3] * k
        );
    }
}`
};
