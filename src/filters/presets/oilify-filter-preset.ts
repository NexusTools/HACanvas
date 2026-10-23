import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const OILIFY_FILTER_PRESET: GimpFilterPreset = {
    id: "oilify",
    name: "Oilify (Oil Painting)",
    category: "Artistic",
    gimpProcedure: "gegl:oilify",
    description: "Simulates an oil painting by replacing each pixel with the most frequent intensity bucket in its neighborhood (GIMP gegl:oilify).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "maskRadius",
            "label": "Brush Mask Radius",
            "type": "number",
            "min": 1,
            "max": 6,
            "step": 1,
            "defaultValue": 3
        },
        {
            "key": "intensities",
            "label": "Intensity Levels",
            "type": "number",
            "min": 6,
            "max": 32,
            "step": 2,
            "defaultValue": 14
        }
    ],
    code: `// GIMP Oilify Painting Filter (gegl:oilify)
const r = helpers.clamp(Math.round(Number(params.maskRadius ?? 3)), 1, 6);
const bins = helpers.clamp(Math.round(Number(params.intensities ?? 14)), 4, 32);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const counts = new Int32Array(bins);
        const sumR = new Float32Array(bins);
        const sumG = new Float32Array(bins);
        const sumB = new Float32Array(bins);
        let maxCount = 0, bestBin = 0;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const [pr, pg, pb] = helpers.getPixel(srcBuf, width, height, x + dx, y + dy);
                const bin = Math.min(bins - 1, Math.floor((helpers.luminance(pr, pg, pb) / 256) * bins));
                counts[bin]++;
                sumR[bin] += pr; sumG[bin] += pg; sumB[bin] += pb;
                if (counts[bin] > maxCount) { maxCount = counts[bin]; bestBin = bin; }
            }
        }
        const c = counts[bestBin] || 1;
        const a = srcBuf[(y * width + x) * 4 + 3];
        helpers.setPixel(outBuf, width, height, x, y, sumR[bestBin] / c, sumG[bestBin] / c, sumB[bestBin] / c, a);
    }
}`
};
