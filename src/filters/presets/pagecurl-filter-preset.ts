import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const PAGECURL_FILTER_PRESET: GimpFilterPreset = {
    id: "pagecurl",
    name: "Pagecurl",
    category: "Distorts",
    gimpProcedure: "plug-in-pagecurl",
    description: "Curls the bottom-right corner of the layer with cylindrical specular shading and drop shadow (GIMP plug-ins/pagecurl/pagecurl.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "curlSize",
            "label": "Curl Size (0.15-0.6)",
            "type": "number",
            "min": 0.15,
            "max": 0.6,
            "step": 0.05,
            "defaultValue": 0.32
        }
    ],
    code: `// GIMP Pagecurl Plugin (plug-ins/pagecurl/pagecurl.c)
const size = helpers.clamp(Number(params.curlSize ?? 0.32), 0.1, 0.7);
const cw = width * size, ch = height * size;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const u = (width - 1 - x) / (cw || 1);
        const v = (height - 1 - y) / (ch || 1);
        const line = u + v;
        if (line < 1.0) {
            // Peeled corner reveals transparent/shadowed backing
            helpers.setPixel(outBuf, width, height, x, y, 0, 0, 0, 0);
        } else if (line < 1.35) {
            // Cylindrical curl highlight tube
            const t = (line - 1.0) / 0.35;
            const highlight = Math.sin(t * Math.PI) * 90;
            const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x, y);
            helpers.setPixel(outBuf, width, height, x, y, r * 0.85 + highlight, g * 0.85 + highlight, b * 0.85 + highlight, a);
        }
    }
}`
};
