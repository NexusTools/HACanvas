import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CUBISM_FILTER_PRESET: GimpFilterPreset = {
    id: "cubism",
    name: "Cubism",
    category: "Artistic",
    gimpProcedure: "gegl:cubism",
    description: "Transforms the layer into overlapping rotated polygonal painterly facets (GIMP gegl:cubism).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "tileSize",
            "label": "Facet Size (px)",
            "type": "number",
            "min": 4,
            "max": 40,
            "step": 2,
            "defaultValue": 12
        },
        {
            "key": "tileSaturation",
            "label": "Facet Jitter",
            "type": "number",
            "min": 0.1,
            "max": 2,
            "step": 0.1,
            "defaultValue": 1
        }
    ],
    code: `// GIMP Cubism Facet Filter (gegl:cubism)
const size = helpers.clamp(Number(params.tileSize ?? 12), 3, 40);
const jit = Number(params.tileSaturation ?? 1.0);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const gx = Math.floor(x / size), gy = Math.floor(y / size);
        const ox = (helpers.hash2d(gx, gy, 101) - 0.5) * size * jit;
        const oy = (helpers.hash2d(gx, gy, 102) - 0.5) * size * jit;
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, (gx + 0.5) * size + ox, (gy + 0.5) * size + oy);
        const shade = 0.88 + helpers.hash2d(gx, gy, 103) * 0.24;
        helpers.setPixel(outBuf, width, height, x, y, r * shade, g * shade, b * shade, a);
    }
}`
};
