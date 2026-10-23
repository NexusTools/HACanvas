import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CONVOLUTION_MATRIX_FILTER_PRESET: GimpFilterPreset = {
    id: "convolution_matrix",
    name: "Convolution Matrix (3×3)",
    category: "Generic",
    gimpProcedure: "gegl:convolution-matrix",
    description: "Applies a customizable 3×3 spatial convolution kernel with center weight, neighbor weight, and bias (GIMP gegl:convolution-matrix).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "center",
            "label": "Center Weight",
            "type": "number",
            "min": -10,
            "max": 15,
            "step": 1,
            "defaultValue": 5
        },
        {
            "key": "neighbor",
            "label": "Cross Neighbor Weight",
            "type": "number",
            "min": -5,
            "max": 5,
            "step": 0.5,
            "defaultValue": -1
        },
        {
            "key": "bias",
            "label": "Bias Offset",
            "type": "number",
            "min": -128,
            "max": 128,
            "step": 4,
            "defaultValue": 0
        }
    ],
    code: `// GIMP 3x3 Convolution Matrix (gegl:convolution-matrix)
const c = Number(params.center ?? 5);
const n = Number(params.neighbor ?? -1);
const bias = Number(params.bias ?? 0);
const kernel = [0, n, 0, n, c, n, 0, n, 0];
gegl.convolve3x3(srcBuf, outBuf, width, height, kernel, undefined, bias, selection);`
};
