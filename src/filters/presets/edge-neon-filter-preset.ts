import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const EDGE_NEON_FILTER_PRESET: GimpFilterPreset = {
    id: "edge_neon",
    name: "Edge: Neon",
    category: "Edge-Detect",
    gimpProcedure: "gegl:edge-neon",
    description: "Transforms image edges into glowing neon tubes against a dark background (GIMP gegl:edge-neon).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Tube Radius (px)",
            "type": "number",
            "min": 1,
            "max": 8,
            "step": 1,
            "defaultValue": 2
        },
        {
            "key": "amount",
            "label": "Glow Intensity",
            "type": "number",
            "min": 0.5,
            "max": 4,
            "step": 0.2,
            "defaultValue": 1.8
        }
    ],
    code: `// GIMP Neon Edge Detector (gegl:edge-neon)
const r = helpers.clamp(Math.round(Number(params.radius ?? 2)), 1, 8);
const intensity = Number(params.amount ?? 1.8);
const blurred = gegl.gaussianBlur(srcBuf, width, height, r, r);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const p0 = helpers.getPixel(blurred, width, height, x, y);
        const px = helpers.getPixel(blurred, width, height, x + r, y);
        const py = helpers.getPixel(blurred, width, height, x, y + r);
        const er = Math.hypot(p0[0] - px[0], p0[0] - py[0]) * intensity * 2.2;
        const eg = Math.hypot(p0[1] - px[1], p0[1] - py[1]) * intensity * 2.2;
        const eb = Math.hypot(p0[2] - px[2], p0[2] - py[2]) * intensity * 2.2;
        helpers.setPixel(outBuf, width, height, x, y, er, eg, eb, p0[3]);
    }
}`
};
