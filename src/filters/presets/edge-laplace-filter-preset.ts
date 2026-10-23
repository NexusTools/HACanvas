import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const EDGE_LAPLACE_FILTER_PRESET: GimpFilterPreset = {
    id: "edge_laplace",
    name: "Edge: Laplace",
    category: "Edge-Detect",
    gimpProcedure: "gegl:edge-laplace",
    description: "Isotropic 8-neighbor second-derivative Laplacian edge detector (GIMP gegl:edge-laplace).",
    builtIn: true,
    parameterSchemas: [],
    code: `// GIMP Laplace Edge Detector (gegl:edge-laplace)
gegl.convolve3x3(srcBuf, outBuf, width, height, [-1, -1, -1, -1, 8, -1, -1, -1, -1], 1, 0, selection);`
};
