import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const WATERPIXELS_FILTER_PRESET: GimpFilterPreset = {
    id: "waterpixels",
    name: "Waterpixels (Superpixels)",
    category: "Artistic",
    gimpProcedure: "gegl:waterpixels",
    description: "Groups neighboring pixels into organic Voronoi superpixel cells with smooth watercolor boundaries (GIMP gegl:waterpixels).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "superpixelSize",
            "label": "Superpixel Size",
            "type": "number",
            "min": 6,
            "max": 48,
            "step": 2,
            "defaultValue": 14
        }
    ],
    code: `// GIMP Waterpixels Superpixel Filter (gegl:waterpixels)
const size = helpers.clamp(Number(params.superpixelSize ?? 14), 4, 48);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const v = helpers.voronoi2d(x / size, y / size, 0.7, 99);
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, v.cellX * size, v.cellY * size);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
