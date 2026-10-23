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

export class CreateSharedObjectAiTool extends AbstractAiTool {
    public readonly name = "create_shared_object";
    public readonly category = "shared_object" as const;
    public readonly icon = "🧩";
    public readonly description =
        "Creates a new reusable Shared Object sub-canvas (stored as `objects/<id>.xml` in `.hacanvas` with its own vector & raster layers) and optionally places an <ObjectRef> instance on the Main Canvas.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            id: { type: "string", description: "Optional explicit ID (e.g. 'shared_emerald_gem')." },
            name: { type: "string", description: "Name or slash-categorized path (e.g. 'UI/Gems/EmeraldGem')." },
            category: { type: "string", description: "Category folder path (e.g. 'UI/Gems')." },
            width: { type: "number", description: "Sub-canvas width in pixels (default 128)." },
            height: { type: "number", description: "Sub-canvas height in pixels (default 128)." },
            instantiateOnCanvas: { type: "boolean", description: "Whether to immediately place an <ObjectRef> instance on the Main Canvas (default true)." },
            x: { type: "number", description: "X position for the placed <ObjectRef> instance." },
            y: { type: "number", description: "Y position for the placed <ObjectRef> instance." }
        },
        required: ["name"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Creating Shared Object '${partialArgs.name || "..."}' (${partialArgs.width ?? 128}×${partialArgs.height ?? 128}px)...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Created Shared Object '${result?.sharedObject?.name}' (${result?.sharedObject?.id})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const sharedObj = state.engine.createSharedObject(state.canvasId, {
            id: args.id,
            name: args.name,
            category: args.category,
            width: args.width !== undefined ? Number(args.width) : 128,
            height: args.height !== undefined ? Number(args.height) : 128
        });
        let refInstance: VectorObjectSpec | undefined;
        if (args.instantiateOnCanvas !== false) {
            const { layerId } = this.ensureTargetLayer(state, "vector");
            refInstance = state.engine.instantiateObjectRef(state.canvasId, sharedObj.id, {
                layerId,
                x: args.x !== undefined ? Number(args.x) : 48,
                y: args.y !== undefined ? Number(args.y) : 48
            });
        }
        state.setStatus(`AI created Shared Object "${sharedObj.name}".`);
        return { sharedObject: sharedObj, refInstance };
    }
}
