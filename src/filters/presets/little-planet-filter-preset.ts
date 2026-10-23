import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const LITTLE_PLANET_FILTER_PRESET: GimpFilterPreset = {
    id: "little_planet",
    name: "Little Planet (Stereographic)",
    category: "Map",
    gimpProcedure: "gegl:stereographic-projection",
    description: "Maps the canvas into a 360-degree stereographic miniature planet globe (GIMP gegl:stereographic-projection).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "zoom",
            "label": "Planet Zoom",
            "type": "number",
            "min": 0.4,
            "max": 2.5,
            "step": 0.1,
            "defaultValue": 1
        }
    ],
    code: `// GIMP Little Planet Stereographic Projection (gegl:stereographic-projection)
const zoom = Math.max(0.2, Number(params.zoom ?? 1.0));
const cx = width * 0.5, cy = height * 0.5;
const rad = (Math.min(cx, cy) || 1) * zoom;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = (x - cx) / rad;
        const dy = (y - cy) / rad;
        const r = Math.hypot(dx, dy);
        const theta = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
        const phi = (2 * Math.atan(r)) / Math.PI;
        const [pr, pg, pb, pa] = helpers.sampleBilinear(srcBuf, width, height, theta * (width - 1), helpers.clamp01(phi) * (height - 1), true);
        helpers.setPixel(outBuf, width, height, x, y, pr, pg, pb, pa);
    }
}`
};
