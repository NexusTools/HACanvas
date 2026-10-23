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

export class OpenOrImportFileAiTool extends AbstractAiTool {
    public readonly name = "open_or_import_file";
    public readonly category = "file" as const;
    public readonly icon = "📂";
    public readonly description =
        "Opens or imports any supported artwork file (.hacanvas, .ai Adobe Illustrator, .psd Photoshop, .xcf GIMP, .ora OpenRaster, .svg Inkscape, .png, .gif, .bmp, .tga, .ico, etc.) as a new canvas, appended layers, or into a Shared Object.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            filePath: { type: "string", description: "File path to open/import." },
            mode: {
                type: "string",
                enum: ["new_canvas", "append_layers", "into_shared_object"],
                description: "Import mode (default 'new_canvas')."
            },
            sharedObjectId: { type: "string", description: "Target Shared Object ID when mode === 'into_shared_object'." }
        },
        required: ["filePath"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Importing file '${partialArgs.filePath || "..."}' (${partialArgs.mode || "new_canvas"})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Imported ${result?.detectedFormat?.toUpperCase() || "file"} (${result?.layersImported ?? 0} layers, ${result?.width}×${result?.height}px)`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const mode = args.mode || "new_canvas";
        if (mode === "new_canvas") {
            state.exitSharedObjectEdit();
        } else {
            state.ensureCanvasOpen?.();
        }
        const res = state.engine.loadFromFile(state.canvasId, args.filePath, {
            mode,
            targetSharedObjectId: args.sharedObjectId || state.activeSharedObjectId
        });
        state.hasOpenCanvas = true;
        state.resolveActiveLayer();
        state.setStatus(`AI imported "${path.basename(args.filePath)}" (${res.detectedFormat.toUpperCase()}).`);
        return res;
    }
}
