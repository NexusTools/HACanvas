import type { SelectionMaskSpec } from "../hybrid-art-engine.js";
import { AbstractRasterFilter, type FilterParameterSchema } from "./abstract-raster-filter-base.js";

export class InvertFilter extends AbstractRasterFilter {
    public readonly filterType = "invert" as const;
    public readonly label = "Invert Colors";
    public readonly category = "Colors" as const;
    public override readonly description = "Inverts Red, Green, and Blue channels (255 - channel) while preserving Alpha (GIMP gegl:invert-linear).";
    public override readonly gimpProcedure = "gegl:invert-linear";
    public readonly parameterSchemas: FilterParameterSchema[] = [];

    protected override applyToBuffer(
        src: Buffer,
        dst: Buffer,
        width: number,
        height: number,
        selection: SelectionMaskSpec | undefined,
        _params: Record<string, any>,
        ignoreSelection: boolean
    ): void {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!this.isPointSelected(selection, x, y, ignoreSelection)) continue;
                const idx = (y * width + x) * 4;
                if (src[idx + 3] > 0) {
                    dst[idx] = 255 - src[idx];
                    dst[idx + 1] = 255 - src[idx + 1];
                    dst[idx + 2] = 255 - src[idx + 2];
                }
            }
        }
    }
}
