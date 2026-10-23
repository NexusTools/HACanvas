import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const ENGRAVE_FILTER_PRESET: GimpFilterPreset = {
    id: "engrave",
    name: "Engrave",
    category: "Distorts",
    gimpProcedure: "gegl:engrave",
    description: "Creates a vintage horizontal line-width modulation engraving illustration (GIMP gegl:engrave).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "rowHeight",
            "label": "Line Spacing (px)",
            "type": "number",
            "min": 2,
            "max": 16,
            "step": 1,
            "defaultValue": 5
        }
    ],
    code: `// GIMP Engrave (gegl:engrave)
const rowH = helpers.clamp(Math.round(Number(params.rowHeight ?? 5)), 2, 16);
for (let y = 0; y < height; y++) {
    const wave = (y % rowH) / rowH;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x, y);
        const lum = helpers.luminance(r, g, b) / 255;
        const ink = lum > wave ? 255 : 15;
        helpers.setPixel(outBuf, width, height, x, y, ink, ink, ink, a);
    }
}`
};
