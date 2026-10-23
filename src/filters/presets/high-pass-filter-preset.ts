import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const HIGH_PASS_FILTER_PRESET: GimpFilterPreset = {
    id: "high_pass",
    name: "High Pass",
    category: "Enhance",
    gimpProcedure: "gegl:high-pass",
    description: "Extracts fine high-frequency detail centered around neutral 50% gray (GIMP gegl:high-pass).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "stdDev",
            "label": "Std. Dev / Radius",
            "type": "number",
            "min": 1,
            "max": 25,
            "step": 1,
            "defaultValue": 4
        },
        {
            "key": "contrast",
            "label": "Contrast Multiplier",
            "type": "number",
            "min": 0.5,
            "max": 4,
            "step": 0.1,
            "defaultValue": 1.5
        }
    ],
    code: `// GIMP High Pass Filter (gegl:high-pass)
const stdDev = helpers.clamp(Math.round(Number(params.stdDev ?? params.radius ?? 4)), 1, 25);
const contrast = helpers.clamp(Number(params.contrast ?? 1.5), 0.2, 5.0);
const lowPass = gegl.gaussianBlur(srcBuf, width, height, stdDev, stdDev);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(128 + (srcBuf[i]     - lowPass[i])     * contrast);
        outBuf[i + 1] = helpers.clamp255(128 + (srcBuf[i + 1] - lowPass[i + 1]) * contrast);
        outBuf[i + 2] = helpers.clamp255(128 + (srcBuf[i + 2] - lowPass[i + 2]) * contrast);
        outBuf[i + 3] = srcBuf[i + 3];
    }
}`
};
