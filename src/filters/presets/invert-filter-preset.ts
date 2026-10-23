import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const INVERT_FILTER_PRESET: GimpFilterPreset = {
    id: "invert",
    name: "Invert Colors",
    category: "Colors",
    gimpProcedure: "gegl:invert-linear",
    description: "Inverts Red, Green, and Blue channels (`255 - channel`) while preserving Alpha (GIMP gegl:invert-linear).",
    builtIn: true,
    parameterSchemas: [],
    code: `// GIMP Invert Colors (gegl:invert-linear)
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const idx = (y * width + x) * 4;
        if (srcBuf[idx + 3] > 0) {
            outBuf[idx]     = 255 - srcBuf[idx];
            outBuf[idx + 1] = 255 - srcBuf[idx + 1];
            outBuf[idx + 2] = 255 - srcBuf[idx + 2];
        }
    }
}`
};
