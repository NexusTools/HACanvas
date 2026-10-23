import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const JIGSAW_FILTER_PRESET: GimpFilterPreset = {
    id: "jigsaw",
    name: "Jigsaw Puzzle",
    category: "Render",
    gimpProcedure: "plug-in-jigsaw",
    description: "Carves interlocking jigsaw puzzle piece seams and 3D bevel highlights onto the image (GIMP plug-ins/common/jigsaw.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "tilesX",
            "label": "Columns",
            "type": "number",
            "min": 2,
            "max": 12,
            "step": 1,
            "defaultValue": 4
        },
        {
            "key": "tilesY",
            "label": "Rows",
            "type": "number",
            "min": 2,
            "max": 12,
            "step": 1,
            "defaultValue": 4
        }
    ],
    code: `// GIMP Jigsaw Puzzle Plugin (plug-ins/common/jigsaw.c)
const nx = helpers.clamp(Math.round(Number(params.tilesX ?? 4)), 2, 16);
const ny = helpers.clamp(Math.round(Number(params.tilesY ?? 4)), 2, 16);
const tw = width / nx, th = height / ny;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const tabX = Math.sin((y / th) * Math.PI * 2) * tw * 0.12;
        const tabY = Math.sin((x / tw) * Math.PI * 2) * th * 0.12;
        const dx = Math.abs(((x + tabX) % tw + tw) % tw);
        const dy = Math.abs(((y + tabY) % th + th) % th);
        const seam = Math.min(dx, tw - dx, dy, th - dy);
        if (seam < 1.6) {
            const i = (y * width + x) * 4;
            outBuf[i] *= 0.25; outBuf[i + 1] *= 0.25; outBuf[i + 2] *= 0.25;
        } else if (seam < 3.5) {
            const i = (y * width + x) * 4;
            outBuf[i]     = helpers.clamp255(srcBuf[i]     + 45);
            outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + 45);
            outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + 45);
        }
    }
}`
};
