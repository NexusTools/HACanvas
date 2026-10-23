import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SUPERNOVA_FILTER_PRESET: GimpFilterPreset = {
    id: "supernova",
    name: "Supernova",
    category: "Light and Shadow",
    gimpProcedure: "gegl:supernova",
    description: "Renders a blinding star explosion with a glowing core and radial diffraction spokes (GIMP gegl:supernova).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "spokes",
            "label": "Number of Spokes",
            "type": "number",
            "min": 4,
            "max": 120,
            "step": 4,
            "defaultValue": 32
        },
        {
            "key": "radius",
            "label": "Core Radius (px)",
            "type": "number",
            "min": 4,
            "max": 80,
            "step": 2,
            "defaultValue": 20
        },
        {
            "key": "color",
            "label": "Star Color",
            "type": "color",
            "defaultValue": "#40c4ff"
        }
    ],
    code: `// GIMP Supernova Starburst (gegl:supernova)
const spokes = helpers.clamp(Math.round(Number(params.spokes ?? 32)), 4, 128);
const coreR = Math.max(2, Number(params.radius ?? 20));
const col = helpers.parseColor(String(params.color || "#40c4ff"));
const cx = width * 0.5, cy = height * 0.5;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = x - cx, dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const ray = Math.pow(0.5 + 0.5 * Math.cos(ang * spokes), 6) * Math.exp(-dist / (coreR * 3.5));
        const core = Math.exp(-(dist * dist) / (2 * coreR * coreR));
        const glow = helpers.clamp01(core + ray);
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + col.r * glow + core * 180);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + col.g * glow + core * 180);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + col.b * glow + core * 180);
        outBuf[i + 3] = Math.max(srcBuf[i + 3], helpers.clamp255(glow * 255));
    }
}`
};
