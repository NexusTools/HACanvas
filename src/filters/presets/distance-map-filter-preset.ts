import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const DISTANCE_MAP_FILTER_PRESET: GimpFilterPreset = {
    id: "distance_map",
    name: "Distance Map",
    category: "Generic",
    gimpProcedure: "gegl:distance-transform",
    description: "Computes a grayscale distance field from dark/transparent edges toward interior shapes (GIMP gegl:distance-transform).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "threshold",
            "label": "Luminance Cutoff",
            "type": "number",
            "min": 10,
            "max": 240,
            "step": 10,
            "defaultValue": 100
        }
    ],
    code: `// GIMP Distance Transform Map (gegl:distance-transform)
const cutoff = Number(params.threshold ?? 100);
const dist = new Float32Array(width * height);
const INF = width + height;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x, y);
        const inside = a > 32 && helpers.luminance(r, g, b) >= cutoff;
        const idx = y * width + x;
        if (!inside) dist[idx] = 0;
        else {
            const top = y > 0 ? dist[(y - 1) * width + x] + 1 : 1;
            const left = x > 0 ? dist[y * width + (x - 1)] + 1 : 1;
            dist[idx] = Math.min(INF, top, left);
        }
    }
}
let maxD = 1;
for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
        const idx = y * width + x;
        const bot = y + 1 < height ? dist[(y + 1) * width + x] + 1 : 1;
        const right = x + 1 < width ? dist[y * width + (x + 1)] + 1 : 1;
        dist[idx] = Math.min(dist[idx], bot, right);
        if (dist[idx] > maxD) maxD = dist[idx];
    }
}
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const v = helpers.clamp255((dist[y * width + x] / maxD) * 255);
        helpers.setPixel(outBuf, width, height, x, y, v, v, v, srcBuf[(y * width + x) * 4 + 3]);
    }
}`
};
