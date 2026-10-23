import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const NOISE_HSV_FILTER_PRESET: GimpFilterPreset = {
    id: "noise_hsv",
    name: "HSV Noise",
    category: "Noise",
    gimpProcedure: "gegl:noise-hsv",
    description: "Perturbs pixel Hue, Saturation, and Value in HSV color space (GIMP gegl:noise-hsv).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "hueDistance",
            "label": "HueJitter (deg)",
            "type": "number",
            "min": 0,
            "max": 180,
            "step": 5,
            "defaultValue": 25
        },
        {
            "key": "valueDistance",
            "label": "Value Jitter (0-1)",
            "type": "number",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.15
        }
    ],
    code: `// GIMP HSV Noise (gegl:noise-hsv)
const hAmp = Number(params.hueDistance ?? 25);
const vAmp = Number(params.valueDistance ?? 0.15);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const [h, s, v] = helpers.rgbToHsv(srcBuf[i], srcBuf[i + 1], srcBuf[i + 2]);
        const nh = (h + (helpers.hash2d(x, y, 5) - 0.5) * 2 * hAmp + 360) % 360;
        const nv = helpers.clamp01(v + (helpers.hash2d(x, y, 9) - 0.5) * 2 * vAmp);
        const [r, g, b] = helpers.hsvToRgb(nh, s, nv);
        outBuf[i] = r; outBuf[i + 1] = g; outBuf[i + 2] = b;
    }
}`
};
