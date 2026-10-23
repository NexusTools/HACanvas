import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SIMPLEX_NOISE_FILTER_PRESET: GimpFilterPreset = {
    id: "simplex_noise",
    name: "Simplex Noise",
    category: "Render",
    gimpProcedure: "gegl:simplex-noise",
    description: "Generates isotropic triangular-lattice 2D Simplex gradient noise (GIMP gegl:simplex-noise).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scale",
            "label": "Feature Scale",
            "type": "number",
            "min": 4,
            "max": 120,
            "step": 4,
            "defaultValue": 28
        }
    ],
    code: `// GIMP Simplex Noise (gegl:simplex-noise)
const scale = Math.max(2, Number(params.scale ?? 28));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const v = helpers.clamp255((helpers.simplex2d(x / scale, y / scale, 21) * 0.5 + 0.5) * 255);
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, 255);
    }
}`
};
