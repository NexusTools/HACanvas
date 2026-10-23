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

export class BooleanPathOperationAiTool extends AbstractAiTool {
    public readonly name = "boolean_path_operation";
    public readonly category = "vector" as const;
    public readonly icon = "🔗";
    public readonly description =
        "Performs an Inkscape boolean or path operation ('union', 'difference', 'intersection', 'exclusion', 'offset', or 'simplify') on vector objects.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            operation: {
                type: "string",
                enum: ["union", "difference", "intersection", "exclusion", "offset", "simplify"],
                description: "Path operation to perform."
            },
            targetIds: {
                type: "array",
                items: { type: "string" },
                description: "Object IDs (2 IDs for boolean union/difference/intersection/exclusion, 1 ID for offset/simplify)."
            },
            offsetDistance: { type: "number", description: "Offset distance in pixels when operation === 'offset' (default 4)." },
            simplifyTolerance: { type: "number", description: "Simplify tolerance when operation === 'simplify'." },
            layerId: { type: "string", description: "Optional vector layer ID." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["operation", "targetIds"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Running vector path ${partialArgs.operation || "operation"} on ${(partialArgs.targetIds || []).join(", ") || "shapes"}...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Completed path ${args.operation} → '${result?.id}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const targetIds = Array.isArray(args.targetIds) && args.targetIds.length > 0
            ? args.targetIds
            : state.selectedObjectIds;
        const res = state.engine.pathOperation(state.canvasId, args.operation, {
            targetIds,
            offsetDistance: args.offsetDistance !== undefined ? Number(args.offsetDistance) : undefined,
            simplifyTolerance: args.simplifyTolerance !== undefined ? Number(args.simplifyTolerance) : undefined,
            layerId: args.layerId,
            sharedObjectId: args.sharedObjectId || state.activeSharedObjectId
        });
        state.selectedObjectIds = [res.id];
        state.setStatus(`AI executed path ${args.operation} → "${res.id}".`);
        return res;
    }
}
