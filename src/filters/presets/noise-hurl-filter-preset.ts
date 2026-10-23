import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NOISE_HURL_FILTER_PRESET: GimpFilterPreset = {
    id: "noise_hurl",
    name: "Hurl (Impulse Noise)",
    category: "Noise",
    gimpProcedure: "gegl:noise-hurl",
    description: "Randomly replaces a percentage of pixels with completely random colors (GIMP gegl:noise-hurl).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "pctRandom",
            "label": "Randomization (%)",
            "type": "number",
            "min": 1,
            "max": 100,
            "step": 1,
            "defaultValue": 20
        }
    ],
    code: `// GIMP Hurl Impulse Noise (gegl:noise-hurl)
const prob = helpers.clamp(Number(params.pctRandom ?? 20), 0, 100) / 100;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        if (helpers.hash2d(x, y, 31) < prob) {
            const i = (y * width + x) * 4;
            outBuf[i]     = helpers.clamp255(helpers.hash2d(x, y, 32) * 255);
            outBuf[i + 1] = helpers.clamp255(helpers.hash2d(x, y, 33) * 255);
            outBuf[i + 2] = helpers.clamp255(helpers.hash2d(x, y, 34) * 255);
        }
    }
}`
};
