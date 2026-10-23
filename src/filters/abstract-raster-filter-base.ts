import type { SelectionMaskSpec } from "../hybrid-art-engine.js";
import {
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    GIMP_JS_RUNTIME_HELPERS,
    GIMP_NAMESPACE_HELPERS,
    GEGL_NAMESPACE_HELPERS,
    type GimpFilterPreset,
    type GimpJsInternalDoc
} from "./gimp-filter-presets.js";

export {
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    GIMP_JS_RUNTIME_HELPERS,
    GIMP_NAMESPACE_HELPERS,
    GEGL_NAMESPACE_HELPERS,
    type GimpFilterPreset,
    type GimpJsInternalDoc
};

export interface FilterParameterSchema {
    key: string;
    label: string;
    type: "number" | "color";
    min?: number;
    max?: number;
    step?: number;
    defaultValue: number | string;
}

/**
 * Abstract base class for all GIMP-compatible pixel filters in `lib/hacanvas`.
 * Every filter provides its full JavaScript source code (`code`), folder `category`,
 * parameter schemas (`parameterSchemas`), and description.
 */
export abstract class AbstractRasterFilter {
    public abstract readonly filterType: string;
    public abstract readonly label: string;
    public abstract readonly category: string;
    public abstract readonly parameterSchemas: FilterParameterSchema[];
    public readonly description: string = "";
    public readonly gimpProcedure?: string;
    public readonly builtIn: boolean = true;

    private static readonly compiledCache = new Map<string, Function>();

    public get displayName(): string {
        return this.label;
    }

    /**
     * Full human-readable JavaScript source code for this filter.
     */
    public get code(): string {
        const preset = BUILT_IN_GIMP_FILTER_PRESETS.find(p => p.id === this.filterType);
        return preset?.code || "";
    }

    public toPreset(): GimpFilterPreset {
        const preset = BUILT_IN_GIMP_FILTER_PRESETS.find(p => p.id === this.filterType);
        return {
            id: this.filterType,
            name: this.label,
            category: this.category,
            description: this.description || preset?.description || `${this.label} GIMP pixel filter.`,
            gimpProcedure: this.gimpProcedure || preset?.gimpProcedure,
            parameterSchemas: this.parameterSchemas,
            code: this.code,
            builtIn: this.builtIn
        };
    }

    public getDefaultParams(): Record<string, any> {
        const defaults: Record<string, any> = {};
        for (const schema of this.parameterSchemas) {
            defaults[schema.key] = schema.defaultValue;
        }
        return defaults;
    }

    protected isPointSelected(sel: SelectionMaskSpec | undefined, x: number, y: number, ignoreSelection = false): boolean {
        if (ignoreSelection || !sel || sel.mode === "none") return true;
        return GIMP_JS_RUNTIME_HELPERS.isSelected(sel, x, y);
    }

    protected clampByte(val: number): number {
        return Math.max(0, Math.min(255, Math.round(val)));
    }

    protected blendNormalInPlace(dst: Buffer, idx: number, sr: number, sg: number, sb: number, sa: number): void {
        if (sa <= 0) return;
        const dr = dst[idx];
        const dg = dst[idx + 1];
        const db = dst[idx + 2];
        const da = dst[idx + 3];
        if (da === 0) {
            dst[idx] = sr;
            dst[idx + 1] = sg;
            dst[idx + 2] = sb;
            dst[idx + 3] = sa;
            return;
        }
        const srcA = sa / 255;
        const dstA = da / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA <= 0) {
            dst[idx + 3] = 0;
            return;
        }
        dst[idx] = this.clampByte((sr * srcA + dr * dstA * (1 - srcA)) / outA);
        dst[idx + 1] = this.clampByte((sg * srcA + dg * dstA * (1 - srcA)) / outA);
        dst[idx + 2] = this.clampByte((sb * srcA + db * dstA * (1 - srcA)) / outA);
        dst[idx + 3] = this.clampByte(outA * 255);
    }

    public static validateFilterScript(code: string): { valid: boolean; error?: string } {
        if (!code || !code.trim()) {
            return { valid: false, error: "Filter JavaScript code cannot be empty." };
        }
        try {
            const fn = new Function(
                "srcBuf",
                "outBuf",
                "width",
                "height",
                "params",
                "selection",
                "helpers",
                "gimp",
                "gegl",
                code
            );
            const testSrc = new Uint8Array(16);
            const testOut = new Uint8Array(16);
            for (let i = 0; i < 16; i += 4) {
                testSrc[i] = 200;
                testSrc[i + 1] = 120;
                testSrc[i + 2] = 60;
                testSrc[i + 3] = 255;
                testOut[i] = 200;
                testOut[i + 1] = 120;
                testOut[i + 2] = 60;
                testOut[i + 3] = 255;
            }
            fn(
                testSrc,
                testOut,
                2,
                2,
                {},
                undefined,
                GIMP_JS_RUNTIME_HELPERS,
                GIMP_NAMESPACE_HELPERS,
                GEGL_NAMESPACE_HELPERS
            );
            return { valid: true };
        } catch (err: any) {
            return { valid: false, error: err?.message || String(err) };
        }
    }

    public static evaluateFilterScript(
        code: string,
        src: Uint8Array,
        dst: Uint8Array,
        width: number,
        height: number,
        params: Record<string, any>,
        selection: SelectionMaskSpec | undefined
    ): void {
        let fn = this.compiledCache.get(code);
        if (!fn) {
            fn = new Function(
                "srcBuf",
                "outBuf",
                "width",
                "height",
                "params",
                "selection",
                "helpers",
                "gimp",
                "gegl",
                code
            );
            if (this.compiledCache.size > 160) {
                const firstKey = this.compiledCache.keys().next().value;
                if (firstKey) this.compiledCache.delete(firstKey);
            }
            this.compiledCache.set(code, fn);
        }
        fn(
            src,
            dst,
            width,
            height,
            params,
            selection,
            GIMP_JS_RUNTIME_HELPERS,
            GIMP_NAMESPACE_HELPERS,
            GEGL_NAMESPACE_HELPERS
        );
    }

    public apply(
        src: Buffer,
        width: number,
        height: number,
        selection: SelectionMaskSpec | undefined,
        params: Record<string, any> = {},
        ignoreSelection = false
    ): Buffer {
        const mergedParams = { ...this.getDefaultParams(), ...params };
        const dst = Buffer.from(src);
        if (typeof params.customCode === "string" && params.customCode.trim()) {
            const effSel = ignoreSelection ? undefined : selection;
            AbstractRasterFilter.evaluateFilterScript(params.customCode, src, dst, width, height, mergedParams, effSel);
            return dst;
        }
        this.applyToBuffer(src, dst, width, height, selection, mergedParams, ignoreSelection);
        return dst;
    }

    protected abstract applyToBuffer(
        src: Buffer,
        dst: Buffer,
        width: number,
        height: number,
        selection: SelectionMaskSpec | undefined,
        params: Record<string, any>,
        ignoreSelection: boolean
    ): void;
}
