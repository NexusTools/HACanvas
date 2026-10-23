import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const HOT_PIXELS_FILTER_PRESET: GimpFilterPreset = {
    id: "hot_pixels",
    name: "Hot (Broadcast Safe)",
    category: "Colors",
    gimpProcedure: "plug-in-hot",
    description: "Identifies and attenuates overly saturated NTSC/PAL broadcast hot pixels (GIMP plug-ins/common/hot.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "limit",
            "label": "Chroma Limit (0.5-1.0)",
            "type": "number",
            "min": 0.5,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.82
        }
    ],
    code: `// GIMP Broadcast Hot Pixel Limiter (plug-ins/common/hot.c)
const limit = helpers.clamp(Number(params.limit ?? 0.82), 0.3, 1.0);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const [h, s, v] = helpers.rgbToHsv(srcBuf[i], srcBuf[i + 1], srcBuf[i + 2]);
        if (s * v > limit * 0.75) {
            const [r, g, b] = helpers.hsvToRgb(h, Math.min(s, limit), Math.min(v, limit));
            outBuf[i] = r; outBuf[i + 1] = g; outBuf[i + 2] = b;
        }
    }
}`
};
