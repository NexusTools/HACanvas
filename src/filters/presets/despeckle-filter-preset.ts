import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const DESPECKLE_FILTER_PRESET: GimpFilterPreset = {
    id: "despeckle",
    name: "Despeckle",
    category: "Enhance",
    gimpProcedure: "plug-in-despeckle",
    description: "Adaptive median filter from GIMP plug-ins/common/despeckle.c that removes dust and salt-and-pepper noise within black/white bounds.",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Radius (px)",
            "type": "number",
            "min": 1,
            "max": 5,
            "step": 1,
            "defaultValue": 2
        },
        {
            "key": "blackLevel",
            "label": "Black Level",
            "type": "number",
            "min": -1,
            "max": 60,
            "step": 1,
            "defaultValue": 7
        },
        {
            "key": "whiteLevel",
            "label": "White Level",
            "type": "number",
            "min": 200,
            "max": 256,
            "step": 1,
            "defaultValue": 248
        }
    ],
    code: `// GIMP Despeckle Plugin (plug-ins/common/despeckle.c)
const radius = helpers.clamp(Math.round(Number(params.radius ?? 2)), 1, 5);
const blackLevel = Number(params.blackLevel ?? 7);
const whiteLevel = Number(params.whiteLevel ?? 248);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const vals = [];
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x + dx, y + dy);
                const lum = helpers.luminance(r, g, b);
                if (lum > blackLevel && lum < whiteLevel) {
                    vals.push({ lum, r, g, b, a });
                }
            }
        }
        if (vals.length > 0) {
            vals.sort((a, b) => a.lum - b.lum);
            const mid = vals[vals.length >> 1];
            helpers.setPixel(outBuf, width, height, x, y, mid.r, mid.g, mid.b, mid.a);
        }
    }
}`
};
