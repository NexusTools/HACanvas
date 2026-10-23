import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CONTRAST_RETINEX_FILTER_PRESET: GimpFilterPreset = {
    id: "contrast_retinex",
    name: "Retinex (MSRCR)",
    category: "Enhance",
    gimpProcedure: "plug-in-retinex",
    description: "Multi-Scale Retinex with Color Restoration for dynamic range compression and shadow detail recovery (GIMP plug-ins/common/contrast-retinex.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scale",
            "label": "Scale Radius",
            "type": "number",
            "min": 4,
            "max": 40,
            "step": 2,
            "defaultValue": 12
        },
        {
            "key": "dynamic",
            "label": "Dynamic Contrast",
            "type": "number",
            "min": 0.5,
            "max": 3.5,
            "step": 0.1,
            "defaultValue": 1.4
        }
    ],
    code: `// GIMP Multi-Scale Retinex (plug-ins/common/contrast-retinex.c)
const scale = helpers.clamp(Math.round(Number(params.scale ?? 12)), 2, 40);
const dyn = helpers.clamp(Number(params.dynamic ?? 1.4), 0.5, 4.0);
const b1 = gegl.gaussianBlur(srcBuf, width, height, Math.max(1, Math.round(scale * 0.35)));
const b2 = gegl.gaussianBlur(srcBuf, width, height, scale);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
            const orig = srcBuf[i + c] + 1;
            const surr = 0.5 * (b1[i + c] + b2[i + c]) + 1;
            const msr = Math.log(orig) - Math.log(surr);
            outBuf[i + c] = helpers.clamp255(srcBuf[i + c] * 0.65 + (128 + msr * 95 * dyn) * 0.35);
        }
        outBuf[i + 3] = srcBuf[i + 3];
    }
}`
};
