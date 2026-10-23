import type { SelectionMaskSpec } from "../hybrid-art-engine.js";
import { AbstractRasterFilter, type FilterParameterSchema } from "./abstract-raster-filter-base.js";

export class SharpenFilter extends AbstractRasterFilter {
    public readonly filterType = "sharpen" as const;
    public readonly label = "Sharpen (Unsharp Kernel)";
    public readonly category = "Enhance" as const;
    public override readonly description = "Sharpens edges by subtracting a Gaussian-blurred copy or applying an unsharp 3x3 kernel (GIMP gegl:unsharp-mask).";
    public override readonly gimpProcedure = "gegl:unsharp-mask";
    public readonly parameterSchemas: FilterParameterSchema[] = [
        { key: "amount", label: "Amount", type: "number", min: 0.2, max: 5.0, step: 0.1, defaultValue: 1.2 }
    ];

    protected override applyToBuffer(
        src: Buffer,
        dst: Buffer,
        width: number,
        height: number,
        selection: SelectionMaskSpec | undefined,
        _params: Record<string, any>,
        ignoreSelection: boolean
    ): void {
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                if (!this.isPointSelected(selection, x, y, ignoreSelection)) continue;
                let r = 0, g = 0, b = 0, k = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nIdx = ((y + dy) * width + (x + dx)) * 4;
                        const weight = kernel[k++];
                        r += src[nIdx] * weight;
                        g += src[nIdx + 1] * weight;
                        b += src[nIdx + 2] * weight;
                    }
                }
                const idx = (y * width + x) * 4;
                dst[idx] = this.clampByte(r);
                dst[idx + 1] = this.clampByte(g);
                dst[idx + 2] = this.clampByte(b);
            }
        }
    }
}
