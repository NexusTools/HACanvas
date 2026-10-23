import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const BUMP_MAP_FILTER_PRESET: GimpFilterPreset = {
    id: "bump_map",
    name: "Bump Map",
    category: "Map",
    gimpProcedure: "gegl:bump-map",
    description: "Embosses 3D directional lighting onto the image using its own luminance heightfield while preserving colors (GIMP gegl:bump-map).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "azimuth",
            "label": "Light Azimuth (deg)",
            "type": "number",
            "min": 0,
            "max": 360,
            "step": 10,
            "defaultValue": 135
        },
        {
            "key": "depth",
            "label": "Bump Depth",
            "type": "number",
            "min": 1,
            "max": 30,
            "step": 1,
            "defaultValue": 8
        }
    ],
    code: `// GIMP Self Bump Map (gegl:bump-map)
const az = (Number(params.azimuth ?? 135) * Math.PI) / 180;
const depth = Number(params.depth ?? 8) / 255;
const lx = Math.cos(az), ly = Math.sin(az);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const grad = helpers.sobelAt(srcBuf, width, height, x, y);
        const bump = (grad.gx * lx + grad.gy * ly) * depth;
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     * (1 + bump));
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] * (1 + bump));
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] * (1 + bump));
    }
}`
};
