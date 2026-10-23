import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const PLASMA_FILTER_PRESET: GimpFilterPreset = {
    id: "plasma",
    name: "Plasma Cloud",
    category: "Render",
    gimpProcedure: "gegl:plasma",
    description: "Renders a colorful multi-frequency rainbow plasma turbulence texture (GIMP gegl:plasma).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "turbulence",
            "label": "Turbulence Scale",
            "type": "number",
            "min": 1,
            "max": 10,
            "step": 0.5,
            "defaultValue": 3
        },
        {
            "key": "seed",
            "label": "Random Seed",
            "type": "number",
            "min": 0,
            "max": 999,
            "step": 1,
            "defaultValue": 42
        }
    ],
    code: `// GIMP Plasma Cloud Generator (gegl:plasma)
const turb = Number(params.turbulence ?? 3.0) * 0.015;
const seed = Number(params.seed ?? 42);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const n1 = helpers.fbm2d(x * turb, y * turb, 4, 0.5, 2.0, seed);
        const n2 = helpers.fbm2d(x * turb + 7.3, y * turb + 2.9, 4, 0.5, 2.0, seed + 13);
        const [r, g, b] = helpers.hsvToRgb((n1 * 360 + n2 * 180) % 360, 0.85, 0.35 + n2 * 0.65);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, 255);
    }
}`
};
