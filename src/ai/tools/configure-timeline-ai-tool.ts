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

export class ConfigureTimelineAiTool extends AbstractAiTool {
    public readonly name = "configure_timeline";
    public readonly category = "animation" as const;
    public readonly icon = "🎞️";
    public readonly description =
        "Configures the animation timeline settings (FPS, total frames, loop, loop-back target frame, current playhead frame, onion skinning, or a layer/object's active startFrame/endFrame visibility span) on either the Main Canvas or a Shared Object.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            fps: { type: "number", description: "Frames per second (1..120)." },
            totalFrames: { type: "number", description: "Total duration in frames." },
            loop: { type: "boolean", description: "Whether animation loops." },
            loopBackToFrame: { type: "number", description: "0-based frame index to loop back to when loop is true (default 0)." },
            currentFrame: { type: "number", description: "Move the timeline playhead to this 0-based frame index." },
            onionSkin: { type: "boolean", description: "Enable or disable onion-skin ghost overlay." },
            targetId: { type: "string", description: "Optional layer ID or vector object ID to set active frame visibility range (startFrame..endFrame)." },
            startFrame: { type: "number", description: "Optional 0-based start frame when targetId is specified." },
            endFrame: { type: "number", description: "Optional 0-based end frame when targetId is specified." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID to configure that Shared Object's timeline." }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Configuring animation timeline (fps: ${partialArgs.fps ?? "keep"}, frames: ${partialArgs.totalFrames ?? "keep"})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Configured timeline (${result?.fps} FPS, ${result?.durationFrames} frames, current frame: ${result?.currentFrame})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const sharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);
        let rangeResult: { targetId: string; startFrame?: number; endFrame?: number } | undefined;
        if (args.targetId && (args.startFrame !== undefined || args.endFrame !== undefined)) {
            rangeResult = state.engine.setTargetFrameRange(
                state.canvasId,
                String(args.targetId),
                args.startFrame !== undefined ? Number(args.startFrame) : undefined,
                args.endFrame !== undefined ? Number(args.endFrame) : undefined,
                sharedId
            );
        }
        const anim = state.engine.configureTimeline(state.canvasId, {
            fps: args.fps !== undefined ? Number(args.fps) : undefined,
            totalFrames: args.totalFrames !== undefined ? Number(args.totalFrames) : undefined,
            loop: args.loop,
            loopBackToFrame: args.loopBackToFrame !== undefined ? Number(args.loopBackToFrame) : undefined,
            sharedObjectId: sharedId
        });
        if (args.currentFrame !== undefined) {
            state.currentFrame = Math.max(0, Math.min(anim.durationFrames - 1, Math.round(Number(args.currentFrame))));
        }
        if (args.onionSkin !== undefined) {
            state.onionSkin = Boolean(args.onionSkin);
        }
        state.setStatus(`AI configured timeline (${anim.fps} FPS, ${anim.durationFrames} frames).`);
        return {
            ...anim,
            ...(rangeResult ? { targetFrameRange: rangeResult } : {}),
            currentFrame: state.currentFrame,
            onionSkin: state.onionSkin
        };
    }
}
