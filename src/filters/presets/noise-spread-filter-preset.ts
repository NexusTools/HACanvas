import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NOISE_SPREAD_FILTER_PRESET: GimpFilterPreset = {
    id: "noise_spread",
    name: "Spread",
    category: "Noise",
    gimpProcedure: "gegl:noise-spread",
    description: "Swaps pixels randomly within a configurable horizontal and vertical spread radius (GIMP gegl:noise-spread).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "amount",
            "label": "Spread Radius (px)",
            "type": "number",
            "min": 1,
            "max": 32,
            "step": 1,
            "defaultValue": 6
        }
    ],
    code: `// GIMP Spread Noise (gegl:noise-spread)
const rad = helpers.clamp(Math.round(Number(params.amount ?? params.radius ?? 6)), 1, 32);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = Math.round((helpers.hash2d(x, y, 61) * 2 - 1) * rad);
        const dy = Math.round((helpers.hash2d(x, y, 62) * 2 - 1) * rad);
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x + dx, y + dy);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
