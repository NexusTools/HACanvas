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

export class InspectSharedObjectsAndLibraryAiTool extends AbstractAiTool {
    public readonly name = "inspect_shared_objects_and_library";
    public readonly category = "inspect" as const;
    public readonly icon = "🧩";
    public readonly description =
        "Lists all Shared Objects currently embedded in the document (with their category, size, layers, attached dynamic filters & settings, internal animation timeline summary, and <ObjectRef> reference count) as well as all reusable Shared Objects saved in the persistent OS Shared Object Library.";
    public readonly parameters = {
        type: "object" as const,
        properties: {}
    };

    public getLiveStatusLabel(): string {
        return "Inspecting Shared Objects & OS Library catalog...";
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Inspected ${result?.canvasSharedObjects?.length ?? 0} canvas Shared Objects & ${result?.libraryEntries?.length ?? 0} Library items`;
    }

    public execute(state: HaCanvasAiContext): any {
        const cState = state.getCanvasState();
        const hasOpen = state.hasOpenCanvas ?? state.engine.hasCanvas(state.canvasId);
        const canvasSharedObjects = Object.values(cState.sharedObjects).map(obj => {
            const filtersEnabled = obj.filtersEnabled !== false;
            return {
                id: obj.id,
                name: obj.name,
                category: obj.category || "Uncategorized",
                width: obj.width,
                height: obj.height,
                isEditing: hasOpen ? state.engine.isSharedObjectEditing(state.canvasId, obj.id) : false,
                filtersEnabled,
                attachedFilters: hasOpen
                    ? state.engine.describeAttachedFilters(cState, obj.attachedFilters, filtersEnabled)
                    : obj.attachedFilters || [],
                layerCount: obj.layers.length,
                layers: obj.layers.map(l => ({
                    id: l.id,
                    name: l.name,
                    type: l.type,
                    visible: l.visible,
                    opacity: l.opacity,
                    blendMode: l.blendMode,
                    filtersEnabled: l.filtersEnabled !== false,
                    attachedFilters: hasOpen
                        ? state.engine.describeAttachedFilters(cState, l.attachedFilters, l.filtersEnabled !== false)
                        : l.attachedFilters || [],
                    objectCount: l.objects.length
                })),
                animationSummary: {
                    fps: obj.animation?.fps ?? cState.animation?.fps ?? 12,
                    durationFrames: obj.animation?.durationFrames ?? 1,
                    loop: obj.animation?.loop ?? true,
                    trackCount: obj.animation?.tracks?.length ?? 0
                },
                instanceCount: state.engine.countSharedObjectReferences(cState, obj.id)
            };
        });
        const libraryEntries = state.library.listEntries().map(e => ({
            entryId: e.entryId,
            objectId: e.objectId,
            name: e.name,
            displayName: e.displayName,
            category: e.category,
            width: e.width,
            height: e.height
        }));
        return {
            canvasSharedObjects,
            libraryEntries
        };
    }
}
