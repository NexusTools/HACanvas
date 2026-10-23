import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";

export const VAN_GOGH_LIC_FILTER_PRESET: GimpFilterPreset = {
    id: "van_gogh_lic",
    name: "Van Gogh (LIC)",
    category: "Artistic",
    gimpProcedure: "plug-in-lic",
    description: "Line Integral Convolution along local image gradient tangent vectors for expressive Van Gogh brushwork (GIMP plug-ins/common/van-gogh-lic.c).",
    builtIn: true,
    parameterSchemas: [
        {
            "key": "filtLen",
            "label": "Stroke Length (px)",
            "type": "number",
            "min": 2,
            "max": 18,
            "step": 1,
            "defaultValue": 6
        }
    ],
    code: `// GIMP Van Gogh Line Integral Convolution (plug-ins/common/van-gogh-lic.c)
const len = helpers.clamp(Math.round(Number(params.filtLen ?? 6)), 2, 18);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (!helpers.isSelected(selection, x, y)) continue;
        const grad = helpers.sobelAt(srcBuf, width, height, x, y);
        // Tangent is perpendicular to gradient vector (gx, gy) -> (-gy, gx)
        const mag = Math.hypot(grad.gx, grad.gy) || 1;
        const tx = -grad.gy / mag;
        const ty = grad.gx / mag;
        let sr = 0, sg = 0, sb = 0, sa = 0, wSum = 0;
        for (let s = -len; s <= len; s++) {
            const w = Math.cos((s / (len + 1)) * Math.PI * 0.5);
            const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, x + tx * s, y + ty * s);
            sr += r * w; sg += g * w; sb += b * w; sa += a * w;
            wSum += w;
        }
        helpers.setPixel(outBuf, width, height, x, y, sr / wSum, sg / wSum, sb / wSum, sa / wSum);
    }
}`
};
