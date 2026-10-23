import type { RasterBlendPreset } from "./transition-types.js";

export const CLOCK_SWEEP_TRANSITION: RasterBlendPreset = {
    id: "clock_sweep",
    name: "Clock Radial Sweep",
    category: "Wipe & Sweep",
    description: "Sweeps a radial clock hand 360 degrees around the center to transition from Keyframe A to Keyframe B.",
    builtIn: true,
    code: `// Clock Radial Sweep Transition
const k = helpers.clamp01(t);
const cx = width * 0.5, cy = height * 0.5;
const feather = 0.06;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const ang = ((Math.atan2(y - cy, x - cx) + Math.PI * 0.5 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
        const mask = helpers.smoothstep(ang - feather, ang + feather, k * (1 + feather * 2) - feather);
        const inv = 1 - mask;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(bufA[i]     * inv + bufB[i]     * mask);
        outBuf[i + 1] = helpers.clamp255(bufA[i + 1] * inv + bufB[i + 1] * mask);
        outBuf[i + 2] = helpers.clamp255(bufA[i + 2] * inv + bufB[i + 2] * mask);
        outBuf[i + 3] = helpers.clamp255(bufA[i + 3] * inv + bufB[i + 3] * mask);
    }
}`
};
