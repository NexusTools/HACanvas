import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NEWSPRINT_FILTER_PRESET: GimpFilterPreset = {
    id: "newsprint",
    name: "Newsprint (Halftone)",
    category: "Distorts",
    gimpProcedure: "gegl:newsprint",
    description: "Simulates angled halftone newspaper dot screening (GIMP gegl:newsprint).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "period",
            "label": "Halftone Cell Size",
            "type": "number",
            "min": 3,
            "max": 20,
            "step": 1,
            "defaultValue": 6
        }
    ],
    code: `// GIMP Newsprint Halftone Screen (gegl:newsprint)
const cell = helpers.clamp(Number(params.period ?? 6), 3, 20);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x, y);
        const lum = helpers.luminance(r, g, b) / 255;
        const u = ((x % cell) / cell) - 0.5;
        const v = ((y % cell) / cell) - 0.5;
        const dist = Math.hypot(u, v) * 1.414;
        const val = dist < (1 - lum) ? 20 : 248;
        helpers.setPixel(outBuf, width, height, x, y, val, val, val, a);
    }
}`
};
