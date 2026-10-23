import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const DESTRIPE_FILTER_PRESET: GimpFilterPreset = {
    id: "destripe",
    name: "Destripe",
    category: "Enhance",
    gimpProcedure: "plug-in-destripe",
    description: "Removes vertical scanner stripes by equalizing column-average luminance against a smoothed horizontal profile (GIMP plug-ins/common/destripe.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "avgWidth",
            "label": "Averaging Width",
            "type": "number",
            "min": 3,
            "max": 63,
            "step": 2,
            "defaultValue": 15
        }
    ],
    code: `// GIMP Destripe Plugin (plug-ins/common/destripe.c)
const halfW = Math.max(1, Math.round(Number(params.avgWidth ?? 15) / 2));
const colR = new Float32Array(width);
const colG = new Float32Array(width);
const colB = new Float32Array(width);
for (let x = 0; x < width; x++) {
    let sr = 0, sg = 0, sb = 0;
    for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        sr += srcBuf[i]; sg += srcBuf[i + 1]; sb += srcBuf[i + 2];
    }
    colR[x] = sr / Math.max(1, height);
    colG[x] = sg / Math.max(1, height);
    colB[x] = sb / Math.max(1, height);
}
for (let x = 0; x < width; x++) {
    let mr = 0, mg = 0, mb = 0, cnt = 0;
    for (let dx = -halfW; dx <= halfW; dx++) {
        const nx = helpers.clamp(x + dx, 0, width - 1);
        mr += colR[nx]; mg += colG[nx]; mb += colB[nx];
        cnt++;
    }
    const diffR = mr / cnt - colR[x];
    const diffG = mg / cnt - colG[x];
    const diffB = mb / cnt - colB[x];
    for (let y = 0; y < height; y++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + diffR);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + diffG);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + diffB);
    }
}`
};
