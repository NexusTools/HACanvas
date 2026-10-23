import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const MAKE_SEAMLESS_FILTER_PRESET: GimpFilterPreset = {
    id: "make_seamless",
    name: "Tile Seamless",
    category: "Map",
    gimpProcedure: "gegl:tile-seamless",
    description: "Cross-blends opposite image edges with a diamond weight mask to produce a seamless repeatable texture (GIMP gegl:tile-seamless).",
    builtIn: true,
    parameterSchemas: [],
    code: `// GIMP Make Seamless Tile (gegl:tile-seamless)
const hw = Math.floor(width / 2), hh = Math.floor(height / 2);
for (let y = 0; y < height; y++) {
    const wy = 1 - Math.abs(y - hh) / Math.max(1, hh);
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const wx = 1 - Math.abs(x - hw) / Math.max(1, hw);
        const w = helpers.clamp01((wx * wy) / (wx * wy + (1 - wx) * (1 - wy) + 1e-5));
        const p1 = helpers.getPixel(srcBuf, width, height, x, y);
        const p2 = helpers.getPixelWrap(srcBuf, width, height, x + hw, y + hh);
        helpers.setPixel(
            outBuf, width, height, x, y,
            helpers.lerp(p2[0], p1[0], w),
            helpers.lerp(p2[1], p1[1], w),
            helpers.lerp(p2[2], p1[2], w),
            p1[3]
        );
    }
}`
};
