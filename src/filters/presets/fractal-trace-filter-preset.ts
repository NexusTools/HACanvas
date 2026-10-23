import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const FRACTAL_TRACE_FILTER_PRESET: GimpFilterPreset = {
    id: "fractal_trace",
    name: "Fractal Trace",
    category: "Map",
    gimpProcedure: "gegl:fractal-trace",
    description: "Warps image coordinates through Mandelbrot complex quadratic iterations z = z^2 + c (GIMP gegl:fractal-trace).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "depth",
            "label": "Iteration Depth",
            "type": "number",
            "min": 1,
            "max": 8,
            "step": 1,
            "defaultValue": 3
        }
    ],
    code: `// GIMP Fractal Trace (gegl:fractal-trace)
const depth = helpers.clamp(Math.round(Number(params.depth ?? 3)), 1, 8);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const cx = ((x / Math.max(1, width - 1)) - 0.65) * 1.8;
        const cy = ((y / Math.max(1, height - 1)) - 0.5) * 1.8;
        let zx = cx, zy = cy;
        for (let i = 0; i < depth; i++) {
            const nx = zx * zx - zy * zy + cx;
            const ny = 2 * zx * zy + cy;
            if (nx * nx + ny * ny > 16) break;
            zx = nx; zy = ny;
        }
        const u = ((zx / 2 + 0.5) * width);
        const v = ((zy / 2 + 0.5) * height);
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, u, v, true);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
