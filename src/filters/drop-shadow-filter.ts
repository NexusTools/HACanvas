import type { SelectionMaskSpec } from "../hybrid-art-engine.js";
import { AbstractRasterFilter, type FilterParameterSchema } from "./abstract-raster-filter-base.js";
import { parseColor, type RGBA } from "../hybrid-art-engine.js";

export class DropShadowFilter extends AbstractRasterFilter {
    public readonly filterType = "drop_shadow" as const;
    public readonly label = "Drop Shadow";
    public readonly category = "Light and Shadow" as const;
    public override readonly description = "Renders an offset alpha drop shadow beneath the layer's opaque pixels (GIMP gegl:dropshadow).";
    public override readonly gimpProcedure = "gegl:dropshadow";
    public readonly parameterSchemas: FilterParameterSchema[] = [
        { key: "offsetX", label: "Offset X (px)", type: "number", min: -32, max: 32, step: 1, defaultValue: 4 },
        { key: "offsetY", label: "Offset Y (px)", type: "number", min: -32, max: 32, step: 1, defaultValue: 4 },
        { key: "color", label: "Shadow Color", type: "color", defaultValue: "#000000" }
    ];

    protected override applyToBuffer(
        src: Buffer,
        dst: Buffer,
        width: number,
        height: number,
        _selection: SelectionMaskSpec | undefined,
        params: Record<string, any>,
        _ignoreSelection: boolean
    ): void {
        const offsetX = Math.round(Number(params.offsetX ?? 4));
        const offsetY = Math.round(Number(params.offsetY ?? 4));
        const shadowColor: RGBA = parseColor(String(params.color || "rgba(0,0,0,0.5)"));
        if (String(params.color || "").startsWith("#") && String(params.color).length === 7) {
            shadowColor.a = 140;
        }
        dst.fill(0);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = (y * width + x) * 4;
                const srcA = src[srcIdx + 3];
                if (srcA > 0) {
                    const sx = x + offsetX;
                    const sy = y + offsetY;
                    if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                        const sIdx = (sy * width + sx) * 4;
                        dst[sIdx] = shadowColor.r;
                        dst[sIdx + 1] = shadowColor.g;
                        dst[sIdx + 2] = shadowColor.b;
                        dst[sIdx + 3] = this.clampByte((srcA / 255) * shadowColor.a);
                    }
                }
            }
        }
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                if (src[idx + 3] > 0) {
                    this.blendNormalInPlace(dst, idx, src[idx], src[idx + 1], src[idx + 2], src[idx + 3]);
                }
            }
        }
    }
}
