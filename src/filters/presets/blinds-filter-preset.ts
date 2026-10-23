import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const BLINDS_FILTER_PRESET: GimpFilterPreset = {
    id: "blinds",
    name: "Blinds (Venetian Slats)",
    category: "Distorts",
    gimpProcedure: "plug-in-blinds",
    description: "Simulates horizontal or vertical Venetian window blinds tilted at an angle (GIMP plug-ins/common/blinds.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "angle",
            "label": "Slat Angle (0-90 deg)",
            "type": "number",
            "min": 5,
            "max": 85,
            "step": 5,
            "defaultValue": 40
        },
        {
            "key": "numSegments",
            "label": "Number of Slats",
            "type": "number",
            "min": 2,
            "max": 32,
            "step": 1,
            "defaultValue": 8
        }
    ],
    code: `// GIMP Blinds Plugin (plug-ins/common/blinds.c)
const angRad = (helpers.clamp(Number(params.angle ?? 40), 1, 89) * Math.PI) / 180;
const slats = helpers.clamp(Math.round(Number(params.numSegments ?? 8)), 2, 40);
const slatHeight = Math.max(4, height / slats);
const cosA = Math.max(0.08, Math.cos(angRad));
for (let y = 0; y < height; y++) {
    const slatIdx = Math.floor(y / slatHeight);
    const slatCenter = (slatIdx + 0.5) * slatHeight;
    const dy = y - slatCenter;
    const srcOffset = dy / cosA;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        if (Math.abs(srcOffset) > slatHeight * 0.5) {
            helpers.setPixel(outBuf, width, height, x, y, 18, 20, 28, 255);
        } else {
            const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, x, slatCenter + srcOffset);
            const shade = 0.75 + 0.25 * cosA;
            helpers.setPixel(outBuf, width, height, x, y, r * shade, g * shade, b * shade, a);
        }
    }
}`
};
