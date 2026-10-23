import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const FLAME_FILTER_PRESET: GimpFilterPreset = {
    id: "flame",
    name: "Flame (Cosmic IFS)",
    category: "Render",
    gimpProcedure: "plug-in-flame",
    description: "Renders glowing recursive iterated function system cosmic flame filaments over the canvas (GIMP plug-ins/flame/).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "complexity",
            "label": "Filament Complexity",
            "type": "number",
            "min": 2,
            "max": 12,
            "step": 1,
            "defaultValue": 5
        }
    ],
    code: `// GIMP Cosmic Flame Attractor (plug-ins/flame/flame.c)
const freq = Number(params.complexity ?? 5);
const cx = width * 0.5, cy = height * 0.5;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const nx = (x - cx) / (cx || 1), ny = (y - cy) / (cy || 1);
        const r = Math.hypot(nx, ny);
        const theta = Math.atan2(ny, nx);
        const w = Math.exp(-Math.abs(Math.sin(theta * freq + r * 6) - r * 0.8) * 5) * Math.exp(-r * 1.1);
        const [cr, cg, cb] = helpers.hsvToRgb((r * 160 + 15) % 360, 0.9, 1.0);
        const i = (y * width + x) * 4;
        outBuf[i]     = helpers.clamp255(srcBuf[i]     + cr * w);
        outBuf[i + 1] = helpers.clamp255(srcBuf[i + 1] + cg * w);
        outBuf[i + 2] = helpers.clamp255(srcBuf[i + 2] + cb * w);
    }
}`
};
