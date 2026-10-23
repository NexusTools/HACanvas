import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const DISPLACE_FILTER_PRESET: GimpFilterPreset = {
    id: "displace",
    name: "Displace",
    category: "Map",
    gimpProcedure: "gegl:displace",
    description: "Displaces pixel coordinates horizontally and vertically proportional to local luminance deviation from 128 (GIMP gegl:displace).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "amountX",
            "label": "Displace X (px)",
            "type": "number",
            "min": -50,
            "max": 50,
            "step": 2,
            "defaultValue": 14
        },
        {
            "key": "amountY",
            "label": "Displace Y (px)",
            "type": "number",
            "min": -50,
            "max": 50,
            "step": 2,
            "defaultValue": 14
        }
    ],
    code: `// GIMP Displace Map (gegl:displace)
const ax = Number(params.amountX ?? 14);
const ay = Number(params.amountY ?? 14);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [mr, mg] = helpers.getPixel(srcBuf, width, height, x, y);
        const dx = ((mr - 128) / 128) * ax;
        const dy = ((mg - 128) / 128) * ay;
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, x + dx, y + dy, true);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
