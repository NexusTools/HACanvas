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
    encodeToOraBuffer,
    parseOraBuffer,
    parsePsdBuffer,
    parseXcfBuffer,
    parseAiBuffer,
    type DecodedMultiLayerDocument
} from "./format-importers.js";
import { RasterFilterRegistry } from "./filters/abstract-raster-filter.js";

export { encodeRgbaToPng, decodePngToRgba };

const execFileAsync = promisify(execFile);

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "add" | "darken" | "lighten" | "addition" | "difference";
export type ArtBlendMode = BlendMode;

export interface RasterFilterParams {
    filterType: "gaussian_blur" | "sharpen" | "invert" | "threshold" | "brightness_contrast" | "drop_shadow";
    radius?: number;
    amount?: number;
    threshold?: number;
    brightness?: number;
    contrast?: number;
    offsetX?: number;
    offsetY?: number;
    color?: string;
    opacity?: number;
    frame?: number;
}

export interface RGBA {
    r: number;
    g: number;
    b: number;
    a: number; // 0..255
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface VectorObjectSpec {
    id: string;
    kind: "rect" | "ellipse" | "circle" | "polygon" | "star" | "line" | "path" | "text" | "boolean" | "ref";
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rx?: number;
    ry?: number;
    r?: number;
    x2?: number;
    y2?: number;
    points?: { x: number; y: number }[];
    sides?: number;
    innerRadius?: number;
    d?: string;
    closed?: boolean;
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    transform?: string;
    // Object Reference properties (when kind === "ref")
    refId?: string;
    scaleX?: number;
    scaleY?: number;
    rotation?: number; // degrees
    fillOverride?: string;
    strokeOverride?: string;
    // Boolean operation metadata (when kind === "boolean")
    booleanOp?: {
        operation: "union" | "difference" | "intersection" | "exclusion";
        shapeA: VectorObjectSpec;
        shapeB: VectorObjectSpec;
    };
}

export interface ArtLayerSpec {
    id: string;
    name: string;
    type: "vector" | "raster";
    visible: boolean;
    locked: boolean;
    opacity: number; // 0..1
    blendMode: BlendMode;
    objects: VectorObjectSpec[]; // used when type === "vector"
    celFrames?: number[];        // frame indices that have dedicated raster cel buffers when type === "raster"
}

/**
 * A Shared Object is an embeddable sub-canvas stored in its own `objects/<id>.xml` inside `.hacanvas`.
 * It has its own dimensions and its own layer stack (which can contain SVG vector elements,
 * graphical raster pixel layers, and nested `<ObjectRef>` references to other shared objects).
 */
export interface SharedObjectCanvasSpec {
    id: string;
    name: string;
    category?: string;
    width: number;
    height: number;
    layers: ArtLayerSpec[];
}

export interface ParsedSharedObjectCategory {
    category: string;
    displayName: string;
    fullPath: string;
    segments: string[];
}

/**
 * Parses slash-delimited category paths from a shared object's name (e.g. "UI/Icons/Star")
 * and/or an explicit `category` field, returning normalized category folders and display name.
 */
export function parseSharedObjectCategory(rawName: string, explicitCategory?: string): ParsedSharedObjectCategory {
    const cleanName = (rawName || "Untitled").trim().replace(/\\/g, "/");
    const cleanExplicit = (explicitCategory || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

    if (cleanName.includes("/")) {
        const parts = cleanName.split("/").map(p => p.trim()).filter(Boolean);
        const displayName = parts[parts.length - 1] || "Untitled";
        const pathCategory = parts.slice(0, -1).join("/");
        const finalCategory =
            !cleanExplicit || pathCategory === cleanExplicit || pathCategory.startsWith(`${cleanExplicit}/`)
                ? pathCategory
                : cleanExplicit;
        const segments = finalCategory ? finalCategory.split("/").filter(Boolean) : [];
        return {
            category: finalCategory || "Uncategorized",
            displayName,
            fullPath: finalCategory ? `${finalCategory}/${displayName}` : displayName,
            segments
        };
    }

    const finalCategory = cleanExplicit || "Uncategorized";
    const segments = cleanExplicit ? cleanExplicit.split("/").filter(Boolean) : [];
    return {
        category: finalCategory,
        displayName: cleanName,
        fullPath: cleanExplicit ? `${cleanExplicit}/${cleanName}` : cleanName,
        segments
    };
}

export type EasingMode = "linear" | "ease_in" | "ease_out" | "ease_in_out" | "step";

export interface AnimationKeyframeSpec {
    frame: number;
    value: number | string;
    easing?: EasingMode;
}

export interface AnimationTrackSpec {
    id: string;
    targetId: string; // ID of a VectorObjectSpec, ObjectRef, or ArtLayerSpec
    property: "x" | "y" | "width" | "height" | "r" | "scaleX" | "scaleY" | "rotation" | "opacity" | "fill" | "stroke" | "d";
    keyframes: AnimationKeyframeSpec[];
}

export interface AnimationTimelineSpec {
    fps: number;
    durationFrames: number;
    loop: boolean;
    tracks: AnimationTrackSpec[];
}

export interface SelectionMaskSpec {
    mode: "none" | "rect" | "ellipse";
    inverted: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ArtCanvasState {
    canvasId: string;
    width: number;
    height: number;
    dpi: number;
    backgroundColor: string;
    selection: SelectionMaskSpec;
    layers: ArtLayerSpec[];
    sharedObjects: Record<string, SharedObjectCanvasSpec>;
    animation: AnimationTimelineSpec;
    timeline: {
        fps: number;
        totalFrames: number;
        keyframes: Array<{ frame: number; targetId: string }>;
    };
}

export interface SnapshotOptions {
    canvasId: string;
    targetType?: "canvas" | "layer" | "object" | "shared_object" | "region" | "contact_sheet";
    targetId?: string;
    cropBox?: BoundingBox;
    frame?: number;
    onionSkin?: boolean;
    contactSheetFrames?: number[];
    includeGridOverlay?: boolean;
    highlightBoundingBoxes?: boolean;
}

export interface SnapshotResult {
    canvasId: string;
    targetType: "canvas" | "layer" | "object" | "shared_object" | "region" | "contact_sheet";
    targetId?: string;
    frame: number;
    width: number;
    height: number;
    mimeType: "image/png";
    base64: string;
    snapshotPath: string;
    boundingBox: BoundingBox;
}

export interface CanvasHistoryEntry {
    id: string;
    label: string;
    timestamp: number;
    sceneJson: string;
    rawFiles: Map<string, Buffer>;
}

const NAMED_COLORS: Record<string, RGBA> = {
    transparent: { r: 0, g: 0, b: 0, a: 0 },
    none: { r: 0, g: 0, b: 0, a: 0 },
    black: { r: 0, g: 0, b: 0, a: 255 },
    white: { r: 255, g: 255, b: 255, a: 255 },
    red: { r: 255, g: 0, b: 0, a: 255 },
    green: { r: 0, g: 128, b: 0, a: 255 },
    lime: { r: 0, g: 255, b: 0, a: 255 },
    blue: { r: 0, g: 0, b: 255, a: 255 },
    yellow: { r: 255, g: 255, b: 0, a: 255 },
    cyan: { r: 0, g: 255, b: 255, a: 255 },
    magenta: { r: 255, g: 0, b: 255, a: 255 },
    orange: { r: 255, g: 165, b: 0, a: 255 },
    purple: { r: 128, g: 0, b: 128, a: 255 },
    gray: { r: 128, g: 128, b: 128, a: 255 },
    grey: { r: 128, g: 128, b: 128, a: 255 },
    silver: { r: 192, g: 192, b: 192, a: 255 },
    gold: { r: 255, g: 215, b: 0, a: 255 },
    navy: { r: 0, g: 0, b: 128, a: 255 },
    teal: { r: 0, g: 128, b: 128, a: 255 },
    pink: { r: 255, g: 192, b: 203, a: 255 },
    brown: { r: 165, g: 42, b: 42, a: 255 }
};

export function parseColor(colorStr?: string): RGBA {
    if (!colorStr) return { r: 0, g: 0, b: 0, a: 0 };
    const clean = colorStr.trim().toLowerCase();
    if (NAMED_COLORS[clean]) {
        return { ...NAMED_COLORS[clean] };
    }
    if (clean.startsWith("#")) {
        const hex = clean.slice(1);
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
                a: 255
            };
        }
        if (hex.length === 4) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
                a: parseInt(hex[3] + hex[3], 16)
            };
        }
        if (hex.length === 6) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
                a: 255
            };
        }
        if (hex.length === 8) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
                a: parseInt(hex.slice(6, 8), 16)
            };
        }
    }
    const rgbaMatch = clean.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
    if (rgbaMatch) {
        const aVal = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
        return {
            r: Math.min(255, Math.max(0, parseInt(rgbaMatch[1], 10))),
            g: Math.min(255, Math.max(0, parseInt(rgbaMatch[2], 10))),
            b: Math.min(255, Math.max(0, parseInt(rgbaMatch[3], 10))),
            a: Math.min(255, Math.max(0, Math.round(aVal <= 1 ? aVal * 255 : aVal)))
        };
    }
    return { r: 0, g: 0, b: 0, a: 255 };
}

export function rgbaToHex(c: RGBA): string {
    const h = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0");
    return `#${h(c.r)}${h(c.g)}${h(c.b)}${h(c.a)}`;
}

const BITMAP_FONT_5X7: Record<string, number[]> = {
    A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
    C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
    D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
    E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
    F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
    G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
    H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
    J: [0x07, 0x02, 0x02, 0x02, 0x12, 0x12, 0x0c],
    K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
    M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
    N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
    Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
    R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
    S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
    T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
    W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
    X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
    Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
    Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
    "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
    "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
    "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
    "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
    "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
    "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
    "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
    "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
    "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
    "-": [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
    "_": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
    ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
    ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
    "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
    " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
};

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
    // 2. Animation Timeline, Keyframes, & Raster Cels
    // ============================================================================

    public configureAnimation(
        canvasId: string,
        opts: { fps?: number; durationFrames?: number; loop?: boolean }
    ): AnimationTimelineSpec {
        const state = this.loadCanvas(canvasId);
        if (opts.fps !== undefined) state.animation.fps = Math.max(1, Math.min(120, Math.round(opts.fps)));
        if (opts.durationFrames !== undefined) state.animation.durationFrames = Math.max(1, Math.round(opts.durationFrames));
        if (opts.loop !== undefined) state.animation.loop = Boolean(opts.loop);
        this.saveCanvas(state);
        return state.animation;
    }

    public configureTimeline(
        canvasId: string,
        opts: { fps?: number; totalFrames?: number; durationFrames?: number; loop?: boolean }
    ): AnimationTimelineSpec {
        return this.configureAnimation(canvasId, {
            fps: opts.fps,
            durationFrames: opts.totalFrames ?? opts.durationFrames,
            loop: opts.loop
        });
    }

    public setKeyframe(
        canvasId: string,
        targetIdOrSpec:
            | string
            | {
                  targetId: string;
                  frame: number;
                  easing?: string;
                  properties: Record<string, number | string>;
              },
        property?: AnimationTrackSpec["property"],
        frame?: number,
        value?: number | string,
        easing: EasingMode = "linear"
    ): AnimationTrackSpec {
        if (typeof targetIdOrSpec === "object") {
            let lastTrack: AnimationTrackSpec | undefined;
            for (const [propKey, propVal] of Object.entries(targetIdOrSpec.properties)) {
                lastTrack = this.setKeyframe(
                    canvasId,
                    targetIdOrSpec.targetId,
                    propKey as AnimationTrackSpec["property"],
                    targetIdOrSpec.frame,
                    propVal,
                    "linear"
                );
            }
            return lastTrack!;
        }
        const targetId = String(targetIdOrSpec);
        const prop = property!;
        const frm = frame ?? 0;
        const val = value ?? 0;
        const state = this.loadCanvas(canvasId);
        let track = state.animation.tracks.find(t => t.targetId === targetId && t.property === prop);
        if (!track) {
            track = {
                id: `track_${targetId}_${prop}`,
                targetId,
                property: prop,
                keyframes: []
            };
            state.animation.tracks.push(track);
        }

        const existingIdx = track.keyframes.findIndex(k => k.frame === frm);
        if (existingIdx !== -1) {
            track.keyframes[existingIdx] = { frame: frm, value: val, easing };
        } else {
            track.keyframes.push({ frame: frm, value: val, easing });
            track.keyframes.sort((a, b) => a.frame - b.frame);
        }

        if (frm + 1 > state.animation.durationFrames) {
            state.animation.durationFrames = frm + 1;
        }

        this.saveCanvas(state);
        return track;
    }

    private applyEasing(t: number, mode: EasingMode = "linear"): number {
        const clamped = Math.max(0, Math.min(1, t));
        if (mode === "step") return clamped < 1 ? 0 : 1;
        if (mode === "ease_in") return clamped * clamped;
        if (mode === "ease_out") return clamped * (2 - clamped);
        if (mode === "ease_in_out") {
            return clamped < 0.5 ? 2 * clamped * clamped : -1 + (4 - 2 * clamped) * clamped;
        }
        return clamped;
    }

    private evaluateTrackAtFrame(track: AnimationTrackSpec, frame: number): number | string | undefined {
        const kfs = track.keyframes;
        if (!kfs || kfs.length === 0) return undefined;
        if (frame <= kfs[0].frame) return kfs[0].value;
        if (frame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value;

        for (let i = 0; i < kfs.length - 1; i++) {
            const k0 = kfs[i];
            const k1 = kfs[i + 1];
            if (frame >= k0.frame && frame <= k1.frame) {
                const rawT = k1.frame === k0.frame ? 1 : (frame - k0.frame) / (k1.frame - k0.frame);
                const t = this.applyEasing(rawT, k0.easing || "linear");

                if (typeof k0.value === "number" && typeof k1.value === "number") {
                    return k0.value + (k1.value - k0.value) * t;
                }
                if (track.property === "fill" || track.property === "stroke") {
                    const c0 = parseColor(String(k0.value));
                    const c1 = parseColor(String(k1.value));
                    return rgbaToHex({
                        r: Math.round(c0.r + (c1.r - c0.r) * t),
                        g: Math.round(c0.g + (c1.g - c0.g) * t),
                        b: Math.round(c0.b + (c1.b - c0.b) * t),
                        a: Math.round(c0.a + (c1.a - c0.a) * t)
                    });
                }
                return t < 0.5 ? k0.value : k1.value;
            }
        }
        return kfs[kfs.length - 1].value;
    }

    private resolveAnimatedObject(state: ArtCanvasState, obj: VectorObjectSpec, frame: number = 0): VectorObjectSpec {
        const tracks = state.animation?.tracks?.filter(t => t.targetId === obj.id) || [];
        if (tracks.length === 0) return obj;
        const clone: VectorObjectSpec = JSON.parse(JSON.stringify(obj));
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

    private resolveAnimatedLayerOpacity(state: ArtCanvasState, layer: ArtLayerSpec, frame: number = 0): number {
        const tr = state.animation?.tracks?.find(t => t.targetId === layer.id && t.property === "opacity");
        if (!tr) return layer.opacity;
        const val = this.evaluateTrackAtFrame(tr, frame);
        return typeof val === "number" ? Math.max(0, Math.min(1, val)) : layer.opacity;
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
            width: spec.width ?? (spec.r ? spec.r * 2 : 100),
            height: spec.height ?? (spec.r ? spec.r * 2 : 100),
            rx: spec.rx,
            ry: spec.ry,
            r: spec.r,
            x2: spec.x2,
            y2: spec.y2,
            points: spec.points,
            sides: spec.sides,
            innerRadius: spec.innerRadius,
            fill: spec.fill ?? "#3b82f6",
            stroke: spec.stroke ?? "none",
            strokeWidth: spec.strokeWidth ?? 1,
            opacity: spec.opacity ?? 1,
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
            width: (spec.text || "").length * 6 * scale,
            height: 7 * scale,
            text: spec.text || "",
            fontFamily: spec.fontFamily || "sans-serif",
            fontSize,
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
                this.setPendingUndoLabel(canvasId, `Transform Object (${obj.kind})`);
                this.saveCanvas(state);
                return obj;
            }
        }
        throw new Error(`Vector object '${objectId}' not found on canvas '${canvasId}'.`);
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
            if (!layer.celFrames.includes(spec.frame)) layer.celFrames.push(spec.frame);
            if (spec.frame + 1 > state.animation.durationFrames) {
                state.animation.durationFrames = spec.frame + 1;
            }
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
            if (!layer.celFrames.includes(spec.frame)) layer.celFrames.push(spec.frame);
            if (spec.frame + 1 > state.animation.durationFrames) {
                state.animation.durationFrames = spec.frame + 1;
            }
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
            | "gaussian_blur"
            | "sharpen"
            | "invert"
            | "threshold"
            | "brightness_contrast"
            | "drop_shadow"
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
        const container = sharedObjectId ? this.getSharedObjectOrThrow(state, sharedObjectId) : state;
        const layer = this.findLayer(state, layerId, "raster", sharedObjectId);
        const src = this.loadRasterBuffer(state, layer.id, container.width, container.height, params.frame, sharedObjectId);
        const filterInstance = RasterFilterRegistry.getFilter(filterType);
        const dst = filterInstance.apply(
            src,
            container.width,
            container.height,
            state.selection,
            params,
            Boolean(sharedObjectId)
        );

        this.saveRasterBuffer(state, layer.id, dst, params.frame, sharedObjectId);
        this.setPendingUndoLabel(canvasId, `Filter (${filterInstance.displayName})`);
        this.saveCanvas(state);
        return { layerId: layer.id, filterType };
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

        if (obj.kind === "rect") {
            const x = obj.x ?? 0;
            const y = obj.y ?? 0;
            const w = obj.width ?? 100;
            const h = obj.height ?? 100;
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
     * `<ObjectRef>` instances and style overrides).
     */
    private renderSharedObjectToBuffer(
        state: ArtCanvasState,
        sharedObj: SharedObjectCanvasSpec,
        frame: number,
        visitedRefs: Set<string>,
        fillOverride?: string,
        strokeOverride?: string
    ): Buffer {
        const sw = sharedObj.width;
        const sh = sharedObj.height;
        const out = Buffer.alloc(sw * sh * 4, 0);
        if (visitedRefs.has(sharedObj.id)) return out;

        const nextVisited = new Set(visitedRefs);
        nextVisited.add(sharedObj.id);

        for (const layer of sharedObj.layers) {
            if (!layer.visible) continue;
            const layerOpacity = this.resolveAnimatedLayerOpacity(state, layer, frame);
            if (layerOpacity <= 0) continue;

            let layerBuf: Buffer;
            if (layer.type === "raster") {
                layerBuf = Buffer.from(this.loadRasterBuffer(state, layer.id, sw, sh, frame, sharedObj.id));
            } else {
                layerBuf = Buffer.alloc(sw * sh * 4, 0);
                for (const rawObj of layer.objects) {
                    const animObj = this.resolveAnimatedObject(state, rawObj, frame);
                    if (fillOverride && animObj.kind !== "ref") animObj.fill = fillOverride;
                    if (strokeOverride && animObj.kind !== "ref") animObj.stroke = strokeOverride;
                    this.renderVectorObjectToBuffer(state, animObj, layerBuf, sw, sh, frame, nextVisited, fillOverride, strokeOverride);
                }
            }

            for (let i = 0; i < sw * sh * 4; i += 4) {
                const sa = Math.round(layerBuf[i + 3] * layerOpacity);
                if (sa > 0) {
                    this.blendPixelInPlace(out, i, layerBuf[i], layerBuf[i + 1], layerBuf[i + 2], sa, layer.blendMode);
                }
            }
        }

        return out;
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
        inheritedStrokeOverride?: string
    ): void {
        const obj = this.resolveAnimatedObject(state, rawObj, frame);
        const objOpacity = obj.opacity ?? 1.0;

        // Handle `<ObjectRef>` (`kind === "ref"`) referencing a Shared Object sub-canvas
        if (obj.kind === "ref" && obj.refId) {
            const shared = state.sharedObjects[obj.refId];
            if (!shared || visitedRefs.has(obj.refId)) return;

            const effFill = obj.fillOverride || inheritedFillOverride;
            const effStroke = obj.strokeOverride || inheritedStrokeOverride;
            const subBuf = this.renderSharedObjectToBuffer(state, shared, frame, visitedRefs, effFill, effStroke);

            const ox = obj.x ?? 0;
            const oy = obj.y ?? 0;
            const sx = obj.scaleX ?? 1.0;
            const sy = obj.scaleY ?? 1.0;
            const rotRad = ((obj.rotation ?? 0) * Math.PI) / 180;
            const cosR = Math.cos(-rotRad);
            const sinR = Math.sin(-rotRad);

            const destW = Math.max(1, Math.round(shared.width * Math.abs(sx)));
            const destH = Math.max(1, Math.round(shared.height * Math.abs(sy)));
            const pad = Math.ceil(Math.hypot(destW, destH));
            const minX = Math.max(0, Math.floor(ox - pad));
            const maxX = Math.min(width - 1, Math.ceil(ox + pad));
            const minY = Math.max(0, Math.floor(oy - pad));
            const maxY = Math.min(height - 1, Math.ceil(oy + pad));

            for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                    const dx = px - ox;
                    const dy = py - oy;
                    const rx = dx * cosR - dy * sinR;
                    const ry = dx * sinR + dy * cosR;
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
                                    const px = charX + colBit * scale + sx;
                                    const py = startY + row * scale + sy;
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
            this.drawSegmentOnBuffer(buf, width, height, x1, y1, x2, y2, col, Math.max(1, strokeWidth), objOpacity);
            return;
        }

        const bbox = this.computeObjectBoundingBox(obj, state);
        const pad = Math.ceil(strokeWidth + 2);
        const minX = Math.max(0, Math.floor(bbox.x - pad));
        const maxX = Math.min(width - 1, Math.ceil(bbox.x + bbox.width + pad));
        const minY = Math.max(0, Math.floor(bbox.y - pad));
        const maxY = Math.min(height - 1, Math.ceil(bbox.y + bbox.height + pad));

        if (fill.a > 0 && (inheritedFillOverride || obj.fill !== "none")) {
            const effA = Math.round(fill.a * objOpacity);
            for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                    if (this.isPointInVectorShape(obj, px, py)) {
                        const idx = (py * width + px) * 4;
                        this.blendPixelInPlace(buf, idx, fill.r, fill.g, fill.b, effA, "normal");
                    }
                }
            }
        }

        if (stroke.a > 0 && (inheritedStrokeOverride || obj.stroke !== "none") && strokeWidth > 0) {
            if (obj.kind === "rect") {
                const x = obj.x ?? 0;
                const y = obj.y ?? 0;
                const w = obj.width ?? 100;
                const h = obj.height ?? 100;
                this.drawSegmentOnBuffer(buf, width, height, x, y, x + w, y, stroke, strokeWidth, objOpacity);
                this.drawSegmentOnBuffer(buf, width, height, x + w, y, x + w, y + h, stroke, strokeWidth, objOpacity);
                this.drawSegmentOnBuffer(buf, width, height, x + w, y + h, x, y + h, stroke, strokeWidth, objOpacity);
                this.drawSegmentOnBuffer(buf, width, height, x, y + h, x, y, stroke, strokeWidth, objOpacity);
            } else if (obj.kind === "circle" || obj.kind === "ellipse") {
                const rx = obj.kind === "circle" ? (obj.r ?? (obj.width ? obj.width / 2 : 50)) : (obj.rx ?? (obj.width ? obj.width / 2 : 50));
                const ry = obj.kind === "circle" ? rx : (obj.ry ?? (obj.height ? obj.height / 2 : 50));
                const cx = obj.x ?? rx;
                const cy = obj.y ?? ry;
                const steps = Math.max(36, Math.ceil(Math.max(rx, ry) * 2));
                for (let i = 0; i < steps; i++) {
                    const a0 = (i * Math.PI * 2) / steps;
                    const a1 = ((i + 1) * Math.PI * 2) / steps;
                    this.drawSegmentOnBuffer(
                        buf, width, height,
                        cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry,
                        cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry,
                        stroke, strokeWidth, objOpacity
                    );
                }
            } else if (obj.points && obj.points.length >= 2) {
                for (let i = 0; i < obj.points.length - 1; i++) {
                    this.drawSegmentOnBuffer(
                        buf, width, height,
                        obj.points[i].x, obj.points[i].y,
                        obj.points[i + 1].x, obj.points[i + 1].y,
                        stroke, strokeWidth, objOpacity
                    );
                }
                if (obj.closed || obj.kind === "polygon" || obj.kind === "star") {
                    const last = obj.points[obj.points.length - 1];
                    const first = obj.points[0];
                    this.drawSegmentOnBuffer(buf, width, height, last.x, last.y, first.x, first.y, stroke, strokeWidth, objOpacity);
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
            return {
                x: Math.min(x1, x2),
                y: Math.min(y1, y2),
                width: Math.max(1, Math.abs(x2 - x1)),
                height: Math.max(1, Math.abs(y2 - y1))
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
            width: Math.max(1, Math.round(obj.width ?? 100)),
            height: Math.max(1, Math.round(obj.height ?? 100))
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

    private renderLayerToBuffer(state: ArtCanvasState, layer: ArtLayerSpec, frame: number = 0): Buffer {
        if (layer.type === "raster") {
            return Buffer.from(this.loadRasterBuffer(state, layer.id, state.width, state.height, frame));
        }
        const buf = Buffer.alloc(state.width * state.height * 4, 0);
        for (const obj of layer.objects) {
            this.renderVectorObjectToBuffer(state, obj, buf, state.width, state.height, frame);
        }
        return buf;
    }

    public renderCompositeFrameBuffer(state: ArtCanvasState, frame: number = 0): Buffer {
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

            const layerBuf = this.renderLayerToBuffer(state, layer, frame);
            for (let i = 0; i < w * h * 4; i += 4) {
                const sa = Math.round(layerBuf[i + 3] * effOpacity);
                if (sa > 0) {
                    this.blendPixelInPlace(
                        composite,
                        i,
                        layerBuf[i],
                        layerBuf[i + 1],
                        layerBuf[i + 2],
                        sa,
                        layer.blendMode
                    );
                }
            }
        }

        return composite;
    }

    public compositeCanvasFrame(
        state: ArtCanvasState,
        opts: { frame?: number; onionSkin?: boolean; sharedObjectId?: string } = {}
    ): { width: number; height: number; pixels: Buffer } {
        const frame = opts.frame ?? 0;
        if (opts.sharedObjectId && state.sharedObjects[opts.sharedObjectId]) {
            const shared = state.sharedObjects[opts.sharedObjectId];
            const pixels = this.renderSharedObjectToBuffer(state, shared, frame, new Set());
            return { width: shared.width, height: shared.height, pixels };
        }
        const pixels = this.renderCompositeFrameBuffer(state, frame);
        if (opts.onionSkin && frame > 0) {
            const prevBuf = this.renderCompositeFrameBuffer(state, frame - 1);
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
                const fBuf = this.renderCompositeFrameBuffer(state, fIdx);
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
            composite = this.renderSharedObjectToBuffer(state, shared, frame, new Set());
            targetBBox = this.computeRasterBoundingBox(composite, w, h);
        } else if (targetType === "canvas" || targetType === "region") {
            composite = this.renderCompositeFrameBuffer(state, frame);
            if (opts.onionSkin && frame > 0) {
                const prevBuf = this.renderCompositeFrameBuffer(state, frame - 1);
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
            composite = this.renderLayerToBuffer(state, layer, frame);
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
            this.renderVectorObjectToBuffer(state, foundObj, composite, w, h, frame);
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

    public inspectScene(canvasId: string): Record<string, any> {
        const state = this.loadCanvas(canvasId);
        const summarizeLayer = (layer: ArtLayerSpec, zIndex: number, w: number, h: number, sharedObjectId?: string) => {
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
                    objectCount: layer.objects.length,
                    objects: layer.objects.map(o => ({
                        id: o.id,
                        kind: o.kind,
                        refId: o.refId,
                        fill: o.fillOverride || o.fill,
                        stroke: o.strokeOverride || o.stroke,
                        strokeWidth: o.strokeWidth,
                        opacity: o.opacity,
                        boundingBox: this.computeObjectBoundingBox(o, state)
                    }))
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
                    celFrames: layer.celFrames || [0],
                    nonTransparentPixels,
                    coveragePercent: Math.round((nonTransparentPixels / (w * h)) * 10000) / 100,
                    contentBoundingBox: this.computeRasterBoundingBox(buf, w, h)
                };
            }
        };

        const sharedSummary: Record<string, any> = {};
        for (const [sId, sObj] of Object.entries(state.sharedObjects)) {
            sharedSummary[sId] = {
                id: sObj.id,
                name: sObj.name,
                width: sObj.width,
                height: sObj.height,
                layers: sObj.layers.map((l, idx) => summarizeLayer(l, idx, sObj.width, sObj.height, sObj.id))
            };
        }

        return {
            canvasId: state.canvasId,
            width: state.width,
            height: state.height,
            dpi: state.dpi,
            backgroundColor: state.backgroundColor,
            selection: state.selection,
            layerCount: state.layers.length,
            layers: state.layers.map((l, idx) => summarizeLayer(l, idx, state.width, state.height)),
            sharedObjects: sharedSummary,
            animation: state.animation
        };
    }

    public inspectPixels(
        canvasId: string,
        x: number,
        y: number,
        width: number = 1,
        height: number = 1,
        layerId?: string,
        frame: number = 0
    ): Record<string, any> {
        const state = this.loadCanvas(canvasId);
        const w = state.width;
        const h = state.height;

        let buf: Buffer;
        if (layerId) {
            const layer = state.layers.find(l => l.id === layerId || l.name === layerId);
            if (!layer) throw new Error(`Layer '${layerId}' not found.`);
            buf = this.renderLayerToBuffer(state, layer, frame);
        } else {
            buf = this.renderCompositeFrameBuffer(state, frame);
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
                `opacity="${obj.opacity ?? 1}"`,
                obj.fillOverride ? `fillOverride="${escapeXml(obj.fillOverride)}"` : "",
                obj.strokeOverride ? `strokeOverride="${escapeXml(obj.strokeOverride)}"` : ""
            ].filter(Boolean).join(" ");
            return `${indent}<ObjectRef ${attrs} />`;
        }
        return `${indent}${this.vectorObjectToSvgElement(obj)}`;
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
            const baseAttrs = `id="${escapeXml(layer.id)}" name="${escapeXml(layer.name)}" type="${layer.type}" visible="${layer.visible}" locked="${layer.locked}" opacity="${layer.opacity}" blendMode="${layer.blendMode}"`;
            if (layer.type === "vector") {
                const childrenXml = layer.objects.map(o => this.serializeVectorObjectToXml(o, "      ")).join("\n");
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
     *   graphical pixel `<RasterMedia>`, and nested `<ObjectRef>` references)
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
            zipEntries[objXmlPath] = `<?xml version="1.0" encoding="UTF-8"?>
<SharedObject xmlns="http://schemas.aicore.local/hybrid-art/2026/main" id="${escapeXml(sObj.id)}" name="${escapeXml(sObj.name)}"${catAttr} width="${sObj.width}" height="${sObj.height}">
  <Layers>
${sLayersXml}
  </Layers>
</SharedObject>`;
            docRels.push({
                id: `rId_obj_${sObj.id}`,
                type: "http://schemas.aicore.local/hybrid-art/2026/relationships/sharedObject",
                target: `../${objXmlPath}`
            });
        }

        // 2. Serialize main canvas layers and animation into `canvas/document.xml`
        const mainLayersXml = this.serializeLayerListToXml(state, state.layers, zipEntries, docRels);
        const tracksXml = (state.animation?.tracks || []).map(tr => {
            const kfXml = tr.keyframes.map(k =>
                `      <Keyframe frame="${k.frame}" value="${escapeXml(k.value)}" valueType="${typeof k.value}" easing="${k.easing || "linear"}" />`
            ).join("\n");
            return `    <Track id="${escapeXml(tr.id)}" targetId="${escapeXml(tr.targetId)}" property="${escapeXml(tr.property)}">\n${kfXml}\n    </Track>`;
        }).join("\n");

        const sharedRefsManifest = sharedEntries.map(s =>
            `    <SharedObjectInclude id="${escapeXml(s.id)}" src="objects/${escapeXml(s.id)}.xml" />`
        ).join("\n");

        zipEntries["canvas/document.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<HybridCanvas xmlns="http://schemas.aicore.local/hybrid-art/2026/main" id="${escapeXml(state.canvasId)}" width="${state.width}" height="${state.height}" dpi="${state.dpi}" backgroundColor="${escapeXml(state.backgroundColor)}">
  <SharedObjects>
${sharedRefsManifest}
  </SharedObjects>
  <Layers>
${mainLayersXml}
  </Layers>
  <Animation fps="${state.animation.fps}" durationFrames="${state.animation.durationFrames}" loop="${state.animation.loop}">
${tracksXml}
  </Animation>
</HybridCanvas>`;

        // 3. Relationships (`_rels/.rels` and `canvas/_rels/document.xml.rels`) & `[Content_Types].xml`
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

    private parseXmlVectorElement(node: ParsedXmlNode, defaultIndex: number): VectorObjectSpec | null {
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
                rotation: parseFloat(a.rotation || "0"),
                opacity: parseFloat(getStyle("opacity", "1")!),
                fillOverride: a.fillOverride || getStyle("fill"),
                strokeOverride: a.strokeOverride || getStyle("stroke")
            };
        }

        const common = {
            id,
            fill: getStyle("fill", "#000000"),
            stroke: getStyle("stroke", "none"),
            strokeWidth: parseFloat(getStyle("stroke-width", "1")!),
            opacity: parseFloat(getStyle("opacity", "1")!),
            transform: a.transform
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
                y2: parseFloat(a.y2 || "100")
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
                width: txt.length * 6 * scale,
                height: 7 * scale
            };
        }
        if (tag === "g" && a["data-boolean-op"] && node.children.length >= 2) {
            const shapeA = this.parseXmlVectorElement(node.children[0], defaultIndex);
            const shapeB = this.parseXmlVectorElement(node.children[1], defaultIndex + 1);
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
            selection: { mode: "none", inverted: false, x: 0, y: 0, width, height },
            layers: [],
            sharedObjects: {},
            animation: { fps: 12, durationFrames: 1, loop: true, tracks: [] },
            timeline: { fps: 12, totalFrames: 1, keyframes: [] }
        };

        const dir = this.getCanvasDir(canvasId);
        fs.mkdirSync(dir, { recursive: true });

        const parseLayerNodes = (layerNodes: ParsedXmlNode[], targetW: number, targetH: number, sharedObjectId?: string): ArtLayerSpec[] => {
            const outLayers: ArtLayerSpec[] = [];
            for (const lNode of layerNodes) {
                if (lNode.tag !== "Layer") continue;
                const la = lNode.attrs;
                const lType = (la.type === "raster" ? "raster" : "vector") as "vector" | "raster";
                const layerSpec: ArtLayerSpec = {
                    id: la.id || `layer_${outLayers.length + 1}`,
                    name: la.name || la.id || `Layer ${outLayers.length + 1}`,
                    type: lType,
                    visible: la.visible !== "false",
                    locked: la.locked === "true",
                    opacity: parseFloat(la.opacity ?? "1"),
                    blendMode: (la.blendMode as BlendMode) || "normal",
                    objects: []
                };

                if (lType === "vector") {
                    lNode.children.forEach((cNode, idx) => {
                        const parsedObj = this.parseXmlVectorElement(cNode, idx + 1);
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
                state.sharedObjects[sId] = {
                    id: sId,
                    name: sCat.fullPath,
                    category: sCat.category,
                    width: sW,
                    height: sH,
                    layers: sLayers
                };
            }
        }

        // Parse main canvas `<Layers>` and `<Animation>`
        const mainLayersGroup = docNode.children.find(c => c.tag === "Layers");
        state.layers = parseLayerNodes(mainLayersGroup ? mainLayersGroup.children : [], width, height);

        const animNode = docNode.children.find(c => c.tag === "Animation");
        if (animNode) {
            state.animation.fps = parseInt(animNode.attrs.fps || "12", 10);
            state.animation.durationFrames = parseInt(animNode.attrs.durationFrames || "1", 10);
            state.animation.loop = animNode.attrs.loop !== "false";
            state.animation.tracks = [];
            for (const tNode of animNode.children) {
                if (tNode.tag !== "Track") continue;
                const keyframes: AnimationKeyframeSpec[] = tNode.children
                    .filter(k => k.tag === "Keyframe")
                    .map(k => ({
                        frame: parseInt(k.attrs.frame || "0", 10),
                        value: k.attrs.valueType === "number" ? parseFloat(k.attrs.value || "0") : (k.attrs.value || ""),
                        easing: (k.attrs.easing as EasingMode) || "linear"
                    }));
                state.animation.tracks.push({
                    id: tNode.attrs.id || `track_${state.animation.tracks.length + 1}`,
                    targetId: tNode.attrs.targetId || "",
                    property: (tNode.attrs.property as any) || "x",
                    keyframes
                });
            }
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

        // 6. Universal Image Format Decoder (PNG, BMP, TGA, PCX, ICO, PNM/PPM/PGM/PBM/PAM, Farbfeld, XBM, JPEG, WebP, TIFF)
        const decodedImg = decodeAnyImageToRgba(resolvedPath, fileBuf);
        const doc: DecodedMultiLayerDocument = {
            format: ext.replace(/^\./, "") || "image",
            width: decodedImg.width,
            height: decodedImg.height,
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
            sharedObjectsImported: 0
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
            if (tag === "defs") {
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
            const tfAttr = transforms.length > 0 ? ` transform="${transforms.join(" ")}"` : "";
            return `<use id="${escapeXml(obj.id)}" href="#${escapeXml(obj.refId)}" opacity="${obj.opacity ?? 1}"${tfAttr} />`;
        }
        const common = `id="${escapeXml(obj.id)}" fill="${escapeXml(obj.fill ?? "none")}" stroke="${escapeXml(obj.stroke ?? "none")}" stroke-width="${obj.strokeWidth ?? 1}" opacity="${obj.opacity ?? 1}"${obj.transform ? ` transform="${escapeXml(obj.transform)}"` : ""}`;
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
            return `<line ${common} x1="${obj.x ?? 0}" y1="${obj.y ?? 0}" x2="${obj.x2 ?? 100}" y2="${obj.y2 ?? 100}" />`;
        }
        if ((obj.kind === "polygon" || obj.kind === "star") && obj.points) {
            const ptsStr = obj.points.map(p => `${p.x},${p.y}`).join(" ");
            return `<polygon ${common} points="${ptsStr}" />`;
        }
        if (obj.kind === "path") {
            return `<path ${common} d="${escapeXml(obj.d || "")}" />`;
        }
        if (obj.kind === "text") {
            return `<text ${common} x="${obj.x ?? 0}" y="${obj.y ?? 16}" font-family="${escapeXml(obj.fontFamily || "sans-serif")}" font-size="${obj.fontSize ?? 16}">${escapeXml(obj.text || "")}</text>`;
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
        options: { frame?: number } = {}
    ): { outputPath: string; filePath: string; format: string; bytesWritten: number } {
        const knownFormats = new Set([
            "png", "svg", "gif", "bmp", "tga", "pcx", "ico", "cur",
            "ppm", "pnm", "ff", "farbfeld", "xbm", "ora", "jpg", "jpeg",
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

    private exportCanvasInternal(
        canvasId: string,
        outputPath: string,
        format?: string,
        options: { frame?: number } = {}
    ): { outputPath: string; format: string; bytesWritten: number } {
        const state = this.loadCanvas(canvasId);
        const resolvedPath = path.isAbsolute(outputPath)
            ? outputPath
            : path.join(this.projectRoot, outputPath.replace(/^[/\\]+/, ""));

        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        const ext = (format || path.extname(resolvedPath).replace(/^\./, "") || "png").toLowerCase();
        const frame = options.frame ?? 0;

        if (ext === "hacanvas" || ext === "aicz") {
            const saved = this.saveCanvasPackage(canvasId, resolvedPath);
            return { outputPath: saved.filePath, format: "hacanvas", bytesWritten: saved.bytesWritten };
        }

        if (ext === "svg") {
            const defsLines: string[] = [];
            for (const sObj of Object.values(state.sharedObjects)) {
                const sLayerElements: string[] = [];
                for (const l of sObj.layers) {
                    if (!l.visible) continue;
                    if (l.type === "vector") {
                        sLayerElements.push(...l.objects.map(o => "      " + this.vectorObjectToSvgElement(o)));
                    } else {
                        const rBuf = this.loadRasterBuffer(state, l.id, sObj.width, sObj.height, frame, sObj.id);
                        const b64 = encodeRgbaToPng(sObj.width, sObj.height, rBuf).toString("base64");
                        sLayerElements.push(`      <image id="${escapeXml(l.id)}" width="${sObj.width}" height="${sObj.height}" href="data:image/png;base64,${b64}" />`);
                    }
                }
                defsLines.push(`    <g id="${escapeXml(sObj.id)}" data-width="${sObj.width}" data-height="${sObj.height}">\n${sLayerElements.join("\n")}\n    </g>`);
            }

            const layerGroups: string[] = [];
            if (defsLines.length > 0) {
                layerGroups.push(`  <defs>\n${defsLines.join("\n")}\n  </defs>`);
            }
            if (state.backgroundColor && state.backgroundColor !== "transparent" && state.backgroundColor !== "none") {
                layerGroups.push(`  <rect id="background" width="${state.width}" height="${state.height}" fill="${escapeXml(state.backgroundColor)}" />`);
            }
            for (const layer of state.layers) {
                if (!layer.visible) continue;
                if (layer.type === "vector") {
                    const elems = layer.objects.map(o => "    " + this.vectorObjectToSvgElement(this.resolveAnimatedObject(state, o, frame))).join("\n");
                    layerGroups.push(`  <g id="${escapeXml(layer.id)}" inkscape:groupmode="layer" inkscape:label="${escapeXml(layer.name)}" opacity="${this.resolveAnimatedLayerOpacity(state, layer, frame)}">\n${elems}\n  </g>`);
                } else {
                    const layerSnap = this.captureSnapshot({ canvasId, targetType: "layer", targetId: layer.id, frame });
                    layerGroups.push(`  <image id="${escapeXml(layer.id)}" width="${state.width}" height="${state.height}" opacity="${this.resolveAnimatedLayerOpacity(state, layer, frame)}" href="data:image/png;base64,${layerSnap.base64}" />`);
                }
            }
            const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${state.width}" height="${state.height}" viewBox="0 0 ${state.width} ${state.height}">
${layerGroups.join("\n")}
</svg>`;
            fs.writeFileSync(resolvedPath, fullSvg, "utf8");
            return { outputPath: resolvedPath, format: "svg", bytesWritten: Buffer.byteLength(fullSvg, "utf8") };
        }

        if (ext === "gif") {
            const totalFrames = Math.max(1, state.animation.durationFrames);
            const delayMs = Math.round(1000 / Math.max(1, state.animation.fps));
            const frames = Array.from({ length: totalFrames }, (_, fIdx) => ({
                rgba: this.renderCompositeFrameBuffer(state, fIdx),
                delayMs
            }));
            const gifBuf = encodeFramesToAnimatedGif(state.width, state.height, frames);
            fs.writeFileSync(resolvedPath, gifBuf);
            return { outputPath: resolvedPath, format: "gif", bytesWritten: gifBuf.length };
        }

        if (ext === "sprite_sheet") {
            const snap = this.captureSnapshot({ canvasId, targetType: "contact_sheet" });
            const pngBuf = Buffer.from(snap.base64, "base64");
            fs.writeFileSync(resolvedPath, pngBuf);
            return { outputPath: resolvedPath, format: "sprite_sheet", bytesWritten: pngBuf.length };
        }

        if (ext === "ora") {
            const oraLayers = state.layers.map(l => ({
                name: l.name,
                visible: l.visible,
                opacity: l.opacity,
                blendMode: l.blendMode,
                rgba: this.renderLayerToBuffer(state, l, frame)
            }));
            const oraBuf = encodeToOraBuffer(state.width, state.height, oraLayers);
            fs.writeFileSync(resolvedPath, oraBuf);
            return { outputPath: resolvedPath, format: "ora", bytesWritten: oraBuf.length };
        }

        const compositeRgba = this.renderCompositeFrameBuffer(state, frame);

        if (ext === "bmp") {
            const bmpBuf = encodeRgbaToBmp(state.width, state.height, compositeRgba);
            fs.writeFileSync(resolvedPath, bmpBuf);
            return { outputPath: resolvedPath, format: "bmp", bytesWritten: bmpBuf.length };
        }
        if (ext === "tga") {
            const tgaBuf = encodeRgbaToTga(state.width, state.height, compositeRgba);
            fs.writeFileSync(resolvedPath, tgaBuf);
            return { outputPath: resolvedPath, format: "tga", bytesWritten: tgaBuf.length };
        }
        if (ext === "ppm" || ext === "pnm") {
            const ppmBuf = encodeRgbaToPpm(state.width, state.height, compositeRgba);
            fs.writeFileSync(resolvedPath, ppmBuf);
            return { outputPath: resolvedPath, format: ext, bytesWritten: ppmBuf.length };
        }
        if (ext === "ico" || ext === "cur") {
            const icoBuf = encodeRgbaToIco(state.width, state.height, compositeRgba);
            fs.writeFileSync(resolvedPath, icoBuf);
            return { outputPath: resolvedPath, format: ext, bytesWritten: icoBuf.length };
        }
        if (ext === "ff" || ext === "farbfeld") {
            const ffBuf = encodeRgbaToFarbfeld(state.width, state.height, compositeRgba);
            fs.writeFileSync(resolvedPath, ffBuf);
            return { outputPath: resolvedPath, format: "farbfeld", bytesWritten: ffBuf.length };
        }

        const pngBuf = encodeRgbaToPng(state.width, state.height, compositeRgba);

        if (ext === "jpg" || ext === "jpeg" || ext === "tiff" || ext === "tif") {
            if (process.platform === "win32") {
                const tmpPng = path.join(os.tmpdir(), `aicore_exp_${Date.now()}.png`);
                try {
                    fs.writeFileSync(tmpPng, pngBuf);
                    const fmtName = ext.startsWith("tif") ? "Tiff" : "Jpeg";
                    const psCmd = `Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${tmpPng.replace(/'/g, "''")}'); $img.Save('${resolvedPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::${fmtName}); $img.Dispose()`;
                    execFileSync("powershell.exe", ["-NoProfile", "-Command", psCmd], { timeout: 10000 });
                    fs.unlinkSync(tmpPng);
                    if (fs.existsSync(resolvedPath)) {
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
        undoList: Array<{ id: string; label: string; timestamp: number }>;
        redoList: Array<{ id: string; label: string; timestamp: number }>;
        currentLabel: string;
    } {
        const uStack = this.undoStacks.get(canvasId) || [];
        const rStack = this.redoStacks.get(canvasId) || [];
        const current = this.lastCommittedState.get(canvasId);
        return {
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
