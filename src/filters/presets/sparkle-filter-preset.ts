import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SPARKLE_FILTER_PRESET: GimpFilterPreset = {
    id: "sparkle",
    name: "Sparkle",
    category: "Light and Shadow",
    gimpProcedure: "plug-in-sparkle",
    description: "Detects bright luminance peaks and draws 4-point diffraction star spikes on them (GIMP plug-ins/common/sparkle.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "lumThreshold",
            "label": "Luminance Cutoff",
            "type": "number",
            "min": 150,
            "max": 254,
            "step": 2,
            "defaultValue": 225
        },
        {
            "key": "spikeLength",
            "label": "Spike Length (px)",
            "type": "number",
            "min": 3,
            "max": 25,
            "step": 1,
            "defaultValue": 9
        }
    ],
    code: `// GIMP Sparkle Plugin (plug-ins/common/sparkle.c)
const cutoff = Number(params.lumThreshold ?? 225);
const spikeLen = helpers.clamp(Math.round(Number(params.spikeLength ?? 9)), 2, 25);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const [r, g, b] = helpers.getPixel(srcBuf, width, height, x, y);
        if (helpers.luminance(r, g, b) >= cutoff && ((x + y * 3) % 5 === 0)) {
            for (let d = -spikeLen; d <= spikeLen; d++) {
                const falloff = 1 - Math.abs(d) / (spikeLen + 1);
                const boost = falloff * falloff * 180;
                if (helpers.isSelected(selection, x + d, y)) {
                    const [hr, hg, hb, ha] = helpers.getPixel(outBuf, width, height, x + d, y);
                    helpers.setPixel(outBuf, width, height, x + d, y, hr + boost, hg + boost, hb + boost, Math.max(ha, 255));
                }
                if (helpers.isSelected(selection, x, y + d)) {
                    const [vr, vg, vb, va] = helpers.getPixel(outBuf, width, height, x, y + d);
                    helpers.setPixel(outBuf, width, height, x, y + d, vr + boost, vg + boost, vb + boost, Math.max(va, 255));
                }
            }
        }
    }
}`
};
