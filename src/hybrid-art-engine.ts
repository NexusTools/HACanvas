import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import {
    createZipArchive,
    extractZipArchive,
    escapeXml,
    parseXmlDocument,
    type ParsedXmlNode
} from "./zip-xml-package.js";
import {
    encodeRgbaToPng,
    decodePngToRgba,
    decodeAnyImageToRgba,
    decodeGifFrames,
    encodeFramesToAnimatedGif,
    encodeRgbaToBmp,
    encodeRgbaToTga,
    encodeRgbaToPpm,
    encodeRgbaToFarbfeld,
    encodeRgbaToIco,
    encodeLayersToIco,
    decodeIcoToLayers,
    inspectIcoBuffer,
    encodeToOraBuffer,
    parseOraBuffer,
    parsePsdBuffer,
    parseXcfBuffer,
    parseAiBuffer,
    parsePdfBuffer,
    encodeLayersToPdf,
    buildMinimalTrueTypeFontBuffer,
    hasMeaningfulMetadata,
    buildXmpPacketString,
    parseXmpPacketString,
    buildExifTiffPayload,
    parseExifTiffPayload,
    injectJpegExifAndXmp,
    extractJpegExifMetadata,
    extractPngMetadata,
    type DecodedMultiLayerDocument,
    type EmbeddedFontSpec,
    type GpsMetadataSpec,
    type DocumentMetadataSpec,
    type PdfExportOptions,
    type PdfExportPageInput,
    type IcoIconFormatBpp,
    type IcoLayerEntryInput,
    type IcoDirectoryEntryInfo
} from "./format-importers.js";
import {
    RasterFilterRegistry,
    AbstractRasterFilter,
    JsPresetRasterFilter,
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    GIMP_JS_RUNTIME_HELPERS,
    GIMP_NAMESPACE_HELPERS,
    GEGL_NAMESPACE_HELPERS,
    type GimpFilterPreset,
    type GimpJsInternalDoc,
    type FilterParameterSchema
} from "./filters/abstract-raster-filter.js";
import { RASTER_TRANSITION_CATEGORIES, type GimpFilterCategory } from "./filters/gimp-filter-presets.js";

export {
    RasterFilterRegistry,
    AbstractRasterFilter,
    JsPresetRasterFilter,
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    RASTER_TRANSITION_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    GIMP_JS_RUNTIME_HELPERS,
    GIMP_NAMESPACE_HELPERS,
    GEGL_NAMESPACE_HELPERS,
    type GimpFilterPreset,
    type GimpFilterCategory,
    type GimpJsInternalDoc,
    type FilterParameterSchema
};

export {
    encodeRgbaToPng,
    decodePngToRgba,
    encodeLayersToIco,
    decodeIcoToLayers,
    inspectIcoBuffer,
    parsePdfBuffer,
    encodeLayersToPdf,
    buildMinimalTrueTypeFontBuffer,
    hasMeaningfulMetadata,
    buildXmpPacketString,
    parseXmpPacketString,
    buildExifTiffPayload,
    parseExifTiffPayload,
    injectJpegExifAndXmp,
    extractJpegExifMetadata,
    extractPngMetadata,
    type EmbeddedFontSpec,
    type GpsMetadataSpec,
    type DocumentMetadataSpec,
    type PdfExportOptions,
    type PdfExportPageInput,
    type IcoIconFormatBpp,
    type IcoLayerEntryInput,
    type IcoDirectoryEntryInfo
};

import { BUILT_IN_RASTER_BLEND_PRESETS, type RasterBlendPreset } from "./transitions/index.js";
import {
    type IcoLayerExportOption,
    type ExportCanvasOptions,
    type BlendMode,
    type ArtBlendMode,
    type RasterFilterParams,
    type AttachedFilterSpec,
    type RenderFilterContextOptions,
    type RGBA,
    type BoundingBox,
    type VectorObjectSpec,
    type ArtLayerSpec,
    type SharedObjectCanvasSpec,
    type EasingMode,
    type AnimationKeyframeSpec,
    type AnimatableProperty,
    type AnimationTrackSpec,
    type AnimationTimelineSpec,
    type SelectionMaskSpec,
    type ArtCanvasState,
    type SnapshotOptions,
    type SnapshotResult,
    type CanvasHistoryEntry
} from "./types/canvas-types.js";
import { parseSharedObjectCategory, type ParsedSharedObjectCategory } from "./utils/category-utils.js";
import { evaluateCubicBezierEasing } from "./utils/easing-utils.js";
import { NAMED_COLORS, parseColor, rgbaToHex } from "./utils/color-utils.js";
import { BITMAP_FONT_5X7 } from "./utils/bitmap-font.js";
export {
    BUILT_IN_RASTER_BLEND_PRESETS,
    type RasterBlendPreset,
    type IcoLayerExportOption,
    type ExportCanvasOptions,
    type BlendMode,
    type ArtBlendMode,
    type RasterFilterParams,
    type AttachedFilterSpec,
    type RenderFilterContextOptions,
    type RGBA,
    type BoundingBox,
    type VectorObjectSpec,
    type ArtLayerSpec,
    type SharedObjectCanvasSpec,
    type EasingMode,
    type AnimationKeyframeSpec,
    type AnimatableProperty,
    type AnimationTrackSpec,
    type AnimationTimelineSpec,
    type SelectionMaskSpec,
    type ArtCanvasState,
    type SnapshotOptions,
    type SnapshotResult,
    type CanvasHistoryEntry,
    parseSharedObjectCategory,
    type ParsedSharedObjectCategory,
    evaluateCubicBezierEasing,
    NAMED_COLORS,
    parseColor,
    rgbaToHex,
    BITMAP_FONT_5X7
};
const execFileAsync = promisify(execFile);
/**
 * HybridArtEngine provides a purely tool-based GIMP / Inkscape hybrid raster + vector art backend.
 * - Saving (`saveCanvasPackage`) ALWAYS uses the custom `.docx`-style ZIP+XML format (`.hacanvas`)
 *   where shared objects are their own `objects/<id>.xml` files with their own layers (SVG elements,
 *   graphical pixels, and nested `<ObjectRef>` references) and animations.
 * - Loading (`loadFromFile`) supports ANY format (`.hacanvas`, `.psd`/`.psb`, `.xcf`, `.ora`, `.svg`,
 *   `.png`, `.bmp`, `.gif`, `.tga`, `.pcx`, `.ico`, `.ppm`/`.pgm`/`.pbm`/`.pam`, `.ff`, `.xbm`, `.jpg`, `.webp`, `.tiff`).
 * - Exporting (`exportCanvas`) supports ANY image format or SVG where possible.
 */
export class HybridArtEngine {
    public readonly projectRoot: string;
    public readonly artBaseDir: string;
    private inkscapeBin: string | null = null;
    private gimpBin: string | null = null;

    private readonly undoStacks: Map<string, CanvasHistoryEntry[]> = new Map();
    private readonly redoStacks: Map<string, CanvasHistoryEntry[]> = new Map();
    private readonly lastCommittedState: Map<string, CanvasHistoryEntry> = new Map();
    private readonly activeUndoGroupDepth: Map<string, number> = new Map();
    private readonly pendingActionLabels: Map<string, string> = new Map();
    private readonly decodedVectorImageCache: Map<string, { width: number; height: number; rgba: Buffer }> = new Map();
    private readonly compiledRasterBlendCache: Map<string, Function> = new Map();
    private readonly objectRenderCache: Map<
        string,
        {
            baseSignature: string;
            baseRgba: Buffer;
            width: number;
            height: number;
            filteredSignature?: string;
            filteredRgba?: Buffer;
            cachedAt: number;
            renderCount: number;
            filterEvalCount: number;
        }
    > = new Map();
    private readonly editingObjectsByCanvas: Map<string, Set<string>> = new Map();
    private readonly editingSharedObjectsByCanvas: Map<string, Set<string>> = new Map();
    private isRestoringHistory = false;
    public maxUndoLevels = 50;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.artBaseDir = path.join(projectRoot, ".artifacts", "art");
        this.detectExternalBinaries();
    }

    private detectExternalBinaries(): void {
        const winInkscapeCandidates = [
            "C:\\ProgramData\\chocolatey\\bin\\inkscape.exe",
            "C:\\Program Files\\Inkscape\\bin\\inkscape.exe"
        ];
        for (const cand of winInkscapeCandidates) {
            if (fs.existsSync(cand)) {
                this.inkscapeBin = cand;
                break;
            }
        }
        const winGimpCandidates = [
            "C:\\Program Files\\GIMP 2\\bin\\gimp-console-2.10.exe",
            "C:\\Program Files\\GIMP 3\\bin\\gimp-console-3.0.exe"
        ];
        for (const cand of winGimpCandidates) {
            if (fs.existsSync(cand)) {
                this.gimpBin = cand;
                break;
            }
        }
    }

    private getCanvasDir(canvasId: string): string {
        const safeId = canvasId.replace(/[^a-zA-Z0-9_-]/g, "_");
        return path.join(this.artBaseDir, safeId);
    }

    private getScenePath(canvasId: string): string {
        return path.join(this.getCanvasDir(canvasId), "scene.json");
    }

    private getRasterBufferPath(canvasId: string, layerId: string, frame?: number, sharedObjectId?: string): string {
        const prefix = sharedObjectId ? `shared_${sharedObjectId.replace(/[^a-zA-Z0-9_-]/g, "_")}_` : "";
        const safeLayer = layerId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const suffix = frame !== undefined && frame > 0 ? `_cel_${frame}` : "";
        return path.join(this.getCanvasDir(canvasId), `${prefix}${safeLayer}${suffix}.raw`);
    }

    private getVectorSvgPath(canvasId: string, layerId: string): string {
        const safeLayer = layerId.replace(/[^a-zA-Z0-9_-]/g, "_");
        return path.join(this.getCanvasDir(canvasId), `${safeLayer}.svg`);
    }

    private syncTimelineView(state: ArtCanvasState): void {
        const kfList: Array<{ frame: number; targetId: string }> = [];
        for (const tr of state.animation?.tracks || []) {
            for (const kf of tr.keyframes || []) {
                kfList.push({ frame: kf.frame, targetId: tr.targetId });
            }
        }
        state.timeline = {
            fps: state.animation?.fps ?? 12,
            totalFrames: state.animation?.durationFrames ?? 1,
            keyframes: kfList
        };
    }

    public hasCanvas(canvasId: string): boolean {
        return fs.existsSync(this.getScenePath(canvasId));
    }

    public deleteCanvas(canvasId: string): void {
        const dir = this.getCanvasDir(canvasId);
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        this.undoStacks.delete(canvasId);
        this.redoStacks.delete(canvasId);
        this.lastCommittedState.delete(canvasId);
        this.pendingActionLabels.delete(canvasId);
        this.activeUndoGroupDepth.delete(canvasId);
    }

    public loadCanvas(canvasId: string): ArtCanvasState {
        const scenePath = this.getScenePath(canvasId);
        if (!fs.existsSync(scenePath)) {
            throw new Error(`Canvas '${canvasId}' does not exist. Create it first with art_create_canvas or art_load.`);
        }
        const state = JSON.parse(fs.readFileSync(scenePath, "utf8")) as ArtCanvasState;
        if (!state.sharedObjects) state.sharedObjects = {};
        if (!state.embeddedFonts) state.embeddedFonts = {};
        if (!state.animation) {
            state.animation = { fps: 12, durationFrames: 1, loop: true, tracks: [] };
        }
        this.syncTimelineView(state);
        return state;
    }

    public saveCanvas(state: ArtCanvasState): void;
    public saveCanvas(canvasId: string, filePath: string): { filePath: string; format: "hacanvas"; bytesWritten: number; sharedObjectCount: number; layerCount: number };
    public saveCanvas(
        stateOrCanvasId: ArtCanvasState | string,
        filePath?: string
    ): any {
        if (typeof stateOrCanvasId === "string") {
            return this.saveCanvasPackage(stateOrCanvasId, filePath || `${stateOrCanvasId}.hacanvas`);
        }
        const state = stateOrCanvasId;
        this.syncTimelineView(state);
        const dir = this.getCanvasDir(state.canvasId);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!state.sharedObjects) state.sharedObjects = {};
        if (!state.embeddedFonts) state.embeddedFonts = {};
        if (!state.animation) {
            state.animation = { fps: 12, durationFrames: 1, loop: true, tracks: [] };
        }
        fs.writeFileSync(this.getScenePath(state.canvasId), JSON.stringify(state, null, 2), "utf8");
        for (const layer of state.layers) {
            if (layer.type === "vector") {
                const svg = this.buildLayerSvg(state, layer);
                fs.writeFileSync(this.getVectorSvgPath(state.canvasId, layer.id), svg, "utf8");
            }
        }
        if (!this.isRestoringHistory && (this.activeUndoGroupDepth.get(state.canvasId) || 0) === 0) {
            this.recordSnapshotAfterSave(state.canvasId);
        }
    }

    private loadRasterBuffer(
        state: ArtCanvasState,
        layerId: string,
        width: number = state.width,
        height: number = state.height,
        frame?: number,
        sharedObjectId?: string
    ): Buffer {
        const expectedLen = width * height * 4;
        if (frame !== undefined && frame > 0) {
            const celPath = this.getRasterBufferPath(state.canvasId, layerId, frame, sharedObjectId);
            if (fs.existsSync(celPath)) {
                const buf = fs.readFileSync(celPath);
                if (buf.length === expectedLen) return buf;
            }
        }
        const rawPath = this.getRasterBufferPath(state.canvasId, layerId, undefined, sharedObjectId);
        if (fs.existsSync(rawPath)) {
            const buf = fs.readFileSync(rawPath);
            if (buf.length === expectedLen) return buf;
        }
        const empty = Buffer.alloc(expectedLen, 0);
        fs.writeFileSync(rawPath, empty);
        return empty;
    }

    private saveRasterBuffer(
        state: ArtCanvasState,
        layerId: string,
        buf: Buffer,
        frame?: number,
        sharedObjectId?: string
    ): void {
        const rawPath = this.getRasterBufferPath(state.canvasId, layerId, frame, sharedObjectId);
        fs.writeFileSync(rawPath, buf);
    }

    // ============================================================================
    // 1. Canvas, Layer, & Shared Object (Sub-Canvas) Management
    // ============================================================================

    public createCanvas(
        canvasId: string,
        width: number = 512,
        height: number = 512,
        backgroundColor: string = "#ffffff",
        dpiOrLayers: number | Array<{ id?: string; name: string; type: "vector" | "raster"; visible?: boolean; opacity?: number; blendMode?: BlendMode }> = 96
    ): ArtCanvasState {
        const w = Math.max(1, Math.min(4096, Math.round(width)));
        const h = Math.max(1, Math.min(4096, Math.round(height)));
        const dpi = typeof dpiOrLayers === "number" ? dpiOrLayers : 96;

        const initialLayers: ArtLayerSpec[] = Array.isArray(dpiOrLayers)
            ? dpiOrLayers.map((l, idx) => ({
                  id: l.id || `layer_${idx + 1}`,
                  name: l.name,
                  type: l.type,
                  visible: l.visible ?? true,
                  locked: false,
                  opacity: l.opacity ?? 1.0,
                  blendMode: l.blendMode || "normal",
                  objects: []
              }))
            : [
                  {
                      id: "layer_vector_1",
                      name: "Vector Layer 1",
                      type: "vector",
                      visible: true,
                      locked: false,
                      opacity: 1.0,
                      blendMode: "normal",
                      objects: []
                  },
                  {
                      id: "layer_raster_1",
                      name: "Raster Layer 1",
                      type: "raster",
                      visible: true,
                      locked: false,
                      opacity: 1.0,
                      blendMode: "normal",
                      objects: []
                  }
              ];

        const state: ArtCanvasState = {
            canvasId,
            width: w,
            height: h,
            dpi,
            backgroundColor,
            selection: { mode: "none", inverted: false, x: 0, y: 0, width: w, height: h },
            layers: initialLayers,
            sharedObjects: {},
            embeddedFonts: {},
            animation: {
                fps: 12,
                durationFrames: 1,
                loop: true,
                tracks: []
            },
            timeline: {
                fps: 12,
                totalFrames: 1,
                keyframes: []
            }
        };

        const dir = this.getCanvasDir(canvasId);
        fs.mkdirSync(dir, { recursive: true });
        for (const layer of initialLayers) {
            if (layer.type === "raster") {
                this.saveRasterBuffer(state, layer.id, Buffer.alloc(w * h * 4, 0));
            }
        }
        this.saveCanvas(state);
        return state;
    }

    public createLayer(
        canvasId: string,
        name: string,
        type: "vector" | "raster",
        options: { id?: string; index?: number; opacity?: number; blendMode?: BlendMode; sharedObjectId?: string } = {}
    ): ArtLayerSpec {
        const state = this.loadCanvas(canvasId);
        const targetContainer = options.sharedObjectId
            ? this.getSharedObjectOrThrow(state, options.sharedObjectId)
            : state;

        const layerId = options.id || `layer_${type}_${targetContainer.layers.length + 1}_${Date.now() % 10000}`;
        const layer: ArtLayerSpec = {
            id: layerId,
            name,
            type,
            visible: true,
            locked: false,
            opacity: options.opacity !== undefined ? Math.max(0, Math.min(1, options.opacity)) : 1.0,
            blendMode: options.blendMode || "normal",
            objects: []
        };

        if (type === "raster") {
            this.saveRasterBuffer(
                state,
                layerId,
                Buffer.alloc(targetContainer.width * targetContainer.height * 4, 0),
                undefined,
                options.sharedObjectId
            );
        }

        if (options.index !== undefined && options.index >= 0 && options.index <= targetContainer.layers.length) {
            targetContainer.layers.splice(options.index, 0, layer);
        } else {
            targetContainer.layers.push(layer);
        }

        this.setPendingUndoLabel(canvasId, `Add Layer (${name})`);
        this.saveCanvas(state);
        return layer;
    }

    public modifyLayer(
        canvasId: string,
        layerId: string,
        updates: { name?: string; visible?: boolean; locked?: boolean; opacity?: number; blendMode?: BlendMode; zOrder?: number; sharedObjectId?: string }
    ): ArtLayerSpec {
        const state = this.loadCanvas(canvasId);
        const container = updates.sharedObjectId ? this.getSharedObjectOrThrow(state, updates.sharedObjectId) : state;
        const idx = container.layers.findIndex(l => l.id === layerId || l.name === layerId);
        if (idx === -1) {
            throw new Error(`Layer '${layerId}' not found.`);
        }

        const layer = container.layers[idx];
        if (updates.name !== undefined) layer.name = updates.name;
        if (updates.visible !== undefined) layer.visible = Boolean(updates.visible);
        if (updates.locked !== undefined) layer.locked = Boolean(updates.locked);
        if (updates.opacity !== undefined) layer.opacity = Math.max(0, Math.min(1, Number(updates.opacity)));
        if (updates.blendMode !== undefined) layer.blendMode = updates.blendMode;

        if (updates.zOrder !== undefined && updates.zOrder !== idx) {
            container.layers.splice(idx, 1);
            const targetIdx = Math.max(0, Math.min(container.layers.length, updates.zOrder));
            container.layers.splice(targetIdx, 0, layer);
        }

        this.setPendingUndoLabel(canvasId, `Modify Layer (${layer.name})`);
        this.saveCanvas(state);
        return layer;
    }

    public deleteLayer(canvasId: string, layerId: string, sharedObjectId?: string): void {
        const state = this.loadCanvas(canvasId);
        const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
        const idx = container.layers.findIndex(l => l.id === layerId || l.name === layerId);
        if (idx === -1) {
            throw new Error(`Layer '${layerId}' not found.`);
        }
        const [removed] = container.layers.splice(idx, 1);
        if (removed.type === "raster") {
            const rawPath = this.getRasterBufferPath(canvasId, removed.id, undefined, sharedObjectId);
            if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
        } else if (!sharedObjectId) {
            const svgPath = this.getVectorSvgPath(canvasId, removed.id);
            if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
        }
        this.setPendingUndoLabel(canvasId, `Delete Layer (${removed.name})`);
        this.saveCanvas(state);
    }

    public manageLayer(
        canvasId: string,
        action: "add" | "remove" | "duplicate" | "reorder" | "set_visibility" | "set_opacity" | "set_blend_mode" | "clear",
        opts: {
            layerId?: string;
            layerName?: string;
            layerType?: "vector" | "raster";
            visible?: boolean;
            opacity?: number;
            blendMode?: BlendMode;
            targetIndex?: number;
            sharedObjectId?: string;
        } = {}
    ): any {
        if (action === "add") {
            return this.createLayer(
                canvasId,
                opts.layerName || "New Layer",
                opts.layerType || "vector",
                { opacity: opts.opacity, blendMode: opts.blendMode, sharedObjectId: opts.sharedObjectId }
            );
        }
        if (action === "remove" && opts.layerId) {
            this.deleteLayer(canvasId, opts.layerId, opts.sharedObjectId);
            return;
        }
        if (action === "set_visibility" && opts.layerId) {
            return this.modifyLayer(canvasId, opts.layerId, {
                visible: opts.visible,
                sharedObjectId: opts.sharedObjectId
            });
        }
        if (action === "set_opacity" && opts.layerId) {
            return this.modifyLayer(canvasId, opts.layerId, {
                opacity: opts.opacity,
                sharedObjectId: opts.sharedObjectId
            });
        }
        if (action === "set_blend_mode" && opts.layerId) {
            return this.modifyLayer(canvasId, opts.layerId, {
                blendMode: opts.blendMode,
                sharedObjectId: opts.sharedObjectId
            });
        }
        if (action === "reorder" && opts.layerId) {
            return this.modifyLayer(canvasId, opts.layerId, {
                zOrder: opts.targetIndex,
                sharedObjectId: opts.sharedObjectId
            });
        }
        const state = this.loadCanvas(canvasId);
        const container = opts.sharedObjectId ? this.getSharedObjectOrThrow(state, opts.sharedObjectId) : state;
        const layer = container.layers.find(l => l.id === opts.layerId);
        if (!layer) return;

        if (action === "clear") {
            if (layer.type === "vector") {
                layer.objects = [];
            } else {
                this.saveRasterBuffer(
                    state,
                    layer.id,
                    Buffer.alloc(container.width * container.height * 4, 0),
                    undefined,
                    opts.sharedObjectId
                );
            }
            this.saveCanvas(state);
            return layer;
        }
        if (action === "duplicate") {
            const copy = this.createLayer(canvasId, `${layer.name} Copy`, layer.type, {
                opacity: layer.opacity,
                blendMode: layer.blendMode,
                sharedObjectId: opts.sharedObjectId
            });
            const reloaded = this.loadCanvas(canvasId);
            const targetCont = opts.sharedObjectId ? this.getSharedObjectOrThrow(reloaded, opts.sharedObjectId) : reloaded;
            const createdLayer = targetCont.layers.find(l => l.id === copy.id);
            if (createdLayer) {
                if (layer.type === "vector") {
                    createdLayer.objects = JSON.parse(JSON.stringify(layer.objects));
                } else {
                    const buf = this.loadRasterBuffer(reloaded, layer.id, targetCont.width, targetCont.height, undefined, opts.sharedObjectId);
                    this.saveRasterBuffer(reloaded, createdLayer.id, Buffer.from(buf), undefined, opts.sharedObjectId);
                }
                this.saveCanvas(reloaded);
            }
            return createdLayer;
        }
    }

    public countSharedObjectReferences(state: ArtCanvasState, sharedObjectId: string): number {
        let count = 0;
        for (const l of state.layers) {
            for (const o of l.objects) {
                if (o.kind === "ref" && o.refId === sharedObjectId) count++;
            }
        }
        for (const s of Object.values(state.sharedObjects)) {
            for (const l of s.layers) {
                for (const o of l.objects) {
                    if (o.kind === "ref" && o.refId === sharedObjectId) count++;
                }
            }
        }
        return count;
    }

    /**
     * Creates a reusable Shared Object (an embeddable sub-canvas stored as `objects/<id>.xml` in `.hacanvas`)
     * with its own width, height, category, and vector + raster layers.
     */
    public createSharedObject(
        canvasId: string,
        objectIdOrSpec:
            | string
            | { id?: string; name: string; category?: string; width?: number; height?: number },
        nameOrLayers?:
            | string
            | Array<{ id?: string; name: string; type: "vector" | "raster"; visible?: boolean; opacity?: number; blendMode?: BlendMode }>,
        width: number = 128,
        height: number = 128,
        category?: string
    ): SharedObjectCanvasSpec {
        const state = this.loadCanvas(canvasId);
        let objectId: string;
        let rawName: string;
        let rawCat: string | undefined;
        let w: number;
        let h: number;
        let customLayers: Array<{ id?: string; name: string; type: "vector" | "raster"; visible?: boolean; opacity?: number; blendMode?: BlendMode }> | undefined;

        if (typeof objectIdOrSpec === "object") {
            objectId = objectIdOrSpec.id || `shared_${Date.now()}_${Object.keys(state.sharedObjects).length + 1}`;
            rawName = objectIdOrSpec.name || objectId;
            rawCat = objectIdOrSpec.category;
            w = Math.max(1, Math.min(4096, Math.round(objectIdOrSpec.width ?? 128)));
            h = Math.max(1, Math.min(4096, Math.round(objectIdOrSpec.height ?? 128)));
            if (Array.isArray(nameOrLayers)) {
                customLayers = nameOrLayers;
            }
        } else {
            objectId = String(objectIdOrSpec);
            rawName = typeof nameOrLayers === "string" ? nameOrLayers : objectId;
            rawCat = category;
            w = Math.max(1, Math.min(4096, Math.round(width)));
            h = Math.max(1, Math.min(4096, Math.round(height)));
        }

        const parsedCat = parseSharedObjectCategory(rawName, rawCat);
        const layers: ArtLayerSpec[] = customLayers
            ? customLayers.map((l, idx) => ({
                  id: l.id || `${objectId}_${l.type}_${idx + 1}`,
                  name: l.name,
                  type: l.type,
                  visible: l.visible ?? true,
                  locked: false,
                  opacity: l.opacity ?? 1.0,
                  blendMode: l.blendMode || "normal",
                  objects: []
              }))
            : [
                  {
                      id: `${objectId}_vector_1`,
                      name: `${parsedCat.displayName} Vector Layer`,
                      type: "vector",
                      visible: true,
                      locked: false,
                      opacity: 1.0,
                      blendMode: "normal",
                      objects: []
                  },
                  {
                      id: `${objectId}_raster_1`,
                      name: `${parsedCat.displayName} Raster Layer`,
                      type: "raster",
                      visible: true,
                      locked: false,
                      opacity: 1.0,
                      blendMode: "normal",
                      objects: []
                  }
              ];

        const sharedObj: SharedObjectCanvasSpec = {
            id: objectId,
            name: parsedCat.fullPath,
            category: parsedCat.category,
            width: w,
            height: h,
            layers
        };

        state.sharedObjects[objectId] = sharedObj;
        for (const l of layers) {
            if (l.type === "raster") {
                this.saveRasterBuffer(state, l.id, Buffer.alloc(w * h * 4, 0), undefined, objectId);
            }
        }
        this.saveCanvas(state);
        return sharedObj;
    }

    /**
     * Renames and/or recategorizes a Shared Object (supporting slash-delimited category paths like "UI/Icons/Star").
     */
    public renameSharedObject(
        canvasId: string,
        objectId: string,
        newName: string,
        newCategory?: string
    ): SharedObjectCanvasSpec {
        const state = this.loadCanvas(canvasId);
        const sharedObj = this.getSharedObjectOrThrow(state, objectId);
        const parsed = parseSharedObjectCategory(newName, newCategory);
        sharedObj.name = parsed.fullPath;
        sharedObj.category = parsed.category;
        this.saveCanvas(state);
        return sharedObj;
    }

    /**
     * Duplicates an existing Shared Object (including all its vector and raster layers) under a new ID.
     */
    public duplicateSharedObject(
        canvasId: string,
        sourceObjectId: string,
        newObjectId: string = `${sourceObjectId}_copy_${Date.now() % 10000}`,
        newName?: string,
        newCategory?: string
    ): SharedObjectCanvasSpec {
        const state = this.loadCanvas(canvasId);
        const src = this.getSharedObjectOrThrow(state, sourceObjectId);
        const parsed = parseSharedObjectCategory(newName || `${src.name}_copy`, newCategory ?? src.category);

        const clonedLayers: ArtLayerSpec[] = src.layers.map((l, idx) => {
            const newLayerId = `${newObjectId}_${l.type}_${idx + 1}`;
            if (l.type === "raster") {
                const buf = this.loadRasterBuffer(state, l.id, src.width, src.height, undefined, sourceObjectId);
                this.saveRasterBuffer(state, newLayerId, Buffer.from(buf), undefined, newObjectId);
            }
            return {
                ...JSON.parse(JSON.stringify(l)),
                id: newLayerId
            };
        });

        const copySpec: SharedObjectCanvasSpec = {
            id: newObjectId,
            name: parsed.fullPath,
            category: parsed.category,
            width: src.width,
            height: src.height,
            layers: clonedLayers
        };
        state.sharedObjects[newObjectId] = copySpec;
        this.saveCanvas(state);
        return copySpec;
    }

    /**
     * Deletes a Shared Object from the canvas and removes any `<ObjectRef>` instances pointing to it.
     */
    public deleteSharedObject(canvasId: string, objectId: string): void {
        const state = this.loadCanvas(canvasId);
        const sharedObj = this.getSharedObjectOrThrow(state, objectId);
        for (const l of sharedObj.layers) {
            if (l.type === "raster") {
                const rawPath = this.getRasterBufferPath(canvasId, l.id, undefined, objectId);
                if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
            }
        }
        delete state.sharedObjects[objectId];
        for (const layer of state.layers) {
            layer.objects = layer.objects.filter(o => !(o.kind === "ref" && o.refId === objectId));
        }
        for (const other of Object.values(state.sharedObjects)) {
            for (const layer of other.layers) {
                layer.objects = layer.objects.filter(o => !(o.kind === "ref" && o.refId === objectId));
            }
        }
        this.saveCanvas(state);
    }

    /**
     * Deletes a vector object or `<ObjectRef>` instance from the canvas or a shared object.
     */
    public deleteObject(canvasId: string, objectId: string): void {
        const state = this.loadCanvas(canvasId);
        const allLayers = [
            ...state.layers,
            ...Object.values(state.sharedObjects).flatMap(s => s.layers)
        ];
        for (const layer of allLayers) {
            const idx = layer.objects.findIndex(o => o.id === objectId);
            if (idx !== -1) {
                layer.objects.splice(idx, 1);
                this.saveCanvas(state);
                return;
            }
        }
        throw new Error(`Object '${objectId}' not found on canvas '${canvasId}'.`);
    }

    /**
     * Renders a Shared Object to a PNG base64 string for live UI thumbnails and previews.
     */
    public renderSharedObjectThumbnailBase64(canvasId: string, objectId: string, frame = 0): string {
        const state = this.loadCanvas(canvasId);
        const shared = this.getSharedObjectOrThrow(state, objectId);
        const rgba = this.renderSharedObjectToBuffer(state, shared, frame, new Set());
        return encodeRgbaToPng(shared.width, shared.height, rgba).toString("base64");
    }

    /**
     * Places an `<ObjectRef>` instance referencing a Shared Object (`refId`) onto either a main canvas vector layer
     * or inside another Shared Object's vector layer (allowing canvases to be embedded inside canvases).
     */
    public instantiateObjectRef(
        canvasId: string,
        refId: string,
        options: {
            id?: string;
            layerId?: string;
            parentSharedObjectId?: string;
            targetSharedObjectId?: string;
            x?: number;
            y?: number;
            scaleX?: number;
            scaleY?: number;
            rotation?: number;
            opacity?: number;
            fillOverride?: string;
            strokeOverride?: string;
        } = {}
    ): VectorObjectSpec {
        const state = this.loadCanvas(canvasId);
        const targetShared = state.sharedObjects[refId];
        if (!targetShared) {
            throw new Error(`Shared object '${refId}' does not exist on canvas '${canvasId}'.`);
        }

        const parentId = options.parentSharedObjectId || options.targetSharedObjectId;
        if (parentId) {
            if (parentId === refId || this.doesSharedObjectReference(state, refId, parentId, new Set())) {
                throw new Error(`Circular object reference detected: '${parentId}' cannot reference '${refId}'.`);
            }
        }

        const layer = this.findLayer(state, options.layerId, "vector", parentId);
        const instanceId = options.id || `ref_${refId}_${layer.objects.length + 1}_${Date.now() % 10000}`;

        const refObj: VectorObjectSpec = {
            id: instanceId,
            kind: "ref",
            refId,
            x: options.x ?? 0,
            y: options.y ?? 0,
            width: targetShared.width,
            height: targetShared.height,
            scaleX: options.scaleX ?? 1.0,
            scaleY: options.scaleY ?? 1.0,
            rotation: options.rotation ?? 0,
            opacity: options.opacity ?? 1.0,
            fillOverride: options.fillOverride,
            strokeOverride: options.strokeOverride
        };

        layer.objects.push(refObj);
        this.saveCanvas(state);
        return refObj;
    }

    private doesSharedObjectReference(
        state: ArtCanvasState,
        sourceId: string,
        targetId: string,
        visited: Set<string>
    ): boolean {
        if (sourceId === targetId) return true;
        if (visited.has(sourceId)) return false;
        visited.add(sourceId);
        const shared = state.sharedObjects[sourceId];
        if (!shared) return false;
        for (const layer of shared.layers) {
            for (const obj of layer.objects) {
                if (obj.kind === "ref" && obj.refId) {
                    if (obj.refId === targetId || this.doesSharedObjectReference(state, obj.refId, targetId, visited)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private getSharedObjectOrThrow(state: ArtCanvasState, sharedObjectId: string): SharedObjectCanvasSpec {
        const found = state.sharedObjects[sharedObjectId];
        if (!found) {
            throw new Error(`Shared object '${sharedObjectId}' not found on canvas '${state.canvasId}'.`);
        }
        return found;
    }

    private findLayer(
        state: ArtCanvasState,
        layerId: string | undefined,
        expectedType: "vector" | "raster",
        sharedObjectId?: string
    ): ArtLayerSpec {
        const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
        if (layerId) {
            const found = container.layers.find(l => l.id === layerId || l.name === layerId);
            if (!found) {
                throw new Error(`Layer '${layerId}' not found.`);
            }
            if (found.type !== expectedType) {
                throw new Error(`Layer '${found.id}' is a ${found.type} layer, expected ${expectedType}.`);
            }
            if (found.locked) {
                throw new Error(`Layer '${found.id}' is locked.`);
            }
            return found;
        }
        const fallback = container.layers.find(l => l.type === expectedType && !l.locked);
        if (!fallback) {
            throw new Error(`No unlocked ${expectedType} layer found.`);
        }
        return fallback;
    }

    // ============================================================================
    // 2. Animation Timeline, Keyframes, Curves, & Raster Cels
    // ============================================================================

    public getTimelineForContainer(state: ArtCanvasState, sharedObjectId?: string): AnimationTimelineSpec {
        if (sharedObjectId) {
            const shared = this.getSharedObjectOrThrow(state, sharedObjectId);
            if (!shared.animation) {
                shared.animation = {
                    fps: state.animation?.fps || 12,
                    durationFrames: 1,
                    loop: true,
                    loopBackToFrame: 0,
                    tracks: []
                };
            }
            return shared.animation;
        }
        if (!state.animation) {
            state.animation = { fps: 12, durationFrames: 1, loop: true, loopBackToFrame: 0, tracks: [] };
        }
        return state.animation;
    }

    public configureAnimation(
        canvasId: string,
        opts: {
            fps?: number;
            durationFrames?: number;
            loop?: boolean;
            loopBackToFrame?: number;
            sharedObjectId?: string;
        }
    ): AnimationTimelineSpec {
        const state = this.loadCanvas(canvasId);
        const timeline = this.getTimelineForContainer(state, opts.sharedObjectId);
        if (opts.fps !== undefined) timeline.fps = Math.max(1, Math.min(120, Math.round(opts.fps)));
        if (opts.durationFrames !== undefined) timeline.durationFrames = Math.max(1, Math.round(opts.durationFrames));
        if (opts.loop !== undefined) timeline.loop = Boolean(opts.loop);
        if (opts.loopBackToFrame !== undefined) {
            timeline.loopBackToFrame = Math.max(0, Math.min(Math.max(0, timeline.durationFrames - 1), Math.round(opts.loopBackToFrame)));
        }
        this.saveCanvas(state);
        return timeline;
    }

    public configureTimeline(
        canvasId: string,
        opts: {
            fps?: number;
            totalFrames?: number;
            durationFrames?: number;
            loop?: boolean;
            loopBackToFrame?: number;
            sharedObjectId?: string;
        }
    ): AnimationTimelineSpec {
        return this.configureAnimation(canvasId, {
            fps: opts.fps,
            durationFrames: opts.totalFrames ?? opts.durationFrames,
            loop: opts.loop,
            loopBackToFrame: opts.loopBackToFrame,
            sharedObjectId: opts.sharedObjectId
        });
    }

    public setKeyframe(
        canvasId: string,
        targetIdOrSpec:
            | string
            | {
                  targetId: string;
                  frame: number;
                  endFrame?: number;
                  easing?: string;
                  curveControlPoints?: [number, number, number, number];
                  curvePresetId?: string;
                  sharedObjectId?: string;
                  properties: Record<string, any>;
              },
        property?: AnimationTrackSpec["property"],
        frame?: number,
        value?: number | string | { x: number; y: number }[],
        easing: EasingMode = "linear",
        extra?: {
            endFrame?: number;
            curveControlPoints?: [number, number, number, number];
            curvePresetId?: string;
            sharedObjectId?: string;
        }
    ): AnimationTrackSpec {
        if (typeof targetIdOrSpec === "object") {
            let lastTrack: AnimationTrackSpec | undefined;
            const normEasing = (
                targetIdOrSpec.easing === "easeInOut"
                    ? "ease_in_out"
                    : targetIdOrSpec.easing === "easeIn"
                      ? "ease_in"
                      : targetIdOrSpec.easing === "easeOut"
                        ? "ease_out"
                        : targetIdOrSpec.easing || "linear"
            ) as EasingMode;
            for (const [propKey, propVal] of Object.entries(targetIdOrSpec.properties)) {
                if (propVal === undefined) continue;
                lastTrack = this.setKeyframe(
                    canvasId,
                    targetIdOrSpec.targetId,
                    propKey as AnimationTrackSpec["property"],
                    targetIdOrSpec.frame,
                    propVal,
                    normEasing,
                    {
                        endFrame: targetIdOrSpec.endFrame,
                        curveControlPoints: targetIdOrSpec.curveControlPoints,
                        curvePresetId: targetIdOrSpec.curvePresetId,
                        sharedObjectId: targetIdOrSpec.sharedObjectId
                    }
                );
            }
            return lastTrack!;
        }
        const targetId = String(targetIdOrSpec);
        const prop = property!;
        const frm = Math.max(0, Math.round(frame ?? 0));
        const val = value ?? 0;
        const state = this.loadCanvas(canvasId);
        const timeline = this.getTimelineForContainer(state, extra?.sharedObjectId);
        let track = timeline.tracks.find(t => t.targetId === targetId && t.property === prop);
        if (!track) {
            track = {
                id: `track_${targetId}_${prop}`,
                targetId,
                property: prop,
                keyframes: []
            };
            timeline.tracks.push(track);
        }

        const kfEntry: AnimationKeyframeSpec = {
            frame: frm,
            value: typeof val === "object" ? JSON.parse(JSON.stringify(val)) : val,
            easing,
            ...(extra?.endFrame !== undefined ? { endFrame: Math.max(frm, Math.round(extra.endFrame)) } : {}),
            ...(extra?.curveControlPoints ? { curveControlPoints: [...extra.curveControlPoints] as [number, number, number, number] } : {}),
            ...(extra?.curvePresetId ? { curvePresetId: extra.curvePresetId } : {})
        };

        const existingIdx = track.keyframes.findIndex(k => k.frame === frm);
        if (existingIdx !== -1) {
            track.keyframes[existingIdx] = {
                ...track.keyframes[existingIdx],
                ...kfEntry
            };
        } else {
            track.keyframes.push(kfEntry);
            track.keyframes.sort((a, b) => a.frame - b.frame);
        }

        const maxRequiredFrame = Math.max(frm, kfEntry.endFrame ?? frm);
        if (maxRequiredFrame + 1 > timeline.durationFrames) {
            timeline.durationFrames = maxRequiredFrame + 1;
        }

        this.saveCanvas(state);
        return track;
    }

    /**
     * Updates a keyframe's start frame, end frame, easing mode, custom cubic-Bezier curve control points,
     * or raster keyframe blending properties.
     */
    public updateKeyframeSegment(
        canvasId: string,
        opts: {
            targetId: string;
            frame: number;
            newFrame?: number;
            endFrame?: number | null;
            easing?: EasingMode;
            curveControlPoints?: [number, number, number, number];
            curvePresetId?: string;
            rasterBlendPresetId?: string;
            rasterBlendCustomCode?: string | null;
            rasterBlendTargetLayerId?: string | null;
            rasterBlendTargetFrame?: number | null;
            property?: AnimationTrackSpec["property"];
            sharedObjectId?: string;
        }
    ): number {
        const state = this.loadCanvas(canvasId);
        const container = opts.sharedObjectId ? this.getSharedObjectOrThrow(state, opts.sharedObjectId) : state;
        const timeline = this.getTimelineForContainer(state, opts.sharedObjectId);
        let updatedCount = 0;

        for (const tr of timeline.tracks) {
            if (tr.targetId !== opts.targetId) continue;
            if (opts.property && tr.property !== opts.property) continue;
            const kf = tr.keyframes.find(k => k.frame === opts.frame);
            if (!kf) continue;

            if (opts.newFrame !== undefined && opts.newFrame >= 0) {
                const oldF = kf.frame;
                const newF = Math.round(opts.newFrame);
                if (tr.property === "rasterCel" && oldF !== newF && oldF > 0 && newF > 0) {
                    const layer = container.layers.find(l => l.id === opts.targetId && l.type === "raster");
                    if (layer) {
                        const oldPath = this.getRasterBufferPath(state.canvasId, layer.id, oldF, opts.sharedObjectId);
                        const newPath = this.getRasterBufferPath(state.canvasId, layer.id, newF, opts.sharedObjectId);
                        if (fs.existsSync(oldPath)) {
                            fs.copyFileSync(oldPath, newPath);
                            try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
                        }
                        layer.celFrames = (layer.celFrames || []).filter(f => f !== oldF);
                        if (!layer.celFrames.includes(newF)) layer.celFrames.push(newF);
                        layer.celFrames.sort((a, b) => a - b);
                    }
                }
                kf.frame = newF;
            }
            if (opts.endFrame === null) {
                delete kf.endFrame;
            } else if (opts.endFrame !== undefined) {
                kf.endFrame = Math.max(kf.frame, Math.round(opts.endFrame));
            }
            if (opts.easing !== undefined) {
                kf.easing = opts.easing;
            }
            if (opts.curveControlPoints !== undefined) {
                kf.curveControlPoints = [...opts.curveControlPoints] as [number, number, number, number];
            }
            if (opts.curvePresetId !== undefined) {
                kf.curvePresetId = opts.curvePresetId;
            }
            if (opts.rasterBlendPresetId !== undefined) {
                kf.rasterBlendPresetId = opts.rasterBlendPresetId;
            }
            if (opts.rasterBlendCustomCode === null) {
                delete kf.rasterBlendCustomCode;
            } else if (opts.rasterBlendCustomCode !== undefined) {
                kf.rasterBlendCustomCode = opts.rasterBlendCustomCode;
            }
            if (opts.rasterBlendTargetLayerId === null) {
                delete kf.rasterBlendTargetLayerId;
            } else if (opts.rasterBlendTargetLayerId !== undefined) {
                kf.rasterBlendTargetLayerId = opts.rasterBlendTargetLayerId;
            }
            if (opts.rasterBlendTargetFrame === null) {
                delete kf.rasterBlendTargetFrame;
            } else if (opts.rasterBlendTargetFrame !== undefined) {
                kf.rasterBlendTargetFrame = Math.max(0, Math.round(opts.rasterBlendTargetFrame));
            }
            tr.keyframes.sort((a, b) => a.frame - b.frame);
            const maxF = Math.max(kf.frame, kf.endFrame ?? kf.frame);
            if (maxF + 1 > timeline.durationFrames) {
                timeline.durationFrames = maxF + 1;
            }
            updatedCount++;
        }

        if (updatedCount > 0) {
            this.setPendingUndoLabel(canvasId, `Update Keyframe Curve (${opts.targetId})`);
            this.saveCanvas(state);
        }
        return updatedCount;
    }

    /**
     * Removes keyframe(s) for `targetId` at `frame` on either the Main Canvas or a Shared Object timeline.
     */
    public removeKeyframe(
        canvasId: string,
        opts: {
            targetId: string;
            frame: number;
            property?: AnimationTrackSpec["property"];
            sharedObjectId?: string;
        }
    ): number {
        const state = this.loadCanvas(canvasId);
        const container = opts.sharedObjectId ? this.getSharedObjectOrThrow(state, opts.sharedObjectId) : state;
        const timeline = this.getTimelineForContainer(state, opts.sharedObjectId);
        let removed = 0;
        for (const tr of timeline.tracks) {
            if (tr.targetId !== opts.targetId) continue;
            if (opts.property && tr.property !== opts.property) continue;
            const before = tr.keyframes.length;
            tr.keyframes = tr.keyframes.filter(k => k.frame !== opts.frame);
            const diff = before - tr.keyframes.length;
            if (diff > 0 && tr.property === "rasterCel" && opts.frame > 0) {
                const layer = container.layers.find(l => l.id === opts.targetId && l.type === "raster");
                if (layer && layer.celFrames) {
                    layer.celFrames = layer.celFrames.filter(f => f !== opts.frame);
                }
            }
            removed += diff;
        }
        timeline.tracks = timeline.tracks.filter(t => t.keyframes.length > 0);
        if (removed > 0) {
            this.setPendingUndoLabel(canvasId, `Remove Keyframe (${opts.targetId} @ F${opts.frame})`);
            this.saveCanvas(state);
        }
        return removed;
    }

    /**
     * Lists all available Raster Keyframe Blending presets (built-in + custom presets saved in the canvas timeline),
     * including the folder `category` and full human-readable JavaScript source code (`code`) for every preset.
     */
    public listRasterBlendPresets(canvasId?: string, sharedObjectId?: string, category?: string): RasterBlendPreset[] {
        const list: RasterBlendPreset[] = BUILT_IN_RASTER_BLEND_PRESETS.map(p => ({
            ...p,
            category: p.category || "Dissolve & Fade",
            builtIn: true
        }));
        if (canvasId) {
            try {
                const state = this.loadCanvas(canvasId);
                const customMain = state.animation?.customRasterBlendPresets || [];
                const customShared = sharedObjectId
                    ? state.sharedObjects?.[sharedObjectId]?.animation?.customRasterBlendPresets || []
                    : [];
                for (const cp of [...customMain, ...customShared]) {
                    if (!list.some(item => item.id === cp.id)) {
                        list.push({
                            ...cp,
                            category: cp.category || "Custom",
                            builtIn: false
                        });
                    }
                }
            } catch {
                // Canvas may not exist yet
            }
        }
        if (category && category.trim()) {
            const targetCat = category.trim().toLowerCase();
            return list.filter(p => (p.category || "Custom").toLowerCase() === targetCat);
        }
        return list;
    }

    private static readonly RASTER_BLEND_HELPERS = GIMP_JS_RUNTIME_HELPERS;

    /**
     * Validates a custom JavaScript raster blending script by compiling it and executing a dry run on a 2x2 RGBA buffer.
     */
    public validateRasterBlendScript(code: string): { valid: boolean; error?: string } {
        if (!code || !code.trim()) {
            return { valid: false, error: "Raster blend JavaScript code cannot be empty." };
        }
        try {
            const fn = new Function(
                "bufA",
                "bufB",
                "outBuf",
                "width",
                "height",
                "t",
                "rawT",
                "helpers",
                "gimp",
                "gegl",
                code
            );
            const testA = new Uint8Array(16);
            const testB = new Uint8Array(16);
            const testOut = new Uint8Array(16);
            for (let i = 0; i < 16; i += 4) {
                testA[i] = 255; testA[i + 3] = 255;
                testB[i + 2] = 255; testB[i + 3] = 255;
            }
            fn(
                testA,
                testB,
                testOut,
                2,
                2,
                0.5,
                0.5,
                GIMP_JS_RUNTIME_HELPERS,
                GIMP_NAMESPACE_HELPERS,
                GEGL_NAMESPACE_HELPERS
            );
            return { valid: true };
        } catch (err: any) {
            return { valid: false, error: err?.message || String(err) };
        }
    }

    /**
     * Executes a raster keyframe blending JavaScript snippet to populate `outBuf` from `bufA` and `bufB` at progress `t`.
     */
    public evaluateRasterBlendScript(
        code: string,
        bufA: Uint8Array,
        bufB: Uint8Array,
        outBuf: Uint8Array,
        width: number,
        height: number,
        t: number,
        rawT: number
    ): void {
        try {
            let fn = this.compiledRasterBlendCache.get(code);
            if (!fn) {
                fn = new Function(
                    "bufA",
                    "bufB",
                    "outBuf",
                    "width",
                    "height",
                    "t",
                    "rawT",
                    "helpers",
                    "gimp",
                    "gegl",
                    code
                );
                if (this.compiledRasterBlendCache.size > 64) {
                    const firstKey = this.compiledRasterBlendCache.keys().next().value;
                    if (firstKey) this.compiledRasterBlendCache.delete(firstKey);
                }
                this.compiledRasterBlendCache.set(code, fn);
            }
            fn(
                bufA,
                bufB,
                outBuf,
                width,
                height,
                t,
                rawT,
                GIMP_JS_RUNTIME_HELPERS,
                GIMP_NAMESPACE_HELPERS,
                GEGL_NAMESPACE_HELPERS
            );
        } catch {
            // Fallback to linear crossfade if custom script throws at runtime
            const k = GIMP_JS_RUNTIME_HELPERS.clamp01(t);
            const inv = 1 - k;
            const total = width * height * 4;
            for (let i = 0; i < total; i += 4) {
                outBuf[i]     = Math.round(bufA[i]     * inv + bufB[i]     * k);
                outBuf[i + 1] = Math.round(bufA[i + 1] * inv + bufB[i + 1] * k);
                outBuf[i + 2] = Math.round(bufA[i + 2] * inv + bufB[i + 2] * k);
                outBuf[i + 3] = Math.round(bufA[i + 3] * inv + bufB[i + 3] * k);
            }
        }
    }

    /**
     * Saves a custom JavaScript raster keyframe blending preset into the canvas timeline so it persists in `.hacanvas`.
     */
    public saveCustomRasterBlendPreset(
        canvasId: string,
        preset: { id?: string; name: string; category?: string; description?: string; code: string },
        sharedObjectId?: string
    ): RasterBlendPreset {
        const validation = this.validateRasterBlendScript(preset.code);
        if (!validation.valid) {
            throw new Error(`Invalid raster blend JavaScript: ${validation.error}`);
        }
        const state = this.loadCanvas(canvasId);
        const timeline = this.getTimelineForContainer(state, sharedObjectId);
        const parsedCat = parseSharedObjectCategory(preset.name || "Custom Blend Script", preset.category || "Custom");
        const cleanName = parsedCat.displayName;
        const cleanCat = preset.category ? preset.category.trim() : (parsedCat.category !== "Uncategorized" ? parsedCat.category : "Custom");
        const id = preset.id && !BUILT_IN_RASTER_BLEND_PRESETS.some(b => b.id === preset.id)
            ? preset.id
            : `rblend_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now() % 10000}`;

        const entry: RasterBlendPreset = {
            id,
            name: cleanName,
            category: cleanCat || "Custom",
            description: (preset.description || "Custom JavaScript raster keyframe blending preset.").trim(),
            code: preset.code,
            builtIn: false
        };

        const upsertInList = (anim: AnimationTimelineSpec) => {
            if (!anim.customRasterBlendPresets) anim.customRasterBlendPresets = [];
            const idx = anim.customRasterBlendPresets.findIndex(
                p => p.id === id || p.name.toLowerCase() === cleanName.toLowerCase()
            );
            if (idx >= 0) {
                anim.customRasterBlendPresets[idx] = entry;
            } else {
                anim.customRasterBlendPresets.push(entry);
            }
        };

        upsertInList(timeline);
        if (sharedObjectId) {
            upsertInList(state.animation);
        }

        this.setPendingUndoLabel(canvasId, `Save Raster Blend Preset (${cleanName})`);
        this.saveCanvas(state);
        return entry;
    }

    /**
     * Lists all built-in GIMP filter presets and any custom JS filter presets stored in the canvas or `RasterFilterRegistry`,
     * including folder `category`, `parameterSchemas`, and full JavaScript `code`.
     */
    public listGimpFilterPresets(canvasId?: string, category?: string): GimpFilterPreset[] {
        const list: GimpFilterPreset[] = BUILT_IN_GIMP_FILTER_PRESETS.map(p => ({ ...p, builtIn: true }));
        for (const regPreset of RasterFilterRegistry.getAllPresets()) {
            if (!list.some(item => item.id === regPreset.id)) {
                list.push({ ...regPreset });
            }
        }
        if (canvasId) {
            try {
                const state = this.loadCanvas(canvasId);
                for (const cp of state.customFilterPresets || []) {
                    RasterFilterRegistry.registerCustomPreset(cp);
                    const existingIdx = list.findIndex(item => item.id === cp.id);
                    if (existingIdx >= 0 && !list[existingIdx].builtIn) {
                        list[existingIdx] = { ...cp, builtIn: false };
                    } else if (existingIdx < 0) {
                        list.push({ ...cp, builtIn: false });
                    }
                }
            } catch {
                // Canvas may not exist yet
            }
        }
        if (category && category.trim()) {
            const targetCat = category.trim().toLowerCase();
            return list.filter(p => (p.category || "Custom").toLowerCase() === targetCat);
        }
        return list;
    }

    public getGimpFilterPreset(filterId: string, canvasId?: string): GimpFilterPreset | undefined {
        return this.listGimpFilterPresets(canvasId).find(p => p.id === filterId);
    }

    public validateGimpFilterScript(code: string, _params?: Record<string, any>): { valid: boolean; error?: string } {
        return AbstractRasterFilter.validateFilterScript(code);
    }

    public evaluateGimpFilterScript(
        code: string,
        srcBuf: Uint8Array,
        outBuf: Uint8Array,
        width: number,
        height: number,
        params: Record<string, any> = {},
        selection?: SelectionMaskSpec
    ): void {
        AbstractRasterFilter.evaluateFilterScript(code, srcBuf, outBuf, width, height, params, selection);
    }

    /**
     * Saves a custom JavaScript GIMP filter preset into `state.customFilterPresets` (so it persists in `.hacanvas`)
     * and registers it live in `RasterFilterRegistry`.
     */
    public saveCustomGimpFilterPreset(
        canvasId: string,
        preset: {
            id?: string;
            name: string;
            category?: string;
            description?: string;
            gimpProcedure?: string;
            parameterSchemas?: FilterParameterSchema[];
            code: string;
        }
    ): GimpFilterPreset {
        const validation = this.validateGimpFilterScript(preset.code);
        if (!validation.valid) {
            throw new Error(`Invalid GIMP filter JavaScript: ${validation.error}`);
        }
        const parsedCat = parseSharedObjectCategory(preset.name || "Custom Filter", preset.category || "Custom");
        const cleanName = parsedCat.displayName;
        const cleanCat = preset.category ? preset.category.trim() : (parsedCat.category !== "Uncategorized" ? parsedCat.category : "Custom");
        const id = preset.id && !BUILT_IN_GIMP_FILTER_PRESETS.some(b => b.id === preset.id)
            ? preset.id
            : `filter_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now() % 10000}`;

        const entry: GimpFilterPreset = {
            id,
            name: cleanName,
            category: cleanCat || "Custom",
            description: (preset.description || "Custom JavaScript GIMP pixel filter preset.").trim(),
            gimpProcedure: preset.gimpProcedure || `custom:${id}`,
            parameterSchemas: preset.parameterSchemas || [],
            code: preset.code,
            builtIn: false
        };

        RasterFilterRegistry.registerCustomPreset(entry);

        try {
            const state = this.loadCanvas(canvasId);
            if (!state.customFilterPresets) state.customFilterPresets = [];
            const idx = state.customFilterPresets.findIndex(
                p => p.id === id || p.name.toLowerCase() === cleanName.toLowerCase()
            );
            if (idx >= 0) {
                state.customFilterPresets[idx] = entry;
            } else {
                state.customFilterPresets.push(entry);
            }
            this.setPendingUndoLabel(canvasId, `Save Filter Preset (${cleanName})`);
            this.saveCanvas(state);
        } catch {
            // If canvasId is not yet initialized on disk, still registered in RasterFilterRegistry
        }
        return entry;
    }

    public deleteCustomGimpFilterPreset(canvasId: string, filterId: string): boolean {
        const removedReg = RasterFilterRegistry.unregisterCustomPreset(filterId);
        let removedState = false;
        try {
            const state = this.loadCanvas(canvasId);
            if (state.customFilterPresets) {
                const before = state.customFilterPresets.length;
                state.customFilterPresets = state.customFilterPresets.filter(p => p.id !== filterId);
                removedState = state.customFilterPresets.length !== before;
                if (removedState) this.saveCanvas(state);
            }
        } catch {
            // Ignore
        }
        return removedReg || removedState;
    }

    /**
     * Ensures the `"rasterCel"` track exists for `layer.id` in `timeline.tracks` and contains keyframes for `0` and all `layer.celFrames`.
     */
    public ensureRasterCelTrackKeyframes(
        timeline: AnimationTimelineSpec,
        layer: ArtLayerSpec
    ): AnimationTrackSpec {
        let track = timeline.tracks.find(t => t.targetId === layer.id && t.property === "rasterCel");
        if (!track) {
            track = {
                id: `track_${layer.id}_rasterCel`,
                targetId: layer.id,
                property: "rasterCel",
                keyframes: []
            };
            timeline.tracks.push(track);
        }
        const allFrames = Array.from(new Set([0, ...(layer.celFrames || [])])).filter(f => f >= 0).sort((a, b) => a - b);
        for (const f of allFrames) {
            if (!track.keyframes.some(k => k.frame === f)) {
                track.keyframes.push({
                    frame: f,
                    value: f,
                    easing: layer.rasterBlendEasing || "linear",
                    ...(layer.rasterBlendCurveControlPoints ? { curveControlPoints: [...layer.rasterBlendCurveControlPoints] as [number, number, number, number] } : {}),
                    ...(layer.rasterBlendCurvePresetId ? { curvePresetId: layer.rasterBlendCurvePresetId } : {}),
                    ...(layer.rasterBlendPresetId ? { rasterBlendPresetId: layer.rasterBlendPresetId } : {})
                });
            }
        }
        track.keyframes.sort((a, b) => a.frame - b.frame);
        return track;
    }

    /**
     * Creates, duplicates, fills, updates, or removes a raster cel keyframe at `opts.frame` on a raster layer,
     * and optionally configures its blending preset, custom JS code, cross-layer target, and curve easing.
     */
    public setRasterCelKeyframe(
        canvasId: string,
        opts: {
            layerId?: string;
            frame: number;
            mode?: "duplicate" | "blank" | "fill" | "remove";
            fillColor?: string;
            easing?: EasingMode;
            curveControlPoints?: [number, number, number, number];
            curvePresetId?: string;
            endFrame?: number | null;
            rasterBlendPresetId?: string;
            rasterBlendCustomCode?: string | null;
            rasterBlendTargetLayerId?: string | null;
            rasterBlendTargetFrame?: number | null;
            sharedObjectId?: string;
        }
    ): {
        layerId: string;
        frame: number;
        removed?: boolean;
        celFrames: number[];
        keyframe?: AnimationKeyframeSpec;
    } {
        const state = this.loadCanvas(canvasId);
        const container = opts.sharedObjectId ? this.getSharedObjectOrThrow(state, opts.sharedObjectId) : state;
        const timeline = this.getTimelineForContainer(state, opts.sharedObjectId);
        const layer = this.findLayer(state, opts.layerId, "raster", opts.sharedObjectId);
        const frm = Math.max(0, Math.round(opts.frame));

        if (opts.mode === "remove") {
            if (frm > 0 && layer.celFrames) {
                layer.celFrames = layer.celFrames.filter(f => f !== frm);
                const celPath = this.getRasterBufferPath(state.canvasId, layer.id, frm, opts.sharedObjectId);
                if (fs.existsSync(celPath)) {
                    try { fs.unlinkSync(celPath); } catch { /* ignore */ }
                }
            }
            const tr = timeline.tracks.find(t => t.targetId === layer.id && t.property === "rasterCel");
            if (tr) {
                tr.keyframes = tr.keyframes.filter(k => k.frame !== frm);
                timeline.tracks = timeline.tracks.filter(t => t.keyframes.length > 0);
            }
            this.setPendingUndoLabel(canvasId, `Remove Raster Cel (${layer.name} @ F${frm})`);
            this.saveCanvas(state);
            return {
                layerId: layer.id,
                frame: frm,
                removed: true,
                celFrames: [0, ...(layer.celFrames || [])]
            };
        }

        if (opts.rasterBlendCustomCode) {
            const check = this.validateRasterBlendScript(opts.rasterBlendCustomCode);
            if (!check.valid) {
                throw new Error(`Invalid raster blend JavaScript: ${check.error}`);
            }
        }

        const w = container.width;
        const h = container.height;
        let celBuf: Buffer;
        if (opts.mode === "blank") {
            celBuf = Buffer.alloc(w * h * 4, 0);
        } else if (opts.mode === "fill") {
            celBuf = Buffer.alloc(w * h * 4, 0);
            const c = parseColor(opts.fillColor || "#000000");
            for (let i = 0; i < w * h * 4; i += 4) {
                celBuf[i] = c.r;
                celBuf[i + 1] = c.g;
                celBuf[i + 2] = c.b;
                celBuf[i + 3] = c.a;
            }
        } else {
            // "duplicate" or default: if exact cel already exists at frm and mode wasn't explicitly "duplicate", preserve it; else sample resolved buffer
            const exactPath = frm > 0 ? this.getRasterBufferPath(state.canvasId, layer.id, frm, opts.sharedObjectId) : this.getRasterBufferPath(state.canvasId, layer.id, undefined, opts.sharedObjectId);
            if (opts.mode !== "duplicate" && fs.existsSync(exactPath)) {
                celBuf = Buffer.from(this.loadRasterBuffer(state, layer.id, w, h, frm > 0 ? frm : undefined, opts.sharedObjectId));
            } else {
                celBuf = Buffer.from(this.resolveAnimatedRasterBuffer(state, layer, w, h, frm, opts.sharedObjectId));
            }
        }

        this.saveRasterBuffer(state, layer.id, celBuf, frm > 0 ? frm : undefined, opts.sharedObjectId);
        if (frm > 0) {
            if (!layer.celFrames) layer.celFrames = [];
            if (!layer.celFrames.includes(frm)) {
                layer.celFrames.push(frm);
                layer.celFrames.sort((a, b) => a - b);
            }
        }

        const track = this.ensureRasterCelTrackKeyframes(timeline, layer);
        let kf = track.keyframes.find(k => k.frame === frm);
        if (!kf) {
            kf = { frame: frm, value: frm, easing: opts.easing || layer.rasterBlendEasing || "linear" };
            track.keyframes.push(kf);
            track.keyframes.sort((a, b) => a.frame - b.frame);
        }
        if (opts.easing !== undefined) kf.easing = opts.easing;
        if (opts.curveControlPoints !== undefined) kf.curveControlPoints = [...opts.curveControlPoints] as [number, number, number, number];
        if (opts.curvePresetId !== undefined) kf.curvePresetId = opts.curvePresetId;
        if (opts.endFrame === null) delete kf.endFrame;
        else if (opts.endFrame !== undefined) kf.endFrame = Math.max(frm, Math.round(opts.endFrame));
        if (opts.rasterBlendPresetId !== undefined) kf.rasterBlendPresetId = opts.rasterBlendPresetId;
        if (opts.rasterBlendCustomCode === null) delete kf.rasterBlendCustomCode;
        else if (opts.rasterBlendCustomCode !== undefined) kf.rasterBlendCustomCode = opts.rasterBlendCustomCode;
        if (opts.rasterBlendTargetLayerId === null) delete kf.rasterBlendTargetLayerId;
        else if (opts.rasterBlendTargetLayerId !== undefined) kf.rasterBlendTargetLayerId = opts.rasterBlendTargetLayerId;
        if (opts.rasterBlendTargetFrame === null) delete kf.rasterBlendTargetFrame;
        else if (opts.rasterBlendTargetFrame !== undefined) kf.rasterBlendTargetFrame = Math.max(0, Math.round(opts.rasterBlendTargetFrame));

        const maxF = Math.max(frm, kf.endFrame ?? frm, kf.rasterBlendTargetFrame ?? frm);
        if (maxF + 1 > timeline.durationFrames) {
            timeline.durationFrames = maxF + 1;
        }

        this.setPendingUndoLabel(canvasId, `Set Raster Cel Keyframe (${layer.name} @ F${frm})`);
        this.saveCanvas(state);
        return {
            layerId: layer.id,
            frame: frm,
            celFrames: [0, ...(layer.celFrames || [])],
            keyframe: kf
        };
    }

    /**
     * Configures the raster keyframe blending method, custom JavaScript blending code, cross-layer keyframe target,
     * and curve easing for a raster layer (and/or a specific keyframe segment on that raster layer).
     */
    public configureRasterLayerBlend(
        canvasId: string,
        opts: {
            layerId?: string;
            frame?: number;
            blendPresetId?: string;
            customBlendCode?: string | null;
            targetLayerId?: string | null;
            targetFrame?: number | null;
            easing?: EasingMode;
            curveControlPoints?: [number, number, number, number];
            curvePresetId?: string;
            endFrame?: number | null;
            sharedObjectId?: string;
        }
    ): {
        layerId: string;
        blendPresetId: string;
        customBlendCode?: string;
        targetLayerId?: string;
        targetFrame?: number;
        easing: EasingMode;
        curveControlPoints?: [number, number, number, number];
        celFrames: number[];
        keyframe?: AnimationKeyframeSpec;
    } {
        const state = this.loadCanvas(canvasId);
        const timeline = this.getTimelineForContainer(state, opts.sharedObjectId);
        const layer = this.findLayer(state, opts.layerId, "raster", opts.sharedObjectId);

        if (opts.customBlendCode) {
            const check = this.validateRasterBlendScript(opts.customBlendCode);
            if (!check.valid) {
                throw new Error(`Invalid raster blend JavaScript: ${check.error}`);
            }
        }

        // Update layer-level defaults when frame is not specified or as default fallback
        if (opts.blendPresetId !== undefined) {
            layer.rasterBlendPresetId = opts.blendPresetId;
        }
        if (opts.customBlendCode === null) {
            delete layer.rasterBlendCustomCode;
        } else if (opts.customBlendCode !== undefined) {
            layer.rasterBlendCustomCode = opts.customBlendCode;
        }
        if (opts.targetLayerId === null) {
            delete layer.rasterBlendTargetLayerId;
        } else if (opts.targetLayerId !== undefined) {
            layer.rasterBlendTargetLayerId = opts.targetLayerId;
        }
        if (opts.targetFrame === null) {
            delete layer.rasterBlendTargetFrame;
        } else if (opts.targetFrame !== undefined) {
            layer.rasterBlendTargetFrame = Math.max(0, Math.round(opts.targetFrame));
        }
        if (opts.easing !== undefined) {
            layer.rasterBlendEasing = opts.easing;
        }
        if (opts.curveControlPoints !== undefined) {
            layer.rasterBlendCurveControlPoints = [...opts.curveControlPoints] as [number, number, number, number];
        }
        if (opts.curvePresetId !== undefined) {
            layer.rasterBlendCurvePresetId = opts.curvePresetId;
        }

        const track = this.ensureRasterCelTrackKeyframes(timeline, layer);
        let updatedKf: AnimationKeyframeSpec | undefined;

        const targetFramesToUpdate = opts.frame !== undefined
            ? [Math.max(0, Math.round(opts.frame))]
            : track.keyframes.map(k => k.frame);

        for (const f of targetFramesToUpdate) {
            let kf = track.keyframes.find(k => k.frame === f);
            if (!kf) {
                kf = { frame: f, value: f, easing: layer.rasterBlendEasing || "linear" };
                track.keyframes.push(kf);
                track.keyframes.sort((a, b) => a.frame - b.frame);
            }
            if (opts.blendPresetId !== undefined) kf.rasterBlendPresetId = opts.blendPresetId;
            if (opts.customBlendCode === null) delete kf.rasterBlendCustomCode;
            else if (opts.customBlendCode !== undefined) kf.rasterBlendCustomCode = opts.customBlendCode;
            if (opts.targetLayerId === null) delete kf.rasterBlendTargetLayerId;
            else if (opts.targetLayerId !== undefined) kf.rasterBlendTargetLayerId = opts.targetLayerId;
            if (opts.targetFrame === null) delete kf.rasterBlendTargetFrame;
            else if (opts.targetFrame !== undefined) kf.rasterBlendTargetFrame = Math.max(0, Math.round(opts.targetFrame));
            if (opts.easing !== undefined) kf.easing = opts.easing;
            if (opts.curveControlPoints !== undefined) kf.curveControlPoints = [...opts.curveControlPoints] as [number, number, number, number];
            if (opts.curvePresetId !== undefined) kf.curvePresetId = opts.curvePresetId;
            if (opts.endFrame === null) delete kf.endFrame;
            else if (opts.endFrame !== undefined) kf.endFrame = Math.max(f, Math.round(opts.endFrame));

            const maxF = Math.max(f, kf.endFrame ?? f, kf.rasterBlendTargetFrame ?? f);
            if (maxF + 1 > timeline.durationFrames) {
                timeline.durationFrames = maxF + 1;
            }
            if (opts.frame !== undefined && f === Math.round(opts.frame)) {
                updatedKf = kf;
            }
        }

        this.setPendingUndoLabel(canvasId, `Configure Raster Blend (${layer.name})`);
        this.saveCanvas(state);

        return {
            layerId: layer.id,
            blendPresetId: updatedKf?.rasterBlendPresetId || layer.rasterBlendPresetId || "crossfade",
            customBlendCode: updatedKf?.rasterBlendCustomCode || layer.rasterBlendCustomCode,
            targetLayerId: updatedKf?.rasterBlendTargetLayerId || layer.rasterBlendTargetLayerId,
            targetFrame: updatedKf?.rasterBlendTargetFrame ?? layer.rasterBlendTargetFrame,
            easing: updatedKf?.easing || layer.rasterBlendEasing || "linear",
            curveControlPoints: updatedKf?.curveControlPoints || layer.rasterBlendCurveControlPoints,
            celFrames: [0, ...(layer.celFrames || [])],
            keyframe: updatedKf || track.keyframes[0]
        };
    }

    private resolveRasterBlendCode(
        state: ArtCanvasState,
        layer: ArtLayerSpec,
        kf?: AnimationKeyframeSpec,
        sharedObjectId?: string
    ): string {
        const customInline = kf?.rasterBlendCustomCode || layer.rasterBlendCustomCode;
        if (customInline && customInline.trim()) {
            return customInline;
        }
        const presetId = kf?.rasterBlendPresetId || layer.rasterBlendPresetId || "crossfade";
        const builtIn = BUILT_IN_RASTER_BLEND_PRESETS.find(p => p.id === presetId);
        if (builtIn) return builtIn.code;

        const sharedPresets = sharedObjectId
            ? state.sharedObjects?.[sharedObjectId]?.animation?.customRasterBlendPresets || []
            : [];
        const mainPresets = state.animation?.customRasterBlendPresets || [];
        const foundCustom = [...sharedPresets, ...mainPresets].find(p => p.id === presetId);
        if (foundCustom) return foundCustom.code;

        return BUILT_IN_RASTER_BLEND_PRESETS[0].code;
    }

    /**
     * Resolves a raster layer's pixel buffer at `frame`, blending between adjacent raster cel keyframes
     * (or across different raster layers when `rasterBlendTargetLayerId` is configured) using the segment's
     * easing / cubic-Bezier curve and the configured JavaScript blending preset or custom blending script.
     */
    public resolveAnimatedRasterBuffer(
        state: ArtCanvasState,
        layer: ArtLayerSpec,
        widthOrFrame: number = state.width,
        height?: number,
        frame: number = 0,
        sharedObjectId?: string
    ): Buffer {
        let width = widthOrFrame;
        let resolvedHeight = height ?? state.height;
        if (height === undefined) {
            // Called with 3 arguments: (state, layer, frame)
            frame = widthOrFrame;
            width = state.width;
            resolvedHeight = state.height;
        }
        height = resolvedHeight;
        if (layer.startFrame !== undefined && frame < layer.startFrame) {
            return Buffer.alloc(width * height * 4, 0);
        }
        if (layer.endFrame !== undefined && frame > layer.endFrame) {
            return Buffer.alloc(width * height * 4, 0);
        }

        const container = sharedObjectId ? state.sharedObjects?.[sharedObjectId] : state;
        const timeline = container?.animation || state.animation;
        const celTrack = timeline?.tracks?.find(t => t.targetId === layer.id && t.property === "rasterCel");

        const frameSet = new Set<number>([0, ...(layer.celFrames || []), ...(celTrack?.keyframes?.map(k => k.frame) || [])]);
        const sortedFrames = Array.from(frameSet).filter(f => f >= 0).sort((a, b) => a - b);

        const loadExactOrBase = (lyrId: string, f: number): Buffer => {
            return this.loadRasterBuffer(state, lyrId, width, height, f > 0 ? f : undefined, sharedObjectId);
        };

        const findRasterLayerByIdOrName = (idOrName?: string): ArtLayerSpec | undefined => {
            if (!idOrName) return undefined;
            const layers = container?.layers || state.layers;
            return layers.find(l => (l.id === idOrName || l.name === idOrName) && l.type === "raster");
        };

        // Case 1: Single keyframe on this layer, check if cross-layer keyframe blending is configured
        if (sortedFrames.length <= 1) {
            const f0 = sortedFrames[0] ?? 0;
            const kf0 = celTrack?.keyframes?.find(k => k.frame === f0);
            const targetLayerId = kf0?.rasterBlendTargetLayerId || layer.rasterBlendTargetLayerId;
            const targetLayer = findRasterLayerByIdOrName(targetLayerId);
            if (targetLayer) {
                const targetCelMax = targetLayer.celFrames && targetLayer.celFrames.length > 0
                    ? Math.max(...targetLayer.celFrames)
                    : undefined;
                const f1 = kf0?.endFrame ?? kf0?.rasterBlendTargetFrame ?? layer.rasterBlendTargetFrame ?? targetCelMax ?? Math.max(1, (timeline?.durationFrames || 2) - 1);
                if (f1 > f0 && frame > f0) {
                    const rawT = Math.max(0, Math.min(1, (frame - f0) / (f1 - f0)));
                    const t = this.applyEasing(
                        rawT,
                        kf0?.easing || layer.rasterBlendEasing || "linear",
                        kf0?.curveControlPoints || layer.rasterBlendCurveControlPoints
                    );
                    const bufA = loadExactOrBase(layer.id, f0);
                    const targetF = kf0?.rasterBlendTargetFrame ?? layer.rasterBlendTargetFrame ?? f1;
                    const bufB = loadExactOrBase(targetLayer.id, targetF);
                    const code = this.resolveRasterBlendCode(state, layer, kf0, sharedObjectId);
                    const outBuf = Buffer.alloc(width * height * 4);
                    this.evaluateRasterBlendScript(code, bufA, bufB, outBuf, width, height, t, rawT);
                    return outBuf;
                }
            }
            return Buffer.from(loadExactOrBase(layer.id, f0));
        }

        // Case 2: Multiple keyframes on this raster layer
        if (frame <= sortedFrames[0]) {
            return Buffer.from(loadExactOrBase(layer.id, sortedFrames[0]));
        }

        const lastIdx = sortedFrames.length - 1;
        const lastF = sortedFrames[lastIdx];
        if (frame > lastF) {
            const kfLast = celTrack?.keyframes?.find(k => k.frame === lastF);
            const targetLayer = findRasterLayerByIdOrName(kfLast?.rasterBlendTargetLayerId || layer.rasterBlendTargetLayerId);
            const fEnd = kfLast?.endFrame ?? kfLast?.rasterBlendTargetFrame ?? layer.rasterBlendTargetFrame;
            if (targetLayer && fEnd !== undefined && fEnd > lastF) {
                const rawT = Math.max(0, Math.min(1, (frame - lastF) / (fEnd - lastF)));
                const t = this.applyEasing(
                    rawT,
                    kfLast?.easing || layer.rasterBlendEasing || "linear",
                    kfLast?.curveControlPoints || layer.rasterBlendCurveControlPoints
                );
                const bufA = loadExactOrBase(layer.id, lastF);
                const bufB = loadExactOrBase(targetLayer.id, kfLast?.rasterBlendTargetFrame ?? layer.rasterBlendTargetFrame ?? fEnd);
                const code = this.resolveRasterBlendCode(state, layer, kfLast, sharedObjectId);
                const outBuf = Buffer.alloc(width * height * 4);
                this.evaluateRasterBlendScript(code, bufA, bufB, outBuf, width, height, t, rawT);
                return outBuf;
            }
            return Buffer.from(loadExactOrBase(layer.id, lastF));
        }

        for (let i = 0; i < sortedFrames.length - 1; i++) {
            const f0 = sortedFrames[i];
            const f1 = sortedFrames[i + 1];
            if (frame >= f0 && frame <= f1) {
                const kf0 = celTrack?.keyframes?.find(k => k.frame === f0);
                const effectiveEnd =
                    kf0?.endFrame !== undefined && kf0.endFrame > f0 && kf0.endFrame < f1
                        ? kf0.endFrame
                        : f1;
                const rawT =
                    effectiveEnd === f0
                        ? 1
                        : Math.max(0, Math.min(1, (frame - f0) / (effectiveEnd - f0)));
                const t = this.applyEasing(
                    rawT,
                    kf0?.easing || layer.rasterBlendEasing || "linear",
                    kf0?.curveControlPoints || layer.rasterBlendCurveControlPoints
                );

                const targetLayer = findRasterLayerByIdOrName(kf0?.rasterBlendTargetLayerId || layer.rasterBlendTargetLayerId);
                if (frame === f0 && rawT === 0 && t === 0) {
                    return Buffer.from(loadExactOrBase(layer.id, f0));
                }
                if (frame === f1 && !targetLayer && rawT === 1 && t === 1 && !kf0?.rasterBlendCustomCode && !layer.rasterBlendCustomCode && (kf0?.rasterBlendPresetId || layer.rasterBlendPresetId || "crossfade") !== "step_hold") {
                    return Buffer.from(loadExactOrBase(layer.id, f1));
                }

                const bufA = loadExactOrBase(layer.id, f0);
                const bufB = targetLayer
                    ? loadExactOrBase(targetLayer.id, kf0?.rasterBlendTargetFrame ?? layer.rasterBlendTargetFrame ?? f1)
                    : loadExactOrBase(layer.id, f1);
                const code = this.resolveRasterBlendCode(state, layer, kf0, sharedObjectId);
                const outBuf = Buffer.alloc(width * height * 4);
                this.evaluateRasterBlendScript(code, bufA, bufB, outBuf, width, height, t, rawT);
                return outBuf;
            }
        }

        return Buffer.from(loadExactOrBase(layer.id, lastF));
    }

    /**
     * Sets the active `startFrame` and `endFrame` visibility span for a Layer or Vector Object / `<ObjectRef>`.
     */
    public setTargetFrameRange(
        canvasId: string,
        targetId: string,
        startFrame?: number | null,
        endFrame?: number | null,
        sharedObjectId?: string
    ): { targetId: string; startFrame?: number; endFrame?: number } {
        const state = this.loadCanvas(canvasId);
        const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
        const timeline = this.getTimelineForContainer(state, sharedObjectId);

        const applyRange = (item: { startFrame?: number; endFrame?: number }) => {
            if (startFrame === null || startFrame === undefined) {
                delete item.startFrame;
            } else {
                item.startFrame = Math.max(0, Math.round(startFrame));
            }
            if (endFrame === null || endFrame === undefined) {
                delete item.endFrame;
            } else {
                item.endFrame = Math.max(item.startFrame ?? 0, Math.round(endFrame));
                if (item.endFrame + 1 > timeline.durationFrames) {
                    timeline.durationFrames = item.endFrame + 1;
                }
            }
        };

        for (const layer of container.layers) {
            if (layer.id === targetId) {
                applyRange(layer);
                this.setPendingUndoLabel(canvasId, `Set Layer Frame Range (${layer.name})`);
                this.saveCanvas(state);
                return { targetId, startFrame: layer.startFrame, endFrame: layer.endFrame };
            }
            for (const obj of layer.objects) {
                if (obj.id === targetId) {
                    applyRange(obj);
                    this.setPendingUndoLabel(canvasId, `Set Object Frame Range (${obj.id})`);
                    this.saveCanvas(state);
                    return { targetId, startFrame: obj.startFrame, endFrame: obj.endFrame };
                }
            }
        }
        throw new Error(`Target '${targetId}' not found for frame range update.`);
    }

    private applyEasing(
        t: number,
        mode: EasingMode = "linear",
        curveControlPoints?: [number, number, number, number]
    ): number {
        const clamped = Math.max(0, Math.min(1, t));
        if (mode === "step") return clamped < 1 ? 0 : 1;
        if (curveControlPoints && curveControlPoints.length === 4) {
            return evaluateCubicBezierEasing(clamped, curveControlPoints);
        }
        if (mode === "ease_in") return evaluateCubicBezierEasing(clamped, [0.42, 0, 1, 1]);
        if (mode === "ease_out") return evaluateCubicBezierEasing(clamped, [0, 0, 0.58, 1]);
        if (mode === "ease_in_out") return evaluateCubicBezierEasing(clamped, [0.42, 0, 0.58, 1]);
        if (mode === "overshoot") return evaluateCubicBezierEasing(clamped, [0.34, 1.56, 0.64, 1]);
        if (mode === "ease_in_back") return evaluateCubicBezierEasing(clamped, [0.36, 0, 0.66, -0.56]);
        if (mode === "snap") return evaluateCubicBezierEasing(clamped, [0.075, 0.82, 0.165, 1]);
        return clamped;
    }

    private interpolateSvgPathStrings(d0: string, d1: string, t: number): string {
        const tokRegex = /[a-zA-Z]|[-+]?\d*\.?\d+/g;
        const t0 = d0.match(tokRegex) || [];
        const t1 = d1.match(tokRegex) || [];
        if (t0.length !== t1.length || t0.length === 0) {
            return t < 0.5 ? d0 : d1;
        }
        const out: string[] = [];
        for (let i = 0; i < t0.length; i++) {
            const a = t0[i];
            const b = t1[i];
            if (/^[a-zA-Z]$/.test(a)) {
                if (a.toUpperCase() !== b.toUpperCase()) return t < 0.5 ? d0 : d1;
                out.push(a);
            } else {
                const n0 = parseFloat(a);
                const n1 = parseFloat(b);
                if (Number.isNaN(n0) || Number.isNaN(n1)) return t < 0.5 ? d0 : d1;
                const v = Math.round((n0 + (n1 - n0) * t) * 100) / 100;
                out.push(String(v));
            }
        }
        return out.join(" ");
    }

    private evaluateTrackAtFrame(
        track: AnimationTrackSpec,
        frame: number
    ): number | string | { x: number; y: number }[] | undefined {
        const kfs = track.keyframes;
        if (!kfs || kfs.length === 0) return undefined;
        if (frame <= kfs[0].frame) return kfs[0].value;
        if (frame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value;

        for (let i = 0; i < kfs.length - 1; i++) {
            const k0 = kfs[i];
            const k1 = kfs[i + 1];
            if (frame >= k0.frame && frame <= k1.frame) {
                const effectiveEnd =
                    k0.endFrame !== undefined && k0.endFrame > k0.frame && k0.endFrame < k1.frame
                        ? k0.endFrame
                        : k1.frame;
                const rawT =
                    effectiveEnd === k0.frame
                        ? 1
                        : Math.max(0, Math.min(1, (frame - k0.frame) / (effectiveEnd - k0.frame)));
                const t = this.applyEasing(rawT, k0.easing || "linear", k0.curveControlPoints);

                if (typeof k0.value === "number" && typeof k1.value === "number") {
                    return k0.value + (k1.value - k0.value) * t;
                }
                if (Array.isArray(k0.value) && Array.isArray(k1.value) && k0.value.length === k1.value.length) {
                    return k0.value.map((p0, idx) => ({
                        x: Math.round((p0.x + (k1.value as { x: number; y: number }[])[idx].x * t - p0.x * t) * 100) / 100,
                        y: Math.round((p0.y + (k1.value as { x: number; y: number }[])[idx].y * t - p0.y * t) * 100) / 100
                    }));
                }
                if (track.property === "d" && typeof k0.value === "string" && typeof k1.value === "string") {
                    return this.interpolateSvgPathStrings(k0.value, k1.value, t);
                }
                if (track.property === "fill" || track.property === "stroke") {
                    const c0 = parseColor(String(k0.value));
                    const c1 = parseColor(String(k1.value));
                    return rgbaToHex({
                        r: Math.max(0, Math.min(255, Math.round(c0.r + (c1.r - c0.r) * t))),
                        g: Math.max(0, Math.min(255, Math.round(c0.g + (c1.g - c0.g) * t))),
                        b: Math.max(0, Math.min(255, Math.round(c0.b + (c1.b - c0.b) * t))),
                        a: Math.max(0, Math.min(255, Math.round(c0.a + (c1.a - c0.a) * t)))
                    });
                }
                return t < 0.5 ? k0.value : k1.value;
            }
        }
        return kfs[kfs.length - 1].value;
    }

    public resolveAnimatedObject(
        state: ArtCanvasState,
        obj: VectorObjectSpec,
        frame: number = 0,
        timelineOrSharedObjectId?: AnimationTimelineSpec | string
    ): VectorObjectSpec {
        const timeline =
            typeof timelineOrSharedObjectId === "string"
                ? state.sharedObjects?.[timelineOrSharedObjectId]?.animation || state.animation
                : timelineOrSharedObjectId || state.animation;
        const outOfRange =
            (obj.startFrame !== undefined && frame < obj.startFrame) ||
            (obj.endFrame !== undefined && frame > obj.endFrame);
        const tracks = timeline?.tracks?.filter(t => t.targetId === obj.id) || [];
        if (tracks.length === 0 && !outOfRange) return obj;
        const clone: VectorObjectSpec = JSON.parse(JSON.stringify(obj));
        if (outOfRange) {
            clone.opacity = 0;
            return clone;
        }
        for (const tr of tracks) {
            const val = this.evaluateTrackAtFrame(tr, frame);
            if (val !== undefined) {
                (clone as any)[tr.property] = val;
                if (tr.property === "d" && typeof val === "string") {
                    clone.points = this.parseSvgPathToPoints(val);
                }
            }
        }
        return clone;
    }

    private resolveAnimatedLayerOpacity(
        state: ArtCanvasState,
        layer: ArtLayerSpec,
        frame: number = 0,
        timelineOrSharedObjectId?: AnimationTimelineSpec | string
    ): number {
        if (layer.startFrame !== undefined && frame < layer.startFrame) return 0;
        if (layer.endFrame !== undefined && frame > layer.endFrame) return 0;
        const timeline =
            typeof timelineOrSharedObjectId === "string"
                ? state.sharedObjects?.[timelineOrSharedObjectId]?.animation || state.animation
                : timelineOrSharedObjectId || state.animation;
        const tr = timeline?.tracks?.find(t => t.targetId === layer.id && t.property === "opacity");
        if (!tr) return layer.opacity;
        const val = this.evaluateTrackAtFrame(tr, frame);
        return typeof val === "number" ? Math.max(0, Math.min(1, val)) : layer.opacity;
    }

    private resolveAnimatedLayerOffset(
        state: ArtCanvasState,
        layer: ArtLayerSpec,
        frame: number = 0,
        timelineOrSharedObjectId?: AnimationTimelineSpec | string
    ): { x: number; y: number } {
        const timeline =
            typeof timelineOrSharedObjectId === "string"
                ? state.sharedObjects?.[timelineOrSharedObjectId]?.animation || state.animation
                : timelineOrSharedObjectId || state.animation;
        const trX = timeline?.tracks?.find(t => t.targetId === layer.id && t.property === "x");
        const trY = timeline?.tracks?.find(t => t.targetId === layer.id && t.property === "y");
        const vx = trX ? this.evaluateTrackAtFrame(trX, frame) : undefined;
        const vy = trY ? this.evaluateTrackAtFrame(trY, frame) : undefined;
        return {
            x: typeof vx === "number" ? Math.round(vx) : (layer.offsetX ?? 0),
            y: typeof vy === "number" ? Math.round(vy) : (layer.offsetY ?? 0)
        };
    }

    // ============================================================================
    // 3. Vector Tools (Inkscape / SVG Backend)
    // ============================================================================

    public drawShape(
        canvasId: string,
        layerId: string | undefined,
        spec: Partial<VectorObjectSpec> & { shape?: VectorObjectSpec["kind"]; sharedObjectId?: string }
    ): VectorObjectSpec {
        const state = this.loadCanvas(canvasId);
        const layer = this.findLayer(state, layerId, "vector", spec.sharedObjectId);
        const kind = (spec.kind || spec.shape || "rect") as VectorObjectSpec["kind"];
        const objId = spec.id || `obj_${kind}_${layer.objects.length + 1}_${Date.now() % 10000}`;

        const obj: VectorObjectSpec = {
            id: objId,
            kind,
            x: spec.x ?? 0,
            y: spec.y ?? 0,
            width: spec.width ?? (spec.r ? spec.r * 2 : spec.imageWidth ?? 100),
            height: spec.height ?? (spec.r ? spec.r * 2 : spec.imageHeight ?? 100),
            rx: spec.rx,
            ry: spec.ry,
            r: spec.r,
            x2: spec.x2,
            y2: spec.y2,
            points: spec.points,
            sides: spec.sides,
            innerRadius: spec.innerRadius,
            text: spec.text,
            fontFamily: spec.fontFamily,
            fontSize: spec.fontSize,
            fontWeight: spec.fontWeight,
            fontStyle: spec.fontStyle,
            letterSpacing: spec.letterSpacing,
            fontId: spec.fontId,
            imageDataUrl: spec.imageDataUrl,
            imageWidth: spec.imageWidth,
            imageHeight: spec.imageHeight,
            fill: spec.fill ?? (kind === "image" ? "none" : "#3b82f6"),
            stroke: spec.stroke ?? "none",
            strokeWidth: spec.strokeWidth ?? 1,
            opacity: spec.opacity ?? 1,
            rotation: spec.rotation,
            transform: spec.transform
        };

        if ((kind === "star" || kind === "polygon") && (!obj.points || obj.points.length === 0)) {
            const cx = (obj.x ?? 0) + (obj.width ?? 100) / 2;
            const cy = (obj.y ?? 0) + (obj.height ?? 100) / 2;
            const outerR = obj.r ?? Math.min(obj.width ?? 100, obj.height ?? 100) / 2;
            const innerR = obj.innerRadius ?? outerR * 0.45;
            const sides = Math.max(3, obj.sides ?? 5);
            const pts: { x: number; y: number }[] = [];
            const totalSteps = kind === "star" ? sides * 2 : sides;
            for (let i = 0; i < totalSteps; i++) {
                const angle = (i * Math.PI * 2) / totalSteps - Math.PI / 2;
                const rad = kind === "star" && i % 2 === 1 ? innerR : outerR;
                pts.push({
                    x: Math.round((cx + Math.cos(angle) * rad) * 100) / 100,
                    y: Math.round((cy + Math.sin(angle) * rad) * 100) / 100
                });
            }
            obj.points = pts;
        }

        layer.objects.push(obj);
        this.setPendingUndoLabel(canvasId, `Draw ${kind}`);
        this.saveCanvas(state);
        return obj;
    }

    public drawPath(
        canvasId: string,
        layerId: string | undefined,
        spec: {
            id?: string;
            d?: string;
            points?: { x: number; y: number }[];
            closed?: boolean;
            fill?: string;
            stroke?: string;
            strokeWidth?: number;
            opacity?: number;
            transform?: string;
            sharedObjectId?: string;
        }
    ): VectorObjectSpec {
        const state = this.loadCanvas(canvasId);
        const layer = this.findLayer(state, layerId, "vector", spec.sharedObjectId);
        const objId = spec.id || `obj_path_${layer.objects.length + 1}_${Date.now() % 10000}`;

        let points = spec.points ? [...spec.points] : [];
        let d = spec.d || "";

        if (!d && points.length > 0) {
            d = points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
            if (spec.closed) d += " Z";
        } else if (d && points.length === 0) {
            points = this.parseSvgPathToPoints(d);
        }

        const obj: VectorObjectSpec = {
            id: objId,
            kind: "path",
            d,
            points,
            closed: Boolean(spec.closed || /z\s*$/i.test(d)),
            fill: spec.fill ?? (spec.closed ? "#3b82f6" : "none"),
            stroke: spec.stroke ?? "#000000",
            strokeWidth: spec.strokeWidth ?? 2,
            opacity: spec.opacity ?? 1,
            transform: spec.transform
        };

        layer.objects.push(obj);
        this.setPendingUndoLabel(canvasId, "Draw Path");
        this.saveCanvas(state);
        return obj;
    }

    public drawText(
        canvasId: string,
        layerId: string | undefined,
        spec: {
            id?: string;
            x: number;
            y: number;
            text: string;
            fontFamily?: string;
            fontSize?: number;
            fontWeight?: string;
            fontStyle?: string;
            letterSpacing?: number;
            fontId?: string;
            fill?: string;
            stroke?: string;
            strokeWidth?: number;
            opacity?: number;
            sharedObjectId?: string;
        }
    ): VectorObjectSpec {
        const state = this.loadCanvas(canvasId);
        const layer = this.findLayer(state, layerId, "vector", spec.sharedObjectId);
        const objId = spec.id || `obj_text_${layer.objects.length + 1}_${Date.now() % 10000}`;

        const fontSize = spec.fontSize ?? 16;
        const scale = Math.max(1, Math.round(fontSize / 7));
        const obj: VectorObjectSpec = {
            id: objId,
            kind: "text",
            x: spec.x ?? 10,
            y: spec.y ?? 20,
            width: Math.max(16, (spec.text || "").length * 6 * scale),
            height: Math.max(12, 7 * scale),
            text: spec.text || "",
            fontFamily: spec.fontFamily || "sans-serif",
            fontSize,
            fontWeight: spec.fontWeight,
            fontStyle: spec.fontStyle,
            letterSpacing: spec.letterSpacing,
            fontId: spec.fontId,
            fill: spec.fill ?? "#000000",
            stroke: spec.stroke ?? "none",
            strokeWidth: spec.strokeWidth ?? 0,
            opacity: spec.opacity ?? 1
        };

        layer.objects.push(obj);
        this.setPendingUndoLabel(canvasId, `Draw Text ("${spec.text}")`);
        this.saveCanvas(state);
        return obj;
    }

    /**
     * Places a raster image object (`kind === "image"`) directly inside a vector layer.
     * Supports passing a `data:image/...;base64,...` data URL, raw RGBA buffer (`rgba` + `imageWidth` + `imageHeight`),
     * or a file path (`filePath`) to any supported image file.
     */
    public addVectorImage(
        canvasId: string,
        layerId: string | undefined,
        spec: {
            id?: string;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            imageDataUrl?: string;
            filePath?: string;
            rgba?: Buffer;
            imageWidth?: number;
            imageHeight?: number;
            opacity?: number;
            rotation?: number;
            transform?: string;
            sharedObjectId?: string;
        }
    ): VectorObjectSpec {
        const state = this.loadCanvas(canvasId);
        const layer = this.findLayer(state, layerId, "vector", spec.sharedObjectId);
        const objId = spec.id || `obj_image_${layer.objects.length + 1}_${Date.now() % 10000}`;

        let dataUrl = spec.imageDataUrl || "";
        let imgW = spec.imageWidth ?? spec.width ?? 100;
        let imgH = spec.imageHeight ?? spec.height ?? 100;

        if (!dataUrl && spec.rgba && spec.imageWidth && spec.imageHeight) {
            imgW = Math.max(1, Math.round(spec.imageWidth));
            imgH = Math.max(1, Math.round(spec.imageHeight));
            const pngBuf = encodeRgbaToPng(imgW, imgH, spec.rgba);
            dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;
        } else if (!dataUrl && spec.filePath) {
            const resolvedPath = path.isAbsolute(spec.filePath)
                ? spec.filePath
                : path.join(this.projectRoot, spec.filePath.replace(/^[/\\]+/, ""));
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Image file not found: ${resolvedPath}`);
            }
            const rawBuf = fs.readFileSync(resolvedPath);
            const decoded = decodeAnyImageToRgba(resolvedPath, rawBuf);
            imgW = decoded.width;
            imgH = decoded.height;
            const pngBuf = encodeRgbaToPng(imgW, imgH, decoded.rgba);
            dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;
        } else if (dataUrl && (!spec.imageWidth || !spec.imageHeight)) {
            const decoded = this.decodeVectorImageDataUrl(dataUrl);
            if (decoded) {
                imgW = decoded.width;
                imgH = decoded.height;
            }
        }

        const obj: VectorObjectSpec = {
            id: objId,
            kind: "image",
            x: spec.x ?? 0,
            y: spec.y ?? 0,
            width: spec.width ?? imgW,
            height: spec.height ?? imgH,
            imageDataUrl: dataUrl,
            imageWidth: imgW,
            imageHeight: imgH,
            fill: "none",
            stroke: "none",
            strokeWidth: 0,
            opacity: spec.opacity ?? 1,
            rotation: spec.rotation,
            transform: spec.transform
        };

        layer.objects.push(obj);
        this.setPendingUndoLabel(canvasId, "Place Raster Object in Vector Layer");
        this.saveCanvas(state);
        return obj;
    }

    /**
     * Lists all embedded fonts stored in the canvas (`state.embeddedFonts`).
     */
    public listEmbeddedFonts(canvasId: string): EmbeddedFontSpec[] {
        const state = this.loadCanvas(canvasId);
        return Object.values(state.embeddedFonts || {});
    }

    /**
     * Adds or updates an embedded font in the canvas (`state.embeddedFonts`).
     */
    public addEmbeddedFont(
        canvasId: string,
        fontSpec: Partial<EmbeddedFontSpec> & { family: string; dataBase64: string }
    ): EmbeddedFontSpec {
        const state = this.loadCanvas(canvasId);
        if (!state.embeddedFonts) state.embeddedFonts = {};
        const cleanFamily = (fontSpec.family || fontSpec.name || "EmbeddedFont").trim();
        const id = fontSpec.id || `font_${cleanFamily.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Object.keys(state.embeddedFonts).length + 1}`;
        const entry: EmbeddedFontSpec = {
            id,
            name: fontSpec.name || cleanFamily,
            family: cleanFamily,
            format: fontSpec.format || "ttf",
            weight: fontSpec.weight || "normal",
            style: fontSpec.style || "normal",
            dataBase64: fontSpec.dataBase64,
            source: fontSpec.source || "user"
        };
        state.embeddedFonts[id] = entry;
        this.setPendingUndoLabel(canvasId, `Add Embedded Font (${cleanFamily})`);
        this.saveCanvas(state);
        return entry;
    }

    /**
     * Imports a `.ttf`, `.otf`, `.woff`, or `.woff2` font file into the canvas's embedded fonts collection.
     */
    public importFontFile(
        canvasId: string,
        filePath: string,
        customFamily?: string
    ): EmbeddedFontSpec {
        const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(this.projectRoot, filePath.replace(/^[/\\]+/, ""));
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Font file not found: ${resolvedPath}`);
        }
        const buf = fs.readFileSync(resolvedPath);
        const ext = path.extname(resolvedPath).replace(/^\./, "").toLowerCase();
        const format: EmbeddedFontSpec["format"] =
            ext === "otf" ? "otf" : ext === "woff" ? "woff" : ext === "woff2" ? "woff2" : "ttf";
        const baseName = path.basename(resolvedPath, path.extname(resolvedPath));
        const family = (customFamily || baseName).trim();
        return this.addEmbeddedFont(canvasId, {
            name: baseName,
            family,
            format,
            weight: /bold/i.test(baseName) ? "bold" : "normal",
            style: /italic|oblique/i.test(baseName) ? "italic" : "normal",
            dataBase64: buf.toString("base64"),
            source: "user"
        });
    }

    /**
     * Removes an embedded font from the canvas.
     */
    public removeEmbeddedFont(canvasId: string, fontId: string): boolean {
        const state = this.loadCanvas(canvasId);
        if (!state.embeddedFonts || !state.embeddedFonts[fontId]) {
            return false;
        }
        const fam = state.embeddedFonts[fontId].family;
        delete state.embeddedFonts[fontId];
        this.setPendingUndoLabel(canvasId, `Remove Font (${fam})`);
        this.saveCanvas(state);
        return true;
    }

    /**
     * Exports an embedded font from the canvas to a font file on disk (`.ttf`, `.otf`, `.woff`, `.woff2`).
     */
    public exportEmbeddedFont(
        canvasId: string,
        fontId: string,
        outputPath: string
    ): { filePath: string; bytesWritten: number; format: string } {
        const state = this.loadCanvas(canvasId);
        const font = state.embeddedFonts?.[fontId];
        if (!font) {
            throw new Error(`Embedded font '${fontId}' not found on canvas '${canvasId}'.`);
        }
        const resolvedPath = path.isAbsolute(outputPath)
            ? outputPath
            : path.join(this.projectRoot, outputPath.replace(/^[/\\]+/, ""));
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        const buf = Buffer.from(font.dataBase64, "base64");
        fs.writeFileSync(resolvedPath, buf);
        return {
            filePath: resolvedPath,
            bytesWritten: buf.length,
            format: font.format
        };
    }

    /**
     * Returns the document metadata (EXIF / GPS / XMP / Author / Copyright / Camera) for the canvas.
     */
    public getDocumentMetadata(canvasId: string): DocumentMetadataSpec {
        const state = this.loadCanvas(canvasId);
        return JSON.parse(JSON.stringify(state.metadata || {}));
    }

    /**
     * Updates or replaces the document metadata (EXIF / GPS / XMP / Author / Copyright / Camera) for the canvas.
     */
    public setDocumentMetadata(
        canvasId: string,
        updates: Partial<DocumentMetadataSpec>,
        replace: boolean = false
    ): DocumentMetadataSpec {
        const state = this.loadCanvas(canvasId);
        if (replace || !state.metadata) {
            state.metadata = {};
        }
        const nextMeta: DocumentMetadataSpec = replace
            ? { ...updates }
            : {
                  ...state.metadata,
                  ...updates
              };
        if (updates.gps !== undefined) {
            nextMeta.gps = replace
                ? { ...updates.gps }
                : { ...(state.metadata?.gps || {}), ...updates.gps };
            const g = nextMeta.gps;
            if (
                g &&
                g.latitude === undefined &&
                g.longitude === undefined &&
                g.altitude === undefined &&
                !g.locationName &&
                !g.country
            ) {
                delete nextMeta.gps;
            }
        }
        if (updates.custom !== undefined) {
            nextMeta.custom = replace
                ? { ...updates.custom }
                : { ...(state.metadata?.custom || {}), ...updates.custom };
        }
        state.metadata = nextMeta;
        this.setPendingUndoLabel(canvasId, "Update Document Metadata");
        this.saveCanvas(state);
        return JSON.parse(JSON.stringify(state.metadata));
    }

    public modifyObject(canvasId: string, objectId: string, updates: Partial<VectorObjectSpec>): VectorObjectSpec {
        const state = this.loadCanvas(canvasId);
        const allLayers = [
            ...state.layers,
            ...Object.values(state.sharedObjects).flatMap(s => s.layers)
        ];
        for (const layer of allLayers) {
            const obj = layer.objects.find(o => o.id === objectId);
            if (obj) {
                Object.assign(obj, updates, { id: obj.id });
                if (updates.d && !updates.points) {
                    obj.points = this.parseSvgPathToPoints(updates.d);
                }
                if (obj.kind === "text" && (updates.text !== undefined || updates.fontSize !== undefined)) {
                    const fSize = obj.fontSize ?? 16;
                    const scale = Math.max(1, Math.round(fSize / 7));
                    if (updates.width === undefined) {
                        obj.width = Math.max(16, (obj.text || "").length * 6 * scale);
                    }
                    if (updates.height === undefined) {
                        obj.height = Math.max(12, Math.round(fSize * 1.2));
                    }
                }
                this.setPendingUndoLabel(canvasId, `Transform Object (${obj.kind})`);
                this.saveCanvas(state);
                return obj;
            }
        }
        throw new Error(`Vector object '${objectId}' not found on canvas '${canvasId}'.`);
    }

    /**
     * Deforms a vector object (line, path, polygon, or primitive shape converted to path/curve):
     * - `mode === "bend_segment"`: Dragging anywhere on the segment of a line (or path edge) curves it
     *   through `(targetX, targetY)` while keeping both endpoints pinned at their current positions.
     * - `mode === "move_endpoint"`: Dragging an endpoint of a line (or path node) moves that endpoint
     *   to `(targetX, targetY)` while retaining the existing curve bend offset.
     */
    /**
     * Converts any primitive vector shape (`rect`, `circle`, `ellipse`, `polygon`, `star`, `line`)
     * into an explicit vertex/segment representation (`points`, `closed`, `d`) in-place when needed.
     */
    private ensureDeformableShapePoints(obj: VectorObjectSpec, forceConvertLine: boolean = false): void {
        if (obj.kind === "rect") {
            const rx = obj.x ?? 0;
            const ry = obj.y ?? 0;
            const rw = obj.width ?? 100;
            const rh = obj.height ?? 100;
            obj.kind = "path";
            obj.closed = true;
            obj.points = [
                { x: rx, y: ry },
                { x: rx + rw, y: ry },
                { x: rx + rw, y: ry + rh },
                { x: rx, y: ry + rh }
            ];
            obj.d = `M ${rx} ${ry} L ${rx + rw} ${ry} L ${rx + rw} ${ry + rh} L ${rx} ${ry + rh} Z`;
            return;
        }
        if (obj.kind === "circle" || obj.kind === "ellipse") {
            const cx = obj.x ?? 50;
            const cy = obj.y ?? 50;
            const rx = obj.kind === "circle" ? (obj.r ?? Math.round((obj.width ?? 80) / 2)) : (obj.rx ?? Math.round((obj.width ?? 100) / 2));
            const ry = obj.kind === "circle" ? (obj.r ?? Math.round((obj.height ?? 80) / 2)) : (obj.ry ?? Math.round((obj.height ?? 80) / 2));
            const segs = 8;
            const pts: { x: number; y: number }[] = [];
            for (let i = 0; i < segs; i++) {
                const ang = (i * 2 * Math.PI) / segs;
                pts.push({
                    x: Math.round((cx + rx * Math.cos(ang)) * 100) / 100,
                    y: Math.round((cy + ry * Math.sin(ang)) * 100) / 100
                });
            }
            obj.kind = "path";
            obj.closed = true;
            obj.points = pts;
            const dParts: string[] = [`M ${pts[0].x} ${pts[0].y}`];
            for (let i = 0; i < segs; i++) {
                const nextPt = pts[(i + 1) % segs];
                const midAng = ((i + 0.5) * 2 * Math.PI) / segs;
                const midOnCurveX = cx + rx * Math.cos(midAng);
                const midOnCurveY = cy + ry * Math.sin(midAng);
                const p0 = pts[i];
                const qx = Math.round((2 * midOnCurveX - 0.5 * (p0.x + nextPt.x)) * 100) / 100;
                const qy = Math.round((2 * midOnCurveY - 0.5 * (p0.y + nextPt.y)) * 100) / 100;
                dParts.push(`Q ${qx} ${qy} ${nextPt.x} ${nextPt.y}`);
            }
            dParts.push("Z");
            obj.d = dParts.join(" ");
            return;
        }
        if ((obj.kind === "polygon" || obj.kind === "star") && (!obj.points || obj.points.length < 3)) {
            const sides = Math.max(3, obj.sides ?? 5);
            const w = obj.width ?? (obj.r ? obj.r * 2 : 80);
            const h = obj.height ?? (obj.r ? obj.r * 2 : 80);
            const cx = (obj.x ?? 0) + w / 2;
            const cy = (obj.y ?? 0) + h / 2;
            const outerRx = w / 2;
            const outerRy = h / 2;
            const pts: { x: number; y: number }[] = [];
            if (obj.kind === "star") {
                const innerRatio = obj.innerRadius ? obj.innerRadius / Math.max(1, Math.min(outerRx, outerRy)) : 0.42;
                const totalVerts = sides * 2;
                for (let i = 0; i < totalVerts; i++) {
                    const ang = -Math.PI / 2 + (i * Math.PI) / sides;
                    const ratio = i % 2 === 0 ? 1 : innerRatio;
                    pts.push({
                        x: Math.round((cx + outerRx * ratio * Math.cos(ang)) * 100) / 100,
                        y: Math.round((cy + outerRy * ratio * Math.sin(ang)) * 100) / 100
                    });
                }
            } else {
                for (let i = 0; i < sides; i++) {
                    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
                    pts.push({
                        x: Math.round((cx + outerRx * Math.cos(ang)) * 100) / 100,
                        y: Math.round((cy + outerRy * Math.sin(ang)) * 100) / 100
                    });
                }
            }
            obj.closed = true;
            obj.points = pts;
            obj.d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
            return;
        }
        if (forceConvertLine && obj.kind === "line") {
            const x1 = obj.x ?? 0;
            const y1 = obj.y ?? 0;
            const x2 = obj.x2 ?? (x1 + (obj.width ?? 100));
            const y2 = obj.y2 ?? (y1 + (obj.height ?? 100));
            obj.kind = "path";
            obj.closed = false;
            obj.points = [
                { x: x1, y: y1 },
                { x: x2, y: y2 }
            ];
            if (obj.cx !== undefined && obj.cy !== undefined) {
                obj.d = `M ${x1} ${y1} Q ${obj.cx} ${obj.cy} ${x2} ${y2}`;
            } else {
                obj.d = `M ${x1} ${y1} L ${x2} ${y2}`;
            }
        }
        if (obj.kind === "path" && (!obj.points || obj.points.length === 0) && obj.d) {
            obj.points = this.parseSvgPathToPoints(obj.d);
        }
    }

    /**
     * Inspects the deformable nodes (vertices, segments, and quadratic control points) of any vector object.
     */
    public inspectVectorObjectNodes(
        canvasId: string,
        objectId: string,
        sharedObjectId?: string
    ): {
        objectId: string;
        kind: string;
        closed: boolean;
        points: { index: number; x: number; y: number }[];
        segments: {
            segmentIndex: number;
            fromPointIndex: number;
            toPointIndex: number;
            start: { x: number; y: number };
            end: { x: number; y: number };
            curved: boolean;
            controlPoint?: { x: number; y: number };
            midpoint: { x: number; y: number };
        }[];
        d?: string;
    } {
        const state = this.loadCanvas(canvasId);
        const searchLayers = sharedObjectId
            ? this.getSharedObjectOrThrow(state, sharedObjectId).layers
            : [
                  ...state.layers,
                  ...Object.values(state.sharedObjects).flatMap(s => s.layers)
              ];
        for (const layer of searchLayers) {
            if (layer.type !== "vector") continue;
            const found = layer.objects.find(o => o.id === objectId);
            if (!found) continue;
            const clone: VectorObjectSpec = JSON.parse(JSON.stringify(found));
            if (clone.kind === "line") {
                const x1 = clone.x ?? 0;
                const y1 = clone.y ?? 0;
                const x2 = clone.x2 ?? (x1 + (clone.width ?? 100));
                const y2 = clone.y2 ?? (y1 + (clone.height ?? 100));
                const curved = clone.cx !== undefined && clone.cy !== undefined;
                const midX = curved ? 0.25 * x1 + 0.5 * clone.cx! + 0.25 * x2 : (x1 + x2) / 2;
                const midY = curved ? 0.25 * y1 + 0.5 * clone.cy! + 0.25 * y2 : (y1 + y2) / 2;
                return {
                    objectId: found.id,
                    kind: found.kind,
                    closed: false,
                    points: [
                        { index: 0, x: x1, y: y1 },
                        { index: 1, x: x2, y: y2 }
                    ],
                    segments: [
                        {
                            segmentIndex: 0,
                            fromPointIndex: 0,
                            toPointIndex: 1,
                            start: { x: x1, y: y1 },
                            end: { x: x2, y: y2 },
                            curved,
                            ...(curved ? { controlPoint: { x: clone.cx!, y: clone.cy! } } : {}),
                            midpoint: { x: Math.round(midX * 100) / 100, y: Math.round(midY * 100) / 100 }
                        }
                    ]
                };
            }
            this.ensureDeformableShapePoints(clone);
            const pts = clone.points || [];
            const closed = Boolean(clone.closed);
            const segControls = new Map<number, { x: number; y: number }>();
            if (clone.d) {
                const tokens = clone.d.match(/[a-zA-Z]|[-+]?\d*\.?\d+/g) || [];
                let i = 0;
                let curSeg = -1;
                while (i < tokens.length) {
                    const tok = tokens[i++];
                    if (tok === "M") {
                        i += 2;
                        curSeg = 0;
                    } else if (tok === "L") {
                        i += 2;
                        curSeg++;
                    } else if (tok === "Q") {
                        const qx = parseFloat(tokens[i++] || "0");
                        const qy = parseFloat(tokens[i++] || "0");
                        i += 2;
                        if (curSeg >= 0) segControls.set(curSeg, { x: qx, y: qy });
                        curSeg++;
                    }
                }
            }
            const segCount = closed ? pts.length : Math.max(0, pts.length - 1);
            const segments = [];
            for (let s = 0; s < segCount; s++) {
                const nextIdx = (s + 1) % pts.length;
                const p0 = pts[s];
                const p1 = pts[nextIdx];
                const ctrl = segControls.get(s);
                const midX = ctrl ? 0.25 * p0.x + 0.5 * ctrl.x + 0.25 * p1.x : (p0.x + p1.x) / 2;
                const midY = ctrl ? 0.25 * p0.y + 0.5 * ctrl.y + 0.25 * p1.y : (p0.y + p1.y) / 2;
                segments.push({
                    segmentIndex: s,
                    fromPointIndex: s,
                    toPointIndex: nextIdx,
                    start: p0,
                    end: p1,
                    curved: Boolean(ctrl),
                    ...(ctrl ? { controlPoint: ctrl } : {}),
                    midpoint: { x: Math.round(midX * 100) / 100, y: Math.round(midY * 100) / 100 }
                });
            }
            return {
                objectId: found.id,
                kind: found.kind,
                closed,
                points: pts.map((p, idx) => ({ index: idx, x: p.x, y: p.y })),
                segments,
                d: clone.d
            };
        }
        throw new Error(`Vector object '${objectId}' not found on canvas '${canvasId}'.`);
    }

    /**
     * Deforms a vector object (line, path, polygon, star, rect, circle, or ellipse):
     * - `mode === "bend_segment"`: Curves a line or path/shape segment through `(targetX, targetY)` while keeping endpoints fixed.
     * - `mode === "move_endpoint"`: Moves an endpoint/vertex (`pointIndex`) to `(targetX, targetY)` while retaining existing curve offsets.
     * - `mode === "straighten_segment"`: Removes curvature from a bent line or path segment (`segmentIndex`).
     * - `mode === "add_vertex"`: Inserts a new vertex at `(targetX, targetY)` along segment `segmentIndex`.
     * - `mode === "remove_vertex"`: Removes vertex `pointIndex` from a path/polygon.
     * - `mode === "convert_to_path"`: Converts any primitive shape into an explicit editable path with vertices & segments.
     */
    public deformVectorObject(
        canvasId: string,
        objectId: string,
        action: {
            mode:
                | "bend_segment"
                | "move_endpoint"
                | "straighten_segment"
                | "add_vertex"
                | "remove_vertex"
                | "convert_to_path";
            pointIndex?: number;
            segmentIndex?: number;
            t?: number;
            targetX?: number;
            targetY?: number;
            sharedObjectId?: string;
        }
    ): VectorObjectSpec {
        const state = this.loadCanvas(canvasId);
        const searchLayers = action.sharedObjectId
            ? this.getSharedObjectOrThrow(state, action.sharedObjectId).layers
            : [
                  ...state.layers,
                  ...Object.values(state.sharedObjects).flatMap(s => s.layers)
              ];

        for (const layer of searchLayers) {
            if (layer.type !== "vector") continue;
            const obj = layer.objects.find(o => o.id === objectId);
            if (!obj) continue;

            if (action.mode === "convert_to_path") {
                this.ensureDeformableShapePoints(obj, true);
                obj.kind = "path";
                this.invalidateObjectCache(canvasId, obj.id);
                this.setPendingUndoLabel(canvasId, `Convert Vector to Path (${obj.id})`);
                this.saveCanvas(state);
                return obj;
            }

            // Convert rect/ellipse/circle/polygon/star to editable path/polygon if user or AI deforms it directly
            this.ensureDeformableShapePoints(obj, action.mode === "add_vertex" || action.mode === "remove_vertex");

            const targetX = Number(action.targetX ?? 0);
            const targetY = Number(action.targetY ?? 0);

            if (obj.kind === "line") {
                const x1 = obj.x ?? 0;
                const y1 = obj.y ?? 0;
                const x2 = obj.x2 ?? (x1 + (obj.width ?? 100));
                const y2 = obj.y2 ?? (y1 + (obj.height ?? 100));

                if (action.mode === "straighten_segment") {
                    delete obj.cx;
                    delete obj.cy;
                } else if (action.mode === "bend_segment") {
                    const t = Math.max(0.15, Math.min(0.85, action.t ?? 0.5));
                    const mt = 1 - t;
                    const denom = 2 * t * mt;
                    obj.cx = Math.round(((targetX - mt * mt * x1 - t * t * x2) / denom) * 100) / 100;
                    obj.cy = Math.round(((targetY - mt * mt * y1 - t * t * y2) / denom) * 100) / 100;
                } else {
                    // move_endpoint: move P0 (pointIndex === 0) or P1 (pointIndex === 1) while retaining the curve offset
                    const hadCurve = obj.cx !== undefined && obj.cy !== undefined;
                    const oldMidX = (x1 + x2) / 2;
                    const oldMidY = (y1 + y2) / 2;
                    const bendOffsetX = hadCurve ? (obj.cx! - oldMidX) : 0;
                    const bendOffsetY = hadCurve ? (obj.cy! - oldMidY) : 0;

                    if (action.pointIndex === 0) {
                        obj.x = Math.round(targetX * 100) / 100;
                        obj.y = Math.round(targetY * 100) / 100;
                    } else {
                        obj.x2 = Math.round(targetX * 100) / 100;
                        obj.y2 = Math.round(targetY * 100) / 100;
                    }

                    const newX1 = obj.x ?? x1;
                    const newY1 = obj.y ?? y1;
                    const newX2 = obj.x2 ?? x2;
                    const newY2 = obj.y2 ?? y2;
                    if (hadCurve) {
                        const newMidX = (newX1 + newX2) / 2;
                        const newMidY = (newY1 + newY2) / 2;
                        obj.cx = Math.round((newMidX + bendOffsetX) * 100) / 100;
                        obj.cy = Math.round((newMidY + bendOffsetY) * 100) / 100;
                    }
                    obj.width = Math.max(1, Math.abs(newX2 - newX1));
                    obj.height = Math.max(1, Math.abs(newY2 - newY1));
                }
            } else if ((obj.kind === "path" || obj.kind === "polygon" || obj.kind === "star") && obj.points && obj.points.length >= 2) {
                const pts = obj.points;
                if (action.mode === "add_vertex") {
                    const segIdx = Math.max(0, Math.min(pts.length - 1, action.segmentIndex ?? 0));
                    const nextIdx = (segIdx + 1) % pts.length;
                    const p0 = pts[segIdx];
                    const p1 = pts[nextIdx];
                    const splitT = Math.max(0.1, Math.min(0.9, action.t ?? 0.5));
                    const insertX = action.targetX !== undefined ? Math.round(targetX * 100) / 100 : Math.round((p0.x + (p1.x - p0.x) * splitT) * 100) / 100;
                    const insertY = action.targetY !== undefined ? Math.round(targetY * 100) / 100 : Math.round((p0.y + (p1.y - p0.y) * splitT) * 100) / 100;
                    const oldD = obj.d;
                    pts.splice(segIdx + 1, 0, { x: insertX, y: insertY });
                    obj.kind = "path";
                    obj.d = this.rebuildPathDAfterVertexChange(pts, Boolean(obj.closed), oldD, "insert", segIdx);
                } else if (action.mode === "remove_vertex") {
                    if (pts.length > 2) {
                        const idx = Math.max(0, Math.min(pts.length - 1, action.pointIndex ?? pts.length - 1));
                        const oldD = obj.d;
                        pts.splice(idx, 1);
                        obj.kind = "path";
                        obj.d = this.rebuildPathDAfterVertexChange(pts, Boolean(obj.closed), oldD, "remove", idx);
                    }
                } else if (action.mode === "straighten_segment") {
                    const segIdx = Math.max(0, Math.min(pts.length - 1, action.segmentIndex ?? 0));
                    obj.kind = "path";
                    obj.d = this.rebuildPathDFromDeformedPoints(
                        pts,
                        Boolean(obj.closed),
                        segIdx,
                        null,
                        undefined,
                        0,
                        0,
                        obj.d
                    );
                } else if (action.mode === "move_endpoint") {
                    const idx = Math.max(0, Math.min(pts.length - 1, action.pointIndex ?? 0));
                    const oldPt = { ...pts[idx] };
                    const newPt = {
                        x: Math.round(targetX * 100) / 100,
                        y: Math.round(targetY * 100) / 100
                    };
                    pts[idx] = newPt;

                    // If obj.d already has quadratic curves, update endpoint & shift adjacent Q control points to retain curve
                    if (obj.kind === "path" && obj.d && /Q\s/i.test(obj.d)) {
                        const dx = newPt.x - oldPt.x;
                        const dy = newPt.y - oldPt.y;
                        obj.d = this.rebuildPathDFromDeformedPoints(pts, Boolean(obj.closed), undefined, undefined, idx, dx, dy, obj.d);
                    } else if (obj.kind === "path") {
                        obj.d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + (obj.closed ? " Z" : "");
                    }
                } else {
                    // bend_segment on path/polygon/star
                    const segIdx = Math.max(0, Math.min(pts.length - 1, action.segmentIndex ?? 0));
                    const nextIdx = (segIdx + 1) % pts.length;
                    const p0 = pts[segIdx];
                    const p1 = pts[nextIdx];
                    const t = Math.max(0.15, Math.min(0.85, action.t ?? 0.5));
                    const mt = 1 - t;
                    const denom = 2 * t * mt;
                    const qx = Math.round(((targetX - mt * mt * p0.x - t * t * p1.x) / denom) * 100) / 100;
                    const qy = Math.round(((targetY - mt * mt * p0.y - t * t * p1.y) / denom) * 100) / 100;
                    obj.kind = "path";
                    obj.d = this.rebuildPathDFromDeformedPoints(pts, Boolean(obj.closed), segIdx, { x: qx, y: qy }, undefined, 0, 0, obj.d);
                }
            }

            this.invalidateObjectCache(canvasId, obj.id);
            this.setPendingUndoLabel(canvasId, `Deform Vector (${obj.kind})`);
            this.saveCanvas(state);
            return obj;
        }

        throw new Error(`Vector object '${objectId}' not found on canvas '${canvasId}'.`);
    }

    private rebuildPathDAfterVertexChange(
        pts: { x: number; y: number }[],
        closed: boolean,
        existingD: string | undefined,
        changeType: "insert" | "remove",
        targetIdx: number
    ): string {
        const oldControls = new Map<number, { x: number; y: number }>();
        if (existingD) {
            const tokens = existingD.match(/[a-zA-Z]|[-+]?\d*\.?\d+/g) || [];
            let i = 0;
            let curSeg = -1;
            while (i < tokens.length) {
                const tok = tokens[i++];
                if (tok === "M") {
                    i += 2;
                    curSeg = 0;
                } else if (tok === "L") {
                    i += 2;
                    curSeg++;
                } else if (tok === "Q") {
                    const cx = parseFloat(tokens[i++] || "0");
                    const cy = parseFloat(tokens[i++] || "0");
                    i += 2;
                    if (curSeg >= 0) {
                        oldControls.set(curSeg, { x: cx, y: cy });
                    }
                    curSeg++;
                }
            }
        }
        const newControls = new Map<number, { x: number; y: number }>();
        for (const [seg, ctrl] of oldControls.entries()) {
            if (changeType === "insert") {
                if (seg < targetIdx) {
                    newControls.set(seg, ctrl);
                } else if (seg > targetIdx) {
                    newControls.set(seg + 1, ctrl);
                }
            } else {
                if (seg < targetIdx - 1) {
                    newControls.set(seg, ctrl);
                } else if (seg > targetIdx) {
                    newControls.set(seg - 1, ctrl);
                }
            }
        }
        const parts: string[] = [`M ${pts[0].x} ${pts[0].y}`];
        const segCount = closed ? pts.length : pts.length - 1;
        for (let s = 0; s < segCount; s++) {
            const nextPt = pts[(s + 1) % pts.length];
            const ctrl = newControls.get(s);
            if (ctrl) {
                parts.push(`Q ${ctrl.x} ${ctrl.y} ${nextPt.x} ${nextPt.y}`);
            } else if (s < pts.length - 1 || closed) {
                parts.push(`L ${nextPt.x} ${nextPt.y}`);
            }
        }
        if (closed) parts.push("Z");
        return parts.join(" ");
    }

    private rebuildPathDFromDeformedPoints(
        pts: { x: number; y: number }[],
        closed: boolean,
        bentSegIdx?: number,
        bentControl?: { x: number; y: number } | null,
        movedPtIdx?: number,
        movedDx: number = 0,
        movedDy: number = 0,
        existingD?: string
    ): string {
        // Parse existing segment control points if `existingD` had `Q cx cy x y` commands
        const segControls = new Map<number, { x: number; y: number }>();
        if (existingD) {
            const tokens = existingD.match(/[a-zA-Z]|[-+]?\d*\.?\d+/g) || [];
            let i = 0;
            let curSeg = -1;
            while (i < tokens.length) {
                const tok = tokens[i++];
                if (tok === "M") {
                    i += 2;
                    curSeg = 0;
                } else if (tok === "L") {
                    i += 2;
                    curSeg++;
                } else if (tok === "Q") {
                    const cx = parseFloat(tokens[i++] || "0");
                    const cy = parseFloat(tokens[i++] || "0");
                    i += 2;
                    if (curSeg >= 0) {
                        segControls.set(curSeg, { x: cx, y: cy });
                    }
                    curSeg++;
                }
            }
        }
        if (bentSegIdx !== undefined) {
            if (bentControl === null) {
                segControls.delete(bentSegIdx);
            } else if (bentControl) {
                segControls.set(bentSegIdx, bentControl);
            }
        }
        if (movedPtIdx !== undefined && (movedDx !== 0 || movedDy !== 0)) {
            // Adjust control points of segments connected to movedPtIdx by half the endpoint translation so the curve is retained
            const prevSeg = movedPtIdx > 0 ? movedPtIdx - 1 : (closed ? pts.length - 1 : -1);
            if (prevSeg >= 0 && segControls.has(prevSeg)) {
                const c = segControls.get(prevSeg)!;
                segControls.set(prevSeg, {
                    x: Math.round((c.x + movedDx * 0.5) * 100) / 100,
                    y: Math.round((c.y + movedDy * 0.5) * 100) / 100
                });
            }
            if (segControls.has(movedPtIdx)) {
                const c = segControls.get(movedPtIdx)!;
                segControls.set(movedPtIdx, {
                    x: Math.round((c.x + movedDx * 0.5) * 100) / 100,
                    y: Math.round((c.y + movedDy * 0.5) * 100) / 100
                });
            }
        }

        const parts: string[] = [`M ${pts[0].x} ${pts[0].y}`];
        const segCount = closed ? pts.length : pts.length - 1;
        for (let s = 0; s < segCount; s++) {
            const nextPt = pts[(s + 1) % pts.length];
            const ctrl = segControls.get(s);
            if (ctrl) {
                parts.push(`Q ${ctrl.x} ${ctrl.y} ${nextPt.x} ${nextPt.y}`);
            } else if (s < pts.length - 1 || closed) {
                parts.push(`L ${nextPt.x} ${nextPt.y}`);
            }
        }
        if (closed) parts.push("Z");
        return parts.join(" ");
    }

    public booleanOp(
        canvasId: string,
        layerId: string | undefined,
        operation: "union" | "difference" | "intersection" | "exclusion",
        objectIdA: string,
        objectIdB: string,
        newObjectId?: string,
        sharedObjectId?: string
    ): VectorObjectSpec {
        const state = this.loadCanvas(canvasId);
        const layer = this.findLayer(state, layerId, "vector", sharedObjectId);
        const idxA = layer.objects.findIndex(o => o.id === objectIdA);
        const idxB = layer.objects.findIndex(o => o.id === objectIdB);
        if (idxA === -1 || idxB === -1) {
            throw new Error(`Boolean operation requires both '${objectIdA}' and '${objectIdB}' to exist in layer '${layer.id}'.`);
        }

        const shapeA = layer.objects[idxA];
        const shapeB = layer.objects[idxB];
        const bboxA = this.computeObjectBoundingBox(shapeA, state);
        const bboxB = this.computeObjectBoundingBox(shapeB, state);
        const minX = Math.min(bboxA.x, bboxB.x);
        const minY = Math.min(bboxA.y, bboxB.y);
        const maxX = Math.max(bboxA.x + bboxA.width, bboxB.x + bboxB.width);
        const maxY = Math.max(bboxA.y + bboxA.height, bboxB.y + bboxB.height);

        const combinedObj: VectorObjectSpec = {
            id: newObjectId || `obj_${operation}_${Date.now() % 10000}`,
            kind: "boolean",
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
            fill: shapeA.fill ?? "#3b82f6",
            stroke: shapeA.stroke ?? "none",
            strokeWidth: shapeA.strokeWidth ?? 1,
            opacity: shapeA.opacity ?? 1,
            booleanOp: {
                operation,
                shapeA: JSON.parse(JSON.stringify(shapeA)),
                shapeB: JSON.parse(JSON.stringify(shapeB))
            }
        };

        layer.objects = layer.objects.filter(o => o.id !== objectIdA && o.id !== objectIdB);
        layer.objects.push(combinedObj);
        this.saveCanvas(state);
        return combinedObj;
    }

    public pathOperation(
        canvasId: string,
        op: "union" | "difference" | "intersection" | "exclusion" | "offset" | "simplify",
        opts: {
            targetIds: string[];
            offsetDistance?: number;
            simplifyTolerance?: number;
            sharedObjectId?: string;
            layerId?: string;
        }
    ): VectorObjectSpec {
        const state = this.loadCanvas(canvasId);
        if (op === "union" || op === "difference" || op === "intersection" || op === "exclusion") {
            const [idA, idB] = opts.targetIds;
            if (!idA || !idB) {
                throw new Error(`Boolean ${op} requires two targetIds.`);
            }
            const res = this.booleanOp(canvasId, opts.layerId, op, idA, idB, undefined, opts.sharedObjectId);
            return res;
        }
        const targetId = opts.targetIds[0];
        const allLayers = [
            ...state.layers,
            ...Object.values(state.sharedObjects).flatMap(s => s.layers)
        ];
        for (const layer of allLayers) {
            const obj = layer.objects.find(o => o.id === targetId);
            if (!obj) continue;
            if (op === "offset") {
                const d = opts.offsetDistance ?? 4;
                if (obj.kind === "rect") {
                    obj.x = (obj.x ?? 0) - d;
                    obj.y = (obj.y ?? 0) - d;
                    obj.width = Math.max(2, (obj.width ?? 50) + d * 2);
                    obj.height = Math.max(2, (obj.height ?? 50) + d * 2);
                } else if (obj.kind === "circle") {
                    obj.r = Math.max(2, (obj.r ?? 25) + d);
                } else if (obj.points && obj.points.length > 0) {
                    const cx = obj.points.reduce((s, p) => s + p.x, 0) / obj.points.length;
                    const cy = obj.points.reduce((s, p) => s + p.y, 0) / obj.points.length;
                    obj.points = obj.points.map(p => {
                        const dx = p.x - cx;
                        const dy = p.y - cy;
                        const len = Math.max(1, Math.hypot(dx, dy));
                        return { x: Math.round(p.x + (dx / len) * d), y: Math.round(p.y + (dy / len) * d) };
                    });
                }
            } else if (op === "simplify" && obj.points && obj.points.length > 3) {
                obj.points = obj.points.filter((_, idx) => idx === 0 || idx === obj.points!.length - 1 || idx % 2 === 0);
            }
            this.saveCanvas(state);
            return obj;
        }
        throw new Error(`Target object '${targetId}' not found for pathOperation '${op}'.`);
    }

    public async runInkscapeAction(canvasId: string, layerId: string | undefined, actions: string[]): Promise<string> {
        const state = this.loadCanvas(canvasId);
        const layer = this.findLayer(state, layerId, "vector");
        const svgPath = this.getVectorSvgPath(canvasId, layer.id);
        this.saveCanvas(state);

        if (this.inkscapeBin && fs.existsSync(this.inkscapeBin)) {
            try {
                const actionStr = actions.join("; ");
                const { stdout, stderr } = await execFileAsync(
                    this.inkscapeBin,
                    [`--actions=${actionStr}`, svgPath],
                    { timeout: 15000 }
                );
                return `Inkscape CLI executed actions [${actionStr}] on ${svgPath}. Output: ${(stdout || stderr || "OK").trim()}`;
            } catch (err: any) {
                return `Inkscape CLI warning: ${err.message} (SVG saved at ${svgPath})`;
            }
        }
        return `Vector SVG updated at ${svgPath} with actions [${actions.join("; ")}].`;
    }

    // ============================================================================
    // 4. Raster Tools (GIMP / Pixel & Compositing Backend)
    // ============================================================================

    private isPointSelected(sel: SelectionMaskSpec, x: number, y: number): boolean {
        if (!sel || sel.mode === "none") return true;
        let inside = false;
        if (sel.mode === "rect") {
            inside = x >= sel.x && x < sel.x + sel.width && y >= sel.y && y < sel.y + sel.height;
        } else if (sel.mode === "ellipse") {
            const rx = sel.width / 2;
            const ry = sel.height / 2;
            const cx = sel.x + rx;
            const cy = sel.y + ry;
            if (rx > 0 && ry > 0) {
                const dx = (x - cx) / rx;
                const dy = (y - cy) / ry;
                inside = dx * dx + dy * dy <= 1;
            }
        }
        return sel.inverted ? !inside : inside;
    }

    public rasterSelection(
        canvasId: string,
        op: "rect" | "ellipse" | "clear" | "invert",
        bounds?: BoundingBox
    ): SelectionMaskSpec {
        const state = this.loadCanvas(canvasId);
        if (op === "clear") {
            state.selection = { mode: "none", inverted: false, x: 0, y: 0, width: state.width, height: state.height };
        } else if (op === "invert") {
            state.selection.inverted = !state.selection.inverted;
        } else {
            state.selection = {
                mode: op,
                inverted: false,
                x: bounds?.x ?? 0,
                y: bounds?.y ?? 0,
                width: bounds?.width ?? state.width,
                height: bounds?.height ?? state.height
            };
        }
        this.saveCanvas(state);
        return state.selection;
    }

    public rasterStroke(
        canvasId: string,
        layerId: string | undefined,
        spec: {
            tool?: "brush" | "pencil" | "airbrush" | "eraser";
            points: { x: number; y: number }[];
            color?: string;
            size?: number;
            hardness?: number;
            opacity?: number;
            frame?: number;
            sharedObjectId?: string;
        }
    ): { layerId: string; pointsDrawn: number; boundingBox: BoundingBox } {
        const state = this.loadCanvas(canvasId);
        const container = spec.sharedObjectId ? this.getSharedObjectOrThrow(state, spec.sharedObjectId) : state;
        const layer = this.findLayer(state, layerId, "raster", spec.sharedObjectId);
        const buf = this.loadRasterBuffer(state, layer.id, container.width, container.height, spec.frame, spec.sharedObjectId);

        const tool = spec.tool || "brush";
        const color = parseColor(spec.color || "#000000");
        const radius = Math.max(0.5, (spec.size ?? 6) / 2);
        const hardness = spec.hardness ?? (tool === "pencil" ? 1.0 : tool === "airbrush" ? 0.35 : 0.8);
        const opacity = Math.max(0, Math.min(1, spec.opacity ?? (tool === "airbrush" ? 0.5 : 1.0)));

        const pts = spec.points || [];
        if (pts.length === 0) {
            throw new Error("rasterStroke requires at least 1 coordinate point.");
        }

        const stampDab = (cx: number, cy: number) => {
            const minX = Math.max(0, Math.floor(cx - radius - 1));
            const maxX = Math.min(container.width - 1, Math.ceil(cx + radius + 1));
            const minY = Math.max(0, Math.floor(cy - radius - 1));
            const maxY = Math.min(container.height - 1, Math.ceil(cy + radius + 1));

            for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                    if (!spec.sharedObjectId && !this.isPointSelected(state.selection, px, py)) continue;
                    const dist = Math.hypot(px - cx, py - cy);
                    if (dist > radius) continue;

                    let falloff = 1.0;
                    if (tool !== "pencil" && hardness < 1.0 && radius > 1) {
                        const normDist = dist / radius;
                        if (normDist > hardness) {
                            falloff = Math.max(0, 1 - (normDist - hardness) / (1 - hardness));
                        }
                    }

                    const idx = (py * container.width + px) * 4;
                    const effAlpha = (color.a / 255) * opacity * falloff;

                    if (tool === "eraser") {
                        buf[idx + 3] = Math.max(0, Math.round(buf[idx + 3] * (1 - effAlpha)));
                    } else {
                        this.blendPixelInPlace(buf, idx, color.r, color.g, color.b, Math.round(effAlpha * 255), "normal");
                    }
                }
            }
        };

        if (pts.length === 1) {
            stampDab(pts[0].x, pts[0].y);
        } else {
            const stepDist = Math.max(0.5, radius * 0.35);
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i];
                const p1 = pts[i + 1];
                const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
                const steps = Math.max(1, Math.ceil(segLen / stepDist));
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    stampDab(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t);
                }
            }
        }

        if (spec.frame !== undefined && spec.frame > 0) {
            if (!layer.celFrames) layer.celFrames = [];
            if (!layer.celFrames.includes(spec.frame)) {
                layer.celFrames.push(spec.frame);
                layer.celFrames.sort((a, b) => a - b);
            }
            const timeline = this.getTimelineForContainer(state, spec.sharedObjectId);
            if (spec.frame + 1 > timeline.durationFrames) {
                timeline.durationFrames = spec.frame + 1;
            }
            this.ensureRasterCelTrackKeyframes(timeline, layer);
        }

        this.saveRasterBuffer(state, layer.id, buf, spec.frame, spec.sharedObjectId);
        this.setPendingUndoLabel(canvasId, `Paint ${tool}`);
        this.saveCanvas(state);

        return {
            layerId: layer.id,
            pointsDrawn: pts.length,
            boundingBox: this.computeRasterBoundingBox(buf, container.width, container.height)
        };
    }

    public rasterFill(
        canvasId: string,
        layerId: string | undefined,
        spec: {
            fillType?: "flood" | "linear_gradient" | "radial_gradient";
            x?: number;
            y?: number;
            x2?: number;
            y2?: number;
            radius?: number;
            color?: string;
            colorEnd?: string;
            tolerance?: number;
            frame?: number;
            sharedObjectId?: string;
        }
    ): { layerId: string; pixelsFilled: number } {
        const state = this.loadCanvas(canvasId);
        const container = spec.sharedObjectId ? this.getSharedObjectOrThrow(state, spec.sharedObjectId) : state;
        const layer = this.findLayer(state, layerId, "raster", spec.sharedObjectId);
        const buf = this.loadRasterBuffer(state, layer.id, container.width, container.height, spec.frame, spec.sharedObjectId);
        const fillType = spec.fillType || "flood";
        let pixelsFilled = 0;

        if (fillType === "linear_gradient" || fillType === "radial_gradient") {
            const cStart = parseColor(spec.color || "#000000");
            const cEnd = parseColor(spec.colorEnd || "#ffffff");
            const x1 = spec.x ?? 0;
            const y1 = spec.y ?? 0;
            const x2 = spec.x2 ?? container.width;
            const y2 = spec.y2 ?? container.height;
            const gradRadius = spec.radius ?? Math.hypot(x2 - x1, y2 - y1);

            for (let py = 0; py < container.height; py++) {
                for (let px = 0; px < container.width; px++) {
                    if (!spec.sharedObjectId && !this.isPointSelected(state.selection, px, py)) continue;
                    let t = 0;
                    if (fillType === "linear_gradient") {
                        const dx = x2 - x1;
                        const dy = y2 - y1;
                        const lenSq = dx * dx + dy * dy;
                        t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
                    } else {
                        t = gradRadius > 0 ? Math.hypot(px - x1, py - y1) / gradRadius : 0;
                    }
                    t = Math.max(0, Math.min(1, t));
                    const r = Math.round(cStart.r + (cEnd.r - cStart.r) * t);
                    const g = Math.round(cStart.g + (cEnd.g - cStart.g) * t);
                    const b = Math.round(cStart.b + (cEnd.b - cStart.b) * t);
                    const a = Math.round(cStart.a + (cEnd.a - cStart.a) * t);
                    const idx = (py * container.width + px) * 4;
                    this.blendPixelInPlace(buf, idx, r, g, b, a, "normal");
                    pixelsFilled++;
                }
            }
        } else {
            const startX = Math.max(0, Math.min(container.width - 1, Math.floor(spec.x ?? 0)));
            const startY = Math.max(0, Math.min(container.height - 1, Math.floor(spec.y ?? 0)));
            const fillColor = parseColor(spec.color || "#000000");
            const tolerance = spec.tolerance ?? 16;

            const startIdx = (startY * container.width + startX) * 4;
            const targetR = buf[startIdx];
            const targetG = buf[startIdx + 1];
            const targetB = buf[startIdx + 2];
            const targetA = buf[startIdx + 3];

            const visited = new Uint8Array(container.width * container.height);
            const queue: number[] = [startX, startY];
            visited[startY * container.width + startX] = 1;

            const matchesTarget = (idx: number) => {
                return (
                    Math.abs(buf[idx] - targetR) <= tolerance &&
                    Math.abs(buf[idx + 1] - targetG) <= tolerance &&
                    Math.abs(buf[idx + 2] - targetB) <= tolerance &&
                    Math.abs(buf[idx + 3] - targetA) <= tolerance
                );
            };

            while (queue.length > 0) {
                const cy = queue.pop()!;
                const cx = queue.pop()!;
                if (!spec.sharedObjectId && !this.isPointSelected(state.selection, cx, cy)) continue;

                const pIdx = (cy * container.width + cx) * 4;
                buf[pIdx] = fillColor.r;
                buf[pIdx + 1] = fillColor.g;
                buf[pIdx + 2] = fillColor.b;
                buf[pIdx + 3] = fillColor.a;
                pixelsFilled++;

                const neighbors = [
                    [cx + 1, cy],
                    [cx - 1, cy],
                    [cx, cy + 1],
                    [cx, cy - 1]
                ];
                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < container.width && ny >= 0 && ny < container.height) {
                        const vPos = ny * container.width + nx;
                        if (!visited[vPos]) {
                            visited[vPos] = 1;
                            if (matchesTarget(vPos * 4)) {
                                queue.push(nx, ny);
                            }
                        }
                    }
                }
            }
        }

        if (spec.frame !== undefined && spec.frame > 0) {
            if (!layer.celFrames) layer.celFrames = [];
            if (!layer.celFrames.includes(spec.frame)) {
                layer.celFrames.push(spec.frame);
                layer.celFrames.sort((a, b) => a - b);
            }
            const timeline = this.getTimelineForContainer(state, spec.sharedObjectId);
            if (spec.frame + 1 > timeline.durationFrames) {
                timeline.durationFrames = spec.frame + 1;
            }
            this.ensureRasterCelTrackKeyframes(timeline, layer);
        }

        this.saveRasterBuffer(state, layer.id, buf, spec.frame, spec.sharedObjectId);
        this.setPendingUndoLabel(canvasId, `Fill (${fillType})`);
        this.saveCanvas(state);
        return { layerId: layer.id, pixelsFilled };
    }

    public rasterFilter(
        canvasId: string,
        layerId: string | undefined,
        filterTypeOrParams:
            | string
            | RasterFilterParams,
        paramsOrFrame: Record<string, any> | number = {},
        sharedObjectId?: string
    ): { layerId: string; filterType: string } {
        const filterType =
            typeof filterTypeOrParams === "string"
                ? filterTypeOrParams
                : filterTypeOrParams.filterType;
        const params: Record<string, any> =
            typeof filterTypeOrParams === "object" && filterTypeOrParams !== null
                ? {
                      ...filterTypeOrParams,
                      frame: typeof paramsOrFrame === "number" ? paramsOrFrame : filterTypeOrParams.frame
                  }
                : typeof paramsOrFrame === "object" && paramsOrFrame !== null
                  ? paramsOrFrame
                  : {};
        const state = this.loadCanvas(canvasId);
        // Ensure any custom filters saved in this canvas state are registered in RasterFilterRegistry
        for (const cp of state.customFilterPresets || []) {
            if (!RasterFilterRegistry.hasFilter(cp.id)) {
                RasterFilterRegistry.registerCustomPreset(cp);
            }
        }
        const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
        const layer = this.findLayer(state, layerId, "raster", sharedObjectId);
        const src = this.loadRasterBuffer(state, layer.id, container.width, container.height, params.frame, sharedObjectId);

        let dst: Buffer;
        let filterLabel = filterType;
        if (typeof params.customCode === "string" && params.customCode.trim() && !RasterFilterRegistry.hasFilter(filterType)) {
            dst = Buffer.from(src);
            const effSel = sharedObjectId ? undefined : state.selection;
            AbstractRasterFilter.evaluateFilterScript(params.customCode, src, dst, container.width, container.height, params, effSel);
        } else {
            const filterInstance = RasterFilterRegistry.getFilter(filterType);
            filterLabel = filterInstance.displayName;
            dst = filterInstance.apply(
                src,
                container.width,
                container.height,
                state.selection,
                params,
                Boolean(sharedObjectId)
            );
        }

        if (params.frame !== undefined && params.frame > 0) {
            if (!layer.celFrames) layer.celFrames = [];
            if (!layer.celFrames.includes(params.frame)) {
                layer.celFrames.push(params.frame);
                layer.celFrames.sort((a, b) => a - b);
            }
            const timeline = this.getTimelineForContainer(state, sharedObjectId);
            if (params.frame + 1 > timeline.durationFrames) {
                timeline.durationFrames = params.frame + 1;
            }
            this.ensureRasterCelTrackKeyframes(timeline, layer);
        }

        this.saveRasterBuffer(state, layer.id, dst, params.frame, sharedObjectId);
        this.setPendingUndoLabel(canvasId, `Filter (${filterLabel})`);
        this.saveCanvas(state);
        return { layerId: layer.id, filterType };
    }

    // ============================================================================
    // 4b. Non-Destructive Dynamic Filters, Object Cached Canvases, & Edit Bypass
    // ============================================================================

    /**
     * Marks a vector object (`VectorObjectSpec`) or `<ObjectRef>` as actively being edited (`isEditing = true`)
     * or finished editing (`isEditing = false`).
     * While an object is being edited, its attached filters stop rendering so interactive editing is fast and crisp.
     */
    public setObjectEditing(canvasId: string, objectId: string | null | undefined, isEditing: boolean): void {
        let set = this.editingObjectsByCanvas.get(canvasId);
        if (!set) {
            set = new Set<string>();
            this.editingObjectsByCanvas.set(canvasId, set);
        }
        if (!objectId) {
            if (!isEditing) set.clear();
            return;
        }
        if (isEditing) {
            set.add(objectId);
        } else {
            set.delete(objectId);
            this.invalidateObjectCache(canvasId, objectId);
        }
    }

    public isObjectEditing(canvasId: string, objectId: string, opts?: RenderFilterContextOptions): boolean {
        if (opts?.forExport) return false;
        if (opts?.editingObjectIds) {
            if (opts.editingObjectIds instanceof Set && opts.editingObjectIds.has(objectId)) return true;
            if (Array.isArray(opts.editingObjectIds) && opts.editingObjectIds.includes(objectId)) return true;
        }
        const set = this.editingObjectsByCanvas.get(canvasId);
        return Boolean(set && set.has(objectId));
    }

    /**
     * Marks a Shared Object (`SharedObjectCanvasSpec`) as actively being edited (`isEditing = true`)
     * or finished editing (`isEditing = false`).
     * While a Shared Object is being edited, filters attached to it (or its `<ObjectRef>` instances) stop rendering.
     */
    public setSharedObjectEditing(canvasId: string, sharedObjectId: string | null | undefined, isEditing: boolean): void {
        let set = this.editingSharedObjectsByCanvas.get(canvasId);
        if (!set) {
            set = new Set<string>();
            this.editingSharedObjectsByCanvas.set(canvasId, set);
        }
        if (!sharedObjectId) {
            if (!isEditing) set.clear();
            return;
        }
        if (isEditing) {
            set.add(sharedObjectId);
        } else {
            set.delete(sharedObjectId);
            this.invalidateObjectCache(canvasId, sharedObjectId);
        }
    }

    public isSharedObjectEditing(canvasId: string, sharedObjectId: string, opts?: RenderFilterContextOptions): boolean {
        if (opts?.forExport) return false;
        if (opts?.editingSharedObjectIds) {
            if (opts.editingSharedObjectIds instanceof Set && opts.editingSharedObjectIds.has(sharedObjectId)) return true;
            if (Array.isArray(opts.editingSharedObjectIds) && opts.editingSharedObjectIds.includes(sharedObjectId)) return true;
        }
        const set = this.editingSharedObjectsByCanvas.get(canvasId);
        return Boolean(set && set.has(sharedObjectId));
    }

    public invalidateObjectCache(canvasId: string, targetId?: string): void {
        if (!targetId) {
            for (const key of Array.from(this.objectRenderCache.keys())) {
                if (key.startsWith(`${canvasId}::`)) {
                    this.objectRenderCache.delete(key);
                }
            }
            return;
        }
        for (const key of Array.from(this.objectRenderCache.keys())) {
            if (key.startsWith(`${canvasId}::`) && key.endsWith(`::${targetId}`)) {
                this.objectRenderCache.delete(key);
            }
        }
    }

    public getObjectCacheStats(
        canvasId: string,
        objectId?: string
    ): {
        cachedObjectCount: number;
        entry?: {
            width: number;
            height: number;
            renderCount: number;
            filterEvalCount: number;
            hasFilteredCache: boolean;
        };
    } {
        let count = 0;
        let matched:
            | {
                  width: number;
                  height: number;
                  renderCount: number;
                  filterEvalCount: number;
                  hasFilteredCache: boolean;
              }
            | undefined;
        for (const [k, v] of this.objectRenderCache.entries()) {
            if (k.startsWith(`${canvasId}::`)) {
                count++;
                if (objectId && k.endsWith(`::${objectId}`)) {
                    matched = {
                        width: v.width,
                        height: v.height,
                        renderCount: v.renderCount,
                        filterEvalCount: v.filterEvalCount,
                        hasFilteredCache: Boolean(v.filteredRgba)
                    };
                }
            }
        }
        return { cachedObjectCount: count, ...(matched ? { entry: matched } : {}) };
    }

    private findFilterTarget(
        state: ArtCanvasState,
        targetType: "layer" | "object" | "shared_object",
        targetId?: string,
        sharedObjectId?: string
    ): {
        holder: { attachedFilters?: AttachedFilterSpec[]; filtersEnabled?: boolean; id: string; name?: string };
        label: string;
    } {
        if (targetType === "shared_object") {
            const sid = targetId || sharedObjectId;
            if (!sid) throw new Error("shared_object target requires targetId or sharedObjectId.");
            const shared = this.getSharedObjectOrThrow(state, sid);
            return { holder: shared, label: `Shared Object '${shared.name}'` };
        }
        const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
        if (targetType === "layer") {
            const layer = targetId
                ? container.layers.find(l => l.id === targetId || l.name === targetId)
                : container.layers[0];
            if (!layer) throw new Error(`Layer '${targetId || "default"}' not found.`);
            return { holder: layer, label: `Layer '${layer.name}'` };
        }
        // targetType === "object"
        const searchLayers = [
            ...container.layers,
            ...state.layers,
            ...Object.values(state.sharedObjects || {}).flatMap(s => s.layers)
        ];
        for (const l of searchLayers) {
            const found = targetId ? l.objects.find(o => o.id === targetId) : l.objects[0];
            if (found) {
                return { holder: found, label: `Object '${found.id}' (${found.kind})` };
            }
        }
        throw new Error(`Object '${targetId || "default"}' not found.`);
    }

    /**
     * Attaches a non-destructive dynamic filter to a layer (raster or vector), vector object, or shared object.
     * Attached filters render dynamically without touching the underlying raster pixels or vector geometry,
     * and are automatically rendered when exporting.
     */
    public attachFilter(
        canvasId: string,
        spec: {
            targetType: "layer" | "object" | "shared_object";
            targetId?: string;
            sharedObjectId?: string;
            filterType: string;
            name?: string;
            params?: Record<string, any>;
            enabled?: boolean;
            id?: string;
        }
    ): AttachedFilterSpec {
        const state = this.loadCanvas(canvasId);
        for (const cp of state.customFilterPresets || []) {
            if (!RasterFilterRegistry.hasFilter(cp.id)) {
                RasterFilterRegistry.registerCustomPreset(cp);
            }
        }
        const { holder, label } = this.findFilterTarget(state, spec.targetType, spec.targetId, spec.sharedObjectId);
        if (!holder.attachedFilters) holder.attachedFilters = [];
        if (holder.filtersEnabled === undefined) holder.filtersEnabled = true;

        let displayName = spec.name;
        if (!displayName) {
            if (RasterFilterRegistry.hasFilter(spec.filterType)) {
                displayName = RasterFilterRegistry.getFilter(spec.filterType).displayName;
            } else {
                displayName = spec.filterType;
            }
        }

        const attached: AttachedFilterSpec = {
            id: spec.id || `af_${spec.filterType}_${holder.attachedFilters.length + 1}_${Date.now() % 10000}`,
            filterType: spec.filterType,
            name: displayName,
            enabled: spec.enabled !== false,
            params: {
                ...(spec.params || {}),
                filterType: spec.filterType
            }
        };
        holder.attachedFilters.push(attached);
        this.invalidateObjectCache(canvasId, holder.id);
        this.setPendingUndoLabel(canvasId, `Attach Filter (${displayName} -> ${label})`);
        this.saveCanvas(state);
        return attached;
    }

    /**
     * Updates parameters, enabled state, or stack ordering of an attached dynamic filter.
     */
    public updateAttachedFilter(
        canvasId: string,
        spec: {
            targetType: "layer" | "object" | "shared_object";
            targetId?: string;
            sharedObjectId?: string;
            filterId: string;
            params?: Record<string, any>;
            enabled?: boolean;
            moveDirection?: "up" | "down";
        }
    ): AttachedFilterSpec {
        const state = this.loadCanvas(canvasId);
        const { holder, label } = this.findFilterTarget(state, spec.targetType, spec.targetId, spec.sharedObjectId);
        const list = holder.attachedFilters || [];
        const idx = list.findIndex(f => f.id === spec.filterId || f.filterType === spec.filterId);
        if (idx === -1) {
            throw new Error(`Attached filter '${spec.filterId}' not found on ${label}.`);
        }
        const item = list[idx];
        if (spec.enabled !== undefined) {
            item.enabled = Boolean(spec.enabled);
        }
        if (spec.params) {
            item.params = {
                ...item.params,
                ...spec.params,
                filterType: spec.params.filterType || item.filterType
            };
            if (spec.params.filterType) {
                item.filterType = spec.params.filterType;
            }
        }
        if (spec.moveDirection === "up" && idx > 0) {
            const tmp = list[idx - 1];
            list[idx - 1] = item;
            list[idx] = tmp;
        } else if (spec.moveDirection === "down" && idx < list.length - 1) {
            const tmp = list[idx + 1];
            list[idx + 1] = item;
            list[idx] = tmp;
        }
        this.invalidateObjectCache(canvasId, holder.id);
        this.setPendingUndoLabel(canvasId, `Update Attached Filter (${item.name || item.filterType})`);
        this.saveCanvas(state);
        return item;
    }

    /**
     * Removes one or all attached dynamic filters from a layer, object, or shared object.
     */
    public removeAttachedFilter(
        canvasId: string,
        spec: {
            targetType: "layer" | "object" | "shared_object";
            targetId?: string;
            sharedObjectId?: string;
            filterId?: string;
            filterType?: string;
            clearAll?: boolean;
        }
    ): number {
        const state = this.loadCanvas(canvasId);
        const { holder, label } = this.findFilterTarget(state, spec.targetType, spec.targetId, spec.sharedObjectId);
        const before = (holder.attachedFilters || []).length;
        const matchId = spec.filterId || spec.filterType;
        if (spec.clearAll || !matchId) {
            holder.attachedFilters = [];
        } else {
            holder.attachedFilters = (holder.attachedFilters || []).filter(
                f => f.id !== matchId && f.filterType !== matchId
            );
        }
        const removed = before - (holder.attachedFilters || []).length;
        this.invalidateObjectCache(canvasId, holder.id);
        this.setPendingUndoLabel(canvasId, `Remove Attached Filter from ${label}`);
        this.saveCanvas(state);
        return removed;
    }

    /**
     * Enriches raw `AttachedFilterSpec[]` with preset category, resolved settings (merging parameter schema defaults
     * with explicit `params`), parameter schemas, and viewport/export effectiveness.
     */
    public describeAttachedFilters(
        state: ArtCanvasState,
        attachedFilters: AttachedFilterSpec[] | undefined,
        targetFiltersEnabled: boolean = true
    ): Array<
        AttachedFilterSpec & {
            category: string;
            gimpProcedure?: string;
            effectiveInViewport: boolean;
            effectiveOnExport: boolean;
            settings: Record<string, any>;
            activeParams: Record<string, any>;
            defaultParams: Record<string, any>;
            parameterSchemas: FilterParameterSchema[];
        }
    > {
        const list = attachedFilters || [];
        if (list.length === 0) return [];
        const allPresets = [
            ...BUILT_IN_GIMP_FILTER_PRESETS,
            ...(state.customFilterPresets || [])
        ];
        const canvasPreviewOn = state.previewDynamicFilters !== false;
        return list.map(af => {
            const preset = allPresets.find(p => p.id === af.filterType);
            const schemas = preset?.parameterSchemas || [];
            const defaultParams: Record<string, any> = {};
            const resolvedSettings: Record<string, any> = {};
            for (const s of schemas) {
                const key = s.key || (s as any).name;
                if (key) {
                    defaultParams[key] = s.defaultValue;
                    resolvedSettings[key] = s.defaultValue;
                }
            }
            for (const [k, v] of Object.entries(af.params || {})) {
                if (k !== "filterType" && v !== undefined) {
                    resolvedSettings[k] = v;
                }
            }
            const isEnabled = af.enabled !== false;
            return {
                ...af,
                name: af.name || preset?.name || af.filterType,
                category: preset?.category || "Custom",
                gimpProcedure: preset?.gimpProcedure,
                enabled: isEnabled,
                effectiveInViewport: isEnabled && targetFiltersEnabled && canvasPreviewOn,
                effectiveOnExport: isEnabled,
                settings: resolvedSettings,
                activeParams: resolvedSettings,
                defaultParams,
                params: {
                    ...resolvedSettings,
                    ...(af.params || {}),
                    filterType: af.filterType
                },
                parameterSchemas: schemas
            };
        });
    }

    /**
     * Lists all dynamic filters attached to a layer, object, or shared object, along with its preview toggle state
     * and full resolved filter settings.
     */
    public listAttachedFilters(
        canvasId: string,
        spec: {
            targetType: "layer" | "object" | "shared_object";
            targetId?: string;
            sharedObjectId?: string;
        }
    ): {
        filtersEnabled: boolean;
        previewDynamicFilters: boolean;
        attachedFilters: Array<
            AttachedFilterSpec & {
                category: string;
                gimpProcedure?: string;
                effectiveInViewport: boolean;
                effectiveOnExport: boolean;
                settings: Record<string, any>;
                activeParams: Record<string, any>;
                defaultParams: Record<string, any>;
                parameterSchemas: FilterParameterSchema[];
            }
        >;
    } {
        const state = this.loadCanvas(canvasId);
        const { holder } = this.findFilterTarget(state, spec.targetType, spec.targetId, spec.sharedObjectId);
        const targetFiltersEnabled = holder.filtersEnabled !== false;
        return {
            filtersEnabled: targetFiltersEnabled,
            previewDynamicFilters: state.previewDynamicFilters !== false,
            attachedFilters: this.describeAttachedFilters(state, holder.attachedFilters, targetFiltersEnabled)
        };
    }

    /**
     * Toggles all dynamic filters on/off for a layer, object, shared object, or the entire canvas preview.
     * Note: Toggling preview off disables rendering the filters in the interactive viewport while keeping
     * the underlying pixels untouched; exporting (`exportCanvas`) still renders the attached filters.
     */
    public setTargetFiltersEnabled(
        canvasId: string,
        spec: {
            targetType: "layer" | "object" | "shared_object" | "canvas";
            targetId?: string;
            sharedObjectId?: string;
            enabled?: boolean;
        }
    ): boolean {
        const state = this.loadCanvas(canvasId);
        if (spec.targetType === "canvas") {
            const cur = state.previewDynamicFilters !== false;
            const next = spec.enabled !== undefined ? Boolean(spec.enabled) : !cur;
            state.previewDynamicFilters = next;
            this.saveCanvas(state);
            return next;
        }
        const { holder } = this.findFilterTarget(state, spec.targetType, spec.targetId, spec.sharedObjectId);
        const cur = holder.filtersEnabled !== false;
        const next = spec.enabled !== undefined ? Boolean(spec.enabled) : !cur;
        holder.filtersEnabled = next;
        this.saveCanvas(state);
        return next;
    }

    /**
     * Bakes (permanently applies) all attached dynamic filters on a layer directly into its pixel buffer
     * (converting vector layers to raster if needed) and clears `layer.attachedFilters`.
     */
    public bakeLayerFilters(
        canvasId: string,
        layerId?: string,
        frame?: number,
        sharedObjectId?: string
    ): { layerId: string; filtersBaked: number } {
        const state = this.loadCanvas(canvasId);
        const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
        const { holder } = this.findFilterTarget(state, "layer", layerId, sharedObjectId);
        const layer = holder as ArtLayerSpec;
        const activeFilters = (layer.attachedFilters || []).filter(f => f.enabled !== false);
        if (activeFilters.length === 0 && layer.type === "raster") {
            return { layerId: layer.id, filtersBaked: 0 };
        }
        if (layer.type === "raster") {
            const src = this.loadRasterBuffer(state, layer.id, container.width, container.height, frame, sharedObjectId);
            const baked = this.applyAttachedFiltersToBuffer(
                state,
                Buffer.from(src),
                container.width,
                container.height,
                activeFilters,
                Boolean(sharedObjectId)
            );
            this.saveRasterBuffer(state, layer.id, baked, frame, sharedObjectId);
        } else {
            const rendered = this.renderLayerToBuffer(state, layer, frame ?? 0, { forExport: true });
            this.saveRasterBuffer(state, layer.id, rendered, frame, sharedObjectId);
            layer.type = "raster";
            layer.objects = [];
        }
        layer.attachedFilters = [];
        this.setPendingUndoLabel(canvasId, `Bake ${activeFilters.length} Filter(s) on ${layer.name}`);
        this.saveCanvas(state);
        return { layerId: layer.id, filtersBaked: activeFilters.length };
    }

    private shouldRenderTargetFilters(
        state: ArtCanvasState,
        targetFiltersEnabled: boolean | undefined,
        opts?: RenderFilterContextOptions
    ): boolean {
        if (opts?.forExport) {
            return true;
        }
        if (opts?.previewFilters !== undefined && !opts.previewFilters) {
            return false;
        }
        if (state.previewDynamicFilters === false) {
            return false;
        }
        if (targetFiltersEnabled === false) {
            return false;
        }
        return true;
    }

    private hasActiveAttachedFilters(
        holder: { attachedFilters?: AttachedFilterSpec[] } | undefined
    ): boolean {
        return Boolean(holder?.attachedFilters && holder.attachedFilters.some(f => f.enabled !== false));
    }

    private applyAttachedFiltersToBuffer(
        state: ArtCanvasState,
        buf: Buffer,
        width: number,
        height: number,
        filters: AttachedFilterSpec[] | undefined,
        ignoreSelection = true
    ): Buffer {
        if (!filters || filters.length === 0) return buf;
        const enabledList = filters.filter(f => f.enabled !== false);
        if (enabledList.length === 0) return buf;

        for (const cp of state.customFilterPresets || []) {
            if (!RasterFilterRegistry.hasFilter(cp.id)) {
                RasterFilterRegistry.registerCustomPreset(cp);
            }
        }

        let current: Buffer = buf;
        const sel: SelectionMaskSpec = ignoreSelection
            ? { mode: "none", inverted: false, x: 0, y: 0, width, height }
            : state.selection;

        for (const fSpec of enabledList) {
            const ft = fSpec.filterType || fSpec.params?.filterType;
            if (!ft) continue;
            const params = { ...(fSpec.params || {}), filterType: ft };
            if (typeof params.customCode === "string" && params.customCode.trim() && !RasterFilterRegistry.hasFilter(ft)) {
                const dst = Buffer.from(current);
                AbstractRasterFilter.evaluateFilterScript(
                    params.customCode,
                    current,
                    dst,
                    width,
                    height,
                    params,
                    ignoreSelection ? undefined : sel
                );
                current = dst;
            } else if (RasterFilterRegistry.hasFilter(ft)) {
                const filterInstance = RasterFilterRegistry.getFilter(ft);
                current = filterInstance.apply(current, width, height, sel, params, ignoreSelection);
            }
        }
        return current;
    }

    public async runGimpScript(canvasId: string, layerId: string | undefined, mode: "python-fu" | "script-fu", script: string): Promise<string> {
        const state = this.loadCanvas(canvasId);
        const layer = this.findLayer(state, layerId, "raster");
        const scriptFile = path.join(this.getCanvasDir(canvasId), `gimp_batch_${Date.now()}.${mode === "python-fu" ? "py" : "scm"}`);
        fs.writeFileSync(scriptFile, script, "utf8");

        if (this.gimpBin && fs.existsSync(this.gimpBin)) {
            try {
                const args = mode === "python-fu"
                    ? ["-i", "--batch-interpreter=python-fu-eval", "-b", script, "-b", "pdb.gimp_quit(1)"]
                    : ["-i", "-b", script, "-b", "(gimp-quit 0)"];
                const { stdout, stderr } = await execFileAsync(this.gimpBin, args, { timeout: 20000 });
                return `GIMP batch (${mode}) executed on layer '${layer.id}': ${(stdout || stderr || "OK").trim()}`;
            } catch (err: any) {
                return `GIMP batch script saved to ${scriptFile} (CLI notice: ${err.message})`;
            }
        }
        return `GIMP ${mode} batch script recorded at ${scriptFile} for layer '${layer.id}'.`;
    }

    // ============================================================================
    // 5. Rendering, Compositing (with Shared Object Refs & Keyframes) & Snapshots
    // ============================================================================

    private blendPixelInPlace(
        dst: Buffer | Uint8Array,
        idx: number,
        sr: number,
        sg: number,
        sb: number,
        sa: number,
        mode: BlendMode
    ): void {
        if (sa <= 0) return;
        const dr = dst[idx];
        const dg = dst[idx + 1];
        const db = dst[idx + 2];
        const da = dst[idx + 3];

        if (da === 0 && mode === "normal") {
            dst[idx] = sr;
            dst[idx + 1] = sg;
            dst[idx + 2] = sb;
            dst[idx + 3] = sa;
            return;
        }

        const srcA = sa / 255;
        const dstA = da / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA <= 0) {
            dst[idx + 3] = 0;
            return;
        }

        let br = sr;
        let bg = sg;
        let bb = sb;
        if (mode === "multiply") {
            br = (sr * dr) / 255;
            bg = (sg * dg) / 255;
            bb = (sb * db) / 255;
        } else if (mode === "screen") {
            br = 255 - ((255 - sr) * (255 - dr)) / 255;
            bg = 255 - ((255 - sg) * (255 - dg)) / 255;
            bb = 255 - ((255 - sb) * (255 - db)) / 255;
        } else if (mode === "add") {
            br = Math.min(255, sr + dr);
            bg = Math.min(255, sg + dg);
            bb = Math.min(255, sb + db);
        } else if (mode === "overlay") {
            const ov = (s: number, d: number) => (d < 128 ? (2 * s * d) / 255 : 255 - (2 * (255 - s) * (255 - d)) / 255);
            br = ov(sr, dr);
            bg = ov(sg, dg);
            bb = ov(sb, db);
        }

        const outR = (br * srcA + dr * dstA * (1 - srcA)) / outA;
        const outG = (bg * srcA + dg * dstA * (1 - srcA)) / outA;
        const outB = (bb * srcA + db * dstA * (1 - srcA)) / outA;

        dst[idx] = Math.min(255, Math.max(0, Math.round(outR)));
        dst[idx + 1] = Math.min(255, Math.max(0, Math.round(outG)));
        dst[idx + 2] = Math.min(255, Math.max(0, Math.round(outB)));
        dst[idx + 3] = Math.min(255, Math.max(0, Math.round(outA * 255)));
    }

    public parseSvgPathToPoints(d: string): { x: number; y: number }[] {
        const tokens = d.match(/[a-zA-Z]|[-+]?\d*\.?\d+/g) || [];
        const pts: { x: number; y: number }[] = [];
        let curX = 0;
        let curY = 0;
        let cmd = "M";
        let i = 0;
        while (i < tokens.length) {
            const tok = tokens[i];
            if (/^[a-zA-Z]$/.test(tok)) {
                cmd = tok;
                i++;
                if (cmd === "Z" || cmd === "z") {
                    if (pts.length > 0) pts.push({ ...pts[0] });
                }
                continue;
            }
            const readNum = () => parseFloat(tokens[i++] || "0");
            if (cmd === "M" || cmd === "L") {
                curX = readNum();
                curY = readNum();
                pts.push({ x: curX, y: curY });
            } else if (cmd === "m" || cmd === "l") {
                curX += readNum();
                curY += readNum();
                pts.push({ x: curX, y: curY });
            } else if (cmd === "H") {
                curX = readNum();
                pts.push({ x: curX, y: curY });
            } else if (cmd === "h") {
                curX += readNum();
                pts.push({ x: curX, y: curY });
            } else if (cmd === "V") {
                curY = readNum();
                pts.push({ x: curX, y: curY });
            } else if (cmd === "v") {
                curY += readNum();
                pts.push({ x: curX, y: curY });
            } else if (cmd === "C") {
                const x1 = readNum(), y1 = readNum();
                const x2 = readNum(), y2 = readNum();
                const x3 = readNum(), y3 = readNum();
                for (let s = 1; s <= 12; s++) {
                    const t = s / 12;
                    const mt = 1 - t;
                    const bx = mt * mt * mt * curX + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
                    const by = mt * mt * mt * curY + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
                    pts.push({ x: bx, y: by });
                }
                curX = x3;
                curY = y3;
            } else if (cmd === "Q") {
                const x1 = readNum(), y1 = readNum();
                const x2 = readNum(), y2 = readNum();
                for (let s = 1; s <= 10; s++) {
                    const t = s / 10;
                    const mt = 1 - t;
                    const bx = mt * mt * curX + 2 * mt * t * x1 + t * t * x2;
                    const by = mt * mt * curY + 2 * mt * t * y1 + t * t * y2;
                    pts.push({ x: bx, y: by });
                }
                curX = x2;
                curY = y2;
            } else {
                i++;
            }
        }
        return pts;
    }

    private isPointInVectorShape(obj: VectorObjectSpec, px: number, py: number): boolean {
        if (obj.kind === "boolean" && obj.booleanOp) {
            const inA = this.isPointInVectorShape(obj.booleanOp.shapeA, px, py);
            const inB = this.isPointInVectorShape(obj.booleanOp.shapeB, px, py);
            switch (obj.booleanOp.operation) {
                case "union":
                    return inA || inB;
                case "difference":
                    return inA && !inB;
                case "intersection":
                    return inA && inB;
                case "exclusion":
                    return (inA && !inB) || (!inA && inB);
            }
        }

        if (obj.kind === "rect" || obj.kind === "image" || obj.kind === "text") {
            const x = obj.x ?? 0;
            const y = obj.y ?? 0;
            const w = obj.width ?? obj.imageWidth ?? 100;
            const h = obj.height ?? obj.imageHeight ?? 100;
            return px >= x && px <= x + w && py >= y && py <= y + h;
        }

        if (obj.kind === "circle") {
            const r = obj.r ?? (obj.width ? obj.width / 2 : 50);
            const cx = obj.x ?? r;
            const cy = obj.y ?? r;
            return Math.hypot(px - cx, py - cy) <= r;
        }

        if (obj.kind === "ellipse") {
            const rx = obj.rx ?? (obj.width ? obj.width / 2 : 50);
            const ry = obj.ry ?? (obj.height ? obj.height / 2 : 50);
            const cx = obj.x ?? rx;
            const cy = obj.y ?? ry;
            if (rx <= 0 || ry <= 0) return false;
            const dx = (px - cx) / rx;
            const dy = (py - cy) / ry;
            return dx * dx + dy * dy <= 1;
        }

        if ((obj.kind === "polygon" || obj.kind === "star" || obj.kind === "path") && obj.points && obj.points.length >= 3) {
            if (obj.kind === "path" && !obj.closed && (!obj.fill || obj.fill === "none")) {
                return false;
            }
            const pts = obj.points;
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const xi = pts[i].x, yi = pts[i].y;
                const xj = pts[j].x, yj = pts[j].y;
                const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
                if (intersect) inside = !inside;
            }
            return inside;
        }

        return false;
    }

    /**
     * Renders a Shared Object sub-canvas into its own RGBA buffer (recursively resolving any nested
     * `<ObjectRef>` instances, style overrides, and the Shared Object's own animation timeline).
     * Supports caching and applying dynamic filters attached to the Shared Object when not being edited.
     */
    private renderSharedObjectToBuffer(
        state: ArtCanvasState,
        sharedObj: SharedObjectCanvasSpec,
        frame: number,
        visitedRefs: Set<string>,
        fillOverride?: string,
        strokeOverride?: string,
        filterOpts?: RenderFilterContextOptions
    ): Buffer {
        const sw = sharedObj.width;
        const sh = sharedObj.height;
        const out = Buffer.alloc(sw * sh * 4, 0);
        if (visitedRefs.has(sharedObj.id)) return out;

        const nextVisited = new Set(visitedRefs);
        nextVisited.add(sharedObj.id);

        // Compute effective frame inside the Shared Object's own animation timeline (if any)
        let effFrame = frame;
        if (sharedObj.animation && sharedObj.animation.durationFrames > 1) {
            const dur = sharedObj.animation.durationFrames;
            if (frame >= dur && sharedObj.animation.loop) {
                const loopStart = Math.max(0, Math.min(dur - 1, sharedObj.animation.loopBackToFrame ?? 0));
                const span = Math.max(1, dur - loopStart);
                effFrame = loopStart + ((frame - loopStart) % span);
            }
        }

        const isEditingThisShared = this.isSharedObjectEditing(state.canvasId, sharedObj.id, filterOpts);

        for (const layer of sharedObj.layers) {
            if (!layer.visible) continue;
            const layerOpacity = this.resolveAnimatedLayerOpacity(state, layer, effFrame, sharedObj.id);
            if (layerOpacity <= 0) continue;
            const layerOffset = this.resolveAnimatedLayerOffset(state, layer, effFrame, sharedObj.id);
            const offX = Math.round(layerOffset.x);
            const offY = Math.round(layerOffset.y);

            let layerBuf: Buffer;
            if (layer.type === "raster") {
                layerBuf = Buffer.from(this.resolveAnimatedRasterBuffer(state, layer, sw, sh, effFrame, sharedObj.id));
            } else {
                layerBuf = Buffer.alloc(sw * sh * 4, 0);
                for (const rawObj of layer.objects) {
                    const animObj = this.resolveAnimatedObject(state, rawObj, effFrame, sharedObj.id);
                    if ((animObj.opacity ?? 1) <= 0) continue;
                    if (fillOverride && animObj.kind !== "ref") animObj.fill = fillOverride;
                    if (strokeOverride && animObj.kind !== "ref") animObj.stroke = strokeOverride;
                    this.renderVectorObjectToBuffer(
                        state,
                        animObj,
                        layerBuf,
                        sw,
                        sh,
                        effFrame,
                        nextVisited,
                        fillOverride,
                        strokeOverride,
                        sharedObj.id,
                        filterOpts
                    );
                }
            }

            if (
                !isEditingThisShared &&
                this.hasActiveAttachedFilters(layer) &&
                this.shouldRenderTargetFilters(state, layer.filtersEnabled, filterOpts)
            ) {
                layerBuf = this.applyAttachedFiltersToBuffer(state, layerBuf, sw, sh, layer.attachedFilters, true);
            }

            for (let py = 0; py < sh; py++) {
                const sy = py - offY;
                if (sy < 0 || sy >= sh) continue;
                for (let px = 0; px < sw; px++) {
                    const sx = px - offX;
                    if (sx < 0 || sx >= sw) continue;
                    const sIdx = (sy * sw + sx) * 4;
                    const dIdx = (py * sw + px) * 4;
                    const sa = Math.round(layerBuf[sIdx + 3] * layerOpacity);
                    if (sa > 0) {
                        this.blendPixelInPlace(out, dIdx, layerBuf[sIdx], layerBuf[sIdx + 1], layerBuf[sIdx + 2], sa, layer.blendMode);
                    }
                }
            }
        }

        // If the SharedObject definition itself has attached filters, render them against the cached shared object canvas
        // unless this Shared Object is currently being edited!
        if (
            !isEditingThisShared &&
            this.hasActiveAttachedFilters(sharedObj) &&
            this.shouldRenderTargetFilters(state, sharedObj.filtersEnabled, filterOpts)
        ) {
            const cacheKey = `${state.canvasId}::shared::${sharedObj.id}`;
            const existing = this.objectRenderCache.get(cacheKey);
            const baseSig = `${sw}x${sh}::f${effFrame}::${fillOverride || ""}::${strokeOverride || ""}::${out.subarray(0, Math.min(256, out.length)).toString("hex")}`;
            const filtSig = `${baseSig}::${JSON.stringify(sharedObj.attachedFilters)}`;
            const filtered = this.applyAttachedFiltersToBuffer(state, Buffer.from(out), sw, sh, sharedObj.attachedFilters, true);
            this.objectRenderCache.set(cacheKey, {
                baseSignature: baseSig,
                baseRgba: Buffer.from(out),
                width: sw,
                height: sh,
                filteredSignature: filtSig,
                filteredRgba: filtered,
                cachedAt: Date.now(),
                renderCount: (existing?.renderCount ?? 0) + 1,
                filterEvalCount: (existing?.filterEvalCount ?? 0) + 1
            });
            return filtered;
        }

        return out;
    }

    private decodeVectorImageDataUrl(dataUrl: string): { width: number; height: number; rgba: Buffer } | null {
        if (!dataUrl) return null;
        const cached = this.decodedVectorImageCache.get(dataUrl);
        if (cached) return cached;
        try {
            const m = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
            if (!m) return null;
            const subtype = m[1].toLowerCase();
            const rawBuf = Buffer.from(m[2], "base64");
            let decoded: { width: number; height: number; rgba: Buffer };
            if (subtype === "png") {
                decoded = decodePngToRgba(rawBuf);
            } else {
                const ext = subtype === "jpeg" ? ".jpg" : `.${subtype}`;
                decoded = decodeAnyImageToRgba(`vec_img${ext}`, rawBuf);
            }
            if (this.decodedVectorImageCache.size > 128) {
                const firstKey = this.decodedVectorImageCache.keys().next().value;
                if (firstKey) this.decodedVectorImageCache.delete(firstKey);
            }
            this.decodedVectorImageCache.set(dataUrl, decoded);
            return decoded;
        } catch {
            return null;
        }
    }

    private inverseTransformPoint(
        px: number,
        py: number,
        pivotX: number,
        pivotY: number,
        rotationDeg: number,
        skewXDeg: number,
        skewYDeg: number
    ): { x: number; y: number } {
        let dx = px - pivotX;
        let dy = py - pivotY;
        if (rotationDeg !== 0) {
            const rad = (-rotationDeg * Math.PI) / 180;
            const cosR = Math.cos(rad);
            const sinR = Math.sin(rad);
            const rx = dx * cosR - dy * sinR;
            const ry = dx * sinR + dy * cosR;
            dx = rx;
            dy = ry;
        }
        if (skewXDeg !== 0 || skewYDeg !== 0) {
            const tx = Math.tan((skewXDeg * Math.PI) / 180);
            const ty = Math.tan((skewYDeg * Math.PI) / 180);
            const det = 1 - tx * ty;
            if (Math.abs(det) > 1e-6) {
                const ux = (dx - tx * dy) / det;
                const uy = (dy - ty * dx) / det;
                dx = ux;
                dy = uy;
            }
        }
        return { x: pivotX + dx, y: pivotY + dy };
    }

    private forwardTransformPoint(
        px: number,
        py: number,
        pivotX: number,
        pivotY: number,
        rotationDeg: number,
        skewXDeg: number,
        skewYDeg: number
    ): { x: number; y: number } {
        let dx = px - pivotX;
        let dy = py - pivotY;
        if (skewXDeg !== 0 || skewYDeg !== 0) {
            const tx = Math.tan((skewXDeg * Math.PI) / 180);
            const ty = Math.tan((skewYDeg * Math.PI) / 180);
            const sx = dx + tx * dy;
            const sy = dy + ty * dx;
            dx = sx;
            dy = sy;
        }
        if (rotationDeg !== 0) {
            const rad = (rotationDeg * Math.PI) / 180;
            const cosR = Math.cos(rad);
            const sinR = Math.sin(rad);
            const rx = dx * cosR - dy * sinR;
            const ry = dx * sinR + dy * cosR;
            dx = rx;
            dy = ry;
        }
        return { x: pivotX + dx, y: pivotY + dy };
    }

    private computeObjectRenderSignature(
        state: ArtCanvasState,
        obj: VectorObjectSpec,
        width: number,
        height: number,
        frame: number,
        inheritedFillOverride?: string,
        inheritedStrokeOverride?: string
    ): string {
        const { attachedFilters: _af, filtersEnabled: _fe, ...geom } = obj;
        let sharedSig = "";
        if (obj.kind === "ref" && obj.refId && state.sharedObjects?.[obj.refId]) {
            const s = state.sharedObjects[obj.refId];
            sharedSig = `::ref(${s.width}x${s.height}:${JSON.stringify(s.layers)}:${JSON.stringify(s.attachedFilters || [])}:${s.filtersEnabled !== false})`;
        }
        return `${width}x${height}::f${frame}::${inheritedFillOverride || ""}::${inheritedStrokeOverride || ""}::${JSON.stringify(geom)}${sharedSig}`;
    }

    private renderVectorObjectToBuffer(
        state: ArtCanvasState,
        rawObj: VectorObjectSpec,
        buf: Buffer,
        width: number,
        height: number,
        frame: number = 0,
        visitedRefs: Set<string> = new Set(),
        inheritedFillOverride?: string,
        inheritedStrokeOverride?: string,
        sharedObjectId?: string,
        filterOpts?: RenderFilterContextOptions
    ): void {
        const obj = this.resolveAnimatedObject(state, rawObj, frame, sharedObjectId);
        const objOpacity = obj.opacity ?? 1.0;
        if (objOpacity <= 0) return;

        const hasObjFilters = this.hasActiveAttachedFilters(obj);
        const isEditingThisObj =
            this.isObjectEditing(state.canvasId, obj.id, filterOpts) ||
            (obj.kind === "ref" && Boolean(obj.refId) && this.isSharedObjectEditing(state.canvasId, obj.refId!, filterOpts));

        // When an object has attached filters and is NOT currently being edited (and preview is enabled or exporting):
        // 1. Render the raw object onto a cached canvas (`baseRgba`) for efficiency.
        // 2. Render the attached filters against that cached canvas (`filteredRgba`).
        // 3. Composite the filtered canvas onto the parent canvas (`buf`).
        // If the object IS being edited (`isEditingThisObj === true`), stop rendering the filters during editing!
        if (
            hasObjFilters &&
            !isEditingThisObj &&
            this.shouldRenderTargetFilters(state, obj.filtersEnabled, filterOpts)
        ) {
            const cacheKey = `${state.canvasId}::obj::${obj.id}`;
            const baseSignature = this.computeObjectRenderSignature(
                state,
                obj,
                width,
                height,
                frame,
                inheritedFillOverride,
                inheritedStrokeOverride
            );
            let entry = this.objectRenderCache.get(cacheKey);
            if (!entry || entry.baseSignature !== baseSignature || entry.width !== width || entry.height !== height) {
                const baseRgba = Buffer.alloc(width * height * 4, 0);
                this.renderRawVectorObjectToBuffer(
                    state,
                    obj,
                    baseRgba,
                    width,
                    height,
                    frame,
                    visitedRefs,
                    inheritedFillOverride,
                    inheritedStrokeOverride,
                    sharedObjectId,
                    filterOpts
                );
                entry = {
                    baseSignature,
                    baseRgba,
                    width,
                    height,
                    cachedAt: Date.now(),
                    renderCount: (entry?.renderCount ?? 0) + 1,
                    filterEvalCount: entry?.filterEvalCount ?? 0
                };
                this.objectRenderCache.set(cacheKey, entry);
            }

            const activeFilters = (obj.attachedFilters || []).filter(f => f.enabled !== false);
            const filteredSignature = `${baseSignature}::${JSON.stringify(activeFilters)}`;
            if (entry.filteredSignature !== filteredSignature || !entry.filteredRgba) {
                entry.filteredRgba = this.applyAttachedFiltersToBuffer(
                    state,
                    Buffer.from(entry.baseRgba),
                    width,
                    height,
                    activeFilters,
                    true
                );
                entry.filteredSignature = filteredSignature;
                entry.filterEvalCount += 1;
            }

            const fBuf = entry.filteredRgba;
            for (let i = 0; i < width * height * 4; i += 4) {
                const sa = fBuf[i + 3];
                if (sa > 0) {
                    this.blendPixelInPlace(buf, i, fBuf[i], fBuf[i + 1], fBuf[i + 2], sa, "normal");
                }
            }
            return;
        }

        this.renderRawVectorObjectToBuffer(
            state,
            obj,
            buf,
            width,
            height,
            frame,
            visitedRefs,
            inheritedFillOverride,
            inheritedStrokeOverride,
            sharedObjectId,
            filterOpts
        );
    }

    private renderRawVectorObjectToBuffer(
        state: ArtCanvasState,
        obj: VectorObjectSpec,
        buf: Buffer,
        width: number,
        height: number,
        frame: number = 0,
        visitedRefs: Set<string> = new Set(),
        inheritedFillOverride?: string,
        inheritedStrokeOverride?: string,
        _sharedObjectId?: string,
        filterOpts?: RenderFilterContextOptions
    ): void {
        const objOpacity = obj.opacity ?? 1.0;
        if (objOpacity <= 0) return;

        // Handle Raster Image Object (`kind === "image"`) inside a vector layer
        if (obj.kind === "image" && obj.imageDataUrl) {
            const decoded = this.decodeVectorImageDataUrl(obj.imageDataUrl);
            if (!decoded) return;
            const ox = Math.round(obj.x ?? 0);
            const oy = Math.round(obj.y ?? 0);
            const destW = Math.max(1, Math.round(obj.width ?? obj.imageWidth ?? decoded.width));
            const destH = Math.max(1, Math.round(obj.height ?? obj.imageHeight ?? decoded.height));
            const minX = Math.max(0, ox);
            const maxX = Math.min(width - 1, ox + destW - 1);
            const minY = Math.max(0, oy);
            const maxY = Math.min(height - 1, oy + destH - 1);

            for (let py = minY; py <= maxY; py++) {
                const sy = Math.min(decoded.height - 1, Math.floor(((py - oy) / destH) * decoded.height));
                for (let px = minX; px <= maxX; px++) {
                    const sx = Math.min(decoded.width - 1, Math.floor(((px - ox) / destW) * decoded.width));
                    const sIdx = (sy * decoded.width + sx) * 4;
                    const sa = Math.round(decoded.rgba[sIdx + 3] * objOpacity);
                    if (sa > 0) {
                        const dIdx = (py * width + px) * 4;
                        this.blendPixelInPlace(
                            buf,
                            dIdx,
                            decoded.rgba[sIdx],
                            decoded.rgba[sIdx + 1],
                            decoded.rgba[sIdx + 2],
                            sa,
                            "normal"
                        );
                    }
                }
            }
            return;
        }

        // Handle `<ObjectRef>` (`kind === "ref"`) referencing a Shared Object sub-canvas
        if (obj.kind === "ref" && obj.refId) {
            const shared = state.sharedObjects[obj.refId];
            if (!shared || visitedRefs.has(obj.refId)) return;

            const effFill = obj.fillOverride || inheritedFillOverride;
            const effStroke = obj.strokeOverride || inheritedStrokeOverride;
            const subBuf = this.renderSharedObjectToBuffer(state, shared, frame, visitedRefs, effFill, effStroke, filterOpts);

            const ox = obj.x ?? 0;
            const oy = obj.y ?? 0;
            const sx = obj.scaleX ?? 1.0;
            const sy = obj.scaleY ?? 1.0;
            const rotDeg = obj.rotation ?? 0;
            const skewXDeg = obj.skewX ?? 0;
            const skewYDeg = obj.skewY ?? 0;

            const destW = Math.max(1, Math.round(shared.width * Math.abs(sx)));
            const destH = Math.max(1, Math.round(shared.height * Math.abs(sy)));
            const pad = Math.ceil(Math.hypot(destW, destH) * 1.5);
            const minX = Math.max(0, Math.floor(ox - pad));
            const maxX = Math.min(width - 1, Math.ceil(ox + destW + pad));
            const minY = Math.max(0, Math.floor(oy - pad));
            const maxY = Math.min(height - 1, Math.ceil(oy + destH + pad));

            for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                    const invPt = this.inverseTransformPoint(px, py, ox, oy, rotDeg, skewXDeg, skewYDeg);
                    const rx = invPt.x - ox;
                    const ry = invPt.y - oy;
                    const lx = Math.floor(rx / (sx || 1));
                    const ly = Math.floor(ry / (sy || 1));
                    if (lx >= 0 && lx < shared.width && ly >= 0 && ly < shared.height) {
                        const sIdx = (ly * shared.width + lx) * 4;
                        const sa = Math.round(subBuf[sIdx + 3] * objOpacity);
                        if (sa > 0) {
                            const dIdx = (py * width + px) * 4;
                            this.blendPixelInPlace(buf, dIdx, subBuf[sIdx], subBuf[sIdx + 1], subBuf[sIdx + 2], sa, "normal");
                        }
                    }
                }
            }
            return;
        }

        const fill = parseColor(inheritedFillOverride || obj.fill);
        const stroke = parseColor(inheritedStrokeOverride || obj.stroke);
        const strokeWidth = obj.strokeWidth ?? 1;
        const rotDeg = obj.rotation ?? 0;
        const skewXDeg = obj.skewX ?? 0;
        const skewYDeg = obj.skewY ?? 0;
        const hasAffine = rotDeg !== 0 || skewXDeg !== 0 || skewYDeg !== 0;

        if (obj.kind === "text" && obj.text) {
            const textStr = obj.text.toUpperCase();
            const scale = Math.max(1, Math.round((obj.fontSize ?? 14) / 7));
            const startX = Math.round(obj.x ?? 0);
            const startY = Math.round(obj.y ?? 0);
            const col = fill.a > 0 ? fill : { r: 0, g: 0, b: 0, a: 255 };
            const effA = Math.round(col.a * objOpacity);

            for (let cIdx = 0; cIdx < textStr.length; cIdx++) {
                const ch = textStr[cIdx];
                const glyph = BITMAP_FONT_5X7[ch] || BITMAP_FONT_5X7[" "];
                const charX = startX + cIdx * 6 * scale;
                for (let row = 0; row < 7; row++) {
                    const rowBits = glyph[row];
                    for (let colBit = 0; colBit < 5; colBit++) {
                        if ((rowBits >> (4 - colBit)) & 1) {
                            for (let sy = 0; sy < scale; sy++) {
                                for (let sx = 0; sx < scale; sx++) {
                                    let px = charX + colBit * scale + sx;
                                    let py = startY + row * scale + sy;
                                    if (hasAffine) {
                                        const tp = this.forwardTransformPoint(px, py, startX, startY, rotDeg, skewXDeg, skewYDeg);
                                        px = Math.round(tp.x);
                                        py = Math.round(tp.y);
                                    }
                                    if (px >= 0 && px < width && py >= 0 && py < height) {
                                        const idx = (py * width + px) * 4;
                                        this.blendPixelInPlace(buf, idx, col.r, col.g, col.b, effA, "normal");
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return;
        }

        if (obj.kind === "line") {
            const x1 = obj.x ?? 0;
            const y1 = obj.y ?? 0;
            const x2 = obj.x2 ?? (obj.width ?? 100);
            const y2 = obj.y2 ?? (obj.height ?? 100);
            const col = stroke.a > 0 ? stroke : fill;
            const pivotX = (x1 + x2) / 2;
            const pivotY = (y1 + y2) / 2;
            const tfPt = (x: number, y: number) =>
                hasAffine ? this.forwardTransformPoint(x, y, pivotX, pivotY, rotDeg, skewXDeg, skewYDeg) : { x, y };

            if (obj.cx !== undefined && obj.cy !== undefined) {
                const steps = Math.max(16, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
                let prev = tfPt(x1, y1);
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const mt = 1 - t;
                    const qx = mt * mt * x1 + 2 * mt * t * obj.cx + t * t * x2;
                    const qy = mt * mt * y1 + 2 * mt * t * obj.cy + t * t * y2;
                    const cur = tfPt(qx, qy);
                    this.drawSegmentOnBuffer(buf, width, height, prev.x, prev.y, cur.x, cur.y, col, Math.max(1, strokeWidth), objOpacity);
                    prev = cur;
                }
            } else {
                const p0 = tfPt(x1, y1);
                const p1 = tfPt(x2, y2);
                this.drawSegmentOnBuffer(buf, width, height, p0.x, p0.y, p1.x, p1.y, col, Math.max(1, strokeWidth), objOpacity);
            }
            return;
        }

        const bbox = this.computeObjectBoundingBox(obj, state);
        const pivotX = bbox.x + bbox.width / 2;
        const pivotY = bbox.y + bbox.height / 2;
        const pad = Math.ceil(strokeWidth + (hasAffine ? Math.hypot(bbox.width, bbox.height) * 0.6 : 2));
        const minX = Math.max(0, Math.floor(bbox.x - pad));
        const maxX = Math.min(width - 1, Math.ceil(bbox.x + bbox.width + pad));
        const minY = Math.max(0, Math.floor(bbox.y - pad));
        const maxY = Math.min(height - 1, Math.ceil(bbox.y + bbox.height + pad));

        if (fill.a > 0 && (inheritedFillOverride || obj.fill !== "none")) {
            const effA = Math.round(fill.a * objOpacity);
            for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                    const testPt = hasAffine
                        ? this.inverseTransformPoint(px, py, pivotX, pivotY, rotDeg, skewXDeg, skewYDeg)
                        : { x: px, y: py };
                    if (this.isPointInVectorShape(obj, testPt.x, testPt.y)) {
                        const idx = (py * width + px) * 4;
                        this.blendPixelInPlace(buf, idx, fill.r, fill.g, fill.b, effA, "normal");
                    }
                }
            }
        }

        if (stroke.a > 0 && (inheritedStrokeOverride || obj.stroke !== "none") && strokeWidth > 0) {
            const tfSeg = (x0: number, y0: number, x1: number, y1: number) => {
                const p0 = hasAffine ? this.forwardTransformPoint(x0, y0, pivotX, pivotY, rotDeg, skewXDeg, skewYDeg) : { x: x0, y: y0 };
                const p1 = hasAffine ? this.forwardTransformPoint(x1, y1, pivotX, pivotY, rotDeg, skewXDeg, skewYDeg) : { x: x1, y: y1 };
                this.drawSegmentOnBuffer(buf, width, height, p0.x, p0.y, p1.x, p1.y, stroke, strokeWidth, objOpacity);
            };
            if (obj.kind === "rect") {
                const x = obj.x ?? 0;
                const y = obj.y ?? 0;
                const w = obj.width ?? 100;
                const h = obj.height ?? 100;
                tfSeg(x, y, x + w, y);
                tfSeg(x + w, y, x + w, y + h);
                tfSeg(x + w, y + h, x, y + h);
                tfSeg(x, y + h, x, y);
            } else if (obj.kind === "circle" || obj.kind === "ellipse") {
                const rx = obj.kind === "circle" ? (obj.r ?? (obj.width ? obj.width / 2 : 50)) : (obj.rx ?? (obj.width ? obj.width / 2 : 50));
                const ry = obj.kind === "circle" ? rx : (obj.ry ?? (obj.height ? obj.height / 2 : 50));
                const cx = obj.x ?? rx;
                const cy = obj.y ?? ry;
                const steps = Math.max(36, Math.ceil(Math.max(rx, ry) * 2));
                for (let i = 0; i < steps; i++) {
                    const a0 = (i * Math.PI * 2) / steps;
                    const a1 = ((i + 1) * Math.PI * 2) / steps;
                    tfSeg(
                        cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry,
                        cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry
                    );
                }
            } else if (obj.kind === "path" && obj.d) {
                const pathPts = this.parseSvgPathToPoints(obj.d);
                for (let i = 0; i < pathPts.length - 1; i++) {
                    tfSeg(pathPts[i].x, pathPts[i].y, pathPts[i + 1].x, pathPts[i + 1].y);
                }
            } else if (obj.points && obj.points.length >= 2) {
                for (let i = 0; i < obj.points.length - 1; i++) {
                    tfSeg(obj.points[i].x, obj.points[i].y, obj.points[i + 1].x, obj.points[i + 1].y);
                }
                if (obj.closed || obj.kind === "polygon" || obj.kind === "star") {
                    const last = obj.points[obj.points.length - 1];
                    const first = obj.points[0];
                    tfSeg(last.x, last.y, first.x, first.y);
                }
            }
        }
    }

    private drawSegmentOnBuffer(
        buf: Buffer,
        width: number,
        height: number,
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        color: RGBA,
        thickness: number,
        opacity: number
    ): void {
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(1, Math.ceil(dist * 2));
        const r = Math.max(0.5, thickness / 2);
        const effA = Math.round(color.a * opacity);

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const cx = x0 + (x1 - x0) * t;
            const cy = y0 + (y1 - y0) * t;
            const minX = Math.max(0, Math.floor(cx - r));
            const maxX = Math.min(width - 1, Math.ceil(cx + r));
            const minY = Math.max(0, Math.floor(cy - r));
            const maxY = Math.min(height - 1, Math.ceil(cy + r));
            for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                    if (Math.hypot(px - cx, py - cy) <= r) {
                        const idx = (py * width + px) * 4;
                        this.blendPixelInPlace(buf, idx, color.r, color.g, color.b, effA, "normal");
                    }
                }
            }
        }
    }

    public computeObjectBoundingBox(obj: VectorObjectSpec, state?: ArtCanvasState): BoundingBox {
        if (obj.kind === "ref" && obj.refId && state?.sharedObjects?.[obj.refId]) {
            const shared = state.sharedObjects[obj.refId];
            const sx = Math.abs(obj.scaleX ?? 1);
            const sy = Math.abs(obj.scaleY ?? 1);
            return {
                x: Math.round(obj.x ?? 0),
                y: Math.round(obj.y ?? 0),
                width: Math.max(1, Math.round(shared.width * sx)),
                height: Math.max(1, Math.round(shared.height * sy))
            };
        }
        if (obj.kind === "circle") {
            const r = obj.r ?? (obj.width ? obj.width / 2 : 50);
            const cx = obj.x ?? r;
            const cy = obj.y ?? r;
            return { x: Math.round(cx - r), y: Math.round(cy - r), width: Math.round(r * 2), height: Math.round(r * 2) };
        }
        if (obj.kind === "ellipse") {
            const rx = obj.rx ?? (obj.width ? obj.width / 2 : 50);
            const ry = obj.ry ?? (obj.height ? obj.height / 2 : 50);
            const cx = obj.x ?? rx;
            const cy = obj.y ?? ry;
            return { x: Math.round(cx - rx), y: Math.round(cy - ry), width: Math.round(rx * 2), height: Math.round(ry * 2) };
        }
        if (obj.kind === "line") {
            const x1 = obj.x ?? 0;
            const y1 = obj.y ?? 0;
            const x2 = obj.x2 ?? 100;
            const y2 = obj.y2 ?? 100;
            const minX = obj.cx !== undefined ? Math.min(x1, x2, obj.cx) : Math.min(x1, x2);
            const maxX = obj.cx !== undefined ? Math.max(x1, x2, obj.cx) : Math.max(x1, x2);
            const minY = obj.cy !== undefined ? Math.min(y1, y2, obj.cy) : Math.min(y1, y2);
            const maxY = obj.cy !== undefined ? Math.max(y1, y2, obj.cy) : Math.max(y1, y2);
            return {
                x: Math.floor(minX),
                y: Math.floor(minY),
                width: Math.max(1, Math.ceil(maxX - minX)),
                height: Math.max(1, Math.ceil(maxY - minY))
            };
        }
        if (obj.points && obj.points.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of obj.points) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
            return {
                x: Math.floor(minX),
                y: Math.floor(minY),
                width: Math.max(1, Math.ceil(maxX - minX)),
                height: Math.max(1, Math.ceil(maxY - minY))
            };
        }
        return {
            x: Math.round(obj.x ?? 0),
            y: Math.round(obj.y ?? 0),
            width: Math.max(1, Math.round(obj.width ?? obj.imageWidth ?? 100)),
            height: Math.max(1, Math.round(obj.height ?? obj.imageHeight ?? 100))
        };
    }

    public computeRasterBoundingBox(buf: Buffer, width: number, height: number): BoundingBox {
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const a = buf[(y * width + x) * 4 + 3];
                if (a > 0) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < minX || maxY < minY) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    }

    private renderLayerToBuffer(
        state: ArtCanvasState,
        layer: ArtLayerSpec,
        frame: number = 0,
        filterOpts?: RenderFilterContextOptions
    ): Buffer {
        let buf: Buffer;
        if (layer.type === "raster") {
            // Always copy the raster buffer so attached dynamic filters never mutate the underlying raster pixels!
            buf = Buffer.from(this.resolveAnimatedRasterBuffer(state, layer, state.width, state.height, frame));
        } else {
            buf = Buffer.alloc(state.width * state.height * 4, 0);
            const effectiveChildOpts: RenderFilterContextOptions | undefined =
                layer.filtersEnabled === false && !filterOpts?.forExport
                    ? { ...(filterOpts || {}), previewFilters: false }
                    : filterOpts;
            for (const obj of layer.objects) {
                this.renderVectorObjectToBuffer(
                    state,
                    obj,
                    buf,
                    state.width,
                    state.height,
                    frame,
                    new Set(),
                    undefined,
                    undefined,
                    undefined,
                    effectiveChildOpts
                );
            }
        }

        if (
            this.hasActiveAttachedFilters(layer) &&
            this.shouldRenderTargetFilters(state, layer.filtersEnabled, filterOpts)
        ) {
            buf = this.applyAttachedFiltersToBuffer(
                state,
                buf,
                state.width,
                state.height,
                layer.attachedFilters,
                true
            );
        }

        return buf;
    }

    public renderCompositeFrameBuffer(
        state: ArtCanvasState,
        frame: number = 0,
        filterOpts?: RenderFilterContextOptions
    ): Buffer {
        const w = state.width;
        const h = state.height;
        const composite = Buffer.alloc(w * h * 4, 0);

        const bg = parseColor(state.backgroundColor);
        if (bg.a > 0) {
            for (let i = 0; i < w * h * 4; i += 4) {
                composite[i] = bg.r;
                composite[i + 1] = bg.g;
                composite[i + 2] = bg.b;
                composite[i + 3] = bg.a;
            }
        }

        for (const layer of state.layers) {
            if (!layer.visible) continue;
            const effOpacity = this.resolveAnimatedLayerOpacity(state, layer, frame);
            if (effOpacity <= 0) continue;
            const layerOffset = this.resolveAnimatedLayerOffset(state, layer, frame);
            const offX = Math.round(layerOffset.x);
            const offY = Math.round(layerOffset.y);

            const layerBuf = this.renderLayerToBuffer(state, layer, frame, filterOpts);
            for (let py = 0; py < h; py++) {
                const sy = py - offY;
                if (sy < 0 || sy >= h) continue;
                for (let px = 0; px < w; px++) {
                    const sx = px - offX;
                    if (sx < 0 || sx >= w) continue;
                    const sIdx = (sy * w + sx) * 4;
                    const dIdx = (py * w + px) * 4;
                    const sa = Math.round(layerBuf[sIdx + 3] * effOpacity);
                    if (sa > 0) {
                        this.blendPixelInPlace(
                            composite,
                            dIdx,
                            layerBuf[sIdx],
                            layerBuf[sIdx + 1],
                            layerBuf[sIdx + 2],
                            sa,
                            layer.blendMode
                        );
                    }
                }
            }
        }

        return composite;
    }

    public compositeCanvasFrame(
        state: ArtCanvasState,
        opts: {
            frame?: number;
            onionSkin?: boolean;
            sharedObjectId?: string;
            forExport?: boolean;
            previewFilters?: boolean;
            editingObjectIds?: Set<string> | string[];
            editingSharedObjectIds?: Set<string> | string[];
        } = {}
    ): { width: number; height: number; pixels: Buffer } {
        const frame = opts.frame ?? 0;
        const filterOpts: RenderFilterContextOptions = {
            forExport: opts.forExport,
            previewFilters: opts.previewFilters,
            editingObjectIds: opts.editingObjectIds,
            editingSharedObjectIds: opts.editingSharedObjectIds
        };
        if (opts.sharedObjectId && state.sharedObjects[opts.sharedObjectId]) {
            const shared = state.sharedObjects[opts.sharedObjectId];
            const pixels = this.renderSharedObjectToBuffer(state, shared, frame, new Set(), undefined, undefined, filterOpts);
            return { width: shared.width, height: shared.height, pixels };
        }
        const pixels = this.renderCompositeFrameBuffer(state, frame, filterOpts);
        if (opts.onionSkin && frame > 0) {
            const prevBuf = this.renderCompositeFrameBuffer(state, frame - 1, filterOpts);
            for (let i = 0; i < state.width * state.height * 4; i += 4) {
                if (prevBuf[i + 3] > 0) {
                    this.blendPixelInPlace(
                        pixels,
                        i,
                        prevBuf[i],
                        Math.round(prevBuf[i + 1] * 0.5),
                        Math.round(prevBuf[i + 2] * 0.5),
                        65,
                        "normal"
                    );
                }
            }
        }
        return { width: state.width, height: state.height, pixels };
    }

    /**
     * Renders a snapshot of the full canvas, an isolated layer, an isolated vector object, a shared object sub-canvas,
     * a cropped region, or a multi-frame animation contact sheet into a valid 32-bit RGBA PNG file & base64 payload.
     */
    public captureSnapshot(opts: SnapshotOptions): SnapshotResult {
        const state = this.loadCanvas(opts.canvasId);
        const targetType = opts.targetType || (opts.contactSheetFrames ? "contact_sheet" : "canvas");
        const frame = opts.frame ?? 0;
        let w = state.width;
        let h = state.height;
        const filterOpts: RenderFilterContextOptions = {
            forExport: opts.forExport,
            previewFilters: opts.previewFilters
        };

        let composite: Buffer;
        let targetBBox: BoundingBox = { x: 0, y: 0, width: w, height: h };

        if (targetType === "contact_sheet") {
            const framesToRender = opts.contactSheetFrames && opts.contactSheetFrames.length > 0
                ? opts.contactSheetFrames
                : Array.from({ length: Math.max(1, state.animation.durationFrames) }, (_, idx) => idx);
            w = state.width * framesToRender.length;
            h = state.height;
            composite = Buffer.alloc(w * h * 4, 0);
            framesToRender.forEach((fIdx, colIdx) => {
                const fBuf = this.renderCompositeFrameBuffer(state, fIdx, filterOpts);
                const xOffset = colIdx * state.width;
                for (let row = 0; row < h; row++) {
                    fBuf.copy(composite, (row * w + xOffset) * 4, row * state.width * 4, (row + 1) * state.width * 4);
                }
            });
            targetBBox = { x: 0, y: 0, width: w, height: h };
        } else if (targetType === "shared_object") {
            const shared = this.getSharedObjectOrThrow(state, opts.targetId || "");
            w = shared.width;
            h = shared.height;
            composite = this.renderSharedObjectToBuffer(state, shared, frame, new Set(), undefined, undefined, filterOpts);
            targetBBox = this.computeRasterBoundingBox(composite, w, h);
        } else if (targetType === "canvas" || targetType === "region") {
            composite = this.renderCompositeFrameBuffer(state, frame, filterOpts);
            if (opts.onionSkin && frame > 0) {
                const prevBuf = this.renderCompositeFrameBuffer(state, frame - 1, filterOpts);
                for (let i = 0; i < w * h * 4; i += 4) {
                    if (prevBuf[i + 3] > 0) {
                        this.blendPixelInPlace(composite, i, prevBuf[i], Math.round(prevBuf[i + 1] * 0.5), Math.round(prevBuf[i + 2] * 0.5), 65, "normal");
                    }
                }
            }
        } else if (targetType === "layer") {
            const layer = state.layers.find(l => l.id === opts.targetId || l.name === opts.targetId);
            if (!layer) {
                throw new Error(`Layer '${opts.targetId}' not found on canvas '${opts.canvasId}'.`);
            }
            composite = this.renderLayerToBuffer(state, layer, frame, filterOpts);
            targetBBox = this.computeRasterBoundingBox(composite, w, h);
        } else {
            // targetType === "object"
            let foundObj: VectorObjectSpec | undefined;
            for (const layer of state.layers) {
                const candidate = layer.objects.find(o => o.id === opts.targetId);
                if (candidate) {
                    foundObj = candidate;
                    break;
                }
            }
            if (!foundObj) {
                for (const shared of Object.values(state.sharedObjects)) {
                    for (const layer of shared.layers) {
                        const candidate = layer.objects.find(o => o.id === opts.targetId);
                        if (candidate) {
                            foundObj = candidate;
                            break;
                        }
                    }
                }
            }
            if (!foundObj) {
                throw new Error(`Vector object '${opts.targetId}' not found on canvas '${opts.canvasId}'.`);
            }
            composite = Buffer.alloc(w * h * 4, 0);
            this.renderVectorObjectToBuffer(state, foundObj, composite, w, h, frame, new Set(), undefined, undefined, undefined, filterOpts);
            targetBBox = this.computeObjectBoundingBox(this.resolveAnimatedObject(state, foundObj, frame), state);
        }

        if (opts.includeGridOverlay) {
            const step = 64;
            for (let x = step; x < w; x += step) {
                for (let y = 0; y < h; y++) {
                    const idx = (y * w + x) * 4;
                    this.blendPixelInPlace(composite, idx, 128, 128, 255, 70, "normal");
                }
            }
            for (let y = step; y < h; y += step) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    this.blendPixelInPlace(composite, idx, 128, 128, 255, 70, "normal");
                }
            }
        }

        if (opts.highlightBoundingBoxes) {
            const bboxColor: RGBA = { r: 255, g: 0, b: 128, a: 200 };
            for (const layer of state.layers) {
                if (!layer.visible) continue;
                for (const obj of layer.objects) {
                    const b = this.computeObjectBoundingBox(this.resolveAnimatedObject(state, obj, frame), state);
                    this.drawSegmentOnBuffer(composite, w, h, b.x, b.y, b.x + b.width, b.y, bboxColor, 1, 1);
                    this.drawSegmentOnBuffer(composite, w, h, b.x + b.width, b.y, b.x + b.width, b.y + b.height, bboxColor, 1, 1);
                    this.drawSegmentOnBuffer(composite, w, h, b.x + b.width, b.y + b.height, b.x, b.y + b.height, bboxColor, 1, 1);
                    this.drawSegmentOnBuffer(composite, w, h, b.x, b.y + b.height, b.x, b.y, bboxColor, 1, 1);
                }
            }
        }

        let outBuf = composite;
        let outW = w;
        let outH = h;
        const crop = opts.cropBox;
        if (crop && crop.width > 0 && crop.height > 0) {
            const cx = Math.max(0, Math.min(w - 1, Math.floor(crop.x)));
            const cy = Math.max(0, Math.min(h - 1, Math.floor(crop.y)));
            outW = Math.max(1, Math.min(w - cx, Math.floor(crop.width)));
            outH = Math.max(1, Math.min(h - cy, Math.floor(crop.height)));
            outBuf = Buffer.alloc(outW * outH * 4);
            for (let row = 0; row < outH; row++) {
                const srcStart = ((cy + row) * w + cx) * 4;
                composite.copy(outBuf, row * outW * 4, srcStart, srcStart + outW * 4);
            }
            targetBBox = { x: cx, y: cy, width: outW, height: outH };
        }

        const pngBuffer = encodeRgbaToPng(outW, outH, outBuf);
        const snapshotsDir = path.join(this.getCanvasDir(opts.canvasId), "snapshots");
        fs.mkdirSync(snapshotsDir, { recursive: true });
        const snapFileName = `snap_${targetType}_${opts.targetId || "all"}_f${frame}_${Date.now()}.png`;
        const snapshotPath = path.join(snapshotsDir, snapFileName);
        fs.writeFileSync(snapshotPath, pngBuffer);

        return {
            canvasId: opts.canvasId,
            targetType,
            targetId: opts.targetId,
            frame,
            width: outW,
            height: outH,
            mimeType: "image/png",
            base64: pngBuffer.toString("base64"),
            snapshotPath,
            boundingBox: targetBBox
        };
    }

    // ============================================================================
    // 6. Scene & Pixel Inspection
    // ============================================================================

    private getDefaultEasingControlPoints(easing?: EasingMode): [number, number, number, number] {
        switch (easing) {
            case "ease_in":
                return [0.42, 0, 1, 1];
            case "ease_out":
                return [0, 0, 0.58, 1];
            case "ease_in_out":
                return [0.42, 0, 0.58, 1];
            case "ease_in_back":
                return [0.36, 0, 0.66, -0.56];
            case "overshoot":
                return [0.34, 1.56, 0.64, 1];
            case "snap":
                return [0.05, 0.95, 0.15, 1];
            default:
                return [0, 0, 1, 1];
        }
    }

    /**
     * Inspects the animation timeline (Main Canvas or a Shared Object), returning full details on
     * tracks, keyframes, easing curves (`[x1, y1, x2, y2]` control points & presets), raster cel transitions
     * (blend preset, category, cross-layer target, custom JS code), and target visibility spans (`startFrame..endFrame`).
     */
    public inspectAnimationTimeline(
        canvasId: string,
        options?: { sharedObjectId?: string; targetId?: string; includePresetCatalogs?: boolean }
    ): Record<string, any> {
        const state = this.loadCanvas(canvasId);
        const sharedId = options?.sharedObjectId;
        const container = sharedId ? this.getSharedObjectOrThrow(state, sharedId) : state;
        const anim: AnimationTimelineSpec = container.animation || {
            fps: 12,
            durationFrames: 1,
            loop: true,
            tracks: []
        };
        const blendPresets = this.listRasterBlendPresets(canvasId, sharedId);
        const customCurves = anim.customCurvePresets || [];

        const resolveTargetMeta = (tid: string): { name: string; targetType: string } => {
            const layer = container.layers.find(l => l.id === tid);
            if (layer) {
                return {
                    name: layer.name,
                    targetType: layer.type === "raster" ? "raster_layer" : "vector_layer"
                };
            }
            for (const l of container.layers) {
                const obj = l.objects.find(o => o.id === tid);
                if (obj) {
                    return {
                        name: obj.text || obj.refId || `${obj.kind} (${obj.id})`,
                        targetType: obj.kind === "ref" ? "shared_object_ref" : "vector_object"
                    };
                }
            }
            return { name: tid, targetType: "unknown" };
        };

        const filteredTracks = options?.targetId
            ? (anim.tracks || []).filter(t => t.targetId === options.targetId)
            : anim.tracks || [];

        const enrichedTracks = filteredTracks.map(track => {
            const meta = resolveTargetMeta(track.targetId);
            const kfs = [...(track.keyframes || [])].sort((a, b) => a.frame - b.frame);
            const enrichedKeyframes = kfs.map((kf, idx) => {
                const nextKf = kfs[idx + 1];
                const effectiveEndFrame =
                    kf.endFrame !== undefined
                        ? kf.endFrame
                        : nextKf
                          ? nextKf.frame
                          : anim.durationFrames - 1;
                const cp: [number, number, number, number] =
                    kf.curveControlPoints && kf.curveControlPoints.length === 4
                        ? [
                              kf.curveControlPoints[0],
                              kf.curveControlPoints[1],
                              kf.curveControlPoints[2],
                              kf.curveControlPoints[3]
                          ]
                        : this.getDefaultEasingControlPoints(kf.easing);
                const curvePresetMatch = customCurves.find(p => p.id === kf.curvePresetId);
                const blendPresetId = kf.rasterBlendPresetId || (track.property === "rasterCel" ? "crossfade" : undefined);
                const blendPreset = blendPresetId ? blendPresets.find(p => p.id === blendPresetId) : undefined;
                const hasTransition =
                    track.property === "rasterCel" ||
                    Boolean(kf.rasterBlendPresetId) ||
                    Boolean(kf.rasterBlendCustomCode) ||
                    Boolean(kf.rasterBlendTargetLayerId);

                const sampledEasingCurve = [0, 0.25, 0.5, 0.75, 1].map(t => ({
                    t,
                    easedT: Math.round(this.applyEasing(t, kf.easing || "linear", cp) * 1000) / 1000
                }));

                return {
                    frame: kf.frame,
                    endFrame: kf.endFrame,
                    effectiveEndFrame,
                    durationFrames: Math.max(0, effectiveEndFrame - kf.frame),
                    value: kf.value,
                    nextValue: nextKf ? nextKf.value : kf.value,
                    easing: kf.easing || "linear",
                    curvePresetId: kf.curvePresetId || kf.easing || "linear",
                    curvePresetName: curvePresetMatch?.name || kf.curvePresetId || kf.easing || "Linear",
                    curveControlPoints: cp,
                    sampledEasingCurve,
                    ...(hasTransition
                        ? {
                              transition: {
                                  blendPresetId: blendPresetId || "crossfade",
                                  blendPresetName: blendPreset?.name || blendPresetId || "Crossfade",
                                  category: blendPreset?.category || "Dissolve & Fade",
                                  description: blendPreset?.description || "",
                                  targetLayerId: kf.rasterBlendTargetLayerId || null,
                                  targetFrame: kf.rasterBlendTargetFrame ?? null,
                                  hasCustomCode: Boolean(kf.rasterBlendCustomCode),
                                  customCode: kf.rasterBlendCustomCode || blendPreset?.code
                              }
                          }
                        : {})
                };
            });

            return {
                targetId: track.targetId,
                targetName: meta.name,
                targetType: meta.targetType,
                property: track.property,
                keyframeCount: enrichedKeyframes.length,
                keyframes: enrichedKeyframes
            };
        });

        const targetFrameRanges: Array<{
            targetId: string;
            name: string;
            targetType: string;
            startFrame: number;
            endFrame: number;
        }> = [];
        for (const l of container.layers) {
            targetFrameRanges.push({
                targetId: l.id,
                name: l.name,
                targetType: l.type === "raster" ? "raster_layer" : "vector_layer",
                startFrame: l.startFrame ?? 0,
                endFrame: l.endFrame ?? Math.max(0, anim.durationFrames - 1)
            });
            for (const o of l.objects) {
                targetFrameRanges.push({
                    targetId: o.id,
                    name: o.text || o.refId || `${o.kind} (${o.id})`,
                    targetType: o.kind === "ref" ? "shared_object_ref" : "vector_object",
                    startFrame: o.startFrame ?? 0,
                    endFrame: o.endFrame ?? Math.max(0, anim.durationFrames - 1)
                });
            }
        }

        const rasterLayerTransitions = container.layers
            .filter(l => l.type === "raster")
            .map(l => {
                const celTrack = enrichedTracks.find(t => t.targetId === l.id && t.property === "rasterCel");
                return {
                    layerId: l.id,
                    layerName: l.name,
                    celFrames: l.celFrames || [0],
                    defaultBlendPresetId: l.rasterBlendPresetId || "crossfade",
                    defaultBlendTargetLayerId: l.rasterBlendTargetLayerId || null,
                    transitions: celTrack ? celTrack.keyframes : []
                };
            });

        const sharedObjectTimelines: Record<string, any> = {};
        if (!sharedId) {
            for (const [sid, sObj] of Object.entries(state.sharedObjects || {})) {
                const sAnim = sObj.animation;
                sharedObjectTimelines[sid] = {
                    sharedObjectId: sid,
                    name: sObj.name,
                    fps: sAnim?.fps ?? anim.fps,
                    durationFrames: sAnim?.durationFrames ?? 1,
                    loop: sAnim?.loop ?? true,
                    loopBackToFrame: sAnim?.loopBackToFrame ?? 0,
                    trackCount: sAnim?.tracks?.length ?? 0
                };
            }
        }

        return {
            canvasId: state.canvasId,
            sharedObjectId: sharedId || null,
            fps: anim.fps,
            durationFrames: anim.durationFrames,
            loop: anim.loop,
            loopBackToFrame: anim.loopBackToFrame ?? 0,
            trackCount: enrichedTracks.length,
            tracks: enrichedTracks,
            rasterLayerTransitions,
            targetFrameRanges: options?.targetId
                ? targetFrameRanges.filter(r => r.targetId === options.targetId)
                : targetFrameRanges,
            sharedObjectTimelines,
            ...(options?.includePresetCatalogs !== false
                ? {
                      customCurvePresets: customCurves,
                      transitionCategories: RASTER_TRANSITION_CATEGORIES,
                      availableTransitions: blendPresets.map(p => ({
                          id: p.id,
                          name: p.name,
                          category: p.category || "Dissolve & Fade",
                          description: p.description,
                          builtIn: Boolean(p.builtIn)
                      })),
                      availableRasterBlendPresets: blendPresets.map(p => ({
                          id: p.id,
                          name: p.name,
                          category: p.category || "Dissolve & Fade",
                          description: p.description,
                          builtIn: Boolean(p.builtIn)
                      }))
                  }
                : {})
        };
    }

    public inspectScene(canvasId: string): Record<string, any> {
        const state = this.loadCanvas(canvasId);
        const summarizeLayer = (layer: ArtLayerSpec, zIndex: number, w: number, h: number, sharedObjectId?: string) => {
            const containerAnim = sharedObjectId
                ? state.sharedObjects[sharedObjectId]?.animation
                : state.animation;
            const layerFiltersEnabled = layer.filtersEnabled !== false;
            const enrichedLayerFilters = this.describeAttachedFilters(
                state,
                layer.attachedFilters,
                layerFiltersEnabled
            );
            const layerTracks = (containerAnim?.tracks || []).filter(t => t.targetId === layer.id);

            if (layer.type === "vector") {
                return {
                    zIndex,
                    id: layer.id,
                    name: layer.name,
                    type: layer.type,
                    visible: layer.visible,
                    locked: layer.locked,
                    opacity: layer.opacity,
                    blendMode: layer.blendMode,
                    startFrame: layer.startFrame,
                    endFrame: layer.endFrame,
                    filtersEnabled: layerFiltersEnabled,
                    effectiveFiltersInViewport: layerFiltersEnabled && (state.previewDynamicFilters !== false),
                    attachedFilters: enrichedLayerFilters,
                    animationTracks: layerTracks,
                    objectCount: layer.objects.length,
                    objects: layer.objects.map(o => {
                        const objFiltersEnabled = o.filtersEnabled !== false;
                        const objCacheStats = this.getObjectCacheStats(canvasId, o.id);
                        return {
                            id: o.id,
                            kind: o.kind,
                            refId: o.refId,
                            x: o.x,
                            y: o.y,
                            width: o.width,
                            height: o.height,
                            r: o.r,
                            rx: o.rx,
                            ry: o.ry,
                            x2: o.x2,
                            y2: o.y2,
                            cx: o.cx,
                            cy: o.cy,
                            sides: o.sides,
                            innerRadius: o.innerRadius,
                            d: o.d,
                            points: o.points,
                            closed: o.closed,
                            text: o.text,
                            fontFamily: o.fontFamily,
                            fontSize: o.fontSize,
                            rotation: o.rotation,
                            skewX: o.skewX,
                            skewY: o.skewY,
                            scaleX: o.scaleX,
                            scaleY: o.scaleY,
                            startFrame: o.startFrame,
                            endFrame: o.endFrame,
                            fill: o.fillOverride || o.fill,
                            stroke: o.strokeOverride || o.stroke,
                            fillOverride: o.fillOverride,
                            strokeOverride: o.strokeOverride,
                            strokeWidth: o.strokeWidth,
                            opacity: o.opacity,
                            isEditing: this.isObjectEditing(canvasId, o.id),
                            filtersEnabled: objFiltersEnabled,
                            attachedFilters: this.describeAttachedFilters(
                                state,
                                o.attachedFilters,
                                objFiltersEnabled && layerFiltersEnabled
                            ),
                            cacheStats: objCacheStats.entry || null,
                            animationTracks: (containerAnim?.tracks || []).filter(t => t.targetId === o.id),
                            boundingBox: this.computeObjectBoundingBox(o, state)
                        };
                    })
                };
            } else {
                const buf = this.loadRasterBuffer(state, layer.id, w, h, undefined, sharedObjectId);
                let nonTransparentPixels = 0;
                for (let i = 3; i < buf.length; i += 4) {
                    if (buf[i] > 0) nonTransparentPixels++;
                }
                return {
                    zIndex,
                    id: layer.id,
                    name: layer.name,
                    type: layer.type,
                    visible: layer.visible,
                    locked: layer.locked,
                    opacity: layer.opacity,
                    blendMode: layer.blendMode,
                    startFrame: layer.startFrame,
                    endFrame: layer.endFrame,
                    filtersEnabled: layerFiltersEnabled,
                    effectiveFiltersInViewport: layerFiltersEnabled && (state.previewDynamicFilters !== false),
                    attachedFilters: enrichedLayerFilters,
                    animationTracks: layerTracks,
                    celFrames: layer.celFrames || [0],
                    rasterBlendPresetId: layer.rasterBlendPresetId || "crossfade",
                    rasterBlendTargetLayerId: layer.rasterBlendTargetLayerId,
                    nonTransparentPixels,
                    coveragePercent: Math.round((nonTransparentPixels / (w * h)) * 10000) / 100,
                    contentBoundingBox: this.computeRasterBoundingBox(buf, w, h)
                };
            }
        };

        const sharedSummary: Record<string, any> = {};
        for (const [sId, sObj] of Object.entries(state.sharedObjects)) {
            const sFiltersEnabled = sObj.filtersEnabled !== false;
            sharedSummary[sId] = {
                id: sObj.id,
                name: sObj.name,
                category: sObj.category,
                width: sObj.width,
                height: sObj.height,
                isEditing: this.isSharedObjectEditing(canvasId, sId),
                filtersEnabled: sFiltersEnabled,
                attachedFilters: this.describeAttachedFilters(state, sObj.attachedFilters, sFiltersEnabled),
                layers: sObj.layers.map((l, idx) => summarizeLayer(l, idx, sObj.width, sObj.height, sObj.id)),
                animation: sObj.animation
            };
        }

        return {
            canvasId: state.canvasId,
            width: state.width,
            height: state.height,
            dpi: state.dpi,
            backgroundColor: state.backgroundColor,
            previewDynamicFilters: state.previewDynamicFilters !== false,
            metadata: state.metadata || {},
            embeddedFonts: Object.values(state.embeddedFonts || {}).map(f => ({
                id: f.id,
                family: f.family,
                style: f.style,
                weight: f.weight,
                format: f.format
            })),
            customFilterPresets: (state.customFilterPresets || []).map(p => ({
                id: p.id,
                name: p.name,
                category: p.category
            })),
            selection: state.selection,
            layerCount: state.layers.length,
            layers: state.layers.map((l, idx) => summarizeLayer(l, idx, state.width, state.height)),
            sharedObjects: sharedSummary,
            animation: state.animation,
            timelineSummary: this.inspectAnimationTimeline(canvasId, { includePresetCatalogs: false })
        };
    }

    public inspectPixels(
        canvasId: string,
        x: number,
        y: number,
        width: number = 1,
        height: number = 1,
        layerId?: string,
        frame: number = 0,
        options?: { rawRaster?: boolean; forExport?: boolean; previewFilters?: boolean }
    ): Record<string, any> {
        const state = this.loadCanvas(canvasId);
        const w = state.width;
        const h = state.height;
        const filterOpts: RenderFilterContextOptions | undefined = options
            ? { forExport: options.forExport, previewFilters: options.previewFilters }
            : undefined;

        let buf: Buffer;
        if (layerId) {
            const layer = state.layers.find(l => l.id === layerId || l.name === layerId);
            if (!layer) throw new Error(`Layer '${layerId}' not found.`);
            if (options?.rawRaster && layer.type === "raster") {
                buf = this.loadRasterBuffer(state, layer.id, w, h, frame > 0 ? frame : undefined);
            } else {
                buf = this.renderLayerToBuffer(state, layer, frame, filterOpts);
            }
        } else {
            buf = this.renderCompositeFrameBuffer(state, frame, filterOpts);
        }

        const startX = Math.max(0, Math.min(w - 1, Math.floor(x)));
        const startY = Math.max(0, Math.min(h - 1, Math.floor(y)));
        const regW = Math.max(1, Math.min(w - startX, Math.floor(width)));
        const regH = Math.max(1, Math.min(h - startY, Math.floor(height)));

        if (regW === 1 && regH === 1) {
            const idx = (startY * w + startX) * 4;
            const rgba: RGBA = { r: buf[idx], g: buf[idx + 1], b: buf[idx + 2], a: buf[idx + 3] };
            return { x: startX, y: startY, frame, rgba, hex: rgbaToHex(rgba) };
        }

        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, nonZeroAlpha = 0;
        const histogram: Record<string, number> = {};
        const total = regW * regH;

        for (let py = startY; py < startY + regH; py++) {
            for (let px = startX; px < startX + regW; px++) {
                const idx = (py * w + px) * 4;
                const c: RGBA = { r: buf[idx], g: buf[idx + 1], b: buf[idx + 2], a: buf[idx + 3] };
                rSum += c.r;
                gSum += c.g;
                bSum += c.b;
                aSum += c.a;
                if (c.a > 0) nonZeroAlpha++;
                const hex = rgbaToHex(c);
                histogram[hex] = (histogram[hex] || 0) + 1;
            }
        }

        const topColors = Object.entries(histogram)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([hex, count]) => ({ hex, count, percent: Math.round((count / total) * 10000) / 100 }));

        const avg: RGBA = {
            r: Math.round(rSum / total),
            g: Math.round(gSum / total),
            b: Math.round(bSum / total),
            a: Math.round(aSum / total)
        };

        return {
            region: { x: startX, y: startY, width: regW, height: regH },
            frame,
            totalPixels: total,
            nonTransparentPixels: nonZeroAlpha,
            averageRgba: avg,
            averageHex: rgbaToHex(avg),
            dominantColors: topColors
        };
    }

    // ============================================================================
    // 7. SAVING: Always Uses Custom `.docx`-Style ZIP + XML Format (`.hacanvas`)
    // ============================================================================

    private serializeVectorObjectToXml(obj: VectorObjectSpec, indent = "      "): string {
        if (obj.kind === "ref") {
            const attrs = [
                `id="${escapeXml(obj.id)}"`,
                `refId="${escapeXml(obj.refId)}"`,
                `x="${obj.x ?? 0}"`,
                `y="${obj.y ?? 0}"`,
                `scaleX="${obj.scaleX ?? 1}"`,
                `scaleY="${obj.scaleY ?? 1}"`,
                `rotation="${obj.rotation ?? 0}"`,
                obj.skewX !== undefined ? `skewX="${obj.skewX}"` : "",
                obj.skewY !== undefined ? `skewY="${obj.skewY}"` : "",
                obj.startFrame !== undefined ? `startFrame="${obj.startFrame}"` : "",
                obj.endFrame !== undefined ? `endFrame="${obj.endFrame}"` : "",
                `opacity="${obj.opacity ?? 1}"`,
                obj.fillOverride ? `fillOverride="${escapeXml(obj.fillOverride)}"` : "",
                obj.strokeOverride ? `strokeOverride="${escapeXml(obj.strokeOverride)}"` : "",
                obj.filtersEnabled !== undefined ? `filtersEnabled="${obj.filtersEnabled}"` : "",
                obj.attachedFilters && obj.attachedFilters.length > 0
                    ? `attachedFiltersB64="${Buffer.from(JSON.stringify(obj.attachedFilters), "utf8").toString("base64")}"`
                    : ""
            ].filter(Boolean).join(" ");
            return `${indent}<ObjectRef ${attrs} />`;
        }
        return `${indent}${this.vectorObjectToSvgElement(obj)}`;
    }

    private serializeAnimationToXml(anim: AnimationTimelineSpec | undefined, indent = "  "): string {
        if (!anim) return "";
        const tracksXml = (anim.tracks || []).map(tr => {
            const kfXml = tr.keyframes.map(k => {
                const extraAttrs = [
                    k.endFrame !== undefined ? `endFrame="${k.endFrame}"` : "",
                    k.curveControlPoints && k.curveControlPoints.length === 4
                        ? `curveControlPoints="${k.curveControlPoints.join(",")}"`
                        : "",
                    k.curvePresetId ? `curvePresetId="${escapeXml(k.curvePresetId)}"` : "",
                    k.rasterBlendPresetId ? `rasterBlendPresetId="${escapeXml(k.rasterBlendPresetId)}"` : "",
                    k.rasterBlendCustomCode
                        ? `rasterBlendCustomCodeB64="${Buffer.from(k.rasterBlendCustomCode, "utf8").toString("base64")}"`
                        : "",
                    k.rasterBlendTargetLayerId ? `rasterBlendTargetLayerId="${escapeXml(k.rasterBlendTargetLayerId)}"` : "",
                    k.rasterBlendTargetFrame !== undefined ? `rasterBlendTargetFrame="${k.rasterBlendTargetFrame}"` : ""
                ].filter(Boolean).join(" ");
                const valStr = Array.isArray(k.value) ? JSON.stringify(k.value) : String(k.value);
                const valType = Array.isArray(k.value) ? "points" : typeof k.value;
                return `${indent}    <Keyframe frame="${k.frame}" value="${escapeXml(valStr)}" valueType="${valType}" easing="${k.easing || "linear"}"${extraAttrs ? " " + extraAttrs : ""} />`;
            }).join("\n");
            return `${indent}  <Track id="${escapeXml(tr.id)}" targetId="${escapeXml(tr.targetId)}" property="${escapeXml(tr.property)}">\n${kfXml}\n${indent}  </Track>`;
        }).join("\n");

        const presetsXml = (anim.customCurvePresets || []).map(p =>
            `${indent}  <CurvePreset id="${escapeXml(p.id)}" name="${escapeXml(p.name)}" controlPoints="${p.controlPoints.join(",")}" />`
        ).join("\n");

        const rasterPresetsXml = (anim.customRasterBlendPresets || []).map(rp =>
            `${indent}  <RasterBlendPreset id="${escapeXml(rp.id)}" name="${escapeXml(rp.name)}" category="${escapeXml(rp.category || "Custom")}" description="${escapeXml(rp.description || "")}" codeB64="${Buffer.from(rp.code || "", "utf8").toString("base64")}" />`
        ).join("\n");

        const loopBackAttr = anim.loopBackToFrame !== undefined ? ` loopBackToFrame="${anim.loopBackToFrame}"` : "";
        const innerLines = [presetsXml, rasterPresetsXml, tracksXml].filter(Boolean).join("\n");
        return `${indent}<Animation fps="${anim.fps}" durationFrames="${anim.durationFrames}" loop="${anim.loop}"${loopBackAttr}>\n${innerLines}\n${indent}</Animation>`;
    }

    private serializeLayerListToXml(
        state: ArtCanvasState,
        layers: ArtLayerSpec[],
        zipEntries: Record<string, Buffer | string>,
        rels: { id: string; type: string; target: string }[],
        sharedObjectId?: string
    ): string {
        const w = sharedObjectId ? state.sharedObjects[sharedObjectId].width : state.width;
        const h = sharedObjectId ? state.sharedObjects[sharedObjectId].height : state.height;

        return layers.map(layer => {
            const extraLayerAttrs = [
                layer.offsetX !== undefined ? `offsetX="${layer.offsetX}"` : "",
                layer.offsetY !== undefined ? `offsetY="${layer.offsetY}"` : "",
                layer.startFrame !== undefined ? `startFrame="${layer.startFrame}"` : "",
                layer.endFrame !== undefined ? `endFrame="${layer.endFrame}"` : "",
                layer.rasterBlendPresetId ? `rasterBlendPresetId="${escapeXml(layer.rasterBlendPresetId)}"` : "",
                layer.rasterBlendCustomCode
                    ? `rasterBlendCustomCodeB64="${Buffer.from(layer.rasterBlendCustomCode, "utf8").toString("base64")}"`
                    : "",
                layer.rasterBlendTargetLayerId ? `rasterBlendTargetLayerId="${escapeXml(layer.rasterBlendTargetLayerId)}"` : "",
                layer.rasterBlendTargetFrame !== undefined ? `rasterBlendTargetFrame="${layer.rasterBlendTargetFrame}"` : "",
                layer.rasterBlendEasing ? `rasterBlendEasing="${escapeXml(layer.rasterBlendEasing)}"` : "",
                layer.rasterBlendCurveControlPoints && layer.rasterBlendCurveControlPoints.length === 4
                    ? `rasterBlendCurveControlPoints="${layer.rasterBlendCurveControlPoints.join(",")}"`
                    : "",
                layer.rasterBlendCurvePresetId ? `rasterBlendCurvePresetId="${escapeXml(layer.rasterBlendCurvePresetId)}"` : "",
                layer.filtersEnabled !== undefined ? `filtersEnabled="${layer.filtersEnabled}"` : "",
                layer.attachedFilters && layer.attachedFilters.length > 0
                    ? `attachedFiltersB64="${Buffer.from(JSON.stringify(layer.attachedFilters), "utf8").toString("base64")}"`
                    : ""
            ].filter(Boolean).join(" ");
            const baseAttrs = `id="${escapeXml(layer.id)}" name="${escapeXml(layer.name)}" type="${layer.type}" visible="${layer.visible}" locked="${layer.locked}" opacity="${layer.opacity}" blendMode="${layer.blendMode}"${extraLayerAttrs ? " " + extraLayerAttrs : ""}`;
            if (layer.type === "vector") {
                const mediaPrefix = sharedObjectId ? `${sharedObjectId}_${layer.id}` : layer.id;
                const childrenXml = layer.objects.map(o => {
                    if (o.kind === "image" && o.imageDataUrl) {
                        const m = o.imageDataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
                        if (m) {
                            const ext = m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
                            const safeObjId = o.id.replace(/[^a-zA-Z0-9_-]/g, "_");
                            const vecImgTarget = `media/vec_img_${mediaPrefix}_${safeObjId}.${ext}`;
                            zipEntries[vecImgTarget] = Buffer.from(m[2], "base64");
                            rels.push({
                                id: `rId_vecimg_${mediaPrefix}_${safeObjId}`,
                                type: "http://schemas.aicore.local/hybrid-art/2026/relationships/vectorImageMedia",
                                target: `../${vecImgTarget}`
                            });
                            const cloneWithSrc: VectorObjectSpec = { ...o, imageDataUrl: vecImgTarget };
                            return this.serializeVectorObjectToXml(cloneWithSrc, "      ");
                        }
                    }
                    return this.serializeVectorObjectToXml(o, "      ");
                }).join("\n");
                return `    <Layer ${baseAttrs}>\n${childrenXml}\n    </Layer>`;
            } else {
                const mediaPrefix = sharedObjectId ? `${sharedObjectId}_${layer.id}` : layer.id;
                const mediaTarget = `media/${mediaPrefix}.png`;
                const baseBuf = this.loadRasterBuffer(state, layer.id, w, h, undefined, sharedObjectId);
                zipEntries[mediaTarget] = encodeRgbaToPng(w, h, baseBuf);
                rels.push({
                    id: `rId_media_${mediaPrefix}`,
                    type: "http://schemas.aicore.local/hybrid-art/2026/relationships/rasterMedia",
                    target: `../${mediaTarget}`
                });

                const celXmlLines: string[] = [
                    `      <RasterMedia frame="0" src="${escapeXml(mediaTarget)}" width="${w}" height="${h}" />`
                ];
                for (const celFrame of layer.celFrames || []) {
                    if (celFrame <= 0) continue;
                    const celTarget = `media/${mediaPrefix}_cel_${celFrame}.png`;
                    const celBuf = this.loadRasterBuffer(state, layer.id, w, h, celFrame, sharedObjectId);
                    zipEntries[celTarget] = encodeRgbaToPng(w, h, celBuf);
                    celXmlLines.push(`      <RasterMedia frame="${celFrame}" src="${escapeXml(celTarget)}" width="${w}" height="${h}" />`);
                }
                return `    <Layer ${baseAttrs}>\n${celXmlLines.join("\n")}\n    </Layer>`;
            }
        }).join("\n");
    }

    /**
     * Saves the canvas into the custom `.docx`-like Open Packaging Conventions ZIP + XML archive (`.hacanvas`).
     * - `[Content_Types].xml`
     * - `_rels/.rels`
     * - `canvas/document.xml`
     * - `canvas/_rels/document.xml.rels`
     * - `objects/<sharedObjectId>.xml` (each shared object in its own XML file with its own layers of SVG elements,
     *   graphical pixel `<RasterMedia>`, nested `<ObjectRef>` references, and scoped `<Animation>`)
     * - `media/*.png` (lossless 32-bit RGBA graphical pixel buffers)
     */
    public saveCanvasPackage(canvasId: string, filePath: string): { filePath: string; format: "hacanvas"; bytesWritten: number; sharedObjectCount: number; layerCount: number } {
        const state = this.loadCanvas(canvasId);
        let resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(this.projectRoot, filePath.replace(/^[/\\]+/, ""));

        if (!/\.(hacanvas|aicz|zip)$/i.test(resolvedPath)) {
            resolvedPath += ".hacanvas";
        }
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

        const zipEntries: Record<string, Buffer | string> = {};
        const docRels: { id: string; type: string; target: string }[] = [];

        // 1. Serialize each Shared Object into its own `objects/<id>.xml`
        const sharedEntries = Object.values(state.sharedObjects || {});
        for (const sObj of sharedEntries) {
            const objXmlPath = `objects/${sObj.id}.xml`;
            const sLayersXml = this.serializeLayerListToXml(state, sObj.layers, zipEntries, docRels, sObj.id);
            const catAttr = sObj.category ? ` category="${escapeXml(sObj.category)}"` : "";
            const sFiltersEnabledAttr = sObj.filtersEnabled !== undefined ? ` filtersEnabled="${sObj.filtersEnabled}"` : "";
            const sAttachedFiltersAttr =
                sObj.attachedFilters && sObj.attachedFilters.length > 0
                    ? ` attachedFiltersB64="${Buffer.from(JSON.stringify(sObj.attachedFilters), "utf8").toString("base64")}"`
                    : "";
            const sAnimXml = sObj.animation ? `\n${this.serializeAnimationToXml(sObj.animation, "  ")}` : "";
            zipEntries[objXmlPath] = `<?xml version="1.0" encoding="UTF-8"?>
<SharedObject xmlns="http://schemas.aicore.local/hybrid-art/2026/main" id="${escapeXml(sObj.id)}" name="${escapeXml(sObj.name)}"${catAttr} width="${sObj.width}" height="${sObj.height}"${sFiltersEnabledAttr}${sAttachedFiltersAttr}>
  <Layers>
${sLayersXml}
  </Layers>${sAnimXml}
</SharedObject>`;
            docRels.push({
                id: `rId_obj_${sObj.id}`,
                type: "http://schemas.aicore.local/hybrid-art/2026/relationships/sharedObject",
                target: `../${objXmlPath}`
            });
        }

        // 2. Serialize Embedded Fonts into `fonts/<id>.<ext>` and `<EmbeddedFonts>`
        const fontEntries = Object.values(state.embeddedFonts || {});
        const embeddedFontsXmlLines: string[] = [];
        for (const ef of fontEntries) {
            const safeFontId = ef.id.replace(/[^a-zA-Z0-9_-]/g, "_");
            const ext = ef.format || "ttf";
            const fontTarget = `fonts/${safeFontId}.${ext}`;
            zipEntries[fontTarget] = Buffer.from(ef.dataBase64 || "", "base64");
            docRels.push({
                id: `rId_font_${safeFontId}`,
                type: "http://schemas.aicore.local/hybrid-art/2026/relationships/embeddedFont",
                target: `../${fontTarget}`
            });
            embeddedFontsXmlLines.push(
                `    <EmbeddedFont id="${escapeXml(ef.id)}" name="${escapeXml(ef.name)}" family="${escapeXml(ef.family)}" format="${escapeXml(ext)}" weight="${escapeXml(ef.weight || "normal")}" style="${escapeXml(ef.style || "normal")}" source="${escapeXml(ef.source || "user")}" src="${escapeXml(fontTarget)}" />`
            );
        }

        // 3. Serialize main canvas layers and animation into `canvas/document.xml`
        const mainLayersXml = this.serializeLayerListToXml(state, state.layers, zipEntries, docRels);
        const mainAnimXml = this.serializeAnimationToXml(state.animation, "  ");

        const sharedRefsManifest = sharedEntries.map(s =>
            `    <SharedObjectInclude id="${escapeXml(s.id)}" src="objects/${escapeXml(s.id)}.xml" />`
        ).join("\n");

        // 2b. Serialize Document Metadata (`state.metadata`) into `docProps/metadata.xml` and `<Metadata>`
        const meta = state.metadata || {};
        const metaAttrs: string[] = [];
        if (meta.title) metaAttrs.push(`title="${escapeXml(meta.title)}"`);
        if (meta.author) metaAttrs.push(`author="${escapeXml(meta.author)}"`);
        if (meta.description) metaAttrs.push(`description="${escapeXml(meta.description)}"`);
        if (meta.subject) metaAttrs.push(`subject="${escapeXml(meta.subject)}"`);
        if (meta.copyright) metaAttrs.push(`copyright="${escapeXml(meta.copyright)}"`);
        if (meta.comment) metaAttrs.push(`comment="${escapeXml(meta.comment)}"`);
        if (meta.rating !== undefined) metaAttrs.push(`rating="${meta.rating}"`);
        if (meta.software) metaAttrs.push(`software="${escapeXml(meta.software)}"`);
        if (meta.createdAt) metaAttrs.push(`createdAt="${escapeXml(meta.createdAt)}"`);
        if (meta.modifiedAt) metaAttrs.push(`modifiedAt="${escapeXml(meta.modifiedAt)}"`);
        if (meta.make) metaAttrs.push(`make="${escapeXml(meta.make)}"`);
        if (meta.model) metaAttrs.push(`model="${escapeXml(meta.model)}"`);
        if (meta.lensModel) metaAttrs.push(`lensModel="${escapeXml(meta.lensModel)}"`);
        if (meta.focalLengthMm !== undefined) metaAttrs.push(`focalLengthMm="${meta.focalLengthMm}"`);
        if (meta.fNumber !== undefined) metaAttrs.push(`fNumber="${meta.fNumber}"`);
        if (meta.exposureTime) metaAttrs.push(`exposureTime="${escapeXml(meta.exposureTime)}"`);
        if (meta.isoSpeed !== undefined) metaAttrs.push(`isoSpeed="${meta.isoSpeed}"`);
        if (meta.orientation !== undefined) metaAttrs.push(`orientation="${meta.orientation}"`);
        if (meta.keywords && meta.keywords.length > 0) {
            metaAttrs.push(`keywords="${escapeXml(meta.keywords.join(", "))}"`);
        }

        const metaChildLines: string[] = [];
        if (meta.gps) {
            const gAttrs: string[] = [];
            if (meta.gps.latitude !== undefined && Number.isFinite(meta.gps.latitude)) gAttrs.push(`latitude="${meta.gps.latitude}"`);
            if (meta.gps.longitude !== undefined && Number.isFinite(meta.gps.longitude)) gAttrs.push(`longitude="${meta.gps.longitude}"`);
            if (meta.gps.altitude !== undefined && Number.isFinite(meta.gps.altitude)) gAttrs.push(`altitude="${meta.gps.altitude}"`);
            if (meta.gps.locationName) gAttrs.push(`locationName="${escapeXml(meta.gps.locationName)}"`);
            if (meta.gps.country) gAttrs.push(`country="${escapeXml(meta.gps.country)}"`);
            if (gAttrs.length > 0) {
                metaChildLines.push(`    <GPS ${gAttrs.join(" ")} />`);
            }
        }
        if (meta.custom) {
            for (const [ck, cv] of Object.entries(meta.custom)) {
                if (ck && cv !== undefined) {
                    metaChildLines.push(`    <CustomField key="${escapeXml(ck)}" value="${escapeXml(String(cv))}" />`);
                }
            }
        }

        const metadataXmlElement = metaChildLines.length > 0
            ? `  <Metadata${metaAttrs.length > 0 ? " " + metaAttrs.join(" ") : ""}>\n${metaChildLines.join("\n")}\n  </Metadata>`
            : `  <Metadata${metaAttrs.length > 0 ? " " + metaAttrs.join(" ") : ""} />`;

        if (hasMeaningfulMetadata(meta)) {
            zipEntries["docProps/metadata.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n${metadataXmlElement.trim()}\n`;
            zipEntries["docProps/xmp.xml"] = buildXmpPacketString(meta);
            docRels.push({
                id: "rId_metadata",
                type: "http://schemas.aicore.local/hybrid-art/2026/relationships/metadata",
                target: "../docProps/metadata.xml"
            });
        }

        // 2c. Serialize Custom Filter Presets (`state.customFilterPresets`) and Custom Transition Presets into `<CustomFilters>`, `<CustomTransitions>`, and `presets/*.xml`
        const customFilters = state.customFilterPresets || [];
        const customFilterXmlLines = customFilters.map(fp => {
            const schemasB64 = Buffer.from(JSON.stringify(fp.parameterSchemas || []), "utf8").toString("base64");
            const codeB64 = Buffer.from(fp.code || "", "utf8").toString("base64");
            return `    <FilterPreset id="${escapeXml(fp.id)}" name="${escapeXml(fp.name)}" category="${escapeXml(fp.category || "Custom")}" description="${escapeXml(fp.description || "")}" gimpProcedure="${escapeXml(fp.gimpProcedure || "")}" parameterSchemasB64="${schemasB64}" codeB64="${codeB64}" />`;
        });
        const customFiltersElement = customFilterXmlLines.length > 0
            ? `  <CustomFilters>\n${customFilterXmlLines.join("\n")}\n  </CustomFilters>`
            : `  <CustomFilters />`;

        if (customFilters.length > 0) {
            zipEntries["presets/filters.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<CustomFilters xmlns="http://schemas.aicore.local/hybrid-art/2026/main">\n${customFilterXmlLines.join("\n")}\n</CustomFilters>\n`;
            docRels.push({
                id: "rId_custom_filters",
                type: "http://schemas.aicore.local/hybrid-art/2026/relationships/customFilters",
                target: "../presets/filters.xml"
            });
        }

        const customTransitions = state.animation?.customRasterBlendPresets || [];
        const customTransitionXmlLines = customTransitions.map(rp => {
            const codeB64 = Buffer.from(rp.code || "", "utf8").toString("base64");
            return `    <RasterBlendPreset id="${escapeXml(rp.id)}" name="${escapeXml(rp.name)}" category="${escapeXml(rp.category || "Custom")}" description="${escapeXml(rp.description || "")}" codeB64="${codeB64}" />`;
        });
        const customTransitionsElement = customTransitionXmlLines.length > 0
            ? `  <CustomTransitions>\n${customTransitionXmlLines.join("\n")}\n  </CustomTransitions>`
            : `  <CustomTransitions />`;

        if (customTransitions.length > 0) {
            zipEntries["presets/transitions.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<CustomTransitions xmlns="http://schemas.aicore.local/hybrid-art/2026/main">\n${customTransitionXmlLines.join("\n")}\n</CustomTransitions>\n`;
            docRels.push({
                id: "rId_custom_transitions",
                type: "http://schemas.aicore.local/hybrid-art/2026/relationships/customTransitions",
                target: "../presets/transitions.xml"
            });
        }

        const previewFiltersAttr =
            state.previewDynamicFilters !== undefined ? ` previewDynamicFilters="${state.previewDynamicFilters}"` : "";
        zipEntries["canvas/document.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<HybridCanvas xmlns="http://schemas.aicore.local/hybrid-art/2026/main" id="${escapeXml(state.canvasId)}" width="${state.width}" height="${state.height}" dpi="${state.dpi}" backgroundColor="${escapeXml(state.backgroundColor)}"${previewFiltersAttr}>
${metadataXmlElement}
  <SharedObjects>
${sharedRefsManifest}
  </SharedObjects>
  <EmbeddedFonts>
${embeddedFontsXmlLines.join("\n")}
  </EmbeddedFonts>
${customFiltersElement}
${customTransitionsElement}
  <Layers>
${mainLayersXml}
  </Layers>
${mainAnimXml}
</HybridCanvas>`;

        // 4. Relationships (`_rels/.rels` and `canvas/_rels/document.xml.rels`) & `[Content_Types].xml`
        zipEntries["_rels/.rels"] = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.aicore.local/hybrid-art/2026/relationships/mainDocument" Target="canvas/document.xml" />
</Relationships>`;

        const relLines = docRels.map(r =>
            `  <Relationship Id="${escapeXml(r.id)}" Type="${escapeXml(r.type)}" Target="${escapeXml(r.target)}" />`
        ).join("\n");
        zipEntries["canvas/_rels/document.xml.rels"] = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relLines}
</Relationships>`;

        const overrideLines = [
            `  <Override PartName="/canvas/document.xml" ContentType="application/vnd.aicore.hybrid-canvas.main+xml" />`,
            ...sharedEntries.map(s => `  <Override PartName="/objects/${escapeXml(s.id)}.xml" ContentType="application/vnd.aicore.hybrid-canvas.shared-object+xml" />`)
        ].join("\n");

        zipEntries["[Content_Types].xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="jpg" ContentType="image/jpeg" />
  <Default Extension="ttf" ContentType="font/ttf" />
  <Default Extension="otf" ContentType="font/otf" />
  <Default Extension="woff" ContentType="font/woff" />
  <Default Extension="woff2" ContentType="font/woff2" />
${overrideLines}
</Types>`;

        const zipBuffer = createZipArchive(zipEntries);
        fs.writeFileSync(resolvedPath, zipBuffer);

        return {
            filePath: resolvedPath,
            format: "hacanvas",
            bytesWritten: zipBuffer.length,
            sharedObjectCount: sharedEntries.length,
            layerCount: state.layers.length
        };
    }

    // ============================================================================
    // 8. LOADING: Supports ANY Format (.hacanvas, PSD/PSB, XCF, ORA, SVG, & All Images)
    // ============================================================================

    private parseXmlVectorElement(node: ParsedXmlNode, defaultIndex: number, zipFiles?: Map<string, Buffer>): VectorObjectSpec | null {
        const tag = node.tag.replace(/^.*:/, "").toLowerCase();
        const a = node.attrs;
        const id = a.id || `obj_${tag}_${defaultIndex}_${Date.now() % 10000}`;

        // Parse inline CSS style attribute if present (`fill:#ff0000;stroke:#000;stroke-width:2;opacity:0.8`)
        const styleMap: Record<string, string> = {};
        if (a.style) {
            for (const part of a.style.split(";")) {
                const [k, v] = part.split(":").map(s => s?.trim());
                if (k && v) styleMap[k.toLowerCase()] = v;
            }
        }
        const getStyle = (prop: string, defVal?: string) => a[prop] ?? styleMap[prop] ?? defVal;

        const parseOptionalFloat = (val?: string) => (val !== undefined && val !== "" ? parseFloat(val) : undefined);
        const parseOptionalInt = (val?: string) => (val !== undefined && val !== "" ? parseInt(val, 10) : undefined);

        const rawFiltersEnabled = a.filtersEnabled ?? a["data-filters-enabled"];
        const parsedFiltersEnabled = rawFiltersEnabled !== undefined && rawFiltersEnabled !== "" ? rawFiltersEnabled !== "false" : undefined;
        const rawAttachedB64 = a.attachedFiltersB64 ?? a["data-attached-filters-b64"];
        let parsedAttachedFilters: AttachedFilterSpec[] | undefined;
        if (rawAttachedB64) {
            try {
                const decoded = JSON.parse(Buffer.from(rawAttachedB64, "base64").toString("utf8"));
                if (Array.isArray(decoded)) {
                    parsedAttachedFilters = decoded;
                }
            } catch {
                parsedAttachedFilters = undefined;
            }
        }
        const filterFields = {
            ...(parsedFiltersEnabled !== undefined ? { filtersEnabled: parsedFiltersEnabled } : {}),
            ...(parsedAttachedFilters && parsedAttachedFilters.length > 0 ? { attachedFilters: parsedAttachedFilters } : {})
        };

        if (tag === "objectref" || tag === "use") {
            const rawHref = a.refId || a.href || a["xlink:href"] || "";
            const refId = rawHref.replace(/^#/, "");
            if (!refId) return null;
            return {
                id,
                kind: "ref",
                refId,
                x: parseFloat(a.x || "0"),
                y: parseFloat(a.y || "0"),
                scaleX: parseFloat(a.scaleX || "1"),
                scaleY: parseFloat(a.scaleY || "1"),
                rotation: parseFloat(a.rotation || a["data-rotation"] || "0"),
                skewX: parseOptionalFloat(a.skewX || a["data-skew-x"]),
                skewY: parseOptionalFloat(a.skewY || a["data-skew-y"]),
                startFrame: parseOptionalInt(a.startFrame || a["data-start-frame"]),
                endFrame: parseOptionalInt(a.endFrame || a["data-end-frame"]),
                opacity: parseFloat(getStyle("opacity", "1")!),
                fillOverride: a.fillOverride || getStyle("fill"),
                strokeOverride: a.strokeOverride || getStyle("stroke"),
                ...filterFields
            };
        }

        if (tag === "image" || tag === "vectorimage") {
            const rawHref = a.href || a["xlink:href"] || a.src || "";
            let dataUrl = rawHref;
            if (zipFiles && rawHref && !rawHref.startsWith("data:")) {
                const cleanKey = rawHref.replace(/^\.\.\//, "").replace(/^\//, "");
                const mediaBuf = zipFiles.get(cleanKey) || zipFiles.get(rawHref);
                if (mediaBuf) {
                    const mime = cleanKey.toLowerCase().endsWith(".jpg") || cleanKey.toLowerCase().endsWith(".jpeg")
                        ? "image/jpeg"
                        : "image/png";
                    dataUrl = `data:${mime};base64,${mediaBuf.toString("base64")}`;
                }
            }
            const w = parseFloat(a.width || a["data-image-width"] || "100");
            const h = parseFloat(a.height || a["data-image-height"] || "100");
            const imgW = parseFloat(a["data-image-width"] || String(w));
            const imgH = parseFloat(a["data-image-height"] || String(h));
            return {
                id,
                kind: "image",
                x: parseFloat(a.x || "0"),
                y: parseFloat(a.y || "0"),
                width: w,
                height: h,
                imageWidth: imgW,
                imageHeight: imgH,
                imageDataUrl: dataUrl,
                fill: "none",
                stroke: "none",
                strokeWidth: 0,
                opacity: parseFloat(getStyle("opacity", "1")!),
                rotation: parseOptionalFloat(a["data-rotation"] || a.rotation),
                skewX: parseOptionalFloat(a["data-skew-x"] || a.skewX),
                skewY: parseOptionalFloat(a["data-skew-y"] || a.skewY),
                startFrame: parseOptionalInt(a["data-start-frame"] || a.startFrame),
                endFrame: parseOptionalInt(a["data-end-frame"] || a.endFrame),
                transform: a.transform,
                ...filterFields
            };
        }

        const common = {
            id,
            fill: getStyle("fill", "#000000"),
            stroke: getStyle("stroke", "none"),
            strokeWidth: parseFloat(getStyle("stroke-width", "1")!),
            opacity: parseFloat(getStyle("opacity", "1")!),
            rotation: parseOptionalFloat(a["data-rotation"] || a.rotation),
            skewX: parseOptionalFloat(a["data-skew-x"] || a.skewX),
            skewY: parseOptionalFloat(a["data-skew-y"] || a.skewY),
            startFrame: parseOptionalInt(a["data-start-frame"] || a.startFrame),
            endFrame: parseOptionalInt(a["data-end-frame"] || a.endFrame),
            transform: a.transform,
            ...filterFields
        };

        if (tag === "rect") {
            return {
                ...common,
                kind: "rect",
                x: parseFloat(a.x || "0"),
                y: parseFloat(a.y || "0"),
                width: parseFloat(a.width || "100"),
                height: parseFloat(a.height || "100"),
                rx: a.rx ? parseFloat(a.rx) : undefined,
                ry: a.ry ? parseFloat(a.ry) : undefined
            };
        }
        if (tag === "circle") {
            const r = parseFloat(a.r || "50");
            return {
                ...common,
                kind: "circle",
                x: parseFloat(a.cx || String(r)),
                y: parseFloat(a.cy || String(r)),
                r,
                width: r * 2,
                height: r * 2
            };
        }
        if (tag === "ellipse") {
            const rx = parseFloat(a.rx || "50");
            const ry = parseFloat(a.ry || "50");
            return {
                ...common,
                kind: "ellipse",
                x: parseFloat(a.cx || String(rx)),
                y: parseFloat(a.cy || String(ry)),
                rx,
                ry,
                width: rx * 2,
                height: ry * 2
            };
        }
        if (tag === "line") {
            return {
                ...common,
                kind: "line",
                x: parseFloat(a.x1 || "0"),
                y: parseFloat(a.y1 || "0"),
                x2: parseFloat(a.x2 || "100"),
                y2: parseFloat(a.y2 || "100"),
                cx: parseOptionalFloat(a["data-cx"] || a.cx),
                cy: parseOptionalFloat(a["data-cy"] || a.cy)
            };
        }
        if (tag === "polygon" || tag === "polyline") {
            const nums = (a.points || "").match(/[-+]?\d*\.?\d+/g)?.map(Number) || [];
            const pts: { x: number; y: number }[] = [];
            for (let i = 0; i + 1 < nums.length; i += 2) {
                pts.push({ x: nums[i], y: nums[i + 1] });
            }
            return {
                ...common,
                kind: tag === "polygon" ? "polygon" : "path",
                points: pts,
                closed: tag === "polygon"
            };
        }
        if (tag === "path") {
            const d = a.d || "";
            return {
                ...common,
                kind: "path",
                d,
                points: this.parseSvgPathToPoints(d),
                closed: /z\s*$/i.test(d)
            };
        }
        if (tag === "text") {
            const fontSize = parseFloat(getStyle("font-size", "16")!);
            const scale = Math.max(1, Math.round(fontSize / 7));
            const txt = node.text || a.text || "";
            return {
                ...common,
                kind: "text",
                x: parseFloat(a.x || "0"),
                y: parseFloat(a.y || "16"),
                text: txt,
                fontFamily: getStyle("font-family", "sans-serif"),
                fontSize,
                fontWeight: getStyle("font-weight"),
                fontStyle: getStyle("font-style"),
                letterSpacing: a["letter-spacing"] ? parseFloat(a["letter-spacing"]) : undefined,
                fontId: a["data-font-id"] || undefined,
                width: a["data-width"] ? parseFloat(a["data-width"]) : Math.max(16, txt.length * 6 * scale),
                height: a["data-height"] ? parseFloat(a["data-height"]) : Math.max(12, 7 * scale)
            };
        }
        if (tag === "g" && a["data-boolean-op"] && node.children.length >= 2) {
            const shapeA = this.parseXmlVectorElement(node.children[0], defaultIndex, zipFiles);
            const shapeB = this.parseXmlVectorElement(node.children[1], defaultIndex + 1, zipFiles);
            if (shapeA && shapeB) {
                return {
                    ...common,
                    kind: "boolean",
                    booleanOp: {
                        operation: a["data-boolean-op"] as any,
                        shapeA,
                        shapeB
                    }
                };
            }
        }
        return null;
    }

    private parseAnimationXmlNode(animNode: ParsedXmlNode): AnimationTimelineSpec {
        const anim: AnimationTimelineSpec = {
            fps: parseInt(animNode.attrs.fps || "12", 10),
            durationFrames: parseInt(animNode.attrs.durationFrames || "1", 10),
            loop: animNode.attrs.loop !== "false",
            ...(animNode.attrs.loopBackToFrame !== undefined
                ? { loopBackToFrame: parseInt(animNode.attrs.loopBackToFrame, 10) }
                : {}),
            tracks: []
        };
        const presets: NonNullable<AnimationTimelineSpec["customCurvePresets"]> = [];
        const rasterPresets: RasterBlendPreset[] = [];
        for (const tNode of animNode.children) {
            if (tNode.tag === "CurvePreset") {
                const cpParts = (tNode.attrs.controlPoints || "").split(",").map(s => parseFloat(s.trim()));
                if (cpParts.length === 4 && cpParts.every(n => Number.isFinite(n))) {
                    presets.push({
                        id: tNode.attrs.id || `preset_${presets.length + 1}`,
                        name: tNode.attrs.name || "Custom Curve",
                        controlPoints: [cpParts[0], cpParts[1], cpParts[2], cpParts[3]]
                    });
                }
                continue;
            }
            if (tNode.tag === "RasterBlendPreset") {
                const decodedCode = tNode.attrs.codeB64
                    ? Buffer.from(tNode.attrs.codeB64, "base64").toString("utf8")
                    : (tNode.attrs.code || "");
                if (decodedCode) {
                    rasterPresets.push({
                        id: tNode.attrs.id || `rblend_${rasterPresets.length + 1}`,
                        name: tNode.attrs.name || "Custom Blend Script",
                        category: tNode.attrs.category || "Custom",
                        description: tNode.attrs.description || "Custom JavaScript raster keyframe blending preset.",
                        code: decodedCode,
                        builtIn: false
                    });
                }
                continue;
            }
            if (tNode.tag !== "Track") continue;
            const keyframes: AnimationKeyframeSpec[] = tNode.children
                .filter(k => k.tag === "Keyframe")
                .map(k => {
                    let curveControlPoints: [number, number, number, number] | undefined;
                    if (k.attrs.curveControlPoints) {
                        const parts = k.attrs.curveControlPoints.split(",").map(s => parseFloat(s.trim()));
                        if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
                            curveControlPoints = [parts[0], parts[1], parts[2], parts[3]];
                        }
                    }
                    let parsedVal: number | string | { x: number; y: number }[] = k.attrs.value || "";
                    if (k.attrs.valueType === "number") {
                        parsedVal = parseFloat(k.attrs.value || "0");
                    } else if (k.attrs.valueType === "points") {
                        try {
                            parsedVal = JSON.parse(k.attrs.value || "[]");
                        } catch {
                            parsedVal = [];
                        }
                    }
                    const kfCustomCode = k.attrs.rasterBlendCustomCodeB64
                        ? Buffer.from(k.attrs.rasterBlendCustomCodeB64, "base64").toString("utf8")
                        : k.attrs.rasterBlendCustomCode;
                    return {
                        frame: parseInt(k.attrs.frame || "0", 10),
                        ...(k.attrs.endFrame !== undefined ? { endFrame: parseInt(k.attrs.endFrame, 10) } : {}),
                        value: parsedVal,
                        easing: (k.attrs.easing as EasingMode) || "linear",
                        ...(curveControlPoints ? { curveControlPoints } : {}),
                        ...(k.attrs.curvePresetId ? { curvePresetId: k.attrs.curvePresetId } : {}),
                        ...(k.attrs.rasterBlendPresetId ? { rasterBlendPresetId: k.attrs.rasterBlendPresetId } : {}),
                        ...(kfCustomCode ? { rasterBlendCustomCode: kfCustomCode } : {}),
                        ...(k.attrs.rasterBlendTargetLayerId ? { rasterBlendTargetLayerId: k.attrs.rasterBlendTargetLayerId } : {}),
                        ...(k.attrs.rasterBlendTargetFrame !== undefined
                            ? { rasterBlendTargetFrame: parseInt(k.attrs.rasterBlendTargetFrame, 10) }
                            : {})
                    };
                });
            anim.tracks.push({
                id: tNode.attrs.id || `track_${anim.tracks.length + 1}`,
                targetId: tNode.attrs.targetId || "",
                property: (tNode.attrs.property as any) || "x",
                keyframes
            });
        }
        if (presets.length > 0) anim.customCurvePresets = presets;
        if (rasterPresets.length > 0) anim.customRasterBlendPresets = rasterPresets;
        return anim;
    }

    private parseHacanvasPackage(
        canvasId: string,
        zipFiles: Map<string, Buffer>
    ): ArtCanvasState {
        const docBuf = zipFiles.get("canvas/document.xml");
        if (!docBuf) {
            throw new Error("Invalid .hacanvas archive: missing canvas/document.xml");
        }
        const docNode = parseXmlDocument(docBuf.toString("utf8"));
        const width = parseInt(docNode.attrs.width || "512", 10);
        const height = parseInt(docNode.attrs.height || "512", 10);
        const dpi = parseInt(docNode.attrs.dpi || "96", 10);
        const backgroundColor = docNode.attrs.backgroundColor || "#ffffff";

        const state: ArtCanvasState = {
            canvasId,
            width,
            height,
            dpi,
            backgroundColor,
            ...(docNode.attrs.previewDynamicFilters !== undefined
                ? { previewDynamicFilters: docNode.attrs.previewDynamicFilters !== "false" }
                : {}),
            selection: { mode: "none", inverted: false, x: 0, y: 0, width, height },
            layers: [],
            sharedObjects: {},
            embeddedFonts: {},
            animation: { fps: 12, durationFrames: 1, loop: true, tracks: [] },
            timeline: { fps: 12, totalFrames: 1, keyframes: [] }
        };

        const dir = this.getCanvasDir(canvasId);
        fs.mkdirSync(dir, { recursive: true });

        const parseAttachedFiltersB64 = (b64?: string): AttachedFilterSpec[] | undefined => {
            if (!b64) return undefined;
            try {
                const decoded = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
                return Array.isArray(decoded) && decoded.length > 0 ? decoded : undefined;
            } catch {
                return undefined;
            }
        };

        const parseLayerNodes = (layerNodes: ParsedXmlNode[], targetW: number, targetH: number, sharedObjectId?: string): ArtLayerSpec[] => {
            const outLayers: ArtLayerSpec[] = [];
            for (const lNode of layerNodes) {
                if (lNode.tag !== "Layer") continue;
                const la = lNode.attrs;
                const lType = (la.type === "raster" ? "raster" : "vector") as "vector" | "raster";
                let layerCurveCp: [number, number, number, number] | undefined;
                if (la.rasterBlendCurveControlPoints) {
                    const cpParts = la.rasterBlendCurveControlPoints.split(",").map(s => parseFloat(s.trim()));
                    if (cpParts.length === 4 && cpParts.every(n => Number.isFinite(n))) {
                        layerCurveCp = [cpParts[0], cpParts[1], cpParts[2], cpParts[3]];
                    }
                }
                const layerCustomCode = la.rasterBlendCustomCodeB64
                    ? Buffer.from(la.rasterBlendCustomCodeB64, "base64").toString("utf8")
                    : la.rasterBlendCustomCode;
                const layerAttachedFilters = parseAttachedFiltersB64(la.attachedFiltersB64);
                const layerSpec: ArtLayerSpec = {
                    id: la.id || `layer_${outLayers.length + 1}`,
                    name: la.name || la.id || `Layer ${outLayers.length + 1}`,
                    type: lType,
                    visible: la.visible !== "false",
                    locked: la.locked === "true",
                    opacity: parseFloat(la.opacity ?? "1"),
                    blendMode: (la.blendMode as BlendMode) || "normal",
                    ...(la.offsetX !== undefined ? { offsetX: parseFloat(la.offsetX) } : {}),
                    ...(la.offsetY !== undefined ? { offsetY: parseFloat(la.offsetY) } : {}),
                    ...(la.startFrame !== undefined ? { startFrame: parseInt(la.startFrame, 10) } : {}),
                    ...(la.endFrame !== undefined ? { endFrame: parseInt(la.endFrame, 10) } : {}),
                    ...(la.rasterBlendPresetId ? { rasterBlendPresetId: la.rasterBlendPresetId } : {}),
                    ...(layerCustomCode ? { rasterBlendCustomCode: layerCustomCode } : {}),
                    ...(la.rasterBlendTargetLayerId ? { rasterBlendTargetLayerId: la.rasterBlendTargetLayerId } : {}),
                    ...(la.rasterBlendTargetFrame !== undefined ? { rasterBlendTargetFrame: parseInt(la.rasterBlendTargetFrame, 10) } : {}),
                    ...(la.rasterBlendEasing ? { rasterBlendEasing: la.rasterBlendEasing as EasingMode } : {}),
                    ...(layerCurveCp ? { rasterBlendCurveControlPoints: layerCurveCp } : {}),
                    ...(la.rasterBlendCurvePresetId ? { rasterBlendCurvePresetId: la.rasterBlendCurvePresetId } : {}),
                    ...(la.filtersEnabled !== undefined ? { filtersEnabled: la.filtersEnabled !== "false" } : {}),
                    ...(layerAttachedFilters ? { attachedFilters: layerAttachedFilters } : {}),
                    objects: []
                };

                if (lType === "vector") {
                    lNode.children.forEach((cNode, idx) => {
                        const parsedObj = this.parseXmlVectorElement(cNode, idx + 1, zipFiles);
                        if (parsedObj) layerSpec.objects.push(parsedObj);
                    });
                } else {
                    const celFrames: number[] = [];
                    for (const cNode of lNode.children) {
                        if (cNode.tag === "RasterMedia" && cNode.attrs.src) {
                            const frameNum = parseInt(cNode.attrs.frame || "0", 10);
                            const mediaBuf = zipFiles.get(cNode.attrs.src);
                            if (mediaBuf) {
                                const decoded = decodePngToRgba(mediaBuf);
                                this.saveRasterBuffer(
                                    state,
                                    layerSpec.id,
                                    decoded.rgba,
                                    frameNum > 0 ? frameNum : undefined,
                                    sharedObjectId
                                );
                                if (frameNum > 0) celFrames.push(frameNum);
                            }
                        }
                    }
                    if (celFrames.length > 0) layerSpec.celFrames = celFrames;
                }
                outLayers.push(layerSpec);
            }
            return outLayers;
        };

        // Parse all `objects/<id>.xml` shared object XML files in the ZIP archive
        for (const [entryPath, entryBuf] of zipFiles.entries()) {
            if (entryPath.startsWith("objects/") && entryPath.endsWith(".xml")) {
                const sNode = parseXmlDocument(entryBuf.toString("utf8"));
                const sId = sNode.attrs.id || path.basename(entryPath, ".xml");
                const sName = sNode.attrs.name || sId;
                const sCat = parseSharedObjectCategory(sName, sNode.attrs.category);
                const sW = parseInt(sNode.attrs.width || "128", 10);
                const sH = parseInt(sNode.attrs.height || "128", 10);
                const layersGroup = sNode.children.find(c => c.tag === "Layers");
                const sLayers = parseLayerNodes(layersGroup ? layersGroup.children : [], sW, sH, sId);
                const sAnimNode = sNode.children.find(c => c.tag === "Animation");
                const sAnim = sAnimNode ? this.parseAnimationXmlNode(sAnimNode) : undefined;
                const sAttachedFilters = parseAttachedFiltersB64(sNode.attrs.attachedFiltersB64);
                state.sharedObjects[sId] = {
                    id: sId,
                    name: sCat.fullPath,
                    category: sCat.category,
                    width: sW,
                    height: sH,
                    layers: sLayers,
                    ...(sNode.attrs.filtersEnabled !== undefined ? { filtersEnabled: sNode.attrs.filtersEnabled !== "false" } : {}),
                    ...(sAttachedFilters ? { attachedFilters: sAttachedFilters } : {}),
                    ...(sAnim ? { animation: sAnim } : {})
                };
            }
        }

        // Parse `<EmbeddedFonts>`
        const fontsGroup = docNode.children.find(c => c.tag === "EmbeddedFonts");
        if (fontsGroup) {
            if (!state.embeddedFonts) state.embeddedFonts = {};
            for (const fNode of fontsGroup.children) {
                if (fNode.tag !== "EmbeddedFont") continue;
                const fa = fNode.attrs;
                const fId = fa.id || `font_${Object.keys(state.embeddedFonts).length + 1}`;
                const srcPath = fa.src || "";
                const fontBuf = srcPath ? (zipFiles.get(srcPath) || zipFiles.get(srcPath.replace(/^\.\.\//, ""))) : undefined;
                const dataBase64 = fontBuf ? fontBuf.toString("base64") : (fa.dataBase64 || "");
                if (dataBase64) {
                    state.embeddedFonts[fId] = {
                        id: fId,
                        name: fa.name || fa.family || fId,
                        family: fa.family || fa.name || fId,
                        format: (fa.format as EmbeddedFontSpec["format"]) || "ttf",
                        weight: fa.weight || "normal",
                        style: fa.style || "normal",
                        dataBase64,
                        source: (fa.source as EmbeddedFontSpec["source"]) || "user"
                    };
                }
            }
        }

        // Parse `<Metadata>` from `canvas/document.xml` or `docProps/metadata.xml` / `docProps/xmp.xml`
        const parseMetadataNode = (mNode: ParsedXmlNode): DocumentMetadataSpec => {
            const ma = mNode.attrs;
            const parsedMeta: DocumentMetadataSpec = {};
            if (ma.title) parsedMeta.title = ma.title;
            if (ma.author) parsedMeta.author = ma.author;
            if (ma.description) parsedMeta.description = ma.description;
            if (ma.subject) parsedMeta.subject = ma.subject;
            if (ma.copyright) parsedMeta.copyright = ma.copyright;
            if (ma.comment) parsedMeta.comment = ma.comment;
            if (ma.rating !== undefined && ma.rating !== "") parsedMeta.rating = parseFloat(ma.rating);
            if (ma.software) parsedMeta.software = ma.software;
            if (ma.createdAt) parsedMeta.createdAt = ma.createdAt;
            if (ma.modifiedAt) parsedMeta.modifiedAt = ma.modifiedAt;
            if (ma.make) parsedMeta.make = ma.make;
            if (ma.model) parsedMeta.model = ma.model;
            if (ma.lensModel) parsedMeta.lensModel = ma.lensModel;
            if (ma.focalLengthMm !== undefined && ma.focalLengthMm !== "") parsedMeta.focalLengthMm = parseFloat(ma.focalLengthMm);
            if (ma.fNumber !== undefined && ma.fNumber !== "") parsedMeta.fNumber = parseFloat(ma.fNumber);
            if (ma.exposureTime) parsedMeta.exposureTime = ma.exposureTime;
            if (ma.isoSpeed !== undefined && ma.isoSpeed !== "") parsedMeta.isoSpeed = parseInt(ma.isoSpeed, 10);
            if (ma.orientation !== undefined && ma.orientation !== "") parsedMeta.orientation = parseInt(ma.orientation, 10);
            if (ma.keywords) {
                parsedMeta.keywords = ma.keywords.split(",").map(s => s.trim()).filter(Boolean);
            }
            for (const c of mNode.children) {
                if (c.tag === "GPS") {
                    const ga = c.attrs;
                    const gps: GpsMetadataSpec = {};
                    if (ga.latitude !== undefined && ga.latitude !== "") gps.latitude = parseFloat(ga.latitude);
                    if (ga.longitude !== undefined && ga.longitude !== "") gps.longitude = parseFloat(ga.longitude);
                    if (ga.altitude !== undefined && ga.altitude !== "") gps.altitude = parseFloat(ga.altitude);
                    if (ga.locationName) gps.locationName = ga.locationName;
                    if (ga.country) gps.country = ga.country;
                    parsedMeta.gps = gps;
                } else if (c.tag === "CustomField" && c.attrs.key) {
                    if (!parsedMeta.custom) parsedMeta.custom = {};
                    parsedMeta.custom[c.attrs.key] = c.attrs.value || "";
                }
            }
            return parsedMeta;
        };

        const inlineMetaNode = docNode.children.find(c => c.tag === "Metadata");
        if (inlineMetaNode) {
            state.metadata = parseMetadataNode(inlineMetaNode);
        } else if (zipFiles.has("docProps/metadata.xml")) {
            const mDoc = parseXmlDocument(zipFiles.get("docProps/metadata.xml")!.toString("utf8"));
            state.metadata = parseMetadataNode(mDoc);
        } else if (zipFiles.has("docProps/xmp.xml")) {
            state.metadata = parseXmpPacketString(zipFiles.get("docProps/xmp.xml")!.toString("utf8"));
        }

        // Parse main canvas `<Layers>` and `<Animation>`
        const mainLayersGroup = docNode.children.find(c => c.tag === "Layers");
        state.layers = parseLayerNodes(mainLayersGroup ? mainLayersGroup.children : [], width, height);

        const animNode = docNode.children.find(c => c.tag === "Animation");
        if (animNode) {
            state.animation = this.parseAnimationXmlNode(animNode);
        }

        // Parse `<CustomFilters>` from `canvas/document.xml` or `presets/filters.xml`
        const parseFilterPresetNodes = (nodes: ParsedXmlNode[]): GimpFilterPreset[] => {
            const out: GimpFilterPreset[] = [];
            for (const fNode of nodes) {
                if (fNode.tag !== "FilterPreset") continue;
                const fa = fNode.attrs;
                const decodedCode = fa.codeB64
                    ? Buffer.from(fa.codeB64, "base64").toString("utf8")
                    : (fa.code || "");
                if (!decodedCode) continue;
                let parameterSchemas: FilterParameterSchema[] = [];
                if (fa.parameterSchemasB64) {
                    try {
                        parameterSchemas = JSON.parse(Buffer.from(fa.parameterSchemasB64, "base64").toString("utf8"));
                    } catch {
                        parameterSchemas = [];
                    }
                }
                const fp: GimpFilterPreset = {
                    id: fa.id || `filter_custom_${out.length + 1}`,
                    name: fa.name || "Custom Filter",
                    category: fa.category || "Custom",
                    description: fa.description || "Custom JavaScript GIMP pixel filter preset.",
                    gimpProcedure: fa.gimpProcedure || `custom:${fa.id || out.length + 1}`,
                    parameterSchemas,
                    code: decodedCode,
                    builtIn: false
                };
                RasterFilterRegistry.registerCustomPreset(fp);
                out.push(fp);
            }
            return out;
        };

        const filtersGroup = docNode.children.find(c => c.tag === "CustomFilters");
        if (filtersGroup && filtersGroup.children.length > 0) {
            state.customFilterPresets = parseFilterPresetNodes(filtersGroup.children);
        } else if (zipFiles.has("presets/filters.xml")) {
            const fDoc = parseXmlDocument(zipFiles.get("presets/filters.xml")!.toString("utf8"));
            state.customFilterPresets = parseFilterPresetNodes(fDoc.children);
        }

        // Parse `<CustomTransitions>` from `canvas/document.xml` or `presets/transitions.xml`
        const parseTransitionNodes = (nodes: ParsedXmlNode[]) => {
            if (!state.animation.customRasterBlendPresets) {
                state.animation.customRasterBlendPresets = [];
            }
            for (const rNode of nodes) {
                if (rNode.tag !== "RasterBlendPreset") continue;
                const ra = rNode.attrs;
                const decodedCode = ra.codeB64
                    ? Buffer.from(ra.codeB64, "base64").toString("utf8")
                    : (ra.code || "");
                if (!decodedCode) continue;
                const id = ra.id || `rblend_${state.animation.customRasterBlendPresets.length + 1}`;
                if (!state.animation.customRasterBlendPresets.some(p => p.id === id)) {
                    state.animation.customRasterBlendPresets.push({
                        id,
                        name: ra.name || "Custom Blend Script",
                        category: ra.category || "Custom",
                        description: ra.description || "Custom JavaScript raster keyframe blending preset.",
                        code: decodedCode,
                        builtIn: false
                    });
                }
            }
        };

        const transitionsGroup = docNode.children.find(c => c.tag === "CustomTransitions");
        if (transitionsGroup && transitionsGroup.children.length > 0) {
            parseTransitionNodes(transitionsGroup.children);
        } else if (zipFiles.has("presets/transitions.xml")) {
            const tDoc = parseXmlDocument(zipFiles.get("presets/transitions.xml")!.toString("utf8"));
            parseTransitionNodes(tDoc.children);
        }

        this.saveCanvas(state);
        return state;
    }

    /**
     * Loads any supported file format (`.hacanvas`, `.psd`/`.psb`, `.xcf`, `.ora`, `.svg`, `.png`, `.bmp`, `.gif`,
     * `.tga`, `.pcx`, `.ico`, `.ppm`/`.pgm`/`.pbm`/`.pam`, `.ff`, `.xbm`, `.jpg`, `.webp`, `.tiff`) into the engine,
     * either creating/replacing the canvas (`mode: "new_canvas"`), appending layers (`mode: "append_layers"`),
     * or importing into a Shared Object (`mode: "into_shared_object"`).
     */
    public loadFromFile(
        canvasId: string,
        filePath: string,
        options: {
            mode?: "new_canvas" | "append_layers" | "into_shared_object";
            targetSharedObjectId?: string;
        } = {}
    ): {
        canvasId: string;
        detectedFormat: string;
        mode: string;
        width: number;
        height: number;
        layersImported: number;
        sharedObjectsImported: number;
    } {
        const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(this.projectRoot, filePath.replace(/^[/\\]+/, ""));

        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File not found: ${resolvedPath}`);
        }

        const fileBuf = fs.readFileSync(resolvedPath);
        const ext = path.extname(resolvedPath).toLowerCase();
        const mode = options.mode || "new_canvas";

        // 1. Check ZIP magic (`PK\x03\x04`) -> `.hacanvas` or `.ora` (OpenRaster)
        if (fileBuf.length >= 4 && fileBuf.readUInt32LE(0) === 0x04034b50) {
            const zipFiles = extractZipArchive(fileBuf);
            if (zipFiles.has("canvas/document.xml")) {
                if (mode === "new_canvas") {
                    const loaded = this.parseHacanvasPackage(canvasId, zipFiles);
                    return {
                        canvasId: loaded.canvasId,
                        detectedFormat: "hacanvas",
                        mode,
                        width: loaded.width,
                        height: loaded.height,
                        layersImported: loaded.layers.length,
                        sharedObjectsImported: Object.keys(loaded.sharedObjects).length
                    };
                } else {
                    const tempId = `${canvasId}_tmp_${Date.now()}`;
                    const tmpState = this.parseHacanvasPackage(tempId, zipFiles);
                    const state = this.loadCanvas(canvasId);
                    Object.assign(state.sharedObjects, tmpState.sharedObjects);
                    if (tmpState.embeddedFonts) {
                        if (!state.embeddedFonts) state.embeddedFonts = {};
                        Object.assign(state.embeddedFonts, tmpState.embeddedFonts);
                    }
                    if (tmpState.customFilterPresets && tmpState.customFilterPresets.length > 0) {
                        if (!state.customFilterPresets) state.customFilterPresets = [];
                        for (const fp of tmpState.customFilterPresets) {
                            if (!state.customFilterPresets.some(p => p.id === fp.id)) {
                                state.customFilterPresets.push(fp);
                            }
                        }
                    }
                    if (tmpState.animation?.customRasterBlendPresets && tmpState.animation.customRasterBlendPresets.length > 0) {
                        if (!state.animation.customRasterBlendPresets) state.animation.customRasterBlendPresets = [];
                        for (const rp of tmpState.animation.customRasterBlendPresets) {
                            if (!state.animation.customRasterBlendPresets.some(p => p.id === rp.id)) {
                                state.animation.customRasterBlendPresets.push(rp);
                            }
                        }
                    }
                    if (tmpState.metadata && hasMeaningfulMetadata(tmpState.metadata) && !hasMeaningfulMetadata(state.metadata)) {
                        state.metadata = tmpState.metadata;
                    }
                    for (const l of tmpState.layers) {
                        if (l.type === "raster") {
                            const buf = this.loadRasterBuffer(tmpState, l.id, tmpState.width, tmpState.height);
                            this.saveRasterBuffer(state, l.id, buf, undefined, options.targetSharedObjectId);
                        }
                        if (mode === "into_shared_object" && options.targetSharedObjectId) {
                            this.getSharedObjectOrThrow(state, options.targetSharedObjectId).layers.push(l);
                        } else {
                            state.layers.push(l);
                        }
                    }
                    this.saveCanvas(state);
                    return {
                        canvasId,
                        detectedFormat: "hacanvas",
                        mode,
                        width: state.width,
                        height: state.height,
                        layersImported: tmpState.layers.length,
                        sharedObjectsImported: Object.keys(tmpState.sharedObjects).length
                    };
                }
            } else if (zipFiles.has("stack.xml")) {
                const oraDoc = parseOraBuffer(fileBuf);
                return this.applyDecodedMultiLayerDoc(canvasId, oraDoc, mode, options.targetSharedObjectId);
            }
        }

        // 2. Check Adobe Photoshop PSD/PSB (`8BPS`)
        if (fileBuf.length >= 4 && fileBuf.toString("ascii", 0, 4) === "8BPS") {
            const psdDoc = parsePsdBuffer(fileBuf);
            return this.applyDecodedMultiLayerDoc(canvasId, psdDoc, mode, options.targetSharedObjectId);
        }

        // 3. Check GIMP XCF (`gimp xcf `)
        if (fileBuf.length >= 9 && fileBuf.toString("ascii", 0, 9) === "gimp xcf ") {
            const xcfDoc = parseXcfBuffer(fileBuf);
            return this.applyDecodedMultiLayerDoc(canvasId, xcfDoc, mode, options.targetSharedObjectId);
        }

        // 3b. Check Adobe Illustrator (.ai) - PostScript (`%!PS-Adobe-` / `%AI5_BeginLayer`) or PDF-compatible (`.ai` / `%PDF-`)
        const headLatin1 = fileBuf.subarray(0, Math.min(1024, fileBuf.length)).toString("latin1");
        if (
            ext === ".ai" ||
            headLatin1.startsWith("%!PS-Adobe-") ||
            headLatin1.includes("%%Creator: Adobe Illustrator") ||
            headLatin1.includes("%AI5_BeginLayer") ||
            (headLatin1.startsWith("%PDF-") &&
                (headLatin1.includes("Illustrator") || headLatin1.includes("/AIMetaData") || headLatin1.includes("AIPrivateData")))
        ) {
            const aiDoc = parseAiBuffer(fileBuf);
            const totalObjects = aiDoc.layers.reduce((sum, l) => sum + (l.objects?.length ?? 0), 0);
            if (totalObjects === 0 && this.inkscapeBin && fs.existsSync(this.inkscapeBin)) {
                const tmpSvg = path.join(os.tmpdir(), `aicore_ai_conv_${Date.now()}.svg`);
                try {
                    execFileSync(this.inkscapeBin, ["--export-plain-svg", `--export-filename=${tmpSvg}`, resolvedPath], { timeout: 15000 });
                    if (fs.existsSync(tmpSvg)) {
                        const svgRes = this.importSvgDocument(canvasId, fs.readFileSync(tmpSvg, "utf8"), mode, options.targetSharedObjectId);
                        try { fs.unlinkSync(tmpSvg); } catch { /* ignore */ }
                        return { ...svgRes, detectedFormat: "ai" };
                    }
                } catch {
                    if (fs.existsSync(tmpSvg)) {
                        try { fs.unlinkSync(tmpSvg); } catch { /* ignore */ }
                    }
                }
            }
            return this.applyDecodedMultiLayerDoc(canvasId, aiDoc, mode, options.targetSharedObjectId);
        }

        // 3c. Check PDF (`.pdf` or `%PDF-` magic header when not an Illustrator `.ai` file)
        if (ext === ".pdf" || headLatin1.startsWith("%PDF-")) {
            const pdfDoc = parsePdfBuffer(fileBuf);
            return this.applyDecodedMultiLayerDoc(canvasId, pdfDoc, mode, options.targetSharedObjectId);
        }

        // 4. Check SVG (`<svg` or `.svg` extension)
        const headText = fileBuf.subarray(0, Math.min(512, fileBuf.length)).toString("utf8").trim();
        if (ext === ".svg" || headText.includes("<svg")) {
            return this.importSvgDocument(canvasId, fileBuf.toString("utf8"), mode, options.targetSharedObjectId);
        }

        // 5. Check Animated or Static GIF (`GIF87a` / `GIF89a`)
        if (fileBuf.length >= 6 && fileBuf.toString("ascii", 0, 3) === "GIF") {
            const gifRes = decodeGifFrames(fileBuf);
            const state = mode === "new_canvas"
                ? this.createCanvas(canvasId, gifRes.width, gifRes.height, "transparent")
                : this.loadCanvas(canvasId);
            if (mode === "new_canvas") state.layers = [];

            const layerId = `layer_gif_${Date.now() % 10000}`;
            const celFrames: number[] = [];
            gifRes.frames.forEach((f, idx) => {
                const fitted = this.fitRgbaBuffer(f.rgba, gifRes.width, gifRes.height, state.width, state.height);
                this.saveRasterBuffer(state, layerId, fitted, idx > 0 ? idx : undefined, options.targetSharedObjectId);
                if (idx > 0) celFrames.push(idx);
            });
            if (gifRes.frames.length > state.animation.durationFrames) {
                state.animation.durationFrames = gifRes.frames.length;
            }

            const newLayer: ArtLayerSpec = {
                id: layerId,
                name: path.basename(resolvedPath),
                type: "raster",
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: "normal",
                objects: [],
                ...(celFrames.length > 0 ? { celFrames } : {})
            };

            if (mode === "into_shared_object" && options.targetSharedObjectId) {
                this.getSharedObjectOrThrow(state, options.targetSharedObjectId).layers.push(newLayer);
            } else {
                state.layers.push(newLayer);
            }
            this.saveCanvas(state);

            return {
                canvasId,
                detectedFormat: "gif",
                mode,
                width: state.width,
                height: state.height,
                layersImported: 1,
                sharedObjectsImported: 0
            };
        }

        // 5b. Check Windows Multi-Icon (.ico / .cur) -> import each icon entry as its own layer
        if (
            ext === ".ico" ||
            ext === ".cur" ||
            (fileBuf.length >= 22 &&
                fileBuf.readUInt16LE(0) === 0 &&
                (fileBuf.readUInt16LE(2) === 1 || fileBuf.readUInt16LE(2) === 2) &&
                fileBuf.readUInt16LE(4) >= 1 &&
                fileBuf.readUInt16LE(4) <= 64 &&
                fileBuf.readUInt32LE(18) === 6 + fileBuf.readUInt16LE(4) * 16)
        ) {
            const icoDoc = decodeIcoToLayers(fileBuf, resolvedPath);
            return this.applyDecodedMultiLayerDoc(canvasId, icoDoc, mode, options.targetSharedObjectId);
        }

        // 6. Universal Image Format Decoder (PNG, BMP, TGA, PCX, PNM/PPM/PGM/PBM/PAM, Farbfeld, XBM, JPEG, WebP, TIFF)
        const decodedImg = decodeAnyImageToRgba(resolvedPath, fileBuf);
        let extractedMeta: DocumentMetadataSpec | undefined;
        if (
            fileBuf.length >= 4 &&
            fileBuf[0] === 0xff &&
            fileBuf[1] === 0xd8
        ) {
            const jpgMeta = extractJpegExifMetadata(fileBuf);
            if (hasMeaningfulMetadata(jpgMeta)) extractedMeta = jpgMeta;
        } else if (
            fileBuf.length >= 8 &&
            fileBuf.readUInt32BE(0) === 0x89504e47
        ) {
            const pngMeta = extractPngMetadata(fileBuf);
            if (hasMeaningfulMetadata(pngMeta)) extractedMeta = pngMeta;
        }
        const doc: DecodedMultiLayerDocument = {
            format: ext.replace(/^\./, "") || "image",
            width: decodedImg.width,
            height: decodedImg.height,
            metadata: extractedMeta,
            layers: [
                {
                    name: path.basename(resolvedPath),
                    type: "raster",
                    width: decodedImg.width,
                    height: decodedImg.height,
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    visible: true,
                    blendMode: "normal",
                    rgba: decodedImg.rgba
                }
            ]
        };
        return this.applyDecodedMultiLayerDoc(canvasId, doc, mode, options.targetSharedObjectId);
    }

    private fitRgbaBuffer(src: Buffer, srcW: number, srcH: number, dstW: number, dstH: number): Buffer {
        if (srcW === dstW && srcH === dstH) return Buffer.from(src);
        const out = Buffer.alloc(dstW * dstH * 4, 0);
        const copyW = Math.min(srcW, dstW);
        const copyH = Math.min(srcH, dstH);
        for (let y = 0; y < copyH; y++) {
            src.copy(out, y * dstW * 4, y * srcW * 4, (y * srcW + copyW) * 4);
        }
        return out;
    }

    private applyDecodedMultiLayerDoc(
        canvasId: string,
        doc: DecodedMultiLayerDocument,
        mode: "new_canvas" | "append_layers" | "into_shared_object",
        targetSharedObjectId?: string
    ): {
        canvasId: string;
        detectedFormat: string;
        mode: string;
        width: number;
        height: number;
        layersImported: number;
        sharedObjectsImported: number;
    } {
        let state: ArtCanvasState;
        if (mode === "new_canvas") {
            state = this.createCanvas(canvasId, doc.width, doc.height, "transparent");
            state.layers = [];
        } else {
            state = this.loadCanvas(canvasId);
        }

        if (doc.embeddedFonts) {
            if (!state.embeddedFonts) state.embeddedFonts = {};
            const fontList: EmbeddedFontSpec[] = Array.isArray(doc.embeddedFonts)
                ? doc.embeddedFonts
                : Object.values(doc.embeddedFonts as Record<string, EmbeddedFontSpec>);
            for (const ef of fontList) {
                if (ef && ef.id) {
                    state.embeddedFonts[ef.id] = {
                        ...ef,
                        family: ef.family || ef.name
                    };
                }
            }
        }
        if (doc.metadata && hasMeaningfulMetadata(doc.metadata)) {
            if (mode === "new_canvas" || !hasMeaningfulMetadata(state.metadata)) {
                state.metadata = { ...(state.metadata || {}), ...doc.metadata };
            }
        }

        // Import any Shared Objects (e.g., raster image objects extracted from PDF pages)
        let sharedImportedCount = 0;
        if (doc.sharedObjects) {
            for (const [sId, sObj] of Object.entries(doc.sharedObjects)) {
                state.sharedObjects[sId] = JSON.parse(JSON.stringify(sObj));
                sharedImportedCount++;
            }
        }
        if (doc.sharedObjectRasters) {
            for (const [sId, rSpec] of Object.entries(doc.sharedObjectRasters)) {
                if (rSpec && rSpec.layerId && rSpec.rgba) {
                    this.saveRasterBuffer(state, rSpec.layerId, Buffer.from(rSpec.rgba), undefined, sId);
                }
            }
        }

        const targetContainer = mode === "into_shared_object" && targetSharedObjectId
            ? this.getSharedObjectOrThrow(state, targetSharedObjectId)
            : state;

        doc.layers.forEach((dLayer, idx) => {
            const layerId = `layer_${doc.format}_${targetContainer.layers.length + idx + 1}_${Date.now() % 10000}`;
            if (dLayer.type === "vector") {
                targetContainer.layers.push({
                    id: layerId,
                    name: dLayer.name,
                    type: "vector",
                    visible: dLayer.visible,
                    locked: false,
                    opacity: dLayer.opacity,
                    blendMode: dLayer.blendMode,
                    objects: dLayer.objects || []
                });
            } else {
                const fitted = this.fitRgbaBuffer(
                    dLayer.rgba || Buffer.alloc(doc.width * doc.height * 4),
                    doc.width,
                    doc.height,
                    targetContainer.width,
                    targetContainer.height
                );
                this.saveRasterBuffer(
                    state,
                    layerId,
                    fitted,
                    undefined,
                    mode === "into_shared_object" ? targetSharedObjectId : undefined
                );
                targetContainer.layers.push({
                    id: layerId,
                    name: dLayer.name,
                    type: "raster",
                    visible: dLayer.visible,
                    locked: false,
                    opacity: dLayer.opacity,
                    blendMode: dLayer.blendMode,
                    objects: []
                });
            }
        });

        this.saveCanvas(state);
        return {
            canvasId,
            detectedFormat: doc.format,
            mode,
            width: targetContainer.width,
            height: targetContainer.height,
            layersImported: doc.layers.length,
            sharedObjectsImported: sharedImportedCount
        };
    }

    private importSvgDocument(
        canvasId: string,
        svgContent: string,
        mode: "new_canvas" | "append_layers" | "into_shared_object",
        targetSharedObjectId?: string
    ): {
        canvasId: string;
        detectedFormat: string;
        mode: string;
        width: number;
        height: number;
        layersImported: number;
        sharedObjectsImported: number;
    } {
        const root = parseXmlDocument(svgContent);
        let svgW = parseFloat(root.attrs.width || "0");
        let svgH = parseFloat(root.attrs.height || "0");
        if ((!svgW || !svgH) && root.attrs.viewBox) {
            const parts = root.attrs.viewBox.trim().split(/[\s,]+/).map(Number);
            if (parts.length === 4) {
                svgW = svgW || parts[2];
                svgH = svgH || parts[3];
            }
        }
        svgW = Math.max(1, Math.round(svgW || 512));
        svgH = Math.max(1, Math.round(svgH || 512));

        let state: ArtCanvasState;
        if (mode === "new_canvas") {
            state = this.createCanvas(canvasId, svgW, svgH, "transparent");
            state.layers = [];
        } else {
            state = this.loadCanvas(canvasId);
        }

        const targetContainer = mode === "into_shared_object" && targetSharedObjectId
            ? this.getSharedObjectOrThrow(state, targetSharedObjectId)
            : state;

        let sharedImported = 0;
        let layersImported = 0;
        const looseObjects: VectorObjectSpec[] = [];

        const extractChildrenIntoObjects = (nodes: ParsedXmlNode[]): VectorObjectSpec[] => {
            const objs: VectorObjectSpec[] = [];
            nodes.forEach((n, idx) => {
                const tag = n.tag.replace(/^.*:/, "").toLowerCase();
                if (tag === "g" && !n.attrs["data-boolean-op"]) {
                    objs.push(...extractChildrenIntoObjects(n.children));
                } else {
                    const parsed = this.parseXmlVectorElement(n, idx + 1);
                    if (parsed) objs.push(parsed);
                }
            });
            return objs;
        };

        for (const child of root.children) {
            const tag = child.tag.replace(/^.*:/, "").toLowerCase();
            if (tag === "metadata") {
                const xmpParsed = parseXmpPacketString(svgContent);
                if (hasMeaningfulMetadata(xmpParsed)) {
                    state.metadata = { ...(state.metadata || {}), ...xmpParsed };
                }
            } else if (tag === "defs") {
                // Convert SVG <defs> children with id into SharedObjects (`objects/<id>.xml`)
                for (const defChild of child.children) {
                    const defId = defChild.attrs.id;
                    if (!defId) continue;
                    const defTag = defChild.tag.replace(/^.*:/, "").toLowerCase();
                    if (defTag === "lineargradient" || defTag === "radialgradient" || defTag === "clippath") continue;
                    const objs = defTag === "g" || defTag === "symbol"
                        ? extractChildrenIntoObjects(defChild.children)
                        : [this.parseXmlVectorElement(defChild, 1)].filter(Boolean) as VectorObjectSpec[];
                    if (objs.length > 0) {
                        state.sharedObjects[defId] = {
                            id: defId,
                            name: defChild.attrs["inkscape:label"] || defId,
                            width: svgW,
                            height: svgH,
                            layers: [
                                {
                                    id: `${defId}_vec_1`,
                                    name: `${defId} Vector Layer`,
                                    type: "vector",
                                    visible: true,
                                    locked: false,
                                    opacity: 1,
                                    blendMode: "normal",
                                    objects: objs
                                }
                            ]
                        };
                        sharedImported++;
                    }
                }
            } else if (tag === "g") {
                const layerName = child.attrs["inkscape:label"] || child.attrs.id || `SVG Layer ${layersImported + 1}`;
                const objs = extractChildrenIntoObjects(child.children);
                targetContainer.layers.push({
                    id: child.attrs.id || `svg_layer_${layersImported + 1}_${Date.now() % 10000}`,
                    name: layerName,
                    type: "vector",
                    visible: child.attrs.display !== "none" && child.attrs.visibility !== "hidden",
                    locked: child.attrs["sodipodi:insensitive"] === "true",
                    opacity: parseFloat(child.attrs.opacity ?? "1"),
                    blendMode: "normal",
                    objects: objs
                });
                layersImported++;
            } else if (tag === "image") {
                const href = child.attrs.href || child.attrs["xlink:href"] || "";
                if (href.startsWith("data:image/png;base64,")) {
                    const b64 = href.slice("data:image/png;base64,".length);
                    const decoded = decodePngToRgba(Buffer.from(b64, "base64"));
                    const lId = child.attrs.id || `svg_raster_${layersImported + 1}_${Date.now() % 10000}`;
                    const fitted = this.fitRgbaBuffer(decoded.rgba, decoded.width, decoded.height, targetContainer.width, targetContainer.height);
                    this.saveRasterBuffer(state, lId, fitted, undefined, mode === "into_shared_object" ? targetSharedObjectId : undefined);
                    targetContainer.layers.push({
                        id: lId,
                        name: child.attrs["inkscape:label"] || lId,
                        type: "raster",
                        visible: true,
                        locked: false,
                        opacity: parseFloat(child.attrs.opacity ?? "1"),
                        blendMode: "normal",
                        objects: []
                    });
                    layersImported++;
                }
            } else {
                const parsed = this.parseXmlVectorElement(child, looseObjects.length + 1);
                if (parsed) looseObjects.push(parsed);
            }
        }

        if (looseObjects.length > 0 || layersImported === 0) {
            targetContainer.layers.push({
                id: `svg_layer_${layersImported + 1}_${Date.now() % 10000}`,
                name: "SVG Vector Layer",
                type: "vector",
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: "normal",
                objects: looseObjects
            });
            layersImported++;
        }

        this.saveCanvas(state);
        return {
            canvasId,
            detectedFormat: "svg",
            mode,
            width: targetContainer.width,
            height: targetContainer.height,
            layersImported,
            sharedObjectsImported: sharedImported
        };
    }

    // ============================================================================
    // 9. EXPORTING: Supports ANY Image Format or SVG Where Possible
    // ============================================================================

    public buildLayerSvg(state: ArtCanvasState, layer: ArtLayerSpec): string {
        const elements = layer.objects.map(obj => this.vectorObjectToSvgElement(obj)).join("\n  ");
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${state.width}" height="${state.height}" viewBox="0 0 ${state.width} ${state.height}">
  <g id="${layer.id}" opacity="${layer.opacity}">
  ${elements}
  </g>
</svg>`;
    }

    private vectorObjectToSvgElement(obj: VectorObjectSpec): string {
        if (obj.kind === "ref") {
            const transforms: string[] = [];
            if (obj.x || obj.y) transforms.push(`translate(${obj.x ?? 0}, ${obj.y ?? 0})`);
            if ((obj.scaleX !== undefined && obj.scaleX !== 1) || (obj.scaleY !== undefined && obj.scaleY !== 1)) {
                transforms.push(`scale(${obj.scaleX ?? 1}, ${obj.scaleY ?? 1})`);
            }
            if (obj.rotation) transforms.push(`rotate(${obj.rotation})`);
            if (obj.skewX) transforms.push(`skewX(${obj.skewX})`);
            if (obj.skewY) transforms.push(`skewY(${obj.skewY})`);
            const tfAttr = transforms.length > 0 ? ` transform="${transforms.join(" ")}"` : "";
            const extraRefAttrs = [
                obj.rotation !== undefined ? `data-rotation="${obj.rotation}"` : "",
                obj.skewX !== undefined ? `data-skew-x="${obj.skewX}"` : "",
                obj.skewY !== undefined ? `data-skew-y="${obj.skewY}"` : "",
                obj.startFrame !== undefined ? `data-start-frame="${obj.startFrame}"` : "",
                obj.endFrame !== undefined ? `data-end-frame="${obj.endFrame}"` : "",
                obj.filtersEnabled !== undefined ? `data-filters-enabled="${obj.filtersEnabled}"` : "",
                obj.attachedFilters && obj.attachedFilters.length > 0
                    ? `data-attached-filters-b64="${Buffer.from(JSON.stringify(obj.attachedFilters), "utf8").toString("base64")}"`
                    : ""
            ].filter(Boolean).join(" ");
            return `<use id="${escapeXml(obj.id)}" href="#${escapeXml(obj.refId)}" opacity="${obj.opacity ?? 1}"${extraRefAttrs ? " " + extraRefAttrs : ""}${tfAttr} />`;
        }
        const metaDataAttrs = [
            obj.rotation !== undefined ? `data-rotation="${obj.rotation}"` : "",
            obj.skewX !== undefined ? `data-skew-x="${obj.skewX}"` : "",
            obj.skewY !== undefined ? `data-skew-y="${obj.skewY}"` : "",
            obj.startFrame !== undefined ? `data-start-frame="${obj.startFrame}"` : "",
            obj.endFrame !== undefined ? `data-end-frame="${obj.endFrame}"` : "",
            obj.filtersEnabled !== undefined ? `data-filters-enabled="${obj.filtersEnabled}"` : "",
            obj.attachedFilters && obj.attachedFilters.length > 0
                ? `data-attached-filters-b64="${Buffer.from(JSON.stringify(obj.attachedFilters), "utf8").toString("base64")}"`
                : ""
        ].filter(Boolean).join(" ");

        if (obj.kind === "image") {
            const w = obj.width ?? obj.imageWidth ?? 100;
            const h = obj.height ?? obj.imageHeight ?? 100;
            const imgW = obj.imageWidth ?? w;
            const imgH = obj.imageHeight ?? h;
            const href = obj.imageDataUrl || "";
            const tfAttr = obj.transform ? ` transform="${escapeXml(obj.transform)}"` : "";
            return `<image id="${escapeXml(obj.id)}" x="${obj.x ?? 0}" y="${obj.y ?? 0}" width="${w}" height="${h}" data-image-width="${imgW}" data-image-height="${imgH}" opacity="${obj.opacity ?? 1}"${metaDataAttrs ? " " + metaDataAttrs : ""}${tfAttr} href="${escapeXml(href)}" />`;
        }

        // Synthesize SVG transform if rotation/skewX/skewY are set and obj.transform is not explicitly set
        let computedTransform = obj.transform || "";
        if (!computedTransform && (obj.rotation || obj.skewX || obj.skewY)) {
            const tParts: string[] = [];
            if (obj.rotation) tParts.push(`rotate(${obj.rotation})`);
            if (obj.skewX) tParts.push(`skewX(${obj.skewX})`);
            if (obj.skewY) tParts.push(`skewY(${obj.skewY})`);
            computedTransform = tParts.join(" ");
        }

        const common = `id="${escapeXml(obj.id)}" fill="${escapeXml(obj.fill ?? "none")}" stroke="${escapeXml(obj.stroke ?? "none")}" stroke-width="${obj.strokeWidth ?? 1}" opacity="${obj.opacity ?? 1}"${metaDataAttrs ? " " + metaDataAttrs : ""}${computedTransform ? ` transform="${escapeXml(computedTransform)}"` : ""}`;
        if (obj.kind === "rect") {
            return `<rect ${common} x="${obj.x ?? 0}" y="${obj.y ?? 0}" width="${obj.width ?? 100}" height="${obj.height ?? 100}"${obj.rx ? ` rx="${obj.rx}"` : ""}${obj.ry ? ` ry="${obj.ry}"` : ""} />`;
        }
        if (obj.kind === "circle") {
            const r = obj.r ?? (obj.width ? obj.width / 2 : 50);
            return `<circle ${common} cx="${obj.x ?? r}" cy="${obj.y ?? r}" r="${r}" />`;
        }
        if (obj.kind === "ellipse") {
            const rx = obj.rx ?? (obj.width ? obj.width / 2 : 50);
            const ry = obj.ry ?? (obj.height ? obj.height / 2 : 50);
            return `<ellipse ${common} cx="${obj.x ?? rx}" cy="${obj.y ?? ry}" rx="${rx}" ry="${ry}" />`;
        }
        if (obj.kind === "line") {
            const curveAttrs = obj.cx !== undefined && obj.cy !== undefined ? ` data-cx="${obj.cx}" data-cy="${obj.cy}"` : "";
            return `<line ${common} x1="${obj.x ?? 0}" y1="${obj.y ?? 0}" x2="${obj.x2 ?? 100}" y2="${obj.y2 ?? 100}"${curveAttrs} />`;
        }
        if ((obj.kind === "polygon" || obj.kind === "star") && obj.points) {
            const ptsStr = obj.points.map(p => `${p.x},${p.y}`).join(" ");
            return `<polygon ${common} points="${ptsStr}" />`;
        }
        if (obj.kind === "path") {
            return `<path ${common} d="${escapeXml(obj.d || "")}" />`;
        }
        if (obj.kind === "text") {
            const fwAttr = obj.fontWeight ? ` font-weight="${escapeXml(obj.fontWeight)}"` : "";
            const fsAttr = obj.fontStyle ? ` font-style="${escapeXml(obj.fontStyle)}"` : "";
            const lsAttr = obj.letterSpacing !== undefined ? ` letter-spacing="${obj.letterSpacing}"` : "";
            const fidAttr = obj.fontId ? ` data-font-id="${escapeXml(obj.fontId)}"` : "";
            return `<text ${common} x="${obj.x ?? 0}" y="${obj.y ?? 16}" font-family="${escapeXml(obj.fontFamily || "sans-serif")}" font-size="${obj.fontSize ?? 16}"${fwAttr}${fsAttr}${lsAttr}${fidAttr}>${escapeXml(obj.text || "")}</text>`;
        }
        if (obj.kind === "boolean" && obj.booleanOp) {
            return `<g ${common} data-boolean-op="${obj.booleanOp.operation}">${this.vectorObjectToSvgElement(obj.booleanOp.shapeA)}${this.vectorObjectToSvgElement(obj.booleanOp.shapeB)}</g>`;
        }
        return "";
    }

    /**
     * Exports the canvas to any requested image format or SVG where possible:
     * `png`, `svg`, `gif` (animated or static), `bmp`, `tga`, `ppm`, `ico`, `ff` (Farbfeld),
     * `ora` (OpenRaster), `jpg`/`jpeg`, `webp`, `tiff`, `sprite_sheet`, or `hacanvas`.
     */
    public importArtFile(
        filePath: string,
        opts: {
            canvasId: string;
            mode?: "new_canvas" | "append_layers" | "into_shared_object";
            sharedObjectId?: string;
        }
    ): {
        canvasId: string;
        filePath: string;
        detectedFormat: string;
        mode: string;
        width: number;
        height: number;
        layersImported: number;
        sharedObjectsImported: number;
    } {
        const res = this.loadFromFile(opts.canvasId, filePath, {
            mode: opts.mode,
            targetSharedObjectId: opts.sharedObjectId
        });
        return {
            ...res,
            filePath: path.isAbsolute(filePath)
                ? filePath
                : path.join(this.projectRoot, filePath.replace(/^[/\\]+/, ""))
        };
    }

    public exportCanvas(
        canvasId: string,
        outputPathOrFormat: string,
        formatOrOutputPath?: string,
        options: ExportCanvasOptions = {}
    ): { outputPath: string; filePath: string; format: string; bytesWritten: number; iconCount?: number } {
        const knownFormats = new Set([
            "png", "svg", "pdf", "gif", "bmp", "tga", "pcx", "ico", "cur",
            "ppm", "pnm", "ff", "farbfeld", "xbm", "ora", "jpg", "jpeg", "webp",
            "tiff", "tif", "sprite_sheet", "spritesheet", "hacanvas", "aicz"
        ]);
        let outputPath = outputPathOrFormat;
        let format = formatOrOutputPath;
        if (
            knownFormats.has(outputPathOrFormat.toLowerCase()) &&
            formatOrOutputPath &&
            !knownFormats.has(formatOrOutputPath.toLowerCase())
        ) {
            format = outputPathOrFormat.toLowerCase() === "spritesheet" ? "sprite_sheet" : outputPathOrFormat;
            outputPath = formatOrOutputPath;
        }
        const res = this.exportCanvasInternal(canvasId, outputPath, format, options);
        return { ...res, filePath: res.outputPath };
    }

    private doesObjectRequireRasterizationForSvg(state: ArtCanvasState, obj: VectorObjectSpec): boolean {
        if (this.hasActiveAttachedFilters(obj)) {
            return true;
        }
        if (obj.kind === "ref" && obj.refId && state.sharedObjects[obj.refId]) {
            const shared = state.sharedObjects[obj.refId];
            if (this.hasActiveAttachedFilters(shared)) {
                return true;
            }
            for (const l of shared.layers) {
                if (this.hasActiveAttachedFilters(l) || (l.blendMode && l.blendMode !== "normal")) {
                    return true;
                }
                for (const so of l.objects) {
                    if (this.doesObjectRequireRasterizationForSvg(state, so)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private rasterizeVectorObjectToImageInfo(
        state: ArtCanvasState,
        obj: VectorObjectSpec,
        width: number,
        height: number,
        frame: number,
        filterOpts: RenderFilterContextOptions
    ): { x: number; y: number; width: number; height: number; dataUrl: string } {
        const objBuf = Buffer.alloc(width * height * 4, 0);
        this.renderVectorObjectToBuffer(
            state,
            obj,
            objBuf,
            width,
            height,
            frame,
            new Set(),
            undefined,
            undefined,
            undefined,
            filterOpts
        );
        const bbox = this.computeRasterBoundingBox(objBuf, width, height);
        if (bbox.width <= 0 || bbox.height <= 0) {
            const emptyPng = encodeRgbaToPng(1, 1, Buffer.alloc(4, 0)).toString("base64");
            return { x: 0, y: 0, width: 1, height: 1, dataUrl: `data:image/png;base64,${emptyPng}` };
        }
        const cropped = Buffer.alloc(bbox.width * bbox.height * 4, 0);
        for (let row = 0; row < bbox.height; row++) {
            const srcStart = ((bbox.y + row) * width + bbox.x) * 4;
            objBuf.copy(cropped, row * bbox.width * 4, srcStart, srcStart + bbox.width * 4);
        }
        const b64 = encodeRgbaToPng(bbox.width, bbox.height, cropped).toString("base64");
        return {
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            dataUrl: `data:image/png;base64,${b64}`
        };
    }

    private exportCanvasInternal(
        canvasId: string,
        outputPath: string,
        format?: string,
        options: ExportCanvasOptions = {}
    ): { outputPath: string; format: string; bytesWritten: number; iconCount?: number } {
        const state = this.loadCanvas(canvasId);
        const resolvedPath = path.isAbsolute(outputPath)
            ? outputPath
            : path.join(this.projectRoot, outputPath.replace(/^[/\\]+/, ""));

        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        const ext = (format || path.extname(resolvedPath).replace(/^\./, "") || "png").toLowerCase();
        const frame = options.frame ?? 0;
        const exportFilterOpts: RenderFilterContextOptions = { forExport: true };
        const mergedMetadata: DocumentMetadataSpec = {
            ...(state.metadata || {}),
            ...(options.metadata || {})
        };
        if (options.title && !mergedMetadata.title) mergedMetadata.title = options.title;
        if (options.author && !mergedMetadata.author) mergedMetadata.author = options.author;
        if (options.comment && !mergedMetadata.comment) mergedMetadata.comment = options.comment;

        if (ext === "hacanvas" || ext === "aicz") {
            const saved = this.saveCanvasPackage(canvasId, resolvedPath);
            return { outputPath: saved.filePath, format: "hacanvas", bytesWritten: saved.bytesWritten };
        }

        if (ext === "pdf") {
            const layersAsPages = options.layersAsPages !== false;
            const includeHidden = Boolean(options.exportHiddenLayers);
            const candidateLayers = includeHidden
                ? state.layers
                : state.layers.filter(l => l.visible);
            const sourceLayers = candidateLayers.length > 0 ? candidateLayers : state.layers;

            const convertVectorObjForPdf = (rawObj: VectorObjectSpec): VectorObjectSpec => {
                const resolved = this.resolveAnimatedObject(state, rawObj, frame);
                if (this.hasActiveAttachedFilters(resolved) || resolved.kind === "boolean") {
                    const info = this.rasterizeVectorObjectToImageInfo(
                        state,
                        resolved,
                        state.width,
                        state.height,
                        frame,
                        exportFilterOpts
                    );
                    return {
                        id: resolved.id,
                        kind: "image",
                        x: info.x,
                        y: info.y,
                        width: info.width,
                        height: info.height,
                        imageWidth: info.width,
                        imageHeight: info.height,
                        imageDataUrl: info.dataUrl,
                        fill: "none",
                        stroke: "none",
                        strokeWidth: 0,
                        opacity: 1
                    };
                }
                return resolved;
            };

            const pages: PdfExportPageInput[] = [];
            if (layersAsPages && sourceLayers.length > 0) {
                for (const layer of sourceLayers) {
                    const layerHasUnsupportedVectorFeatures =
                        this.hasActiveAttachedFilters(layer) ||
                        (layer.blendMode && layer.blendMode !== "normal");
                    if (layer.type === "vector" && !layerHasUnsupportedVectorFeatures) {
                        pages.push({
                            name: layer.name,
                            width: state.width,
                            height: state.height,
                            type: "vector",
                            visible: layer.visible,
                            opacity: this.resolveAnimatedLayerOpacity(state, layer, frame),
                            objects: layer.objects.map(o => convertVectorObjForPdf(o))
                        });
                    } else {
                        const rawBuf = this.renderLayerToBuffer(state, layer, frame, exportFilterOpts);
                        const effOpacity = this.resolveAnimatedLayerOpacity(state, layer, frame);
                        if (effOpacity < 1) {
                            for (let i = 3; i < rawBuf.length; i += 4) {
                                rawBuf[i] = Math.round(rawBuf[i] * effOpacity);
                            }
                        }
                        pages.push({
                            name: layer.name,
                            width: state.width,
                            height: state.height,
                            type: "raster",
                            visible: layer.visible,
                            opacity: effOpacity,
                            rgba: rawBuf
                        });
                    }
                }
            } else {
                // Single flattened page with vector text preserved on top if any
                const allVectorObjs = sourceLayers
                    .filter(l => l.type === "vector")
                    .flatMap(l => l.objects.map(o => this.resolveAnimatedObject(state, o, frame)));
                const hasRasterOrFilteredLayers = sourceLayers.some(
                    l => l.type === "raster" || this.hasActiveAttachedFilters(l) || (l.blendMode && l.blendMode !== "normal")
                );
                if (!hasRasterOrFilteredLayers && allVectorObjs.length > 0) {
                    pages.push({
                        name: "Page 1",
                        width: state.width,
                        height: state.height,
                        type: "vector",
                        visible: true,
                        opacity: 1,
                        objects: allVectorObjs.map(o => convertVectorObjForPdf(o))
                    });
                } else {
                    pages.push({
                        name: "Page 1",
                        width: state.width,
                        height: state.height,
                        type: "raster",
                        visible: true,
                        opacity: 1,
                        rgba: this.renderCompositeFrameBuffer(state, frame, exportFilterOpts),
                        objects: allVectorObjs.filter(o => o.kind === "text" && !this.hasActiveAttachedFilters(o))
                    });
                }
            }

            const pdfBuf = encodeLayersToPdf(
                state.width,
                state.height,
                pages,
                Object.values(state.embeddedFonts || {}),
                {
                    layersAsPages,
                    exportHiddenLayers: true,
                    reversePageOrder: options.reversePageOrder,
                    embedFonts: options.embedFonts !== false,
                    backgroundColor: options.backgroundColor ?? state.backgroundColor,
                    title: mergedMetadata.title,
                    author: mergedMetadata.author,
                    metadata: mergedMetadata,
                    sharedObjectResolver: (refId: string) => {
                        const shared = state.sharedObjects[refId];
                        if (!shared) return null;
                        const rgba = this.renderSharedObjectToBuffer(
                            state,
                            shared,
                            frame,
                            new Set(),
                            undefined,
                            undefined,
                            exportFilterOpts
                        );
                        return { width: shared.width, height: shared.height, rgba };
                    }
                }
            );
            fs.writeFileSync(resolvedPath, pdfBuf);
            return { outputPath: resolvedPath, format: "pdf", bytesWritten: pdfBuf.length };
        }

        if (ext === "svg") {
            const includeDefs = options.includeSharedDefs !== false;
            const includeBg = options.includeBackground !== false;
            const vectorOnly = options.exportScope === "vector_only";
            const includeHidden = Boolean(options.exportHiddenLayers);
            const pretty = options.prettyPrint !== false;

            const defsLines: string[] = [];
            if (includeDefs) {
                for (const sObj of Object.values(state.sharedObjects)) {
                    if (this.hasActiveAttachedFilters(sObj)) {
                        const sBuf = this.renderSharedObjectToBuffer(
                            state,
                            sObj,
                            frame,
                            new Set(),
                            undefined,
                            undefined,
                            exportFilterOpts
                        );
                        const b64 = encodeRgbaToPng(sObj.width, sObj.height, sBuf).toString("base64");
                        defsLines.push(
                            `    <g id="${escapeXml(sObj.id)}" data-width="${sObj.width}" data-height="${sObj.height}">\n      <image id="${escapeXml(sObj.id)}_rasterized" data-rasterized-shared-object="true" width="${sObj.width}" height="${sObj.height}" href="data:image/png;base64,${b64}" />\n    </g>`
                        );
                        continue;
                    }
                    const sLayerElements: string[] = [];
                    for (const l of sObj.layers) {
                        if (!l.visible && !includeHidden) continue;
                        if (l.type === "vector" && !this.hasActiveAttachedFilters(l)) {
                            for (const o of l.objects) {
                                const resolved = this.resolveAnimatedObject(state, o, frame);
                                if (this.doesObjectRequireRasterizationForSvg(state, resolved)) {
                                    const info = this.rasterizeVectorObjectToImageInfo(
                                        state,
                                        resolved,
                                        sObj.width,
                                        sObj.height,
                                        frame,
                                        exportFilterOpts
                                    );
                                    sLayerElements.push(
                                        `      <image id="${escapeXml(resolved.id)}" data-rasterized-object="true" x="${info.x}" y="${info.y}" width="${info.width}" height="${info.height}" href="${info.dataUrl}" />`
                                    );
                                } else {
                                    sLayerElements.push("      " + this.vectorObjectToSvgElement(resolved));
                                }
                            }
                        } else if (!vectorOnly || this.hasActiveAttachedFilters(l)) {
                            const rBuf = this.loadRasterBuffer(state, l.id, sObj.width, sObj.height, frame, sObj.id);
                            const filteredBuf = this.hasActiveAttachedFilters(l)
                                ? this.applyAttachedFiltersToBuffer(state, Buffer.from(rBuf), sObj.width, sObj.height, l.attachedFilters, true)
                                : rBuf;
                            const b64 = encodeRgbaToPng(sObj.width, sObj.height, filteredBuf).toString("base64");
                            sLayerElements.push(`      <image id="${escapeXml(l.id)}" width="${sObj.width}" height="${sObj.height}" href="data:image/png;base64,${b64}" />`);
                        }
                    }
                    defsLines.push(`    <g id="${escapeXml(sObj.id)}" data-width="${sObj.width}" data-height="${sObj.height}">\n${sLayerElements.join("\n")}\n    </g>`);
                }
            }

            const layerGroups: string[] = [];
            if (hasMeaningfulMetadata(mergedMetadata)) {
                layerGroups.push(`  <metadata>\n    ${buildXmpPacketString(mergedMetadata).split("\n").join("\n    ")}\n  </metadata>`);
            }
            if (defsLines.length > 0) {
                layerGroups.push(`  <defs>\n${defsLines.join("\n")}\n  </defs>`);
            }
            if (includeBg && state.backgroundColor && state.backgroundColor !== "transparent" && state.backgroundColor !== "none") {
                layerGroups.push(`  <rect id="background" width="${state.width}" height="${state.height}" fill="${escapeXml(state.backgroundColor)}" />`);
            }
            for (const layer of state.layers) {
                if (!layer.visible && !includeHidden) continue;
                const visAttr = !layer.visible ? ` display="none"` : "";
                const layerRequiresRaster =
                    this.hasActiveAttachedFilters(layer) ||
                    (layer.blendMode && layer.blendMode !== "normal");
                if (layer.type === "vector" && !layerRequiresRaster) {
                    const elemLines: string[] = [];
                    for (const o of layer.objects) {
                        const resolved = this.resolveAnimatedObject(state, o, frame);
                        if (this.doesObjectRequireRasterizationForSvg(state, resolved)) {
                            const info = this.rasterizeVectorObjectToImageInfo(
                                state,
                                resolved,
                                state.width,
                                state.height,
                                frame,
                                exportFilterOpts
                            );
                            elemLines.push(
                                `    <image id="${escapeXml(resolved.id)}" data-rasterized-object="true" x="${info.x}" y="${info.y}" width="${info.width}" height="${info.height}" href="${info.dataUrl}" />`
                            );
                        } else {
                            elemLines.push("    " + this.vectorObjectToSvgElement(resolved));
                        }
                    }
                    const elems = elemLines.join("\n");
                    layerGroups.push(`  <g id="${escapeXml(layer.id)}" inkscape:groupmode="layer" inkscape:label="${escapeXml(layer.name)}" opacity="${this.resolveAnimatedLayerOpacity(state, layer, frame)}"${visAttr}>\n${elems}\n  </g>`);
                } else if (!vectorOnly || layerRequiresRaster) {
                    const layerBuf = this.renderLayerToBuffer(state, layer, frame, exportFilterOpts);
                    const b64 = encodeRgbaToPng(state.width, state.height, layerBuf).toString("base64");
                    const rasterAttr = layer.type === "vector" ? ` data-rasterized-layer="true"` : "";
                    layerGroups.push(`  <image id="${escapeXml(layer.id)}"${rasterAttr} width="${state.width}" height="${state.height}" opacity="${this.resolveAnimatedLayerOpacity(state, layer, frame)}"${visAttr} href="data:image/png;base64,${b64}" />`);
                }
            }
            let fullSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${state.width}" height="${state.height}" viewBox="0 0 ${state.width} ${state.height}">
${layerGroups.join("\n")}
</svg>`;
            if (!pretty) {
                fullSvg = fullSvg.replace(/>\s+</g, "><").trim();
            }
            fs.writeFileSync(resolvedPath, fullSvg, "utf8");
            return { outputPath: resolvedPath, format: "svg", bytesWritten: Buffer.byteLength(fullSvg, "utf8") };
        }

        if (ext === "gif") {
            const defaultDelay = options.defaultDelayMs ?? Math.round(1000 / Math.max(1, state.animation.fps));
            const asAnim = options.asAnimation !== false;
            let frames: { rgba: Buffer; delayMs: number }[];

            if (!asAnim) {
                frames = [{ rgba: this.renderCompositeFrameBuffer(state, frame, exportFilterOpts), delayMs: defaultDelay }];
            } else if (options.layersAsFrames) {
                const candidateLayers = state.layers.filter(l => l.visible);
                const sourceLayers = candidateLayers.length > 0 ? candidateLayers : state.layers;
                frames = sourceLayers.map(layer => {
                    const buf = this.renderLayerToBuffer(state, layer, frame, exportFilterOpts);
                    const effOpacity = this.resolveAnimatedLayerOpacity(state, layer, frame);
                    if (effOpacity < 1) {
                        for (let i = 3; i < buf.length; i += 4) {
                            buf[i] = Math.round(buf[i] * effOpacity);
                        }
                    }
                    return { rgba: buf, delayMs: defaultDelay };
                });
            } else {
                const totalFrames = Math.max(1, state.animation.durationFrames);
                frames = Array.from({ length: totalFrames }, (_, fIdx) => ({
                    rgba: this.renderCompositeFrameBuffer(state, fIdx, exportFilterOpts),
                    delayMs: defaultDelay
                }));
            }

            const gifComment =
                options.comment ||
                mergedMetadata.comment ||
                mergedMetadata.description ||
                (mergedMetadata.author ? `Author: ${mergedMetadata.author}` : undefined);
            const gifBuf = encodeFramesToAnimatedGif(state.width, state.height, frames, {
                loop: options.loop ?? state.animation.loop,
                defaultDelayMs: defaultDelay,
                disposal: options.disposal,
                dither: options.dither,
                comment: gifComment
            });
            fs.writeFileSync(resolvedPath, gifBuf);
            return { outputPath: resolvedPath, format: "gif", bytesWritten: gifBuf.length };
        }

        if (ext === "sprite_sheet") {
            const pad = Math.max(0, Math.min(128, Math.round(options.padding ?? 0)));
            const cellBuffers: Buffer[] = [];
            if (options.sourceMode === "layers") {
                const visLayers = state.layers.filter(l => l.visible);
                const srcLayers = visLayers.length > 0 ? visLayers : state.layers;
                for (const l of srcLayers) {
                    cellBuffers.push(this.renderLayerToBuffer(state, l, frame, exportFilterOpts));
                }
            } else {
                const totalFrames = Math.max(1, state.animation.durationFrames);
                for (let fIdx = 0; fIdx < totalFrames; fIdx++) {
                    cellBuffers.push(this.renderCompositeFrameBuffer(state, fIdx, exportFilterOpts));
                }
            }
            if (cellBuffers.length === 0) {
                cellBuffers.push(this.renderCompositeFrameBuffer(state, frame, exportFilterOpts));
            }
            const count = cellBuffers.length;
            const cols = options.columns && options.columns > 0 ? Math.min(count, Math.round(options.columns)) : count;
            const rows = Math.max(1, Math.ceil(count / cols));
            const sheetW = cols * state.width + Math.max(0, cols - 1) * pad;
            const sheetH = rows * state.height + Math.max(0, rows - 1) * pad;
            const sheetRgba = Buffer.alloc(sheetW * sheetH * 4, 0);

            cellBuffers.forEach((cBuf, idx) => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const dstX = col * (state.width + pad);
                const dstY = row * (state.height + pad);
                for (let y = 0; y < state.height; y++) {
                    cBuf.copy(
                        sheetRgba,
                        ((dstY + y) * sheetW + dstX) * 4,
                        y * state.width * 4,
                        (y + 1) * state.width * 4
                    );
                }
            });

            const pngBuf = encodeRgbaToPng(sheetW, sheetH, sheetRgba, {
                compressionLevel: options.compressionLevel ?? 6
            });
            fs.writeFileSync(resolvedPath, pngBuf);
            return { outputPath: resolvedPath, format: "sprite_sheet", bytesWritten: pngBuf.length };
        }

        if (ext === "ora") {
            const oraLayers = state.layers.map(l => ({
                name: l.name,
                visible: l.visible,
                opacity: l.opacity,
                blendMode: l.blendMode,
                rgba: this.renderLayerToBuffer(state, l, frame, exportFilterOpts)
            }));
            const mergedRgba = this.renderCompositeFrameBuffer(state, frame, exportFilterOpts);
            const oraBuf = encodeToOraBuffer(state.width, state.height, oraLayers, {
                exportHiddenLayers: options.exportHiddenLayers ?? true,
                includeMergedComposite: options.includeMergedComposite ?? true,
                compressionLevel: options.compressionLevel ?? 6,
                mergedRgba
            });
            fs.writeFileSync(resolvedPath, oraBuf);
            return { outputPath: resolvedPath, format: "ora", bytesWritten: oraBuf.length };
        }

        // GIMP-style Multi-Layer Windows Icon (.ico / .cur): Each layer is treated as its own icon within the .ico!
        if (ext === "ico" || ext === "cur") {
            const defaultBpp: IcoIconFormatBpp = options.icoDefaultBpp ?? 32;
            const defaultCompressed = options.icoDefaultCompressed ?? false;
            const icoEntries: IcoLayerEntryInput[] = [];

            const renderLayerWithOpacity = (layer: ArtLayerSpec): Buffer => {
                const rawBuf = this.renderLayerToBuffer(state, layer, frame, exportFilterOpts);
                const effOpacity = this.resolveAnimatedLayerOpacity(state, layer, frame);
                if (effOpacity < 1) {
                    for (let i = 3; i < rawBuf.length; i += 4) {
                        rawBuf[i] = Math.round(rawBuf[i] * effOpacity);
                    }
                }
                return rawBuf;
            };

            if (options.icoLayers && options.icoLayers.length > 0) {
                for (const spec of options.icoLayers) {
                    if (spec.include === false) continue;
                    const layer = state.layers.find(l => l.id === spec.layerId || l.name === spec.layerId);
                    if (!layer) continue;
                    icoEntries.push({
                        layerId: layer.id,
                        name: layer.name,
                        width: state.width,
                        height: state.height,
                        rgba: renderLayerWithOpacity(layer),
                        bpp: spec.bpp ?? defaultBpp,
                        compressed: spec.compressed ?? defaultCompressed,
                        targetWidth: spec.width && spec.width > 0 ? spec.width : undefined,
                        targetHeight: spec.height && spec.height > 0 ? spec.height : undefined,
                        alphaThreshold: spec.alphaThreshold
                    });
                }
            }

            if (icoEntries.length === 0) {
                const candidateLayers = options.icoExportHiddenLayers
                    ? state.layers
                    : state.layers.filter(l => l.visible);
                const sourceLayers = candidateLayers.length > 0 ? candidateLayers : state.layers;
                for (const layer of sourceLayers) {
                    icoEntries.push({
                        layerId: layer.id,
                        name: layer.name,
                        width: state.width,
                        height: state.height,
                        rgba: renderLayerWithOpacity(layer),
                        bpp: defaultBpp,
                        compressed: defaultCompressed
                    });
                }
            }

            if (icoEntries.length === 0) {
                icoEntries.push({
                    width: state.width,
                    height: state.height,
                    rgba: this.renderCompositeFrameBuffer(state, frame, exportFilterOpts),
                    bpp: defaultBpp,
                    compressed: defaultCompressed
                });
            }

            const icoBuf = encodeLayersToIco(icoEntries);
            fs.writeFileSync(resolvedPath, icoBuf);
            return {
                outputPath: resolvedPath,
                format: ext,
                bytesWritten: icoBuf.length,
                iconCount: icoEntries.length
            };
        }

        const compositeRgba = this.renderCompositeFrameBuffer(state, frame, exportFilterOpts);

        if (ext === "bmp") {
            const bmpBuf = encodeRgbaToBmp(state.width, state.height, compositeRgba, {
                bpp: options.bmpBpp ?? 32,
                topDown: options.topDown ?? true,
                writeColorSpace: options.writeColorSpace ?? false
            });
            fs.writeFileSync(resolvedPath, bmpBuf);
            return { outputPath: resolvedPath, format: "bmp", bytesWritten: bmpBuf.length };
        }
        if (ext === "tga") {
            const tgaBuf = encodeRgbaToTga(state.width, state.height, compositeRgba, {
                rle: options.rle ?? false,
                origin: options.origin ?? "top_left",
                bpp: options.tgaBpp ?? 32
            });
            fs.writeFileSync(resolvedPath, tgaBuf);
            return { outputPath: resolvedPath, format: "tga", bytesWritten: tgaBuf.length };
        }
        if (ext === "ppm" || ext === "pnm") {
            const ppmBuf = encodeRgbaToPpm(state.width, state.height, compositeRgba, {
                dataFormatting: options.dataFormatting ?? "raw"
            });
            fs.writeFileSync(resolvedPath, ppmBuf);
            return { outputPath: resolvedPath, format: ext, bytesWritten: ppmBuf.length };
        }
        if (ext === "ff" || ext === "farbfeld") {
            const ffBuf = encodeRgbaToFarbfeld(state.width, state.height, compositeRgba, {
                applyGamma: options.applyGamma ?? false
            });
            fs.writeFileSync(resolvedPath, ffBuf);
            return { outputPath: resolvedPath, format: "farbfeld", bytesWritten: ffBuf.length };
        }

        const bgParsed = parseColor(
            options.backgroundColor ||
                (state.backgroundColor && state.backgroundColor !== "transparent" ? state.backgroundColor : "#ffffff")
        );

        const pngBuf = encodeRgbaToPng(state.width, state.height, compositeRgba, {
            compressionLevel: options.compressionLevel ?? 6,
            pixelFormat: options.pixelFormat ?? "rgba8",
            saveBackground: options.saveBackground,
            backgroundColor: bgParsed,
            saveResolution: options.saveResolution,
            dpi: state.dpi,
            saveCreationTime: options.saveCreationTime,
            comment: options.comment,
            metadata: hasMeaningfulMetadata(mergedMetadata) ? mergedMetadata : undefined
        });

        if (ext === "jpg" || ext === "jpeg" || ext === "webp" || ext === "tiff" || ext === "tif") {
            if (process.platform === "win32") {
                const tmpPng = path.join(os.tmpdir(), `aicore_exp_${Date.now()}.png`);
                try {
                    // For JPEG, composite transparent pixels onto the chosen background color first
                    let srcPngForConversion = pngBuf;
                    if (ext === "jpg" || ext === "jpeg") {
                        const flattened = Buffer.from(compositeRgba);
                        for (let i = 0; i < flattened.length; i += 4) {
                            const a = flattened[i + 3] / 255;
                            flattened[i] = Math.round(flattened[i] * a + bgParsed.r * (1 - a));
                            flattened[i + 1] = Math.round(flattened[i + 1] * a + bgParsed.g * (1 - a));
                            flattened[i + 2] = Math.round(flattened[i + 2] * a + bgParsed.b * (1 - a));
                            flattened[i + 3] = 255;
                        }
                        srcPngForConversion = encodeRgbaToPng(state.width, state.height, flattened);
                    }
                    fs.writeFileSync(tmpPng, srcPngForConversion);
                    const qualityVal = Math.max(1, Math.min(100, Math.round(options.quality ?? 90)));
                    const isTiff = ext.startsWith("tif");
                    const psCmd = isTiff
                        ? `Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${tmpPng.replace(/'/g, "''")}'); $img.Save('${resolvedPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Tiff); $img.Dispose()`
                        : `Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${tmpPng.replace(/'/g, "''")}'); $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1; $ep = New-Object System.Drawing.Imaging.EncoderParameters(1); $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]${qualityVal}); $img.Save('${resolvedPath.replace(/'/g, "''")}', $codec, $ep); $img.Dispose()`;
                    execFileSync("powershell.exe", ["-NoProfile", "-Command", psCmd], { timeout: 10000 });
                    fs.unlinkSync(tmpPng);
                    if (fs.existsSync(resolvedPath)) {
                        if ((ext === "jpg" || ext === "jpeg") && hasMeaningfulMetadata(mergedMetadata)) {
                            const rawJpg = fs.readFileSync(resolvedPath);
                            const enrichedJpg = injectJpegExifAndXmp(rawJpg, mergedMetadata);
                            fs.writeFileSync(resolvedPath, enrichedJpg);
                        }
                        return { outputPath: resolvedPath, format: ext, bytesWritten: fs.statSync(resolvedPath).size };
                    }
                } catch {
                    if (fs.existsSync(tmpPng)) {
                        try { fs.unlinkSync(tmpPng); } catch { /* ignore */ }
                    }
                }
            }
        }

        fs.writeFileSync(resolvedPath, pngBuf);
        return { outputPath: resolvedPath, format: ext, bytesWritten: pngBuf.length };
    }

    // ============================================================================
    // 7. GIMP Undo / Redo History Stack, Clipboard Buffers, Transforms & Color Ops
    // ============================================================================

    public setPendingUndoLabel(canvasId: string, label: string): void {
        if (!this.pendingActionLabels.has(canvasId)) {
            this.pendingActionLabels.set(canvasId, label);
        }
    }

    public beginUndoGroup(canvasId: string, label = "Canvas Edit"): void {
        const curDepth = this.activeUndoGroupDepth.get(canvasId) || 0;
        if (curDepth === 0) {
            if (!this.lastCommittedState.has(canvasId)) {
                const snap = this.captureDiskSnapshot(canvasId, "Base Image");
                if (snap) this.lastCommittedState.set(canvasId, snap);
            }
            this.pendingActionLabels.set(canvasId, label);
        }
        this.activeUndoGroupDepth.set(canvasId, curDepth + 1);
    }

    public endUndoGroup(canvasId: string, explicitLabel?: string): void {
        const curDepth = this.activeUndoGroupDepth.get(canvasId) || 0;
        if (curDepth <= 1) {
            this.activeUndoGroupDepth.set(canvasId, 0);
            if (!this.isRestoringHistory) {
                this.recordSnapshotAfterSave(canvasId, explicitLabel);
            }
        } else {
            this.activeUndoGroupDepth.set(canvasId, curDepth - 1);
        }
    }

    public withUndoGroup<T>(canvasId: string, label: string, fn: () => T): T {
        this.beginUndoGroup(canvasId, label);
        try {
            return fn();
        } finally {
            this.endUndoGroup(canvasId, label);
        }
    }

    private captureDiskSnapshot(canvasId: string, label: string): CanvasHistoryEntry | null {
        const scenePath = this.getScenePath(canvasId);
        if (!fs.existsSync(scenePath)) return null;
        const sceneJson = fs.readFileSync(scenePath, "utf8");
        const dir = this.getCanvasDir(canvasId);
        const rawFiles = new Map<string, Buffer>();
        if (fs.existsSync(dir)) {
            for (const entry of fs.readdirSync(dir)) {
                if (entry.endsWith(".raw")) {
                    const full = path.join(dir, entry);
                    try {
                        rawFiles.set(entry, Buffer.from(fs.readFileSync(full)));
                    } catch {
                        // Ignore transient read errors
                    }
                }
            }
        }
        return {
            id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            label,
            timestamp: Date.now(),
            sceneJson,
            rawFiles
        };
    }

    private cloneSnapshot(snap: CanvasHistoryEntry, overrideLabel?: string): CanvasHistoryEntry {
        const clonedRaw = new Map<string, Buffer>();
        for (const [k, v] of snap.rawFiles.entries()) {
            clonedRaw.set(k, Buffer.from(v));
        }
        return {
            id: snap.id,
            label: overrideLabel ?? snap.label,
            timestamp: snap.timestamp,
            sceneJson: snap.sceneJson,
            rawFiles: clonedRaw
        };
    }

    private snapshotsAreEqual(a: CanvasHistoryEntry, b: CanvasHistoryEntry): boolean {
        if (a.sceneJson !== b.sceneJson) return false;
        if (a.rawFiles.size !== b.rawFiles.size) return false;
        for (const [k, bufA] of a.rawFiles.entries()) {
            const bufB = b.rawFiles.get(k);
            if (!bufB || !bufA.equals(bufB)) return false;
        }
        return true;
    }

    private recordSnapshotAfterSave(canvasId: string, explicitLabel?: string): void {
        const label = explicitLabel || this.pendingActionLabels.get(canvasId) || "Canvas Edit";
        this.pendingActionLabels.delete(canvasId);

        const newSnap = this.captureDiskSnapshot(canvasId, label);
        if (!newSnap) return;

        const prevSnap = this.lastCommittedState.get(canvasId);
        if (!prevSnap) {
            newSnap.label = "Base Image";
            this.lastCommittedState.set(canvasId, newSnap);
            return;
        }

        if (this.snapshotsAreEqual(prevSnap, newSnap)) {
            return;
        }

        let uStack = this.undoStacks.get(canvasId);
        if (!uStack) {
            uStack = [];
            this.undoStacks.set(canvasId, uStack);
        }
        uStack.push(this.cloneSnapshot(prevSnap));
        while (uStack.length > this.maxUndoLevels) {
            uStack.shift();
        }
        this.redoStacks.set(canvasId, []);
        this.lastCommittedState.set(canvasId, newSnap);
    }

    private restoreDiskSnapshot(canvasId: string, snap: CanvasHistoryEntry): ArtCanvasState {
        this.isRestoringHistory = true;
        try {
            const dir = this.getCanvasDir(canvasId);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            for (const entry of fs.readdirSync(dir)) {
                if (entry.endsWith(".raw") && !snap.rawFiles.has(entry)) {
                    try {
                        fs.unlinkSync(path.join(dir, entry));
                    } catch {
                        // Ignore
                    }
                }
            }
            for (const [fileName, buf] of snap.rawFiles.entries()) {
                fs.writeFileSync(path.join(dir, fileName), buf);
            }
            const parsed = JSON.parse(snap.sceneJson) as ArtCanvasState;
            this.saveCanvas(parsed);
            this.lastCommittedState.set(canvasId, this.cloneSnapshot(snap));
            return parsed;
        } finally {
            this.isRestoringHistory = false;
        }
    }

    public resetUndoHistory(canvasId: string, baseLabel = "Base Image"): void {
        const snap = this.captureDiskSnapshot(canvasId, baseLabel);
        this.undoStacks.set(canvasId, []);
        this.redoStacks.set(canvasId, []);
        this.activeUndoGroupDepth.set(canvasId, 0);
        this.pendingActionLabels.delete(canvasId);
        if (snap) {
            this.lastCommittedState.set(canvasId, snap);
        }
    }

    public clearUndoHistory(canvasId: string): void {
        this.undoStacks.set(canvasId, []);
        this.redoStacks.set(canvasId, []);
    }

    public canUndo(canvasId: string): boolean {
        return (this.undoStacks.get(canvasId)?.length || 0) > 0;
    }

    public canRedo(canvasId: string): boolean {
        return (this.redoStacks.get(canvasId)?.length || 0) > 0;
    }

    public getUndoLabel(canvasId: string): string | undefined {
        if (!this.canUndo(canvasId)) return undefined;
        return this.lastCommittedState.get(canvasId)?.label || "Last Action";
    }

    public getRedoLabel(canvasId: string): string | undefined {
        const rStack = this.redoStacks.get(canvasId);
        if (!rStack || rStack.length === 0) return undefined;
        return rStack[rStack.length - 1].label || "Next Action";
    }

    public undo(canvasId: string): { undone: boolean; label?: string; state: ArtCanvasState } {
        const uStack = this.undoStacks.get(canvasId);
        if (!uStack || uStack.length === 0) {
            return { undone: false, state: this.loadCanvas(canvasId) };
        }
        const current = this.lastCommittedState.get(canvasId) || this.captureDiskSnapshot(canvasId, "Canvas Edit");
        const prevSnap = uStack.pop()!;
        const undoneLabel = current?.label || "Action";

        if (current) {
            let rStack = this.redoStacks.get(canvasId);
            if (!rStack) {
                rStack = [];
                this.redoStacks.set(canvasId, rStack);
            }
            rStack.push(this.cloneSnapshot(current));
        }

        const restoredState = this.restoreDiskSnapshot(canvasId, prevSnap);
        return { undone: true, label: undoneLabel, state: restoredState };
    }

    public redo(canvasId: string): { redone: boolean; label?: string; state: ArtCanvasState } {
        const rStack = this.redoStacks.get(canvasId);
        if (!rStack || rStack.length === 0) {
            return { redone: false, state: this.loadCanvas(canvasId) };
        }
        const current = this.lastCommittedState.get(canvasId) || this.captureDiskSnapshot(canvasId, "Base Image");
        const nextSnap = rStack.pop()!;

        if (current) {
            let uStack = this.undoStacks.get(canvasId);
            if (!uStack) {
                uStack = [];
                this.undoStacks.set(canvasId, uStack);
            }
            uStack.push(this.cloneSnapshot(current));
        }

        const restoredState = this.restoreDiskSnapshot(canvasId, nextSnap);
        return { redone: true, label: nextSnap.label, state: restoredState };
    }

    public getUndoHistory(canvasId: string): {
        canUndo: boolean;
        canRedo: boolean;
        undoList: Array<{ id: string; label: string; timestamp: number }>;
        redoList: Array<{ id: string; label: string; timestamp: number }>;
        currentLabel: string;
    } {
        const uStack = this.undoStacks.get(canvasId) || [];
        const rStack = this.redoStacks.get(canvasId) || [];
        const current = this.lastCommittedState.get(canvasId);
        return {
            canUndo: uStack.length > 0,
            canRedo: rStack.length > 0,
            undoList: uStack.map(s => ({ id: s.id, label: s.label, timestamp: s.timestamp })),
            redoList: [...rStack].reverse().map(s => ({ id: s.id, label: s.label, timestamp: s.timestamp })),
            currentLabel: current?.label || "Base Image"
        };
    }

    public jumpToHistoryState(canvasId: string, targetStepsDelta: number): ArtCanvasState {
        if (targetStepsDelta < 0) {
            const count = Math.abs(targetStepsDelta);
            for (let i = 0; i < count; i++) {
                if (!this.canUndo(canvasId)) break;
                this.undo(canvasId);
            }
        } else if (targetStepsDelta > 0) {
            for (let i = 0; i < targetStepsDelta; i++) {
                if (!this.canRedo(canvasId)) break;
                this.redo(canvasId);
            }
        }
        return this.loadCanvas(canvasId);
    }

    /**
     * Clears the selected region (or the entire layer if no selection is active) on a raster layer,
     * or deletes selected vector objects on a vector layer.
     */
    public clearSelectionOrLayer(
        canvasId: string,
        layerId?: string,
        selectedObjectIds?: string[],
        sharedObjectId?: string
    ): { clearedType: "vector_objects" | "raster_pixels" | "vector_layer"; count: number } {
        return this.withUndoGroup(canvasId, "Clear", () => {
            const state = this.loadCanvas(canvasId);
            const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
            if (selectedObjectIds && selectedObjectIds.length > 0) {
                let removed = 0;
                for (const l of container.layers) {
                    if (l.type === "vector" && !l.locked) {
                        const before = l.objects.length;
                        l.objects = l.objects.filter(o => !selectedObjectIds.includes(o.id));
                        removed += before - l.objects.length;
                    }
                }
                if (removed > 0) {
                    this.saveCanvas(state);
                    return { clearedType: "vector_objects", count: removed };
                }
            }

            const targetLayer =
                container.layers.find(l => l.id === layerId) ||
                container.layers.find(l => !l.locked) ||
                container.layers[0];
            if (!targetLayer || targetLayer.locked) {
                return { clearedType: "raster_pixels", count: 0 };
            }

            if (targetLayer.type === "raster") {
                const buf = this.loadRasterBuffer(state, targetLayer.id, container.width, container.height, undefined, sharedObjectId);
                let clearedPixels = 0;
                for (let py = 0; py < container.height; py++) {
                    for (let px = 0; px < container.width; px++) {
                        if (!sharedObjectId && !this.isPointSelected(state.selection, px, py)) continue;
                        const idx = (py * container.width + px) * 4;
                        buf[idx] = 0;
                        buf[idx + 1] = 0;
                        buf[idx + 2] = 0;
                        buf[idx + 3] = 0;
                        clearedPixels++;
                    }
                }
                this.saveRasterBuffer(state, targetLayer.id, buf, undefined, sharedObjectId);
                this.saveCanvas(state);
                return { clearedType: "raster_pixels", count: clearedPixels };
            } else {
                const count = targetLayer.objects.length;
                targetLayer.objects = [];
                this.saveCanvas(state);
                return { clearedType: "vector_layer", count };
            }
        });
    }

    /**
     * Fills the active selection (or entire raster layer) with a Foreground color, Background color, or Pattern.
     */
    public fillSelectionOrLayer(
        canvasId: string,
        layerId: string | undefined,
        color: string,
        patternOpts?: { mode: "solid" | "checker" | "stripes"; secondaryColor?: string; cellSize?: number },
        sharedObjectId?: string
    ): { layerId: string; pixelsFilled: number } {
        const mode = patternOpts?.mode || "solid";
        return this.withUndoGroup(canvasId, mode === "solid" ? `Fill with Color (${color})` : `Fill with Pattern`, () => {
            const state = this.loadCanvas(canvasId);
            const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
            const layer = this.findLayer(state, layerId, "raster", sharedObjectId);
            const buf = this.loadRasterBuffer(state, layer.id, container.width, container.height, undefined, sharedObjectId);
            const c1 = parseColor(color);
            const c2 = parseColor(patternOpts?.secondaryColor || "#ffffff");
            const cell = Math.max(2, patternOpts?.cellSize || 12);
            let pixelsFilled = 0;

            for (let py = 0; py < container.height; py++) {
                for (let px = 0; px < container.width; px++) {
                    if (!sharedObjectId && !this.isPointSelected(state.selection, px, py)) continue;
                    const idx = (py * container.width + px) * 4;
                    let useC = c1;
                    if (mode === "checker") {
                        const isAlt = (Math.floor(px / cell) + Math.floor(py / cell)) % 2 === 1;
                        useC = isAlt ? c2 : c1;
                    } else if (mode === "stripes") {
                        const isAlt = Math.floor((px + py) / cell) % 2 === 1;
                        useC = isAlt ? c2 : c1;
                    }
                    this.blendPixelInPlace(buf, idx, useC.r, useC.g, useC.b, useC.a, "normal");
                    pixelsFilled++;
                }
            }

            this.saveRasterBuffer(state, layer.id, buf, undefined, sharedObjectId);
            this.saveCanvas(state);
            return { layerId: layer.id, pixelsFilled };
        });
    }

    /**
     * Strokes the outline of the current selection mask on the active raster layer (GIMP `Edit -> Stroke Selection`).
     */
    public strokeSelectionOutline(
        canvasId: string,
        layerId: string | undefined,
        color: string,
        lineWidth = 2,
        sharedObjectId?: string
    ): { layerId: string; pointsDrawn: number } {
        return this.withUndoGroup(canvasId, "Stroke Selection", () => {
            const state = this.loadCanvas(canvasId);
            const sel = state.selection;
            const sx = sel && sel.mode !== "none" ? sel.x : 0;
            const sy = sel && sel.mode !== "none" ? sel.y : 0;
            const sw = sel && sel.mode !== "none" ? sel.width : state.width;
            const sh = sel && sel.mode !== "none" ? sel.height : state.height;

            const pts: Array<{ x: number; y: number }> = [];
            if (sel && sel.mode === "ellipse") {
                const cx = sx + sw / 2;
                const cy = sy + sh / 2;
                const rx = sw / 2;
                const ry = sh / 2;
                const steps = 64;
                for (let i = 0; i <= steps; i++) {
                    const ang = (i / steps) * Math.PI * 2;
                    pts.push({ x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry });
                }
            } else {
                pts.push(
                    { x: sx, y: sy },
                    { x: sx + sw, y: sy },
                    { x: sx + sw, y: sy + sh },
                    { x: sx, y: sy + sh },
                    { x: sx, y: sy }
                );
            }

            // Temporarily allow stroke along selection edge even if selection clip is active
            const savedSel = state.selection;
            state.selection = { mode: "none", inverted: false, x: 0, y: 0, width: state.width, height: state.height };
            this.saveCanvas(state);
            try {
                const res = this.rasterStroke(canvasId, layerId, {
                    tool: "brush",
                    points: pts,
                    color,
                    size: Math.max(1, lineWidth),
                    hardness: 0.9,
                    opacity: 1.0,
                    sharedObjectId
                });
                return { layerId: res.layerId, pointsDrawn: res.pointsDrawn };
            } finally {
                const afterState = this.loadCanvas(canvasId);
                afterState.selection = savedSel;
                this.saveCanvas(afterState);
            }
        });
    }

    /**
     * Copies pixels from either the active raster layer or the composite visible canvas within the current selection.
     */
    public copyRegionPixels(
        canvasId: string,
        opts: { layerId?: string; visibleComposite?: boolean; sharedObjectId?: string } = {}
    ): { width: number; height: number; x: number; y: number; pixels: Buffer } {
        const state = this.loadCanvas(canvasId);
        const container = opts.sharedObjectId ? this.getSharedObjectOrThrow(state, opts.sharedObjectId) : state;
        const sel = !opts.sharedObjectId && state.selection && state.selection.mode !== "none"
            ? state.selection
            : { mode: "none" as const, inverted: false, x: 0, y: 0, width: container.width, height: container.height };

        const rx = Math.max(0, Math.min(container.width - 1, Math.round(sel.x)));
        const ry = Math.max(0, Math.min(container.height - 1, Math.round(sel.y)));
        const rw = Math.max(1, Math.min(container.width - rx, Math.round(sel.width)));
        const rh = Math.max(1, Math.min(container.height - ry, Math.round(sel.height)));

        let srcFull: Buffer;
        if (opts.visibleComposite) {
            srcFull = this.compositeCanvasFrame(state, { sharedObjectId: opts.sharedObjectId }).pixels;
        } else {
            const layer = this.findLayer(state, opts.layerId, "raster", opts.sharedObjectId);
            srcFull = this.loadRasterBuffer(state, layer.id, container.width, container.height, undefined, opts.sharedObjectId);
        }

        const out = Buffer.alloc(rw * rh * 4, 0);
        for (let y = 0; y < rh; y++) {
            for (let x = 0; x < rw; x++) {
                const gx = rx + x;
                const gy = ry + y;
                if (!opts.sharedObjectId && sel.mode !== "none" && !this.isPointSelected(sel, gx, gy)) continue;
                const sIdx = (gy * container.width + gx) * 4;
                const dIdx = (y * rw + x) * 4;
                out[dIdx] = srcFull[sIdx];
                out[dIdx + 1] = srcFull[sIdx + 1];
                out[dIdx + 2] = srcFull[sIdx + 2];
                out[dIdx + 3] = srcFull[sIdx + 3];
            }
        }
        return { width: rw, height: rh, x: rx, y: ry, pixels: out };
    }

    /**
     * Pastes an RGBA pixel buffer onto the active raster layer or into a brand-new raster layer.
     */
    public pasteRegionPixels(
        canvasId: string,
        clip: { width: number; height: number; x: number; y: number; pixels: Buffer },
        opts: {
            layerId?: string;
            inPlace?: boolean;
            intoSelection?: boolean;
            asNewLayer?: boolean;
            newLayerName?: string;
            sharedObjectId?: string;
        } = {}
    ): ArtLayerSpec {
        const label = opts.asNewLayer ? "Paste as New Layer" : opts.intoSelection ? "Paste Into Selection" : "Paste";
        return this.withUndoGroup(canvasId, label, () => {
            let state = this.loadCanvas(canvasId);
            let targetLayer: ArtLayerSpec;
            if (opts.asNewLayer) {
                targetLayer = this.createLayer(
                    canvasId,
                    opts.newLayerName || "Pasted Layer",
                    "raster",
                    { sharedObjectId: opts.sharedObjectId }
                );
                state = this.loadCanvas(canvasId);
            } else {
                targetLayer = this.findLayer(state, opts.layerId, "raster", opts.sharedObjectId);
            }

            const container = opts.sharedObjectId ? this.getSharedObjectOrThrow(state, opts.sharedObjectId) : state;
            const dst = this.loadRasterBuffer(state, targetLayer.id, container.width, container.height, undefined, opts.sharedObjectId);

            const destX = opts.inPlace
                ? clip.x
                : opts.intoSelection && state.selection.mode !== "none"
                  ? state.selection.x
                  : Math.max(0, Math.round((container.width - clip.width) / 2));
            const destY = opts.inPlace
                ? clip.y
                : opts.intoSelection && state.selection.mode !== "none"
                  ? state.selection.y
                  : Math.max(0, Math.round((container.height - clip.height) / 2));

            for (let y = 0; y < clip.height; y++) {
                for (let x = 0; x < clip.width; x++) {
                    const gx = destX + x;
                    const gy = destY + y;
                    if (gx < 0 || gx >= container.width || gy < 0 || gy >= container.height) continue;
                    if (opts.intoSelection && !opts.sharedObjectId && !this.isPointSelected(state.selection, gx, gy)) {
                        continue;
                    }
                    const sIdx = (y * clip.width + x) * 4;
                    const a = clip.pixels[sIdx + 3];
                    if (a === 0) continue;
                    const dIdx = (gy * container.width + gx) * 4;
                    this.blendPixelInPlace(
                        dst,
                        dIdx,
                        clip.pixels[sIdx],
                        clip.pixels[sIdx + 1],
                        clip.pixels[sIdx + 2],
                        a,
                        "normal"
                    );
                }
            }

            this.saveRasterBuffer(state, targetLayer.id, dst, undefined, opts.sharedObjectId);
            this.saveCanvas(state);
            return targetLayer;
        });
    }

    /**
     * Modifies the active selection bounds (GIMP `Select -> Grow`, `Shrink`, `Border`, `Feather`, `Sharpen`).
     */
    public modifySelectionBounds(
        canvasId: string,
        op: "grow" | "shrink" | "border" | "feather" | "sharpen" | "remove_holes",
        amountPx = 4
    ): SelectionMaskSpec {
        return this.withUndoGroup(canvasId, `Selection ${op}`, () => {
            const state = this.loadCanvas(canvasId);
            const sel = state.selection;
            if (sel.mode === "none") {
                sel.mode = "rect";
                sel.x = 0;
                sel.y = 0;
                sel.width = state.width;
                sel.height = state.height;
            }
            const delta = Math.max(1, Math.round(amountPx));
            if (op === "grow" || op === "Border" as any || op === "border") {
                sel.x = Math.max(0, sel.x - delta);
                sel.y = Math.max(0, sel.y - delta);
                sel.width = Math.min(state.width - sel.x, sel.width + delta * 2);
                sel.height = Math.min(state.height - sel.y, sel.height + delta * 2);
            } else if (op === "shrink") {
                sel.x = Math.min(state.width - 2, sel.x + delta);
                sel.y = Math.min(state.height - 2, sel.y + delta);
                sel.width = Math.max(2, sel.width - delta * 2);
                sel.height = Math.max(2, sel.height - delta * 2);
            } else if (op === "remove_holes") {
                sel.inverted = false;
            }
            this.saveCanvas(state);
            return state.selection;
        });
    }

    /**
     * Converts the current selection mask into a vector shape/path on the active vector layer (GIMP `Select -> To Path`).
     */
    public selectionToVectorPath(canvasId: string, layerId?: string, sharedObjectId?: string): VectorObjectSpec {
        return this.withUndoGroup(canvasId, "Selection to Path", () => {
            const state = this.loadCanvas(canvasId);
            const sel = state.selection;
            const x = sel.mode !== "none" ? sel.x : 16;
            const y = sel.mode !== "none" ? sel.y : 16;
            const w = sel.mode !== "none" ? sel.width : Math.max(32, state.width - 32);
            const h = sel.mode !== "none" ? sel.height : Math.max(32, state.height - 32);

            if (sel.mode === "ellipse") {
                return this.drawShape(canvasId, layerId, {
                    sharedObjectId,
                    kind: "ellipse",
                    x: Math.round(x + w / 2),
                    y: Math.round(y + h / 2),
                    rx: Math.round(w / 2),
                    ry: Math.round(h / 2),
                    fill: "none",
                    stroke: "#00d4ff",
                    strokeWidth: 2
                });
            }
            return this.drawShape(canvasId, layerId, {
                sharedObjectId,
                kind: "rect",
                x,
                y,
                width: w,
                height: h,
                fill: "none",
                stroke: "#00d4ff",
                strokeWidth: 2
            });
        });
    }

    /**
     * Converts a vector object's bounding box into the active selection mask (GIMP `Select -> From Path`).
     */
    public vectorObjectToSelection(canvasId: string, objectId?: string): SelectionMaskSpec {
        return this.withUndoGroup(canvasId, "Selection from Path", () => {
            const state = this.loadCanvas(canvasId);
            let targetObj: VectorObjectSpec | undefined;
            for (const l of state.layers) {
                if (l.type !== "vector") continue;
                for (const o of l.objects) {
                    if (!objectId || o.id === objectId) {
                        targetObj = o;
                        break;
                    }
                }
                if (targetObj) break;
            }
            if (!targetObj) {
                return this.rasterSelection(canvasId, "rect", {
                    x: Math.round(state.width * 0.15),
                    y: Math.round(state.height * 0.15),
                    width: Math.round(state.width * 0.7),
                    height: Math.round(state.height * 0.7)
                });
            }
            const bbox = this.computeObjectBoundingBox(targetObj, state);
            const mode = targetObj.kind === "circle" || targetObj.kind === "ellipse" ? "ellipse" : "rect";
            return this.rasterSelection(canvasId, mode, bbox);
        });
    }

    private transformRgbaBuffer(
        src: Buffer,
        width: number,
        height: number,
        op: "flip_h" | "flip_v" | "rotate_90_cw" | "rotate_90_ccw" | "rotate_180"
    ): { width: number; height: number; pixels: Buffer } {
        if (op === "flip_h") {
            const dst = Buffer.alloc(width * height * 4);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const sIdx = (y * width + x) * 4;
                    const dIdx = (y * width + (width - 1 - x)) * 4;
                    src.copy(dst, dIdx, sIdx, sIdx + 4);
                }
            }
            return { width, height, pixels: dst };
        }
        if (op === "flip_v") {
            const dst = Buffer.alloc(width * height * 4);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const sIdx = (y * width + x) * 4;
                    const dIdx = ((height - 1 - y) * width + x) * 4;
                    src.copy(dst, dIdx, sIdx, sIdx + 4);
                }
            }
            return { width, height, pixels: dst };
        }
        if (op === "rotate_180") {
            const dst = Buffer.alloc(width * height * 4);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const sIdx = (y * width + x) * 4;
                    const dIdx = ((height - 1 - y) * width + (width - 1 - x)) * 4;
                    src.copy(dst, dIdx, sIdx, sIdx + 4);
                }
            }
            return { width, height, pixels: dst };
        }
        const newW = height;
        const newH = width;
        const dst = Buffer.alloc(newW * newH * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const sIdx = (y * width + x) * 4;
                const nx = op === "rotate_90_cw" ? height - 1 - y : y;
                const ny = op === "rotate_90_cw" ? x : width - 1 - x;
                const dIdx = (ny * newW + nx) * 4;
                src.copy(dst, dIdx, sIdx, sIdx + 4);
            }
        }
        return { width: newW, height: newH, pixels: dst };
    }

    private transformVectorObjectsInPlace(
        objects: VectorObjectSpec[],
        width: number,
        height: number,
        op: "flip_h" | "flip_v" | "rotate_90_cw" | "rotate_90_ccw" | "rotate_180"
    ): void {
        const mapPt = (px: number, py: number) => {
            if (op === "flip_h") return { x: width - px, y: py };
            if (op === "flip_v") return { x: px, y: height - py };
            if (op === "rotate_180") return { x: width - px, y: height - py };
            if (op === "rotate_90_cw") return { x: height - py, y: px };
            return { x: py, y: width - px };
        };

        for (const obj of objects) {
            if (obj.points && obj.points.length > 0) {
                obj.points = obj.points.map(p => mapPt(p.x, p.y));
            }
            if (obj.kind === "line") {
                const p1 = mapPt(obj.x ?? 0, obj.y ?? 0);
                const p2 = mapPt(obj.x2 ?? 0, obj.y2 ?? 0);
                obj.x = p1.x;
                obj.y = p1.y;
                obj.x2 = p2.x;
                obj.y2 = p2.y;
            } else if (obj.kind === "circle" || obj.kind === "ellipse") {
                const c = mapPt(obj.x ?? 0, obj.y ?? 0);
                obj.x = c.x;
                obj.y = c.y;
                if (obj.kind === "ellipse" && (op === "rotate_90_cw" || op === "rotate_90_ccw")) {
                    const tmp = obj.rx;
                    obj.rx = obj.ry;
                    obj.ry = tmp;
                }
            } else {
                const ow = obj.width ?? 0;
                const oh = obj.height ?? 0;
                const ox = obj.x ?? 0;
                const oy = obj.y ?? 0;
                if (op === "flip_h") {
                    obj.x = width - (ox + ow);
                } else if (op === "flip_v") {
                    obj.y = height - (oy + oh);
                } else if (op === "rotate_180") {
                    obj.x = width - (ox + ow);
                    obj.y = height - (oy + oh);
                } else if (op === "rotate_90_cw") {
                    obj.x = height - (oy + oh);
                    obj.y = ox;
                    obj.width = oh;
                    obj.height = ow;
                } else if (op === "rotate_90_ccw") {
                    obj.x = oy;
                    obj.y = width - (ox + ow);
                    obj.width = oh;
                    obj.height = ow;
                }
            }
        }
    }

    /**
     * Transforms the entire image (all raster and vector layers) by flipping or rotating (GIMP `Image -> Transform`).
     */
    public transformCanvas(
        canvasId: string,
        op: "flip_h" | "flip_v" | "rotate_90_cw" | "rotate_90_ccw" | "rotate_180"
    ): ArtCanvasState {
        return this.withUndoGroup(canvasId, `Transform Image (${op})`, () => {
            const state = this.loadCanvas(canvasId);
            const oldW = state.width;
            const oldH = state.height;

            for (const layer of state.layers) {
                if (layer.type === "raster") {
                    const buf = this.loadRasterBuffer(state, layer.id, oldW, oldH);
                    const res = this.transformRgbaBuffer(buf, oldW, oldH, op);
                    this.saveRasterBuffer(state, layer.id, res.pixels);
                } else {
                    this.transformVectorObjectsInPlace(layer.objects, oldW, oldH, op);
                }
            }

            if (op === "rotate_90_cw" || op === "rotate_90_ccw") {
                state.width = oldH;
                state.height = oldW;
                state.selection = { mode: "none", inverted: false, x: 0, y: 0, width: state.width, height: state.height };
            }
            this.saveCanvas(state);
            return state;
        });
    }

    /**
     * Transforms a single active layer (GIMP `Layer -> Transform`).
     */
    public transformLayer(
        canvasId: string,
        layerId: string | undefined,
        op: "flip_h" | "flip_v" | "rotate_90_cw" | "rotate_90_ccw" | "rotate_180",
        sharedObjectId?: string
    ): ArtLayerSpec {
        return this.withUndoGroup(canvasId, `Transform Layer (${op})`, () => {
            const state = this.loadCanvas(canvasId);
            const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
            const layer = container.layers.find(l => l.id === layerId) || container.layers[0];
            if (!layer || layer.locked) {
                throw new Error("No unlocked layer available to transform.");
            }
            if (layer.type === "raster") {
                const buf = this.loadRasterBuffer(state, layer.id, container.width, container.height, undefined, sharedObjectId);
                const res = this.transformRgbaBuffer(buf, container.width, container.height, op);
                if (res.width === container.width && res.height === container.height) {
                    this.saveRasterBuffer(state, layer.id, res.pixels, undefined, sharedObjectId);
                } else {
                    const fitted = Buffer.alloc(container.width * container.height * 4, 0);
                    const ox = Math.floor((container.width - res.width) / 2);
                    const oy = Math.floor((container.height - res.height) / 2);
                    for (let y = 0; y < res.height; y++) {
                        for (let x = 0; x < res.width; x++) {
                            const dx = ox + x;
                            const dy = oy + y;
                            if (dx < 0 || dx >= container.width || dy < 0 || dy >= container.height) continue;
                            const sIdx = (y * res.width + x) * 4;
                            const dIdx = (dy * container.width + dx) * 4;
                            res.pixels.copy(fitted, dIdx, sIdx, sIdx + 4);
                        }
                    }
                    this.saveRasterBuffer(state, layer.id, fitted, undefined, sharedObjectId);
                }
            } else {
                this.transformVectorObjectsInPlace(layer.objects, container.width, container.height, op);
            }
            this.saveCanvas(state);
            return layer;
        });
    }

    /**
     * Offsets a layer's pixels or vector objects by `(dx, dy)` with optional wrap-around (GIMP `Layer -> Transform -> Offset`).
     */
    public offsetLayer(
        canvasId: string,
        layerId: string | undefined,
        dx: number,
        dy: number,
        wrapAround = true,
        sharedObjectId?: string
    ): ArtLayerSpec {
        return this.withUndoGroup(canvasId, `Offset Layer (${dx}, ${dy})`, () => {
            const state = this.loadCanvas(canvasId);
            const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
            const layer = container.layers.find(l => l.id === layerId) || container.layers[0];
            if (!layer || layer.locked) {
                throw new Error("No unlocked layer available to offset.");
            }
            const shiftX = Math.round(dx);
            const shiftY = Math.round(dy);

            if (layer.type === "raster") {
                const src = this.loadRasterBuffer(state, layer.id, container.width, container.height, undefined, sharedObjectId);
                const dst = Buffer.alloc(container.width * container.height * 4, 0);
                const w = container.width;
                const h = container.height;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        let nx = x + shiftX;
                        let ny = y + shiftY;
                        if (wrapAround) {
                            nx = ((nx % w) + w) % w;
                            ny = ((ny % h) + h) % h;
                        } else if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
                            continue;
                        }
                        const sIdx = (y * w + x) * 4;
                        const dIdx = (ny * w + nx) * 4;
                        src.copy(dst, dIdx, sIdx, sIdx + 4);
                    }
                }
                this.saveRasterBuffer(state, layer.id, dst, undefined, sharedObjectId);
            } else {
                for (const obj of layer.objects) {
                    if (obj.x !== undefined) obj.x += shiftX;
                    if (obj.y !== undefined) obj.y += shiftY;
                    if (obj.x2 !== undefined) obj.x2 += shiftX;
                    if (obj.y2 !== undefined) obj.y2 += shiftY;
                    if (obj.points) {
                        obj.points = obj.points.map(p => ({ x: p.x + shiftX, y: p.y + shiftY }));
                    }
                }
            }
            this.saveCanvas(state);
            return layer;
        });
    }

    /**
     * Resizes the canvas boundary while keeping existing layer content placed at `(offsetX, offsetY)` (GIMP `Image -> Canvas Size`).
     */
    public resizeCanvas(
        canvasId: string,
        newWidth: number,
        newHeight: number,
        offsetX = 0,
        offsetY = 0,
        backgroundColor?: string
    ): ArtCanvasState {
        return this.withUndoGroup(canvasId, `Canvas Size (${newWidth}×${newHeight})`, () => {
            const state = this.loadCanvas(canvasId);
            const oldW = state.width;
            const oldH = state.height;
            const targetW = Math.max(16, Math.min(4096, Math.round(newWidth)));
            const targetH = Math.max(16, Math.min(4096, Math.round(newHeight)));
            const ox = Math.round(offsetX);
            const oy = Math.round(offsetY);

            for (const layer of state.layers) {
                if (layer.type === "raster") {
                    const src = this.loadRasterBuffer(state, layer.id, oldW, oldH);
                    const dst = Buffer.alloc(targetW * targetH * 4, 0);
                    for (let y = 0; y < oldH; y++) {
                        for (let x = 0; x < oldW; x++) {
                            const dx = x + ox;
                            const dy = y + oy;
                            if (dx < 0 || dx >= targetW || dy < 0 || dy >= targetH) continue;
                            const sIdx = (y * oldW + x) * 4;
                            const dIdx = (dy * targetW + dx) * 4;
                            src.copy(dst, dIdx, sIdx, sIdx + 4);
                        }
                    }
                    this.saveRasterBuffer(state, layer.id, dst);
                } else if (ox !== 0 || oy !== 0) {
                    for (const obj of layer.objects) {
                        if (obj.x !== undefined) obj.x += ox;
                        if (obj.y !== undefined) obj.y += oy;
                        if (obj.x2 !== undefined) obj.x2 += ox;
                        if (obj.y2 !== undefined) obj.y2 += oy;
                        if (obj.points) {
                            obj.points = obj.points.map(p => ({ x: p.x + ox, y: p.y + oy }));
                        }
                    }
                }
            }

            state.width = targetW;
            state.height = targetH;
            if (backgroundColor) state.backgroundColor = backgroundColor;
            state.selection = { mode: "none", inverted: false, x: 0, y: 0, width: targetW, height: targetH };
            this.saveCanvas(state);
            return state;
        });
    }

    /**
     * Scales the entire image (all raster pixels & vector coordinates) proportionally (GIMP `Image -> Scale Image`).
     */
    public scaleCanvas(canvasId: string, newWidth: number, newHeight: number): ArtCanvasState {
        return this.withUndoGroup(canvasId, `Scale Image (${newWidth}×${newHeight})`, () => {
            const state = this.loadCanvas(canvasId);
            const oldW = state.width;
            const oldH = state.height;
            const targetW = Math.max(16, Math.min(4096, Math.round(newWidth)));
            const targetH = Math.max(16, Math.min(4096, Math.round(newHeight)));
            const sx = targetW / Math.max(1, oldW);
            const sy = targetH / Math.max(1, oldH);

            for (const layer of state.layers) {
                if (layer.type === "raster") {
                    const src = this.loadRasterBuffer(state, layer.id, oldW, oldH);
                    const dst = Buffer.alloc(targetW * targetH * 4, 0);
                    for (let y = 0; y < targetH; y++) {
                        const srcY = Math.min(oldH - 1, Math.floor(y / sy));
                        for (let x = 0; x < targetW; x++) {
                            const srcX = Math.min(oldW - 1, Math.floor(x / sx));
                            const sIdx = (srcY * oldW + srcX) * 4;
                            const dIdx = (y * targetW + x) * 4;
                            src.copy(dst, dIdx, sIdx, sIdx + 4);
                        }
                    }
                    this.saveRasterBuffer(state, layer.id, dst);
                } else {
                    for (const obj of layer.objects) {
                        if (obj.x !== undefined) obj.x = Math.round(obj.x * sx);
                        if (obj.y !== undefined) obj.y = Math.round(obj.y * sy);
                        if (obj.width !== undefined) obj.width = Math.max(2, Math.round(obj.width * sx));
                        if (obj.height !== undefined) obj.height = Math.max(2, Math.round(obj.height * sy));
                        if (obj.r !== undefined) obj.r = Math.max(2, Math.round(obj.r * ((sx + sy) / 2)));
                        if (obj.rx !== undefined) obj.rx = Math.max(2, Math.round(obj.rx * sx));
                        if (obj.ry !== undefined) obj.ry = Math.max(2, Math.round(obj.ry * sy));
                        if (obj.x2 !== undefined) obj.x2 = Math.round(obj.x2 * sx);
                        if (obj.y2 !== undefined) obj.y2 = Math.round(obj.y2 * sy);
                        if (obj.points) {
                            obj.points = obj.points.map(p => ({ x: Math.round(p.x * sx), y: Math.round(p.y * sy) }));
                        }
                    }
                }
            }

            state.width = targetW;
            state.height = targetH;
            state.selection = { mode: "none", inverted: false, x: 0, y: 0, width: targetW, height: targetH };
            this.saveCanvas(state);
            return state;
        });
    }

    /**
     * Crops the canvas to the active selection bounds (GIMP `Image -> Crop to Selection`).
     */
    public cropCanvasToSelection(canvasId: string): ArtCanvasState {
        const state = this.loadCanvas(canvasId);
        const sel = state.selection;
        if (!sel || sel.mode === "none" || sel.width < 4 || sel.height < 4) {
            return state;
        }
        return this.resizeCanvas(canvasId, sel.width, sel.height, -sel.x, -sel.y);
    }

    /**
     * Crops the canvas to the bounding box of all non-empty raster & vector content (GIMP `Image -> Crop to Content`).
     */
    public cropCanvasToContent(canvasId: string): ArtCanvasState {
        const state = this.loadCanvas(canvasId);
        let minX = state.width;
        let minY = state.height;
        let maxX = 0;
        let maxY = 0;

        for (const layer of state.layers) {
            if (!layer.visible) continue;
            if (layer.type === "vector") {
                for (const obj of layer.objects) {
                    const bb = this.computeObjectBoundingBox(obj, state);
                    minX = Math.min(minX, bb.x);
                    minY = Math.min(minY, bb.y);
                    maxX = Math.max(maxX, bb.x + bb.width);
                    maxY = Math.max(maxY, bb.y + bb.height);
                }
            } else {
                const buf = this.loadRasterBuffer(state, layer.id, state.width, state.height);
                const rbb = this.computeRasterBoundingBox(buf, state.width, state.height);
                if (rbb.width > 0 && rbb.height > 0) {
                    minX = Math.min(minX, rbb.x);
                    minY = Math.min(minY, rbb.y);
                    maxX = Math.max(maxX, rbb.x + rbb.width);
                    maxY = Math.max(maxY, rbb.y + rbb.height);
                }
            }
        }

        minX = Math.max(0, Math.floor(minX));
        minY = Math.max(0, Math.floor(minY));
        maxX = Math.min(state.width, Math.ceil(maxX));
        maxY = Math.min(state.height, Math.ceil(maxY));

        if (maxX <= minX || maxY <= minY) {
            return state;
        }
        return this.resizeCanvas(canvasId, Math.max(16, maxX - minX), Math.max(16, maxY - minY), -minX, -minY);
    }

    /**
     * Creates a new raster layer containing the composited visible canvas (GIMP `Layer -> New from Visible`).
     */
    public newLayerFromVisible(canvasId: string, sharedObjectId?: string): ArtLayerSpec {
        return this.withUndoGroup(canvasId, "New Layer from Visible", () => {
            const state = this.loadCanvas(canvasId);
            const comp = this.compositeCanvasFrame(state, { sharedObjectId });
            const created = this.createLayer(canvasId, "Visible Composite", "raster", { sharedObjectId });
            const updatedState = this.loadCanvas(canvasId);
            this.saveRasterBuffer(updatedState, created.id, Buffer.from(comp.pixels), undefined, sharedObjectId);
            this.saveCanvas(updatedState);
            return created;
        });
    }

    /**
     * Merges the specified layer down onto the layer directly below it (GIMP `Layer -> Merge Down`).
     */
    public mergeLayerDown(canvasId: string, layerId: string, sharedObjectId?: string): ArtLayerSpec {
        return this.withUndoGroup(canvasId, "Merge Layer Down", () => {
            const state = this.loadCanvas(canvasId);
            const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
            const idx = container.layers.findIndex(l => l.id === layerId);
            if (idx <= 0) {
                throw new Error("Cannot merge down: layer is already at the bottom of the stack.");
            }
            const upper = container.layers[idx];
            const lower = container.layers[idx - 1];

            if (upper.type === "vector" && lower.type === "vector") {
                lower.objects.push(...JSON.parse(JSON.stringify(upper.objects)));
                container.layers.splice(idx, 1);
                this.saveCanvas(state);
                return lower;
            }

            // Rasterize both into lower as a raster layer
            const w = container.width;
            const h = container.height;
            const lowerBuf = lower.type === "raster"
                ? this.loadRasterBuffer(state, lower.id, w, h, undefined, sharedObjectId)
                : this.renderLayerToBuffer(state, lower, 0);
            const upperBuf = upper.type === "raster"
                ? this.loadRasterBuffer(state, upper.id, w, h, undefined, sharedObjectId)
                : this.renderLayerToBuffer(state, upper, 0);

            for (let i = 0; i < w * h * 4; i += 4) {
                const effA = Math.round(upperBuf[i + 3] * upper.opacity);
                if (effA > 0) {
                    this.blendPixelInPlace(
                        lowerBuf,
                        i,
                        upperBuf[i],
                        upperBuf[i + 1],
                        upperBuf[i + 2],
                        effA,
                        upper.blendMode
                    );
                }
            }

            lower.type = "raster";
            lower.objects = [];
            this.saveRasterBuffer(state, lower.id, lowerBuf, undefined, sharedObjectId);
            container.layers.splice(idx, 1);
            this.saveCanvas(state);
            return lower;
        });
    }

    /**
     * Merges all visible layers into a single layer (GIMP `Image -> Merge Visible Layers`).
     */
    public mergeVisibleLayers(canvasId: string, sharedObjectId?: string): ArtLayerSpec {
        return this.withUndoGroup(canvasId, "Merge Visible Layers", () => {
            const state = this.loadCanvas(canvasId);
            const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
            const comp = this.compositeCanvasFrame(state, { sharedObjectId });
            const hiddenLayers = container.layers.filter(l => !l.visible);
            const mergedId = `layer_merged_${Date.now() % 10000}`;
            const mergedLayer: ArtLayerSpec = {
                id: mergedId,
                name: "Merged Visible",
                type: "raster",
                visible: true,
                locked: false,
                opacity: 1.0,
                blendMode: "normal",
                objects: []
            };
            container.layers = [...hiddenLayers, mergedLayer];
            this.saveRasterBuffer(state, mergedId, Buffer.from(comp.pixels), undefined, sharedObjectId);
            this.saveCanvas(state);
            return mergedLayer;
        });
    }

    /**
     * Flattens all layers into a single opaque raster layer with the canvas background color (GIMP `Image -> Flatten Image`).
     */
    public flattenImage(canvasId: string): ArtLayerSpec {
        return this.withUndoGroup(canvasId, "Flatten Image", () => {
            const state = this.loadCanvas(canvasId);
            const comp = this.compositeCanvasFrame(state);
            const bg = parseColor(state.backgroundColor === "transparent" ? "#ffffff" : state.backgroundColor);
            const flatBuf = Buffer.alloc(state.width * state.height * 4);
            for (let i = 0; i < flatBuf.length; i += 4) {
                flatBuf[i] = bg.r;
                flatBuf[i + 1] = bg.g;
                flatBuf[i + 2] = bg.b;
                flatBuf[i + 3] = 255;
                if (comp.pixels[i + 3] > 0) {
                    this.blendPixelInPlace(
                        flatBuf,
                        i,
                        comp.pixels[i],
                        comp.pixels[i + 1],
                        comp.pixels[i + 2],
                        comp.pixels[i + 3],
                        "normal"
                    );
                }
                flatBuf[i + 3] = 255;
            }
            const flatId = "layer_flattened";
            const flatLayer: ArtLayerSpec = {
                id: flatId,
                name: "Flattened Image",
                type: "raster",
                visible: true,
                locked: false,
                opacity: 1.0,
                blendMode: "normal",
                objects: []
            };
            state.layers = [flatLayer];
            this.saveRasterBuffer(state, flatId, flatBuf);
            this.saveCanvas(state);
            return flatLayer;
        });
    }

    /**
     * Executes GIMP `Colors` menu operations (`desaturate`, `sepia`, `equalize`, `white_balance`, `posterize`, `colorize`, `color_balance`, `hue_saturation`, `color_to_alpha`, `remove_alpha`).
     */
    public adjustLayerColors(
        canvasId: string,
        layerId: string | undefined,
        op:
            | "desaturate"
            | "sepia"
            | "equalize"
            | "white_balance"
            | "posterize"
            | "colorize"
            | "color_balance"
            | "hue_saturation"
            | "color_to_alpha"
            | "remove_alpha",
        params: Record<string, any> = {},
        sharedObjectId?: string
    ): { layerId: string; operation: string } {
        return this.withUndoGroup(canvasId, `Color: ${op}`, () => {
            const state = this.loadCanvas(canvasId);
            const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
            const layer = this.findLayer(state, layerId, "raster", sharedObjectId);
            const buf = this.loadRasterBuffer(state, layer.id, container.width, container.height, undefined, sharedObjectId);

            let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
            if (op === "white_balance" || op === "equalize") {
                for (let i = 0; i < buf.length; i += 4) {
                    if (buf[i + 3] === 0) continue;
                    minR = Math.min(minR, buf[i]); maxR = Math.max(maxR, buf[i]);
                    minG = Math.min(minG, buf[i + 1]); maxG = Math.max(maxG, buf[i + 1]);
                    minB = Math.min(minB, buf[i + 2]); maxB = Math.max(maxB, buf[i + 2]);
                }
            }

            const levels = Math.max(2, Math.min(64, Number(params.levels) || 4));
            const tintColor = parseColor(params.color || "#00d4ff");
            const alphaTarget = parseColor(params.targetColor || "#ffffff");
            const cyanRed = Number(params.cyanRed) || 0;
            const magentaGreen = Number(params.magentaGreen) || 0;
            const yellowBlue = Number(params.yellowBlue) || 0;
            const satMult = 1 + (Number(params.saturation) || 0) / 100;
            const lightDelta = Number(params.lightness) || 0;

            for (let py = 0; py < container.height; py++) {
                for (let px = 0; px < container.width; px++) {
                    if (!sharedObjectId && !this.isPointSelected(state.selection, px, py)) continue;
                    const idx = (py * container.width + px) * 4;
                    let r = buf[idx];
                    let g = buf[idx + 1];
                    let b = buf[idx + 2];
                    let a = buf[idx + 3];

                    if (op === "remove_alpha") {
                        const bg = parseColor(state.backgroundColor === "transparent" ? "#ffffff" : state.backgroundColor);
                        const af = a / 255;
                        buf[idx] = Math.round(r * af + bg.r * (1 - af));
                        buf[idx + 1] = Math.round(g * af + bg.g * (1 - af));
                        buf[idx + 2] = Math.round(b * af + bg.b * (1 - af));
                        buf[idx + 3] = 255;
                        continue;
                    }

                    if (a === 0) continue;

                    if (op === "desaturate") {
                        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                        r = g = b = lum;
                    } else if (op === "sepia") {
                        const nr = Math.min(255, Math.round(r * 0.393 + g * 0.769 + b * 0.189));
                        const ng = Math.min(255, Math.round(r * 0.349 + g * 0.686 + b * 0.168));
                        const nb = Math.min(255, Math.round(r * 0.272 + g * 0.534 + b * 0.131));
                        r = nr; g = ng; b = nb;
                    } else if (op === "white_balance" || op === "equalize") {
                        if (maxR > minR) r = Math.round(((r - minR) / (maxR - minR)) * 255);
                        if (maxG > minG) g = Math.round(((g - minG) / (maxG - minG)) * 255);
                        if (maxB > minB) b = Math.round(((b - minB) / (maxB - minB)) * 255);
                    } else if (op === "posterize") {
                        const step = 255 / (levels - 1);
                        r = Math.round(Math.round(r / step) * step);
                        g = Math.round(Math.round(g / step) * step);
                        b = Math.round(Math.round(b / step) * step);
                    } else if (op === "colorize") {
                        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                        r = Math.min(255, Math.round(tintColor.r * lum));
                        g = Math.min(255, Math.round(tintColor.g * lum));
                        b = Math.min(255, Math.round(tintColor.b * lum));
                    } else if (op === "color_balance") {
                        r = Math.max(0, Math.min(255, Math.round(r + cyanRed)));
                        g = Math.max(0, Math.min(255, Math.round(g + magentaGreen)));
                        b = Math.max(0, Math.min(255, Math.round(b + yellowBlue)));
                    } else if (op === "hue_saturation") {
                        const avg = (r + g + b) / 3;
                        r = Math.max(0, Math.min(255, Math.round(avg + (r - avg) * satMult + lightDelta)));
                        g = Math.max(0, Math.min(255, Math.round(avg + (g - avg) * satMult + lightDelta)));
                        b = Math.max(0, Math.min(255, Math.round(avg + (b - avg) * satMult + lightDelta)));
                    } else if (op === "color_to_alpha") {
                        const dist = Math.hypot(r - alphaTarget.r, g - alphaTarget.g, b - alphaTarget.b);
                        const tol = Number(params.tolerance) || 60;
                        if (dist <= tol) {
                            a = Math.round(a * (dist / Math.max(1, tol)));
                        }
                    }

                    buf[idx] = r;
                    buf[idx + 1] = g;
                    buf[idx + 2] = b;
                    buf[idx + 3] = a;
                }
            }

            this.saveRasterBuffer(state, layer.id, buf, undefined, sharedObjectId);
            this.saveCanvas(state);
            return { layerId: layer.id, operation: op };
        });
    }
}
