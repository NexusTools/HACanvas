import { parseColor, type RGBA, type SelectionMaskSpec } from "../hybrid-art-engine.js";

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
 * Shares selection-mask checking, coordinate clamping, alpha-aware pixel blending,
 * and parameter default resolution across all concrete filter subclasses.
 */
export abstract class AbstractRasterFilter {
    public abstract readonly filterType: "gaussian_blur" | "sharpen" | "invert" | "threshold" | "brightness_contrast" | "drop_shadow";
    public abstract readonly label: string;
    public abstract readonly category: "Blur & Enhance" | "Color & Tone" | "Light & Shadow";
    public abstract readonly parameterSchemas: FilterParameterSchema[];

    public get displayName(): string {
        return this.label;
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
        let inside = false;
        if (sel.mode === "rect") {
            inside = x >= sel.x && x < sel.x + sel.width && y >= sel.y && y < sel.y + sel.height;
        } else if (sel.mode === "ellipse") {
            const rx = sel.width / 2;
            const ry = sel.height / 2;
            const cx = sel.x + rx;
            const cy = sel.y + ry;
            if (rx > 0 && ry > 0) {
                const dx = (x - cx) / rx;
                const dy = (y - cy) / ry;
                inside = dx * dx + dy * dy <= 1;
            }
        }
        return sel.inverted ? !inside : inside;
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

export class InvertFilter extends AbstractRasterFilter {
    public readonly filterType = "invert" as const;
    public readonly label = "Invert Colors";
    public readonly category = "Color & Tone" as const;
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

export class ThresholdFilter extends AbstractRasterFilter {
    public readonly filterType = "threshold" as const;
    public readonly label = "Threshold (Binarize)";
    public readonly category = "Color & Tone" as const;
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

export class BrightnessContrastFilter extends AbstractRasterFilter {
    public readonly filterType = "brightness_contrast" as const;
    public readonly label = "Brightness & Contrast";
    public readonly category = "Color & Tone" as const;
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

export class GaussianBlurFilter extends AbstractRasterFilter {
    public readonly filterType = "gaussian_blur" as const;
    public readonly label = "Gaussian Blur";
    public readonly category = "Blur & Enhance" as const;
    public readonly parameterSchemas: FilterParameterSchema[] = [
        { key: "radius", label: "Blur Radius (px)", type: "number", min: 1, max: 10, step: 1, defaultValue: 2 }
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
        const radius = Math.max(1, Math.min(10, Math.round(Number(params.radius ?? 2))));
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

export class SharpenFilter extends AbstractRasterFilter {
    public readonly filterType = "sharpen" as const;
    public readonly label = "Sharpen (Unsharp Kernel)";
    public readonly category = "Blur & Enhance" as const;
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

export class DropShadowFilter extends AbstractRasterFilter {
    public readonly filterType = "drop_shadow" as const;
    public readonly label = "Drop Shadow";
    public readonly category = "Light & Shadow" as const;
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

/**
 * Registry of all GIMP-compatible `AbstractRasterFilter` instances.
 */
export class RasterFilterRegistry {
    private static readonly filters: Map<string, AbstractRasterFilter> = new Map<string, AbstractRasterFilter>([
        ["invert", new InvertFilter()],
        ["threshold", new ThresholdFilter()],
        ["brightness_contrast", new BrightnessContrastFilter()],
        ["gaussian_blur", new GaussianBlurFilter()],
        ["sharpen", new SharpenFilter()],
        ["drop_shadow", new DropShadowFilter()]
    ]);

    public static getFilter(filterType: string): AbstractRasterFilter {
        const found = this.filters.get(filterType);
        if (!found) {
            throw new Error(`Unsupported raster filter: '${filterType}'.`);
        }
        return found;
    }

    public static getAllFilters(): AbstractRasterFilter[] {
        return Array.from(this.filters.values());
    }
}
