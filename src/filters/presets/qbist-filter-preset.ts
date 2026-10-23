import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const QBIST_FILTER_PRESET: GimpFilterPreset = {
    id: "qbist",
    name: "Qbist",
    category: "Render",
    gimpProcedure: "plug-in-qbist",
    description: "Generates modern abstract geometric art by composing trigonometric vector registers (GIMP plug-ins/common/qbist.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "seed",
            "label": "Expression Seed",
            "type": "number",
            "min": 1,
            "max": 100,
            "step": 1,
            "defaultValue": 14
        }
    ],
    code: `// GIMP Qbist Procedural Art Generator (plug-ins/common/qbist.c)
const s = Number(params.seed ?? 14);
for (let y = 0; y < height; y++) {
    const v = (y / Math.max(1, height - 1)) * 2 - 1;
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const u = (x / Math.max(1, width - 1)) * 2 - 1;
        const r = Math.sin(u * (3 + (s % 5)) + Math.cos(v * 4)) * 127 + 128;
        const g = Math.cos(v * (2 + (s % 7)) - Math.sin(u * 5)) * 127 + 128;
        const b = Math.sin((u * u + v * v) * (4 + (s % 4))) * 127 + 128;
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, 255);
    }
}`
};
