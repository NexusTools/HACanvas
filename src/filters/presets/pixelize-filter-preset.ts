import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const PIXELIZE_FILTER_PRESET: GimpFilterPreset = {
    id: "pixelize",
    name: "Pixelize",
    category: "Blur",
    gimpProcedure: "gegl:pixelize",
    description: "Simplifies the image into an array of solid-colored rectangular pixel blocks (GIMP gegl:pixelize).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "blockSize",
            "label": "Block Size (px)",
            "type": "number",
            "min": 2,
            "max": 64,
            "step": 1,
            "defaultValue": 8
        }
    ],
    code: `// GIMP Pixelize (gegl:pixelize)
const block = helpers.clamp(Math.round(Number(params.blockSize ?? params.radius ?? 8)), 2, 64);
for (let by = 0; by < height; by += block) {
    for (let bx = 0; bx < width; bx += block) {
        let sr = 0, sg = 0, sb = 0, sa = 0, count = 0;
        const maxY = Math.min(height, by + block);
        const maxX = Math.min(width, bx + block);
        for (let y = by; y < maxY; y++) {
            for (let x = bx; x < maxX; x++) {
                const i = (y * width + x) * 4;
                sr += srcBuf[i]; sg += srcBuf[i + 1]; sb += srcBuf[i + 2]; sa += srcBuf[i + 3];
                count++;
            }
        }
        const r = sr / count, g = sg / count, b = sb / count, a = sa / count;
        for (let y = by; y < maxY; y++) {
            for (let x = bx; x < maxX; x++) {
                if (!helpers.isSelected(selection, x, y)) continue;
                helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
            }
        }
    }
}`
};
