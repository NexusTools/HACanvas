import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SOFTGLOW_FILTER_PRESET: GimpFilterPreset = {
    id: "softglow",
    name: "Softglow",
    category: "Light and Shadow",
    gimpProcedure: "gegl:softglow",
    description: "Diffuses highlights with a dreamy sigmoidal screen glow (GIMP gegl:softglow).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "glowRadius",
            "label": "Glow Radius (px)",
            "type": "number",
            "min": 1,
            "max": 25,
            "step": 1,
            "defaultValue": 5
        },
        {
            "key": "brightness",
            "label": "Brightness (0-1)",
            "type": "number",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.55
        }
    ],
    code: `// GIMP Softglow (gegl:softglow)
const radius = helpers.clamp(Math.round(Number(params.glowRadius ?? 5)), 1, 25);
const bright = helpers.clamp(Number(params.brightness ?? 0.55), 0, 1);
const blurred = gegl.gaussianBlur(srcBuf, width, height, radius, radius);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
            const a = srcBuf[i + c] / 255;
            const b = (blurred[i + c] / 255) * bright;
            outBuf[i + c] = helpers.clamp255((1 - (1 - a) * (1 - b)) * 255);
        }
    }
}`
};
