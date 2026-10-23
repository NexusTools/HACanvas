import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const PHOTOCOPY_FILTER_PRESET: GimpFilterPreset = {
    id: "photocopy",
    name: "Photocopy",
    category: "Artistic",
    gimpProcedure: "gegl:photocopy",
    description: "Simulates high-contrast xerographic toner transfer by comparing local luminance against a broad neighborhood blur (GIMP gegl:photocopy).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "maskRadius",
            "label": "Mask Radius",
            "type": "number",
            "min": 2,
            "max": 20,
            "step": 1,
            "defaultValue": 6
        },
        {
            "key": "sharpness",
            "label": "Toner Contrast",
            "type": "number",
            "min": 0.5,
            "max": 4,
            "step": 0.2,
            "defaultValue": 1.8
        }
    ],
    code: `// GIMP Photocopy Toner Filter (gegl:photocopy)
const r = helpers.clamp(Math.round(Number(params.maskRadius ?? 6)), 1, 20);
const sharp = Number(params.sharpness ?? 1.8);
const bg = gegl.gaussianBlur(srcBuf, width, height, r, r);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const lumFg = helpers.luminance(srcBuf[i], srcBuf[i + 1], srcBuf[i + 2]);
        const lumBg = helpers.luminance(bg[i], bg[i + 1], bg[i + 2]) + 1;
        const ratio = Math.pow(helpers.clamp01(lumFg / lumBg), sharp);
        const v = helpers.clamp255(ratio * 255);
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, srcBuf[i + 3]);
    }
}`
};
