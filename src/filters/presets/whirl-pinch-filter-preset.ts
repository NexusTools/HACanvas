import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const WHIRL_PINCH_FILTER_PRESET: GimpFilterPreset = {
    id: "whirl_pinch",
    name: "Whirl and Pinch",
    category: "Distorts",
    gimpProcedure: "gegl:whirl-pinch",
    description: "Distorts the image by whirling pixels around the center and pinching or bulging radially (GIMP gegl:whirl-pinch).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "whirl",
            "label": "Whirl Angle (deg)",
            "type": "number",
            "min": -360,
            "max": 360,
            "step": 10,
            "defaultValue": 120
        },
        {
            "key": "pinch",
            "label": "Pinch (-1..1)",
            "type": "number",
            "min": -1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.35
        }
    ],
    code: `// GIMP Whirl and Pinch (gegl:whirl-pinch)
const whirlRad = (Number(params.whirl ?? 120) * Math.PI) / 180;
const pinch = helpers.clamp(Number(params.pinch ?? 0.35), -1, 1);
const cx = width * 0.5, cy = height * 0.5;
const radius = Math.min(cx, cy) || 1;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy) / radius;
        if (d < 1.0) {
            const factor = Math.pow(Math.sin((Math.PI * 0.5) * d), -pinch);
            const nd = d * factor;
            const ang = Math.atan2(dy, dx) + whirlRad * (1 - d) * (1 - d);
            const sx = cx + Math.cos(ang) * nd * radius;
            const sy = cy + Math.sin(ang) * nd * radius;
            const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, sx, sy);
            helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
        }
    }
}`
};
