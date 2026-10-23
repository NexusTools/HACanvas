import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const VIDEO_DEGRADATION_FILTER_PRESET: GimpFilterPreset = {
    id: "video_degradation",
    name: "Video Degradation (CRT)",
    category: "Distorts",
    gimpProcedure: "gegl:video-degradation",
    description: "Applies RGB phosphor triad sub-pixel stripes and CRT scanline darkening (GIMP gegl:video-degradation).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "scanlineDarkness",
            "label": "Scanline Intensity",
            "type": "number",
            "min": 0.1,
            "max": 0.9,
            "step": 0.05,
            "defaultValue": 0.4
        }
    ],
    code: `// GIMP Video Degradation CRT Phosphor Pattern (gegl:video-degradation)
const dark = helpers.clamp(Number(params.scanlineDarkness ?? 0.4), 0, 0.95);
for (let y = 0; y < height; y++) {
    const scanMult = (y & 1) === 1 ? 1 - dark : 1.05;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x, y);
        const sub = x % 3;
        const mr = sub === 0 ? 1.25 : 0.78;
        const mg = sub === 1 ? 1.25 : 0.78;
        const mb = sub === 2 ? 1.25 : 0.78;
        helpers.setPixel(outBuf, width, height, x, y, r * mr * scanMult, g * mg * scanMult, b * mb * scanMult, a);
    }
}`
};
