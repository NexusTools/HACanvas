# `.hacanvas` & `.haso` ZIP + XML File Format Specification

## 1. Overview

The **`.hacanvas`** document format (and its companion **`.haso`** Shared Object package format) uses a standard PKZIP container (`zip-xml-package.ts`) structured after ECMA-376 Open Packaging Conventions (`.docx` / `.xlsx`).

Because `.hacanvas` is a standard ZIP archive with human-readable XML metadata and raw/PNG media streams, it can be inspected with any standard unzip utility while preserving 100% of vector nodes, raster pixel buffers, blend modes, shared object hierarchies, and animation timelines.

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
└── media/
    ├── layer_1.raw
    ├── layer_1_frame_2.raw
    └── shared_badge_1_layer_1.raw
```

### 2.1 `[Content_Types].xml`
Declares MIME types for `.rels`, `.xml`, `.raw`, `.png`, and `.svg` parts inside the package:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="raw" ContentType="application/octet-stream"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Override PartName="/canvas/document.xml" ContentType="application/vnd.hacanvas.document+xml"/>
</Types>
```

### 2.2 `_rels/.rels`
Maps package-level relationships from the root to `/canvas/document.xml` and each `/objects/<objectId>.xml` part.

### 2.3 `canvas/document.xml`
Defines the root canvas dimensions, background color, selection mask, layer stack (`<Layers>`), and animation timeline (`<Animation>`):

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<HACanvasDocument xmlns="http://schemas.aicore.local/hacanvas/2026"
                  canvasId="main_document"
                  width="640"
                  height="420"
                  dpi="96"
                  backgroundColor="#161822">
  <Layers>
    <Layer id="layer_1" name="Backdrop Raster" type="raster" visible="true" locked="false" opacity="1" blendMode="normal" mediaSrc="media/layer_1.raw" />
    <Layer id="layer_2" name="Artwork Vector" type="vector" visible="true" locked="false" opacity="1" blendMode="normal">
      <VectorObject id="obj_1" kind="star" x="200" y="120" width="80" height="80" sides="5" innerRadius="20" fill="#ffcc00" stroke="#ffffff" strokeWidth="2" />
      <ObjectRef id="ref_1" refId="shared_badge_1" x="60" y="60" scaleX="1" scaleY="1" rotation="0" opacity="1" />
    </Layer>
  </Layers>
  <Animation fps="12" durationFrames="24" loop="true">
    <Tracks />
  </Animation>
</HACanvasDocument>
```

### 2.4 `objects/<objectId>.xml`
Each reusable Shared Object is stored in its own dedicated XML part under `objects/<objectId>.xml` with its own `<Layers>` collection and media references (`media/<objectId>_<layerId>.raw`).

---

## 3. `.haso` Shared Object Library Format

When a Shared Object is saved to the cross-project OS Config Library via `SharedObjectLibrary.saveSharedObjectToLibrary()`, it is packaged as a `.haso` archive containing the root Shared Object plus any transitive nested Shared Object dependencies and their `media/*.raw` buffers.
