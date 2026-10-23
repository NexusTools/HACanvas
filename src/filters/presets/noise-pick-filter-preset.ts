import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NOISE_PICK_FILTER_PRESET: GimpFilterPreset = {
    id: "noise_pick",
    name: "Pick",
    category: "Noise",
    gimpProcedure: "gegl:noise-pick",
    description: "Randomly replaces pixels with one of their 8 immediate 3×3 neighbors (GIMP gegl:noise-pick).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "pctRandom",
            "label": "Pick Probability (%)",
            "type": "number",
            "min": 5,
            "max": 100,
            "step": 5,
            "defaultValue": 45
        }
    ],
    code: `// GIMP Pick Neighbor Noise (gegl:noise-pick)
const prob = helpers.clamp(Number(params.pctRandom ?? 45), 0, 100) / 100;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        if (helpers.hash2d(x, y, 41) < prob) {
            const dx = Math.floor(helpers.hash2d(x, y, 42) * 3) - 1;
            const dy = Math.floor(helpers.hash2d(x, y, 43) * 3) - 1;
            const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x + dx, y + dy);
            helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
        }
    }
}`
};
