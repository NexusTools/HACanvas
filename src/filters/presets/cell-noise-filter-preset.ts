import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CELL_NOISE_FILTER_PRESET: GimpFilterPreset = {
    id: "cell_noise",
    name: "Cell Noise (Worley / Voronoi)",
    category: "Render",
    gimpProcedure: "gegl:cell-noise",
    description: "Renders organic cellular Worley F1/F2 distance field textures (GIMP gegl:cell-noise).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scale",
            "label": "Cell Size (px)",
            "type": "number",
            "min": 6,
            "max": 96,
            "step": 2,
            "defaultValue": 24
        }
    ],
    code: `// GIMP Cell Noise (gegl:cell-noise)
const scale = Math.max(4, Number(params.scale ?? 24));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const cell = helpers.voronoi2d(x / scale, y / scale, 0.85, 33);
        const v = helpers.clamp255(cell.f1 * 255);
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, 255);
    }
}`
};
