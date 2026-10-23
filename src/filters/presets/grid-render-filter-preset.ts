import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const GRID_RENDER_FILTER_PRESET: GimpFilterPreset = {
    id: "grid_render",
    name: "Grid",
    category: "Render",
    gimpProcedure: "gegl:grid",
    description: "Draws horizontal and vertical ruled grid lines over the active layer (GIMP gegl:grid).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "spacing",
            "label": "Grid Spacing (px)",
            "type": "number",
            "min": 8,
            "max": 128,
            "step": 4,
            "defaultValue": 32
        },
        {
            "key": "lineWidth",
            "label": "Line Width (px)",
            "type": "number",
            "min": 1,
            "max": 8,
            "step": 1,
            "defaultValue": 2
        },
        {
            "key": "color",
            "label": "Line Color",
            "type": "color",
            "defaultValue": "#00d4ff"
        }
    ],
    code: `// GIMP Grid Overlay (gegl:grid)
const spacing = Math.max(4, Math.round(Number(params.spacing ?? 32)));
const lw = Math.max(1, Math.round(Number(params.lineWidth ?? 2)));
const col = helpers.parseColor(String(params.color || "#00d4ff"));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        if ((x % spacing) < lw || (y % spacing) < lw) {
            helpers.setPixel(outBuf, width, height, x, y, col.r, col.g, col.b, 255);
        }
    }
}`
};
