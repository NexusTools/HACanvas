# HACanvas Architecture & Scene Graph Guide

## 1. Design Philosophy

`HACanvas` unifies two traditionally separate 2D graphics paradigms—**pixel-based raster painting/filtering (GIMP)** and **retained-mode SVG vector geometry (Inkscape)**—within a single deterministic scene graph and Open Packaging ZIP+XML archive format (`.hacanvas`).

All subsystems are structured around clean abstract base class hierarchies:

| Base Class | Module | Responsibility |
| :--- | :--- | :--- |
| `AbstractImageCodec` | `src/codecs/abstract-codec.ts` | Magic-byte detection, multi-layer decoding, and binary encoding for `.hacanvas`, `.psd`, `.xcf`, `.ai`, `.svg`, `.ora`, `.png`, `.gif`, `.bmp`, `.tga`, `.pcx`, `.ico`, `.ppm`, and `.ff`. |
| `AbstractRasterFilter` | `src/filters/abstract-raster-filter.ts` | Selection-aware RGBA pixel buffer convolution, neighborhood sampling, and point-transfer filters (`GaussianBlurFilter`, `SharpenFilter`, `InvertFilter`, `ThresholdFilter`, `BrightnessContrastFilter`, `DropShadowFilter`). |
| `AbstractJsonStore<T>` | `src/storage/abstract-json-store.ts` | Atomic JSON configuration and catalog persistence in OS-standard user configuration directories (`HaEditorConfigManager`, `SharedObjectLibraryIndexStore`). |

---

## 2. Scene Graph Data Model (`ArtCanvasState`)

Every open canvas in `HybridArtEngine` is represented by an `ArtCanvasState` object:

```typescript
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
```

### 2.1 Unified Layer Stack (`ArtLayerSpec`)
A canvas (or Shared Object sub-canvas) contains an ordered array of `ArtLayerSpec` layers rendered bottom-to-top (`index 0` is the bottommost layer; `layers[layers.length - 1]` is the topmost layer):
- **Raster Layers (`type: "raster"`)**:
  - Backed by uncompressed 32-bit RGBA pixel buffers (`width * height * 4` bytes) for frame `0` plus optional per-frame cel buffers (`celFrames`).
- **Vector Layers (`type: "vector"`)**:
  - Backed by an ordered array of retained `VectorObjectSpec` nodes (`rect`, `circle`, `ellipse`, `polygon`, `star`, `line`, `path`, `text`, `group`, `boolean`, and `ref` for `<ObjectRef>` instances).

### 2.2 Categorized Shared Object Sub-Canvases (`SharedObjectCanvasSpec`)
Each Shared Object is an independent mini-canvas stored in `state.sharedObjects[objectId]`:
- Has its own `width`, `height`, `backgroundColor`, and `layers: ArtLayerSpec[]` (supporting both raster and vector layers).
- Organized into hierarchical folder trees via `parseSharedObjectCategory(name, category)` and `buildCategoryTree(items)` (e.g. `"UI/Badges/GoldStar"` -> category `"UI/Badges"`, display name `"GoldStar"`).
- Referenced any number of times by `<ObjectRef>` (`kind: "ref"`, `refId: objectId`) on the main canvas or nested inside other Shared Objects.
- Cycle detection prevents infinite recursion if Shared Object `A` references Shared Object `B` and `B` attempts to reference `A`.

---

## 3. Compositing Pipeline (`compositeCanvasFrame`)

When rendering any frame `f` of a canvas (or an isolated Shared Object sub-canvas):
1. **Background Fill**: Initializes an RGBA buffer of size `width × height × 4` filled with `backgroundColor`.
2. **Keyframe Evaluation**: Interpolates animated properties (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`, `fill`, `stroke`) at frame `f` across all `AnimationTrackSpec` tracks using the configured easing function (`linear`, `ease_in`, `ease_out`, `ease_in_out`, `step`).
3. **Onion-Skin Pass (Optional)**: If `onionSkin: true` and `f > 0`, composites frame `f - 1` at reduced alpha so animators can align motion.
4. **Layer-by-Layer Compositing**:
   - For each visible layer from bottom (`0`) to top (`layers.length - 1`):
     - **Raster Layer**: Loads the RGBA buffer for frame `f` (or base buffer) and blends each pixel using the layer's `blendMode` and `opacity`.
     - **Vector Layer**: Rasterizes each `VectorObjectSpec` (including recursive compositing of `<ObjectRef>` instances with affine transform & color overrides) into a layer buffer and blends it with the layer's `blendMode` and `opacity`.

---

## 4. Non-Destructive Multi-Step Undo / Redo Engine

`HybridArtEngine` maintains per-canvas undo and redo stacks (`undoStacks` and `redoStacks`) storing full scene + raster buffer snapshots (`CanvasHistoryEntry`):
- Every mutating operation records a descriptive action label (e.g., `"Draw Shape (star)"`, `"Paint Stroke (brush)"`, `"Filter (gaussian_blur)"`, `"Rotate 90° CW"`).
- Interactive drag operations use `beginUndoGroup(canvasId, label)` / `endUndoGroup(canvasId, label)` or `withUndoGroup(canvasId, label, fn)` so a continuous pointer drag records a single atomic undo step.
