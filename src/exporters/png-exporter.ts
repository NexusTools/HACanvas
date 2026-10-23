import zlib from "node:zlib";
import { crc32 } from "../zip-xml-package.js";
import type { DocumentMetadataSpec } from "../types/document-metadata-types.js";
import {
    hasMeaningfulMetadata,
    buildXmpPacketString,
    buildExifTiffPayload
} from "./exif-xmp-metadata-exporter.js";

function makePngChunk(type: string, data: Buffer): Buffer {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export interface PngExportOptions {
    /** Zlib compression level (0 = none, 9 = max, default 6) */
    compressionLevel?: number;
    /** Pixel format ("rgba8" = 6, "rgb8" = 2, "graya8" = 4, "gray8" = 0) */
    pixelFormat?: "rgba8" | "rgb8" | "gray8" | "graya8";
    /** Save bKGD background color chunk */
    saveBackground?: boolean;
    backgroundColor?: { r: number; g: number; b: number };
    /** Save pHYs resolution chunk from DPI */
    saveResolution?: boolean;
    dpi?: number;
    /** Save tIME creation timestamp chunk */
    saveCreationTime?: boolean;
    /** Save tEXt comment chunk */
    comment?: string;
    /** Document metadata (EXIF, GPS, Author, Title, Copyright, etc.) */
    metadata?: DocumentMetadataSpec;
}

export function encodeRgbaToPng(
    width: number,
    height: number,
    rgba: Uint8Array | Buffer,
    options: PngExportOptions = {}
): Buffer {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const pixFmt = options.pixelFormat || "rgba8";
    const colorType =
        pixFmt === "rgb8" ? 2 :
        pixFmt === "graya8" ? 4 :
        pixFmt === "gray8" ? 0 : 6;
    const channels =
        colorType === 6 ? 4 :
        colorType === 2 ? 3 :
        colorType === 4 ? 2 : 1;

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth: 8
    ihdr[9] = colorType;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const srcBuf = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    const outStride = width * channels;
    const rawScanlines = Buffer.alloc((outStride + 1) * height);

    for (let y = 0; y < height; y++) {
        const rowStart = y * (outStride + 1);
        rawScanlines[rowStart] = 0; // filter 0 (None)
        if (colorType === 6) {
            const srcOffset = y * width * 4;
            srcBuf.copy(rawScanlines, rowStart + 1, srcOffset, srcOffset + outStride);
        } else {
            for (let x = 0; x < width; x++) {
                const sIdx = (y * width + x) * 4;
                const r = srcBuf[sIdx] || 0;
                const g = srcBuf[sIdx + 1] || 0;
                const b = srcBuf[sIdx + 2] || 0;
                const a = srcBuf[sIdx + 3] ?? 255;
                const dIdx = rowStart + 1 + x * channels;
                if (colorType === 2) {
                    rawScanlines[dIdx] = r;
                    rawScanlines[dIdx + 1] = g;
                    rawScanlines[dIdx + 2] = b;
                } else {
                    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                    rawScanlines[dIdx] = lum;
                    if (colorType === 4) {
                        rawScanlines[dIdx + 1] = a;
                    }
                }
            }
        }
    }

    const extraChunks: Buffer[] = [];
    if (options.saveResolution && options.dpi && options.dpi > 0) {
        const ppm = Math.max(1, Math.round(options.dpi * 39.3700787));
        const phys = Buffer.alloc(9);
        phys.writeUInt32BE(ppm, 0);
        phys.writeUInt32BE(ppm, 4);
        phys[8] = 1; // unit = meter
        extraChunks.push(makePngChunk("pHYs", phys));
    }
    if (options.saveBackground && options.backgroundColor) {
        const bg = options.backgroundColor;
        if (colorType === 2 || colorType === 6) {
            const bkgd = Buffer.alloc(6);
            bkgd.writeUInt16BE(bg.r, 0);
            bkgd.writeUInt16BE(bg.g, 2);
            bkgd.writeUInt16BE(bg.b, 4);
            extraChunks.push(makePngChunk("bKGD", bkgd));
        } else {
            const lum = Math.round(0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b);
            const bkgd = Buffer.alloc(2);
            bkgd.writeUInt16BE(lum, 0);
            extraChunks.push(makePngChunk("bKGD", bkgd));
        }
    }
    if (options.saveCreationTime) {
        const now = new Date();
        const timeBuf = Buffer.alloc(7);
        timeBuf.writeUInt16BE(now.getUTCFullYear(), 0);
        timeBuf[2] = now.getUTCMonth() + 1;
        timeBuf[3] = now.getUTCDate();
        timeBuf[4] = now.getUTCHours();
        timeBuf[5] = now.getUTCMinutes();
        timeBuf[6] = now.getUTCSeconds();
        extraChunks.push(makePngChunk("tIME", timeBuf));
    }
    const meta = options.metadata;
    const effComment = options.comment?.trim() || meta?.comment?.trim() || "";
    if (effComment.length > 0) {
        const textData = Buffer.from(`Comment\0${effComment}`, "latin1");
        extraChunks.push(makePngChunk("tEXt", textData));
    }
    if (meta) {
        const pushText = (key: string, val?: string) => {
            if (val && val.trim().length > 0) {
                extraChunks.push(makePngChunk("tEXt", Buffer.from(`${key}\0${val.trim()}`, "latin1")));
            }
        };
        pushText("Title", meta.title);
        pushText("Author", meta.author);
        pushText("Description", meta.description);
        pushText("Subject", meta.subject);
        pushText("Copyright", meta.copyright);
        pushText("Software", meta.software);
        pushText("Creation Time", meta.createdAt);
        pushText("Make", meta.make);
        pushText("Model", meta.model);
        if (meta.keywords && meta.keywords.length > 0) {
            pushText("Keywords", meta.keywords.join(", "));
        }
        if (meta.gps) {
            if (meta.gps.latitude !== undefined && !Number.isNaN(meta.gps.latitude)) {
                pushText("GPS:Latitude", String(meta.gps.latitude));
            }
            if (meta.gps.longitude !== undefined && !Number.isNaN(meta.gps.longitude)) {
                pushText("GPS:Longitude", String(meta.gps.longitude));
            }
            if (meta.gps.altitude !== undefined && !Number.isNaN(meta.gps.altitude)) {
                pushText("GPS:Altitude", String(meta.gps.altitude));
            }
            pushText("GPS:Location", meta.gps.locationName);
            pushText("GPS:Country", meta.gps.country);
        }
        if (hasMeaningfulMetadata(meta)) {
            const exifTiff = buildExifTiffPayload(meta);
            if (exifTiff.length > 8) {
                extraChunks.push(makePngChunk("eXIf", exifTiff));
            }
            const xmpStr = buildXmpPacketString(meta);
            const itxtHeader = Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1");
            const itxtBody = Buffer.from(xmpStr, "utf8");
            extraChunks.push(makePngChunk("iTXt", Buffer.concat([itxtHeader, itxtBody])));
        }
    }

    const level =
        options.compressionLevel !== undefined
            ? Math.max(0, Math.min(9, Math.round(options.compressionLevel)))
            : 6;
    const compressed = zlib.deflateSync(rawScanlines, { level });
    return Buffer.concat([
        signature,
        makePngChunk("IHDR", ihdr),
        ...extraChunks,
        makePngChunk("IDAT", compressed),
        makePngChunk("IEND", Buffer.alloc(0))
    ]);
}

