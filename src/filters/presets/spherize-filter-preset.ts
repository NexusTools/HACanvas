import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SPHERIZE_FILTER_PRESET: GimpFilterPreset = {
    id: "spherize",
    name: "Spherize",
    category: "Distorts",
    gimpProcedure: "gegl:spherize",
    description: "Wraps the image around a 3D spherical or hemispherical lens cap (GIMP gegl:spherize).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "amount",
            "label": "Curvature (-1..1)",
            "type": "number",
            "min": -1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.65
        }
    ],
    code: `// GIMP Spherize (gegl:spherize)
const amount = helpers.clamp(Number(params.amount ?? 0.65), -1, 1);
const cx = width * 0.5, cy = height * 0.5;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const nx = (x - cx) / (cx || 1);
        const ny = (y - cy) / (cy || 1);
        const r = Math.hypot(nx, ny);
        if (r > 0 && r < 1.0) {
            const nr = amount >= 0
                ? helpers.lerp(r, Math.asin(r) / (Math.PI * 0.5), amount)
                : helpers.lerp(r, Math.sin(r * Math.PI * 0.5), -amount);
            const scale = nr / r;
            const [pr, pg, pb, pa] = helpers.sampleBilinear(srcBuf, width, height, cx + nx * scale * cx, cy + ny * scale * cy);
            helpers.setPixel(outBuf, width, height, x, y, pr, pg, pb, pa);
        }
    }
}`
};
