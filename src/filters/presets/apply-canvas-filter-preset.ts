import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const APPLY_CANVAS_FILTER_PRESET: GimpFilterPreset = {
    id: "apply_canvas",
    name: "Apply Canvas",
    category: "Artistic",
    gimpProcedure: "gegl:texturize-canvas",
    description: "Embosses a woven artist canvas fabric texture over the layer (GIMP gegl:texturize-canvas).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "depth",
            "label": "Weave Depth",
            "type": "number",
            "min": 1,
            "max": 35,
            "step": 1,
            "defaultValue": 12
        }
    ],
    code: `// GIMP Apply Canvas Texture (gegl:texturize-canvas)
const depth = Number(params.depth ?? 12);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const warp = Math.sin(x * 1.57) * Math.cos(y * 1.57);
        const weft = ((x + y) & 1) ? 0.5 : -0.5;
        const delta = (warp + weft) * depth;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + delta);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + delta);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + delta);
    }
}`
};
