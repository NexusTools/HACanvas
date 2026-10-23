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

export class CaptureCanvasSnapshotAiTool extends AbstractAiTool {
    public readonly name = "capture_canvas_snapshot";
    public readonly category = "inspect" as const;
    public readonly icon = "📸";
    public readonly description =
        "Renders a visual PNG snapshot of the canvas, a specific layer, a vector object, a shared object, or a multi-frame animation contact sheet so you and the user can visually inspect the artwork.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            targetType: {
                type: "string",
                enum: ["canvas", "layer", "object", "shared_object", "region", "contact_sheet"],
                description: "Target to snapshot (default 'canvas')."
            },
            targetId: {
                type: "string",
                description: "Optional layer ID, vector object ID, or shared object ID when targetType is 'layer', 'object', or 'shared_object'."
            },
            frame: { type: "number", description: "Animation frame index (default current frame)." },
            includeGridOverlay: { type: "boolean", description: "Overlay a coordinate grid on the snapshot." },
            highlightBoundingBoxes: { type: "boolean", description: "Highlight vector object bounding boxes." }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Capturing ${partialArgs.targetType || "canvas"} snapshot${partialArgs.targetId ? ` ('${partialArgs.targetId}')` : ""}...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Captured ${args.targetType || "canvas"} snapshot (${result?.width ?? "?"}×${result?.height ?? "?"}px)`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const snap = state.engine.captureSnapshot({
            canvasId: state.canvasId,
            targetType: args.targetType || "canvas",
            targetId: args.targetId,
            frame: args.frame !== undefined ? Number(args.frame) : state.currentFrame,
            onionSkin: state.onionSkin,
            includeGridOverlay: Boolean(args.includeGridOverlay),
            highlightBoundingBoxes: Boolean(args.highlightBoundingBoxes)
        });
        return {
            targetType: snap.targetType,
            targetId: snap.targetId,
            frame: snap.frame,
            width: snap.width,
            height: snap.height,
            snapshotPath: snap.snapshotPath,
            boundingBox: snap.boundingBox,
            previewBase64: snap.base64
        };
    }
}
