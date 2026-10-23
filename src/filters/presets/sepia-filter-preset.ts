import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SEPIA_FILTER_PRESET: GimpFilterPreset = {
    id: "sepia",
    name: "Sepia Tone",
    category: "Colors",
    gimpProcedure: "gegl:sepia",
    description: "Applies a warm antique photographic sepia color matrix (GIMP gegl:sepia).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scale",
            "label": "Sepia Strength (0-1)",
            "type": "number",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 1
        }
    ],
    code: `// GIMP Sepia Tone (gegl:sepia)
const s = helpers.clamp(Number(params.scale ?? 1.0), 0, 1);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const r = srcBuf[i], g = srcBuf[i + 1], b = srcBuf[i + 2];
        const sr = r * 0.393 + g * 0.769 + b * 0.189;
        const sg = r * 0.349 + g * 0.686 + b * 0.168;
        const sb = r * 0.272 + g * 0.534 + b * 0.131;
        outBuf[i]     = helpers.clamp255(helpers.lerp(r, sr, s));
        outBuf[i + 1] = helpers.clamp255(helpers.lerp(g, sg, s));
        outBuf[i + 2] = helpers.clamp255(helpers.lerp(b, sb, s));
    }
}`
};
