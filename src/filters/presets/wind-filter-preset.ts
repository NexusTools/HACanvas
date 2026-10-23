import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const WIND_FILTER_PRESET: GimpFilterPreset = {
    id: "wind",
    name: "Wind Streak",
    category: "Distorts",
    gimpProcedure: "gegl:wind",
    description: "Creates horizontal wind-blown motion streaks trailing from high-contrast edges (GIMP gegl:wind).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "threshold",
            "label": "Edge Threshold",
            "type": "number",
            "min": 5,
            "max": 100,
            "step": 5,
            "defaultValue": 25
        },
        {
            "key": "strength",
            "label": "Streak Length (px)",
            "type": "number",
            "min": 2,
            "max": 40,
            "step": 1,
            "defaultValue": 14
        }
    ],
    code: `// GIMP Wind Filter (gegl:wind)
const thresh = Number(params.threshold ?? 25);
const strength = helpers.clamp(Math.round(Number(params.strength ?? 14)), 2, 40);
for (let y = 0; y < height; y++) {
    let bleedR = 0, bleedG = 0, bleedB = 0, bleedLeft = 0;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x, y);
        const [pr, pg, pb] = helpers.getPixel(srcBuf, width, height, x - 1, y);
        const diff = (Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb)) / 3;
        if (diff > thresh) {
            bleedR = pr; bleedG = pg; bleedB = pb;
            bleedLeft = Math.ceil((0.3 + helpers.hash2d(x, y) * 0.7) * strength);
        }
        if (bleedLeft > 0) {
            const mix = bleedLeft / (strength + 1);
            helpers.setPixel(outBuf, width, height, x, y, helpers.lerp(r, bleedR, mix), helpers.lerp(g, bleedG, mix), helpers.lerp(b, bleedB, mix), a);
            bleedLeft--;
        }
    }
}`
};
