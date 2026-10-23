import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CIE_LCH_NOISE_FILTER_PRESET: GimpFilterPreset = {
    id: "cie_lch_noise",
    name: "CIE lch Noise",
    category: "Noise",
    gimpProcedure: "gegl:noise-cie-lch",
    description: "Adds perceptual lightness and chroma grain noise (GIMP gegl:noise-cie-lch).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "lightnessDistance",
            "label": "Lightness Grain",
            "type": "number",
            "min": 1,
            "max": 80,
            "step": 2,
            "defaultValue": 22
        }
    ],
    code: `// GIMP CIE LCH Perceptual Grain (gegl:noise-cie-lch)
const lAmp = Number(params.lightnessDistance ?? 22);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const delta = (helpers.hash2d(x, y, 71) - 0.5) * 2 * lAmp;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + delta);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + delta);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + delta);
    }
}`
};
