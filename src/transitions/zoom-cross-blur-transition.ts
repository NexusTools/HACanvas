import type { RasterBlendPreset } from "./transition-types.js";

export const ZOOM_CROSS_BLUR_TRANSITION: RasterBlendPreset = {
    id: "zoom_cross_blur",
    name: "Whip Zoom Cross-Dissolve",
    category: "Displacement & Optical",
    description: "Zooms Keyframe A outward while zooming Keyframe B inward with radial motion blending.",
    builtIn: true,
    code: `// Whip Zoom Cross-Dissolve Transition
const k = helpers.clamp01(t);
const inv = 1 - k;
const cx = width * 0.5, cy = height * 0.5;
const scaleA = 1 - k * 0.35;
const scaleB = 1 + inv * 0.35;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const pA = gimp.bilinear(bufA, width, height, cx + (x - cx) * scaleA, cy + (y - cy) * scaleA);
        const pB = gimp.bilinear(bufB, width, height, cx + (x - cx) * scaleB, cy + (y - cy) * scaleB);
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
