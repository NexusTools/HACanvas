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

export class DrawBezierPathAiTool extends AbstractAiTool {
    public readonly name = "draw_bezier_path";
    public readonly category = "vector" as const;
    public readonly icon = "✒️";
    public readonly description =
        "Draws an SVG Bezier/polygon path (`d` path string or array of `{x, y}` points) onto a vector layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            d: { type: "string", description: "SVG path data string (e.g. 'M 50 50 L 150 50 L 100 130 Z')." },
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
                description: "Alternative array of {x, y} points for the path."
            },
            closed: { type: "boolean", description: "Whether the path should be closed (Z)." },
            fill: { type: "string", description: "Fill color (e.g. '#ff3366' or 'none')." },
            stroke: { type: "string", description: "Stroke color (e.g. '#ffffff')." },
            strokeWidth: { type: "number", description: "Stroke width in pixels (default 2)." },
            opacity: { type: "number", description: "Opacity from 0.0 to 1.0." },
            layerId: { type: "string", description: "Optional target vector layer ID." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Drawing Bezier vector path (${partialArgs.fill || partialArgs.stroke || "custom"})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Drew vector path '${result?.id}' (${result?.points?.length ?? 0} nodes)`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "vector",
            args.layerId,
            args.sharedObjectId
        );
        const obj = state.engine.drawPath(state.canvasId, layerId, {
            sharedObjectId,
            d: args.d,
            points: Array.isArray(args.points) ? args.points : undefined,
            closed: Boolean(args.closed),
            fill: args.fill ?? (args.closed ? state.toolOptions.primaryColor : "none"),
            stroke: args.stroke ?? state.toolOptions.strokeColor,
            strokeWidth: args.strokeWidth !== undefined ? Number(args.strokeWidth) : state.toolOptions.strokeWidth,
            opacity: args.opacity !== undefined ? Number(args.opacity) : 1.0
        });
        state.selectedObjectIds = [obj.id];
        state.setStatus(`AI drew vector path "${obj.id}".`);
        return obj;
    }
}
