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

export class ConfigureAnimationCurveAiTool extends AbstractAiTool {
    public readonly name = "configure_animation_curve";
    public readonly category = "animation" as const;
    public readonly icon = "📈";
    public readonly description =
        "Lists built-in and custom cubic-Bezier animation movement/interpolation curve presets, creates/saves new custom curve presets ([x1, y1, x2, y2]), deletes custom curve presets, or applies a curve preset / custom cubic-Bezier control points to a keyframe segment.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: ["list_presets", "save_preset", "delete_preset", "apply_to_keyframe"],
                description: "Curve action to execute (default 'list_presets')."
            },
            presetId: {
                type: "string",
                description: "Preset ID when applying, saving, or deleting a curve preset."
            },
            name: {
                type: "string",
                description: "Human-readable name when saving a new custom curve preset (e.g. 'Elastic Bounce')."
            },
            controlPoints: {
                type: "array",
                items: { type: "number" },
                description: "Cubic-Bezier control points [x1, y1, x2, y2] where x1,x2 in [0,1] and y1,y2 can overshoot [-1..2]."
            },
            targetId: {
                type: "string",
                description: "Target object ID, <ObjectRef> ID, or layer ID when action === 'apply_to_keyframe'."
            },
            frame: {
                type: "number",
                description: "0-based keyframe index when action === 'apply_to_keyframe'."
            },
            endFrame: {
                type: "number",
                description: "Optional explicit end frame for the keyframe segment when action === 'apply_to_keyframe'."
            },
            property: {
                type: "string",
                description: "Optional property filter ('x', 'y', 'skewX', 'skewY', 'rotation', 'rasterCel', etc.) when action === 'apply_to_keyframe'."
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
                description: "Optional easing mode when action === 'apply_to_keyframe'."
            },
            sharedObjectId: {
                type: "string",
                description: "Optional Shared Object ID."
            }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const act = partialArgs.action || "list_presets";
        if (act === "save_preset") return `Saving custom animation curve preset '${partialArgs.name || "..."}'...`;
        if (act === "apply_to_keyframe") return `Applying animation curve to '${partialArgs.targetId || "..."}' @ frame ${partialArgs.frame ?? 0}...`;
        return `Inspecting animation curve presets...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        const act = args.action || "list_presets";
        if (act === "save_preset") return `Saved curve preset '${result?.preset?.name || args.name}' ([${(result?.preset?.controlPoints || []).join(", ")}])`;
        if (act === "apply_to_keyframe") return `Applied curve to ${result?.updatedCount ?? 0} keyframe(s) on '${args.targetId}'`;
        if (act === "delete_preset") return `Deleted curve preset '${args.presetId}'`;
        return `Listed ${result?.presets?.length ?? 0} animation curve presets`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const act = args.action || "list_presets";
        const sharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);

        if (act === "list_presets") {
            const presets = [...state.configManager.listCurvePresets()];
            if (state.hasOpenCanvas) {
                const cState = state.getCanvasState();
                for (const cp of cState.animation?.customCurvePresets || []) {
                    if (!presets.some(p => p.id === cp.id)) {
                        presets.push({ ...cp, builtIn: false });
                    }
                }
            }
            return { presets };
        }

        if (act === "save_preset") {
            if (!Array.isArray(args.controlPoints) || args.controlPoints.length < 4) {
                throw new Error("controlPoints ([x1, y1, x2, y2]) is required when saving a curve preset.");
            }
            const cp: [number, number, number, number] = [
                Number(args.controlPoints[0]),
                Number(args.controlPoints[1]),
                Number(args.controlPoints[2]),
                Number(args.controlPoints[3])
            ];
            const saved = state.configManager.saveCurvePreset({
                id: args.presetId,
                name: args.name || "Custom Curve",
                controlPoints: cp
            });
            if (state.hasOpenCanvas) {
                const cState = state.getCanvasState();
                if (!cState.animation.customCurvePresets) cState.animation.customCurvePresets = [];
                const idx = cState.animation.customCurvePresets.findIndex(p => p.id === saved.id);
                if (idx >= 0) cState.animation.customCurvePresets[idx] = { id: saved.id, name: saved.name, controlPoints: saved.controlPoints };
                else cState.animation.customCurvePresets.push({ id: saved.id, name: saved.name, controlPoints: saved.controlPoints });
                state.engine.saveCanvas(cState);
            }
            state.setStatus(`AI saved animation curve preset "${saved.name}".`);
            return { preset: saved };
        }

        if (act === "delete_preset") {
            if (!args.presetId) throw new Error("presetId is required for delete_preset.");
            const deleted = state.configManager.deleteCurvePreset(String(args.presetId));
            return { presetId: args.presetId, deleted };
        }

        if (act === "apply_to_keyframe") {
            state.ensureCanvasOpen?.();
            if (!args.targetId) throw new Error("targetId is required when action === 'apply_to_keyframe'.");
            let cp: [number, number, number, number] | undefined;
            if (Array.isArray(args.controlPoints) && args.controlPoints.length === 4) {
                cp = [
                    Number(args.controlPoints[0]),
                    Number(args.controlPoints[1]),
                    Number(args.controlPoints[2]),
                    Number(args.controlPoints[3])
                ];
            } else if (args.presetId) {
                const found = state.configManager.listCurvePresets().find(p => p.id === args.presetId)
                    || BUILT_IN_CURVE_PRESETS.find(p => p.id === args.presetId);
                if (found) {
                    cp = [...found.controlPoints] as [number, number, number, number];
                }
            }
            const updatedCount = state.engine.updateKeyframeSegment(state.canvasId, {
                targetId: String(args.targetId),
                frame: Number(args.frame ?? 0),
                endFrame: args.endFrame !== undefined ? Number(args.endFrame) : undefined,
                easing: (args.easing as EasingMode) || (cp ? "custom_bezier" : undefined),
                curveControlPoints: cp,
                curvePresetId: args.presetId,
                property: args.property as any,
                sharedObjectId: sharedId
            });
            state.setStatus(`AI applied curve to "${args.targetId}" at frame ${args.frame ?? 0}.`);
            return {
                targetId: args.targetId,
                frame: Number(args.frame ?? 0),
                updatedCount,
                curvePresetId: args.presetId,
                controlPoints: cp
            };
        }

        throw new Error(`Unknown configure_animation_curve action: '${act}'`);
    }
}
