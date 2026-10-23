import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const ADD_BORDER_FILTER_PRESET: GimpFilterPreset = {
    id: "add_border",
    name: "Add Border",
    category: "Decor",
    gimpProcedure: "script-fu-add-border",
    description: "Draws a mitered 4-side shaded picture frame border around the canvas (GIMP script-fu-add-border).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "borderSize",
            "label": "Border Size (px)",
            "type": "number",
            "min": 2,
            "max": 48,
            "step": 2,
            "defaultValue": 12
        },
        {
            "key": "color",
            "label": "Frame Color",
            "type": "color",
            "defaultValue": "#2c3654"
        }
    ],
    code: `// GIMP Add Border Frame (script-fu-add-border)
const b = helpers.clamp(Math.round(Number(params.borderSize ?? 12)), 2, 60);
const col = helpers.parseColor(String(params.color || "#2c3654"));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        if (x < b || x >= width - b || y < b || y >= height - b) {
            const shade = (y < b || x < b) ? 1.18 : 0.78;
            helpers.setPixel(outBuf, width, height, x, y, col.r * shade, col.g * shade, col.b * shade, 255);
        }
    }
}`
};
