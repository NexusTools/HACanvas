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

export class ModifyLayerAiTool extends AbstractAiTool {
    public readonly name = "modify_layer";
    public readonly category = "layer" as const;
    public readonly icon = "🎚️";
    public readonly description =
        "Modifies a layer's name, visibility, lock state, opacity, GIMP blend mode, z-order, dynamic filtersEnabled toggle, active animation frame range (startFrame..endFrame), or performs duplicate, clear, delete, merge_down, merge_visible, flatten, new_from_visible, or geometric layer transforms (flip_h, flip_v, rotate_90_cw, rotate_90_ccw, rotate_180, offset).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            layerId: { type: "string", description: "Target layer ID or name (defaults to active layer)." },
            action: {
                type: "string",
                enum: [
                    "update",
                    "duplicate",
                    "clear",
                    "delete",
                    "merge_down",
                    "merge_visible",
                    "flatten",
                    "new_from_visible",
                    "transform"
                ],
                description: "Action to perform on the layer (default 'update')."
            },
            name: { type: "string", description: "New layer name." },
            visible: { type: "boolean", description: "Whether the layer is visible." },
            locked: { type: "boolean", description: "Whether the layer is locked." },
            opacity: { type: "number", description: "Layer opacity (0.0 to 1.0)." },
            blendMode: {
                type: "string",
                enum: ["normal", "multiply", "screen", "overlay", "add", "darken", "lighten", "difference"],
                description: "Layer blend mode."
            },
            zOrder: { type: "number", description: "New 0-based stack index for reordering." },
            filtersEnabled: { type: "boolean", description: "Whether attached dynamic filters on this layer are enabled in the viewport." },
            startFrame: { type: "number", description: "Optional 0-based start frame visibility index on the animation timeline." },
            endFrame: { type: "number", description: "Optional 0-based end frame visibility index on the animation timeline." },
            transformOp: {
                type: "string",
                enum: ["flip_h", "flip_v", "rotate_90_cw", "rotate_90_ccw", "rotate_180", "offset"],
                description: "Geometric transform operation when action === 'transform'."
            },
            offsetX: { type: "number", description: "Horizontal pixel shift when transformOp === 'offset'." },
            offsetY: { type: "number", description: "Vertical pixel shift when transformOp === 'offset'." },
            wrapAround: { type: "boolean", description: "Whether to wrap pixels around canvas edges when transformOp === 'offset' (default true)." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const act = partialArgs.action || "update";
        const target = partialArgs.layerId || "active layer";
        if (act === "duplicate") return `Duplicating layer '${target}'...`;
        if (act === "clear") return `Clearing layer '${target}'...`;
        if (act === "delete") return `Deleting layer '${target}'...`;
        if (act === "transform") return `Transforming layer '${target}' (${partialArgs.transformOp || "..."})...`;
        if (act !== "update") return `Running '${act}' on layer '${target}'...`;
        return `Updating layer '${target}'...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        const act = args.action || "update";
        if (act === "duplicate") return `Duplicated layer → '${result?.name || result?.id}'`;
        if (act === "clear") return `Cleared layer '${result?.name || args.layerId}'`;
        if (act === "delete") return `Deleted layer '${args.layerId}'`;
        if (act === "transform") return `Transformed layer '${args.layerId}' (${args.transformOp})`;
        if (act !== "update") return `Completed '${act}' → '${result?.name || result?.id}'`;
        return `Updated layer '${result?.name || args.layerId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const targetSharedId = args.sharedObjectId || state.activeSharedObjectId;
        const targetLayerId = args.layerId || state.activeLayerId;
        const act = args.action || "update";

        if (act === "duplicate" || act === "clear") {
            const res = state.engine.manageLayer(state.canvasId, act, {
                layerId: targetLayerId,
                sharedObjectId: targetSharedId
            });
            state.resolveActiveLayer();
            state.setStatus(`AI executed layer action "${act}" → "${res?.name || targetLayerId}".`);
            return res;
        }
        if (act === "merge_down") {
            if (!targetLayerId) throw new Error("No target layer specified or active for merge_down.");
            const res = state.engine.mergeLayerDown(state.canvasId, targetLayerId, targetSharedId);
            state.resolveActiveLayer();
            state.setStatus(`AI merged layer "${targetLayerId}" down → "${res.name}".`);
            return res;
        }
        if (act === "merge_visible") {
            const res = state.engine.mergeVisibleLayers(state.canvasId, targetSharedId);
            state.resolveActiveLayer();
            state.setStatus(`AI merged visible layers → "${res.name}".`);
            return res;
        }
        if (act === "flatten") {
            const res = state.engine.flattenImage(state.canvasId);
            state.resolveActiveLayer();
            state.setStatus(`AI flattened image → "${res.name}".`);
            return res;
        }
        if (act === "new_from_visible") {
            const res = state.engine.newLayerFromVisible(state.canvasId, targetSharedId);
            state.resolveActiveLayer();
            state.setStatus(`AI created new layer from visible → "${res.name}".`);
            return res;
        }
        if (!targetLayerId) {
            throw new Error("No target layer specified or active.");
        }
        if (act === "transform") {
            const op = args.transformOp || "flip_h";
            if (op === "offset") {
                const res = state.engine.offsetLayer(
                    state.canvasId,
                    targetLayerId,
                    Number(args.offsetX ?? 0),
                    Number(args.offsetY ?? 0),
                    args.wrapAround !== false,
                    targetSharedId
                );
                state.setStatus(`AI offset layer "${targetLayerId}" by (${args.offsetX ?? 0}, ${args.offsetY ?? 0}).`);
                return res;
            }
            const res = state.engine.transformLayer(
                state.canvasId,
                targetLayerId,
                op as "flip_h" | "flip_v" | "rotate_90_cw" | "rotate_90_ccw" | "rotate_180",
                targetSharedId
            );
            state.setStatus(`AI transformed layer "${targetLayerId}" (${op}).`);
            return res;
        }
        if (act === "delete") {
            state.engine.deleteLayer(state.canvasId, targetLayerId, targetSharedId);
            state.resolveActiveLayer();
            state.setStatus(`AI deleted layer "${targetLayerId}".`);
            return { deleted: targetLayerId };
        }
        if (args.filtersEnabled !== undefined) {
            state.engine.setTargetFiltersEnabled(state.canvasId, {
                targetType: "layer",
                targetId: targetLayerId,
                sharedObjectId: targetSharedId,
                enabled: Boolean(args.filtersEnabled)
            });
        }
        if (args.startFrame !== undefined || args.endFrame !== undefined) {
            state.engine.setTargetFrameRange(
                state.canvasId,
                targetLayerId,
                args.startFrame !== undefined ? Number(args.startFrame) : undefined,
                args.endFrame !== undefined ? Number(args.endFrame) : undefined,
                targetSharedId
            );
        }
        const updated = state.engine.modifyLayer(state.canvasId, targetLayerId, {
            name: args.name,
            visible: args.visible,
            locked: args.locked,
            opacity: args.opacity !== undefined ? Number(args.opacity) : undefined,
            blendMode: args.blendMode as BlendMode | undefined,
            zOrder: args.zOrder !== undefined ? Number(args.zOrder) : undefined,
            sharedObjectId: targetSharedId
        });
        state.setStatus(`AI updated layer "${updated.name}".`);
        return updated;
    }
}
