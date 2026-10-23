import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const DEINTERLACE_FILTER_PRESET: GimpFilterPreset = {
    id: "deinterlace",
    name: "Deinterlace",
    category: "Enhance",
    gimpProcedure: "gegl:deinterlace",
    description: "Reconstructs odd or even scanlines by vertically interpolating adjacent video fields (GIMP gegl:deinterlace).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "keepOdd",
            "label": "Keep Odd Field (0 or 1)",
            "type": "number",
            "min": 0,
            "max": 1,
            "step": 1,
            "defaultValue": 0
        }
    ],
    code: `// GIMP Deinterlace (gegl:deinterlace)
const parity = Math.round(Number(params.keepOdd ?? 0)) & 1;
for (let y = 0; y < height; y++) {
    if ((y & 1) === parity) continue;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const above = helpers.getPixel(srcBuf, width, height, x, y - 1);
        const below = helpers.getPixel(srcBuf, width, height, x, y + 1);
        helpers.setPixel(
            outBuf, width, height, x, y,
            (above[0] + below[0]) * 0.5,
            (above[1] + below[1]) * 0.5,
            (above[2] + below[2]) * 0.5,
            (above[3] + below[3]) * 0.5
        );
    }
}`
};
