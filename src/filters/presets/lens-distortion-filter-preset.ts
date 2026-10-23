import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const LENS_DISTORTION_FILTER_PRESET: GimpFilterPreset = {
    id: "lens_distortion",
    name: "Lens Distortion",
    category: "Distorts",
    gimpProcedure: "gegl:lens-distortion",
    description: "Barrel or pincushion optical polynomial lens distortion with optional chromatic fringe (GIMP gegl:lens-distortion).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "main",
            "label": "Main Distortion (-1..1)",
            "type": "number",
            "min": -1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.35
        },
        {
            "key": "fringe",
            "label": "Chromatic Fringe",
            "type": "number",
            "min": 0,
            "max": 0.15,
            "step": 0.01,
            "defaultValue": 0.03
        }
    ],
    code: `// GIMP Lens Distortion (gegl:lens-distortion)
const k1 = Number(params.main ?? 0.35);
const fringe = Number(params.fringe ?? 0.03);
const cx = width * 0.5, cy = height * 0.5;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const nx = (x - cx) / (cx || 1);
        const ny = (y - cy) / (cy || 1);
        const r2 = nx * nx + ny * ny;
        const scale = 1 + k1 * r2;
        const [rR] = helpers.sampleBilinear(srcBuf, width, height, cx + nx * (scale + fringe) * cx, cy + ny * (scale + fringe) * cy);
        const [, gG, , aA] = helpers.sampleBilinear(srcBuf, width, height, cx + nx * scale * cx, cy + ny * scale * cy);
        const [, , bB] = helpers.sampleBilinear(srcBuf, width, height, cx + nx * (scale - fringe) * cx, cy + ny * (scale - fringe) * cy);
        helpers.setPixel(outBuf, width, height, x, y, rR, gG, bB, aA);
    }
}`
};
