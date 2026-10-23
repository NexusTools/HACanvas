import type { DocumentMetadataSpec, GpsMetadataSpec } from "../types/document-metadata-types.js";

export function hasMeaningfulMetadata(meta?: DocumentMetadataSpec): boolean {
    if (!meta) return false;
    if (
        meta.title ||
        meta.author ||
        meta.description ||
        meta.subject ||
        meta.copyright ||
        meta.comment ||
        meta.software ||
        meta.createdAt ||
        meta.make ||
        meta.model ||
        meta.lensModel ||
        meta.exposureTime ||
        (meta.keywords && meta.keywords.length > 0) ||
        meta.rating !== undefined ||
        meta.focalLengthMm !== undefined ||
        meta.fNumber !== undefined ||
        meta.isoSpeed !== undefined ||
        meta.orientation !== undefined
    ) {
        return true;
    }
    if (
        meta.gps &&
        (meta.gps.latitude !== undefined ||
            meta.gps.longitude !== undefined ||
            meta.gps.altitude !== undefined ||
            meta.gps.locationName ||
            meta.gps.country)
    ) {
        return true;
    }
    if (meta.custom && Object.keys(meta.custom).length > 0) {
        return true;
    }
    return false;
}

function escapeXmlForXmp(str: string): string {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function unescapeXmlForXmp(str: string): string {
    return String(str)
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

export function buildXmpPacketString(meta: DocumentMetadataSpec): string {
    const attrs: string[] = [];
    if (meta.title) attrs.push(`ha:title="${escapeXmlForXmp(meta.title)}"`);
    if (meta.author) attrs.push(`ha:author="${escapeXmlForXmp(meta.author)}"`);
    if (meta.description) attrs.push(`ha:description="${escapeXmlForXmp(meta.description)}"`);
    if (meta.subject) attrs.push(`ha:subject="${escapeXmlForXmp(meta.subject)}"`);
    if (meta.copyright) attrs.push(`ha:copyright="${escapeXmlForXmp(meta.copyright)}"`);
    if (meta.comment) attrs.push(`ha:comment="${escapeXmlForXmp(meta.comment)}"`);
    if (meta.software) attrs.push(`xmp:CreatorTool="${escapeXmlForXmp(meta.software)}"`);
    if (meta.createdAt) attrs.push(`xmp:CreateDate="${escapeXmlForXmp(meta.createdAt)}"`);
    if (meta.rating !== undefined) attrs.push(`xmp:Rating="${meta.rating}"`);
    if (meta.make) attrs.push(`tiff:Make="${escapeXmlForXmp(meta.make)}"`);
    if (meta.model) attrs.push(`tiff:Model="${escapeXmlForXmp(meta.model)}"`);
    if (meta.lensModel) attrs.push(`aux:Lens="${escapeXmlForXmp(meta.lensModel)}"`);
    if (meta.focalLengthMm !== undefined) attrs.push(`exif:FocalLength="${meta.focalLengthMm}"`);
    if (meta.fNumber !== undefined) attrs.push(`exif:FNumber="${meta.fNumber}"`);
    if (meta.exposureTime) attrs.push(`exif:ExposureTime="${escapeXmlForXmp(meta.exposureTime)}"`);
    if (meta.isoSpeed !== undefined) attrs.push(`exif:ISOSpeedRatings="${meta.isoSpeed}"`);
    if (meta.keywords && meta.keywords.length > 0) {
        attrs.push(`ha:keywords="${escapeXmlForXmp(meta.keywords.join(", "))}"`);
    }
    if (meta.gps) {
        if (meta.gps.latitude !== undefined) attrs.push(`exif:GPSLatitude="${meta.gps.latitude}"`);
        if (meta.gps.longitude !== undefined) attrs.push(`exif:GPSLongitude="${meta.gps.longitude}"`);
        if (meta.gps.altitude !== undefined) attrs.push(`exif:GPSAltitude="${meta.gps.altitude}"`);
        if (meta.gps.locationName) attrs.push(`photoshop:City="${escapeXmlForXmp(meta.gps.locationName)}"`);
        if (meta.gps.country) attrs.push(`photoshop:Country="${escapeXmlForXmp(meta.gps.country)}"`);
    }

    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:tiff="http://ns.adobe.com/tiff/1.0/"
      xmlns:exif="http://ns.adobe.com/exif/1.0/"
      xmlns:aux="http://ns.adobe.com/exif/1.0/aux/"
      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
      xmlns:ha="http://schemas.aicore.local/hybrid-art/2026/metadata"
      ${attrs.join("\n      ")}>
      ${meta.title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXmlForXmp(meta.title)}</rdf:li></rdf:Alt></dc:title>` : ""}
      ${meta.author ? `<dc:creator><rdf:Seq><rdf:li>${escapeXmlForXmp(meta.author)}</rdf:li></rdf:Seq></dc:creator>` : ""}
      ${meta.description ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXmlForXmp(meta.description)}</rdf:li></rdf:Alt></dc:description>` : ""}
      ${meta.copyright ? `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXmlForXmp(meta.copyright)}</rdf:li></rdf:Alt></dc:rights>` : ""}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export function parseXmpPacketString(xmpXml: string): DocumentMetadataSpec {
    const out: DocumentMetadataSpec = {};
    const getAttr = (name: string): string | undefined => {
        const re = new RegExp(`${name}="([^"]*)"`, "i");
        const m = xmpXml.match(re);
        return m ? unescapeXmlForXmp(m[1]) : undefined;
    };
    const getTag = (tag: string): string | undefined => {
        const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
        const m = xmpXml.match(re);
        if (!m) return undefined;
        const liMatch = m[1].match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
        return unescapeXmlForXmp((liMatch ? liMatch[1] : m[1]).trim());
    };

    out.title = getAttr("ha:title") || getTag("dc:title");
    out.author = getAttr("ha:author") || getTag("dc:creator");
    out.description = getAttr("ha:description") || getTag("dc:description");
    out.subject = getAttr("ha:subject");
    out.copyright = getAttr("ha:copyright") || getTag("dc:rights");
    out.comment = getAttr("ha:comment");
    out.software = getAttr("xmp:CreatorTool");
    out.createdAt = getAttr("xmp:CreateDate");
    out.make = getAttr("tiff:Make");
    out.model = getAttr("tiff:Model");
    out.lensModel = getAttr("aux:Lens");
    out.exposureTime = getAttr("exif:ExposureTime");

    const ratingStr = getAttr("xmp:Rating");
    if (ratingStr !== undefined && !Number.isNaN(parseFloat(ratingStr))) out.rating = parseFloat(ratingStr);
    const focalStr = getAttr("exif:FocalLength");
    if (focalStr !== undefined && !Number.isNaN(parseFloat(focalStr))) out.focalLengthMm = parseFloat(focalStr);
    const fnStr = getAttr("exif:FNumber");
    if (fnStr !== undefined && !Number.isNaN(parseFloat(fnStr))) out.fNumber = parseFloat(fnStr);
    const isoStr = getAttr("exif:ISOSpeedRatings");
    if (isoStr !== undefined && !Number.isNaN(parseInt(isoStr, 10))) out.isoSpeed = parseInt(isoStr, 10);

    const kwStr = getAttr("ha:keywords");
    if (kwStr) {
        out.keywords = kwStr.split(",").map(s => s.trim()).filter(Boolean);
    }

    const latStr = getAttr("exif:GPSLatitude");
    const lonStr = getAttr("exif:GPSLongitude");
    const altStr = getAttr("exif:GPSAltitude");
    const cityStr = getAttr("photoshop:City");
    const countryStr = getAttr("photoshop:Country");
    if (latStr !== undefined || lonStr !== undefined || altStr !== undefined || cityStr || countryStr) {
        out.gps = {};
        if (latStr !== undefined && !Number.isNaN(parseFloat(latStr))) out.gps.latitude = parseFloat(latStr);
        if (lonStr !== undefined && !Number.isNaN(parseFloat(lonStr))) out.gps.longitude = parseFloat(lonStr);
        if (altStr !== undefined && !Number.isNaN(parseFloat(altStr))) out.gps.altitude = parseFloat(altStr);
        if (cityStr) out.gps.locationName = cityStr;
        if (countryStr) out.gps.country = countryStr;
    }

    return out;
}

/**
 * Builds a standards-compliant Little-Endian (`II\x2A\x00`) TIFF/EXIF payload buffer
 * containing `IFD0` (ImageDescription, Make, Model, Orientation, Software, DateTime, Artist, Copyright),
 * `ExifIFD` (FNumber, ISOSpeedRatings, DateTimeOriginal, FocalLength, UserComment, LensModel),
 * and `GPSIFD` (GPSVersionID, GPSLatitudeRef, GPSLatitude, GPSLongitudeRef, GPSLongitude, GPSAltitudeRef, GPSAltitude, GPSAreaInformation).
 */
export function buildExifTiffPayload(meta: DocumentMetadataSpec): Buffer {
    interface IfdEntrySpec {
        tag: number;
        type: 1 | 2 | 3 | 4 | 5 | 7; // 1=BYTE, 2=ASCII, 3=SHORT, 4=LONG, 5=RATIONAL, 7=UNDEFINED
        count: number;
        valueBytes: Buffer;
    }

    const asciiEntry = (tag: number, str: string): IfdEntrySpec => {
        const buf = Buffer.from(str + "\0", "latin1");
        return { tag, type: 2, count: buf.length, valueBytes: buf };
    };
    const shortEntry = (tag: number, val: number): IfdEntrySpec => {
        const buf = Buffer.alloc(4);
        buf.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(val))), 0);
        return { tag, type: 3, count: 1, valueBytes: buf };
    };
    const longEntry = (tag: number, val: number): IfdEntrySpec => {
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(val >>> 0, 0);
        return { tag, type: 4, count: 1, valueBytes: buf };
    };
    const rationalEntry = (tag: number, pairs: Array<[number, number]>): IfdEntrySpec => {
        const buf = Buffer.alloc(pairs.length * 8);
        pairs.forEach(([num, den], idx) => {
            buf.writeUInt32LE(Math.max(0, Math.round(num)) >>> 0, idx * 8);
            buf.writeUInt32LE(Math.max(1, Math.round(den)) >>> 0, idx * 8 + 4);
        });
        return { tag, type: 5, count: pairs.length, valueBytes: buf };
    };
    const decimalToDmsRationals = (dec: number): Array<[number, number]> => {
        const abs = Math.abs(dec);
        const deg = Math.floor(abs);
        const minFloat = (abs - deg) * 60;
        const min = Math.floor(minFloat);
        const sec = (minFloat - min) * 60;
        return [
            [deg, 1],
            [min, 1],
            [Math.round(sec * 10000), 10000]
        ];
    };

    const ifd0: IfdEntrySpec[] = [];
    const exifIfd: IfdEntrySpec[] = [];
    const gpsIfd: IfdEntrySpec[] = [];

    const descOrTitle = meta.description || meta.title;
    if (descOrTitle) ifd0.push(asciiEntry(0x010e, descOrTitle));
    if (meta.make) ifd0.push(asciiEntry(0x010f, meta.make));
    if (meta.model) ifd0.push(asciiEntry(0x0110, meta.model));
    if (meta.orientation) ifd0.push(shortEntry(0x0112, meta.orientation));
    if (meta.software) ifd0.push(asciiEntry(0x0131, meta.software));
    if (meta.createdAt) ifd0.push(asciiEntry(0x0132, meta.createdAt));
    if (meta.author) ifd0.push(asciiEntry(0x013b, meta.author));
    if (meta.copyright) ifd0.push(asciiEntry(0x8298, meta.copyright));

    if (meta.fNumber !== undefined && meta.fNumber > 0) {
        exifIfd.push(rationalEntry(0x829d, [[Math.round(meta.fNumber * 100), 100]]));
    }
    if (meta.isoSpeed !== undefined && meta.isoSpeed > 0) {
        exifIfd.push(shortEntry(0x8827, meta.isoSpeed));
    }
    if (meta.createdAt) {
        exifIfd.push(asciiEntry(0x9003, meta.createdAt));
    }
    if (meta.focalLengthMm !== undefined && meta.focalLengthMm > 0) {
        exifIfd.push(rationalEntry(0x920a, [[Math.round(meta.focalLengthMm * 100), 100]]));
    }
    if (meta.comment) {
        const prefix = Buffer.from("ASCII\0\0\0", "ascii");
        const body = Buffer.from(meta.comment, "latin1");
        const val = Buffer.concat([prefix, body]);
        exifIfd.push({ tag: 0x9286, type: 7, count: val.length, valueBytes: val });
    }
    if (meta.lensModel) {
        exifIfd.push(asciiEntry(0xa434, meta.lensModel));
    }

    if (meta.gps) {
        const hasLatLon =
            meta.gps.latitude !== undefined &&
            !Number.isNaN(meta.gps.latitude) &&
            meta.gps.longitude !== undefined &&
            !Number.isNaN(meta.gps.longitude);
        if (hasLatLon || meta.gps.altitude !== undefined || meta.gps.locationName) {
            gpsIfd.push({ tag: 0x0000, type: 1, count: 4, valueBytes: Buffer.from([2, 3, 0, 0]) });
            if (hasLatLon) {
                const lat = meta.gps.latitude!;
                const lon = meta.gps.longitude!;
                gpsIfd.push(asciiEntry(0x0001, lat >= 0 ? "N" : "S"));
                gpsIfd.push(rationalEntry(0x0002, decimalToDmsRationals(lat)));
                gpsIfd.push(asciiEntry(0x0003, lon >= 0 ? "E" : "W"));
                gpsIfd.push(rationalEntry(0x0004, decimalToDmsRationals(lon)));
            }
            if (meta.gps.altitude !== undefined && !Number.isNaN(meta.gps.altitude)) {
                const alt = meta.gps.altitude;
                gpsIfd.push({ tag: 0x0005, type: 1, count: 1, valueBytes: Buffer.from([alt < 0 ? 1 : 0, 0, 0, 0]) });
                gpsIfd.push(rationalEntry(0x0006, [[Math.round(Math.abs(alt) * 100), 100]]));
            }
            if (meta.gps.locationName) {
                const locStr = meta.gps.country
                    ? `${meta.gps.locationName}, ${meta.gps.country}`
                    : meta.gps.locationName;
                const prefix = Buffer.from("ASCII\0\0\0", "ascii");
                const body = Buffer.from(locStr, "latin1");
                const val = Buffer.concat([prefix, body]);
                gpsIfd.push({ tag: 0x001c, type: 7, count: val.length, valueBytes: val });
            }
        }
    }

    const serializeIfd = (entries: IfdEntrySpec[], baseOffset: number): Buffer => {
        entries.sort((a, b) => a.tag - b.tag);
        const dirSize = 2 + entries.length * 12 + 4;
        let dataOffset = baseOffset + dirSize;
        const dirBuf = Buffer.alloc(dirSize);
        dirBuf.writeUInt16LE(entries.length, 0);
        const extraBuffers: Buffer[] = [];

        entries.forEach((e, idx) => {
            const pos = 2 + idx * 12;
            dirBuf.writeUInt16LE(e.tag, pos);
            dirBuf.writeUInt16LE(e.type, pos + 2);
            dirBuf.writeUInt32LE(e.count, pos + 4);
            if (e.valueBytes.length <= 4) {
                const inline = Buffer.alloc(4);
                e.valueBytes.copy(inline, 0, 0, e.valueBytes.length);
                inline.copy(dirBuf, pos + 8);
            } else {
                dirBuf.writeUInt32LE(dataOffset, pos + 8);
                const paddedLen = e.valueBytes.length + (e.valueBytes.length % 2);
                const padded = Buffer.alloc(paddedLen);
                e.valueBytes.copy(padded);
                extraBuffers.push(padded);
                dataOffset += paddedLen;
            }
        });
        dirBuf.writeUInt32LE(0, 2 + entries.length * 12); // Next IFD offset = 0
        return Buffer.concat([dirBuf, ...extraBuffers]);
    };

    // Reserve pointer entries in IFD0 if ExifIFD or GPSIFD have entries
    const hasExif = exifIfd.length > 0;
    const hasGps = gpsIfd.length > 0;
    if (hasExif) ifd0.push(longEntry(0x8769, 0));
    if (hasGps) ifd0.push(longEntry(0x8825, 0));

    // Pass 1 to compute IFD0 size
    const dummyIfd0 = serializeIfd(ifd0, 8);
    let curOffset = 8 + dummyIfd0.length;
    let exifBuf: Buffer = Buffer.alloc(0);
    let gpsBuf: Buffer = Buffer.alloc(0);

    if (hasExif) {
        const ptrEntry = ifd0.find(e => e.tag === 0x8769)!;
        ptrEntry.valueBytes.writeUInt32LE(curOffset, 0);
        exifBuf = serializeIfd(exifIfd, curOffset);
        curOffset += exifBuf.length;
    }
    if (hasGps) {
        const ptrEntry = ifd0.find(e => e.tag === 0x8825)!;
        ptrEntry.valueBytes.writeUInt32LE(curOffset, 0);
        gpsBuf = serializeIfd(gpsIfd, curOffset);
        curOffset += gpsBuf.length;
    }

    const finalIfd0 = serializeIfd(ifd0, 8);
    const tiffHeader = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    return Buffer.concat([tiffHeader, finalIfd0, exifBuf, gpsBuf]);
}

/**
 * Parses a Little-Endian (`II`) or Big-Endian (`MM`) TIFF/EXIF buffer back into `DocumentMetadataSpec`.
 */
export function parseExifTiffPayload(tiffBuf: Buffer): DocumentMetadataSpec {
    const out: DocumentMetadataSpec = {};
    if (!tiffBuf || tiffBuf.length < 8) return out;

    const byteOrder = tiffBuf.toString("ascii", 0, 2);
    if (byteOrder !== "II" && byteOrder !== "MM") return out;
    const le = byteOrder === "II";

    const r16 = (off: number) => (off + 2 <= tiffBuf.length ? (le ? tiffBuf.readUInt16LE(off) : tiffBuf.readUInt16BE(off)) : 0);
    const r32 = (off: number) => (off + 4 <= tiffBuf.length ? (le ? tiffBuf.readUInt32LE(off) : tiffBuf.readUInt32BE(off)) : 0);

    const readAscii = (valOffset: number, count: number): string => {
        if (valOffset < 0 || valOffset + count > tiffBuf.length) return "";
        return tiffBuf.subarray(valOffset, valOffset + count).toString("latin1").replace(/\0+$/, "").trim();
    };

    const readRational = (valOffset: number): number => {
        if (valOffset < 0 || valOffset + 8 > tiffBuf.length) return 0;
        const num = r32(valOffset);
        const den = r32(valOffset + 4);
        return den !== 0 ? num / den : 0;
    };

    let gpsLatRef = "N";
    let gpsLonRef = "E";
    let gpsLatAbs: number | undefined;
    let gpsLonAbs: number | undefined;
    let gpsAltRef = 0;
    let gpsAltAbs: number | undefined;
    let gpsLocName: string | undefined;

    const parseIfdAt = (ifdOffset: number, kind: "ifd0" | "exif" | "gps") => {
        if (ifdOffset <= 0 || ifdOffset + 2 > tiffBuf.length) return;
        const numEntries = r16(ifdOffset);
        for (let i = 0; i < numEntries; i++) {
            const entryOff = ifdOffset + 2 + i * 12;
            if (entryOff + 12 > tiffBuf.length) break;
            const tag = r16(entryOff);
            const type = r16(entryOff + 2);
            const count = r32(entryOff + 4);
            const typeSize = type === 5 ? 8 : type === 4 ? 4 : type === 3 ? 2 : 1;
            const byteLen = count * typeSize;
            const valOff = byteLen <= 4 ? entryOff + 8 : r32(entryOff + 8);

            if (kind === "ifd0") {
                if (tag === 0x010e) {
                    const desc = readAscii(valOff, count);
                    if (desc) {
                        out.description = desc;
                        if (!out.title) out.title = desc;
                    }
                } else if (tag === 0x010f) out.make = readAscii(valOff, count);
                else if (tag === 0x0110) out.model = readAscii(valOff, count);
                else if (tag === 0x0112) out.orientation = r16(valOff);
                else if (tag === 0x0131) out.software = readAscii(valOff, count);
                else if (tag === 0x0132) out.createdAt = readAscii(valOff, count);
                else if (tag === 0x013b) out.author = readAscii(valOff, count);
                else if (tag === 0x8298) out.copyright = readAscii(valOff, count);
                else if (tag === 0x8769) parseIfdAt(r32(entryOff + 8), "exif");
                else if (tag === 0x8825) parseIfdAt(r32(entryOff + 8), "gps");
            } else if (kind === "exif") {
                if (tag === 0x829d) out.fNumber = Math.round(readRational(valOff) * 100) / 100;
                else if (tag === 0x8827) out.isoSpeed = r16(valOff);
                else if (tag === 0x9003 && !out.createdAt) out.createdAt = readAscii(valOff, count);
                else if (tag === 0x920a) out.focalLengthMm = Math.round(readRational(valOff) * 100) / 100;
                else if (tag === 0x9286 && valOff + count <= tiffBuf.length) {
                    const raw = tiffBuf.subarray(valOff, valOff + count);
                    const str = (raw.length > 8 && raw.toString("ascii", 0, 5) === "ASCII"
                        ? raw.subarray(8)
                        : raw
                    ).toString("latin1").replace(/\0+$/, "").trim();
                    if (str) out.comment = str;
                } else if (tag === 0xa434) out.lensModel = readAscii(valOff, count);
            } else if (kind === "gps") {
                if (tag === 0x0001) gpsLatRef = readAscii(valOff, count).toUpperCase() || "N";
                else if (tag === 0x0002 && count >= 3) {
                    const d = readRational(valOff);
                    const m = readRational(valOff + 8);
                    const s = readRational(valOff + 16);
                    gpsLatAbs = Math.round((d + m / 60 + s / 3600) * 1000000) / 1000000;
                } else if (tag === 0x0003) gpsLonRef = readAscii(valOff, count).toUpperCase() || "E";
                else if (tag === 0x0004 && count >= 3) {
                    const d = readRational(valOff);
                    const m = readRational(valOff + 8);
                    const s = readRational(valOff + 16);
                    gpsLonAbs = Math.round((d + m / 60 + s / 3600) * 1000000) / 1000000;
                } else if (tag === 0x0005 && valOff < tiffBuf.length) {
                    gpsAltRef = tiffBuf[valOff];
                } else if (tag === 0x0006) {
                    gpsAltAbs = Math.round(readRational(valOff) * 100) / 100;
                } else if (tag === 0x001c && valOff + count <= tiffBuf.length) {
                    const raw = tiffBuf.subarray(valOff, valOff + count);
                    gpsLocName = (raw.length > 8 && raw.toString("ascii", 0, 5) === "ASCII"
                        ? raw.subarray(8)
                        : raw
                    ).toString("latin1").replace(/\0+$/, "").trim();
                }
            }
        }
    };

    const ifd0Offset = r32(4);
    parseIfdAt(ifd0Offset, "ifd0");

    if (gpsLatAbs !== undefined || gpsLonAbs !== undefined || gpsAltAbs !== undefined || gpsLocName) {
        out.gps = {};
        if (gpsLatAbs !== undefined) out.gps.latitude = gpsLatRef === "S" ? -gpsLatAbs : gpsLatAbs;
        if (gpsLonAbs !== undefined) out.gps.longitude = gpsLonRef === "W" ? -gpsLonAbs : gpsLonAbs;
        if (gpsAltAbs !== undefined) out.gps.altitude = gpsAltRef === 1 ? -gpsAltAbs : gpsAltAbs;
        if (gpsLocName) out.gps.locationName = gpsLocName;
    }

    return out;
}

/**
 * Injects APP1 EXIF (`Exif\0\0` + TIFF header with IFD0/ExifIFD/GPSIFD), APP1 XMP (`http://ns.adobe.com/xap/1.0/\0`),
 * and optional COM (`FF FE`) comment segments into a JPEG buffer.
 */
export function injectJpegExifAndXmp(jpegBuf: Buffer, metadata?: DocumentMetadataSpec): Buffer {
    if (!metadata || !hasMeaningfulMetadata(metadata)) return jpegBuf;
    if (jpegBuf.length < 4 || jpegBuf[0] !== 0xff || jpegBuf[1] !== 0xd8) return jpegBuf;

    const segments: Buffer[] = [jpegBuf.subarray(0, 2)]; // SOI (FF D8)

    // 1. APP1 Exif segment
    const tiffPayload = buildExifTiffPayload(metadata);
    const exifHeader = Buffer.from("Exif\0\0", "ascii");
    const app1ExifBody = Buffer.concat([exifHeader, tiffPayload]);
    if (app1ExifBody.length + 2 <= 65535) {
        const marker = Buffer.alloc(4);
        marker[0] = 0xff;
        marker[1] = 0xe1;
        marker.writeUInt16BE(app1ExifBody.length + 2, 2);
        segments.push(marker, app1ExifBody);
    }

    // 2. APP1 XMP segment
    const xmpStr = buildXmpPacketString(metadata);
    const xmpHeader = Buffer.from("http://ns.adobe.com/xap/1.0/\0", "ascii");
    const app1XmpBody = Buffer.concat([xmpHeader, Buffer.from(xmpStr, "utf8")]);
    if (app1XmpBody.length + 2 <= 65535) {
        const marker = Buffer.alloc(4);
        marker[0] = 0xff;
        marker[1] = 0xe1;
        marker.writeUInt16BE(app1XmpBody.length + 2, 2);
        segments.push(marker, app1XmpBody);
    }

    // 3. JPEG COM (`FF FE`) comment segment if comment is present
    const commentText = metadata.comment || metadata.description;
    if (commentText && commentText.trim().length > 0) {
        const comBody = Buffer.from(commentText.trim(), "utf8");
        if (comBody.length + 2 <= 65535) {
            const marker = Buffer.alloc(4);
            marker[0] = 0xff;
            marker[1] = 0xfe;
            marker.writeUInt16BE(comBody.length + 2, 2);
            segments.push(marker, comBody);
        }
    }

    segments.push(jpegBuf.subarray(2));
    return Buffer.concat(segments);
}

/**
 * Extracts EXIF, GPS, XMP, and COM metadata from a JPEG buffer.
 */
export function extractJpegExifMetadata(jpegBuf: Buffer): DocumentMetadataSpec {
    const merged: DocumentMetadataSpec = {};
    if (!jpegBuf || jpegBuf.length < 4 || jpegBuf[0] !== 0xff || jpegBuf[1] !== 0xd8) {
        return merged;
    }

    let offset = 2;
    while (offset + 4 <= jpegBuf.length) {
        if (jpegBuf[offset] !== 0xff) break;
        const marker = jpegBuf[offset + 1];
        if (marker === 0xda || marker === 0xd9) break; // SOS or EOI
        if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        const segLen = jpegBuf.readUInt16BE(offset + 2);
        if (segLen < 2 || offset + 2 + segLen > jpegBuf.length) break;
        const segData = jpegBuf.subarray(offset + 4, offset + 2 + segLen);

        if (marker === 0xe1) {
            if (segData.length > 6 && segData.toString("ascii", 0, 6) === "Exif\0\0") {
                const exifMeta = parseExifTiffPayload(segData.subarray(6));
                Object.assign(merged, exifMeta, {
                    gps: { ...(merged.gps || {}), ...(exifMeta.gps || {}) }
                });
                if (merged.gps && Object.keys(merged.gps).length === 0) delete merged.gps;
            } else if (
                segData.length > 29 &&
                segData.toString("ascii", 0, 29) === "http://ns.adobe.com/xap/1.0/\0"
            ) {
                const xmpMeta = parseXmpPacketString(segData.subarray(29).toString("utf8"));
                for (const [k, v] of Object.entries(xmpMeta)) {
                    if (v !== undefined && k !== "gps") (merged as any)[k] = v;
                }
                if (xmpMeta.gps) {
                    merged.gps = { ...(merged.gps || {}), ...xmpMeta.gps };
                }
            }
        } else if (marker === 0xfe && segData.length > 0) {
            const comStr = segData.toString("utf8").replace(/\0+$/, "").trim();
            if (comStr && !merged.comment) merged.comment = comStr;
        }

        offset += 2 + segLen;
    }

    return merged;
}

/**
 * Extracts `tEXt`, `iTXt`, and `eXIf` metadata chunks from a PNG buffer.
 */
