import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const MOTION_BLUR_ZOOM_FILTER_PRESET: GimpFilterPreset = {
    id: "motion_blur_zoom",
    name: "Zoom Motion Blur",
    category: "Blur",
    gimpProcedure: "gegl:motion-blur-zoom",
    description: "Radial zoom motion blur radiating outward from the canvas center (GIMP gegl:motion-blur-zoom).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "factor",
            "label": "Zoom Blur Factor",
            "type": "number",
            "min": 0.02,
            "max": 0.8,
            "step": 0.02,
            "defaultValue": 0.18
        }
    ],
    code: `// GIMP Zoom Motion Blur (gegl:motion-blur-zoom)
const factor = helpers.clamp(Number(params.factor ?? 0.18), 0.01, 0.85);
const cx = width * 0.5, cy = height * 0.5;
const steps = 10;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let s = 0; s < steps; s++) {
            const scale = 1 - (s / (steps - 1)) * factor;
            const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, cx + (x - cx) * scale, cy + (y - cy) * scale);
            sr += r; sg += g; sb += b; sa += a;
        }
        helpers.setPixel(outBuf, width, height, x, y, sr / steps, sg / steps, sb / steps, sa / steps);
    }
}`
};
