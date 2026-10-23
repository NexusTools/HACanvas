import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const RIPPLE_FILTER_PRESET: GimpFilterPreset = {
    id: "ripple",
    name: "Ripple",
    category: "Distorts",
    gimpProcedure: "gegl:ripple",
    description: "Displaces pixels using a sinusoidal wave pattern with configurable period and amplitude (GIMP gegl:ripple).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "amplitude",
            "label": "Amplitude (px)",
            "type": "number",
            "min": 1,
            "max": 50,
            "step": 1,
            "defaultValue": 10
        },
        {
            "key": "period",
            "label": "Wave Period (px)",
            "type": "number",
            "min": 8,
            "max": 160,
            "step": 2,
            "defaultValue": 36
        }
    ],
    code: `// GIMP Ripple Distortion (gegl:ripple)
const amp = Number(params.amplitude ?? 10);
const period = Math.max(4, Number(params.period ?? 36));
const freq = (Math.PI * 2) / period;
for (let y = 0; y < height; y++) {
    const shiftX = Math.sin(y * freq) * amp;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const shiftY = Math.cos(x * freq) * (amp * 0.35);
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, x + shiftX, y + shiftY, true);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
