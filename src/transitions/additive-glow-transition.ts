import type { RasterBlendPreset } from "./transition-types.js";

export const ADDITIVE_GLOW_TRANSITION: RasterBlendPreset = {
    id: "additive_glow",
    name: "Additive Energy Glow",
    category: "Light & Chromatic",
    description: "Blends Keyframe A into Keyframe B with a mid-transition additive luminance surge.",
    builtIn: true,
    code: `// Additive Energy Glow Blend
const k = helpers.clamp01(t);
const inv = 1 - k;
const pulse = Math.sin(k * Math.PI) * 0.45;
const total = width * height * 4;
for (let i = 0; i < total; i += 4) {
    const r = bufA[i] * inv + bufB[i] * k + (bufA[i] + bufB[i]) * 0.5 * pulse;
    const g = bufA[i + 1] * inv + bufB[i + 1] * k + (bufA[i + 1] + bufB[i + 1]) * 0.5 * pulse;
    const b = bufA[i + 2] * inv + bufB[i + 2] * k + (bufA[i + 2] + bufB[i + 2]) * 0.5 * pulse;
    const a = bufA[i + 3] * inv + bufB[i + 3] * k;
    outBuf[i]     = helpers.clamp255(r);
    outBuf[i + 1] = helpers.clamp255(g);
    outBuf[i + 2] = helpers.clamp255(b);
    outBuf[i + 3] = helpers.clamp255(a);
}`
};
