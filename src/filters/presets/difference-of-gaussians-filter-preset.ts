import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const DIFFERENCE_OF_GAUSSIANS_FILTER_PRESET: GimpFilterPreset = {
    id: "difference_of_gaussians",
    name: "Difference of Gaussians (DoG)",
    category: "Edge-Detect",
    gimpProcedure: "gegl:difference-of-gaussians",
    description: "Band-pass edge detection by subtracting two Gaussian blurs of different radii (GIMP gegl:difference-of-gaussians).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius1",
            "label": "Inner Radius 1",
            "type": "number",
            "min": 1,
            "max": 12,
            "step": 1,
            "defaultValue": 1
        },
        {
            "key": "radius2",
            "label": "Outer Radius 2",
            "type": "number",
            "min": 2,
            "max": 24,
            "step": 1,
            "defaultValue": 4
        }
    ],
    code: `// GIMP Difference of Gaussians (gegl:difference-of-gaussians)
const r1 = helpers.clamp(Math.round(Number(params.radius1 ?? 1)), 1, 15);
const r2 = helpers.clamp(Math.round(Number(params.radius2 ?? 4)), 1, 25);
const g1 = gegl.gaussianBlur(srcBuf, width, height, r1, r1);
const g2 = gegl.gaussianBlur(srcBuf, width, height, r2, r2);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(255 - Math.abs(g1[i]     - g2[i])     * 4);
        outBuf[i + 1] = helpers.clamp255(255 - Math.abs(g1[i + 1] - g2[i + 1]) * 4);
        outBuf[i + 2] = helpers.clamp255(255 - Math.abs(g1[i + 2] - g2[i + 2]) * 4);
    }
}`
};
