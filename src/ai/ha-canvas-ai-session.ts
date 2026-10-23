import {
    HybridArtEngine,
    type ArtCanvasState
} from "../hybrid-art-engine.js";
import {
    HaEditorConfigManager,
    SharedObjectLibrary
} from "../shared-object-library.js";
import type {
    HaCanvasAiContext,
    HaCanvasAiToolOptions,
    InPlaceEditContextForAi,
    OpenAiToolSchema,
    SharedObjectEditModeForAi
} from "./abstract-ai-tool-base.js";
import { HaCanvasAiToolRegistry } from "./ha-canvas-ai-tool-registry.js";


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
        if (this.activeSharedObjectId && this.activeSharedObjectId !== sharedObjectId) {
            this.engine.setSharedObjectEditing(this.canvasId, this.activeSharedObjectId, false);
        }
        this.editMode = "in_place";
        this.activeSharedObjectId = sharedObjectId;
        this.engine.setSharedObjectEditing(this.canvasId, sharedObjectId, true);
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
        if (this.activeSharedObjectId && this.activeSharedObjectId !== sharedObjectId) {
            this.engine.setSharedObjectEditing(this.canvasId, this.activeSharedObjectId, false);
        }
        this.editMode = "isolated_tab";
        this.activeSharedObjectId = sharedObjectId;
        this.engine.setSharedObjectEditing(this.canvasId, sharedObjectId, true);
        this.inPlaceContext = undefined;
        this.activeLayerId = sharedObj.layers[sharedObj.layers.length - 1]?.id || sharedObj.layers[0]?.id;
        this.notify();
    }

    public exitSharedObjectEdit(): void {
        if (this.activeSharedObjectId) {
            this.engine.setSharedObjectEditing(this.canvasId, this.activeSharedObjectId, false);
        }
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

