import type { RasterBlendPreset } from "./transition-types.js";

export const BURN_EXPOSURE_TRANSITION: RasterBlendPreset = {
    id: "burn_exposure",
    name: "Solar Film Burn",
    category: "Light & Chromatic",
    description: "Transitions through a warm amber-white celluloid overexposure flash at mid-transition.",
    builtIn: true,
    code: `// Solar Celluloid Film Burn Transition
const k = helpers.clamp01(t);
const inv = 1 - k;
const burn = Math.pow(Math.sin(k * Math.PI), 2);
const total = width * height * 4;
for (let i = 0; i < total; i += 4) {
    outBuf[i]     = helpers.clamp255(bufA[i]     * inv + bufB[i]     * k + burn * 220);
    outBuf[i + 1] = helpers.clamp255(bufA[i + 1] * inv + bufB[i + 1] * k + burn * 145);
    outBuf[i + 2] = helpers.clamp255(bufA[i + 2] * inv + bufB[i + 2] * k + burn * 55);
    outBuf[i + 3] = helpers.clamp255(Math.max(bufA[i + 3] * inv + bufB[i + 3] * k, burn * 255));
}`
};
