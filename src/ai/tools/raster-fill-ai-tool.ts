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

export class RasterFillAiTool extends AbstractAiTool {
    public readonly name = "raster_fill";
    public readonly category = "raster" as const;
    public readonly icon = "🪣";
    public readonly description =
        "Fills a raster layer (or active selection) using a GIMP bucket 'flood' fill, 'linear_gradient', or 'radial_gradient'.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            fillType: {
                type: "string",
                enum: ["flood", "linear_gradient", "radial_gradient"],
                description: "Type of fill (default 'flood')."
            },
            color: { type: "string", description: "Primary/start color hex (e.g. '#1a2035')." },
            colorEnd: { type: "string", description: "End color hex for linear_gradient or radial_gradient (e.g. '#ff3366')." },
            x: { type: "number", description: "Seed X for flood fill or start X for gradient (default 0)." },
            y: { type: "number", description: "Seed Y for flood fill or start Y for gradient (default 0)." },
            x2: { type: "number", description: "End X for gradient." },
            y2: { type: "number", description: "End Y for gradient." },
            radius: { type: "number", description: "Radius for radial_gradient." },
            tolerance: { type: "number", description: "Color tolerance (0..255) for flood fill (default 20)." },
            frame: { type: "number", description: "Optional animation frame index." },
            layerId: { type: "string", description: "Optional raster layer ID or name." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["fillType", "color"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const ft = partialArgs.fillType || "flood";
        return `Applying ${ft.replace("_", " ")} (${partialArgs.color || ""}${partialArgs.colorEnd ? ` → ${partialArgs.colorEnd}` : ""})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Applied ${args.fillType || "flood"} fill (${result?.pixelsFilled ?? 0} px) on '${result?.layerId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "raster",
            args.layerId,
            args.sharedObjectId
        );
        const res = state.engine.rasterFill(state.canvasId, layerId, {
            sharedObjectId,
            fillType: args.fillType || "flood",
            color: args.color || state.toolOptions.primaryColor,
            colorEnd: args.colorEnd || state.toolOptions.secondaryColor,
            x: args.x !== undefined ? Number(args.x) : 0,
            y: args.y !== undefined ? Number(args.y) : 0,
            x2: args.x2 !== undefined ? Number(args.x2) : undefined,
            y2: args.y2 !== undefined ? Number(args.y2) : undefined,
            radius: args.radius !== undefined ? Number(args.radius) : undefined,
            tolerance: args.tolerance !== undefined ? Number(args.tolerance) : state.toolOptions.fillTolerance,
            frame: args.frame !== undefined ? Number(args.frame) : state.currentFrame
        });
        state.setStatus(`AI applied ${args.fillType || "flood"} fill on "${res.layerId}".`);
        return res;
    }
}
