import type { RasterBlendPreset } from "./transition-types.js";

export const VENETIAN_BLINDS_WIPE_TRANSITION: RasterBlendPreset = {
    id: "venetian_blinds_wipe",
    name: "Venetian Blinds Wipe",
    category: "Wipe & Sweep",
    description: "Opens horizontal Venetian blind slats across the frame to reveal Keyframe B.",
    builtIn: true,
    code: `// Venetian Blinds Slat Wipe
const k = helpers.clamp01(t);
const slats = 10;
const slatH = Math.max(2, height / slats);
for (let y = 0; y < height; y++) {
    const localPos = (y % slatH) / slatH;
    const mask = helpers.smoothstep(localPos - 0.08, localPos + 0.08, k);
    const inv = 1 - mask;
    const rowOff = y * width * 4;
    for (let x = 0; x < width; x++) {
        const i = rowOff + x * 4;
        outBuf[i]     = helpers.clamp255(bufA[i]     * inv + bufB[i]     * mask);
        outBuf[i + 1] = helpers.clamp255(bufA[i + 1] * inv + bufB[i + 1] * mask);
        outBuf[i + 2] = helpers.clamp255(bufA[i + 2] * inv + bufB[i + 2] * mask);
        outBuf[i + 3] = helpers.clamp255(bufA[i + 3] * inv + bufB[i + 3] * mask);
    }
}`
};
