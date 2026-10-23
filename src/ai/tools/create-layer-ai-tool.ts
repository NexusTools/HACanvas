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

export class CreateLayerAiTool extends AbstractAiTool {
    public readonly name = "create_layer";
    public readonly category = "layer" as const;
    public readonly icon = "➕";
    public readonly description =
        "Creates a new Inkscape 'vector' layer or GIMP 'raster' layer on the Main Canvas or inside a Shared Object and selects it as the active layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            name: { type: "string", description: "Layer name (e.g. 'Foreground Glow' or 'Hero Vector Shapes')." },
            type: { type: "string", enum: ["vector", "raster"], description: "Layer type: 'vector' or 'raster'." },
            opacity: { type: "number", description: "Layer opacity from 0.0 to 1.0 (default 1.0)." },
            blendMode: {
                type: "string",
                enum: ["normal", "multiply", "screen", "overlay", "add", "darken", "lighten", "difference"],
                description: "GIMP layer blend mode (default 'normal')."
            },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID if adding the layer inside a Shared Object." }
        },
        required: ["name", "type"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Creating ${partialArgs.type || "hybrid"} layer '${partialArgs.name || "..."}'`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Created ${result?.type} layer '${result?.name}' (${result?.id})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const layerType = args.type === "raster" ? "raster" : "vector";
        const targetSharedId = args.sharedObjectId || state.activeSharedObjectId;
        const created = state.engine.createLayer(state.canvasId, args.name || "New Layer", layerType, {
            opacity: args.opacity !== undefined ? Number(args.opacity) : 1.0,
            blendMode: (args.blendMode as BlendMode) || "normal",
            sharedObjectId: targetSharedId
        });
        state.activeLayerId = created.id;
        state.setStatus(`AI created ${layerType} layer "${created.name}".`);
        return created;
    }
}
