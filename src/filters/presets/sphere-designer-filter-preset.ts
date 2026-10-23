import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const SPHERE_DESIGNER_FILTER_PRESET: GimpFilterPreset = {
    id: "sphere_designer",
    name: "Sphere Designer",
    category: "Render",
    gimpProcedure: "plug-in-spheredesigner",
    description: "Raycasts a 3D Phong-illuminated textured sphere at the center of the canvas (GIMP plug-ins/common/sphere-designer.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "color",
            "label": "Sphere Color",
            "type": "color",
            "defaultValue": "#00d4ff"
        }
    ],
    code: `// GIMP Sphere Designer Raycaster (plug-ins/common/sphere-designer.c)
const col = helpers.parseColor(String(params.color || "#00d4ff"));
const cx = width * 0.5, cy = height * 0.5;
const rad = Math.min(cx, cy) * 0.82;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const nx = (x - cx) / (rad || 1);
        const ny = (y - cy) / (rad || 1);
        const r2 = nx * nx + ny * ny;
        if (r2 <= 1.0) {
            const nz = Math.sqrt(1 - r2);
            const ndotl = Math.max(0.12, -nx * 0.45 - ny * 0.45 + nz * 0.77);
            const spec = Math.pow(Math.max(0, ndotl), 24) * 210;
            helpers.setPixel(outBuf, width, height, x, y, col.r * ndotl + spec, col.g * ndotl + spec, col.b * ndotl + spec, 255);
        }
    }
}`
};
