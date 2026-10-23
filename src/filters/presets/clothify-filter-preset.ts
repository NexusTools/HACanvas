import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CLOTHIFY_FILTER_PRESET: GimpFilterPreset = {
    id: "clothify",
    name: "Clothify",
    category: "Artistic",
    gimpProcedure: "script-fu-clothify",
    description: "Applies an anisotropic woven cloth bump texture generated from directional noise (GIMP script-fu-clothify).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "depth",
            "label": "Cloth Depth",
            "type": "number",
            "min": 2,
            "max": 40,
            "step": 2,
            "defaultValue": 14
        }
    ],
    code: `// GIMP Clothify Script-Fu Filter (script-fu-clothify)
const depth = Number(params.depth ?? 14);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const nx = helpers.perlin2d(x * 0.45, y * 0.08, 12);
        const ny = helpers.perlin2d(x * 0.08, y * 0.45, 24);
        const cloth = (nx + ny) * 0.5 * depth;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + cloth);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + cloth);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + cloth);
    }
}`
};
