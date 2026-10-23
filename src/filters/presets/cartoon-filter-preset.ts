import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CARTOON_FILTER_PRESET: GimpFilterPreset = {
    id: "cartoon",
    name: "Cartoon",
    category: "Artistic",
    gimpProcedure: "gegl:cartoon",
    description: "Creates a comic-book cartoon illustration with heavy black ink outlines and posterized color fills (GIMP gegl:cartoon).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "maskRadius",
            "label": "Edge Radius",
            "type": "number",
            "min": 1,
            "max": 10,
            "step": 1,
            "defaultValue": 3
        },
        {
            "key": "pctBlack",
            "label": "Ink Darkness (0-1)",
            "type": "number",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.65
        }
    ],
    code: `// GIMP Cartoon Filter (gegl:cartoon)
const r = helpers.clamp(Math.round(Number(params.maskRadius ?? 3)), 1, 10);
const ink = helpers.clamp(Number(params.pctBlack ?? 0.65), 0, 1);
const smooth = gegl.gaussianBlur(srcBuf, width, height, r, r);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const grad = helpers.sobelAt(srcBuf, width, height, x, y);
        const edge = grad.mag > 75 ? Math.max(0, 1 - (grad.mag / 255) * ink * 1.4) : 1.0;
        const i = (y * width + x) * 4;
        const q = 32;
        outBuf[i]     = helpers.clamp255(Math.round(smooth[i]     / q) * q * edge);
        outBuf[i + 1] = helpers.clamp255(Math.round(smooth[i + 1] / q) * q * edge);
        outBuf[i + 2] = helpers.clamp255(Math.round(smooth[i + 2] / q) * q * edge);
    }
}`
};
