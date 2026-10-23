import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NOISE_REDUCTION_FILTER_PRESET: GimpFilterPreset = {
    id: "noise_reduction",
    name: "Noise Reduction (Anisotropic)",
    category: "Enhance",
    gimpProcedure: "gegl:noise-reduction",
    description: "Iterative edge-preserving anisotropic smoothing filter (GIMP gegl:noise-reduction).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "strength",
            "label": "Strength (1-10)",
            "type": "number",
            "min": 1,
            "max": 10,
            "step": 1,
            "defaultValue": 4
        }
    ],
    code: `// GIMP Anisotropic Noise Reduction (gegl:noise-reduction)
const strength = helpers.clamp(Number(params.strength ?? 4), 1, 10);
const thresh = strength * 12;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [cr, cg, cb, ca] = helpers.getPixel(srcBuf, width, height, x, y);
        let sr = cr, sg = cg, sb = cb, wSum = 1;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const [nr, ng, nb] = helpers.getPixel(srcBuf, width, height, x + dx, y + dy);
                const d = Math.hypot(nr - cr, ng - cg, nb - cb);
                const w = Math.exp(-(d * d) / (2 * thresh * thresh));
                sr += nr * w; sg += ng * w; sb += nb * w;
                wSum += w;
            }
        }
        helpers.setPixel(outBuf, width, height, x, y, sr / wSum, sg / wSum, sb / wSum, ca);
    }
}`
};
