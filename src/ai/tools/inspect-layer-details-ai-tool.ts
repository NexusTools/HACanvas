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

export class InspectLayerDetailsAiTool extends AbstractAiTool {
    public readonly name = "inspect_layer";
    public readonly category = "inspect" as const;
    public readonly icon = "📑";
    public readonly description =
        "Inspects a specific vector or raster layer in detail on the Main Canvas or a Shared Object, returning which dynamic filters are attached and their full resolved settings/schemas, whether filter preview is enabled, full vector object specifications (and each object's attached filters & settings), raster pixel coverage & cel frames, and all animation tracks/transitions targeting the layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            layerId: { type: "string", description: "Layer ID or layer name to inspect (defaults to active layer)." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID if inspecting a shared object layer." }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Inspecting layer '${partialArgs.layerId || "active"}'...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Inspected layer '${result?.name || args.layerId || "active"}' (${result?.type || "layer"}, ${result?.attachedFilters?.length ?? 0} filters)`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const cState = state.getCanvasState();
        const targetSharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);
        const container = targetSharedId && cState.sharedObjects[targetSharedId] ? cState.sharedObjects[targetSharedId] : cState;
        const targetId = args.layerId || state.activeLayerId;
        const layer =
            container.layers.find(l => l.id === targetId || l.name.toLowerCase() === String(targetId || "").toLowerCase()) ||
            container.layers[0];
        if (!layer) {
            return { error: `Layer '${targetId}' not found.` };
        }
        const scene = state.engine.inspectScene(state.canvasId);
        const summaryList = targetSharedId ? scene.sharedObjects?.[targetSharedId]?.layers : scene.layers;
        const summary = Array.isArray(summaryList) ? summaryList.find((s: any) => s.id === layer.id) : undefined;
        const filtersEnabled = layer.filtersEnabled !== false;
        const enrichedAttachedFilters = state.engine.describeAttachedFilters(
            cState,
            layer.attachedFilters,
            filtersEnabled
        );
        const timelineDetails = state.engine.inspectAnimationTimeline(state.canvasId, {
            sharedObjectId: targetSharedId,
            targetId: layer.id,
            includePresetCatalogs: false
        });
        return {
            ...layer,
            filtersEnabled,
            previewDynamicFilters: cState.previewDynamicFilters !== false,
            effectiveFiltersInViewport: filtersEnabled && (cState.previewDynamicFilters !== false),
            attachedFilters: enrichedAttachedFilters,
            objects:
                layer.type === "vector"
                    ? layer.objects.map(o => ({
                          ...o,
                          filtersEnabled: o.filtersEnabled !== false,
                          isEditing: state.engine.isObjectEditing(state.canvasId, o.id),
                          attachedFilters: state.engine.describeAttachedFilters(
                              cState,
                              o.attachedFilters,
                              (o.filtersEnabled !== false) && filtersEnabled
                          ),
                          cacheStats: state.engine.getObjectCacheStats(state.canvasId, o.id).entry || null
                      }))
                    : [],
            animationTracks: timelineDetails.tracks,
            summary
        };
    }
}
