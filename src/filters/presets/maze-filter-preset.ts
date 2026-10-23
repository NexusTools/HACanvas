import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const MAZE_FILTER_PRESET: GimpFilterPreset = {
    id: "maze",
    name: "Maze",
    category: "Render",
    gimpProcedure: "gegl:maze",
    description: "Generates a procedural Truchet/orthogonal labyrinth maze pattern (GIMP gegl:maze).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "cellSize",
            "label": "Passage Width (px)",
            "type": "number",
            "min": 4,
            "max": 40,
            "step": 2,
            "defaultValue": 12
        }
    ],
    code: `// GIMP Procedural Maze Generator (gegl:maze)
const cell = Math.max(4, Math.round(Number(params.cellSize ?? 12)));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
        const lx = x % cell, ly = y % cell;
        const dir = helpers.hash2d(gx, gy, 88) > 0.5;
        const wall = (lx === 0 && dir) || (ly === 0 && !dir);
        const v = wall ? 18 : 242;
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, 255);
    }
}`
};
