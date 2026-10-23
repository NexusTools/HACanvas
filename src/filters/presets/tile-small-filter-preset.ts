import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const TILE_SMALL_FILTER_PRESET: GimpFilterPreset = {
    id: "tile_small",
    name: "Small Tiles",
    category: "Map",
    gimpProcedure: "plug-in-small-tiles",
    description: "Reduces the image and repeats it in an N×N grid of miniature tiles (GIMP plug-ins/common/tile-small.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "segments",
            "label": "Grid Segments (2-6)",
            "type": "number",
            "min": 2,
            "max": 6,
            "step": 1,
            "defaultValue": 2
        }
    ],
    code: `// GIMP Small Tiles Plugin (plug-ins/common/tile-small.c)
const n = helpers.clamp(Math.round(Number(params.segments ?? 2)), 2, 6);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const sx = (x * n) % width;
        const sy = (y * n) % height;
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, sx, sy, true);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
