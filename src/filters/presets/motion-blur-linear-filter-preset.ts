import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const MOTION_BLUR_LINEAR_FILTER_PRESET: GimpFilterPreset = {
    id: "motion_blur_linear",
    name: "Linear Motion Blur",
    category: "Blur",
    gimpProcedure: "gegl:motion-blur-linear",
    description: "Directional linear motion blur along a configurable angle and streak length (GIMP gegl:motion-blur-linear).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "length",
            "label": "Blur Length (px)",
            "type": "number",
            "min": 1,
            "max": 60,
            "step": 1,
            "defaultValue": 12
        },
        {
            "key": "angle",
            "label": "Angle (degrees)",
            "type": "number",
            "min": 0,
            "max": 360,
            "step": 5,
            "defaultValue": 35
        }
    ],
    code: `// GIMP Linear Motion Blur (gegl:motion-blur-linear)
const len = helpers.clamp(Math.round(Number(params.length ?? params.radius ?? 12)), 1, 60);
const rad = (Number(params.angle ?? 35) * Math.PI) / 180;
const dx = Math.cos(rad);
const dy = Math.sin(rad);
const steps = Math.max(2, len);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let s = 0; s < steps; s++) {
            const offset = ((s / (steps - 1)) - 0.5) * len;
            const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, x + dx * offset, y + dy * offset);
            sr += r; sg += g; sb += b; sa += a;
        }
        helpers.setPixel(outBuf, width, height, x, y, sr / steps, sg / steps, sb / steps, sa / steps);
    }
}`
};
