import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NOISE_RGB_FILTER_PRESET: GimpFilterPreset = {
    id: "noise_rgb",
    name: "RGB Noise",
    category: "Noise",
    gimpProcedure: "gegl:noise-rgb",
    description: "Adds independent additive random noise to Red, Green, and Blue channels (GIMP gegl:noise-rgb).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "amount",
            "label": "Noise Amount (0-1)",
            "type": "number",
            "min": 0.02,
            "max": 1,
            "step": 0.02,
            "defaultValue": 0.2
        },
        {
            "key": "seed",
            "label": "Random Seed",
            "type": "number",
            "min": 0,
            "max": 999,
            "step": 1,
            "defaultValue": 11
        }
    ],
    code: `// GIMP RGB Noise (gegl:noise-rgb)
const amp = helpers.clamp(Number(params.amount ?? 0.2), 0, 1) * 255;
const seed = Number(params.seed ?? 11);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + (helpers.hash2d(x, y, seed + 1) - 0.5) * amp);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + (helpers.hash2d(x, y, seed + 2) - 0.5) * amp);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + (helpers.hash2d(x, y, seed + 3) - 0.5) * amp);
    }
}`
};
