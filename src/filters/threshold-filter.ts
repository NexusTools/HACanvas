import type { SelectionMaskSpec } from "../hybrid-art-engine.js";
import { AbstractRasterFilter, type FilterParameterSchema } from "./abstract-raster-filter-base.js";

export class ThresholdFilter extends AbstractRasterFilter {
    public readonly filterType = "threshold" as const;
    public readonly label = "Threshold (Binarize)";
    public readonly category = "Colors" as const;
    public override readonly description = "Binarizes pixels to pure black (0) or pure white (255) based on a luminance cutoff (GIMP gegl:threshold).";
    public override readonly gimpProcedure = "gegl:threshold";
    public readonly parameterSchemas: FilterParameterSchema[] = [
        { key: "threshold", label: "Luminance Cutoff", type: "number", min: 0, max: 255, step: 1, defaultValue: 128 }
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
        const cutoff = Number(params.threshold ?? 128);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!this.isPointSelected(selection, x, y, ignoreSelection)) continue;
                const idx = (y * width + x) * 4;
                if (src[idx + 3] > 0) {
                    const lum = 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
                    const val = lum >= cutoff ? 255 : 0;
                    dst[idx] = val;
                    dst[idx + 1] = val;
                    dst[idx + 2] = val;
                }
            }
        }
    }
}
