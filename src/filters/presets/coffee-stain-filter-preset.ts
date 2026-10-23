import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const COFFEE_STAIN_FILTER_PRESET: GimpFilterPreset = {
    id: "coffee_stain",
    name: "Coffee Stain",
    category: "Decor",
    gimpProcedure: "script-fu-coffee-stain",
    description: "Overlays an organic Perlin-warped espresso cup ring stain (GIMP script-fu-coffee-stain).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "darkness",
            "label": "Stain Darkness (0-1)",
            "type": "number",
            "min": 0.1,
            "max": 0.9,
            "step": 0.05,
            "defaultValue": 0.45
        }
    ],
    code: `// GIMP Coffee Stain Ring (script-fu-coffee-stain)
const dark = helpers.clamp(Number(params.darkness ?? 0.45), 0.05, 0.95);
const cx = width * 0.55, cy = height * 0.48;
const r0 = Math.min(width, height) * 0.32;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const warp = helpers.perlin2d(x * 0.04, y * 0.04, 15) * (r0 * 0.15);
        const d = Math.abs(Math.hypot(x - cx, y - cy) + warp - r0);
        const ring = Math.exp(-(d * d) / Math.max(4, r0 * 0.25)) * dark;
        if (ring > 0.01) {
            const i = (y * width + x) * 4;
            outBuf[i]     = helpers.clamp255(helpers.lerp(srcBuf[i],     115, ring));
            outBuf[i + 1] = helpers.clamp255(helpers.lerp(srcBuf[i + 1], 72,  ring));
            outBuf[i + 2] = helpers.clamp255(helpers.lerp(srcBuf[i + 2], 32,  ring));
        }
    }
}`
};
