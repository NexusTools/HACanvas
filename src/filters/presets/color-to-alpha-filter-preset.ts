import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const COLOR_TO_ALPHA_FILTER_PRESET: GimpFilterPreset = {
    id: "color_to_alpha",
    name: "Color to Alpha",
    category: "Colors",
    gimpProcedure: "gegl:color-to-alpha",
    description: "Converts a specified target color into smooth alpha transparency (GIMP gegl:color-to-alpha).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "color",
            "label": "Target Color",
            "type": "color",
            "defaultValue": "#ffffff"
        },
        {
            "key": "tolerance",
            "label": "Tolerance (1-255)",
            "type": "number",
            "min": 5,
            "max": 255,
            "step": 5,
            "defaultValue": 80
        }
    ],
    code: `// GIMP Color to Alpha (gegl:color-to-alpha)
const target = helpers.parseColor(String(params.color || "#ffffff"));
const tol = Math.max(1, Number(params.tolerance ?? 80));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const d = Math.hypot(srcBuf[i] - target.r, srcBuf[i + 1] - target.g, srcBuf[i + 2] - target.b);
        if (d < tol) {
            outBuf[i + 3] = helpers.clamp255(srcBuf[i + 3] * (d / tol));
        }
    }
}`
};
