import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const BAYER_MATRIX_FILTER_PRESET: GimpFilterPreset = {
    id: "bayer_matrix",
    name: "Bayer Matrix Dither",
    category: "Render",
    gimpProcedure: "gegl:bayer-matrix",
    description: "Applies an ordered 4×4 Bayer dithering threshold matrix to the image (GIMP gegl:bayer-matrix).",
    builtIn: true,
    parameterSchemas: [],
    code: `// GIMP 4x4 Ordered Bayer Matrix Dither (gegl:bayer-matrix)
const bayer4 = [
     0,  8,  2, 10,
    12,  4, 14,  6,
     3, 11,  1,  9,
    15,  7, 13,  5
];
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const thresh = ((bayer4[(y & 3) * 4 + (x & 3)] + 0.5) / 16) * 255;
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x, y);
        const lum = helpers.luminance(r, g, b);
        const v = lum >= thresh ? 255 : 0;
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, a);
    }
}`
};
