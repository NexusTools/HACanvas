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

export class DeformVectorObjectAiTool extends AbstractAiTool {
    public readonly name = "deform_vector_object";
    public readonly category = "vector" as const;
    public readonly icon = "〰️";
    public readonly description =
        "Deforms or inspects nodes/segments on ANY vector object ('line', 'path', 'polygon', 'star', 'rect', 'circle', 'ellipse'). Supports: 'bend_segment' (bends a line or shape edge into a quadratic Bezier curve while keeping endpoints fixed), 'move_endpoint' (moves a vertex/endpoint to a new coordinate while retaining existing curves), 'straighten_segment' (removes curve on a segment), 'add_vertex' (inserts a new node along a segment), 'remove_vertex' (deletes a vertex), 'convert_to_path' (converts a primitive shape into an explicit editable multi-node path), or 'inspect_nodes' (returns all editable vertices, segments, and curve control points).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            objectId: { type: "string", description: "ID of the vector object to deform or inspect (defaults to selected object)." },
            mode: {
                type: "string",
                enum: [
                    "bend_segment",
                    "move_endpoint",
                    "straighten_segment",
                    "add_vertex",
                    "remove_vertex",
                    "convert_to_path",
                    "inspect_nodes"
                ],
                description:
                    "Deformation mode: 'bend_segment' (pulls segment into a curve), 'move_endpoint' (moves vertex/endpoint), 'straighten_segment' (resets segment to straight line), 'add_vertex' (inserts vertex on segment), 'remove_vertex' (deletes vertex at pointIndex), 'convert_to_path' (converts rect/circle/ellipse/polygon/star/line into a node path), or 'inspect_nodes' (inspects all vertices and segments)."
            },
            targetX: { type: "number", description: "New X coordinate for 'bend_segment', 'move_endpoint', or optional custom position for 'add_vertex'." },
            targetY: { type: "number", description: "New Y coordinate for 'bend_segment', 'move_endpoint', or optional custom position for 'add_vertex'." },
            segmentIndex: { type: "number", description: "0-based segment index for 'bend_segment', 'straighten_segment', or 'add_vertex' (default 0)." },
            pointIndex: { type: "number", description: "0-based endpoint/vertex index for 'move_endpoint' or 'remove_vertex' (0 = start, 1 = end for lines)." },
            t: { type: "number", description: "Normalized parameter along segment (0.15..0.85, default 0.5) where the segment is pulled ('bend_segment') or split ('add_vertex')." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["mode"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Deforming vector object '${partialArgs.objectId || "selected"}' (${partialArgs.mode || "bend_segment"})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        if (args.mode === "inspect_nodes") {
            return `Inspected ${result?.vertices?.length ?? 0} nodes & ${result?.segments?.length ?? 0} segments on '${result?.objectId || args.objectId}'`;
        }
        return `Deformed vector object '${result?.id || args.objectId}' (${args.mode})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const objectId = args.objectId || state.selectedObjectIds[0];
        if (!objectId) {
            throw new Error("objectId is required (or an object must be selected) for deform_vector_object.");
        }
        const sharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);
        if (args.mode === "inspect_nodes") {
            return state.engine.inspectVectorObjectNodes(state.canvasId, objectId, sharedId);
        }
        const updated = state.engine.deformVectorObject(
            state.canvasId,
            objectId,
            {
                mode: (args.mode || "bend_segment") as any,
                targetX: args.targetX !== undefined ? Number(args.targetX) : undefined,
                targetY: args.targetY !== undefined ? Number(args.targetY) : undefined,
                segmentIndex: args.segmentIndex !== undefined ? Number(args.segmentIndex) : undefined,
                pointIndex: args.pointIndex !== undefined ? Number(args.pointIndex) : undefined,
                t: args.t !== undefined ? Number(args.t) : undefined,
                sharedObjectId: sharedId
            }
        );
        state.selectedObjectIds = [updated.id];
        state.setStatus(`AI deformed vector object "${updated.id}" (${args.mode}).`);
        return {
            ...updated,
            nodeInspection: state.engine.inspectVectorObjectNodes(state.canvasId, updated.id, sharedId)
        };
    }
}
