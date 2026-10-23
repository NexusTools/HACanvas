import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SPIRAL_FILTER_PRESET: GimpFilterPreset = {
    id: "spiral",
    name: "Spiral",
    category: "Render",
    gimpProcedure: "gegl:spiral",
    description: "Renders an Archimedean or logarithmic hypnotic spiral pattern (GIMP gegl:spiral).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Coil Spacing (px)",
            "type": "number",
            "min": 8,
            "max": 100,
            "step": 4,
            "defaultValue": 28
        }
    ],
    code: `// GIMP Spiral Generator (gegl:spiral)
const spacing = Math.max(4, Number(params.radius ?? 28));
const cx = width * 0.5, cy = height * 0.5;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = x - cx, dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const ang = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
        const phase = ((dist / spacing + ang) % 1 + 1) % 1;
        const v = phase < 0.5 ? 25 : 240;
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, 255);
    }
}`
};
