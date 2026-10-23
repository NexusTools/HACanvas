import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const PERLIN_NOISE_FILTER_PRESET: GimpFilterPreset = {
    id: "perlin_noise",
    name: "Perlin Noise (Solid Noise)",
    category: "Render",
    gimpProcedure: "gegl:perlin-noise",
    description: "Generates multi-octave 2D Perlin fractal Brownian motion cloud texture (GIMP gegl:perlin-noise).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scale",
            "label": "Feature Scale",
            "type": "number",
            "min": 4,
            "max": 120,
            "step": 4,
            "defaultValue": 32
        },
        {
            "key": "octaves",
            "label": "Octaves (1-6)",
            "type": "number",
            "min": 1,
            "max": 6,
            "step": 1,
            "defaultValue": 4
        }
    ],
    code: `// GIMP Perlin / Solid Noise (gegl:perlin-noise)
const scale = Math.max(2, Number(params.scale ?? 32));
const oct = helpers.clamp(Math.round(Number(params.octaves ?? 4)), 1, 6);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const v = helpers.clamp255(helpers.fbm2d(x / scale, y / scale, oct, 0.5, 2.0, 7) * 255);
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, 255);
    }
}`
};
