import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const GRADIENT_FLARE_FILTER_PRESET: GimpFilterPreset = {
    id: "gradient_flare",
    name: "Gradient Flare",
    category: "Light and Shadow",
    gimpProcedure: "plug-in-gflare",
    description: "Composite gradient radial corona, angular rays, and secondary chromatic rings (GIMP plug-ins/gradient-flare/).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Flare Radius (px)",
            "type": "number",
            "min": 15,
            "max": 180,
            "step": 5,
            "defaultValue": 65
        }
    ],
    code: `// GIMP Gradient Flare (plug-ins/gradient-flare/gradient-flare.c)
const rad = Math.max(10, Number(params.radius ?? 65));
const cx = width * 0.5, cy = height * 0.5;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy) / rad;
        const ang = Math.atan2(dy, dx);
        const rays = (0.5 + 0.5 * Math.sin(ang * 16)) * Math.exp(-d * 1.4);
        const ring = Math.exp(-Math.pow(d - 0.75, 2) * 35) * 0.6;
        const core = Math.exp(-d * d * 4);
        const [rR, gG, bB] = helpers.hsvToRgb(((d * 180) + 200) % 360, 0.75, 1.0);
        const i = (y * width + x) * 4;
        const w = helpers.clamp01(core + rays * 0.5 + ring);
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + rR * w + core * 140);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + gG * w + core * 140);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + bB * w + core * 140);
    }
}`
};
