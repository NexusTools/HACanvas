import * as fs from "fs";
import * as path from "path";
import {
    type BlendMode,
    type EasingMode,
    type VectorObjectSpec
} from "../../hybrid-art-engine.js";
import {
    BUILT_IN_CURVE_PRESETS,
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    RASTER_TRANSITION_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    type GimpFilterPreset
} from "../../shared-object-library.js";
import { AbstractAiTool, type HaCanvasAiContext } from "../abstract-ai-tool-base.js";

export class InspectPixelsAiTool extends AbstractAiTool {
    public readonly name = "inspect_pixels";
    public readonly category = "inspect" as const;
    public readonly icon = "💧";
    public readonly description =
        "Samples RGBA & hex pixel colors and computes color histograms / dominant colors at a point (x, y) or rectangular region (x, y, width, height) on the composite canvas or a specific layer (with support for raw un-filtered raster sampling or export-mode sampling).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            x: { type: "number", description: "X pixel coordinate (0-based)." },
            y: { type: "number", description: "Y pixel coordinate (0-based)." },
            width: { type: "number", description: "Region width to sample (default 1 for single pixel)." },
            height: { type: "number", description: "Region height to sample (default 1 for single pixel)." },
            layerId: { type: "string", description: "Optional layer ID to sample in isolation." },
            frame: { type: "number", description: "Optional animation frame index (default current frame)." },
            rawRaster: {
                type: "boolean",
                description: "When layerId is a raster layer, set true to sample the raw underlying raster pixels without any attached dynamic filters."
            },
            forExport: {
                type: "boolean",
                description: "Set true to sample pixels as rendered for export (always evaluating attached filters even if viewport preview is toggled off)."
            },
            previewFilters: {
                type: "boolean",
                description: "Optional explicit override for whether attached dynamic filters should be evaluated during sampling."
            }
        },
        required: ["x", "y"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const w = partialArgs.width ?? 1;
        const h = partialArgs.height ?? 1;
        return w > 1 || h > 1
            ? `Sampling pixel region (${partialArgs.x ?? 0}, ${partialArgs.y ?? 0}, ${w}×${h})...`
            : `Sampling pixel at (${partialArgs.x ?? 0}, ${partialArgs.y ?? 0})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        if (result?.hex) {
            return `Sampled pixel at (${args.x}, ${args.y}) → ${result.hex}`;
        }
        return `Sampled pixel region (${args.x}, ${args.y}) → avg ${result?.averageHex || "OK"}`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        return state.engine.inspectPixels(
            state.canvasId,
            Number(args.x ?? 0),
            Number(args.y ?? 0),
            Number(args.width ?? 1),
            Number(args.height ?? 1),
            args.layerId,
            Number(args.frame ?? state.currentFrame),
            {
                rawRaster: args.rawRaster,
                forExport: args.forExport,
                previewFilters: args.previewFilters
            }
        );
    }
}
