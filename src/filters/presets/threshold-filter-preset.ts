import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const THRESHOLD_FILTER_PRESET: GimpFilterPreset = {
    id: "threshold",
    name: "Threshold (Binarize)",
    category: "Colors",
    gimpProcedure: "gegl:threshold",
    description: "Binarizes pixels to pure black (0) or pure white (255) based on a luminance cutoff (GIMP gegl:threshold).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "threshold",
            "label": "Luminance Cutoff",
            "type": "number",
            "min": 0,
            "max": 255,
            "step": 1,
            "defaultValue": 128
        }
    ],
    code: `// GIMP Threshold Binarize (gegl:threshold)
const cutoff = Number(params.threshold ?? 128);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const idx = (y * width + x) * 4;
        if (srcBuf[idx + 3] > 0) {
            const lum = helpers.luminance(srcBuf[idx], srcBuf[idx + 1], srcBuf[idx + 2]);
            const val = lum >= cutoff ? 255 : 0;
            outBuf[idx] = val; outBuf[idx + 1] = val; outBuf[idx + 2] = val;
        }
    }
}`
};
