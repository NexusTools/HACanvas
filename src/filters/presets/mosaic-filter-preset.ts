import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const MOSAIC_FILTER_PRESET: GimpFilterPreset = {
    id: "mosaic",
    name: "Mosaic (Stained Glass / Tile)",
    category: "Distorts",
    gimpProcedure: "gegl:mosaic",
    description: "Partitions the image into Voronoi stained-glass/ceramic mosaic tiles with dark grout joints and 3D bevel highlights (GIMP gegl:mosaic).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "tileSize",
            "label": "Tile Size (px)",
            "type": "number",
            "min": 6,
            "max": 64,
            "step": 2,
            "defaultValue": 16
        },
        {
            "key": "jointWidth",
            "label": "Grout Joint Width",
            "type": "number",
            "min": 0.02,
            "max": 0.35,
            "step": 0.02,
            "defaultValue": 0.1
        }
    ],
    code: `// GIMP Mosaic Tile Filter (gegl:mosaic)
const tileSize = helpers.clamp(Number(params.tileSize ?? 16), 4, 64);
const joint = helpers.clamp(Number(params.jointWidth ?? 0.1), 0.01, 0.4);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const v = helpers.voronoi2d(x / tileSize, y / tileSize, 0.8, 17);
        const edgeDist = v.f2 - v.f1;
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, v.cellX * tileSize, v.cellY * tileSize);
        if (edgeDist < joint) {
            helpers.setPixel(outBuf, width, height, x, y, r * 0.25, g * 0.25, b * 0.25, a);
        } else {
            const bevel = 1 + (0.5 - v.f1) * 0.25;
            helpers.setPixel(outBuf, width, height, x, y, r * bevel, g * bevel, b * bevel, a);
        }
    }
}`
};
