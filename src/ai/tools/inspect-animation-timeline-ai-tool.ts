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

export class InspectAnimationTimelineAiTool extends AbstractAiTool {
    public readonly name = "inspect_animation_timeline";
    public readonly category = "inspect" as const;
    public readonly icon = "🎬";
    public readonly description =
        "Inspects the animation timeline (Main Canvas or a Shared Object), returning FPS, duration, loop settings, all animated tracks & keyframe segments with resolved easing curves ([x1, y1, x2, y2] cubic-Bezier control points and curve presets), raster cel keyframe transitions (blend preset, category, cross-layer target, custom JS code), layer/object visibility spans (startFrame..endFrame), and available easing curve & transition catalogs.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            sharedObjectId: {
                type: "string",
                description: "Optional Shared Object ID to inspect that Shared Object's internal animation timeline."
            },
            targetId: {
                type: "string",
                description: "Optional layer ID or vector object ID to filter timeline tracks to a specific target."
            },
            includePresetCatalogs: {
                type: "boolean",
                description: "Whether to include the full catalog of available easing curve presets and categorized raster transitions (default true)."
            }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Inspecting animation timeline${partialArgs.sharedObjectId ? ` ('${partialArgs.sharedObjectId}')` : ""}...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Inspected timeline (${result?.fps ?? 12} FPS, ${result?.durationFrames ?? 1} frames, ${result?.trackCount ?? 0} tracks)`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const sharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);
        const info = state.engine.inspectAnimationTimeline(state.canvasId, {
            sharedObjectId: sharedId,
            targetId: args.targetId,
            includePresetCatalogs: args.includePresetCatalogs !== false
        });
        const curvePresets = [...state.configManager.listCurvePresets()];
        for (const cp of info.customCurvePresets || []) {
            if (!curvePresets.some(p => p.id === cp.id)) {
                curvePresets.push({ ...cp, builtIn: false });
            }
        }
        return {
            ...info,
            currentFrame: state.currentFrame,
            onionSkin: state.onionSkin,
            ...(args.includePresetCatalogs !== false ? { availableCurvePresets: curvePresets } : {})
        };
    }
}
