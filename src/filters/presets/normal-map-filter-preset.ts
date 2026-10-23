import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NORMAL_MAP_FILTER_PRESET: GimpFilterPreset = {
    id: "normal_map",
    name: "Normal Map (Tangent Space)",
    category: "Generic",
    gimpProcedure: "gegl:normal-map",
    description: "Generates an RGB tangent-space surface normal map from image luminance height gradients (GIMP gegl:normal-map).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scale",
            "label": "Height Scale",
            "type": "number",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "defaultValue": 5
        }
    ],
    code: `// GIMP Tangent-Space Normal Map Generator (gegl:normal-map)
const scale = Number(params.scale ?? 5.0) / 255;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const grad = helpers.sobelAt(srcBuf, width, height, x, y);
        const nx = -grad.gx * scale;
        const ny = -grad.gy * scale;
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz) || 1;
        const r = (nx / len * 0.5 + 0.5) * 255;
        const g = (ny / len * 0.5 + 0.5) * 255;
        const b = (nz / len * 0.5 + 0.5) * 255;
        const a = srcBuf[(y * width + x) * 4 + 3];
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
