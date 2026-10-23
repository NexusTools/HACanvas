import * as fs from "fs";
import * as path from "path";
import {
    parsePartialJson as aitoolingParsePartialJson,
    ContextualToolRegistry,
    type ToolContextRule,
    Tool
} from "@nexustools/aitooling";
import {
    HybridArtEngine,
    type ArtCanvasState,
    type BlendMode,
    type EasingMode,
    type VectorObjectSpec
} from "../hybrid-art-engine.js";
import {
    BUILT_IN_CURVE_PRESETS,
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    RASTER_TRANSITION_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    HaEditorConfigManager,
    SharedObjectLibrary,
    type GimpFilterPreset
} from "../shared-object-library.js";

export { ContextualToolRegistry, type ToolContextRule, Tool };

export type AiToolCategory =
    | "inspect"
    | "canvas"
    | "layer"
    | "vector"
    | "raster"
    | "filter"
    | "shared_object"
    | "library"
    | "animation"
    | "file";

export type SharedObjectEditModeForAi = "none" | "in_place" | "isolated_tab";

export interface InPlaceEditContextForAi {
    refInstanceId: string;
    sharedObjectId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
}

export interface HaCanvasAiToolOptions {
    primaryColor: string;
    secondaryColor: string;
    strokeColor: string;
    strokeWidth: number;
    opacity: number;
    brushSize: number;
    brushHardness: number;
    fillTolerance: number;
    fillType?: "flood" | "linear_gradient" | "radial_gradient";
    shapeSides?: number;
    starInnerRadius?: number;
    cornerRadius?: number;
    fontFamily?: string;
    fontSize?: number;
    textContent?: string;
    closedPath?: boolean;
}

/**
 * Host context interface implemented by both `HaCanvasAiSession` (for headless/standalone `hacanvas` consumers
 * and `AICore` workers) and `EditorSessionState` (for `HAEditor` GUI sessions).
 */
export interface HaCanvasAiContext {
    readonly projectRoot: string;
    readonly engine: HybridArtEngine;
    readonly configManager: HaEditorConfigManager;
    readonly library: SharedObjectLibrary;
    canvasId: string;
    hasOpenCanvas?: boolean;
    activeLayerId?: string;
    selectedObjectIds: string[];
    currentFrame: number;
    onionSkin: boolean;
    zoom: number;
    editMode: SharedObjectEditModeForAi;
    activeSharedObjectId?: string;
    inPlaceContext?: InPlaceEditContextForAi;
    toolOptions: HaCanvasAiToolOptions;
    ensureCanvasOpen?(width?: number, height?: number, backgroundColor?: string): ArtCanvasState;
    getCanvasState(): ArtCanvasState;
    resolveActiveLayer(): void;
    enterInPlaceSharedObjectEdit(sharedObjectId: string, refInstanceId?: string): void;
    enterIsolatedTabSharedObjectEdit(sharedObjectId: string): void;
    exitSharedObjectEdit(): void;
    setStatus(message: string): void;
    notify?(): void;
}
export interface OpenAiToolSchema {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, any>;
            required?: string[];
        };
    };
}

/**
 * Tolerant partial JSON parser (delegated to `@nexustools/aitooling`)
 * that auto-closes unclosed quotes, arrays, and objects so incomplete streaming tool call arguments
 * can be live-rendered into human-readable tool labels as tokens stream in from any AI provider.
 */
export function parsePartialJson(jsonStr: string): Record<string, any> {
    return aitoolingParsePartialJson(jsonStr);
}

/**
 * Abstract parent class for all AI tools in `HACanvas` (used by `HAEditor`, `AICore`, and external consumers).
 * Shares OpenAI function schema generation, live partial-argument status formatting,
 * completed status formatting, and target layer/container resolution.
 */
export abstract class AbstractAiTool {
    public abstract readonly name: string;
    public abstract readonly category: AiToolCategory;
    public abstract readonly icon: string;
    public abstract readonly description: string;
    public abstract readonly parameters: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };

    public toOpenAiSchema(): OpenAiToolSchema {
        return {
            type: "function",
            function: {
                name: this.name,
                description: this.description,
                parameters: this.parameters
            }
        };
    }

    /**
     * Returns a live human-readable status label while arguments are streaming in token-by-token.
     */
    public abstract getLiveStatusLabel(partialArgs: Record<string, any>, rawArgsStr: string): string;

    /**
     * Returns a completed human-readable status label after the tool has executed.
     */
    public abstract getCompletedStatusLabel(args: Record<string, any>, result: any): string;

    /**
     * Executes the tool against `HaCanvasAiContext` (`HaCanvasAiSession` or `EditorSessionState`) and `HybridArtEngine`.
     */
    public abstract execute(state: HaCanvasAiContext, args: Record<string, any>): Promise<any> | any;

    /**
     * Ensures a canvas is open and resolves or creates a layer of `preferredType` in either the
     * specified `sharedObjectId`, the currently active Shared Object, or the Main Canvas.
     */
    protected ensureTargetLayer(
        state: HaCanvasAiContext,
        preferredType: "vector" | "raster",
        explicitLayerId?: string,
        explicitSharedObjectId?: string
    ): { layerId: string; sharedObjectId?: string } {
        state.ensureCanvasOpen?.();
        const targetSharedId = explicitSharedObjectId || state.activeSharedObjectId;
        const cState = state.getCanvasState();
        const container =
            targetSharedId && cState.sharedObjects[targetSharedId]
                ? cState.sharedObjects[targetSharedId]
                : cState;

        if (explicitLayerId) {
            const match = container.layers.find(
                l => l.id === explicitLayerId || l.name.toLowerCase() === explicitLayerId.toLowerCase()
            );
            if (match && match.type === preferredType && !match.locked) {
                return { layerId: match.id, sharedObjectId: targetSharedId };
            }
        }

        if (state.activeLayerId) {
            const activeMatch = container.layers.find(l => l.id === state.activeLayerId);
            if (activeMatch && activeMatch.type === preferredType && !activeMatch.locked) {
                return { layerId: activeMatch.id, sharedObjectId: targetSharedId };
            }
        }

        const existingOfType = container.layers.find(l => l.type === preferredType && !l.locked);
        if (existingOfType) {
            state.activeLayerId = existingOfType.id;
            return { layerId: existingOfType.id, sharedObjectId: targetSharedId };
        }

        // Auto-create a layer of the requested type so the user / AI never hits a missing-layer error
        const created = state.engine.createLayer(
            state.canvasId,
            preferredType === "vector" ? "AI Vector Layer" : "AI Raster Layer",
            preferredType,
            { sharedObjectId: targetSharedId }
        );
        state.activeLayerId = created.id;
        return { layerId: created.id, sharedObjectId: targetSharedId };
    }
}

// ============================================================================
