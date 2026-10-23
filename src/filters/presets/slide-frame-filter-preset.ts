import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SLIDE_FRAME_FILTER_PRESET: GimpFilterPreset = {
    id: "slide_frame",
    name: "Slide (35mm Mount)",
    category: "Decor",
    gimpProcedure: "script-fu-slide",
    description: "Mounts the image inside a classic black 35mm reversal slide frame with sprocket holes (GIMP script-fu-slide).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "frameWidth",
            "label": "Mount Margin (px)",
            "type": "number",
            "min": 8,
            "max": 40,
            "step": 2,
            "defaultValue": 16
        }
    ],
    code: `// GIMP 35mm Slide Mount (script-fu-slide)
const m = helpers.clamp(Math.round(Number(params.frameWidth ?? 16)), 6, 48);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        if (x < m || x >= width - m || y < m || y >= height - m) {
            helpers.setPixel(outBuf, width, height, x, y, 12, 13, 16, 255);
        }
    }
}`
};
