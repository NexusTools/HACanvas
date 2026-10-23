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

export class InspectSceneGraphAiTool extends AbstractAiTool {
    public readonly name = "inspect_scene_graph";
    public readonly category = "inspect" as const;
    public readonly icon = "🌳";
    public readonly description =
        "Inspects the complete hybrid scene graph, returning all layers (with active dynamic filters & settings), every vector object (with ID, kind, coordinates, fill/stroke, attached filters & settings, cache stats, bounding box, and animation tracks), raster pixel coverage & bounding boxes, all Shared Objects, document metadata, embedded fonts, and animation timeline summary.";
    public readonly parameters = {
        type: "object" as const,
        properties: {}
    };

    public getLiveStatusLabel(): string {
        return "Inspecting full canvas scene graph & layers...";
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Inspected scene graph (${result?.layerCount ?? 0} layers, ${Object.keys(result?.sharedObjects || {}).length} shared objects)`;
    }

    public execute(state: HaCanvasAiContext): any {
        state.ensureCanvasOpen?.();
        return state.engine.inspectScene(state.canvasId);
    }
}
