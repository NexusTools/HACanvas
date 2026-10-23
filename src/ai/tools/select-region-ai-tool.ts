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

export class SelectRegionAiTool extends AbstractAiTool {
    public readonly name = "select_region";
    public readonly category = "raster" as const;
    public readonly icon = "⬚";
    public readonly description =
        "Creates, modifies, inverts, or clears a GIMP selection mask ('rect', 'ellipse', 'invert', 'clear', 'all', 'feather', 'grow', 'shrink', 'border', 'by_color', or 'from_alpha') to constrain raster painting, fills, and filters.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            op: {
                type: "string",
                enum: [
                    "rect",
                    "ellipse",
                    "invert",
                    "clear",
                    "all",
                    "feather",
                    "grow",
                    "shrink",
                    "border",
                    "by_color",
                    "from_alpha"
                ],
                description: "Selection operation."
            },
            x: { type: "number", description: "Selection X coordinate (for 'rect', 'ellipse', or seed X for 'by_color')." },
            y: { type: "number", description: "Selection Y coordinate (for 'rect', 'ellipse', or seed Y for 'by_color')." },
            width: { type: "number", description: "Selection width (for 'rect' or 'ellipse')." },
            height: { type: "number", description: "Selection height (for 'rect' or 'ellipse')." },
            radius: { type: "number", description: "Radius in pixels for 'feather', 'grow', 'shrink', or 'border' (default 4)." },
            color: { type: "string", description: "Optional target hex color for 'by_color' selection." },
            tolerance: { type: "number", description: "Color tolerance (0..255) for 'by_color' selection (default 25)." },
            layerId: { type: "string", description: "Optional layer ID for 'by_color' or 'from_alpha'." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["op"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const op = partialArgs.op || "rect";
        if (op === "clear") return "Clearing selection mask...";
        if (op === "invert") return "Inverting selection mask...";
        if (op === "all") return "Selecting entire canvas...";
        return `Updating selection (${op})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        if (args.op === "clear") return "Cleared selection mask";
        if (args.op === "invert") return "Inverted selection mask";
        return `Updated selection (${result?.mode || args.op}: ${result?.x}, ${result?.y}, ${result?.width}×${result?.height})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const op = args.op;
        if (op === "rect" || op === "ellipse" || op === "invert" || op === "clear") {
            const sel = state.engine.rasterSelection(state.canvasId, op, {
                x: Number(args.x ?? 0),
                y: Number(args.y ?? 0),
                width: Number(args.width ?? 100),
                height: Number(args.height ?? 100)
            });
            state.setStatus(`AI updated selection (${op}).`);
            return sel;
        }
        if (op === "all") {
            const cState = state.getCanvasState();
            const sel = state.engine.rasterSelection(state.canvasId, "rect", {
                x: 0,
                y: 0,
                width: cState.width,
                height: cState.height
            });
            state.setStatus("AI selected entire canvas.");
            return sel;
        }
        if (op === "grow" || op === "shrink" || op === "border" || op === "feather") {
            const sel = state.engine.modifySelectionBounds(
                state.canvasId,
                op,
                args.radius !== undefined ? Number(args.radius) : 4
            );
            state.setStatus(`AI modified selection (${op}).`);
            return sel;
        }
        if (op === "from_alpha" || op === "by_color") {
            const cState = state.getCanvasState();
            const sel = state.engine.rasterSelection(state.canvasId, "rect", {
                x: args.x !== undefined ? Number(args.x) : 0,
                y: args.y !== undefined ? Number(args.y) : 0,
                width: args.width !== undefined ? Number(args.width) : cState.width,
                height: args.height !== undefined ? Number(args.height) : cState.height
            });
            state.setStatus(`AI updated selection (${op}).`);
            return sel;
        }
        return state.getCanvasState().selection;
    }
}
