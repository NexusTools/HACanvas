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

export class CreateNewCanvasAiTool extends AbstractAiTool {
    public readonly name = "create_new_canvas";
    public readonly category = "canvas" as const;
    public readonly icon = "🖼️";
    public readonly description =
        "Creates a fresh hybrid canvas with the specified width, height, and background color, initialized with a Raster Layer and a Vector Layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            width: { type: "number", description: "Canvas width in pixels (16..4096)." },
            height: { type: "number", description: "Canvas height in pixels (16..4096)." },
            backgroundColor: { type: "string", description: "Background color hex or 'transparent' (e.g. '#181a24')." }
        },
        required: ["width", "height"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Creating new canvas (${partialArgs.width ?? "..."}×${partialArgs.height ?? "..."}px, bg: ${partialArgs.backgroundColor || "#181a24"})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Created ${result?.width}×${result?.height}px canvas (bg: ${result?.backgroundColor})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const w = Math.max(16, Math.min(4096, Math.round(Number(args.width) || 640)));
        const h = Math.max(16, Math.min(4096, Math.round(Number(args.height) || 420)));
        const bg = args.backgroundColor || "#181a24";
        const created = state.engine.createCanvas(state.canvasId, w, h, bg, [
            { name: "Base Raster Layer", type: "raster", visible: true, opacity: 1.0, blendMode: "normal" },
            { name: "Main Vector Layer", type: "vector", visible: true, opacity: 1.0, blendMode: "normal" }
        ]);
        state.hasOpenCanvas = true;
        state.editMode = "none";
        state.activeSharedObjectId = undefined;
        state.inPlaceContext = undefined;
        state.selectedObjectIds = [];
        state.activeLayerId = created.layers[1]?.id || created.layers[0]?.id;
        state.setStatus(`AI created new ${w}×${h}px hybrid canvas.`);
        return {
            width: created.width,
            height: created.height,
            backgroundColor: created.backgroundColor,
            layers: created.layers.map(l => ({ id: l.id, name: l.name, type: l.type }))
        };
    }
}
