import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SHARPEN_FILTER_PRESET: GimpFilterPreset = {
    id: "sharpen",
    name: "Sharpen (Unsharp Mask)",
    category: "Enhance",
    gimpProcedure: "gegl:unsharp-mask",
    description: "Sharpens edges by subtracting a Gaussian-blurred copy from the original image (GIMP gegl:unsharp-mask).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Radius (px)",
            "type": "number",
            "min": 1,
            "max": 15,
            "step": 1,
            "defaultValue": 2
        },
        {
            "key": "amount",
            "label": "Amount",
            "type": "number",
            "min": 0.2,
            "max": 5,
            "step": 0.1,
            "defaultValue": 1.5
        }
    ],
    code: `// GIMP Sharpen / Unsharp Mask (gegl:unsharp-mask)
const radius = helpers.clamp(Math.round(Number(params.radius ?? 2)), 1, 15);
const amount = helpers.clamp(Number(params.amount ?? 1.5), 0.1, 6.0);
const blurred = gegl.gaussianBlur(srcBuf, width, height, radius, radius);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        if (srcBuf[i + 3] === 0) continue;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + (srcBuf[i]     - blurred[i])     * amount);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + (srcBuf[i + 1] - blurred[i + 1]) * amount);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + (srcBuf[i + 2] - blurred[i + 2]) * amount);
        outBuf[i + 3] = srcBuf[i + 3];
    }
}`
};
