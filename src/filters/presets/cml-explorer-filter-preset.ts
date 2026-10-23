import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const CML_EXPLORER_FILTER_PRESET: GimpFilterPreset = {
    id: "cml_explorer",
    name: "CML Explorer",
    category: "Render",
    gimpProcedure: "plug-in-cml-explorer",
    description: "Coupled Map Lattice chaotic cellular reaction-diffusion pattern generator (GIMP plug-ins/common/cml-explorer.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "kParam",
            "label": "Chaos Parameter (3.5-4.0)",
            "type": "number",
            "min": 3.5,
            "max": 3.99,
            "step": 0.02,
            "defaultValue": 3.82
        }
    ],
    code: `// GIMP Coupled Map Lattice Explorer (plug-ins/common/cml-explorer.c)
const k = helpers.clamp(Number(params.kParam ?? 3.82), 3.2, 3.999);
const row = new Float32Array(width);
for (let x = 0; x < width; x++) row[x] = 0.1 + 0.8 * helpers.hash2d(x, 0, 77);
for (let y = 0; y < height; y++) {
    const next = new Float32Array(width);
    for (let x = 0; x < width; x++) {
        const left = row[(x - 1 + width) % width];
        const curr = row[x];
        const right = row[(x + 1) % width];
        const coupled = 0.2 * left + 0.6 * curr + 0.2 * right;
        next[x] = k * coupled * (1 - coupled);
        if (helpers.isSelected(selection, x, y)) {
            const [r, g, b] = helpers.hsvToRgb((next[x] * 320 + 180) % 360, 0.75, next[x]);
            helpers.setPixel(outBuf, width, height, x, y, r, g, b, 255);
        }
    }
    row.set(next);
}`
};
