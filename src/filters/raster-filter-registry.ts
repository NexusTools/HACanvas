import {
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    type GimpFilterPreset
} from "./gimp-filter-presets.js";
import { AbstractRasterFilter } from "./abstract-raster-filter-base.js";
import { JsPresetRasterFilter } from "./js-preset-raster-filter.js";
import { InvertFilter } from "./invert-filter.js";
import { ThresholdFilter } from "./threshold-filter.js";
import { BrightnessContrastFilter } from "./brightness-contrast-filter.js";
import { GaussianBlurFilter } from "./gaussian-blur-filter.js";
import { SharpenFilter } from "./sharpen-filter.js";
import { DropShadowFilter } from "./drop-shadow-filter.js";

/**
 * Registry of all GIMP-compatible `AbstractRasterFilter` instances (including all 80+ built-in GIMP
 * plugins/GEGL operations and any user/AI-saved custom JavaScript filter presets).
 */
export class RasterFilterRegistry {
    private static readonly filters: Map<string, AbstractRasterFilter> = RasterFilterRegistry.buildInitialMap();

    private static buildInitialMap(): Map<string, AbstractRasterFilter> {
        const map = new Map<string, AbstractRasterFilter>([
            ["invert", new InvertFilter()],
            ["threshold", new ThresholdFilter()],
            ["brightness_contrast", new BrightnessContrastFilter()],
            ["gaussian_blur", new GaussianBlurFilter()],
            ["sharpen", new SharpenFilter()],
            ["drop_shadow", new DropShadowFilter()]
        ]);
        for (const preset of BUILT_IN_GIMP_FILTER_PRESETS) {
            if (!map.has(preset.id)) {
                map.set(preset.id, new JsPresetRasterFilter(preset));
            }
        }
        return map;
    }

    public static getFilter(filterType: string): AbstractRasterFilter {
        const found = this.filters.get(filterType);
        if (!found) {
            throw new Error(`Unsupported raster filter: '${filterType}'.`);
        }
        return found;
    }

    public static hasFilter(filterType: string): boolean {
        return this.filters.has(filterType);
    }

    public static registerCustomPreset(preset: GimpFilterPreset): AbstractRasterFilter {
        const instance = new JsPresetRasterFilter({ ...preset, builtIn: false });
        this.filters.set(preset.id, instance);
        return instance;
    }

    public static unregisterCustomPreset(filterId: string): boolean {
        if (BUILT_IN_GIMP_FILTER_PRESETS.some(p => p.id === filterId)) {
            return false;
        }
        return this.filters.delete(filterId);
    }

    public static getAllFilters(): AbstractRasterFilter[] {
        return Array.from(this.filters.values());
    }

    public static getAllPresets(): GimpFilterPreset[] {
        return Array.from(this.filters.values()).map(f => f.toPreset());
    }

    public static getCategories(): string[] {
        const seen = new Set<string>(GIMP_FILTER_CATEGORIES);
        for (const f of this.filters.values()) {
            if (f.category) seen.add(f.category);
        }
        return Array.from(seen);
    }

    public static getFiltersByCategory(): Map<string, AbstractRasterFilter[]> {
        const grouped = new Map<string, AbstractRasterFilter[]>();
        for (const cat of this.getCategories()) {
            grouped.set(cat, []);
        }
        for (const f of this.filters.values()) {
            const cat = f.category || "Custom";
            if (!grouped.has(cat)) grouped.set(cat, []);
            grouped.get(cat)!.push(f);
        }
        for (const [k, v] of Array.from(grouped.entries())) {
            if (v.length === 0) grouped.delete(k);
        }
        return grouped;
    }
}
