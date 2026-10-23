import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const VALUE_INVERT_FILTER_PRESET: GimpFilterPreset = {
    id: "value_invert",
    name: "Value Invert (HSV)",
    category: "Colors",
    gimpProcedure: "gegl:value-invert",
    description: "Inverts pixel brightness Value `(1 - V)` in HSV space while keeping Hue and Saturation intact (GIMP gegl:value-invert).",
    builtIn: true,
    parameterSchemas: [],
    code: `// GIMP Value Invert (gegl:value-invert)
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        if (srcBuf[i + 3] > 0) {
            const [h, s, v] = helpers.rgbToHsv(srcBuf[i], srcBuf[i + 1], srcBuf[i + 2]);
            const [r, g, b] = helpers.hsvToRgb(h, s, 1 - v);
            outBuf[i] = r; outBuf[i + 1] = g; outBuf[i + 2] = b;
        }
    }
}`
};
