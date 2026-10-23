import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SHIFT_FILTER_PRESET: GimpFilterPreset = {
    id: "shift",
    name: "Shift (Scanline Glitch)",
    category: "Distorts",
    gimpProcedure: "gegl:shift",
    description: "Displaces each horizontal scanline by a random offset up to shift amount (GIMP gegl:shift).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "shift",
            "label": "Max Shift (px)",
            "type": "number",
            "min": 1,
            "max": 50,
            "step": 1,
            "defaultValue": 10
        },
        {
            "key": "seed",
            "label": "Random Seed",
            "type": "number",
            "min": 0,
            "max": 999,
            "step": 1,
            "defaultValue": 7
        }
    ],
    code: `// GIMP Scanline Shift (gegl:shift)
const maxShift = helpers.clamp(Math.round(Number(params.shift ?? 10)), 1, 60);
const seed = Number(params.seed ?? 7);
for (let y = 0; y < height; y++) {
    const dx = Math.round((helpers.hash2d(y, seed) * 2 - 1) * maxShift);
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x + dx, y);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
