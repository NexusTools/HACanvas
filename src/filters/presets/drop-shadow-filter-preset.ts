import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const DROP_SHADOW_FILTER_PRESET: GimpFilterPreset = {
    id: "drop_shadow",
    name: "Drop Shadow",
    category: "Light and Shadow",
    gimpProcedure: "gegl:dropshadow",
    description: "Renders an offset alpha drop shadow beneath the layer's opaque pixels (GIMP gegl:dropshadow).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "offsetX",
            "label": "Offset X (px)",
            "type": "number",
            "min": -32,
            "max": 32,
            "step": 1,
            "defaultValue": 4
        },
        {
            "key": "offsetY",
            "label": "Offset Y (px)",
            "type": "number",
            "min": -32,
            "max": 32,
            "step": 1,
            "defaultValue": 4
        },
        {
            "key": "color",
            "label": "Shadow Color",
            "type": "color",
            "defaultValue": "#000000"
        }
    ],
    code: `// GIMP Drop Shadow (gegl:dropshadow)
const offsetX = Math.round(Number(params.offsetX ?? 4));
const offsetY = Math.round(Number(params.offsetY ?? 4));
const col = helpers.parseColor(String(params.color || "rgba(0,0,0,0.55)"));
const shadowAlpha = String(params.color || "").startsWith("#") && String(params.color).length === 7 ? 140 : col.a;
outBuf.fill(0);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const srcA = srcBuf[srcIdx + 3];
        if (srcA > 0) {
            const sx = x + offsetX, sy = y + offsetY;
            if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                const sIdx = (sy * width + sx) * 4;
                outBuf[sIdx]     = col.r;
                outBuf[sIdx + 1] = col.g;
                outBuf[sIdx + 2] = col.b;
                outBuf[sIdx + 3] = helpers.clamp255((srcA / 255) * shadowAlpha);
            }
        }
    }
}
for (let i = 0; i < width * height * 4; i += 4) {
    const sa = srcBuf[i + 3] / 255;
    if (sa <= 0) continue;
    const da = outBuf[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    outBuf[i]     = helpers.clamp255((srcBuf[i]     * sa + outBuf[i]     * da * (1 - sa)) / oa);
    outBuf[i + 1] = helpers.clamp255((srcBuf[i + 1] * sa + outBuf[i + 1] * da * (1 - sa)) / oa);
    outBuf[i + 2] = helpers.clamp255((srcBuf[i + 2] * sa + outBuf[i + 2] * da * (1 - sa)) / oa);
    outBuf[i + 3] = helpers.clamp255(oa * 255);
}`
};
