# HACanvas API & AI Tooling Reference

## 1. `HybridArtEngine`

```typescript
import { HybridArtEngine } from "@nexustools/hacanvas";
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
  Serializes the canvas, attached filters, embedded fonts, metadata, and all Shared Objects into a `.hacanvas` ZIP+XML archive.
- `loadFromFile(canvasId, filePath, options?): ImportResult`
  Loads or imports `.hacanvas`, `.psd`, `.xcf`, `.ai`, `.pdf`, `.svg`, `.ora`, `.png`, `.jpg`, `.webp`, `.tiff`, `.gif`, `.bmp`, `.tga`, `.pcx`, `.ico`, `.cur`, `.ppm`, or `.ff` into `canvasId`.
- `exportCanvas(canvasId, filePath, format?, options?): ExportResult`
  Exports the composited canvas or animation to any of the 18 supported formats (`hacanvas`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `pdf`, `svg`, `gif`, `ora`, `bmp`, `tga`, `pcx`, `ico`, `cur`, `ppm`, `farbfeld`, `sprite_sheet`). Automatically renders all enabled dynamic attached filters (`forExport: true`) and selectively rasterizes filtered objects/layers in `.svg` and `.pdf` exports.

### 1.2 Scene, Layer, Filter & Timeline Inspection
- `inspectScene(canvasId): Record<string, any>`
  Returns complete scene graph metadata including canvas dimensions, DPI, `previewDynamicFilters`, `layers` (with vector objects, `attachedFilters` enriched with resolved `settings` & `parameterSchemas`, `filtersEnabled`, and `rasterBounds`), `sharedObjects` (with reference counts, `attachedFilters`, and `objectCache`), and `animation` (enriched via `inspectAnimationTimeline`).
- `inspectAnimationTimeline(canvasId, options?): Record<string, any>`
  Returns full animation timeline details for the Main Canvas or a Shared Object: `fps`, `durationFrames`, `loop`, `loopBackToFrame`, `tracks` (each keyframe segment enriched with `easing`, `curvePresetId`, `curvePresetName`, resolved `[x1, y1, x2, y2]` `curveControlPoints`, and `rasterTransition` details including `blendPresetId`, `blendPresetName`, `category`, `targetLayerId`, `targetFrame`, `hasCustomCode`, `customCode`), `targetFrameRanges`, and available curve & raster transition preset catalogs.
- `inspectVectorObjectNodes(canvasId, objectId, sharedObjectId?): { objectId, kind, closed, vertices, segments, d }`
  Returns all editable vertices (`{ index, x, y }`) and segments (`{ segmentIndex, fromIndex, toIndex, p0, p1, curved, cx, cy }`) for any vector shape or line.
- `inspectPixels(canvasId, x, y, width?, height?, frame?): Record<string, any>`
  Samples exact RGBA/hex pixel values at `(x, y)` or computes a color histogram and average RGBA over `(x, y, width, height)`.
- `takeSnapshot(options: SnapshotOptions): SnapshotResult`
  Renders a PNG snapshot (`canvas`, `layer`, `object`, `shared_object`, `region`, or `contact_sheet`) with optional grid overlay, bounding box highlights, onion-skinning, and filter preview controls.

### 1.3 Undo / Redo & History
- `undo(canvasId): { undone: boolean; label?: string; state: ArtCanvasState }`
- `redo(canvasId): { redone: boolean; label?: string; state: ArtCanvasState }`
- `canUndo(canvasId): boolean` / `canRedo(canvasId): boolean`
- `getUndoHistory(canvasId): { undoList: Array<{ id, label, timestamp }>; redoList: Array<{ id, label, timestamp }>; currentLabel: string }`
- `jumpToHistoryState(canvasId, targetStepsDelta): ArtCanvasState`
- `clearUndoHistory(canvasId): void` / `resetUndoHistory(canvasId, baseLabel?): void`
- `beginUndoGroup(canvasId, label): void` / `endUndoGroup(canvasId, label?): void`
- `withUndoGroup<T>(canvasId, label, fn): T`

### 1.4 Layer & Image Management
- `createLayer(canvasId, name, type, options?): ArtLayerSpec`
- `modifyLayer(canvasId, layerId, updates): ArtLayerSpec`
- `deleteLayer(canvasId, layerId, sharedObjectId?): void`
- `manageLayer(canvasId, action, opts)`: `"add" | "remove" | "duplicate" | "reorder" | "set_visibility" | "set_opacity" | "set_blend_mode" | "clear"`
- `mergeLayerDown(canvasId, layerId, sharedObjectId?): ArtLayerSpec`
- `mergeVisibleLayers(canvasId, sharedObjectId?): ArtLayerSpec`
- `flattenImage(canvasId): ArtLayerSpec`
- `newLayerFromVisible(canvasId, sharedObjectId?): ArtLayerSpec`
- `transformLayer(canvasId, layerId, op, sharedObjectId?)`: `"flip_h" | "flip_v" | "rotate_90_cw" | "rotate_90_ccw" | "rotate_180"`
- `offsetLayer(canvasId, layerId, dx, dy, wrapAround?, sharedObjectId?): ArtLayerSpec`
- `transformCanvas(canvasId, op)`: `"flip_h" | "flip_v" | "rotate_90_cw" | "rotate_90_ccw" | "rotate_180"`
- `scaleCanvas(canvasId, newWidth, newHeight): ArtCanvasState`
- `resizeCanvas(canvasId, newWidth, newHeight, offsetX?, offsetY?, backgroundColor?): ArtCanvasState`
- `cropCanvasToSelection(canvasId): ArtCanvasState` / `cropCanvasToContent(canvasId): ArtCanvasState`

### 1.5 Vector Tools & Shape Deformation (Inkscape / SVG Backend)
- `drawShape(canvasId, layerId, spec): VectorObjectSpec`
  Draws `rect`, `circle`, `ellipse`, `polygon`, `star`, or `line`.
- `drawPath(canvasId, layerId, spec): VectorObjectSpec`
  Draws a polyline, polygon, or cubic/quadratic Bezier path (`d` or `points`).
- `drawText(canvasId, layerId, spec): VectorObjectSpec`
  Places a vector `<text>` node with `fontFamily`, `fontSize`, `fill`, `stroke`.
- `modifyObject(canvasId, objectId, updates): VectorObjectSpec`
  Updates coordinates, dimensions, transform (`rotation`, `scaleX`, `scaleY`, `skewX`, `skewY`), timeline visibility (`startFrame`, `endFrame`), or style (`fill`, `stroke`, `strokeWidth`, `opacity`, `fillOverride`, `strokeOverride`).
- `deformVectorObject(canvasId, objectId, options): VectorObjectSpec`
  Deforms any vector object (`line`, `path`, `polygon`, `star`, `rect`, `circle`, `ellipse`):
  - `mode: "bend_segment"`: Bends a line or segment (`segmentIndex`) into a quadratic Bezier curve passing through `(targetX, targetY)` at parameter `t` while keeping endpoints fixed.
  - `mode: "move_endpoint"`: Moves vertex/endpoint `pointIndex` to `(targetX, targetY)` while retaining existing segment curves.
  - `mode: "straighten_segment"`: Removes curvature from `segmentIndex`.
  - `mode: "add_vertex"`: Splits `segmentIndex` at `t` (or `(targetX, targetY)`) and inserts a new vertex.
  - `mode: "remove_vertex"`: Removes vertex at `pointIndex`.
  - `mode: "convert_to_path"`: Converts a primitive shape (`rect`, `circle`, `ellipse`, `polygon`, `star`, `line`) into an editable path with explicit vertices.
- `pathOperation(canvasId, operation, options): VectorObjectSpec`
  Executes Boolean CSG (`"union" | "difference" | "intersection" | "exclusion"`) or path geometry (`"simplify" | "offset"`).

### 1.6 Raster Tools, Immediate Filters & Dynamic Attached Filters (GIMP Backend)
- `rasterStroke(canvasId, layerId, spec)`
  Strokes along `points` with `tool: "brush" | "pencil" | "airbrush" | "eraser"`, `color`, `size`, `hardness`, `opacity`.
- `rasterFill(canvasId, layerId, spec)`
  Executes `fillType: "flood" | "linear_gradient" | "radial_gradient"`.
- `rasterSelection(canvasId, op, bounds?)` / `modifySelectionBounds(canvasId, op, amountPx)`
  Creates or modifies selection masks (`"rect" | "ellipse" | "clear" | "invert" | "feather" | "grow" | "shrink" | "border"`).
- `rasterFilter(canvasId, layerId, params, frame?, sharedObjectId?)`
  Immediately applies any of the 85+ built-in or custom JS GIMP filters to mutate a raster layer's pixel buffer in-place.
- `attachFilter(canvasId, spec): AttachedFilterSpec`
  Attaches a non-destructive dynamic filter to `targetType: "layer" | "object" | "shared_object"`.
- `updateAttachedFilter(canvasId, spec): AttachedFilterSpec`
  Updates `params`, `enabled`, or stack order (`moveDirection: "up" | "down"`) of an attached filter.
- `removeAttachedFilter(canvasId, spec): number`
  Removes a specific attached filter (`filterId` or `filterType`) or clears all (`clearAll: true`).
- `listAttachedFilters(canvasId, spec)`
  Lists all attached filters on a layer, object, or shared object with resolved `settings` (merged with `parameterSchemas` defaults), `parameterSchemas`, `category`, `effectiveInViewport`, and `effectiveOnExport`.
- `setTargetFiltersEnabled(canvasId, spec): boolean`
  Toggles dynamic filter preview on a layer, object, shared object, or globally across the canvas (`targetType: "canvas"`).
- `bakeLayerFilters(canvasId, layerId?, frame?, sharedObjectId?)`
  Permanently bakes attached dynamic filters on a layer into its raster pixel buffer and clears the attached filter stack.
- `setObjectEditing(canvasId, objectId, isEditing)` / `setSharedObjectEditing(canvasId, sharedObjectId, isEditing)`
  Pauses dynamic filter rendering on an object or Shared Object while it is actively being edited in the viewport.
- `adjustLayerColors(canvasId, layerId, op, params, sharedObjectId?)`
  Applies `"desaturate" | "sepia" | "equalize" | "white_balance" | "posterize" | "colorize" | "color_balance" | "hue_saturation" | "color_to_alpha" | "remove_alpha"`.

---

## 2. Built-In AI Tooling (`HaCanvasAiSession`, `HaCanvasAiToolRegistry`, `LmStudioAiClient`)

All **29 AI tools** live directly in `@nexustools/hacanvas` (`src/ai/abstract-ai-tool.ts` and `src/ai/lm-studio-client.ts`) and are exported from the root package so any project (`AICore`, `HAEditor`, or third-party applications) can add full AI support immediately.

### All 29 Built-In AI Tools

| # | Category | Tool Name | Description |
| :--- | :--- | :--- | :--- |
| 1 | `inspect` | `inspect_canvas_status` | Inspects canvas dimensions, DPI, `previewDynamicFilters`, active editing mode, active layer, selection, metadata, embedded fonts, undo history, and all layers with their active `attachedFilters` & settings. |
| 2 | `inspect` | `inspect_scene_graph` | Inspects the complete scene graph: all layers, vector objects, bounding boxes, raster pixel coverage, attached dynamic filters & settings, object cache stats, Shared Objects, and full animation timeline tracks/curves/transitions. |
| 3 | `inspect` | `inspect_layer` | Inspects a single vector or raster layer in detail, returning its objects/pixel bounds and all `attachedFilters` with resolved `settings` and `parameterSchemas`. |
| 4 | `inspect` | `inspect_animation_timeline` | Inspects the animation timeline (Main Canvas or Shared Object), returning FPS, duration, loop settings, all tracks, keyframe segments with resolved cubic-Bezier `[x1, y1, x2, y2]` easing curves, raster cel transitions (`blendPresetId`, `category`, `targetLayerId`, `customCode`), visibility ranges (`startFrame..endFrame`), and available curve & transition preset catalogs. |
| 5 | `inspect` | `inspect_pixels` | Samples RGBA/hex colors and histograms at `(x, y)` or over `(x, y, width, height)`. |
| 6 | `inspect` | `inspect_shared_objects_and_library` | Lists embedded Shared Objects (`objects/<id>.xml`, including their `attachedFilters` and `objectCache`) and OS Shared Object Library entries. |
| 7 | `inspect` | `capture_canvas_snapshot` | Renders a PNG snapshot of the canvas, layer, object, Shared Object, cropped region, or animation contact sheet (with `forExport` and `previewFilters` toggles). |
| 8 | `canvas` | `create_new_canvas` | Creates a fresh hybrid canvas (`width`, `height`, `backgroundColor`). |
| 9 | `canvas` | `set_canvas_properties` | Updates background color, dimensions, DPI, global `previewDynamicFilters`, zoom, or document metadata without losing layers/objects. |
| 10 | `canvas` | `undo_redo_and_transform` | Executes undo/redo history navigation, whole-image geometric transforms (`flip_h`, `flip_v`, `rotate_90_cw`, `rotate_90_ccw`, `rotate_180`, `crop_to_selection`, `crop_to_content`, `scale_image`, `resize_canvas`), direct raster color adjustments, vector object duplication, and tool option updates. |
| 11 | `layer` | `create_layer` | Creates a `vector` or `raster` layer on the Main Canvas or inside a Shared Object. |
| 12 | `layer` | `modify_layer` | Updates layer name, visibility, lock, opacity, blend mode, z-order, `filtersEnabled`, `startFrame`/`endFrame`, or runs `duplicate`, `clear`, `delete`, `merge_down`, `merge_visible`, `flatten`, `new_from_visible`, or `transform` (`flip_h`, `flip_v`, `rotate_90_cw`, `rotate_90_ccw`, `rotate_180`, `offset`). |
| 13 | `vector` | `draw_vector_shape` | Draws `rect`, `circle`, `ellipse`, `polygon`, `star`, or `line` shapes. |
| 14 | `vector` | `draw_bezier_path` | Draws an SVG Bezier/polygon path (`d` string or `points` array). |
| 15 | `vector` | `draw_text` | Draws a vector text element. |
| 16 | `vector` | `modify_vector_object` | Updates or deletes any vector object or `<ObjectRef>` instance by ID (`x`, `y`, `width`, `height`, `r`, `rx`, `ry`, `fill`, `stroke`, `scaleX`, `scaleY`, `rotation`, `skewX`, `skewY`, `startFrame`, `endFrame`). |
| 17 | `vector` | `deform_vector_object` | Deforms or inspects nodes on any vector object (`line`, `path`, `polygon`, `star`, `rect`, `circle`, `ellipse`) via `bend_segment`, `move_endpoint`, `straighten_segment`, `add_vertex`, `remove_vertex`, `convert_to_path`, or `inspect_nodes`. |
| 18 | `vector` | `boolean_path_operation` | Runs `union`, `difference`, `intersection`, `exclusion`, `offset`, or `simplify`. |
| 19 | `raster` | `select_region` | Creates, modifies, inverts, or clears a selection mask (`rect`, `ellipse`, `invert`, `clear`, `all`, `feather`, `grow`, `shrink`, `border`, `by_color`, `from_alpha`). |
| 20 | `raster` | `paint_raster_stroke` | Paints `brush`, `pencil`, `airbrush`, or `eraser` strokes along `{x, y}` points. |
| 21 | `raster` | `raster_fill` | Applies `flood`, `linear_gradient`, or `radial_gradient` fills. |
| 22 | `filter` | `apply_gimp_filter` | Applies any of the 85+ GIMP filters immediately (`mode: "immediate"`) or manages dynamic non-destructive filters (`mode: "attach" | "update_attached" | "bake" | "remove" | "toggle_preview" | "list_attached"`) on a layer, vector object, or Shared Object. |
| 23 | `filter` | `configure_gimp_filter_preset` | Lists, inspects JS source code, validates, creates/saves, deletes, or applies categorized JavaScript GIMP filter presets and internal helper docs (`helpers.*`, `gimp.*`, `gegl.*`). |
| 24 | `shared_object` | `create_shared_object` | Creates a reusable Shared Object sub-canvas (`objects/<id>.xml`) and optional `<ObjectRef>`. |
| 25 | `shared_object` | `manage_shared_object` | Instantiates `<ObjectRef>`, renames, duplicates, deletes, or switches In-Place / Isolated Tab editing modes. |
| 26 | `library` | `manage_library` | Saves, imports, or deletes `.haso` packages in the persistent OS Shared Object Library. |
| 27 | `animation` | `configure_timeline` | Configures `fps`, `totalFrames`, `loop`, `loopBackToFrame`, `currentFrame`, `onionSkin`, and target `startFrame..endFrame` visibility spans. |
| 28 | `animation` | `set_animation_keyframe` | Adds, updates, moves, or removes property keyframes with preset or custom cubic-Bezier (`[x1, y1, x2, y2]`) easing curves. |
| 29 | `animation` | `configure_animation_curve` | Lists, creates/saves, deletes, or applies cubic-Bezier movement/interpolation curve presets. |
| 30* | `animation` | `configure_raster_keyframe_blend` | Manages raster cel keyframes, cross-layer blending, and 27+ built-in/custom JavaScript raster transition blend presets. |
| 31* | `file` | `open_or_import_file` | Opens or imports `.hacanvas`, `.ai`, `.pdf`, `.psd`, `.xcf`, `.ora`, `.svg`, `.png`, `.jpg`, `.webp`, `.tiff`, `.gif`, `.bmp`, `.tga`, `.ico`, `.cur`, etc. |
| 32* | `file` | `save_or_export_artwork` | Saves `.hacanvas` or exports to any of the 18 supported formats with quality, compression, DPI, metadata, and font embedding options. |
| 33* | `file` | `manage_metadata_and_fonts` | Inspects, sets, or clears document EXIF/GPS/custom metadata and embeds, exports, or removes `.ttf`/`.otf`/`.woff`/`.woff2` fonts. |

*(All 33 tools are registered in `HaCanvasAiToolRegistry.getAllTools()`).*
