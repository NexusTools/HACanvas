import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const WARP_CURL_FILTER_PRESET: GimpFilterPreset = {
    id: "warp_curl",
    name: "Warp (Curl Flow)",
    category: "Map",
    gimpProcedure: "plug-in-warp",
    description: "Advects pixels along a 90-degree rotated Perlin curl vector field (GIMP plug-ins/common/warp.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "magnitude",
            "label": "Warp Magnitude (px)",
            "type": "number",
            "min": 2,
            "max": 40,
            "step": 2,
            "defaultValue": 12
        }
    ],
    code: `// GIMP Warp Vector Curl Plugin (plug-ins/common/warp.c)
const mag = Number(params.magnitude ?? 12);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = helpers.perlin2d(x * 0.03, y * 0.03, 5) * mag;
        const dy = helpers.perlin2d(x * 0.03, y * 0.03, 19) * mag;
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, x + dx, y + dy, true);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
