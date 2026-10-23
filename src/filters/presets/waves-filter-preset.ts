import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const WAVES_FILTER_PRESET: GimpFilterPreset = {
    id: "waves",
    name: "Waves (Concentric)",
    category: "Distorts",
    gimpProcedure: "gegl:waves",
    description: "Concentric pond-ripple radial wave distortion radiating from the center (GIMP gegl:waves).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "amplitude",
            "label": "Wave Amplitude",
            "type": "number",
            "min": 1,
            "max": 40,
            "step": 1,
            "defaultValue": 8
        },
        {
            "key": "wavelength",
            "label": "Wavelength (px)",
            "type": "number",
            "min": 6,
            "max": 120,
            "step": 2,
            "defaultValue": 24
        }
    ],
    code: `// GIMP Concentric Waves (gegl:waves)
const amp = Number(params.amplitude ?? 8);
const wl = Math.max(4, Number(params.wavelength ?? 24));
const cx = width * 0.5, cy = height * 0.5;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const dx = x - cx, dy = y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const delta = Math.sin((dist / wl) * Math.PI * 2) * amp;
        const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, x + (dx / dist) * delta, y + (dy / dist) * delta);
        helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);
    }
}`
};
