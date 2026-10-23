import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const MEDIAN_BLUR_FILTER_PRESET: GimpFilterPreset = {
    id: "median_blur",
    name: "Median Blur",
    category: "Blur",
    gimpProcedure: "gegl:median-blur",
    description: "Non-linear rank-order neighborhood median filter that preserves sharp edges while removing impulse noise (GIMP gegl:median-blur).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Neighborhood Radius",
            "type": "number",
            "min": 1,
            "max": 5,
            "step": 1,
            "defaultValue": 2
        },
        {
            "key": "percentile",
            "label": "Percentile (0-100)",
            "type": "number",
            "min": 0,
            "max": 100,
            "step": 5,
            "defaultValue": 50
        }
    ],
    code: `// GIMP Median Blur (gegl:median-blur)
const radius = helpers.clamp(Math.round(Number(params.radius ?? 2)), 1, 5);
const percentile = helpers.clamp(Number(params.percentile ?? 50), 0, 100);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [r, g, b, a] = helpers.medianWindow(srcBuf, width, height, x, y, radius, percentile);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
