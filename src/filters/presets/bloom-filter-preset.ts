import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const BLOOM_FILTER_PRESET: GimpFilterPreset = {
    id: "bloom",
    name: "Bloom",
    category: "Light and Shadow",
    gimpProcedure: "gegl:bloom",
    description: "Extracts bright highlights, blurs them into a soft halo, and screen-blends them back over the image (GIMP gegl:bloom).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "threshold",
            "label": "Highlight Cutoff (0-255)",
            "type": "number",
            "min": 50,
            "max": 250,
            "step": 5,
            "defaultValue": 165
        },
        {
            "key": "radius",
            "label": "Glow Radius (px)",
            "type": "number",
            "min": 2,
            "max": 25,
            "step": 1,
            "defaultValue": 6
        },
        {
            "key": "strength",
            "label": "Glow Strength",
            "type": "number",
            "min": 0.1,
            "max": 2.5,
            "step": 0.1,
            "defaultValue": 1
        }
    ],
    code: `// GIMP Bloom Highlight Glow (gegl:bloom)
const cutoff = Number(params.threshold ?? 165);
const radius = helpers.clamp(Math.round(Number(params.radius ?? 6)), 1, 25);
const strength = Number(params.strength ?? 1.0);
const hiBuf = new Uint8Array(width * height * 4);
for (let i = 0; i < width * height * 4; i += 4) {
    const lum = helpers.luminance(srcBuf[i], srcBuf[i + 1], srcBuf[i + 2]);
    if (lum > cutoff) {
        const w = (lum - cutoff) / Math.max(1, 255 - cutoff);
        hiBuf[i]     = srcBuf[i]     * w;
        hiBuf[i + 1] = srcBuf[i + 1] * w;
        hiBuf[i + 2] = srcBuf[i + 2] * w;
        hiBuf[i + 3] = srcBuf[i + 3];
    }
}
const glow = gegl.gaussianBlur(hiBuf, width, height, radius, radius);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + glow[i]     * strength);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + glow[i + 1] * strength);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + glow[i + 2] * strength);
    }
}`
};
