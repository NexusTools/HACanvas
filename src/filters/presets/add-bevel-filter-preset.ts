import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const ADD_BEVEL_FILTER_PRESET: GimpFilterPreset = {
    id: "add_bevel",
    name: "Add Bevel",
    category: "Decor",
    gimpProcedure: "script-fu-add-bevel",
    description: "Renders a 3D raised button bevel highlight on top/left edges and shadow on bottom/right edges (GIMP script-fu-add-bevel).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "thickness",
            "label": "Bevel Width (px)",
            "type": "number",
            "min": 2,
            "max": 40,
            "step": 1,
            "defaultValue": 10
        }
    ],
    code: `// GIMP Add Bevel Decor Filter (script-fu-add-bevel)
const bw = helpers.clamp(Math.round(Number(params.thickness ?? 10)), 2, 40);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dTop = y, dLeft = x, dBot = height - 1 - y, dRight = width - 1 - x;
        const minEdge = Math.min(dTop, dLeft, dBot, dRight);
        if (minEdge < bw) {
            const ramp = (1 - minEdge / bw) * 75;
            const isLight = Math.min(dTop, dLeft) <= Math.min(dBot, dRight);
            const delta = isLight ? ramp : -ramp;
            const i = (y * width + x) * 4;
            outBuf[i]     = helpers.clamp255(srcBuf[i]     + delta);
            outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + delta);
            outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + delta);
        }
    }
}`
};
