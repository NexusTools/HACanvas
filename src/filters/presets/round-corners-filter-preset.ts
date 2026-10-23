import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const ROUND_CORNERS_FILTER_PRESET: GimpFilterPreset = {
    id: "round_corners",
    name: "Round Corners",
    category: "Decor",
    gimpProcedure: "script-fu-round-corners",
    description: "Masks the four outer corners of the layer with smooth circular arcs (GIMP script-fu-round-corners).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "radius",
            "label": "Corner Radius (px)",
            "type": "number",
            "min": 4,
            "max": 120,
            "step": 2,
            "defaultValue": 24
        }
    ],
    code: `// GIMP Round Corners (script-fu-round-corners)
const r = helpers.clamp(Number(params.radius ?? 24), 2, Math.min(width, height) * 0.5);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const cx = x < r ? r : x >= width - r ? width - 1 - r : x;
        const cy = y < r ? r : y >= height - r ? height - 1 - r : y;
        if (cx !== x && cy !== y) {
            const d = Math.hypot(x - cx, y - cy);
            if (d > r) {
                outBuf[(y * width + x) * 4 + 3] = 0;
            }
        }
    }
}`
};
