import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const RED_EYE_REMOVAL_FILTER_PRESET: GimpFilterPreset = {
    id: "red_eye_removal",
    name: "Red Eye Removal",
    category: "Enhance",
    gimpProcedure: "gegl:red-eye-removal",
    description: "Attenuates unnatural flash red-eye dominance where Red significantly exceeds Green and Blue (GIMP gegl:red-eye-removal).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "threshold",
            "label": "Red Dominance Threshold",
            "type": "number",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.4
        }
    ],
    code: `// GIMP Red Eye Removal (gegl:red-eye-removal)
const thresh = helpers.clamp(Number(params.threshold ?? 0.4), 0.05, 1.0);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const r = srcBuf[i], g = srcBuf[i + 1], b = srcBuf[i + 2];
        const avgGB = (g + b) * 0.5;
        if (r > avgGB * (1 + thresh)) {
            outBuf[i] = helpers.clamp255(avgGB);
        }
    }
}`
};
