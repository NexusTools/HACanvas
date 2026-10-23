# `.hacanvas` & `.haso` ZIP + XML File Format Specification

## 1. Overview

The **`.hacanvas`** document format (and its companion **`.haso`** Shared Object package format) uses a standard PKZIP container (`zip-xml-package.ts`) structured after ECMA-376 Open Packaging Conventions (`.docx` / `.xlsx`).

Because `.hacanvas` is a standard ZIP archive with human-readable XML metadata, embedded font binaries, and raw/PNG media streams, it can be inspected with any standard unzip utility while preserving 100% of vector nodes, curved segments, raster pixel buffers, blend modes, non-destructive attached filter stacks (`<AttachedFilters>`), shared object hierarchies, embedded fonts, EXIF/GPS/XMP metadata, and animation timelines.

---

## 2. Internal Archive Layout

```text
artwork.hacanvas (PKZIP Archive)
├── [Content_Types].xml
├── _rels/
│   └── .rels
├── canvas/
│   └── document.xml
├── objects/
│   ├── shared_badge_1.xml
│   └── shared_icon_2.xml
├── fonts/
│   └── font_roboto.ttf
└── media/
    ├── layer_1.raw
    ├── layer_1_cel_2.raw
    └── shared_badge_1_layer_1.raw
```

### 2.1 `[Content_Types].xml`
Declares MIME types for `.rels`, `.xml`, `.raw`, `.png`, `.svg`, `.ttf`, `.otf`, `.woff`, and `.woff2` parts inside the package:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="raw" ContentType="application/octet-stream"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Default Extension="ttf" ContentType="font/ttf"/>
  <Default Extension="otf" ContentType="font/otf"/>
  <Override PartName="/canvas/document.xml" ContentType="application/vnd.hacanvas.document+xml"/>
</Types>
```

### 2.2 `_rels/.rels`
Maps package-level relationships from the root to `/canvas/document.xml`, each `/objects/<objectId>.xml` part, and embedded `/fonts/*` binaries.

### 2.3 `canvas/document.xml`
Defines the root canvas dimensions, print DPI, background color, global dynamic filter preview state (`previewDynamicFilters`), selection mask, document metadata (`<Metadata>`), embedded fonts (`<EmbeddedFonts>`), custom JS filter presets (`<CustomFilterPresets>`), layer stack (`<Layers>`), and animation timeline (`<Animation>`):

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<HACanvasDocument xmlns="http://schemas.aicore.local/hacanvas/2026"
                  canvasId="main_document"
                  width="640"
                  height="420"
                  dpi="96"
                  backgroundColor="#161822"
                  previewDynamicFilters="true">
  <Metadata title="Hero Artwork" author="Artist" copyright="2026" software="HACanvas" />
  <Layers>
    <Layer id="layer_1" name="Backdrop Raster" type="raster" visible="true" locked="false" opacity="1" blendMode="normal" filtersEnabled="true" mediaSrc="media/layer_1.raw">
      <AttachedFilters>
        <Filter id="af_gaussian_blur_1" filterType="gaussian_blur" name="Gaussian Blur" enabled="true" paramsJson="{&quot;radius&quot;:4,&quot;filterType&quot;:&quot;gaussian_blur&quot;}" />
      </AttachedFilters>
    </Layer>
    <Layer id="layer_2" name="Artwork Vector" type="vector" visible="true" locked="false" opacity="1" blendMode="normal" filtersEnabled="true">
      <VectorObject id="obj_1" kind="star" x="200" y="120" width="80" height="80" sides="5" innerRadius="20" fill="#ffcc00" stroke="#ffffff" strokeWidth="2" filtersEnabled="true">
        <AttachedFilters>
          <Filter id="af_drop_shadow_1" filterType="drop_shadow" name="Drop Shadow" enabled="true" paramsJson="{&quot;offsetX&quot;:6,&quot;offsetY&quot;:6,&quot;radius&quot;:5,&quot;opacity&quot;:0.75}" />
        </AttachedFilters>
      </VectorObject>
      <ObjectRef id="ref_1" refId="shared_badge_1" x="60" y="60" scaleX="1" scaleY="1" rotation="0" opacity="1" />
    </Layer>
  </Layers>
  <Animation fps="12" durationFrames="24" loop="true" loopBackToFrame="0">
    <Tracks>
      <Track id="track_obj_1_rotation" targetId="obj_1" property="rotation">
        <Keyframe frame="0" endFrame="23" value="0" easing="custom_bezier" curvePresetId="overshoot" curveControlPoints="0.34,1.56,0.64,1" />
        <Keyframe frame="23" value="360" easing="linear" />
      </Track>
    </Tracks>
  </Animation>
</HACanvasDocument>
```

### 2.4 `objects/<objectId>.xml`
Each reusable Shared Object is stored in its own dedicated XML part under `objects/<objectId>.xml` with its own `<Layers>`, `<AttachedFilters>`, `<Animation>` timeline, and media references (`media/shared_<objectId>_<layerId>.raw`).

---

## 3. `.haso` Shared Object Library Format

When a Shared Object is saved to the cross-project OS Config Library via `SharedObjectLibrary.saveSharedObjectToLibrary()`, it is packaged as a `.haso` archive containing the root Shared Object XML, its attached filters and animation tracks, plus any transitive nested Shared Object dependencies and their `media/*.raw` buffers.
