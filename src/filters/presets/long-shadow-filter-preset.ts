import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const LONG_SHADOW_FILTER_PRESET: GimpFilterPreset = {
    id: "long_shadow",
    name: "Long Shadow",
    category: "Light and Shadow",
    gimpProcedure: "gegl:long-shadow",
    description: "Casts an extruded directional isometric fading trail shadow behind opaque shapes (GIMP gegl:long-shadow).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "angle",
            "label": "Shadow Angle (deg)",
            "type": "number",
            "min": 0,
            "max": 360,
            "step": 5,
            "defaultValue": 45
        },
        {
            "key": "length",
            "label": "Trail Length (px)",
            "type": "number",
            "min": 4,
            "max": 80,
            "step": 2,
            "defaultValue": 24
        },
        {
            "key": "color",
            "label": "Shadow Color",
            "type": "color",
            "defaultValue": "#121624"
        }
    ],
    code: `// GIMP Long Shadow (gegl:long-shadow)
const rad = (Number(params.angle ?? 45) * Math.PI) / 180;
const len = helpers.clamp(Math.round(Number(params.length ?? 24)), 2, 80);
const col = helpers.parseColor(String(params.color || "#121624"));
const dx = Math.cos(rad), dy = Math.sin(rad);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        if (srcBuf[i + 3] > 200) continue;
        let hitStep = -1;
        for (let s = 1; s <= len; s++) {
            const [, , , a] = helpers.getPixel(srcBuf, width, height, x - dx * s, y - dy * s);
            if (a > 128) { hitStep = s; break; }
        }
        if (hitStep > 0) {
            const fade = (1 - hitStep / (len + 1)) * 0.85;
            outBuf[i]     = col.r;
            outBuf[i + 1] = col.g;
            outBuf[i + 2] = col.b;
            outBuf[i + 3] = helpers.clamp255(Math.max(srcBuf[i + 3], fade * 255));
        }
    }
}`
};
