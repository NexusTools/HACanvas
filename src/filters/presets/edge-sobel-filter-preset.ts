import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const EDGE_SOBEL_FILTER_PRESET: GimpFilterPreset = {
    id: "edge_sobel",
    name: "Edge: Sobel",
    category: "Edge-Detect",
    gimpProcedure: "gegl:edge-sobel",
    description: "Directional first-derivative 3×3 Sobel gradient magnitude edge detector (GIMP gegl:edge-sobel).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scale",
            "label": "Edge Gain",
            "type": "number",
            "min": 0.2,
            "max": 4,
            "step": 0.1,
            "defaultValue": 1
        }
    ],
    code: `// GIMP Sobel Edge Detector (gegl:edge-sobel)
const scale = Number(params.scale ?? 1.0);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const grad = helpers.sobelAt(srcBuf, width, height, x, y);
        const v = helpers.clamp255(grad.mag * scale);
        const a = srcBuf[(y * width + x) * 4 + 3];
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, a);
    }
}`
};
