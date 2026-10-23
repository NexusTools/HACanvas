import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const ILLUSION_FILTER_PRESET: GimpFilterPreset = {
    id: "illusion",
    name: "Illusion",
    category: "Map",
    gimpProcedure: "gegl:illusion",
    description: "Superimposes radially offset angular sector copies for a kaleidoscopic prism illusion (GIMP gegl:illusion).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "divisions",
            "label": "Radial Divisions",
            "type": "number",
            "min": 2,
            "max": 24,
            "step": 1,
            "defaultValue": 8
        }
    ],
    code: `// GIMP Illusion Prism Filter (gegl:illusion)
const div = helpers.clamp(Math.round(Number(params.divisions ?? 8)), 2, 24);
const cx = width * 0.5, cy = height * 0.5;
const radius = Math.hypot(cx, cy) || 1;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = x - cx, dy = y - cy;
        const angle = Math.atan2(dy, dx);
        const offset = Math.sin(angle * div) * radius * 0.18;
        const [r1, g1, b1, a1] = helpers.getPixel(srcBuf, width, height, x, y);
        const [r2, g2, b2] = helpers.sampleBilinear(srcBuf, width, height, x + Math.cos(angle) * offset, y + Math.sin(angle) * offset, true);
        helpers.setPixel(outBuf, width, height, x, y, (r1 + r2) * 0.5, (g1 + g2) * 0.5, (b1 + b2) * 0.5, a1);
    }
}`
};
