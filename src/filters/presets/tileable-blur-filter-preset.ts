import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const TILEABLE_BLUR_FILTER_PRESET: GimpFilterPreset = {
    id: "tileable_blur",
    name: "Tileable Blur",
    category: "Blur",
    gimpProcedure: "script-fu-tile-blur",
    description: "Blurs image edges using periodic wrap-around sampling for seamless tile textures (GIMP script-fu-tile-blur).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Radius (px)",
            "type": "number",
            "min": 1,
            "max": 16,
            "step": 1,
            "defaultValue": 3
        }
    ],
    code: `// GIMP Tileable Seamless Blur (script-fu-tile-blur)
const r = helpers.clamp(Math.round(Number(params.radius ?? 3)), 1, 16);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        let sr = 0, sg = 0, sb = 0, sa = 0, count = 0;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const [pr, pg, pb, pa] = helpers.getPixelWrap(srcBuf, width, height, x + dx, y + dy);
                sr += pr; sg += pg; sb += pb; sa += pa;
                count++;
            }
        }
        helpers.setPixel(outBuf, width, height, x, y, sr / count, sg / count, sb / count, sa / count);
    }
}`
};
