import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const POLAR_COORDINATES_FILTER_PRESET: GimpFilterPreset = {
    id: "polar_coordinates",
    name: "Polar Coordinates",
    category: "Distorts",
    gimpProcedure: "gegl:polar-coordinates",
    description: "Maps the image between Cartesian rectangular coordinates and circular polar coordinates (GIMP gegl:polar-coordinates).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "toPolar",
            "label": "To Polar (1) or Rect (0)",
            "type": "number",
            "min": 0,
            "max": 1,
            "step": 1,
            "defaultValue": 1
        }
    ],
    code: `// GIMP Polar Coordinates (gegl:polar-coordinates)
const toPolar = Number(params.toPolar ?? 1) >= 0.5;
const cx = width * 0.5, cy = height * 0.5;
const maxR = Math.min(cx, cy) || 1;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        let sx = x, sy = y;
        if (toPolar) {
            const dx = x - cx, dy = y - cy;
            const r = Math.hypot(dx, dy);
            const theta = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
            sx = theta * (width - 1);
            sy = helpers.clamp01(r / maxR) * (height - 1);
        } else {
            const theta = (x / Math.max(1, width - 1)) * Math.PI * 2 - Math.PI;
            const r = (y / Math.max(1, height - 1)) * maxR;
            sx = cx + Math.cos(theta) * r;
            sy = cy + Math.sin(theta) * r;
        }
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, sx, sy, true);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
