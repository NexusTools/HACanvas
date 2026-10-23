import * as fs from "fs";
import * as path from "path";
import {
    type BlendMode,
    type EasingMode,
    type VectorObjectSpec
} from "../../hybrid-art-engine.js";
import {
    BUILT_IN_CURVE_PRESETS,
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    RASTER_TRANSITION_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    type GimpFilterPreset
} from "../../shared-object-library.js";
import { AbstractAiTool, type HaCanvasAiContext } from "../abstract-ai-tool-base.js";

export class SaveAndExportArtworkAiTool extends AbstractAiTool {
    public readonly name = "save_or_export_artwork";
    public readonly category = "file" as const;
    public readonly icon = "💾";
    public readonly description =
        "Saves the project as a native `.hacanvas` ZIP+XML package or exports the canvas to any of the 18 supported image/vector/animation formats ('hacanvas', 'png', 'jpg', 'jpeg', 'webp', 'tiff', 'pdf', 'svg', 'gif', 'ora', 'bmp', 'tga', 'pcx', 'ico', 'cur', 'ppm', 'farbfeld', 'sprite_sheet') with format-specific options (quality, compression, DPI, cursor hotspot, sprite sheet columns, metadata preservation, font embedding).";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            outputPath: { type: "string", description: "Output file path (e.g. 'exports/artwork.png' or 'project.hacanvas')." },
            format: {
                type: "string",
                enum: [
                    "hacanvas",
                    "png",
                    "jpg",
                    "jpeg",
                    "webp",
                    "tiff",
                    "pdf",
                    "svg",
                    "gif",
                    "ora",
                    "bmp",
                    "tga",
                    "pcx",
                    "ico",
                    "cur",
                    "ppm",
                    "farbfeld",
                    "sprite_sheet"
                ],
                description: "Export format (default inferred from outputPath or 'png')."
            },
            frame: { type: "number", description: "Optional frame index for single-frame exports." },
            quality: { type: "number", description: "Optional quality (1..100) for JPEG or WebP exports (default 92)." },
            compressionLevel: { type: "number", description: "Optional compression level (0..9) for PNG/ZIP exports (default 6)." },
            dpi: { type: "number", description: "Optional print resolution in DPI for PNG/JPEG/TIFF/PDF exports." },
            hotspotX: { type: "number", description: "Cursor hotspot X coordinate when format === 'cur'." },
            hotspotY: { type: "number", description: "Cursor hotspot Y coordinate when format === 'cur'." },
            columns: { type: "number", description: "Number of columns when format === 'sprite_sheet'." },
            preserveMetadata: { type: "boolean", description: "Whether to embed EXIF/XMP/tEXt metadata into the exported file (default true)." },
            embedFonts: { type: "boolean", description: "Whether to embed project fonts into SVG/PDF/.hacanvas exports (default true)." },
            author: { type: "string", description: "Optional author override for exported metadata." },
            copyright: { type: "string", description: "Optional copyright override for exported metadata." },
            description: { type: "string", description: "Optional description override for exported metadata." }
        },
        required: ["outputPath"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Exporting artwork to '${partialArgs.outputPath || "..."}' (${partialArgs.format || "auto"})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Saved ${result?.format?.toUpperCase()} (${result?.bytesWritten ?? 0} bytes) → ${result?.outputPath || result?.filePath}`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        if (args.dpi !== undefined) {
            const cState = state.getCanvasState();
            cState.dpi = Math.max(1, Math.round(Number(args.dpi)));
            state.engine.saveCanvas(cState);
        }
        const metaOverride =
            args.author || args.copyright || args.description
                ? {
                      ...(args.author ? { author: String(args.author) } : {}),
                      ...(args.copyright ? { copyright: String(args.copyright) } : {}),
                      ...(args.description ? { description: String(args.description) } : {})
                  }
                : undefined;
        const res = state.engine.exportCanvas(
            state.canvasId,
            args.outputPath,
            args.format,
            {
                frame: args.frame !== undefined ? Number(args.frame) : state.currentFrame,
                quality: args.quality !== undefined ? Number(args.quality) : undefined,
                compressionLevel: args.compressionLevel !== undefined ? Number(args.compressionLevel) : undefined,
                columns: args.columns !== undefined ? Number(args.columns) : undefined,
                embedFonts: args.embedFonts !== false,
                author: args.author,
                ...(metaOverride ? { metadata: metaOverride } : {})
            }
        );
        state.setStatus(`AI exported ${res.format.toUpperCase()} to "${res.outputPath}".`);
        return res;
    }
}
