import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const ERODE_FILTER_PRESET: GimpFilterPreset = {
    id: "erode",
    name: "Erode (Grow Dark)",
    category: "Generic",
    gimpProcedure: "gegl:value-propagate",
    description: "Morphological erosion that expands dark regions by taking the 3×3 minimum value (GIMP gegl:value-propagate).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Radius (px)",
            "type": "number",
            "min": 1,
            "max": 5,
            "step": 1,
            "defaultValue": 1
        }
    ],
    code: `// GIMP Morphological Erode (gegl:value-propagate)
const r = helpers.clamp(Math.round(Number(params.radius ?? 1)), 1, 5);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        let minR = 255, minG = 255, minB = 255;
        const centerA = srcBuf[(y * width + x) * 4 + 3];
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const [pr, pg, pb] = helpers.getPixel(srcBuf, width, height, x + dx, y + dy);
                if (pr < minR) minR = pr;
                if (pg < minG) minG = pg;
                if (pb < minB) minB = pb;
            }
        }
        helpers.setPixel(outBuf, width, height, x, y, minR, minG, minB, centerA);
    }
}`
};
