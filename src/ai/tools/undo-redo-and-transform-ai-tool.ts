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

export class UndoRedoAndTransformAiTool extends AbstractAiTool {
    public readonly name = "undo_redo_and_transform";
    public readonly category = "canvas" as const;
    public readonly icon = "🔄";
    public readonly description =
        "Performs undo/redo history navigation, whole-image geometric transforms ('flip_h', 'flip_v', 'rotate_90_cw', 'rotate_90_ccw', 'rotate_180', 'crop_to_selection', 'crop_to_content', 'scale_image', 'resize_canvas'), direct raster color adjustments ('desaturate', 'sepia', 'equalize', 'white_balance', 'posterize', 'colorize', 'color_balance', 'hue_saturation', 'color_to_alpha', 'remove_alpha'), vector object duplication, or active tool option updates.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: [
                    "undo",
                    "redo",
                    "get_history",
                    "transform_image",
                    "adjust_layer_colors",
                    "duplicate_objects",
                    "set_tool_options"
                ],
                description: "Operation to perform."
            },
            imageTransformOp: {
                type: "string",
                enum: [
                    "flip_h",
                    "flip_v",
                    "rotate_90_cw",
                    "rotate_90_ccw",
                    "rotate_180",
                    "crop_to_selection",
                    "crop_to_content",
                    "scale_image",
                    "resize_canvas"
                ],
                description: "Whole-canvas transform operation when action === 'transform_image'."
            },
            width: { type: "number", description: "Target width for 'scale_image' or 'resize_canvas'." },
            height: { type: "number", description: "Target height for 'scale_image' or 'resize_canvas'." },
            colorAdjustmentMode: {
                type: "string",
                enum: [
                    "desaturate",
                    "sepia",
                    "equalize",
                    "white_balance",
                    "posterize",
                    "colorize",
                    "color_balance",
                    "hue_saturation",
                    "color_to_alpha",
                    "remove_alpha"
                ],
                description: "Color adjustment mode when action === 'adjust_layer_colors'."
            },
            saturation: { type: "number", description: "Saturation adjustment (-100..100)." },
            lightness: { type: "number", description: "Lightness adjustment (-100..100)." },
            cyanRed: { type: "number", description: "Cyan-Red balance (-100..100)." },
            magentaGreen: { type: "number", description: "Magenta-Green balance (-100..100)." },
            yellowBlue: { type: "number", description: "Yellow-Blue balance (-100..100)." },
            levels: { type: "number", description: "Posterize levels (2..64) for 'posterize'." },
            color: { type: "string", description: "Tint/target color hex for 'colorize' or 'color_to_alpha'." },
            tolerance: { type: "number", description: "Tolerance for 'color_to_alpha' (default 60)." },
            objectIds: {
                type: "array",
                items: { type: "string" },
                description: "Vector object IDs to duplicate when action === 'duplicate_objects'."
            },
            offsetX: { type: "number", description: "Offset X when duplicating objects or resizing canvas (default 12)." },
            offsetY: { type: "number", description: "Offset Y when duplicating objects or resizing canvas (default 12)." },
            toolOptions: {
                type: "object",
                description: "Tool options to update when action === 'set_tool_options' (e.g. { primaryColor, secondaryColor, strokeColor, strokeWidth, brushSize, brushHardness, opacity, fillTolerance, fontSize, fontFamily })."
            },
            layerId: { type: "string", description: "Optional target raster layer ID for 'adjust_layer_colors'." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["action"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Executing '${partialArgs.action || "..."}'...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, _result: any): string {
        return `Completed '${args.action}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const act = args.action;
        if (act === "set_tool_options") {
            if (args.toolOptions && typeof args.toolOptions === "object") {
                Object.assign(state.toolOptions, args.toolOptions);
            }
            return { toolOptions: state.toolOptions };
        }

        state.ensureCanvasOpen?.();
        const sharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);

        if (act === "get_history" || act === "inspect_history") {
            return state.engine.getUndoHistory(state.canvasId);
        }
        if (act === "undo") {
            return state.engine.undo(state.canvasId);
        }
        if (act === "redo") {
            return state.engine.redo(state.canvasId);
        }
        if (act === "transform_image") {
            const op = args.imageTransformOp || "flip_h";
            if (op === "crop_to_selection") {
                return state.engine.cropCanvasToSelection(state.canvasId);
            }
            if (op === "crop_to_content") {
                return state.engine.cropCanvasToContent(state.canvasId);
            }
            if (op === "scale_image") {
                const cState = state.getCanvasState();
                return state.engine.scaleCanvas(
                    state.canvasId,
                    Number(args.width ?? cState.width),
                    Number(args.height ?? cState.height)
                );
            }
            if (op === "resize_canvas") {
                const cState = state.getCanvasState();
                return state.engine.resizeCanvas(
                    state.canvasId,
                    Number(args.width ?? cState.width),
                    Number(args.height ?? cState.height),
                    Number(args.offsetX ?? 0),
                    Number(args.offsetY ?? 0)
                );
            }
            return state.engine.transformCanvas(
                state.canvasId,
                op as "flip_h" | "flip_v" | "rotate_90_cw" | "rotate_90_ccw" | "rotate_180"
            );
        }
        if (act === "adjust_layer_colors") {
            const { layerId } = this.ensureTargetLayer(state, "raster", args.layerId, sharedId);
            const mode = (args.colorAdjustmentMode || "hue_saturation") as
                | "desaturate"
                | "sepia"
                | "equalize"
                | "white_balance"
                | "posterize"
                | "colorize"
                | "color_balance"
                | "hue_saturation"
                | "color_to_alpha"
                | "remove_alpha";
            return state.engine.adjustLayerColors(
                state.canvasId,
                layerId,
                mode,
                {
                    saturation: args.saturation,
                    lightness: args.lightness,
                    cyanRed: args.cyanRed,
                    magentaGreen: args.magentaGreen,
                    yellowBlue: args.yellowBlue,
                    levels: args.levels,
                    color: args.color,
                    targetColor: args.color,
                    tolerance: args.tolerance
                },
                sharedId
            );
        }
        if (act === "duplicate_objects") {
            const ids = Array.isArray(args.objectIds) && args.objectIds.length > 0
                ? args.objectIds
                : state.selectedObjectIds;
            const dx = args.offsetX !== undefined ? Number(args.offsetX) : 12;
            const dy = args.offsetY !== undefined ? Number(args.offsetY) : 12;
            const cState = state.getCanvasState();
            const container = sharedId ? cState.sharedObjects[sharedId] : cState;
            const duplicated: VectorObjectSpec[] = [];
            for (const layer of container?.layers || []) {
                if (layer.type !== "vector") continue;
                for (const obj of [...layer.objects]) {
                    if (ids.includes(obj.id)) {
                        const clone: VectorObjectSpec = JSON.parse(JSON.stringify(obj));
                        clone.id = `${obj.id}_copy_${Date.now() % 10000}`;
                        if (clone.x !== undefined) clone.x += dx;
                        if (clone.y !== undefined) clone.y += dy;
                        if (clone.x2 !== undefined) clone.x2 += dx;
                        if (clone.y2 !== undefined) clone.y2 += dy;
                        if (clone.cx !== undefined) clone.cx += dx;
                        if (clone.cy !== undefined) clone.cy += dy;
                        if (clone.points) {
                            clone.points = clone.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                        }
                        layer.objects.push(clone);
                        duplicated.push(clone);
                    }
                }
            }
            state.engine.saveCanvas(cState);
            state.selectedObjectIds = duplicated.map(o => o.id);
            return { duplicatedObjects: duplicated };
        }
        throw new Error(`Unknown undo_redo_and_transform action: '${act}'`);
    }
}
