import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const LIGHTING_EFFECTS_FILTER_PRESET: GimpFilterPreset = {
    id: "lighting_effects",
    name: "Lighting Effects (Phong)",
    category: "Light and Shadow",
    gimpProcedure: "plug-in-lighting",
    description: "3D Phong directional/point spotlight illumination with specular shininess and bump normals (GIMP plug-ins/lighting/).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "ambient",
            "label": "Ambient Light (0-1)",
            "type": "number",
            "min": 0.05,
            "max": 0.8,
            "step": 0.05,
            "defaultValue": 0.25
        },
        {
            "key": "specular",
            "label": "Specular Highlight",
            "type": "number",
            "min": 0,
            "max": 2,
            "step": 0.1,
            "defaultValue": 0.7
        }
    ],
    code: `// GIMP Lighting Effects Phong Shader (plug-ins/lighting/lighting-shade.c)
const ambient = Number(params.ambient ?? 0.25);
const specStrength = Number(params.specular ?? 0.7);
const lx = width * 0.3, ly = height * 0.25, lz = Math.max(width, height) * 0.55;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const grad = helpers.sobelAt(srcBuf, width, height, x, y);
        const nx = -grad.gx * 0.015, ny = -grad.gy * 0.015, nz = 1.0;
        const nLen = Math.hypot(nx, ny, nz) || 1;
        const vx = lx - x, vy = ly - y, vz = lz;
        const vLen = Math.hypot(vx, vy, vz) || 1;
        const ndotl = Math.max(0, (nx * vx + ny * vy + nz * vz) / (nLen * vLen));
        const spec = Math.pow(ndotl, 16) * specStrength * 255;
        const i = (y * width + x) * 4;
        const shade = ambient + ndotl * (1 - ambient);
        outBuf[i]     = helpers.clamp255(srcBuf[i]     * shade + spec);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] * shade + spec);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] * shade + spec);
    }
}`
};
