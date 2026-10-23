import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const VIGNETTE_FILTER_PRESET: GimpFilterPreset = {
    id: "vignette",
    name: "Vignette",
    category: "Light and Shadow",
    gimpProcedure: "gegl:vignette",
    description: "Applies a smooth elliptical radial darkening around the outer frame edges (GIMP gegl:vignette).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Inner Radius (0.2-1.5)",
            "type": "number",
            "min": 0.2,
            "max": 1.5,
            "step": 0.05,
            "defaultValue": 0.85
        },
        {
            "key": "softness",
            "label": "Softness (0.1-1.0)",
            "type": "number",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.55
        }
    ],
    code: `// GIMP Vignette (gegl:vignette)
const rad = Number(params.radius ?? 0.85);
const soft = Math.max(0.05, Number(params.softness ?? 0.55));
const cx = width * 0.5, cy = height * 0.5;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const nx = (x - cx) / (cx || 1);
        const ny = (y - cy) / (cy || 1);
        const d = Math.hypot(nx, ny);
        const vig = 1 - helpers.smoothstep(rad - soft, rad + soft * 0.5, d);
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     * vig);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] * vig);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] * vig);
    }
}`
};
