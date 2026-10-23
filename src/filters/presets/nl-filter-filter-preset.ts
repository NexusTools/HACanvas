import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NL_FILTER_FILTER_PRESET: GimpFilterPreset = {
    id: "nl_filter",
    name: "NL Filter (Non-Linear)",
    category: "Enhance",
    gimpProcedure: "plug-in-nlfilt",
    description: "Non-linear hexagonal neighborhood filter supporting alpha-trimmed mean, optimal estimation, and edge enhancement (GIMP plug-ins/common/nl-filter.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "alpha",
            "label": "Alpha Parameter",
            "type": "number",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.45
        },
        {
            "key": "radius",
            "label": "Radius",
            "type": "number",
            "min": 1,
            "max": 5,
            "step": 1,
            "defaultValue": 1
        }
    ],
    code: `// GIMP Non-Linear Filter (plug-ins/common/nl-filter.c)
const alpha = helpers.clamp(Number(params.alpha ?? 0.45), 0, 1);
const r = helpers.clamp(Math.round(Number(params.radius ?? 1)), 1, 5);
const offsets = [[0,-r], [r,-r], [-r,0], [0,0], [r,0], [-r,r], [0,r]];
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [cr, cg, cb, ca] = helpers.getPixel(srcBuf, width, height, x, y);
        let sr = 0, sg = 0, sb = 0;
        for (const [ox, oy] of offsets) {
            const [nr, ng, nb] = helpers.getPixel(srcBuf, width, height, x + ox, y + oy);
            sr += nr; sg += ng; sb += nb;
        }
        const mr = sr / offsets.length, mg = sg / offsets.length, mb = sb / offsets.length;
        helpers.setPixel(
            outBuf, width, height, x, y,
            cr + (mr - cr) * (1 - alpha) + (cr - mr) * alpha * 0.8,
            cg + (mg - cg) * (1 - alpha) + (cg - mg) * alpha * 0.8,
            cb + (mb - cb) * (1 - alpha) + (cb - mb) * alpha * 0.8,
            ca
        );
    }
}`
};
