import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const FRACTAL_EXPLORER_FILTER_PRESET: GimpFilterPreset = {
    id: "fractal_explorer",
    name: "Fractal Explorer (Mandelbrot)",
    category: "Render",
    gimpProcedure: "plug-in-fractalexplorer",
    description: "Renders a color-mapped Mandelbrot / Julia escape-time fractal (GIMP plug-ins/fractal-explorer/).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "maxIter",
            "label": "Max Iterations",
            "type": "number",
            "min": 16,
            "max": 128,
            "step": 8,
            "defaultValue": 48
        }
    ],
    code: `// GIMP Fractal Explorer Plugin (plug-ins/fractal-explorer/fractal-explorer.c)
const maxIter = helpers.clamp(Math.round(Number(params.maxIter ?? 48)), 8, 200);
for (let y = 0; y < height; y++) {
    const ci = ((y / Math.max(1, height - 1)) - 0.5) * 2.4;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const cr = ((x / Math.max(1, width - 1)) - 0.7) * 2.8;
        let zr = 0, zi = 0, iter = 0;
        while (zr * zr + zi * zi <= 4 && iter < maxIter) {
            const tmp = zr * zr - zi * zi + cr;
            zi = 2 * zr * zi + ci;
            zr = tmp;
            iter++;
        }
        if (iter >= maxIter) {
            helpers.setPixel(outBuf, width, height, x, y, 8, 10, 18, 255);
        } else {
            const t = iter / maxIter;
            const [r, g, b] = helpers.hsvToRgb((210 + t * 300) % 360, 0.85, Math.min(1, t * 1.8 + 0.2));
            helpers.setPixel(outBuf, width, height, x, y, r, g, b, 255);
        }
    }
}`
};
