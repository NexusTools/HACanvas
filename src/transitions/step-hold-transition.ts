import type { RasterBlendPreset } from "./transition-types.js";

export const STEP_HOLD_TRANSITION: RasterBlendPreset = {
    id: "step_hold",
    name: "Step Hold (Cel Animation)",
    category: "Dissolve & Fade",
    description: "Holds Keyframe A without blending until reaching Keyframe B (classic traditional cel animation).",
    builtIn: true,
    code: `// Step Hold (Traditional Cel Hold)
// Holds Keyframe A until t >= 1.0, then switches cleanly to Keyframe B
const src = t < 0.999 ? bufA : bufB;
outBuf.set(src);`
};
