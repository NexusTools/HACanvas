import type { RasterBlendPreset } from "./transition-types.js";

export const RADIAL_IRIS_TRANSITION: RasterBlendPreset = {
    id: "radial_iris",
    name: "Radial Iris Circle",
    category: "Iris & Geometric",
    description: "Expands a circular iris aperture from the center of the canvas outward to reveal Keyframe B.",
    builtIn: true,
    code: `// Radial Circular Iris Reveal
const k = helpers.clamp01(t);
const cx = width * 0.5, cy = height * 0.5;
const maxR = Math.hypot(cx, cy) || 1;
const feather = 0.1;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const d = Math.hypot(x - cx, y - cy) / maxR;
        const mask = 1 - helpers.smoothstep(k * (1 + feather) - feather, k * (1 + feather), d);
        const inv = 1 - mask;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(bufA[i]     * inv + bufB[i]     * mask);
        outBuf[i + 1] = helpers.clamp255(bufA[i + 1] * inv + bufB[i + 1] * mask);
        outBuf[i + 2] = helpers.clamp255(bufA[i + 2] * inv + bufB[i + 2] * mask);
        outBuf[i + 3] = helpers.clamp255(bufA[i + 3] * inv + bufB[i + 3] * mask);
    }
}`
};
