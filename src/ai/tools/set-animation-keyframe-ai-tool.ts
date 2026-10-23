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

export class SetAnimationKeyframeAiTool extends AbstractAiTool {
    public readonly name = "set_animation_keyframe";
    public readonly category = "animation" as const;
    public readonly icon = "⏱️";
    public readonly description =
        "Adds, updates, moves, or removes a keyframe on the animation timeline (Main Canvas or Shared Object) for a vector object, <ObjectRef>, or layer property ('x', 'y', 'x2', 'y2', 'cx', 'cy', 'width', 'height', 'r', 'rx', 'ry', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY', 'opacity', 'fill', 'stroke', 'd', 'points'), with support for custom cubic-Bezier curves, presets, and explicit start/end frames.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: ["set", "update", "remove", "set_frame_range"],
                description: "Keyframe action: 'set' (default) creates/updates a keyframe value, 'update' modifies timing/curve on an existing keyframe, 'remove' deletes a keyframe, 'set_frame_range' sets object/layer startFrame..endFrame visibility."
            },
            targetId: { type: "string", description: "ID of the vector object, <ObjectRef>, or layer to animate." },
            property: {
                type: "string",
                enum: [
                    "x", "y", "x2", "y2", "cx", "cy",
                    "width", "height", "r", "rx", "ry",
                    "scaleX", "scaleY", "rotation", "skewX", "skewY",
                    "opacity", "fill", "stroke", "d", "points", "rasterCel"
                ],
                description: "Animated property name."
            },
            frame: { type: "number", description: "0-based start frame index for the keyframe." },
            newFrame: { type: "number", description: "Optional new frame index when moving an existing keyframe (action === 'update')." },
            endFrame: { type: "number", description: "Optional explicit end frame for this keyframe transition segment (or end visibility frame)." },
            startFrame: { type: "number", description: "Optional visibility startFrame for the target object/layer." },
            value: {
                description: "Numeric, color/path string, or [{x,y}] point array value at this frame."
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
                description: "Interpolation easing mode (default 'linear')."
            },
            curveControlPoints: {
                type: "array",
                items: { type: "number" },
                description: "Optional cubic-Bezier control points [x1, y1, x2, y2] for custom curve interpolation."
            },
            curvePresetId: {
                type: "string",
                description: "Optional curve preset ID (e.g. 'linear', 'ease_in_out', 'overshoot', 'snap', or a custom saved preset ID)."
            },
            sharedObjectId: {
                type: "string",
                description: "Optional Shared Object ID to animate a target inside that Shared Object's timeline."
            }
        },
        required: ["targetId"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        if (partialArgs.action === "remove") {
            return `Removing keyframe on '${partialArgs.targetId || "..."}' @ frame ${partialArgs.frame ?? 0}...`;
        }
        return `Setting keyframe on '${partialArgs.targetId || "..."}' (${partialArgs.property || "prop"} = ${partialArgs.value ?? "..."} @ frame ${partialArgs.frame ?? 0})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>): string {
        if (args.action === "remove") {
            return `Removed keyframe on '${args.targetId}' at frame ${args.frame}`;
        }
        if (args.action === "set_frame_range") {
            return `Updated frame range on '${args.targetId}' (${args.startFrame ?? 0}..${args.endFrame ?? "end"})`;
        }
        return `Set keyframe on '${args.targetId}.${args.property}' = ${args.value} at frame ${args.frame ?? 0}`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const sharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);
        const action = args.action || "set";

        if (action === "set_frame_range") {
            const range = state.engine.setTargetFrameRange(
                state.canvasId,
                String(args.targetId),
                args.startFrame !== undefined ? Number(args.startFrame) : (args.frame !== undefined ? Number(args.frame) : undefined),
                args.endFrame !== undefined ? Number(args.endFrame) : undefined,
                sharedId
            );
            state.setStatus(`AI set frame range on "${args.targetId}" (${range.startFrame ?? 0}..${range.endFrame ?? "end"}).`);
            return range;
        }

        if (action === "remove") {
            const removed = state.engine.removeKeyframe(state.canvasId, {
                targetId: String(args.targetId),
                frame: Number(args.frame ?? 0),
                property: args.property,
                sharedObjectId: sharedId
            });
            state.setStatus(`AI removed ${removed} keyframe(s) on "${args.targetId}" at frame ${args.frame ?? 0}.`);
            return { targetId: args.targetId, frame: Number(args.frame ?? 0), removedCount: removed };
        }

        let resolvedCp: [number, number, number, number] | undefined;
        if (Array.isArray(args.curveControlPoints) && args.curveControlPoints.length === 4) {
            resolvedCp = [
                Number(args.curveControlPoints[0]),
                Number(args.curveControlPoints[1]),
                Number(args.curveControlPoints[2]),
                Number(args.curveControlPoints[3])
            ];
        } else if (args.curvePresetId) {
            const preset = state.configManager.listCurvePresets().find(p => p.id === args.curvePresetId);
            if (preset) {
                resolvedCp = [...preset.controlPoints] as [number, number, number, number];
            }
        }

        if (action === "update" && args.value === undefined) {
            const updatedCount = state.engine.updateKeyframeSegment(state.canvasId, {
                targetId: String(args.targetId),
                frame: Number(args.frame ?? 0),
                newFrame: args.newFrame !== undefined ? Number(args.newFrame) : undefined,
                endFrame: args.endFrame !== undefined ? Number(args.endFrame) : undefined,
                easing: args.easing as EasingMode | undefined,
                curveControlPoints: resolvedCp,
                curvePresetId: args.curvePresetId,
                property: args.property,
                sharedObjectId: sharedId
            });
            state.setStatus(`AI updated ${updatedCount} keyframe segment(s) on "${args.targetId}".`);
            return { targetId: args.targetId, updatedCount };
        }

        const prop = (args.property || "x") as any;
        const numericProps = new Set([
            "x", "y", "x2", "y2", "cx", "cy",
            "width", "height", "r", "rx", "ry",
            "scaleX", "scaleY", "rotation", "skewX", "skewY",
            "opacity", "rasterCel"
        ]);
        const val = Array.isArray(args.value)
            ? args.value
            : numericProps.has(prop)
              ? Number(args.value ?? 0)
              : String(args.value ?? "");

        if (args.startFrame !== undefined) {
            state.engine.setTargetFrameRange(
                state.canvasId,
                String(args.targetId),
                Number(args.startFrame),
                args.endFrame !== undefined ? Number(args.endFrame) : undefined,
                sharedId
            );
        }

        const track = state.engine.setKeyframe(
            state.canvasId,
            String(args.targetId),
            prop,
            Number(args.frame ?? 0),
            val,
            (args.easing as EasingMode) || (resolvedCp ? "custom_bezier" : "linear"),
            {
                sharedObjectId: sharedId,
                endFrame: args.endFrame !== undefined ? Number(args.endFrame) : undefined,
                curveControlPoints: resolvedCp,
                curvePresetId: args.curvePresetId
            }
        );
        state.setStatus(`AI set keyframe on "${args.targetId}.${prop}" at frame ${args.frame ?? 0}.`);
        return track;
    }
}
