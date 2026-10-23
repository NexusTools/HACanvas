import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const STENCIL_CHROME_FILTER_PRESET: GimpFilterPreset = {
    id: "stencil_chrome",
    name: "Stencil Chrome",
    category: "Decor",
    gimpProcedure: "script-fu-sota-chrome-it",
    description: "Applies a reflective liquid-metal chrome horizon curve to the image (GIMP script-fu-sota-chrome-it).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": " sheen",
            "label": "Chrome Harmonics",
            "type": "number",
            "min": 1,
            "max": 8,
            "step": 0.5,
            "defaultValue": 3
        }
    ],
    code: `// GIMP Stencil Chrome Metallic Reflection (script-fu-sota-chrome-it)
const harm = Number(params.sheen ?? 3.0);
const smooth = gegl.gaussianBlur(srcBuf, width, height, 2, 2);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const lum = helpers.luminance(smooth[i], smooth[i + 1], smooth[i + 2]) / 255;
        const refl = 0.5 + 0.5 * Math.sin(lum * Math.PI * harm * 2);
        helpers.setPixel(
            outBuf, width, height, x, y,
            refl * 235 + 15,
            refl * 242 + 12,
            Math.min(255, refl * 255 + 25),
            srcBuf[i + 3]
        );
    }
}`
};
