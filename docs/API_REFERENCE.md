# HACanvas API Reference

## 1. `HybridArtEngine`

```typescript
import { HybridArtEngine } from "hacanvas";
const engine = new HybridArtEngine(projectRootDir);
```

### 1.1 Canvas & Document Lifecycle
- `createCanvas(canvasId, width?, height?, backgroundColor?, dpiOrLayers?): ArtCanvasState`
  Creates a new hybrid canvas with the specified dimensions and initial raster/vector layers.
- `hasCanvas(canvasId): boolean`
  Returns `true` if `canvasId` exists on disk.
- `loadCanvas(canvasId): ArtCanvasState`
  Loads and returns the current `ArtCanvasState` for `canvasId`.
- `deleteCanvas(canvasId): void`
  Deletes the canvas working directory and clears its undo/redo stacks.
- `saveCanvas(canvasId, filePath): { filePath, format: "hacanvas", bytesWritten, sharedObjectCount, layerCount }`
  Serializes the canvas and all Shared Objects into a `.hacanvas` ZIP+XML archive.
- `loadFromFile(canvasId, filePath, options?): ImportResult`
  Loads or imports `.hacanvas`, `.psd`, `.xcf`, `.ai`, `.svg`, `.ora`, `.png`, `.gif`, `.bmp`, `.tga`, `.pcx`, `.ico`, `.ppm`, or `.ff` into `canvasId`.
- `exportCanvas(canvasId, filePath, format?, options?): ExportResult`
  Exports the composited canvas or animation to `.hacanvas`, `.png`, `.svg`, `.gif`, `.ora`, `.bmp`, `.tga`, `.pcx`, `.ico`, `.ppm`, `.ff`, or `.spritesheet`.

### 1.2 Undo / Redo & History
- `undo(canvasId): { undone: boolean; label?: string; state: ArtCanvasState }`
- `redo(canvasId): { redone: boolean; label?: string; state: ArtCanvasState }`
- `canUndo(canvasId): boolean` / `canRedo(canvasId): boolean`
- `getUndoHistorySummary(canvasId): { undoStack: Array<{ label, timestamp }>; redoStack: Array<{ label, timestamp }> }`
- `clearUndoHistory(canvasId): void`
- `resetUndoHistory(canvasId, baseLabel?): void`
- `beginUndoGroup(canvasId, label): void` / `endUndoGroup(canvasId, label?): void`
- `withUndoGroup<T>(canvasId, label, fn): T`

### 1.3 Layer Management (`manageLayer`, `createLayer`, `modifyLayer`, `deleteLayer`)
- `manageLayer(canvasId, action, opts)`:
  - `action`: `"add" | "remove" | "duplicate" | "reorder" | "set_visibility" | "set_opacity" | "set_blend_mode" | "clear"`
- `mergeLayerDown(canvasId, layerId?, sharedObjectId?): ArtLayerSpec`
- `mergeVisibleLayers(canvasId, sharedObjectId?): ArtLayerSpec`
- `flattenImage(canvasId): ArtLayerSpec`
- `newLayerFromVisible(canvasId, sharedObjectId?): ArtLayerSpec`
- `transformLayer(canvasId, layerId, op, opts?)`:
  - `op`: `"flip_h" | "flip_v" | "rotate_90_cw" | "rotate_90_ccw" | "rotate_180" | "offset"`

### 1.4 Vector Tools (Inkscape / SVG Backend)
- `drawShape(canvasId, layerId, spec): VectorObjectSpec`
  Draws `rect`, `circle`, `ellipse`, `polygon`, `star`, or `line`.
- `drawPath(canvasId, layerId, spec): VectorObjectSpec`
  Draws a polyline, polygon, or cubic/quadratic Bezier path (`d` or `points`).
- `drawText(canvasId, layerId, spec): VectorObjectSpec`
  Places a vector `<text>` node with `fontFamily`, `fontSize`, `fill`, `stroke`.
- `modifyObject(canvasId, objectId, updates): VectorObjectSpec`
  Updates coordinates, dimensions, transform (`rotation`, `scaleX`, `scaleY`), or style (`fill`, `stroke`, `strokeWidth`, `opacity`, `fillOverride`, `strokeOverride`).
- `pathOperation(canvasId, operation, options): VectorObjectSpec`
  Executes Boolean CSG (`"union" | "difference" | "intersection" | "exclusion"`) or path geometry (`"simplify" | "offset"`).

### 1.5 Raster Tools & Filters (GIMP Pixel Backend)
- `rasterStroke(canvasId, layerId, spec)`
  Strokes along `points` with `tool: "brush" | "pencil" | "airbrush" | "eraser"`, `color`, `size`, `hardness`, `opacity`.
- `rasterFill(canvasId, layerId, spec)`
  Executes `fillType: "flood" | "linear_gradient" | "radial_gradient"`.
- `rasterSelection(canvasId, op, bounds?)`
  Creates or modifies selection masks (`"rect" | "ellipse" | "clear" | "invert"`).
- `modifySelectionBounds(canvasId, op, amountPx)`
  GIMP selection border modifiers (`"feather" | "grow" | "shrink" | "border"`).
- `rasterFilter(canvasId, layerId, params, frame?, sharedObjectId?)`
  Applies `"gaussian_blur" | "sharpen" | "invert" | "threshold" | "brightness_contrast" | "drop_shadow"`.
- `adjustLayerColors(canvasId, layerId, op, params, sharedObjectId?)`
  Applies `"levels" | "curves" | "hue_saturation" | "color_balance" | "posterize" | "desaturate" | "sepia" | "white_balance"`.

### 1.6 Shared Objects & Cross-Project Library
- `createSharedObject(canvasId, spec, initialLayers?): SharedObjectCanvasSpec`
- `instantiateObjectRef(canvasId, sharedObjectId, opts?): VectorObjectSpec`
- `SharedObjectLibrary`:
  - `listEntries(categoryFilter?): SharedObjectLibraryEntry[]`
  - `saveSharedObjectToLibrary(engine, canvasId, sharedObjectId, tags?): SharedObjectLibraryEntry`
  - `importIntoProject(entryId, engine, canvasId, opts?): { sharedObject, refObject? }`
  - `deleteEntry(entryId): boolean`

---

## 2. Registered Multi-Format Codecs (`ImageCodecRegistry`)

| Format ID | Extensions | Class | Capabilities |
| :--- | :--- | :--- | :--- |
| `hacanvas` | `.hacanvas`, `.haso` | `HaCanvasCodec` | Full read/write of layers, vectors, rasters, shared objects, animations |
| `psd` | `.psd` | `PsdCodec` | Adobe Photoshop layer stack, blend modes, opacity, RLE/raw channels |
| `xcf` | `.xcf` | `XcfCodec` | GIMP native layer hierarchy, tiles, channels, opacity |
| `ai` | `.ai` | `AiCodec` | Adobe Illustrator PostScript (`%!PS-Adobe`) & PDF/FlateDecode (`%PDF-`) with OCG layers, Bezier curves & text |
| `svg` | `.svg` | `SvgCodec` | Full SVG vector shape, path, group, and text import/export |
| `ora` | `.ora` | `OraCodec` | OpenRaster ZIP (`stack.xml` + `data/*.png`) import/export |
| `png` | `.png` | `PngCodec` | Lossless RGBA PNG read/write |
| `gif` | `.gif` | `GifCodec` | Static & multi-frame animated GIF read/write |
| `bmp` | `.bmp` | `BmpCodec` | 24/32-bit Windows Bitmap read/write |
| `tga` | `.tga` | `TgaCodec` | Truevision TGA read/write |
| `pcx` | `.pcx` | `PcxCodec` | ZSoft PCX RLE read/write |
| `ico` | `.ico` | `IcoCodec` | Windows Icon directory + PNG/BMP payload read/write |
| `ppm` | `.ppm`, `.pgm`, `.pbm` | `PpmCodec` | Netpbm P3/P6 read/write |
| `ff` | `.ff` | `FarbfeldCodec` | suckless Farbfeld 16-bit RGBA read/write |

---

## 3. Built-In AI Tooling (`HaCanvasAiSession`, `HaCanvasAiToolRegistry`, `LmStudioAiClient`)

All AI tooling lives directly in `hacanvas` (`src/ai/abstract-ai-tool.ts` and `src/ai/lm-studio-client.ts`) and is exported from the root `hacanvas` package so any project (`AICore`, `HAEditor`, or third-party applications) can add full AI support immediately.

### `HaCanvasAiSession`

Implements `HaCanvasAiContext` out-of-the-box:

```ts
const session = new HaCanvasAiSession(projectRoot, {
    engine?: HybridArtEngine,
    canvasId?: string,
    autoCreateCanvas?: boolean,
    defaultWidth?: number,
    defaultHeight?: number,
    defaultBackgroundColor?: string
});

// Execute any of the 26 AI tools by name:
const res = await session.executeTool("draw_vector_shape", {
    kind: "circle",
    x: 160,
    y: 120,
    r: 48,
    fill: "#00d4ff"
});

// Export OpenAI function-calling tool schemas for any LLM provider:
const toolsSchema = session.getOpenAiToolsSchema();
```

### `HaCanvasAiToolRegistry` (also aliased as `HaEditorAiToolRegistry`)

- `HaCanvasAiToolRegistry.getAllTools(): AbstractAiTool[]` — Returns all 26 AI tool instances across 10 categories (`inspect`, `canvas`, `layer`, `vector`, `raster`, `filter`, `shared_object`, `library`, `animation`, `file`).
- `HaCanvasAiToolRegistry.getTool(name: string): AbstractAiTool | undefined` — Looks up a tool by function name.
- `HaCanvasAiToolRegistry.getOpenAiToolsSchema(): OpenAiToolSchema[]` — Returns the OpenAI `tools` array for `/v1/chat/completions`.
- `HaCanvasAiToolRegistry.executeTool(name, state, args): Promise<any>` — Executes a tool against any `HaCanvasAiContext` (`HaCanvasAiSession` or `HAEditor`'s `EditorSessionState`).
- `HaCanvasAiToolRegistry.getLiveToolStatusLabel(name, partialArgs, rawArgsStr): string` — Formats a human-readable live status label while streaming partial JSON arguments.
- `HaCanvasAiToolRegistry.getCompletedToolStatusLabel(name, args, result): string` — Formats a human-readable summary label after execution.

### All 26 Built-In AI Tools

| Category | Tool Name | Description |
| :--- | :--- | :--- |
| `inspect` | `inspect_canvas_status` | Inspects canvas dimensions, active editing mode, active layer, selection, and tool options. |
| `inspect` | `inspect_scene_graph` | Inspects all layers, vector objects, bounding boxes, raster pixel coverage, Shared Objects, and animation tracks. |
| `inspect` | `inspect_layer` | Inspects a single vector or raster layer in detail. |
| `inspect` | `inspect_pixels` | Samples RGBA/hex colors and histograms at `(x, y)` or over `(x, y, width, height)`. |
| `inspect` | `inspect_shared_objects_and_library` | Lists embedded Shared Objects (`objects/<id>.xml`) and OS Shared Object Library entries. |
| `inspect` | `capture_canvas_snapshot` | Renders a PNG snapshot of the canvas, layer, object, Shared Object, or animation contact sheet. |
| `canvas` | `create_new_canvas` | Creates a fresh hybrid canvas (`width`, `height`, `backgroundColor`). |
| `canvas` | `set_canvas_properties` | Updates background color, dimensions, or zoom without losing layers/objects. |
| `layer` | `create_layer` | Creates a `vector` or `raster` layer on the Main Canvas or inside a Shared Object. |
| `layer` | `modify_layer` | Updates layer visibility, lock, opacity, blend mode, z-order, or duplicates/clears/deletes it. |
| `vector` | `draw_vector_shape` | Draws `rect`, `circle`, `ellipse`, `polygon`, `star`, or `line` shapes. |
| `vector` | `draw_bezier_path` | Draws an SVG Bezier/polygon path (`d` string or `points` array). |
| `vector` | `draw_text` | Draws a vector text element. |
| `vector` | `modify_vector_object` | Updates or deletes any vector object or `<ObjectRef>` instance by ID. |
| `vector` | `boolean_path_operation` | Runs `union`, `difference`, `intersection`, `exclusion`, `offset`, or `simplify`. |
| `raster` | `select_region` | Creates, inverts, or clears a `rect` or `ellipse` selection mask. |
| `raster` | `paint_raster_stroke` | Paints `brush`, `pencil`, `airbrush`, or `eraser` strokes along `{x, y}` points. |
| `raster` | `raster_fill` | Applies `flood`, `linear_gradient`, or `radial_gradient` fills. |
| `filter` | `apply_gimp_filter` | Applies `gaussian_blur`, `sharpen`, `invert`, `threshold`, `brightness_contrast`, or `drop_shadow`. |
| `shared_object` | `create_shared_object` | Creates a reusable Shared Object sub-canvas (`objects/<id>.xml`) and optional `<ObjectRef>`. |
| `shared_object` | `manage_shared_object` | Instantiates `<ObjectRef>`, renames, duplicates, deletes, or switches In-Place / Isolated Tab editing modes. |
| `library` | `manage_library` | Saves, imports, or deletes `.haso` packages in the persistent OS Shared Object Library. |
| `animation` | `configure_timeline` | Sets `fps`, `totalFrames`, `loop`, `currentFrame`, and `onionSkin`. |
| `animation` | `set_animation_keyframe` | Adds/updates interpolated keyframes (`linear`, `ease_in`, `ease_out`, `ease_in_out`, `step`). |
| `file` | `open_or_import_file` | Opens or imports `.hacanvas`, `.ai`, `.psd`, `.xcf`, `.ora`, `.svg`, `.png`, `.gif`, `.bmp`, `.tga`, `.ico`, etc. |
| `file` | `save_or_export_artwork` | Saves `.hacanvas` or exports `.png`, `.svg`, `.gif`, `.ora`, `.bmp`, `.tga`, `.ico`, `.ppm`, `.ff`, or `sprite_sheet`. |

