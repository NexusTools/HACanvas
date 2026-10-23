import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const FUZZY_BORDER_FILTER_PRESET: GimpFilterPreset = {
    id: "fuzzy_border",
    name: "Fuzzy Border",
    category: "Decor",
    gimpProcedure: "script-fu-fuzzy-border",
    description: "Surrounds the canvas with a ragged, dithered vignette border (GIMP script-fu-fuzzy-border).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "borderSize",
            "label": "Border Width (px)",
            "type": "number",
            "min": 4,
            "max": 60,
            "step": 2,
            "defaultValue": 18
        },
        {
            "key": "color",
            "label": "Border Color",
            "type": "color",
            "defaultValue": "#ffffff"
        }
    ],
    code: `// GIMP Fuzzy Border (script-fu-fuzzy-border)
const bw = Math.max(4, Number(params.borderSize ?? 18));
const col = helpers.parseColor(String(params.color || "#ffffff"));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const minEdge = Math.min(x, y, width - 1 - x, height - 1 - y);
        if (minEdge < bw) {
            const prob = 1 - minEdge / bw;
            if (helpers.hash2d(x, y, 66) < prob) {
                helpers.setPixel(outBuf, width, height, x, y, col.r, col.g, col.b, 255);
            }
        }
    }
}`
};
