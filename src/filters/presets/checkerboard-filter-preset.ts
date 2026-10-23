import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CHECKERBOARD_FILTER_PRESET: GimpFilterPreset = {
    id: "checkerboard",
    name: "Checkerboard",
    category: "Render",
    gimpProcedure: "gegl:checkerboard",
    description: "Renders an alternating two-color checkerboard pattern (GIMP gegl:checkerboard).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "cellSize",
            "label": "Square Size (px)",
            "type": "number",
            "min": 4,
            "max": 128,
            "step": 4,
            "defaultValue": 24
        },
        {
            "key": "color1",
            "label": "Color 1",
            "type": "color",
            "defaultValue": "#1e2436"
        },
        {
            "key": "color2",
            "label": "Color 2",
            "type": "color",
            "defaultValue": "#00d4ff"
        }
    ],
    code: `// GIMP Checkerboard Pattern (gegl:checkerboard)
const size = Math.max(2, Math.round(Number(params.cellSize ?? 24)));
const c1 = helpers.parseColor(String(params.color1 || "#1e2436"));
const c2 = helpers.parseColor(String(params.color2 || "#00d4ff"));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const c = ((Math.floor(x / size) + Math.floor(y / size)) & 1) === 0 ? c1 : c2;
        helpers.setPixel(outBuf, width, height, x, y, c.r, c.g, c.b, 255);
    }
}`
};
