import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const FILMSTRIP_FILTER_PRESET: GimpFilterPreset = {
    id: "filmstrip",
    name: "Filmstrip (35mm Cinema)",
    category: "Combine",
    gimpProcedure: "plug-in-film",
    description: "Frames the artwork inside a sprocketed 35mm motion picture celluloid filmstrip (GIMP plug-ins/common/film.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "borderHeight",
            "label": "Film Border Height",
            "type": "number",
            "min": 12,
            "max": 60,
            "step": 2,
            "defaultValue": 24
        }
    ],
    code: `// GIMP 35mm Filmstrip Plugin (plug-ins/common/film.c)
const bh = helpers.clamp(Math.round(Number(params.borderHeight ?? 24)), 10, Math.floor(height * 0.3));
const holeSpacing = Math.max(16, Math.round(bh * 1.1));
const holeW = Math.max(6, Math.round(bh * 0.45));
const holeH = Math.max(5, Math.round(bh * 0.42));
const holeMargin = Math.max(3, Math.round((bh - holeH) * 0.5));
for (let y = 0; y < height; y++) {
    const inBand = y < bh || y >= height - bh;
    if (!inBand) continue;
    const localY = y < bh ? y : height - 1 - y;
    const inHoleY = localY >= holeMargin && localY < holeMargin + holeH;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const lx = x % holeSpacing;
        const inHoleX = lx >= 4 && lx < 4 + holeW;
        if (inHoleY && inHoleX) {
            helpers.setPixel(outBuf, width, height, x, y, 235, 238, 245, 255);
        } else {
            helpers.setPixel(outBuf, width, height, x, y, 16, 18, 22, 255);
        }
    }
}`
};
