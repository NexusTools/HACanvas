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

export class ModifyVectorObjectAiTool extends AbstractAiTool {
    public readonly name = "modify_vector_object";
    public readonly category = "vector" as const;
    public readonly icon = "✏️";
    public readonly description =
        "Modifies or deletes an existing vector object or <ObjectRef> instance by ID (updating position, dimensions, radius, colors, scale, rotation, opacity, or text).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            objectId: { type: "string", description: "ID of the vector object or <ObjectRef> to modify." },
            delete: { type: "boolean", description: "Set true to delete this object from the canvas." },
            x: { type: "number", description: "New X coordinate." },
            y: { type: "number", description: "New Y coordinate." },
            width: { type: "number", description: "New width." },
            height: { type: "number", description: "New height." },
            r: { type: "number", description: "New radius." },
            rx: { type: "number", description: "New rx corner/ellipse radius." },
            ry: { type: "number", description: "New ry corner/ellipse radius." },
            fill: { type: "string", description: "New fill color." },
            stroke: { type: "string", description: "New stroke color." },
            strokeWidth: { type: "number", description: "New stroke width." },
            opacity: { type: "number", description: "New opacity (0.0 to 1.0)." },
            scaleX: { type: "number", description: "Scale X (for <ObjectRef>)." },
            scaleY: { type: "number", description: "Scale Y (for <ObjectRef>)." },
            rotation: { type: "number", description: "Rotation in degrees." },
            skewX: { type: "number", description: "Horizontal skew angle in degrees." },
            skewY: { type: "number", description: "Vertical skew angle in degrees." },
            x2: { type: "number", description: "End X coordinate (for line objects)." },
            y2: { type: "number", description: "End Y coordinate (for line objects)." },
            cx: { type: "number", description: "Quadratic Bezier curve control point X (for curved line objects)." },
            cy: { type: "number", description: "Quadratic Bezier curve control point Y (for curved line objects)." },
            startFrame: { type: "number", description: "Start frame visibility index on the animation timeline." },
            endFrame: { type: "number", description: "End frame visibility index on the animation timeline." },
            text: { type: "string", description: "Updated text string (for text objects)." },
            d: { type: "string", description: "Updated SVG path data string (for path objects)." },
            fillOverride: { type: "string", description: "Fill override for <ObjectRef> instances." },
            strokeOverride: { type: "string", description: "Stroke override for <ObjectRef> instances." }
        },
        required: ["objectId"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        if (partialArgs.delete) {
            return `Deleting vector object '${partialArgs.objectId || "..."}'`;
        }
        return `Modifying vector object '${partialArgs.objectId || "..."}'`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        if (args.delete) {
            return `Deleted vector object '${args.objectId}'`;
        }
        return `Modified vector object '${result?.id || args.objectId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        if (args.delete) {
            state.engine.deleteObject(state.canvasId, args.objectId);
            state.selectedObjectIds = state.selectedObjectIds.filter(id => id !== args.objectId);
            state.setStatus(`AI deleted object "${args.objectId}".`);
            return { deleted: args.objectId };
        }
        const { objectId, delete: _del, ...updates } = args;
        const cleanUpdates: Partial<VectorObjectSpec> = {};
        for (const [k, v] of Object.entries(updates)) {
            if (v !== undefined) {
                (cleanUpdates as any)[k] = v;
            }
        }
        const updated = state.engine.modifyObject(state.canvasId, objectId, cleanUpdates);
        state.selectedObjectIds = [updated.id];
        state.setStatus(`AI modified object "${updated.id}".`);
        return updated;
    }
}
