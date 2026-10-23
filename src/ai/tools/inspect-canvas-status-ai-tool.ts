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

export class InspectCanvasStatusAiTool extends AbstractAiTool {
    public readonly name = "inspect_canvas_status";
    public readonly category = "inspect" as const;
    public readonly icon = "🔍";
    public readonly description =
        "Inspects the current HACanvas session status, including canvas dimensions, background color, dynamic filter preview state, active editing mode (main canvas, in-place shared object, or isolated tab), active layer, all layers with their active attached filters & settings, selected objects, current frame, animation summary, document metadata, embedded fonts, undo/redo history, and tool options.";
    public readonly parameters = {
        type: "object" as const,
        properties: {}
    };

    public getLiveStatusLabel(): string {
        return "Inspecting current canvas & session status...";
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Inspected canvas status (${result?.width ?? "?"}×${result?.height ?? "?"}px, ${result?.layerCount ?? 0} layers, ${result?.sharedObjectCount ?? 0} shared objects)`;
    }

    public execute(state: HaCanvasAiContext): any {
        const cState = state.getCanvasState();
        const hasOpen = state.hasOpenCanvas ?? state.engine.hasCanvas(state.canvasId);
        const undoSummary = hasOpen
            ? state.engine.getUndoHistory(state.canvasId)
            : { undoList: [], redoList: [], currentLabel: "Base Image" };
        return {
            canvasId: state.canvasId,
            hasOpenCanvas: hasOpen,
            width: cState.width,
            height: cState.height,
            dpi: cState.dpi,
            backgroundColor: cState.backgroundColor,
            previewDynamicFilters: cState.previewDynamicFilters !== false,
            editMode: state.editMode,
            activeSharedObjectId: state.activeSharedObjectId || null,
            activeLayerId: state.activeLayerId || null,
            selectedObjectIds: state.selectedObjectIds,
            currentFrame: state.currentFrame,
            onionSkin: state.onionSkin,
            zoom: state.zoom,
            selection: cState.selection,
            metadata: cState.metadata || {},
            embeddedFonts: Object.values(cState.embeddedFonts || {}).map(f => ({
                id: f.id,
                family: f.family,
                style: f.style,
                weight: f.weight,
                format: f.format
            })),
            undoHistory: {
                canUndo: undoSummary.undoList.length > 0,
                canRedo: undoSummary.redoList.length > 0,
                undoCount: undoSummary.undoList.length,
                redoCount: undoSummary.redoList.length,
                recentUndoLabels: undoSummary.undoList.slice(-5).map((u: { label: string }) => u.label)
            },
            layerCount: cState.layers.length,
            layers: cState.layers.map(l => {
                const filtersEnabled = l.filtersEnabled !== false;
                return {
                    id: l.id,
                    name: l.name,
                    type: l.type,
                    visible: l.visible,
                    locked: l.locked,
                    opacity: l.opacity,
                    blendMode: l.blendMode,
                    startFrame: l.startFrame ?? 0,
                    endFrame: l.endFrame ?? Math.max(0, (cState.animation?.durationFrames ?? 1) - 1),
                    filtersEnabled,
                    effectiveFiltersInViewport: filtersEnabled && (cState.previewDynamicFilters !== false),
                    attachedFilters: hasOpen
                        ? state.engine.describeAttachedFilters(cState, l.attachedFilters, filtersEnabled)
                        : l.attachedFilters || [],
                    objectCount: l.objects.length,
                    celFrames: l.type === "raster" ? l.celFrames || [0] : undefined
                };
            }),
            sharedObjectCount: Object.keys(cState.sharedObjects).length,
            sharedObjectIds: Object.keys(cState.sharedObjects),
            libraryEntryCount: state.library.listEntries().length,
            animationSummary: {
                fps: cState.animation?.fps ?? 12,
                durationFrames: cState.animation?.durationFrames ?? 1,
                loop: cState.animation?.loop ?? true,
                loopBackToFrame: cState.animation?.loopBackToFrame ?? 0,
                trackCount: cState.animation?.tracks?.length ?? 0
            },
            customFilterPresetCount: (cState.customFilterPresets || []).length,
            customTransitionPresetCount: (cState.animation?.customRasterBlendPresets || []).length,
            customCurvePresetCount: (cState.animation?.customCurvePresets || []).length,
            toolOptions: state.toolOptions
        };
    }
}
