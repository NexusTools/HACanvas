import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const LENS_FLARE_FILTER_PRESET: GimpFilterPreset = {
    id: "lens_flare",
    name: "Lens Flare",
    category: "Light and Shadow",
    gimpProcedure: "gegl:lens-flare",
    description: "Overlays multi-element optical camera lens flare halos along the diagonal axis (GIMP gegl:lens-flare).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "posX",
            "label": "Source X (0-1)",
            "type": "number",
            "min": 0.1,
            "max": 0.9,
            "step": 0.05,
            "defaultValue": 0.3
        },
        {
            "key": "posY",
            "label": "Source Y (0-1)",
            "type": "number",
            "min": 0.1,
            "max": 0.9,
            "step": 0.05,
            "defaultValue": 0.3
        }
    ],
    code: `// GIMP Optical Lens Flare (gegl:lens-flare)
const fx = Number(params.posX ?? 0.3) * width;
const fy = Number(params.posY ?? 0.3) * height;
const cx = width * 0.5, cy = height * 0.5;
const vx = cx - fx, vy = cy - fy;
const maxDim = Math.hypot(width, height) || 1;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dMain = Math.hypot(x - fx, y - fy) / (maxDim * 0.18);
        const dRing = Math.abs(Math.hypot(x - (fx + vx * 1.4), y - (fy + vy * 1.4)) - maxDim * 0.09) / (maxDim * 0.018);
        const mainGlow = Math.exp(-dMain * dMain * 2.5);
        const ringGlow = Math.exp(-dRing * dRing * 2.0) * 0.45;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + (mainGlow + ringGlow * 1.2) * 255);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + (mainGlow * 0.9 + ringGlow * 0.8) * 255);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + (mainGlow * 0.75 + ringGlow * 1.4) * 255);
    }
}`
};
