import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const GAUSSIAN_BLUR_FILTER_PRESET: GimpFilterPreset = {
    id: "gaussian_blur",
    name: "Gaussian Blur",
    category: "Blur",
    gimpProcedure: "gegl:gaussian-blur",
    description: "Performs a separable Gaussian neighborhood blur across horizontal and vertical axes (GIMP gegl:gaussian-blur).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Blur Radius (px)",
            "type": "number",
            "min": 1,
            "max": 35,
            "step": 1,
            "defaultValue": 3
        }
    ],
    code: `// GIMP Gaussian Blur (gegl:gaussian-blur)
// Args: srcBuf, outBuf, width, height, params, selection, helpers, gimp, gegl
const radius = helpers.clamp(Math.round(Number(params.radius ?? 3)), 1, 35);
const blurred = gegl.gaussianBlur(srcBuf, width, height, radius, radius);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = blurred[i];
        outBuf[i + 1] = blurred[i + 1];
        outBuf[i + 2] = blurred[i + 2];
        outBuf[i + 3] = blurred[i + 3];
    }
}`
};
