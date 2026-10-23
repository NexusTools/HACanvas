import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const DEPTH_MERGE_FILTER_PRESET: GimpFilterPreset = {
    id: "depth_merge",
    name: "Depth Merge Relief",
    category: "Combine",
    gimpProcedure: "plug-in-depth-merge",
    description: "Synthesizes a Z-depth luminance relief composite with atmospheric depth fog (GIMP plug-ins/common/depth-merge.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "depthScale",
            "label": "Depth Scale",
            "type": "number",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.45
        }
    ],
    code: `// GIMP Depth Merge Plugin (plug-ins/common/depth-merge.c)
const scale = helpers.clamp(Number(params.depthScale ?? 0.45), 0, 1);
for (let y = 0; y < height; y++) {
    const vFog = (1 - y / Math.max(1, height - 1)) * scale;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        const z = helpers.luminance(srcBuf[i], srcBuf[i + 1], srcBuf[i + 2]) / 255;
        const fog = vFog * (1 - z * 0.6);
        outBuf[i]     = helpers.clamp255(helpers.lerp(srcBuf[i],     200, fog));
        outBuf[i + 1] = helpers.clamp255(helpers.lerp(srcBuf[i + 1], 215, fog));
        outBuf[i + 2] = helpers.clamp255(helpers.lerp(srcBuf[i + 2], 240, fog));
    }
}`
};
