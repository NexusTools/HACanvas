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

export class ManageSharedObjectAiTool extends AbstractAiTool {
    public readonly name = "manage_shared_object";
    public readonly category = "shared_object" as const;
    public readonly icon = "🗂️";
    public readonly description =
        "Manages an existing Shared Object: instantiate a new <ObjectRef> on the canvas, rename/recategorize it, duplicate it, delete it, or switch editing mode ('in_place', 'isolated_tab', or 'exit' to Main Canvas).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: ["instantiate_ref", "rename", "duplicate", "delete", "edit_in_place", "edit_isolated_tab", "exit_edit"],
                description: "Action to perform."
            },
            sharedObjectId: { type: "string", description: "Target Shared Object ID." },
            newName: { type: "string", description: "New name (for rename or duplicate)." },
            newCategory: { type: "string", description: "New category path (for rename or duplicate)." },
            x: { type: "number", description: "X coordinate when action === 'instantiate_ref'." },
            y: { type: "number", description: "Y coordinate when action === 'instantiate_ref'." },
            scaleX: { type: "number", description: "Horizontal scale when action === 'instantiate_ref'." },
            scaleY: { type: "number", description: "Vertical scale when action === 'instantiate_ref'." },
            rotation: { type: "number", description: "Rotation degrees when action === 'instantiate_ref'." },
            parentSharedObjectId: { type: "string", description: "Optional parent Shared Object ID to nest the <ObjectRef> inside." }
        },
        required: ["action"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const act = partialArgs.action || "manage";
        const id = partialArgs.sharedObjectId || "";
        return `Shared Object action '${act}' ${id ? `on '${id}'` : ""}...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Completed Shared Object '${args.action}' (${result?.id || args.sharedObjectId || "OK"})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const act = args.action;
        if (act === "exit_edit") {
            state.exitSharedObjectEdit();
            return { editMode: state.editMode };
        }
        const sharedId = args.sharedObjectId || state.activeSharedObjectId;
        if (!sharedId) {
            throw new Error("sharedObjectId is required for this action.");
        }
        if (act === "edit_in_place") {
            state.enterInPlaceSharedObjectEdit(sharedId);
            return { editMode: state.editMode, activeSharedObjectId: state.activeSharedObjectId };
        }
        if (act === "edit_isolated_tab") {
            state.enterIsolatedTabSharedObjectEdit(sharedId);
            return { editMode: state.editMode, activeSharedObjectId: state.activeSharedObjectId };
        }
        if (act === "instantiate_ref") {
            const { layerId } = this.ensureTargetLayer(state, "vector", undefined, args.parentSharedObjectId);
            const ref = state.engine.instantiateObjectRef(state.canvasId, sharedId, {
                layerId,
                parentSharedObjectId: args.parentSharedObjectId,
                x: Number(args.x ?? 64),
                y: Number(args.y ?? 64),
                scaleX: args.scaleX !== undefined ? Number(args.scaleX) : 1,
                scaleY: args.scaleY !== undefined ? Number(args.scaleY) : 1,
                rotation: args.rotation !== undefined ? Number(args.rotation) : 0
            });
            state.selectedObjectIds = [ref.id];
            state.setStatus(`AI placed <ObjectRef> instance "${ref.id}" of "${sharedId}".`);
            return ref;
        }
        if (act === "rename") {
            const updated = state.engine.renameSharedObject(state.canvasId, sharedId, args.newName || sharedId, args.newCategory);
            state.setStatus(`AI renamed Shared Object to "${updated.name}".`);
            return updated;
        }
        if (act === "duplicate") {
            const copy = state.engine.duplicateSharedObject(state.canvasId, sharedId, undefined, args.newName, args.newCategory);
            state.setStatus(`AI duplicated Shared Object "${sharedId}" → "${copy.id}".`);
            return copy;
        }
        if (act === "delete") {
            if (state.activeSharedObjectId === sharedId) {
                state.exitSharedObjectEdit();
            }
            state.engine.deleteSharedObject(state.canvasId, sharedId);
            state.setStatus(`AI deleted Shared Object "${sharedId}".`);
            return { deleted: sharedId };
        }
        throw new Error(`Unknown shared object action: ${act}`);
    }
}
