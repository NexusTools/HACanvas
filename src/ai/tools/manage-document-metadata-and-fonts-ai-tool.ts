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

export class ManageDocumentMetadataAndFontsAiTool extends AbstractAiTool {
    public readonly name = "manage_metadata_and_fonts";
    public readonly category = "file" as const;
    public readonly icon = "🏷️";
    public readonly description =
        "Inspects, adds, updates, or removes document metadata (Title, Author, Copyright, Description, Subject, Keywords, Software, Creation Date, Camera EXIF fields, GPS coordinates, Custom Attributes) and embedded fonts (.ttf, .otf, .woff, .woff2) inside the canvas.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: [
                    "inspect",
                    "set_metadata",
                    "clear_metadata_field",
                    "embed_font_from_file",
                    "export_embedded_font",
                    "remove_embedded_font"
                ],
                description:
                    "Action: 'inspect' (returns all metadata & embedded fonts), 'set_metadata' (sets/merges metadata fields), 'clear_metadata_field' (removes a specific metadata key or custom attribute), 'embed_font_from_file' (embeds a .ttf/.otf/.woff/.woff2 font file into the project), 'export_embedded_font' (writes an embedded font to disk), or 'remove_embedded_font'."
            },
            title: { type: "string", description: "Document title." },
            author: { type: "string", description: "Document author/artist." },
            copyright: { type: "string", description: "Copyright notice." },
            description: { type: "string", description: "Document description / caption." },
            subject: { type: "string", description: "Document subject." },
            software: { type: "string", description: "Software string." },
            creationDate: { type: "string", description: "ISO 8601 creation timestamp." },
            cameraMake: { type: "string", description: "EXIF camera make." },
            cameraModel: { type: "string", description: "EXIF camera model." },
            exposureTime: { type: "string", description: "EXIF exposure time (e.g. '1/125')." },
            fNumber: { type: "number", description: "EXIF aperture f-number (e.g. 2.8)." },
            isoSpeed: { type: "number", description: "EXIF ISO speed rating." },
            focalLength: { type: "number", description: "EXIF focal length in mm (e.g. 50)." },
            gpsLatitude: { type: "number", description: "GPS latitude in decimal degrees." },
            gpsLongitude: { type: "number", description: "GPS longitude in decimal degrees." },
            gpsAltitude: { type: "number", description: "GPS altitude in meters." },
            customAttributes: {
                type: "object",
                description: "Key-value map of custom metadata attributes to merge."
            },
            fieldToClear: {
                type: "string",
                description: "Metadata field name or custom key to remove when action === 'clear_metadata_field'."
            },
            fontFilePath: {
                type: "string",
                description: "Path to a .ttf/.otf/.woff/.woff2 font file when action === 'embed_font_from_file', or output path when action === 'export_embedded_font'."
            },
            fontFamily: { type: "string", description: "Optional font family name when embedding a font." },
            fontWeight: { type: "string", description: "Optional font weight (default 'normal')." },
            fontStyle: { type: "string", description: "Optional font style (default 'normal')." },
            fontId: { type: "string", description: "Target embedded font ID or family name for 'export_embedded_font' or 'remove_embedded_font'." }
        },
        required: ["action"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        return `Managing document metadata & fonts (${partialArgs.action || "inspect"})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, _result: any): string {
        return `Completed metadata/font action '${args.action}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const cState = state.getCanvasState();
        const act = args.action || "inspect";

        const resolvePath = (p: string): string =>
            path.isAbsolute(p) ? p : path.resolve(state.engine.projectRoot, p);

        if (act === "inspect") {
            return {
                dpi: cState.dpi ?? 72,
                metadata: cState.metadata || {},
                embeddedFonts: Object.values(cState.embeddedFonts || {}).map(f => ({
                    id: f.id,
                    name: f.name,
                    family: f.family,
                    format: f.format,
                    mimeType: f.mimeType,
                    weight: f.weight || f.fontWeight || "normal",
                    style: f.style || f.fontStyle || "normal",
                    byteSize: f.byteLength ?? Math.round((f.dataBase64?.length || 0) * 0.75)
                }))
            };
        }

        if (act === "set_metadata") {
            const meta = { ...(cState.metadata || {}) };
            if (args.title !== undefined) meta.title = String(args.title);
            if (args.author !== undefined) meta.author = String(args.author);
            if (args.copyright !== undefined) meta.copyright = String(args.copyright);
            if (args.description !== undefined) meta.description = String(args.description);
            if (args.subject !== undefined) meta.subject = String(args.subject);
            if (args.software !== undefined) meta.software = String(args.software);
            if (args.creationDate !== undefined) meta.createdAt = String(args.creationDate);
            if (args.cameraMake !== undefined) meta.make = String(args.cameraMake);
            if (args.cameraModel !== undefined) meta.model = String(args.cameraModel);
            if (args.exposureTime !== undefined) meta.exposureTime = String(args.exposureTime);
            if (args.fNumber !== undefined) meta.fNumber = Number(args.fNumber);
            if (args.isoSpeed !== undefined) meta.isoSpeed = Number(args.isoSpeed);
            if (args.focalLength !== undefined) meta.focalLengthMm = Number(args.focalLength);
            if (args.gpsLatitude !== undefined || args.gpsLongitude !== undefined || args.gpsAltitude !== undefined) {
                meta.gps = {
                    ...(meta.gps || {}),
                    ...(args.gpsLatitude !== undefined ? { latitude: Number(args.gpsLatitude) } : {}),
                    ...(args.gpsLongitude !== undefined ? { longitude: Number(args.gpsLongitude) } : {}),
                    ...(args.gpsAltitude !== undefined ? { altitude: Number(args.gpsAltitude) } : {})
                };
            }
            if (args.customAttributes && typeof args.customAttributes === "object") {
                meta.custom = {
                    ...(meta.custom || {}),
                    ...args.customAttributes
                };
            }
            cState.metadata = meta;
            state.engine.saveCanvas(cState);
            state.setStatus("AI updated document metadata.");
            return { metadata: cState.metadata };
        }

        if (act === "clear_metadata_field") {
            const key = String(args.fieldToClear || "").trim();
            if (!key) throw new Error("fieldToClear is required for clear_metadata_field.");
            if (cState.metadata) {
                delete (cState.metadata as any)[key];
                if (cState.metadata.custom) {
                    delete cState.metadata.custom[key];
                }
            }
            state.engine.saveCanvas(cState);
            return { cleared: key, metadata: cState.metadata || {} };
        }

        if (act === "embed_font_from_file") {
            if (!args.fontFilePath) throw new Error("fontFilePath is required for embed_font_from_file.");
            const resolvedPath = resolvePath(String(args.fontFilePath));
            const buf = fs.readFileSync(resolvedPath);
            const ext = path.extname(resolvedPath).toLowerCase();
            const mimeMap: Record<string, string> = {
                ".ttf": "font/ttf",
                ".otf": "font/otf",
                ".woff": "font/woff",
                ".woff2": "font/woff2"
            };
            const formatMap: Record<string, "ttf" | "otf" | "woff" | "woff2"> = {
                ".ttf": "ttf",
                ".otf": "otf",
                ".woff": "woff",
                ".woff2": "woff2"
            };
            const baseName = path.basename(resolvedPath, ext);
            const family = String(args.fontFamily || baseName);
            const fontId = `font_${family.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
            if (!cState.embeddedFonts) cState.embeddedFonts = {};
            const entry = {
                id: fontId,
                name: family,
                family,
                format: formatMap[ext] || "ttf",
                mimeType: mimeMap[ext] || "font/ttf",
                dataBase64: buf.toString("base64"),
                byteLength: buf.length,
                weight: args.fontWeight || "normal",
                fontWeight: args.fontWeight || "normal",
                style: args.fontStyle || "normal",
                fontStyle: args.fontStyle || "normal",
                source: path.basename(resolvedPath)
            };
            cState.embeddedFonts[fontId] = entry;
            state.engine.saveCanvas(cState);
            state.setStatus(`AI embedded font "${family}" (${buf.length} bytes).`);
            return {
                embeddedFont: {
                    id: entry.id,
                    family: entry.family,
                    format: entry.format,
                    mimeType: entry.mimeType,
                    byteSize: buf.length
                }
            };
        }

        if (act === "export_embedded_font") {
            if (!args.fontId || !args.fontFilePath) {
                throw new Error("fontId and fontFilePath are required for export_embedded_font.");
            }
            const fontsMap = cState.embeddedFonts || {};
            const found = fontsMap[args.fontId] || Object.values(fontsMap).find(f => f.id === args.fontId || f.family === args.fontId);
            if (!found) throw new Error(`Embedded font '${args.fontId}' not found.`);
            const resolvedOut = resolvePath(String(args.fontFilePath));
            fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
            const raw = Buffer.from(found.dataBase64, "base64");
            fs.writeFileSync(resolvedOut, raw);
            return { fontId: found.id, family: found.family, outputPath: resolvedOut, bytesWritten: raw.length };
        }

        if (act === "remove_embedded_font") {
            if (!args.fontId) throw new Error("fontId is required for remove_embedded_font.");
            const fontsMap = cState.embeddedFonts || {};
            let removed = 0;
            for (const [k, v] of Object.entries(fontsMap)) {
                if (k === args.fontId || v.id === args.fontId || v.family === args.fontId) {
                    delete fontsMap[k];
                    removed++;
                }
            }
            cState.embeddedFonts = fontsMap;
            state.engine.saveCanvas(cState);
            return { removed, remainingFonts: Object.keys(fontsMap).length };
        }

        throw new Error(`Unknown manage_metadata_and_fonts action: '${act}'`);
    }
}
