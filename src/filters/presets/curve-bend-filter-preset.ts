import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CURVE_BEND_FILTER_PRESET: GimpFilterPreset = {
    id: "curve_bend",
    name: "Curve Bend",
    category: "Distorts",
    gimpProcedure: "plug-in-curve-bend",
    description: "Warps vertical columns along a parabolic arch/wave envelope (GIMP plug-ins/common/curve-bend.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "arch",
            "label": "Arch Deflection (px)",
            "type": "number",
            "min": -80,
            "max": 80,
            "step": 2,
            "defaultValue": 24
        }
    ],
    code: `// GIMP Curve Bend Plugin (plug-ins/common/curve-bend.c)
const arch = Number(params.arch ?? 24);
for (let x = 0; x < width; x++) {
    const u = (x / Math.max(1, width - 1)) * 2 - 1;
    const dy = (1 - u * u) * arch;
    for (let y = 0; y < height; y++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, x, y + dy);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
