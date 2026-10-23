import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SINUS_FILTER_PRESET: GimpFilterPreset = {
    id: "sinus",
    name: "Sinus",
    category: "Render",
    gimpProcedure: "gegl:sinus",
    description: "Generates 2D sinusoidal wave interference textures (GIMP gegl:sinus).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scaleX",
            "label": "X Frequency",
            "type": "number",
            "min": 1,
            "max": 30,
            "step": 1,
            "defaultValue": 6
        },
        {
            "key": "scaleY",
            "label": "Y Frequency",
            "type": "number",
            "min": 1,
            "max": 30,
            "step": 1,
            "defaultValue": 6
        }
    ],
    code: `// GIMP Sinus Interference Pattern (gegl:sinus)
const fx = (Number(params.scaleX ?? 6) * Math.PI * 2) / Math.max(1, width);
const fy = (Number(params.scaleY ?? 6) * Math.PI * 2) / Math.max(1, height);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const w = 0.5 + 0.5 * Math.sin(x * fx + Math.sin(y * fy) * 2.2) * Math.cos(y * fy - Math.cos(x * fx) * 1.8);
        const [r, g, b] = helpers.hsvToRgb(200 + w * 90, 0.75, 0.25 + w * 0.75);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, 255);
    }
}`
};
