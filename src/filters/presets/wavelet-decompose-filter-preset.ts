import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const WAVELET_DECOMPOSE_FILTER_PRESET: GimpFilterPreset = {
    id: "wavelet_decompose",
    name: "Wavelet Detail Scale",
    category: "Enhance",
    gimpProcedure: "plug-in-wavelet-decompose",
    description: "Extracts or boosts à-trous wavelet frequency detail scales (GIMP plug-ins/common/wavelet-decompose.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scaleRadius",
            "label": "Wavelet Scale Radius",
            "type": "number",
            "min": 1,
            "max": 16,
            "step": 1,
            "defaultValue": 3
        },
        {
            "key": "detailGain",
            "label": "Detail Gain",
            "type": "number",
            "min": 0,
            "max": 3,
            "step": 0.1,
            "defaultValue": 1.6
        }
    ],
    code: `// GIMP Wavelet Decompose Detail Boost (plug-ins/common/wavelet-decompose.c)
const r = helpers.clamp(Math.round(Number(params.scaleRadius ?? 3)), 1, 16);
const gain = Number(params.detailGain ?? 1.6);
const coarse = gegl.gaussianBlur(srcBuf, width, height, r, r);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(coarse[i]     + (srcBuf[i]     - coarse[i])     * gain);
        outBuf[i + 1] = helpers.clamp255(coarse[i + 1] + (srcBuf[i + 1] - coarse[i + 1]) * gain);
        outBuf[i + 2] = helpers.clamp255(coarse[i + 2] + (srcBuf[i + 2] - coarse[i + 2]) * gain);
    }
}`
};
