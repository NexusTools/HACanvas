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
    HaEditorConfigManager,
    SharedObjectLibrary
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

export interface HaCanvasAiSessionOptions {
    engine?: HybridArtEngine;
    configManager?: HaEditorConfigManager;
    library?: SharedObjectLibrary;
    configDir?: string;
    canvasId?: string;
    autoCreateCanvas?: boolean;
    defaultWidth?: number;
    defaultHeight?: number;
    defaultBackgroundColor?: string;
    onStatusChange?: (status: string) => void;
    onStateChange?: () => void;
}

/**
 * Standalone, zero-boilerplate AI session state for any project using `hacanvas` (including `AICore`
 * and third-party Node.js / NW.js / Electron applications).
 *
 * Implements `HaCanvasAiContext` out-of-the-box so all 26 AI tools in `HaCanvasAiToolRegistry`
 * and `LmStudioAiClient` work immediately with any `HybridArtEngine` instance.
 */
export class HaCanvasAiSession implements HaCanvasAiContext {
    public readonly projectRoot: string;
    public readonly engine: HybridArtEngine;
    public readonly configManager: HaEditorConfigManager;
    public readonly library: SharedObjectLibrary;

    public canvasId: string;
    public hasOpenCanvas = false;
    public activeLayerId: string | undefined;
    public selectedObjectIds: string[] = [];
    public currentFrame = 0;
    public onionSkin = false;
    public zoom = 1.0;
    public statusMessage = "Ready";
    public editMode: SharedObjectEditModeForAi = "none";
    public activeSharedObjectId: string | undefined;
    public inPlaceContext: InPlaceEditContextForAi | undefined;

    public toolOptions: HaCanvasAiToolOptions = {
        primaryColor: "#00d4ff",
        secondaryColor: "#ff3366",
        strokeColor: "#ffffff",
        strokeWidth: 2,
        opacity: 1.0,
        brushSize: 8,
        brushHardness: 0.85,
        fillTolerance: 20,
        fillType: "flood",
        shapeSides: 5,
        starInnerRadius: 22,
        cornerRadius: 6,
        fontFamily: "sans-serif",
        fontSize: 16,
        textContent: "HACANVAS",
        closedPath: true
    };

    private readonly defaultWidth: number;
    private readonly defaultHeight: number;
    private readonly defaultBg: string;
    private readonly onStatusChange?: (status: string) => void;
    private readonly onStateChange?: () => void;

    constructor(projectRoot: string, options: HaCanvasAiSessionOptions = {}) {
        this.projectRoot = projectRoot;
        this.configManager = options.configManager || new HaEditorConfigManager(options.configDir);
        this.library = options.library || new SharedObjectLibrary(this.configManager);
        this.engine = options.engine || new HybridArtEngine(projectRoot);
        this.canvasId = options.canvasId || "main_document";
        this.defaultWidth = options.defaultWidth || 640;
        this.defaultHeight = options.defaultHeight || 420;
        this.defaultBg = options.defaultBackgroundColor || "#161822";
        this.onStatusChange = options.onStatusChange;
        this.onStateChange = options.onStateChange;

        if (this.engine.hasCanvas(this.canvasId)) {
            this.hasOpenCanvas = true;
            this.resolveActiveLayer();
        } else if (options.autoCreateCanvas) {
            this.ensureCanvasOpen(this.defaultWidth, this.defaultHeight, this.defaultBg);
        }
    }

    public ensureCanvasOpen(
        width = this.defaultWidth,
        height = this.defaultHeight,
        backgroundColor = this.defaultBg
    ): ArtCanvasState {
        if (!this.engine.hasCanvas(this.canvasId)) {
            const st = this.engine.createCanvas(this.canvasId, width, height, backgroundColor, [
                { name: "Backdrop Raster Layer", type: "raster", visible: true, opacity: 1.0, blendMode: "normal" },
                { name: "Artwork Vector Layer", type: "vector", visible: true, opacity: 1.0, blendMode: "normal" }
            ]);
            this.hasOpenCanvas = true;
            this.activeLayerId = st.layers[st.layers.length - 1]?.id || st.layers[0]?.id;
            return st;
        }
        this.hasOpenCanvas = true;
        return this.engine.loadCanvas(this.canvasId);
    }

    public getCanvasState(): ArtCanvasState {
        if (this.engine.hasCanvas(this.canvasId)) {
            this.hasOpenCanvas = true;
            return this.engine.loadCanvas(this.canvasId);
        }
        return {
            canvasId: this.canvasId,
            width: this.defaultWidth,
            height: this.defaultHeight,
            dpi: 96,
            backgroundColor: this.defaultBg,
            selection: { mode: "none", inverted: false, x: 0, y: 0, width: this.defaultWidth, height: this.defaultHeight },
            layers: [],
            sharedObjects: {},
            animation: { fps: 12, durationFrames: 1, loop: true, tracks: [] },
            timeline: { fps: 12, totalFrames: 1, keyframes: [] }
        };
    }

    public resolveActiveLayer(): void {
        if (!this.engine.hasCanvas(this.canvasId)) {
            this.activeLayerId = undefined;
            return;
        }
        const cState = this.engine.loadCanvas(this.canvasId);
        const container =
            this.activeSharedObjectId && cState.sharedObjects[this.activeSharedObjectId]
                ? cState.sharedObjects[this.activeSharedObjectId]
                : cState;
        if (this.activeLayerId && container.layers.some(l => l.id === this.activeLayerId)) {
            return;
        }
        this.activeLayerId = container.layers[container.layers.length - 1]?.id || container.layers[0]?.id;
    }

    public enterInPlaceSharedObjectEdit(sharedObjectId: string, refInstanceId?: string): void {
        const cState = this.ensureCanvasOpen();
        const sharedObj = cState.sharedObjects[sharedObjectId];
        if (!sharedObj) {
            throw new Error(`Shared Object '${sharedObjectId}' does not exist on canvas '${this.canvasId}'.`);
        }
        this.editMode = "in_place";
        this.activeSharedObjectId = sharedObjectId;
        this.inPlaceContext = {
            refInstanceId: refInstanceId || "",
            sharedObjectId,
            x: 0,
            y: 0,
            width: sharedObj.width,
            height: sharedObj.height,
            scaleX: 1,
            scaleY: 1,
            rotation: 0
        };
        this.activeLayerId = sharedObj.layers[sharedObj.layers.length - 1]?.id || sharedObj.layers[0]?.id;
        this.notify();
    }

    public enterIsolatedTabSharedObjectEdit(sharedObjectId: string): void {
        const cState = this.ensureCanvasOpen();
        const sharedObj = cState.sharedObjects[sharedObjectId];
        if (!sharedObj) {
            throw new Error(`Shared Object '${sharedObjectId}' does not exist on canvas '${this.canvasId}'.`);
        }
        this.editMode = "isolated_tab";
        this.activeSharedObjectId = sharedObjectId;
        this.inPlaceContext = undefined;
        this.activeLayerId = sharedObj.layers[sharedObj.layers.length - 1]?.id || sharedObj.layers[0]?.id;
        this.notify();
    }

    public exitSharedObjectEdit(): void {
        this.editMode = "none";
        this.activeSharedObjectId = undefined;
        this.inPlaceContext = undefined;
        this.resolveActiveLayer();
        this.notify();
    }

    public setStatus(message: string): void {
        this.statusMessage = message;
        this.onStatusChange?.(message);
    }

    public notify(): void {
        this.onStateChange?.();
    }

    /**
     * Convenience method to execute any registered `hacanvas` AI tool by name against this session.
     */
    public async executeTool(toolName: string, args: Record<string, any> = {}): Promise<any> {
        return await HaCanvasAiToolRegistry.executeTool(toolName, this, args);
    }

    /**
     * Returns the full OpenAI function-calling schema for all 26 `hacanvas` AI tools.
     */
    public getOpenAiToolsSchema(): OpenAiToolSchema[] {
        return HaCanvasAiToolRegistry.getOpenAiToolsSchema();
    }
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
// 1. INSPECT TOOLS
// ============================================================================

export class InspectCanvasStatusAiTool extends AbstractAiTool {
    public readonly name = "inspect_canvas_status";
    public readonly category = "inspect" as const;
    public readonly icon = "🔍";
    public readonly description =
        "Inspects the current HACanvas session status, including canvas dimensions, background color, active editing mode (main canvas, in-place shared object, or isolated tab), active layer, selected objects, current frame, zoom, and tool options.";
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
        return {
            canvasId: state.canvasId,
            hasOpenCanvas: state.hasOpenCanvas ?? state.engine.hasCanvas(state.canvasId),
            width: cState.width,
            height: cState.height,
            dpi: cState.dpi,
            backgroundColor: cState.backgroundColor,
            editMode: state.editMode,
            activeSharedObjectId: state.activeSharedObjectId || null,
            activeLayerId: state.activeLayerId || null,
            selectedObjectIds: state.selectedObjectIds,
            currentFrame: state.currentFrame,
            onionSkin: state.onionSkin,
            zoom: state.zoom,
            selection: cState.selection,
            layerCount: cState.layers.length,
            layers: cState.layers.map(l => ({
                id: l.id,
                name: l.name,
                type: l.type,
                visible: l.visible,
                locked: l.locked,
                opacity: l.opacity,
                blendMode: l.blendMode,
                objectCount: l.objects.length
            })),
            sharedObjectCount: Object.keys(cState.sharedObjects).length,
            sharedObjectIds: Object.keys(cState.sharedObjects),
            libraryEntryCount: state.library.listEntries().length,
            toolOptions: state.toolOptions
        };
    }
}

export class InspectSceneGraphAiTool extends AbstractAiTool {
    public readonly name = "inspect_scene_graph";
    public readonly category = "inspect" as const;
    public readonly icon = "🌳";
    public readonly description =
        "Inspects the complete hybrid scene graph, returning all layers, every vector object (with ID, kind, coordinates, fill/stroke, bounding box), raster pixel coverage & bounding boxes, all Shared Objects, and animation tracks.";
    public readonly parameters = {
        type: "object" as const,
        properties: {}
    };

    public getLiveStatusLabel(): string {
        return "Inspecting full canvas scene graph & layers...";
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Inspected scene graph (${result?.layerCount ?? 0} layers, ${Object.keys(result?.sharedObjects || {}).length} shared objects)`;
    }

    public execute(state: HaCanvasAiContext): any {
        state.ensureCanvasOpen?.();
        return state.engine.inspectScene(state.canvasId);
    }
}

export class InspectLayerDetailsAiTool extends AbstractAiTool {
    public readonly name = "inspect_layer";
    public readonly category = "inspect" as const;
    public readonly icon = "📑";
    public readonly description =
        "Inspects a specific vector or raster layer in detail (including full vector object specifications or raster pixel coverage) on either the Main Canvas or a Shared Object.";
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
        return `Inspected layer '${result?.name || args.layerId || "active"}' (${result?.type || "layer"})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const cState = state.getCanvasState();
        const targetSharedId = args.sharedObjectId || state.activeSharedObjectId;
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
        return {
            ...layer,
            summary
        };
    }
}

export class InspectPixelsAiTool extends AbstractAiTool {
    public readonly name = "inspect_pixels";
    public readonly category = "inspect" as const;
    public readonly icon = "💧";
    public readonly description =
        "Samples RGBA & hex pixel colors and computes color histograms / dominant colors at a point (x, y) or rectangular region (x, y, width, height) on the composite canvas or a specific layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            x: { type: "number", description: "X pixel coordinate (0-based)." },
            y: { type: "number", description: "Y pixel coordinate (0-based)." },
            width: { type: "number", description: "Region width to sample (default 1 for single pixel)." },
            height: { type: "number", description: "Region height to sample (default 1 for single pixel)." },
            layerId: { type: "string", description: "Optional layer ID to sample in isolation." },
            frame: { type: "number", description: "Optional animation frame index (default 0)." }
        },
        required: ["x", "y"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const w = partialArgs.width ?? 1;
        const h = partialArgs.height ?? 1;
        return w > 1 || h > 1
            ? `Sampling pixel region (${partialArgs.x ?? 0}, ${partialArgs.y ?? 0}, ${w}×${h})...`
            : `Sampling pixel at (${partialArgs.x ?? 0}, ${partialArgs.y ?? 0})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        if (result?.hex) {
            return `Sampled pixel at (${args.x}, ${args.y}) → ${result.hex}`;
        }
        return `Sampled pixel region (${args.x}, ${args.y}) → avg ${result?.averageHex || "OK"}`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        return state.engine.inspectPixels(
            state.canvasId,
            Number(args.x ?? 0),
            Number(args.y ?? 0),
            Number(args.width ?? 1),
            Number(args.height ?? 1),
            args.layerId,
            Number(args.frame ?? state.currentFrame)
        );
    }
}

export class InspectSharedObjectsAndLibraryAiTool extends AbstractAiTool {
    public readonly name = "inspect_shared_objects_and_library";
    public readonly category = "inspect" as const;
    public readonly icon = "🧩";
    public readonly description =
        "Lists all Shared Objects currently embedded in the document (with their category, size, layers, and <ObjectRef> reference count) as well as all reusable Shared Objects saved in the persistent OS Shared Object Library.";
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
        const canvasSharedObjects = Object.values(cState.sharedObjects).map(obj => ({
            id: obj.id,
            name: obj.name,
            category: obj.category || "Uncategorized",
            width: obj.width,
            height: obj.height,
            layerCount: obj.layers.length,
            layers: obj.layers.map(l => ({ id: l.id, name: l.name, type: l.type, objectCount: l.objects.length })),
            instanceCount: state.engine.countSharedObjectReferences(cState, obj.id)
        }));
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

export class CaptureCanvasSnapshotAiTool extends AbstractAiTool {
    public readonly name = "capture_canvas_snapshot";
    public readonly category = "inspect" as const;
    public readonly icon = "📸";
    public readonly description =
        "Renders a visual PNG snapshot of the canvas, a specific layer, a vector object, a shared object, or a multi-frame animation contact sheet so you and the user can visually inspect the artwork.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            targetType: {
                type: "string",
                enum: ["canvas", "layer", "object", "shared_object", "region", "contact_sheet"],
                description: "Target to snapshot (default 'canvas')."
            },
            targetId: {
                type: "string",
                description: "Optional layer ID, vector object ID, or shared object ID when targetType is 'layer', 'object', or 'shared_object'."
            },
            frame: { type: "number", description: "Animation frame index (default current frame)." },
            includeGridOverlay: { type: "boolean", description: "Overlay a coordinate grid on the snapshot." },
            highlightBoundingBoxes: { type: "boolean", description: "Highlight vector object bounding boxes." }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Capturing ${partialArgs.targetType || "canvas"} snapshot${partialArgs.targetId ? ` ('${partialArgs.targetId}')` : ""}...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Captured ${args.targetType || "canvas"} snapshot (${result?.width ?? "?"}×${result?.height ?? "?"}px)`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const snap = state.engine.captureSnapshot({
            canvasId: state.canvasId,
            targetType: args.targetType || "canvas",
            targetId: args.targetId,
            frame: args.frame !== undefined ? Number(args.frame) : state.currentFrame,
            onionSkin: state.onionSkin,
            includeGridOverlay: Boolean(args.includeGridOverlay),
            highlightBoundingBoxes: Boolean(args.highlightBoundingBoxes)
        });
        return {
            targetType: snap.targetType,
            targetId: snap.targetId,
            frame: snap.frame,
            width: snap.width,
            height: snap.height,
            snapshotPath: snap.snapshotPath,
            boundingBox: snap.boundingBox,
            previewBase64: snap.base64
        };
    }
}

// ============================================================================
// 2. CANVAS & LAYER TOOLS
// ============================================================================

export class CreateNewCanvasAiTool extends AbstractAiTool {
    public readonly name = "create_new_canvas";
    public readonly category = "canvas" as const;
    public readonly icon = "🖼️";
    public readonly description =
        "Creates a fresh hybrid canvas with the specified width, height, and background color, initialized with a Raster Layer and a Vector Layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            width: { type: "number", description: "Canvas width in pixels (16..4096)." },
            height: { type: "number", description: "Canvas height in pixels (16..4096)." },
            backgroundColor: { type: "string", description: "Background color hex or 'transparent' (e.g. '#181a24')." }
        },
        required: ["width", "height"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Creating new canvas (${partialArgs.width ?? "..."}×${partialArgs.height ?? "..."}px, bg: ${partialArgs.backgroundColor || "#181a24"})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Created ${result?.width}×${result?.height}px canvas (bg: ${result?.backgroundColor})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const w = Math.max(16, Math.min(4096, Math.round(Number(args.width) || 640)));
        const h = Math.max(16, Math.min(4096, Math.round(Number(args.height) || 420)));
        const bg = args.backgroundColor || "#181a24";
        const created = state.engine.createCanvas(state.canvasId, w, h, bg, [
            { name: "Base Raster Layer", type: "raster", visible: true, opacity: 1.0, blendMode: "normal" },
            { name: "Main Vector Layer", type: "vector", visible: true, opacity: 1.0, blendMode: "normal" }
        ]);
        state.hasOpenCanvas = true;
        state.editMode = "none";
        state.activeSharedObjectId = undefined;
        state.inPlaceContext = undefined;
        state.selectedObjectIds = [];
        state.activeLayerId = created.layers[1]?.id || created.layers[0]?.id;
        state.setStatus(`AI created new ${w}×${h}px hybrid canvas.`);
        return {
            width: created.width,
            height: created.height,
            backgroundColor: created.backgroundColor,
            layers: created.layers.map(l => ({ id: l.id, name: l.name, type: l.type }))
        };
    }
}

export class SetCanvasPropertiesAiTool extends AbstractAiTool {
    public readonly name = "set_canvas_properties";
    public readonly category = "canvas" as const;
    public readonly icon = "⚙️";
    public readonly description =
        "Updates the current canvas background color, dimensions (width/height), or viewport zoom without losing existing vector objects or shared objects.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            backgroundColor: { type: "string", description: "New canvas background color (e.g. '#101420' or 'transparent')." },
            width: { type: "number", description: "Optional new canvas width in pixels." },
            height: { type: "number", description: "Optional new canvas height in pixels." },
            zoom: { type: "number", description: "Optional viewport zoom multiplier (0.25 to 4.0)." }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const parts: string[] = [];
        if (partialArgs.backgroundColor) parts.push(`bg: ${partialArgs.backgroundColor}`);
        if (partialArgs.width || partialArgs.height) parts.push(`size: ${partialArgs.width ?? "?"}×${partialArgs.height ?? "?"}`);
        if (partialArgs.zoom) parts.push(`zoom: ${Math.round(Number(partialArgs.zoom) * 100)}%`);
        return `Updating canvas properties (${parts.join(", ") || "..."})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Updated canvas (${result?.width}×${result?.height}px, bg: ${result?.backgroundColor})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const cState = state.getCanvasState();
        if (args.backgroundColor !== undefined) {
            cState.backgroundColor = String(args.backgroundColor);
        }
        if (args.width !== undefined || args.height !== undefined) {
            const newW = Math.max(16, Math.min(4096, Math.round(Number(args.width ?? cState.width))));
            const newH = Math.max(16, Math.min(4096, Math.round(Number(args.height ?? cState.height))));
            for (const layer of cState.layers) {
                if (layer.type === "raster") {
                    const oldBuf = (state.engine as any).loadRasterBuffer(cState, layer.id, cState.width, cState.height);
                    const fitted = (state.engine as any).fitRgbaBuffer(oldBuf, cState.width, cState.height, newW, newH);
                    (state.engine as any).saveRasterBuffer(cState, layer.id, fitted);
                }
            }
            cState.width = newW;
            cState.height = newH;
        }
        state.engine.saveCanvas(cState);
        if (args.zoom !== undefined) {
            state.zoom = Math.max(0.25, Math.min(4.0, Number(args.zoom)));
        }
        state.setStatus(`AI updated canvas properties (${cState.width}×${cState.height}px, bg: ${cState.backgroundColor}).`);
        return {
            width: cState.width,
            height: cState.height,
            backgroundColor: cState.backgroundColor,
            zoom: state.zoom
        };
    }
}

export class CreateLayerAiTool extends AbstractAiTool {
    public readonly name = "create_layer";
    public readonly category = "layer" as const;
    public readonly icon = "➕";
    public readonly description =
        "Creates a new Inkscape 'vector' layer or GIMP 'raster' layer on the Main Canvas or inside a Shared Object and selects it as the active layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            name: { type: "string", description: "Layer name (e.g. 'Foreground Glow' or 'Hero Vector Shapes')." },
            type: { type: "string", enum: ["vector", "raster"], description: "Layer type: 'vector' or 'raster'." },
            opacity: { type: "number", description: "Layer opacity from 0.0 to 1.0 (default 1.0)." },
            blendMode: {
                type: "string",
                enum: ["normal", "multiply", "screen", "overlay", "add", "darken", "lighten", "difference"],
                description: "GIMP layer blend mode (default 'normal')."
            },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID if adding the layer inside a Shared Object." }
        },
        required: ["name", "type"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Creating ${partialArgs.type || "hybrid"} layer '${partialArgs.name || "..."}'`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Created ${result?.type} layer '${result?.name}' (${result?.id})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const layerType = args.type === "raster" ? "raster" : "vector";
        const targetSharedId = args.sharedObjectId || state.activeSharedObjectId;
        const created = state.engine.createLayer(state.canvasId, args.name || "New Layer", layerType, {
            opacity: args.opacity !== undefined ? Number(args.opacity) : 1.0,
            blendMode: (args.blendMode as BlendMode) || "normal",
            sharedObjectId: targetSharedId
        });
        state.activeLayerId = created.id;
        state.setStatus(`AI created ${layerType} layer "${created.name}".`);
        return created;
    }
}

export class ModifyLayerAiTool extends AbstractAiTool {
    public readonly name = "modify_layer";
    public readonly category = "layer" as const;
    public readonly icon = "🎚️";
    public readonly description =
        "Modifies a layer's name, visibility, lock state, opacity, GIMP blend mode, z-order, or performs duplicate / clear / delete on the layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            layerId: { type: "string", description: "Target layer ID or name (defaults to active layer)." },
            action: {
                type: "string",
                enum: ["update", "duplicate", "clear", "delete"],
                description: "Action to perform on the layer (default 'update')."
            },
            name: { type: "string", description: "New layer name." },
            visible: { type: "boolean", description: "Whether the layer is visible." },
            locked: { type: "boolean", description: "Whether the layer is locked." },
            opacity: { type: "number", description: "Layer opacity (0.0 to 1.0)." },
            blendMode: {
                type: "string",
                enum: ["normal", "multiply", "screen", "overlay", "add", "darken", "lighten", "difference"],
                description: "Layer blend mode."
            },
            zOrder: { type: "number", description: "New 0-based stack index for reordering." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const act = partialArgs.action || "update";
        const target = partialArgs.layerId || "active layer";
        if (act === "duplicate") return `Duplicating layer '${target}'...`;
        if (act === "clear") return `Clearing layer '${target}'...`;
        if (act === "delete") return `Deleting layer '${target}'...`;
        return `Updating layer '${target}'...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        const act = args.action || "update";
        if (act === "duplicate") return `Duplicated layer → '${result?.name || result?.id}'`;
        if (act === "clear") return `Cleared layer '${result?.name || args.layerId}'`;
        if (act === "delete") return `Deleted layer '${args.layerId}'`;
        return `Updated layer '${result?.name || args.layerId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const targetSharedId = args.sharedObjectId || state.activeSharedObjectId;
        const targetLayerId = args.layerId || state.activeLayerId;
        if (!targetLayerId) {
            throw new Error("No target layer specified or active.");
        }
        const act = args.action || "update";
        if (act === "duplicate" || act === "clear") {
            const res = state.engine.manageLayer(state.canvasId, act, {
                layerId: targetLayerId,
                sharedObjectId: targetSharedId
            });
            state.setStatus(`AI ${act === "duplicate" ? "duplicated" : "cleared"} layer "${targetLayerId}".`);
            return res;
        }
        if (act === "delete") {
            state.engine.deleteLayer(state.canvasId, targetLayerId, targetSharedId);
            state.resolveActiveLayer();
            state.setStatus(`AI deleted layer "${targetLayerId}".`);
            return { deleted: targetLayerId };
        }
        const updated = state.engine.modifyLayer(state.canvasId, targetLayerId, {
            name: args.name,
            visible: args.visible,
            locked: args.locked,
            opacity: args.opacity !== undefined ? Number(args.opacity) : undefined,
            blendMode: args.blendMode as BlendMode | undefined,
            zOrder: args.zOrder !== undefined ? Number(args.zOrder) : undefined,
            sharedObjectId: targetSharedId
        });
        state.setStatus(`AI updated layer "${updated.name}".`);
        return updated;
    }
}

// ============================================================================
// 3. VECTOR / INKSCAPE TOOLS
// ============================================================================

export class DrawVectorShapeAiTool extends AbstractAiTool {
    public readonly name = "draw_vector_shape";
    public readonly category = "vector" as const;
    public readonly icon = "📐";
    public readonly description =
        "Draws an Inkscape SVG vector shape ('rect', 'circle', 'ellipse', 'polygon', 'star', or 'line') onto a vector layer on the Main Canvas or inside a Shared Object.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            kind: {
                type: "string",
                enum: ["rect", "circle", "ellipse", "polygon", "star", "line"],
                description: "Shape kind to draw."
            },
            x: { type: "number", description: "X coordinate (top-left for rect/polygon/star, center cx for circle/ellipse, x1 for line)." },
            y: { type: "number", description: "Y coordinate (top-left for rect/polygon/star, center cy for circle/ellipse, y1 for line)." },
            width: { type: "number", description: "Width in pixels (for rect, polygon, star, ellipse)." },
            height: { type: "number", description: "Height in pixels (for rect, polygon, star, ellipse)." },
            r: { type: "number", description: "Radius in pixels (for circle, or outer radius for star/polygon)." },
            rx: { type: "number", description: "Horizontal radius for ellipse or corner radius for rect." },
            ry: { type: "number", description: "Vertical radius for ellipse or corner radius for rect." },
            x2: { type: "number", description: "End X coordinate when kind === 'line'." },
            y2: { type: "number", description: "End Y coordinate when kind === 'line'." },
            sides: { type: "number", description: "Number of points/sides when kind === 'star' or 'polygon' (default 5)." },
            innerRadius: { type: "number", description: "Inner radius for 'star' shapes." },
            fill: { type: "string", description: "Fill color hex (e.g. '#00d4ff' or 'none')." },
            stroke: { type: "string", description: "Stroke color hex (e.g. '#ffffff' or 'none')." },
            strokeWidth: { type: "number", description: "Stroke width in pixels (default 2)." },
            opacity: { type: "number", description: "Opacity from 0.0 to 1.0 (default 1.0)." },
            layerId: { type: "string", description: "Optional target vector layer ID or name." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID to draw inside." }
        },
        required: ["kind", "x", "y"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const kind = partialArgs.kind || "shape";
        const pos = partialArgs.x !== undefined ? ` at (${partialArgs.x}, ${partialArgs.y ?? "..."})` : "";
        const fill = partialArgs.fill ? ` [${partialArgs.fill}]` : "";
        return `Drawing vector ${kind}${pos}${fill}...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Drew vector ${result?.kind || "shape"} '${result?.id}' at (${result?.x ?? 0}, ${result?.y ?? 0})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "vector",
            args.layerId,
            args.sharedObjectId
        );
        const obj = state.engine.drawShape(state.canvasId, layerId, {
            sharedObjectId,
            kind: args.kind || "rect",
            x: Number(args.x ?? 50),
            y: Number(args.y ?? 50),
            width: args.width !== undefined ? Number(args.width) : undefined,
            height: args.height !== undefined ? Number(args.height) : undefined,
            r: args.r !== undefined ? Number(args.r) : undefined,
            rx: args.rx !== undefined ? Number(args.rx) : undefined,
            ry: args.ry !== undefined ? Number(args.ry) : undefined,
            x2: args.x2 !== undefined ? Number(args.x2) : undefined,
            y2: args.y2 !== undefined ? Number(args.y2) : undefined,
            sides: args.sides !== undefined ? Number(args.sides) : undefined,
            innerRadius: args.innerRadius !== undefined ? Number(args.innerRadius) : undefined,
            fill: args.fill ?? state.toolOptions.primaryColor,
            stroke: args.stroke ?? state.toolOptions.strokeColor,
            strokeWidth: args.strokeWidth !== undefined ? Number(args.strokeWidth) : state.toolOptions.strokeWidth,
            opacity: args.opacity !== undefined ? Number(args.opacity) : 1.0
        });
        state.selectedObjectIds = [obj.id];
        state.setStatus(`AI drew ${obj.kind} "${obj.id}".`);
        return obj;
    }
}

export class DrawBezierPathAiTool extends AbstractAiTool {
    public readonly name = "draw_bezier_path";
    public readonly category = "vector" as const;
    public readonly icon = "✒️";
    public readonly description =
        "Draws an SVG Bezier/polygon path (`d` path string or array of `{x, y}` points) onto a vector layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            d: { type: "string", description: "SVG path data string (e.g. 'M 50 50 L 150 50 L 100 130 Z')." },
            points: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        x: { type: "number" },
                        y: { type: "number" }
                    },
                    required: ["x", "y"]
                },
                description: "Alternative array of {x, y} points for the path."
            },
            closed: { type: "boolean", description: "Whether the path should be closed (Z)." },
            fill: { type: "string", description: "Fill color (e.g. '#ff3366' or 'none')." },
            stroke: { type: "string", description: "Stroke color (e.g. '#ffffff')." },
            strokeWidth: { type: "number", description: "Stroke width in pixels (default 2)." },
            opacity: { type: "number", description: "Opacity from 0.0 to 1.0." },
            layerId: { type: "string", description: "Optional target vector layer ID." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Drawing Bezier vector path (${partialArgs.fill || partialArgs.stroke || "custom"})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Drew vector path '${result?.id}' (${result?.points?.length ?? 0} nodes)`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "vector",
            args.layerId,
            args.sharedObjectId
        );
        const obj = state.engine.drawPath(state.canvasId, layerId, {
            sharedObjectId,
            d: args.d,
            points: Array.isArray(args.points) ? args.points : undefined,
            closed: Boolean(args.closed),
            fill: args.fill ?? (args.closed ? state.toolOptions.primaryColor : "none"),
            stroke: args.stroke ?? state.toolOptions.strokeColor,
            strokeWidth: args.strokeWidth !== undefined ? Number(args.strokeWidth) : state.toolOptions.strokeWidth,
            opacity: args.opacity !== undefined ? Number(args.opacity) : 1.0
        });
        state.selectedObjectIds = [obj.id];
        state.setStatus(`AI drew vector path "${obj.id}".`);
        return obj;
    }
}

export class DrawVectorTextAiTool extends AbstractAiTool {
    public readonly name = "draw_text";
    public readonly category = "vector" as const;
    public readonly icon = "🔤";
    public readonly description =
        "Draws a vector text object on a vector layer with customizable text string, position, font size, and fill color.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            text: { type: "string", description: "Text string to render." },
            x: { type: "number", description: "X coordinate." },
            y: { type: "number", description: "Y coordinate." },
            fontSize: { type: "number", description: "Font size in pixels (default 21)." },
            fontFamily: { type: "string", description: "Font family (default 'sans-serif')." },
            fill: { type: "string", description: "Text fill color (e.g. '#ffffff')." },
            stroke: { type: "string", description: "Optional stroke color." },
            strokeWidth: { type: "number", description: "Optional stroke width." },
            opacity: { type: "number", description: "Opacity (0.0 to 1.0)." },
            layerId: { type: "string", description: "Optional vector layer ID." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["text", "x", "y"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Drawing vector text "${partialArgs.text || "..."}" at (${partialArgs.x ?? 0}, ${partialArgs.y ?? 0})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Drew vector text "${result?.text}" ('${result?.id}')`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "vector",
            args.layerId,
            args.sharedObjectId
        );
        const obj = state.engine.drawText(state.canvasId, layerId, {
            sharedObjectId,
            text: String(args.text || "TEXT"),
            x: Number(args.x ?? 40),
            y: Number(args.y ?? 40),
            fontSize: args.fontSize !== undefined ? Number(args.fontSize) : 21,
            fontFamily: args.fontFamily || "sans-serif",
            fill: args.fill ?? "#ffffff",
            stroke: args.stroke ?? "none",
            strokeWidth: args.strokeWidth !== undefined ? Number(args.strokeWidth) : 0,
            opacity: args.opacity !== undefined ? Number(args.opacity) : 1.0
        });
        state.selectedObjectIds = [obj.id];
        state.setStatus(`AI drew text "${obj.text}".`);
        return obj;
    }
}

export class ModifyVectorObjectAiTool extends AbstractAiTool {
    public readonly name = "modify_vector_object";
    public readonly category = "vector" as const;
    public readonly icon = "✏️";
    public readonly description =
        "Modifies or deletes an existing vector object or <ObjectRef> instance by ID (updating position, dimensions, radius, colors, scale, rotation, opacity, or text).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            objectId: { type: "string", description: "ID of the vector object or <ObjectRef> to modify." },
            delete: { type: "boolean", description: "Set true to delete this object from the canvas." },
            x: { type: "number", description: "New X coordinate." },
            y: { type: "number", description: "New Y coordinate." },
            width: { type: "number", description: "New width." },
            height: { type: "number", description: "New height." },
            r: { type: "number", description: "New radius." },
            rx: { type: "number", description: "New rx corner/ellipse radius." },
            ry: { type: "number", description: "New ry corner/ellipse radius." },
            fill: { type: "string", description: "New fill color." },
            stroke: { type: "string", description: "New stroke color." },
            strokeWidth: { type: "number", description: "New stroke width." },
            opacity: { type: "number", description: "New opacity (0.0 to 1.0)." },
            scaleX: { type: "number", description: "Scale X (for <ObjectRef>)." },
            scaleY: { type: "number", description: "Scale Y (for <ObjectRef>)." },
            rotation: { type: "number", description: "Rotation in degrees." },
            text: { type: "string", description: "Updated text string (for text objects)." },
            d: { type: "string", description: "Updated SVG path data string (for path objects)." },
            fillOverride: { type: "string", description: "Fill override for <ObjectRef> instances." },
            strokeOverride: { type: "string", description: "Stroke override for <ObjectRef> instances." }
        },
        required: ["objectId"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        if (partialArgs.delete) {
            return `Deleting vector object '${partialArgs.objectId || "..."}'`;
        }
        return `Modifying vector object '${partialArgs.objectId || "..."}'`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        if (args.delete) {
            return `Deleted vector object '${args.objectId}'`;
        }
        return `Modified vector object '${result?.id || args.objectId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        if (args.delete) {
            state.engine.deleteObject(state.canvasId, args.objectId);
            state.selectedObjectIds = state.selectedObjectIds.filter(id => id !== args.objectId);
            state.setStatus(`AI deleted object "${args.objectId}".`);
            return { deleted: args.objectId };
        }
        const { objectId, delete: _del, ...updates } = args;
        const cleanUpdates: Partial<VectorObjectSpec> = {};
        for (const [k, v] of Object.entries(updates)) {
            if (v !== undefined) {
                (cleanUpdates as any)[k] = v;
            }
        }
        const updated = state.engine.modifyObject(state.canvasId, objectId, cleanUpdates);
        state.selectedObjectIds = [updated.id];
        state.setStatus(`AI modified object "${updated.id}".`);
        return updated;
    }
}

export class BooleanPathOperationAiTool extends AbstractAiTool {
    public readonly name = "boolean_path_operation";
    public readonly category = "vector" as const;
    public readonly icon = "🔗";
    public readonly description =
        "Performs an Inkscape boolean or path operation ('union', 'difference', 'intersection', 'exclusion', 'offset', or 'simplify') on vector objects.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            operation: {
                type: "string",
                enum: ["union", "difference", "intersection", "exclusion", "offset", "simplify"],
                description: "Path operation to perform."
            },
            targetIds: {
                type: "array",
                items: { type: "string" },
                description: "Object IDs (2 IDs for boolean union/difference/intersection/exclusion, 1 ID for offset/simplify)."
            },
            offsetDistance: { type: "number", description: "Offset distance in pixels when operation === 'offset' (default 4)." },
            simplifyTolerance: { type: "number", description: "Simplify tolerance when operation === 'simplify'." },
            layerId: { type: "string", description: "Optional vector layer ID." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["operation", "targetIds"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Running vector path ${partialArgs.operation || "operation"} on ${(partialArgs.targetIds || []).join(", ") || "shapes"}...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Completed path ${args.operation} → '${result?.id}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const targetIds = Array.isArray(args.targetIds) && args.targetIds.length > 0
            ? args.targetIds
            : state.selectedObjectIds;
        const res = state.engine.pathOperation(state.canvasId, args.operation, {
            targetIds,
            offsetDistance: args.offsetDistance !== undefined ? Number(args.offsetDistance) : undefined,
            simplifyTolerance: args.simplifyTolerance !== undefined ? Number(args.simplifyTolerance) : undefined,
            layerId: args.layerId,
            sharedObjectId: args.sharedObjectId || state.activeSharedObjectId
        });
        state.selectedObjectIds = [res.id];
        state.setStatus(`AI executed path ${args.operation} → "${res.id}".`);
        return res;
    }
}

// ============================================================================
// 4. RASTER / GIMP PAINT, FILL, & SELECTION TOOLS
// ============================================================================

export class SelectRegionAiTool extends AbstractAiTool {
    public readonly name = "select_region";
    public readonly category = "raster" as const;
    public readonly icon = "⬚";
    public readonly description =
        "Creates, inverts, or clears a GIMP selection mask ('rect', 'ellipse', 'invert', or 'clear') to constrain raster painting, fills, and filters.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            op: {
                type: "string",
                enum: ["rect", "ellipse", "invert", "clear"],
                description: "Selection operation."
            },
            x: { type: "number", description: "Selection X coordinate (for 'rect' or 'ellipse')." },
            y: { type: "number", description: "Selection Y coordinate (for 'rect' or 'ellipse')." },
            width: { type: "number", description: "Selection width (for 'rect' or 'ellipse')." },
            height: { type: "number", description: "Selection height (for 'rect' or 'ellipse')." }
        },
        required: ["op"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const op = partialArgs.op || "rect";
        if (op === "clear") return "Clearing selection mask...";
        if (op === "invert") return "Inverting selection mask...";
        return `Selecting ${op} region (${partialArgs.x ?? 0}, ${partialArgs.y ?? 0}, ${partialArgs.width ?? "?"}×${partialArgs.height ?? "?"})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        if (args.op === "clear") return "Cleared selection mask";
        if (args.op === "invert") return "Inverted selection mask";
        return `Selected ${result?.mode} region (${result?.x}, ${result?.y}, ${result?.width}×${result?.height})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const sel = state.engine.rasterSelection(state.canvasId, args.op, {
            x: Number(args.x ?? 0),
            y: Number(args.y ?? 0),
            width: Number(args.width ?? 100),
            height: Number(args.height ?? 100)
        });
        state.setStatus(`AI updated selection (${args.op}).`);
        return sel;
    }
}

export class PaintRasterStrokeAiTool extends AbstractAiTool {
    public readonly name = "paint_raster_stroke";
    public readonly category = "raster" as const;
    public readonly icon = "🖌️";
    public readonly description =
        "Paints a GIMP raster stroke ('brush', 'pencil', 'airbrush', or 'eraser') along a sequence of {x, y} coordinates on a raster layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            tool: {
                type: "string",
                enum: ["brush", "pencil", "airbrush", "eraser"],
                description: "Raster painting tool (default 'brush')."
            },
            points: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        x: { type: "number" },
                        y: { type: "number" }
                    },
                    required: ["x", "y"]
                },
                description: "Array of {x, y} stroke coordinates."
            },
            color: { type: "string", description: "Brush color hex (e.g. '#00d4ff')." },
            size: { type: "number", description: "Brush diameter in pixels (default 10)." },
            hardness: { type: "number", description: "Brush hardness from 0.0 to 1.0 (default 0.85)." },
            opacity: { type: "number", description: "Stroke opacity from 0.0 to 1.0 (default 1.0)." },
            frame: { type: "number", description: "Optional animation frame index." },
            layerId: { type: "string", description: "Optional raster layer ID or name." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["points"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const tool = partialArgs.tool || "brush";
        const ptCount = Array.isArray(partialArgs.points) ? partialArgs.points.length : 0;
        return `Painting ${tool} stroke (${ptCount} pts, size: ${partialArgs.size ?? 10}px, color: ${partialArgs.color || "active"})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Painted ${args.tool || "brush"} stroke (${result?.pointsDrawn ?? 0} points) on layer '${result?.layerId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "raster",
            args.layerId,
            args.sharedObjectId
        );
        const pts = Array.isArray(args.points) && args.points.length > 0 ? args.points : [{ x: 50, y: 50 }];
        const res = state.engine.rasterStroke(state.canvasId, layerId, {
            sharedObjectId,
            tool: args.tool || "brush",
            points: pts.map((p: any) => ({ x: Number(p.x ?? 0), y: Number(p.y ?? 0) })),
            color: args.color || state.toolOptions.primaryColor,
            size: args.size !== undefined ? Number(args.size) : state.toolOptions.brushSize,
            hardness: args.hardness !== undefined ? Number(args.hardness) : state.toolOptions.brushHardness,
            opacity: args.opacity !== undefined ? Number(args.opacity) : state.toolOptions.opacity,
            frame: args.frame !== undefined ? Number(args.frame) : state.currentFrame
        });
        state.setStatus(`AI painted ${args.tool || "brush"} stroke on "${res.layerId}".`);
        return res;
    }
}

export class RasterFillAiTool extends AbstractAiTool {
    public readonly name = "raster_fill";
    public readonly category = "raster" as const;
    public readonly icon = "🪣";
    public readonly description =
        "Fills a raster layer (or active selection) using a GIMP bucket 'flood' fill, 'linear_gradient', or 'radial_gradient'.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            fillType: {
                type: "string",
                enum: ["flood", "linear_gradient", "radial_gradient"],
                description: "Type of fill (default 'flood')."
            },
            color: { type: "string", description: "Primary/start color hex (e.g. '#1a2035')." },
            colorEnd: { type: "string", description: "End color hex for linear_gradient or radial_gradient (e.g. '#ff3366')." },
            x: { type: "number", description: "Seed X for flood fill or start X for gradient (default 0)." },
            y: { type: "number", description: "Seed Y for flood fill or start Y for gradient (default 0)." },
            x2: { type: "number", description: "End X for gradient." },
            y2: { type: "number", description: "End Y for gradient." },
            radius: { type: "number", description: "Radius for radial_gradient." },
            tolerance: { type: "number", description: "Color tolerance (0..255) for flood fill (default 20)." },
            frame: { type: "number", description: "Optional animation frame index." },
            layerId: { type: "string", description: "Optional raster layer ID or name." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["fillType", "color"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const ft = partialArgs.fillType || "flood";
        return `Applying ${ft.replace("_", " ")} (${partialArgs.color || ""}${partialArgs.colorEnd ? ` → ${partialArgs.colorEnd}` : ""})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Applied ${args.fillType || "flood"} fill (${result?.pixelsFilled ?? 0} px) on '${result?.layerId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "raster",
            args.layerId,
            args.sharedObjectId
        );
        const res = state.engine.rasterFill(state.canvasId, layerId, {
            sharedObjectId,
            fillType: args.fillType || "flood",
            color: args.color || state.toolOptions.primaryColor,
            colorEnd: args.colorEnd || state.toolOptions.secondaryColor,
            x: args.x !== undefined ? Number(args.x) : 0,
            y: args.y !== undefined ? Number(args.y) : 0,
            x2: args.x2 !== undefined ? Number(args.x2) : undefined,
            y2: args.y2 !== undefined ? Number(args.y2) : undefined,
            radius: args.radius !== undefined ? Number(args.radius) : undefined,
            tolerance: args.tolerance !== undefined ? Number(args.tolerance) : state.toolOptions.fillTolerance,
            frame: args.frame !== undefined ? Number(args.frame) : state.currentFrame
        });
        state.setStatus(`AI applied ${args.fillType || "flood"} fill on "${res.layerId}".`);
        return res;
    }
}

// ============================================================================
// 5. GIMP FILTER TOOLS
// ============================================================================

export class ApplyGimpFilterAiTool extends AbstractAiTool {
    public readonly name = "apply_gimp_filter";
    public readonly category = "filter" as const;
    public readonly icon = "✨";
    public readonly description =
        "Applies a GIMP pixel filter ('gaussian_blur', 'sharpen', 'invert', 'threshold', 'brightness_contrast', or 'drop_shadow') to a raster layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            filterType: {
                type: "string",
                enum: ["gaussian_blur", "sharpen", "invert", "threshold", "brightness_contrast", "drop_shadow"],
                description: "GIMP filter to apply."
            },
            radius: { type: "number", description: "Blur radius in pixels (for gaussian_blur or drop_shadow, default 3)." },
            amount: { type: "number", description: "Sharpen intensity (for sharpen, default 1.2)." },
            threshold: { type: "number", description: "Luminance cutoff 0..255 (for threshold, default 128)." },
            brightness: { type: "number", description: "Brightness adjustment -100..100 (for brightness_contrast)." },
            contrast: { type: "number", description: "Contrast adjustment -100..100 (for brightness_contrast)." },
            offsetX: { type: "number", description: "Shadow X offset in pixels (for drop_shadow, default 4)." },
            offsetY: { type: "number", description: "Shadow Y offset in pixels (for drop_shadow, default 4)." },
            color: { type: "string", description: "Shadow color hex (for drop_shadow, default '#000000')." },
            opacity: { type: "number", description: "Shadow opacity 0.0..1.0 (for drop_shadow, default 0.65)." },
            layerId: { type: "string", description: "Optional target raster layer ID or name." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: ["filterType"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Applying GIMP filter '${partialArgs.filterType || "..."}' to raster layer...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Applied GIMP filter '${result?.filterType || args.filterType}' on layer '${result?.layerId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "raster",
            args.layerId,
            args.sharedObjectId
        );
        const res = state.engine.rasterFilter(
            state.canvasId,
            layerId,
            {
                filterType: args.filterType,
                radius: args.radius !== undefined ? Number(args.radius) : undefined,
                amount: args.amount !== undefined ? Number(args.amount) : undefined,
                threshold: args.threshold !== undefined ? Number(args.threshold) : undefined,
                brightness: args.brightness !== undefined ? Number(args.brightness) : undefined,
                contrast: args.contrast !== undefined ? Number(args.contrast) : undefined,
                offsetX: args.offsetX !== undefined ? Number(args.offsetX) : undefined,
                offsetY: args.offsetY !== undefined ? Number(args.offsetY) : undefined,
                color: args.color,
                opacity: args.opacity !== undefined ? Number(args.opacity) : undefined,
                frame: state.currentFrame
            },
            state.currentFrame,
            sharedObjectId
        );
        state.setStatus(`AI applied GIMP filter "${res.filterType}" on "${res.layerId}".`);
        return res;
    }
}

// ============================================================================
// 6. SHARED OBJECT & LIBRARY TOOLS
// ============================================================================

export class CreateSharedObjectAiTool extends AbstractAiTool {
    public readonly name = "create_shared_object";
    public readonly category = "shared_object" as const;
    public readonly icon = "🧩";
    public readonly description =
        "Creates a new reusable Shared Object sub-canvas (stored as `objects/<id>.xml` in `.hacanvas` with its own vector & raster layers) and optionally places an <ObjectRef> instance on the Main Canvas.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            id: { type: "string", description: "Optional explicit ID (e.g. 'shared_emerald_gem')." },
            name: { type: "string", description: "Name or slash-categorized path (e.g. 'UI/Gems/EmeraldGem')." },
            category: { type: "string", description: "Category folder path (e.g. 'UI/Gems')." },
            width: { type: "number", description: "Sub-canvas width in pixels (default 128)." },
            height: { type: "number", description: "Sub-canvas height in pixels (default 128)." },
            instantiateOnCanvas: { type: "boolean", description: "Whether to immediately place an <ObjectRef> instance on the Main Canvas (default true)." },
            x: { type: "number", description: "X position for the placed <ObjectRef> instance." },
            y: { type: "number", description: "Y position for the placed <ObjectRef> instance." }
        },
        required: ["name"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Creating Shared Object '${partialArgs.name || "..."}' (${partialArgs.width ?? 128}×${partialArgs.height ?? 128}px)...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Created Shared Object '${result?.sharedObject?.name}' (${result?.sharedObject?.id})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const sharedObj = state.engine.createSharedObject(state.canvasId, {
            id: args.id,
            name: args.name,
            category: args.category,
            width: args.width !== undefined ? Number(args.width) : 128,
            height: args.height !== undefined ? Number(args.height) : 128
        });
        let refInstance: VectorObjectSpec | undefined;
        if (args.instantiateOnCanvas !== false) {
            const { layerId } = this.ensureTargetLayer(state, "vector");
            refInstance = state.engine.instantiateObjectRef(state.canvasId, sharedObj.id, {
                layerId,
                x: args.x !== undefined ? Number(args.x) : 48,
                y: args.y !== undefined ? Number(args.y) : 48
            });
        }
        state.setStatus(`AI created Shared Object "${sharedObj.name}".`);
        return { sharedObject: sharedObj, refInstance };
    }
}

export class ManageSharedObjectAiTool extends AbstractAiTool {
    public readonly name = "manage_shared_object";
    public readonly category = "shared_object" as const;
    public readonly icon = "🗂️";
    public readonly description =
        "Manages an existing Shared Object: instantiate a new <ObjectRef> on the canvas, rename/recategorize it, duplicate it, delete it, or switch editing mode ('in_place', 'isolated_tab', or 'exit' to Main Canvas).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: ["instantiate_ref", "rename", "duplicate", "delete", "edit_in_place", "edit_isolated_tab", "exit_edit"],
                description: "Action to perform."
            },
            sharedObjectId: { type: "string", description: "Target Shared Object ID." },
            newName: { type: "string", description: "New name (for rename or duplicate)." },
            newCategory: { type: "string", description: "New category path (for rename or duplicate)." },
            x: { type: "number", description: "X coordinate when action === 'instantiate_ref'." },
            y: { type: "number", description: "Y coordinate when action === 'instantiate_ref'." },
            scaleX: { type: "number", description: "Horizontal scale when action === 'instantiate_ref'." },
            scaleY: { type: "number", description: "Vertical scale when action === 'instantiate_ref'." },
            rotation: { type: "number", description: "Rotation degrees when action === 'instantiate_ref'." },
            parentSharedObjectId: { type: "string", description: "Optional parent Shared Object ID to nest the <ObjectRef> inside." }
        },
        required: ["action"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const act = partialArgs.action || "manage";
        const id = partialArgs.sharedObjectId || "";
        return `Shared Object action '${act}' ${id ? `on '${id}'` : ""}...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        return `Completed Shared Object '${args.action}' (${result?.id || args.sharedObjectId || "OK"})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const act = args.action;
        if (act === "exit_edit") {
            state.exitSharedObjectEdit();
            return { editMode: state.editMode };
        }
        const sharedId = args.sharedObjectId || state.activeSharedObjectId;
        if (!sharedId) {
            throw new Error("sharedObjectId is required for this action.");
        }
        if (act === "edit_in_place") {
            state.enterInPlaceSharedObjectEdit(sharedId);
            return { editMode: state.editMode, activeSharedObjectId: state.activeSharedObjectId };
        }
        if (act === "edit_isolated_tab") {
            state.enterIsolatedTabSharedObjectEdit(sharedId);
            return { editMode: state.editMode, activeSharedObjectId: state.activeSharedObjectId };
        }
        if (act === "instantiate_ref") {
            const { layerId } = this.ensureTargetLayer(state, "vector", undefined, args.parentSharedObjectId);
            const ref = state.engine.instantiateObjectRef(state.canvasId, sharedId, {
                layerId,
                parentSharedObjectId: args.parentSharedObjectId,
                x: Number(args.x ?? 64),
                y: Number(args.y ?? 64),
                scaleX: args.scaleX !== undefined ? Number(args.scaleX) : 1,
                scaleY: args.scaleY !== undefined ? Number(args.scaleY) : 1,
                rotation: args.rotation !== undefined ? Number(args.rotation) : 0
            });
            state.selectedObjectIds = [ref.id];
            state.setStatus(`AI placed <ObjectRef> instance "${ref.id}" of "${sharedId}".`);
            return ref;
        }
        if (act === "rename") {
            const updated = state.engine.renameSharedObject(state.canvasId, sharedId, args.newName || sharedId, args.newCategory);
            state.setStatus(`AI renamed Shared Object to "${updated.name}".`);
            return updated;
        }
        if (act === "duplicate") {
            const copy = state.engine.duplicateSharedObject(state.canvasId, sharedId, undefined, args.newName, args.newCategory);
            state.setStatus(`AI duplicated Shared Object "${sharedId}" → "${copy.id}".`);
            return copy;
        }
        if (act === "delete") {
            if (state.activeSharedObjectId === sharedId) {
                state.exitSharedObjectEdit();
            }
            state.engine.deleteSharedObject(state.canvasId, sharedId);
            state.setStatus(`AI deleted Shared Object "${sharedId}".`);
            return { deleted: sharedId };
        }
        throw new Error(`Unknown shared object action: ${act}`);
    }
}

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

// ============================================================================
// 7. ANIMATION & TIMELINE TOOLS
// ============================================================================

export class ConfigureTimelineAiTool extends AbstractAiTool {
    public readonly name = "configure_timeline";
    public readonly category = "animation" as const;
    public readonly icon = "🎞️";
    public readonly description =
        "Configures the animation timeline settings (FPS, total frames, loop, current playhead frame, and onion skinning).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            fps: { type: "number", description: "Frames per second (1..120)." },
            totalFrames: { type: "number", description: "Total duration in frames." },
            loop: { type: "boolean", description: "Whether animation loops." },
            currentFrame: { type: "number", description: "Move the timeline playhead to this 0-based frame index." },
            onionSkin: { type: "boolean", description: "Enable or disable onion-skin ghost overlay." }
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
        const anim = state.engine.configureTimeline(state.canvasId, {
            fps: args.fps !== undefined ? Number(args.fps) : undefined,
            totalFrames: args.totalFrames !== undefined ? Number(args.totalFrames) : undefined,
            loop: args.loop
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
            currentFrame: state.currentFrame,
            onionSkin: state.onionSkin
        };
    }
}

export class SetAnimationKeyframeAiTool extends AbstractAiTool {
    public readonly name = "set_animation_keyframe";
    public readonly category = "animation" as const;
    public readonly icon = "⏱️";
    public readonly description =
        "Adds or updates a keyframe on the animation timeline for a vector object, <ObjectRef>, or layer property ('x', 'y', 'width', 'height', 'r', 'scaleX', 'scaleY', 'rotation', 'opacity', 'fill', 'stroke', 'd').";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            targetId: { type: "string", description: "ID of the vector object, <ObjectRef>, or layer to animate." },
            property: {
                type: "string",
                enum: ["x", "y", "width", "height", "r", "scaleX", "scaleY", "rotation", "opacity", "fill", "stroke", "d"],
                description: "Animated property name."
            },
            frame: { type: "number", description: "0-based frame index for the keyframe." },
            value: {
                description: "Numeric or color/path string value at this frame."
            },
            easing: {
                type: "string",
                enum: ["linear", "ease_in", "ease_out", "ease_in_out", "step"],
                description: "Interpolation easing mode (default 'linear')."
            }
        },
        required: ["targetId", "property", "frame", "value"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Setting keyframe on '${partialArgs.targetId || "..."}' (${partialArgs.property || "prop"} = ${partialArgs.value ?? "..."} @ frame ${partialArgs.frame ?? 0})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>): string {
        return `Set keyframe on '${args.targetId}.${args.property}' = ${args.value} at frame ${args.frame}`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const numericProps = new Set(["x", "y", "width", "height", "r", "scaleX", "scaleY", "rotation", "opacity"]);
        const val = numericProps.has(args.property) ? Number(args.value) : String(args.value);
        const track = state.engine.setKeyframe(
            state.canvasId,
            args.targetId,
            args.property,
            Number(args.frame ?? 0),
            val,
            (args.easing as EasingMode) || "linear"
        );
        state.setStatus(`AI added keyframe on "${args.targetId}.${args.property}" at frame ${args.frame}.`);
        return track;
    }
}

// ============================================================================
// 8. FILE OPEN / IMPORT / SAVE / EXPORT TOOLS
// ============================================================================

export class OpenOrImportFileAiTool extends AbstractAiTool {
    public readonly name = "open_or_import_file";
    public readonly category = "file" as const;
    public readonly icon = "📂";
    public readonly description =
        "Opens or imports any supported artwork file (.hacanvas, .ai Adobe Illustrator, .psd Photoshop, .xcf GIMP, .ora OpenRaster, .svg Inkscape, .png, .gif, .bmp, .tga, .ico, etc.) as a new canvas, appended layers, or into a Shared Object.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            filePath: { type: "string", description: "File path to open/import." },
            mode: {
                type: "string",
                enum: ["new_canvas", "append_layers", "into_shared_object"],
                description: "Import mode (default 'new_canvas')."
            },
            sharedObjectId: { type: "string", description: "Target Shared Object ID when mode === 'into_shared_object'." }
        },
        required: ["filePath"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Importing file '${partialArgs.filePath || "..."}' (${partialArgs.mode || "new_canvas"})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Imported ${result?.detectedFormat?.toUpperCase() || "file"} (${result?.layersImported ?? 0} layers, ${result?.width}×${result?.height}px)`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const mode = args.mode || "new_canvas";
        if (mode === "new_canvas") {
            state.exitSharedObjectEdit();
        } else {
            state.ensureCanvasOpen?.();
        }
        const res = state.engine.loadFromFile(state.canvasId, args.filePath, {
            mode,
            targetSharedObjectId: args.sharedObjectId || state.activeSharedObjectId
        });
        state.hasOpenCanvas = true;
        state.resolveActiveLayer();
        state.setStatus(`AI imported "${path.basename(args.filePath)}" (${res.detectedFormat.toUpperCase()}).`);
        return res;
    }
}

export class SaveAndExportArtworkAiTool extends AbstractAiTool {
    public readonly name = "save_or_export_artwork";
    public readonly category = "file" as const;
    public readonly icon = "💾";
    public readonly description =
        "Saves the project as a native `.hacanvas` ZIP+XML package or exports the canvas to any image/vector format ('png', 'svg', 'gif', 'ora', 'bmp', 'tga', 'ico', 'ppm', 'farbfeld', 'sprite_sheet', or 'hacanvas').";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            outputPath: { type: "string", description: "Output file path (e.g. 'exports/artwork.png' or 'project.hacanvas')." },
            format: {
                type: "string",
                enum: ["hacanvas", "png", "svg", "gif", "ora", "bmp", "tga", "ico", "ppm", "farbfeld", "sprite_sheet"],
                description: "Export format (default inferred from outputPath or 'png')."
            },
            frame: { type: "number", description: "Optional frame index for single-frame exports." }
        },
        required: ["outputPath"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Exporting artwork to '${partialArgs.outputPath || "..."}' (${partialArgs.format || "auto"})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Saved ${result?.format?.toUpperCase()} (${result?.bytesWritten ?? 0} bytes) → ${result?.outputPath || result?.filePath}`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const res = state.engine.exportCanvas(
            state.canvasId,
            args.outputPath,
            args.format,
            { frame: args.frame !== undefined ? Number(args.frame) : state.currentFrame }
        );
        state.setStatus(`AI exported ${res.format.toUpperCase()} to "${res.outputPath}".`);
        return res;
    }
}

/**
 * Built-in registry of all 26 AI tools provided directly by `HACanvas` (used by `HAEditor`, `AICore`,
 * and any downstream application embedding `hacanvas`).
 */
export class HaCanvasAiToolRegistry {
    private static readonly tools: AbstractAiTool[] = [
        new InspectCanvasStatusAiTool(),
        new InspectSceneGraphAiTool(),
        new InspectLayerDetailsAiTool(),
        new InspectPixelsAiTool(),
        new InspectSharedObjectsAndLibraryAiTool(),
        new CaptureCanvasSnapshotAiTool(),
        new CreateNewCanvasAiTool(),
        new SetCanvasPropertiesAiTool(),
        new CreateLayerAiTool(),
        new ModifyLayerAiTool(),
        new DrawVectorShapeAiTool(),
        new DrawBezierPathAiTool(),
        new DrawVectorTextAiTool(),
        new ModifyVectorObjectAiTool(),
        new BooleanPathOperationAiTool(),
        new SelectRegionAiTool(),
        new PaintRasterStrokeAiTool(),
        new RasterFillAiTool(),
        new ApplyGimpFilterAiTool(),
        new CreateSharedObjectAiTool(),
        new ManageSharedObjectAiTool(),
        new SharedObjectLibraryAiTool(),
        new ConfigureTimelineAiTool(),
        new SetAnimationKeyframeAiTool(),
        new OpenOrImportFileAiTool(),
        new SaveAndExportArtworkAiTool()
    ];

    public static getAllTools(): AbstractAiTool[] {
        return [...this.tools];
    }

    public static getTool(name: string): AbstractAiTool | undefined {
        return this.tools.find(t => t.name === name);
    }

    public static getOpenAiToolsSchema(): OpenAiToolSchema[] {
        return this.tools.map(t => t.toOpenAiSchema());
    }

    public static async executeTool(
        toolName: string,
        state: HaCanvasAiContext,
        args: Record<string, any> = {}
    ): Promise<any> {
        const tool = this.getTool(toolName);
        if (!tool) {
            throw new Error(`Unknown HACanvas AI tool: '${toolName}'`);
        }
        return await tool.execute(state, args);
    }

    public static getLiveToolStatusLabel(toolName: string, partialArgs: Record<string, any>, rawArgsStr: string): string {
        const tool = this.getTool(toolName);
        if (tool) {
            return `${tool.icon} ${tool.getLiveStatusLabel(partialArgs, rawArgsStr)}`;
        }
        return `🔧 Running ${toolName}...`;
    }

    public static getCompletedToolStatusLabel(toolName: string, args: Record<string, any>, result: any): string {
        const tool = this.getTool(toolName);
        if (tool) {
            return tool.getCompletedStatusLabel(args, result);
        }
        return `Executed ${toolName}`;
    }
}

/**
 * Alias for `HaCanvasAiToolRegistry` for full compatibility with `HAEditor`.
 */
export { HaCanvasAiToolRegistry as HaEditorAiToolRegistry };
