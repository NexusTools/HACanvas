import type {
    DocumentMetadataSpec,
    EmbeddedFontSpec,
    IcoIconFormatBpp
} from "./document-metadata-types.js";
import type { GimpFilterPreset } from "../filters/runtime/gimp-js-internal-docs.js";
import type { RasterBlendPreset } from "../transitions/transition-types.js";

export interface IcoLayerExportOption {
    layerId: string;
    /** Whether to include this layer as an icon entry in the .ico file (default true) */
    include?: boolean;
    /** Bits per pixel for this layer's icon entry: 32, 24, 8, 4, or 1 (default 32) */
    bpp?: IcoIconFormatBpp;
    /** Whether to store this layer's icon entry as a compressed PNG stream (GIMP "Compressed (PNG)") */
    compressed?: boolean;
    /** Optional target width override (1..256, 0 = use canvas width) */
    width?: number;
    /** Optional target height override (1..256, 0 = use canvas height) */
    height?: number;
    /** Optional alpha threshold (0..255, default 128) for 1-bit alpha modes */
    alphaThreshold?: number;
}

export interface ExportCanvasOptions {
    frame?: number;
    // PNG options
    compressionLevel?: number;
    pixelFormat?: "rgba8" | "rgb8" | "gray8" | "graya8";
    saveBackground?: boolean;
    saveResolution?: boolean;
    saveCreationTime?: boolean;
    comment?: string;
    // JPEG / WebP / TIFF options
    quality?: number; // 1..100
    backgroundColor?: string;
    progressive?: boolean;
    subsampling?: "4:4:4" | "4:2:2" | "4:2:0";
    // GIF options
    asAnimation?: boolean;
    layersAsFrames?: boolean;
    loop?: boolean;
    defaultDelayMs?: number;
    disposal?: "unspecified" | "combine" | "replace";
    dither?: boolean;
    // BMP options
    bmpBpp?: 16 | 24 | 32;
    topDown?: boolean;
    writeColorSpace?: boolean;
    // TGA options
    rle?: boolean;
    origin?: "bottom_left" | "top_left";
    tgaBpp?: 24 | 32;
    // PPM options
    dataFormatting?: "raw" | "ascii";
    // Farbfeld options
    applyGamma?: boolean;
    // SVG options
    exportScope?: "all" | "vector_only";
    includeBackground?: boolean;
    includeSharedDefs?: boolean;
    prettyPrint?: boolean;
    exportHiddenLayers?: boolean;
    // ORA options
    includeMergedComposite?: boolean;
    // Sprite Sheet options
    columns?: number;
    padding?: number;
    sourceMode?: "animation_frames" | "layers";
    // ICO options (GIMP-style per-layer icon format configuration)
    icoLayers?: IcoLayerExportOption[];
    icoExportHiddenLayers?: boolean;
    icoDefaultBpp?: IcoIconFormatBpp;
    icoDefaultCompressed?: boolean;
    // PDF options
    layersAsPages?: boolean;
    reversePageOrder?: boolean;
    embedFonts?: boolean;
    title?: string;
    author?: string;
    // Document Metadata override (automatically merged with state.metadata)
    metadata?: DocumentMetadataSpec;
}


export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "add" | "darken" | "lighten" | "addition" | "difference";
export type ArtBlendMode = BlendMode;

export interface RasterFilterParams {
    filterType: string;
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
    customCode?: string;
    [key: string]: any;
}

/**
 * Non-destructive dynamic filter attached to a layer, shared object, or vector object.
 */
export interface AttachedFilterSpec {
    id: string;
    filterType: string;
    name?: string;
    enabled: boolean;
    params: RasterFilterParams;
}

/**
 * Rendering context options for controlling dynamic filter preview vs. export and active object editing.
 */
export interface RenderFilterContextOptions {
    /** When true (e.g. during exportCanvas), attached filters are ALWAYS rendered regardless of preview toggles */
    forExport?: boolean;
    /** Override whether dynamic filters are previewed */
    previewFilters?: boolean;
    /** Object IDs currently being interactively edited (their attached filters are bypassed during editing) */
    editingObjectIds?: Set<string> | string[];
    /** Shared Object IDs currently being interactively edited (their attached filters are bypassed during editing) */
    editingSharedObjectIds?: Set<string> | string[];
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
    kind: "rect" | "ellipse" | "circle" | "polygon" | "star" | "line" | "path" | "text" | "boolean" | "ref" | "image";
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rx?: number;
    ry?: number;
    r?: number;
    x2?: number;
    y2?: number;
    /** Quadratic Bezier control point for curved lines (when kind === "line") */
    cx?: number;
    cy?: number;
    points?: { x: number; y: number }[];
    sides?: number;
    innerRadius?: number;
    d?: string;
    closed?: boolean;
    text?: string;
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
    transform?: string;
    /** Skew angles in degrees */
    skewX?: number;
    skewY?: number;
    /** Frame visibility range on timeline (inclusive) */
    startFrame?: number;
    endFrame?: number;
    // Raster Image Object properties (when kind === "image")
    imageDataUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
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
    /** Non-destructive dynamic filter stack attached directly to this object */
    attachedFilters?: AttachedFilterSpec[];
    /** Toggle all attached filters on/off for this object during viewport preview */
    filtersEnabled?: boolean;
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
    /** Default raster keyframe blending preset ID (e.g., "crossfade", "step_hold", "additive_glow", etc.) */
    rasterBlendPresetId?: string;
    /** Optional custom JavaScript blending code for this raster layer's keyframes */
    rasterBlendCustomCode?: string;
    /** Optional target raster layer ID to blend keyframes with (cross-layer keyframe blending) */
    rasterBlendTargetLayerId?: string;
    /** Optional target frame on `rasterBlendTargetLayerId` to blend towards */
    rasterBlendTargetFrame?: number;
    /** Optional easing mode for raster keyframe blending on this layer */
    rasterBlendEasing?: EasingMode;
    /** Optional cubic-Bezier control points [x1, y1, x2, y2] for raster keyframe blending on this layer */
    rasterBlendCurveControlPoints?: [number, number, number, number];
    /** Optional curve preset ID for raster keyframe blending on this layer */
    rasterBlendCurvePresetId?: string;
    offsetX?: number;
    offsetY?: number;
    startFrame?: number;
    endFrame?: number;
    /** Non-destructive dynamic filter stack attached to this layer (raster or vector) */
    attachedFilters?: AttachedFilterSpec[];
    /** Toggle all attached filters on/off for this layer during viewport preview (exporting still renders filters) */
    filtersEnabled?: boolean;
}

/**
 * A Shared Object is an embeddable sub-canvas stored in its own `objects/<id>.xml` inside `.hacanvas`.
 * It has its own dimensions, its own layer stack (which can contain SVG vector elements,
 * graphical raster pixel layers, and nested `<ObjectRef>` references to other shared objects),
 * and its own independent animation timeline (`animation`).
 */
export interface SharedObjectCanvasSpec {
    id: string;
    name: string;
    category?: string;
    width: number;
    height: number;
    layers: ArtLayerSpec[];
    animation?: AnimationTimelineSpec;
    /** Non-destructive dynamic filter stack attached to this shared object definition */
    attachedFilters?: AttachedFilterSpec[];
    /** Toggle all attached filters on/off for this shared object during viewport preview */
    filtersEnabled?: boolean;
}


export type EasingMode =
    | "linear"
    | "ease_in"
    | "ease_out"
    | "ease_in_out"
    | "ease_in_back"
    | "overshoot"
    | "snap"
    | "step"
    | "custom_bezier";

export interface AnimationKeyframeSpec {
    frame: number;
    /** Optional explicit end frame for this keyframe transition segment */
    endFrame?: number;
    value: number | string | { x: number; y: number }[];
    easing?: EasingMode;
    /** Cubic-Bezier control points [x1, y1, x2, y2] for custom curve interpolation */
    curveControlPoints?: [number, number, number, number];
    /** Optional preset ID from built-in or user-saved presets */
    curvePresetId?: string;
    /** Optional raster keyframe blending preset ID for this keyframe segment (when property === "rasterCel") */
    rasterBlendPresetId?: string;
    /** Optional custom JavaScript blending code for this keyframe segment */
    rasterBlendCustomCode?: string;
    /** Optional target raster layer ID to blend into across this keyframe segment */
    rasterBlendTargetLayerId?: string;
    /** Optional target frame on the target raster layer */
    rasterBlendTargetFrame?: number;
}

export type AnimatableProperty =
    | "x"
    | "y"
    | "x2"
    | "y2"
    | "cx"
    | "cy"
    | "width"
    | "height"
    | "r"
    | "rx"
    | "ry"
    | "scaleX"
    | "scaleY"
    | "rotation"
    | "skewX"
    | "skewY"
    | "opacity"
    | "fill"
    | "stroke"
    | "d"
    | "points"
    | "rasterCel";

export interface AnimationTrackSpec {
    id: string;
    targetId: string; // ID of a VectorObjectSpec, ObjectRef, or ArtLayerSpec
    property: AnimatableProperty;
    keyframes: AnimationKeyframeSpec[];
}

export interface AnimationTimelineSpec {
    fps: number;
    durationFrames: number;
    loop: boolean;
    /** Frame index to loop back to at the end of the timeline when loop is true (default 0) */
    loopBackToFrame?: number;
    tracks: AnimationTrackSpec[];
    customCurvePresets?: Array<{
        id: string;
        name: string;
        controlPoints: [number, number, number, number];
    }>;
    customRasterBlendPresets?: RasterBlendPreset[];
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
    embeddedFonts?: Record<string, EmbeddedFontSpec>;
    metadata?: DocumentMetadataSpec;
    customFilterPresets?: GimpFilterPreset[];
    /** Global toggle for previewing attached dynamic filters in the viewport (default: true). Exporting always renders filters. */
    previewDynamicFilters?: boolean;
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
    forExport?: boolean;
    previewFilters?: boolean;
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

