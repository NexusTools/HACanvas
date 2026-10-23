import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const ALIEN_MAP_FILTER_PRESET: GimpFilterPreset = {
    id: "alien_map",
    name: "Alien Map",
    category: "Colors",
    gimpProcedure: "gegl:alien-map",
    description: "Modulates RGB channels through trigonometric sine/cosine frequency and phase curves (GIMP gegl:alien-map).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "cpn1Freq",
            "label": "Red Frequency",
            "type": "number",
            "min": 0.5,
            "max": 5,
            "step": 0.25,
            "defaultValue": 1.5
        },
        {
            "key": "cpn2Freq",
            "label": "Green Frequency",
            "type": "number",
            "min": 0.5,
            "max": 5,
            "step": 0.25,
            "defaultValue": 2
        },
        {
            "key": "cpn3Freq",
            "label": "Blue Frequency",
            "type": "number",
            "min": 0.5,
            "max": 5,
            "step": 0.25,
            "defaultValue": 2.5
        }
    ],
    code: `// GIMP Alien Map Trigonometric Color Remapper (gegl:alien-map)
const fR = Number(params.cpn1Freq ?? 1.5);
const fG = Number(params.cpn2Freq ?? 2.0);
const fB = Number(params.cpn3Freq ?? 2.5);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255((0.5 + 0.5 * Math.sin(((srcBuf[i]     / 255) * 2 - 1) * Math.PI * fR)) * 255);
        outBuf[i + 1] = helpers.clamp255((0.5 + 0.5 * Math.cos(((srcBuf[i + 1] / 255) * 2 - 1) * Math.PI * fG)) * 255);
        outBuf[i + 2] = helpers.clamp255((0.5 + 0.5 * Math.sin(((srcBuf[i + 2] / 255) * 2 - 1) * Math.PI * fB)) * 255);
    }
}`
};
