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

export class PaintRasterStrokeAiTool extends AbstractAiTool {
    public readonly name = "paint_raster_stroke";
    public readonly category = "raster" as const;
    public readonly icon = "🖌️";
    public readonly description =
        "Paints a GIMP raster stroke ('brush', 'pencil', 'airbrush', or 'eraser') along a sequence of {x, y} coordinates on a raster layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            tool: {
                type: "string",
                enum: ["brush", "pencil", "airbrush", "eraser"],
                description: "Raster painting tool (default 'brush')."
            },
            points: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        x: { type: "number" },
                        y: { type: "number" }
                    },
                    required: ["x", "y"]
                },
                description: "Array of {x, y} stroke coordinates."
            },
            color: { type: "string", description: "Brush color hex (e.g. '#00d4ff')." },
            size: { type: "number", description: "Brush diameter in pixels (default 10)." },
            hardness: { type: "number", description: "Brush hardness from 0.0 to 1.0 (default 0.85)." },
            opacity: { type: "number", description: "Stroke opacity from 0.0 to 1.0 (default 1.0)." },
            frame: { type: "number", description: "Optional animation frame index." },
            layerId: { type: "string", description: "Optional raster layer ID or name." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["points"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const tool = partialArgs.tool || "brush";
        const ptCount = Array.isArray(partialArgs.points) ? partialArgs.points.length : 0;
        return `Painting ${tool} stroke (${ptCount} pts, size: ${partialArgs.size ?? 10}px, color: ${partialArgs.color || "active"})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Painted ${args.tool || "brush"} stroke (${result?.pointsDrawn ?? 0} points) on layer '${result?.layerId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "raster",
            args.layerId,
            args.sharedObjectId
        );
        const pts = Array.isArray(args.points) && args.points.length > 0 ? args.points : [{ x: 50, y: 50 }];
        const res = state.engine.rasterStroke(state.canvasId, layerId, {
            sharedObjectId,
            tool: args.tool || "brush",
            points: pts.map((p: any) => ({ x: Number(p.x ?? 0), y: Number(p.y ?? 0) })),
            color: args.color || state.toolOptions.primaryColor,
            size: args.size !== undefined ? Number(args.size) : state.toolOptions.brushSize,
            hardness: args.hardness !== undefined ? Number(args.hardness) : state.toolOptions.brushHardness,
            opacity: args.opacity !== undefined ? Number(args.opacity) : state.toolOptions.opacity,
            frame: args.frame !== undefined ? Number(args.frame) : state.currentFrame
        });
        state.setStatus(`AI painted ${args.tool || "brush"} stroke on "${res.layerId}".`);
        return res;
    }
}
