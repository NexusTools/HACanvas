import type { BlendMode, VectorObjectSpec, SharedObjectCanvasSpec } from "../hybrid-art-engine.js";

export interface EmbeddedFontSpec {
    id: string;
    /** Clean font family name (e.g. "Roboto" or "Montserrat-Bold") */
    name: string;
    /** Font family alias used in CSS / SVG font-family */
    family: string;
    /** Original PDF BaseFont / PostScript name (e.g. "ABCDEF+Roboto-Bold") */
    postScriptName?: string;
    /** Font binary format */
    format: "ttf" | "otf" | "woff" | "woff2" | "type1" | "cff";
    /** Font MIME type */
    mimeType?: string;
    /** Base64-encoded raw font binary data */
    dataBase64: string;
    /** Byte size of the raw font binary */
    byteLength?: number;
    /** Font weight ("normal" | "bold" | "700" etc.) */
    fontWeight?: string;
    weight?: string;
    /** Font style ("normal" | "italic" | "oblique") */
    fontStyle?: string;
    style?: string;
    /** Origin/source description */
    source?: string;
}

export interface GpsMetadataSpec {
    /** Latitude in decimal degrees (-90..90, positive = North, negative = South) */
    latitude?: number;
    /** Longitude in decimal degrees (-180..180, positive = East, negative = West) */
    longitude?: number;
    /** Altitude in meters above/below sea level */
    altitude?: number;
    /** Human-readable location / city / sublocation name */
    locationName?: string;
    /** Country name or ISO code */
    country?: string;
}

export interface DocumentMetadataSpec {
    /** Document / Image Title */
    title?: string;
    /** Author / Artist / Creator */
    author?: string;
    /** Image Description / Caption */
    description?: string;
    /** Subject / Category */
    subject?: string;
    /** Keywords / Tags */
    keywords?: string[];
    /** Copyright Notice */
    copyright?: string;
    /** User Comment */
    comment?: string;
    /** Star rating (0..5) */
    rating?: number;
    /** Geolocation (GPS EXIF) */
    gps?: GpsMetadataSpec;
    /** Software used to create/edit */
    software?: string;
    /** Creation timestamp (ISO-8601 or EXIF YYYY:MM:DD HH:MM:SS) */
    createdAt?: string;
    /** Last modified timestamp */
    modifiedAt?: string;
    /** Camera / Device Make */
    make?: string;
    /** Camera / Device Model */
    model?: string;
    /** Lens / Tool Model */
    lensModel?: string;
    /** Focal length in mm */
    focalLengthMm?: number;
    /** Aperture F-Number */
    fNumber?: number;
    /** Exposure time (e.g. "1/125") */
    exposureTime?: string;
    /** ISO speed rating */
    isoSpeed?: number;
    /** EXIF Orientation (1..8) */
    orientation?: number;
    /** Custom key-value metadata pairs */
    custom?: Record<string, string>;
}

export interface DecodedLayerItem {
    name: string;
    type: "raster" | "vector";
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    opacity: number; // 0..1
    visible: boolean;
    blendMode: BlendMode;
    rgba?: Buffer; // canvasWidth * canvasHeight * 4
    objects?: VectorObjectSpec[];
}

export interface DecodedMultiLayerDocument {
    format: string;
    width: number;
    height: number;
    layers: DecodedLayerItem[];
    frames?: { rgba: Buffer; delayMs: number }[];
    embeddedFonts?: EmbeddedFontSpec[];
    metadata?: DocumentMetadataSpec;
    sharedObjects?: Record<string, SharedObjectCanvasSpec>;
    sharedObjectRasters?: Record<string, { layerId: string; width: number; height: number; rgba: Buffer }>;
}

export type {
    IcoIconFormatBpp,
    IcoLayerEntryInput,
    IcoDirectoryEntryInfo
} from "../exporters/ico-exporter.js";


