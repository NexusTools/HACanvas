import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const MOTION_BLUR_CIRCULAR_FILTER_PRESET: GimpFilterPreset = {
    id: "motion_blur_circular",
    name: "Circular Motion Blur",
    category: "Blur",
    gimpProcedure: "gegl:motion-blur-circular",
    description: "Rotational spin blur around the canvas center across an arc angle (GIMP gegl:motion-blur-circular).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "angle",
            "label": "Spin Arc Angle (deg)",
            "type": "number",
            "min": 1,
            "max": 90,
            "step": 1,
            "defaultValue": 15
        }
    ],
    code: `// GIMP Circular Motion Blur (gegl:motion-blur-circular)
const arcRad = (helpers.clamp(Number(params.angle ?? 15), 1, 90) * Math.PI) / 180;
const cx = width * 0.5, cy = height * 0.5;
const steps = 11;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const rx = x - cx, ry = y - cy;
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let s = 0; s < steps; s++) {
            const theta = ((s / (steps - 1)) - 0.5) * arcRad;
            const c = Math.cos(theta), sn = Math.sin(theta);
            const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, cx + rx * c - ry * sn, cy + rx * sn + ry * c);
            sr += r; sg += g; sb += b; sa += a;
        }
        helpers.setPixel(outBuf, width, height, x, y, sr / steps, sg / steps, sb / steps, sa / steps);
    }
}`
};
