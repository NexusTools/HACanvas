import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SELECTIVE_GAUSSIAN_BLUR_FILTER_PRESET: GimpFilterPreset = {
    id: "selective_gaussian_blur",
    name: "Selective Gaussian Blur",
    category: "Blur",
    gimpProcedure: "gegl:selective-gaussian-blur",
    description: "Edge-preserving bilateral blur that only averages neighboring pixels within a max delta threshold (GIMP gegl:selective-gaussian-blur).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Blur Radius (px)",
            "type": "number",
            "min": 1,
            "max": 10,
            "step": 1,
            "defaultValue": 3
        },
        {
            "key": "maxDelta",
            "label": "Max Delta (0-255)",
            "type": "number",
            "min": 5,
            "max": 200,
            "step": 5,
            "defaultValue": 45
        }
    ],
    code: `// GIMP Selective Gaussian Blur (gegl:selective-gaussian-blur)
const r = helpers.clamp(Math.round(Number(params.radius ?? 3)), 1, 10);
const maxDelta = helpers.clamp(Number(params.maxDelta ?? 45), 1, 255);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [cr, cg, cb, ca] = helpers.getPixel(srcBuf, width, height, x, y);
        let sr = 0, sg = 0, sb = 0, wSum = 0;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const [nr, ng, nb] = helpers.getPixel(srcBuf, width, height, x + dx, y + dy);
                const diff = (Math.abs(nr - cr) + Math.abs(ng - cg) + Math.abs(nb - cb)) / 3;
                if (diff <= maxDelta) {
                    const w = 1 - diff / (maxDelta + 1);
                    sr += nr * w; sg += ng * w; sb += nb * w;
                    wSum += w;
                }
            }
        }
        helpers.setPixel(outBuf, width, height, x, y, sr / (wSum || 1), sg / (wSum || 1), sb / (wSum || 1), ca);
    }
}`
};
