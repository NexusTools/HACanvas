import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const PREDATOR_FILTER_PRESET: GimpFilterPreset = {
    id: "predator",
    name: "Predator (Thermal Vision)",
    category: "Artistic",
    gimpProcedure: "script-fu-predator",
    description: "Creates a cybernetic thermal-vision edge-glow effect with pixelized blocks (GIMP script-fu-predator).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "pixelAmount",
            "label": "Pixel Block Size",
            "type": "number",
            "min": 1,
            "max": 8,
            "step": 1,
            "defaultValue": 2
        }
    ],
    code: `// GIMP Predator Thermal Vision (script-fu-predator)
const block = helpers.clamp(Math.round(Number(params.pixelAmount ?? 2)), 1, 8);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const bx = Math.floor(x / block) * block;
        const by = Math.floor(y / block) * block;
        const grad = helpers.sobelAt(srcBuf, width, height, bx, by);
        const norm = helpers.clamp01(grad.mag / 220);
        const [r, g, b] = helpers.hsvToRgb((240 - norm * 240 + 360) % 360, 0.95, Math.min(1, norm * 1.4));
        const a = srcBuf[(y * width + x) * 4 + 3];
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
