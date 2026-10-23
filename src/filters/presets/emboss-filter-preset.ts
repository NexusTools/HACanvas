import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const EMBOSS_FILTER_PRESET: GimpFilterPreset = {
    id: "emboss",
    name: "Emboss",
    category: "Distorts",
    gimpProcedure: "gegl:emboss",
    description: "Simulates directional 3D relief stamping using azimuth, elevation, and depth (GIMP gegl:emboss).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "azimuth",
            "label": "Azimuth (deg)",
            "type": "number",
            "min": 0,
            "max": 360,
            "step": 5,
            "defaultValue": 135
        },
        {
            "key": "elevation",
            "label": "Elevation (deg)",
            "type": "number",
            "min": 5,
            "max": 90,
            "step": 5,
            "defaultValue": 45
        },
        {
            "key": "depth",
            "label": "Depth",
            "type": "number",
            "min": 1,
            "max": 20,
            "step": 1,
            "defaultValue": 4
        }
    ],
    code: `// GIMP Emboss (gegl:emboss)
const az = (Number(params.azimuth ?? 135) * Math.PI) / 180;
const el = (Number(params.elevation ?? 45) * Math.PI) / 180;
const depth = Number(params.depth ?? 4) / 255;
const lx = Math.cos(az) * Math.cos(el);
const ly = Math.sin(az) * Math.cos(el);
const lz = Math.sin(el);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const grad = helpers.sobelAt(srcBuf, width, height, x, y);
        const nx = -grad.gx * depth;
        const ny = -grad.gy * depth;
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz) || 1;
        const shade = helpers.clamp01((nx * lx + ny * ly + nz * lz) / len);
        const v = helpers.clamp255(shade * 255);
        const a = srcBuf[(y * width + x) * 4 + 3];
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, a);
    }
}`
};
