import type { SelectionMaskSpec } from "../hybrid-art-engine.js";
import { AbstractRasterFilter, type FilterParameterSchema } from "./abstract-raster-filter-base.js";

export class BrightnessContrastFilter extends AbstractRasterFilter {
    public readonly filterType = "brightness_contrast" as const;
    public readonly label = "Brightness & Contrast";
    public readonly category = "Colors" as const;
    public override readonly description = "Adjusts image brightness offset and contrast slope around midpoint 128 (GIMP gegl:brightness-contrast).";
    public override readonly gimpProcedure = "gegl:brightness-contrast";
    public readonly parameterSchemas: FilterParameterSchema[] = [
        { key: "brightness", label: "Brightness", type: "number", min: -128, max: 128, step: 1, defaultValue: 0 },
        { key: "contrast", label: "Contrast", type: "number", min: -128, max: 128, step: 1, defaultValue: 0 }
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
        const brightness = Number(params.brightness ?? 0);
        const contrast = Number(params.contrast ?? 0);
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!this.isPointSelected(selection, x, y, ignoreSelection)) continue;
                const idx = (y * width + x) * 4;
                if (src[idx + 3] > 0) {
                    for (let c = 0; c < 3; c++) {
                        const v = factor * (src[idx + c] + brightness - 128) + 128;
                        dst[idx + c] = this.clampByte(v);
                    }
                }
            }
        }
    }
}
