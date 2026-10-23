import type { SelectionMaskSpec } from "../hybrid-art-engine.js";
import { AbstractRasterFilter, type FilterParameterSchema } from "./abstract-raster-filter-base.js";
import type { GimpFilterPreset } from "./gimp-filter-presets.js";

/**
 * Concrete `AbstractRasterFilter` backed by a JavaScript `GimpFilterPreset` (built-in or custom).
 */
export class JsPresetRasterFilter extends AbstractRasterFilter {
    public readonly filterType: string;
    public readonly label: string;
    public readonly category: string;
    public readonly parameterSchemas: FilterParameterSchema[];
    public override readonly description: string;
    public override readonly gimpProcedure?: string;
    public override readonly builtIn: boolean;
    private readonly presetCode: string;

    constructor(preset: GimpFilterPreset) {
        super();
        this.filterType = preset.id;
        this.label = preset.name;
        this.category = preset.category || "Custom";
        this.parameterSchemas = preset.parameterSchemas || [];
        this.description = preset.description || "";
        this.gimpProcedure = preset.gimpProcedure;
        this.builtIn = preset.builtIn !== false;
        this.presetCode = preset.code;
    }

    public override get code(): string {
        return this.presetCode;
    }

    protected override applyToBuffer(
        src: Buffer,
        dst: Buffer,
        width: number,
        height: number,
        selection: SelectionMaskSpec | undefined,
        params: Record<string, any>,
        ignoreSelection: boolean
    ): void {
        const effSel = ignoreSelection ? undefined : selection;
        AbstractRasterFilter.evaluateFilterScript(this.presetCode, src, dst, width, height, params, effSel);
    }
}
