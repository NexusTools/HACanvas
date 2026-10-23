import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const BRIGHTNESS_CONTRAST_FILTER_PRESET: GimpFilterPreset = {
    id: "brightness_contrast",
    name: "Brightness & Contrast",
    category: "Colors",
    gimpProcedure: "gegl:brightness-contrast",
    description: "Adjusts image brightness offset and contrast slope around midpoint 128 (GIMP gegl:brightness-contrast).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "brightness",
            "label": "Brightness (-128..128)",
            "type": "number",
            "min": -128,
            "max": 128,
            "step": 1,
            "defaultValue": 0
        },
        {
            "key": "contrast",
            "label": "Contrast (-128..128)",
            "type": "number",
            "min": -128,
            "max": 128,
            "step": 1,
            "defaultValue": 0
        }
    ],
    code: `// GIMP Brightness & Contrast (gegl:brightness-contrast)
const brightness = Number(params.brightness ?? 0);
const contrast = helpers.clamp(Number(params.contrast ?? 0), -250, 250);
const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const idx = (y * width + x) * 4;
        if (srcBuf[idx + 3] > 0) {
            outBuf[idx]     = helpers.clamp255(factor * (srcBuf[idx]     + brightness - 128) + 128);
            outBuf[idx + 1] = helpers.clamp255(factor * (srcBuf[idx + 1] + brightness - 128) + 128);
            outBuf[idx + 2] = helpers.clamp255(factor * (srcBuf[idx + 2] + brightness - 128) + 128);
        }
    }
}`
};
