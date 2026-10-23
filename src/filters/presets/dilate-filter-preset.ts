import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const DILATE_FILTER_PRESET: GimpFilterPreset = {
    id: "dilate",
    name: "Dilate (Grow Bright)",
    category: "Generic",
    gimpProcedure: "gegl:value-propagate",
    description: "Morphological dilation that expands bright regions by taking the 3×3 maximum value (GIMP gegl:value-propagate).",
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
    code: `// GIMP Morphological Dilate (gegl:value-propagate)
const r = helpers.clamp(Math.round(Number(params.radius ?? 1)), 1, 5);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        let maxR = 0, maxG = 0, maxB = 0, maxA = 0;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const [pr, pg, pb, pa] = helpers.getPixel(srcBuf, width, height, x + dx, y + dy);
                if (pr > maxR) maxR = pr;
                if (pg > maxG) maxG = pg;
                if (pb > maxB) maxB = pb;
                if (pa > maxA) maxA = pa;
            }
        }
        helpers.setPixel(outBuf, width, height, x, y, maxR, maxG, maxB, maxA);
    }
}`
};
