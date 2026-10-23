import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SAMPLE_COLORIZE_FILTER_PRESET: GimpFilterPreset = {
    id: "sample_colorize",
    name: "Sample Colorize (Duotone)",
    category: "Colors",
    gimpProcedure: "plug-in-sample-colorize",
    description: "Maps pixel luminance across a custom shadow-to-highlight duotone color ramp (GIMP plug-ins/common/sample-colorize.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "shadowColor",
            "label": "Shadow Color",
            "type": "color",
            "defaultValue": "#120a2a"
        },
        {
            "key": "highlightColor",
            "label": "Highlight Color",
            "type": "color",
            "defaultValue": "#00e5ff"
        }
    ],
    code: `// GIMP Sample Colorize Duotone Ramp (plug-ins/common/sample-colorize.c)
const c0 = helpers.parseColor(String(params.shadowColor || "#120a2a"));
const c1 = helpers.parseColor(String(params.highlightColor || "#00e5ff"));
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const t = helpers.luminance(srcBuf[i], srcBuf[i + 1], srcBuf[i + 2]) / 255;
        outBuf[i]     = helpers.clamp255(helpers.lerp(c0.r, c1.r, t));
        outBuf[i + 1] = helpers.clamp255(helpers.lerp(c0.g, c1.g, t));
        outBuf[i + 2] = helpers.clamp255(helpers.lerp(c0.b, c1.b, t));
    }
}`
};
