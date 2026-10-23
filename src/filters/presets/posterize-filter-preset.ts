import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const POSTERIZE_FILTER_PRESET: GimpFilterPreset = {
    id: "posterize",
    name: "Posterize",
    category: "Colors",
    gimpProcedure: "gegl:posterize",
    description: "Quantizes RGB channels into N discrete tonal levels (GIMP gegl:posterize).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "levels",
            "label": "Posterize Levels",
            "type": "number",
            "min": 2,
            "max": 32,
            "step": 1,
            "defaultValue": 4
        }
    ],
    code: `// GIMP Posterize (gegl:posterize)
const levels = helpers.clamp(Math.round(Number(params.levels ?? 4)), 2, 64);
const step = 255 / (levels - 1);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(Math.round(srcBuf[i]     / step) * step);
        outBuf[i + 1] = helpers.clamp255(Math.round(srcBuf[i + 1] / step) * step);
        outBuf[i + 2] = helpers.clamp255(Math.round(srcBuf[i + 2] / step) * step);
    }
}`
};
