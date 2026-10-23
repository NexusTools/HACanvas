import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const OLD_PHOTO_FILTER_PRESET: GimpFilterPreset = {
    id: "old_photo",
    name: "Old Photo",
    category: "Decor",
    gimpProcedure: "script-fu-old-photo",
    description: "Ages the image with warm sepia toning, subtle focus softening, paper mottling, and a vintage border (GIMP script-fu-old-photo).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "borderSize",
            "label": "Border Width (px)",
            "type": "number",
            "min": 0,
            "max": 32,
            "step": 2,
            "defaultValue": 8
        }
    ],
    code: `// GIMP Old Photo Aging Filter (script-fu-old-photo)
const bw = Math.max(0, Number(params.borderSize ?? 8));
const soft = gegl.gaussianBlur(srcBuf, width, height, 1, 1);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        if (bw > 0 && (x < bw || x >= width - bw || y < bw || y >= height - bw)) {
            helpers.setPixel(outBuf, width, height, x, y, 238, 228, 205, 255);
            continue;
        }
        const i = (y * width + x) * 4;
        const r = soft[i], g = soft[i + 1], b = soft[i + 2];
        const grain = (helpers.perlin2d(x * 0.12, y * 0.12, 9) * 18);
        const sr = r * 0.393 + g * 0.769 + b * 0.189 + grain;
        const sg = r * 0.349 + g * 0.686 + b * 0.168 + grain;
        const sb = r * 0.272 + g * 0.534 + b * 0.131 + grain;
        helpers.setPixel(outBuf, width, height, x, y, sr, sg, sb, soft[i + 3]);
    }
}`
};
