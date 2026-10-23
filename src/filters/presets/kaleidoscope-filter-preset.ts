import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const KALEIDOSCOPE_FILTER_PRESET: GimpFilterPreset = {
    id: "kaleidoscope",
    name: "Kaleidoscope",
    category: "Distorts",
    gimpProcedure: "gegl:mirrors",
    description: "Creates N-fold symmetric geometric mirror reflections around the center (GIMP gegl:mirrors).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "mirrors",
            "label": "Mirror Sectors",
            "type": "number",
            "min": 2,
            "max": 24,
            "step": 1,
            "defaultValue": 6
        },
        {
            "key": "angle",
            "label": "Offset Angle (deg)",
            "type": "number",
            "min": 0,
            "max": 360,
            "step": 5,
            "defaultValue": 0
        }
    ],
    code: `// GIMP Kaleidoscope Mirrors (gegl:mirrors)
const nMirrors = helpers.clamp(Math.round(Number(params.mirrors ?? 6)), 2, 24);
const offsetRad = (Number(params.angle ?? 0) * Math.PI) / 180;
const sector = (Math.PI * 2) / nMirrors;
const cx = width * 0.5, cy = height * 0.5;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = x - cx, dy = y - cy;
        const dist = Math.hypot(dx, dy);
        let theta = ((Math.atan2(dy, dx) - offsetRad) % sector + sector) % sector;
        if (theta > sector * 0.5) theta = sector - theta;
        const finalAng = theta + offsetRad;
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, cx + Math.cos(finalAng) * dist, cy + Math.sin(finalAng) * dist, true);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
