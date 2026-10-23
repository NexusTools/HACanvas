import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const GLASS_TILE_FILTER_PRESET: GimpFilterPreset = {
    id: "glass_tile",
    name: "Glass Tile",
    category: "Artistic",
    gimpProcedure: "gegl:tile-glass",
    description: "Simulates viewing the image through an array of refractive fluted glass blocks (GIMP gegl:tile-glass).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "tileWidth",
            "label": "Tile Size (px)",
            "type": "number",
            "min": 6,
            "max": 48,
            "step": 2,
            "defaultValue": 16
        }
    ],
    code: `// GIMP Glass Tile Refraction (gegl:tile-glass)
const tile = helpers.clamp(Number(params.tileWidth ?? 16), 4, 48);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const ux = ((x % tile) / tile) - 0.5;
        const uy = ((y % tile) / tile) - 0.5;
        const sx = x + Math.sin(ux * Math.PI) * tile * 0.45;
        const sy = y + Math.sin(uy * Math.PI) * tile * 0.45;
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, sx, sy);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
