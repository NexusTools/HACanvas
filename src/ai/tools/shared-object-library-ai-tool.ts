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

export class SharedObjectLibraryAiTool extends AbstractAiTool {
    public readonly name = "manage_library";
    public readonly category = "library" as const;
    public readonly icon = "📚";
    public readonly description =
        "Saves a Shared Object to the persistent OS Shared Object Library (`save`), imports a Library entry into the current project (`import`), or deletes a Library entry (`delete`).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: ["save", "import", "delete"],
                description: "Library action to execute."
            },
            sharedObjectId: { type: "string", description: "Canvas Shared Object ID when action === 'save'." },
            entryId: { type: "string", description: "Library entry ID when action === 'import' or 'delete'." },
            name: { type: "string", description: "Optional display name when saving." },
            category: { type: "string", description: "Optional category path when saving (e.g. 'UI/Badges')." },
            instantiateOnCanvas: { type: "boolean", description: "Whether to instantiate an <ObjectRef> on the canvas when importing (default true)." },
            x: { type: "number", description: "X position when importing onto the canvas." },
            y: { type: "number", description: "Y position when importing onto the canvas." }
        },
        required: ["action"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        if (partialArgs.action === "save") return `Saving Shared Object '${partialArgs.sharedObjectId || "..."}' to OS Library...`;
        if (partialArgs.action === "import") return `Importing '${partialArgs.entryId || "..."}' from OS Library...`;
        return `Managing OS Shared Object Library (${partialArgs.action || "..."})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        if (args.action === "save") return `Saved '${result?.name || args.sharedObjectId}' to OS Library (${result?.entryId})`;
        if (args.action === "import") return `Imported '${result?.sharedObject?.name}' from OS Library`;
        return `Deleted Library entry '${args.entryId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        if (args.action === "save") {
            state.ensureCanvasOpen?.();
            const objId = args.sharedObjectId || state.activeSharedObjectId;
            if (!objId) throw new Error("sharedObjectId is required to save to library.");
            const entry = state.library.saveSharedObjectToLibrary(state.engine, state.canvasId, objId, {
                name: args.name,
                category: args.category
            });
            state.setStatus(`AI saved "${entry.name}" to the OS Shared Object Library.`);
            return entry;
        }
        if (args.action === "import") {
            state.ensureCanvasOpen?.();
            const imported = state.library.importIntoProject(args.entryId, state.engine, state.canvasId, {
                instantiateOnMainCanvas: args.instantiateOnCanvas !== false,
                x: args.x !== undefined ? Number(args.x) : 64,
                y: args.y !== undefined ? Number(args.y) : 64
            });
            state.setStatus(`AI imported "${imported.sharedObject.name}" from Library.`);
            return imported;
        }
        if (args.action === "delete") {
            state.library.deleteLibraryEntry(args.entryId);
            state.setStatus(`AI deleted Library entry "${args.entryId}".`);
            return { deleted: args.entryId };
        }
        throw new Error(`Unknown library action: ${args.action}`);
    }
}
