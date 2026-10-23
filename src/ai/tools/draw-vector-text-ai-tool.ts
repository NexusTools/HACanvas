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

export class DrawVectorTextAiTool extends AbstractAiTool {
    public readonly name = "draw_text";
    public readonly category = "vector" as const;
    public readonly icon = "🔤";
    public readonly description =
        "Draws a vector text object on a vector layer with customizable text string, position, font size, and fill color.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            text: { type: "string", description: "Text string to render." },
            x: { type: "number", description: "X coordinate." },
            y: { type: "number", description: "Y coordinate." },
            fontSize: { type: "number", description: "Font size in pixels (default 21)." },
            fontFamily: { type: "string", description: "Font family (default 'sans-serif')." },
            fill: { type: "string", description: "Text fill color (e.g. '#ffffff')." },
            stroke: { type: "string", description: "Optional stroke color." },
            strokeWidth: { type: "number", description: "Optional stroke width." },
            opacity: { type: "number", description: "Opacity (0.0 to 1.0)." },
            layerId: { type: "string", description: "Optional vector layer ID." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["text", "x", "y"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Drawing vector text "${partialArgs.text || "..."}" at (${partialArgs.x ?? 0}, ${partialArgs.y ?? 0})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Drew vector text "${result?.text}" ('${result?.id}')`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "vector",
            args.layerId,
            args.sharedObjectId
        );
        const obj = state.engine.drawText(state.canvasId, layerId, {
            sharedObjectId,
            text: String(args.text || "TEXT"),
            x: Number(args.x ?? 40),
            y: Number(args.y ?? 40),
            fontSize: args.fontSize !== undefined ? Number(args.fontSize) : 21,
            fontFamily: args.fontFamily || "sans-serif",
            fill: args.fill ?? "#ffffff",
            stroke: args.stroke ?? "none",
            strokeWidth: args.strokeWidth !== undefined ? Number(args.strokeWidth) : 0,
            opacity: args.opacity !== undefined ? Number(args.opacity) : 1.0
        });
        state.selectedObjectIds = [obj.id];
        state.setStatus(`AI drew text "${obj.text}".`);
        return obj;
    }
}
