import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const BOX_BLUR_FILTER_PRESET: GimpFilterPreset = {
    id: "box_blur",
    name: "Box Blur",
    category: "Blur",
    gimpProcedure: "gegl:box-blur",
    description: "Uniform equal-weight rectangular box neighborhood blur (GIMP gegl:box-blur).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Box Radius (px)",
            "type": "number",
            "min": 1,
            "max": 35,
            "step": 1,
            "defaultValue": 3
        }
    ],
    code: `// GIMP Box Blur (gegl:box-blur)
const radius = helpers.clamp(Math.round(Number(params.radius ?? 3)), 1, 35);
const blurred = gegl.boxBlur(srcBuf, width, height, radius, radius);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = blurred[i];
        outBuf[i + 1] = blurred[i + 1];
        outBuf[i + 2] = blurred[i + 2];
        outBuf[i + 3] = blurred[i + 3];
    }
}`
};
