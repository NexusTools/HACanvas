import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const BORDER_AVERAGE_FILTER_PRESET: GimpFilterPreset = {
    id: "border_average",
    name: "Border Average Tint",
    category: "Colors",
    gimpProcedure: "plug-in-borderaverage",
    description: "Computes the dominant average color along the image perimeter and harmonizes the layer toward it (GIMP plug-ins/common/border-average.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "thickness",
            "label": "Border Sample Thickness",
            "type": "number",
            "min": 1,
            "max": 32,
            "step": 1,
            "defaultValue": 6
        },
        {
            "key": "mix",
            "label": "Tint Mix (0-1)",
            "type": "number",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "defaultValue": 0.35
        }
    ],
    code: `// GIMP Border Average Plugin (plug-ins/common/border-average.c)
const thick = helpers.clamp(Math.round(Number(params.thickness ?? 6)), 1, 32);
const mix = helpers.clamp(Number(params.mix ?? 0.35), 0, 1);
let sr = 0, sg = 0, sb = 0, count = 0;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (x < thick || x >= width - thick || y < thick || y >= height - thick) {
            const i = (y * width + x) * 4;
            sr += srcBuf[i]; sg += srcBuf[i + 1]; sb += srcBuf[i + 2];
            count++;
        }
    }
}
const ar = sr / Math.max(1, count), ag = sg / Math.max(1, count), ab = sb / Math.max(1, count);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(helpers.lerp(srcBuf[i],     ar, mix));
        outBuf[i + 1] = helpers.clamp255(helpers.lerp(srcBuf[i + 1], ag, mix));
        outBuf[i + 2] = helpers.clamp255(helpers.lerp(srcBuf[i + 2], ab, mix));
    }
}`
};
