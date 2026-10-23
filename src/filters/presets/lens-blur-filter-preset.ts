import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const LENS_BLUR_FILTER_PRESET: GimpFilterPreset = {
    id: "lens_blur",
    name: "Lens Blur (Bokeh)",
    category: "Blur",
    gimpProcedure: "gegl:lens-blur",
    description: "Simulates optical camera defocus disc bokeh with specular highlight blooming (GIMP gegl:lens-blur).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Disc Radius (px)",
            "type": "number",
            "min": 1,
            "max": 12,
            "step": 1,
            "defaultValue": 4
        },
        {
            "key": "highlights",
            "label": "Highlight Boost",
            "type": "number",
            "min": 0,
            "max": 3,
            "step": 0.2,
            "defaultValue": 1.2
        }
    ],
    code: `// GIMP Lens Blur (gegl:lens-blur)
const r = helpers.clamp(Math.round(Number(params.radius ?? 4)), 1, 12);
const boost = helpers.clamp(Number(params.highlights ?? 1.2), 0, 4);
const rSq = r * r;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        let sr = 0, sg = 0, sb = 0, sa = 0, wSum = 0;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > rSq) continue;
                const [pr, pg, pb, pa] = helpers.getPixel(srcBuf, width, height, x + dx, y + dy);
                const lum = helpers.luminance(pr, pg, pb) / 255;
                const w = 1 + Math.pow(lum, 3) * boost * 3;
                sr += pr * w; sg += pg * w; sb += pb * w; sa += pa * w;
                wSum += w;
            }
        }
        helpers.setPixel(outBuf, width, height, x, y, sr / wSum, sg / wSum, sb / wSum, sa / wSum);
    }
}`
};
