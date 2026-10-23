import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NOISE_SLUR_FILTER_PRESET: GimpFilterPreset = {
    id: "noise_slur",
    name: "Slur (Melt)",
    category: "Noise",
    gimpProcedure: "gegl:noise-slur",
    description: "Pulls pixels downward from the row above to create a melting paint drip effect (GIMP gegl:noise-slur).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "pctRandom",
            "label": "Melt Probability (%)",
            "type": "number",
            "min": 5,
            "max": 100,
            "step": 5,
            "defaultValue": 55
        }
    ],
    code: `// GIMP Slur Melting Noise (gegl:noise-slur)
const prob = helpers.clamp(Number(params.pctRandom ?? 55), 0, 100) / 100;
for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        if (helpers.hash2d(x, y, 51) < prob) {
            const dx = Math.floor(helpers.hash2d(x, y, 52) * 3) - 1;
            const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x + dx, y - 1);
            helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
        }
    }
}`
};
