import type { SelectionMaskSpec } from "../hybrid-art-engine.js";
import { AbstractRasterFilter, type FilterParameterSchema } from "./abstract-raster-filter-base.js";

export class GaussianBlurFilter extends AbstractRasterFilter {
    public readonly filterType = "gaussian_blur" as const;
    public readonly label = "Gaussian Blur";
    public readonly category = "Blur" as const;
    public override readonly description = "Performs a separable Gaussian neighborhood blur across horizontal and vertical axes (GIMP gegl:gaussian-blur).";
    public override readonly gimpProcedure = "gegl:gaussian-blur";
    public readonly parameterSchemas: FilterParameterSchema[] = [
        { key: "radius", label: "Blur Radius (px)", type: "number", min: 1, max: 25, step: 1, defaultValue: 2 }
    ];

    protected override applyToBuffer(
        src: Buffer,
        dst: Buffer,
        width: number,
        height: number,
        selection: SelectionMaskSpec | undefined,
        params: Record<string, any>,
        ignoreSelection: boolean
    ): void {
        const radius = Math.max(1, Math.min(25, Math.round(Number(params.radius ?? 2))));
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!this.isPointSelected(selection, x, y, ignoreSelection)) continue;
                let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
                for (let dy = -radius; dy <= radius; dy++) {
                    const ny = Math.min(height - 1, Math.max(0, y + dy));
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = Math.min(width - 1, Math.max(0, x + dx));
                        const nIdx = (ny * width + nx) * 4;
                        rSum += src[nIdx];
                        gSum += src[nIdx + 1];
                        bSum += src[nIdx + 2];
                        aSum += src[nIdx + 3];
                        count++;
                    }
                }
                const idx = (y * width + x) * 4;
                dst[idx] = this.clampByte(rSum / count);
                dst[idx + 1] = this.clampByte(gSum / count);
                dst[idx + 2] = this.clampByte(bSum / count);
                dst[idx + 3] = this.clampByte(aSum / count);
            }
        }
    }
}
