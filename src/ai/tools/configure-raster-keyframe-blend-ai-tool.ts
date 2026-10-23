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

export class ConfigureRasterKeyframeBlendAiTool extends AbstractAiTool {
    public readonly name = "configure_raster_keyframe_blend";
    public readonly category = "animation" as const;
    public readonly icon = "🧪";
    public readonly description =
        "Manages raster layer keyframe animation, cross-layer keyframe blending, and JavaScript blending presets. Can list all built-in and custom blending presets (with their full visible JavaScript source code), inspect a preset's JS code, create/save custom JavaScript blending presets, add/duplicate/blank/fill/remove raster cel keyframes at specific frames, or configure the blending method, curve, custom JS code, or target raster layer between keyframes.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: [
                    "list_presets",
                    "inspect_preset",
                    "save_preset",
                    "delete_preset",
                    "set_cel_keyframe",
                    "configure_blend"
                ],
                description: "Action to execute: 'list_presets' (lists all presets with visible JS code), 'inspect_preset' (returns JS code for a preset), 'save_preset' (validates & saves a custom JS blending script as a preset), 'delete_preset', 'set_cel_keyframe' (adds/duplicates/blanks/fills/removes a raster cel keyframe at a frame), or 'configure_blend' (configures blending preset/custom JS/cross-layer target/curve between keyframes)."
            },
            layerId: {
                type: "string",
                description: "Target raster layer ID or name (defaults to active raster layer)."
            },
            frame: {
                type: "number",
                description: "0-based keyframe index for 'set_cel_keyframe' or 'configure_blend'."
            },
            endFrame: {
                type: "number",
                description: "Optional explicit end frame for the raster keyframe transition segment."
            },
            celMode: {
                type: "string",
                enum: ["duplicate", "blank", "fill", "remove"],
                description: "When action === 'set_cel_keyframe': 'duplicate' (clones current frame pixels into new cel), 'blank' (transparent cel), 'fill' (fills cel with fillColor), or 'remove' (deletes cel keyframe)."
            },
            fillColor: {
                type: "string",
                description: "Color hex/rgba when celMode === 'fill' (e.g. '#ff3366')."
            },
            blendPresetId: {
                type: "string",
                description: "Blending preset ID (built-in: 'crossfade', 'step_hold', 'additive_glow', 'luma_wipe', 'directional_wipe', 'pixel_dissolve', 'chromatic_morph', or a custom saved preset ID)."
            },
            name: {
                type: "string",
                description: "Preset display name when action === 'save_preset'."
            },
            category: {
                type: "string",
                description:
                    "Transition folder category when action === 'save_preset' or optional filter when action === 'list_presets' (e.g. 'Dissolve & Fade', 'Wipe & Sweep', 'Iris & Geometric', 'Light & Chromatic', 'Displacement & Optical', 'Custom', or slash-delimited folder path)."
            },
            description: {
                type: "string",
                description: "Preset description when action === 'save_preset'."
            },
            code: {
                type: "string",
                description: "JavaScript blending code operating on (bufA, bufB, outBuf, width, height, t, rawT, helpers) when action === 'save_preset' or 'configure_blend'."
            },
            targetLayerId: {
                type: "string",
                description: "Optional second raster layer ID or name to blend keyframes with (cross-layer keyframe blending)."
            },
            targetFrame: {
                type: "number",
                description: "Optional frame index on targetLayerId to blend towards."
            },
            easing: {
                type: "string",
                enum: [
                    "linear",
                    "ease_in",
                    "ease_out",
                    "ease_in_out",
                    "ease_in_back",
                    "overshoot",
                    "snap",
                    "step",
                    "custom_bezier"
                ],
                description: "Interpolation curve easing mode for the raster blend."
            },
            curveControlPoints: {
                type: "array",
                items: { type: "number" },
                description: "Optional cubic-Bezier control points [x1, y1, x2, y2] for the raster blend timing curve."
            },
            curvePresetId: {
                type: "string",
                description: "Optional curve preset ID for the raster blend timing curve."
            },
            sharedObjectId: {
                type: "string",
                description: "Optional Shared Object ID."
            }
        },
        required: ["action"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const act = partialArgs.action || "list_presets";
        if (act === "save_preset") return `Saving custom JS raster blend preset '${partialArgs.name || "..."}'...`;
        if (act === "set_cel_keyframe") return `Setting raster cel keyframe on '${partialArgs.layerId || "raster layer"}' @ frame ${partialArgs.frame ?? 0}...`;
        if (act === "configure_blend") return `Configuring raster keyframe blend (${partialArgs.blendPresetId || "custom"})...`;
        return `Inspecting raster keyframe blend presets...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        const act = args.action || "list_presets";
        if (act === "save_preset") return `Saved JS raster blend preset '${result?.preset?.name}' (${result?.preset?.id})`;
        if (act === "set_cel_keyframe") return `Updated raster cel keyframe @ F${result?.frame ?? args.frame} on '${result?.layerId}'`;
        if (act === "configure_blend") return `Configured raster blend '${result?.blendPresetId}' on '${result?.layerId}'`;
        if (act === "inspect_preset") return `Inspected JS code for preset '${result?.preset?.id}'`;
        return `Listed ${result?.presets?.length ?? 0} raster blend presets (with visible JS code)`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const act = args.action || "list_presets";
        const sharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);

        const getMergedPresets = () => {
            const fromEngine = state.engine.listRasterBlendPresets(state.hasOpenCanvas ? state.canvasId : undefined, sharedId);
            const fromConfig = state.configManager.listRasterBlendPresets();
            const merged = [...fromEngine];
            for (const cp of fromConfig) {
                if (!merged.some(m => m.id === cp.id)) {
                    merged.push(cp);
                }
            }
            return merged;
        };

        if (act === "list_presets") {
            let presets = getMergedPresets();
            if (args.category && String(args.category).trim()) {
                const q = String(args.category).trim().toLowerCase();
                presets = presets.filter(p => (p.category || "").toLowerCase() === q || (p.category || "").toLowerCase().startsWith(q + "/"));
            }
            return {
                categories: RASTER_TRANSITION_CATEGORIES,
                presets
            };
        }

        if (act === "inspect_preset") {
            const presetId = args.blendPresetId || "crossfade";
            const found = getMergedPresets().find(p => p.id === presetId);
            if (!found) {
                throw new Error(`Raster blend preset '${presetId}' not found.`);
            }
            return { preset: found };
        }

        if (act === "save_preset") {
            if (!args.code || !String(args.code).trim()) {
                throw new Error("JavaScript 'code' is required when action === 'save_preset'.");
            }
            const validation = state.engine.validateRasterBlendScript(String(args.code));
            if (!validation.valid) {
                throw new Error(`Invalid raster blend JavaScript: ${validation.error}`);
            }
            const savedInConfig = state.configManager.saveRasterBlendPreset({
                id: args.blendPresetId,
                name: args.name || "Custom Blend Script",
                category: args.category || "Custom",
                description: args.description,
                code: String(args.code)
            });
            if (state.hasOpenCanvas) {
                state.engine.saveCustomRasterBlendPreset(
                    state.canvasId,
                    {
                        id: savedInConfig.id,
                        name: savedInConfig.name,
                        category: savedInConfig.category,
                        description: savedInConfig.description,
                        code: savedInConfig.code
                    },
                    sharedId
                );
            }
            state.setStatus(`AI saved custom JS raster blend preset "${savedInConfig.name}" (${savedInConfig.category}).`);
            return { preset: savedInConfig };
        }

        if (act === "delete_preset") {
            if (!args.blendPresetId) throw new Error("blendPresetId is required for delete_preset.");
            const deleted = state.configManager.deleteRasterBlendPreset(String(args.blendPresetId));
            return { blendPresetId: args.blendPresetId, deleted };
        }

        state.ensureCanvasOpen?.();
        const { layerId } = this.ensureTargetLayer(state, "raster", args.layerId, sharedId);

        let resolvedCp: [number, number, number, number] | undefined;
        if (Array.isArray(args.curveControlPoints) && args.curveControlPoints.length === 4) {
            resolvedCp = [
                Number(args.curveControlPoints[0]),
                Number(args.curveControlPoints[1]),
                Number(args.curveControlPoints[2]),
                Number(args.curveControlPoints[3])
            ];
        } else if (args.curvePresetId) {
            const foundCurve = state.configManager.listCurvePresets().find(p => p.id === args.curvePresetId);
            if (foundCurve) {
                resolvedCp = [...foundCurve.controlPoints] as [number, number, number, number];
            }
        }

        if (act === "set_cel_keyframe") {
            const res = state.engine.setRasterCelKeyframe(state.canvasId, {
                layerId,
                frame: Number(args.frame ?? state.currentFrame ?? 0),
                mode: args.celMode || "duplicate",
                fillColor: args.fillColor,
                easing: args.easing as EasingMode | undefined,
                curveControlPoints: resolvedCp,
                curvePresetId: args.curvePresetId,
                endFrame: args.endFrame !== undefined ? Number(args.endFrame) : undefined,
                rasterBlendPresetId: args.blendPresetId,
                rasterBlendCustomCode: args.code,
                rasterBlendTargetLayerId: args.targetLayerId,
                rasterBlendTargetFrame: args.targetFrame !== undefined ? Number(args.targetFrame) : undefined,
                sharedObjectId: sharedId
            });
            state.setStatus(`AI updated raster cel keyframe at F${res.frame} on layer "${res.layerId}".`);
            return res;
        }

        if (act === "configure_blend") {
            const res = state.engine.configureRasterLayerBlend(state.canvasId, {
                layerId,
                frame: args.frame !== undefined ? Number(args.frame) : undefined,
                blendPresetId: args.blendPresetId,
                customBlendCode: args.code,
                targetLayerId: args.targetLayerId,
                targetFrame: args.targetFrame !== undefined ? Number(args.targetFrame) : undefined,
                easing: args.easing as EasingMode | undefined,
                curveControlPoints: resolvedCp,
                curvePresetId: args.curvePresetId,
                endFrame: args.endFrame !== undefined ? Number(args.endFrame) : undefined,
                sharedObjectId: sharedId
            });
            state.setStatus(`AI configured raster keyframe blend (${res.blendPresetId}) on layer "${res.layerId}".`);
            return res;
        }

        throw new Error(`Unknown configure_raster_keyframe_blend action: '${act}'`);
    }
}
