import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const STENCIL_CARVE_FILTER_PRESET: GimpFilterPreset = {
    id: "stencil_carve",
    name: "Stencil Carve",
    category: "Decor",
    gimpProcedure: "script-fu-carve-it",
    description: "Carves the image luminance into a chiseled stone relief stencil (GIMP script-fu-carve-it).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "depth",
            "label": "Chisel Depth",
            "type": "number",
            "min": 1,
            "max": 15,
            "step": 1,
            "defaultValue": 5
        }
    ],
    code: `// GIMP Stencil Carve Relief (script-fu-carve-it)
const depth = Number(params.depth ?? 5) / 255;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const grad = helpers.sobelAt(srcBuf, width, height, x, y);
        const chisel = 175 + (grad.gx + grad.gy) * depth * 45;
        const stone = helpers.perlin2d(x * 0.25, y * 0.25, 3) * 14;
        const v = helpers.clamp255(chisel + stone);
        helpers.setPixel(outBuf, width, height, x, y, v, v * 0.98, v * 0.94, srcBuf[(y * width + x) * 4 + 3]);
    }
}`
};
