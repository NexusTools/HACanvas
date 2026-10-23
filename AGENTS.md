# HACanvas (`@nexustools/hacanvas`) — Agent Architecture & Development Guidelines

## 1. Project Overview
`@nexustools/hacanvas` (`D:\GitHub\hacanvas`) is the core GIMP + Inkscape hybrid 2D raster, vector, shared-object, non-destructive filter, and keyframe animation engine powering both:
- **`HAEditor`** (`D:\AICore\workspace\haeditor`) — the NW.js desktop graphical studio for `.hacanvas` documents.
- **`AICore`** (`D:\AICore`) — the 3-tier AI coordination system whose Artist Worker (`"artist"`) and AI tooling use `@nexustools/hacanvas`.

Key capabilities provided by `@nexustools/hacanvas`:
- **Open Packaging `.hacanvas` Format**: `.docx`-style ZIP+XML hybrid archive (`[Content_Types].xml`, `_rels/.rels`, `canvas/document.xml`, `objects/<objectId>.xml`, `media/`, `fonts/`) supporting multi-layer vector + raster canvases, embeddable Shared Object sub-canvases (`<ObjectRef>` with cycle detection), EXIF/XMP metadata, and embedded fonts.
- **Multi-Format Importers, Exporters, & Binary Codecs**: Native pure-TypeScript support for `.hacanvas`, `.psd`/`.psb`, `.xcf`, `.ora`, `.svg`, `.ai`, `.pdf`, `.png`, `.apng`, `.gif`, `.bmp`, `.tga`, `.pcx`, `.ico`, `.ppm`/`.pgm`/`.pbm`/`.pam`, `.ff` (Farbfeld), `.xbm`, `.jpg`/`.jpeg`, `.webp`, `.tiff`, and sprite sheets, with automatic rasterization/conversion for format-unsupported features.
- **Immediate & Non-Destructive Dynamic Filter Pipeline**: 121+ categorized built-in GIMP filter presets (`BUILT_IN_GIMP_FILTER_PRESETS`), custom JavaScript filter scripts (`gimp.*` / `gegl.*` / `helpers.*`), immediate pixel mutation (`rasterFilter`), and non-destructive dynamic filter stacks (`attachedFilters`) on raster layers, vector layers, individual vector objects, and shared objects—backed by per-object offscreen RGBA render caching (`objectRenderCache`), live editing bypass (`setObjectEditing`), and non-destructive preview toggling (`previewDynamicFilters` / `filtersEnabled`).
- **Animation Timeline, Cubic-Bezier Curves, & Raster Cel Transitions**: Property keyframe tracks (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `skewX`, `skewY`, `opacity`, `rasterCel`), custom `[x1, y1, x2, y2]` cubic-Bezier easing curves, and 14+ categorized JavaScript raster cel transitions (`BUILT_IN_RASTER_BLEND_PRESETS`).
- **Comprehensive AI Tooling (`HaCanvasAiSession` & `HaCanvasAiToolRegistry`)**: 33 structured AI tools covering every inspection, drawing, deformation, painting, filter, timeline, transition, metadata, font, history, and export operation.

---

## 2. Symlinked Live Development Workflow (1:1 Immediate Updates)
During development, `hacanvas`, `haeditor`, and `AICore` are developed together as a unified live workspace using directory symlinks (Windows junctions):
- `D:\AICore\workspace\haeditor\node_modules\@nexustools\hacanvas` $\longrightarrow$ `D:\GitHub\hacanvas`
- `D:\AICore\node_modules\@nexustools\hacanvas` $\longrightarrow$ `D:\GitHub\hacanvas`

### Rules for Agents Working Across Repositories
1. **No Manual File Copying Needed**: Because `D:\GitHub\hacanvas` is symlinked directly into `haeditor/node_modules/@nexustools/hacanvas` and `AICore/node_modules/@nexustools/hacanvas`, running `npm run build` in `D:\GitHub\hacanvas` immediately updates `dist/` for both `haeditor` and `AICore` 1:1.
2. **Never Replace Symlinks with Copies**: Do **not** delete the symlinked `@nexustools/hacanvas` folder in `node_modules` or replace it with a static copy. If `npm install` ever overwrites a symlink, restore the junction immediately:
   ```powershell
   New-Item -ItemType Junction -Path "D:\AICore\workspace\haeditor\node_modules\@nexustools\hacanvas" -Target "D:\GitHub\hacanvas"
   New-Item -ItemType Junction -Path "D:\AICore\node_modules\@nexustools\hacanvas" -Target "D:\GitHub\hacanvas"
   ```
3. **Always Build & Verify**: After modifying any `.ts` file in `D:\GitHub\hacanvas`, run `npm run build` in `D:\GitHub\hacanvas`, then build/test `haeditor` (`D:\AICore\workspace\haeditor`) or `AICore` (`D:\AICore`) to verify end-to-end compatibility.

---

## 3. Strict Modular File Layout & "1 Class Per `.ts` File" Rule
To prevent source files from growing monolithic or difficult to maintain, **all code in `D:\GitHub\hacanvas\src\` MUST strictly follow the 1-Class-Per-File and Domain-Folder architecture**:

### Core Rules
1. **Maximum 1 Exported Class Per `.ts` File**:
   - Every `.ts` file in `src/` may export **at most 1 class**.
   - Never place multiple classes in the same `.ts` file.
2. **One File Per Tool, Filter, Transition, Importer, Exporter, & Codec**:
   - **AI Tools (`src/ai/tools/`)**: Each AI tool MUST live in its own file `src/ai/tools/<tool-name>-ai-tool.ts` extending [`AbstractAiTool`](file:///D:/GitHub/hacanvas/src/ai/abstract-ai-tool-base.ts), re-exported in [`src/ai/tools/index.ts`](file:///D:/GitHub/hacanvas/src/ai/tools/index.ts), and registered in [`src/ai/ha-canvas-ai-tool-registry.ts`](file:///D:/GitHub/hacanvas/src/ai/ha-canvas-ai-tool-registry.ts).
   - **Raster Filters (`src/filters/`)**: Each concrete filter class MUST live in its own file `src/filters/<filter-name>-filter.ts` extending [`AbstractRasterFilter`](file:///D:/GitHub/hacanvas/src/filters/abstract-raster-filter-base.ts) and registered in [`src/filters/raster-filter-registry.ts`](file:///D:/GitHub/hacanvas/src/filters/raster-filter-registry.ts).
   - **GIMP Filter Presets (`src/filters/presets/`)**: Each built-in GIMP filter preset MUST live in its own file `src/filters/presets/<preset-id>-filter-preset.ts` and be exported via [`src/filters/presets/index.ts`](file:///D:/GitHub/hacanvas/src/filters/presets/index.ts).
   - **Keyframe Transitions (`src/transitions/`)**: Each raster keyframe blend transition preset MUST live in its own file `src/transitions/<transition-id>-transition.ts` and be aggregated in [`src/transitions/index.ts`](file:///D:/GitHub/hacanvas/src/transitions/index.ts).
   - **Format Importers (`src/importers/`)**: Each file format importer MUST live in its own class file `src/importers/<format>-importer.ts` (e.g. `png-importer.ts`, `psd-importer.ts`, `xcf-importer.ts`, `svg-importer.ts`, `ora-importer.ts`, `gif-importer.ts`, `ai-importer.ts`, `pdf-importer.ts`) and be re-exported via [`src/importers/index.ts`](file:///D:/GitHub/hacanvas/src/importers/index.ts).
   - **Format Exporters (`src/exporters/`)**: Each file format exporter MUST live in its own class file `src/exporters/<format>-exporter.ts` (e.g. `png-exporter.ts`, `svg-exporter.ts`, `gif-exporter.ts`, `ora-exporter.ts`, `pdf-exporter.ts`, `ico-exporter.ts`, `spritesheet-exporter.ts`) and be re-exported via [`src/exporters/index.ts`](file:///D:/GitHub/hacanvas/src/exporters/index.ts).
   - **Binary Codecs (`src/codecs/`)**: Each binary codec MUST live in its own class file `src/codecs/<format>-codec.ts` extending [`AbstractImageCodec`](file:///D:/GitHub/hacanvas/src/codecs/abstract-image-codec.ts) and registered in [`src/codecs/image-codec-registry.ts`](file:///D:/GitHub/hacanvas/src/codecs/image-codec-registry.ts).
   - **Library & Config Managers (`src/library/`, `src/config/`)**:
     - [`src/library/shared-object-library-manager.ts`](file:///D:/GitHub/hacanvas/src/library/shared-object-library-manager.ts) — `SharedObjectLibraryManager`
     - [`src/library/category-tree-builder.ts`](file:///D:/GitHub/hacanvas/src/library/category-tree-builder.ts) — `CategoryTreeBuilder`
     - [`src/config/ha-editor-config-manager.ts`](file:///D:/GitHub/hacanvas/src/config/ha-editor-config-manager.ts) — `HaEditorConfigManager`
   - **Shared Types & Pure Utilities (`src/types/`, `src/utils/`)**:
     - Data structures and interfaces belong in `src/types/canvas-types.ts` and `src/types/document-metadata-types.ts`.
     - Pure helper functions belong in `src/utils/color-utils.ts`, `src/utils/easing-utils.ts`, `src/utils/category-utils.ts`, and `src/utils/bitmap-font.ts`.

### Directory Map
```text
D:\GitHub\hacanvas\src\
├── index.ts                          # Public package barrel export
├── hybrid-art-engine.ts              # HybridArtEngine core orchestrator
├── ai/
│   ├── abstract-ai-tool-base.ts      # AbstractAiTool base class & HaCanvasAiContext
│   ├── abstract-ai-stream-client.ts  # AbstractAiStreamClient base class
│   ├── lm-studio-ai-client.ts        # LmStudioAiClient OpenAI-compatible SSE client
│   ├── ha-canvas-ai-tool-registry.ts # HaCanvasAiToolRegistry (33 AI tools)
│   ├── ha-canvas-ai-session.ts       # HaCanvasAiSession high-level agent wrapper
│   └── tools/                        # 33 individual AI tool classes (1 class per file)
├── codecs/                           # 16 binary image/document codec classes (1 class per file)
├── importers/                        # 17 format importer classes (1 class per file) + index.ts
├── exporters/                        # 12 format exporter classes (1 class per file) + index.ts
├── filters/
│   ├── abstract-raster-filter-base.ts# AbstractRasterFilter base class
│   ├── raster-filter-registry.ts     # RasterFilterRegistry
│   ├── *-filter.ts                   # Concrete filter classes (1 class per file)
│   ├── runtime/                      # GIMP/GEGL JS runtime helpers & internal API docs
│   └── presets/                      # 121 individual GIMP filter preset files + index.ts
├── transitions/                      # 14 individual keyframe transition files + index.ts
├── library/                          # SharedObjectLibraryManager & CategoryTreeBuilder
├── config/                           # HaEditorConfigManager
├── types/                            # Canvas, layer, filter, timeline, & metadata TypeScript types
└── utils/                            # Color, cubic-Bezier easing, category, & bitmap font utilities
```

---

## 4. AI Tooling Parity & Documentation Requirements
1. **100% User-to-AI Capability Parity**: Every feature added to `HybridArtEngine` or `HAEditor` (such as dynamic filters, object filter caching, vector shape/line deformation, animation curve presets, raster transitions, metadata, or fonts) MUST be inspectable and controllable by the AI via `src/ai/tools/`.
2. **Documentation Maintenance**: Whenever engine APIs, file formats, or AI tools are added or updated, update:
   - `README.md`
   - `docs/ARCHITECTURE.md`
   - `docs/API_REFERENCE.md`
   - `docs/FILE_FORMAT_SPEC.md`
3. **No Assumptions**: If any requirement is ambiguous, ask the user for clarification before implementing.
