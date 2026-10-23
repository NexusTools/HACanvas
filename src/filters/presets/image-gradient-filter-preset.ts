import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const IMAGE_GRADIENT_FILTER_PRESET: GimpFilterPreset = {
    id: "image_gradient",
    name: "Image Gradient",
    category: "Edge-Detect",
    gimpProcedure: "gegl:image-gradient",
    description: "Visualizes gradient magnitude and direction angle using HSV color encoding (GIMP gegl:image-gradient).",
    builtIn: true,
    parameterSchemas: [],
    code: `// GIMP Image Gradient Magnitude & Direction (gegl:image-gradient)
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const grad = helpers.sobelAt(srcBuf, width, height, x, y);
        const hue = ((grad.angle * 180) / Math.PI + 360) % 360;
        const val = helpers.clamp01(grad.mag / 255);
        const [r, g, b] = helpers.hsvToRgb(hue, 0.85, val);
        const a = srcBuf[(y * width + x) * 4 + 3];
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
