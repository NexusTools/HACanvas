import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const WEAVE_FILTER_PRESET: GimpFilterPreset = {
    id: "weave",
    name: "Weave (Basket Ribbon)",
    category: "Artistic",
    gimpProcedure: "script-fu-weave",
    description: "Overlays a 3D shaded interlaced horizontal and vertical basket weave ribbon pattern (GIMP script-fu-weave).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "ribbonWidth",
            "label": "Ribbon Width (px)",
            "type": "number",
            "min": 4,
            "max": 32,
            "step": 2,
            "defaultValue": 10
        },
        {
            "key": "shadowDepth",
            "label": "Shadow Intensity",
            "type": "number",
            "min": 0.1,
            "max": 0.8,
            "step": 0.05,
            "defaultValue": 0.35
        }
    ],
    code: `// GIMP Basket Weave Filter (script-fu-weave)
const rw = helpers.clamp(Math.round(Number(params.ribbonWidth ?? 10)), 4, 32);
const shadow = helpers.clamp(Number(params.shadowDepth ?? 0.35), 0, 0.9);
const cell = rw + 2;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const lx = x % cell, ly = y % cell;
        const i = (y * width + x) * 4;
        if (lx >= rw && ly >= rw) {
            outBuf[i] *= 0.2; outBuf[i + 1] *= 0.2; outBuf[i + 2] *= 0.2;
        } else {
            const arch = Math.sin((lx / rw) * Math.PI) * Math.sin((ly / rw) * Math.PI);
            const mult = (1 - shadow) + arch * shadow * 1.2;
            outBuf[i]     = helpers.clamp255(srcBuf[i]     * mult);
            outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] * mult);
            outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] * mult);
        }
    }
}`
};
