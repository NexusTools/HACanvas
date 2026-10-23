import zlib from "node:zlib";

// Precomputed CRC32 table for ZIP & PNG
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    CRC_TABLE[n] = c >>> 0;
}

export function crc32(buf: Buffer | Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

/**
 * Creates a standard PKZIP archive (like .docx / Open Packaging Conventions) from a map of relative file paths to Buffers/strings.
 */
export function createZipArchive(files: Record<string, Buffer | string>): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let currentOffset = 0;
    const entries = Object.entries(files);

    for (const [rawPath, content] of entries) {
        const normalizedPath = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
        const nameBuf = Buffer.from(normalizedPath, "utf8");
        const uncompressedBuf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
        const crc = crc32(uncompressedBuf);
        const compressedBuf = zlib.deflateRawSync(uncompressedBuf);

        // Local File Header (30 bytes + filename)
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
        localHeader.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
        localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
        localHeader.writeUInt16LE(8, 8);          // Compression method: 8 (Deflate)
        localHeader.writeUInt16LE(0, 10);         // Last mod file time
        localHeader.writeUInt16LE(0, 12);         // Last mod file date
        localHeader.writeUInt32LE(crc, 14);       // CRC-32
        localHeader.writeUInt32LE(compressedBuf.length, 18); // Compressed size
        localHeader.writeUInt32LE(uncompressedBuf.length, 22); // Uncompressed size
        localHeader.writeUInt16LE(nameBuf.length, 26); // File name length
        localHeader.writeUInt16LE(0, 28);         // Extra field length

        localParts.push(localHeader, nameBuf, compressedBuf);

        // Central Directory File Header (46 bytes + filename)
        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
        centralHeader.writeUInt16LE(20, 4);         // Version made by
        centralHeader.writeUInt16LE(20, 6);         // Version needed to extract
        centralHeader.writeUInt16LE(0, 8);          // General purpose bit flag
        centralHeader.writeUInt16LE(8, 10);         // Compression method: 8 (Deflate)
        centralHeader.writeUInt16LE(0, 12);         // Last mod file time
        centralHeader.writeUInt16LE(0, 14);         // Last mod file date
        centralHeader.writeUInt32LE(crc, 16);       // CRC-32
        centralHeader.writeUInt32LE(compressedBuf.length, 20); // Compressed size
        centralHeader.writeUInt32LE(uncompressedBuf.length, 24); // Uncompressed size
        centralHeader.writeUInt16LE(nameBuf.length, 28); // File name length
        centralHeader.writeUInt16LE(0, 30);         // Extra field length
        centralHeader.writeUInt16LE(0, 32);         // File comment length
        centralHeader.writeUInt16LE(0, 34);         // Disk number start
        centralHeader.writeUInt16LE(0, 36);         // Internal file attributes
        centralHeader.writeUInt32LE(0, 38);         // External file attributes
        centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header

        centralParts.push(centralHeader, nameBuf);
        currentOffset += localHeader.length + nameBuf.length + compressedBuf.length;
    }

    const centralDirBuf = Buffer.concat(centralParts);

    // End of Central Directory Record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4);          // Number of this disk
    eocd.writeUInt16LE(0, 6);          // Disk where central directory starts
    eocd.writeUInt16LE(entries.length, 8);  // Number of central directory records on this disk
    eocd.writeUInt16LE(entries.length, 10); // Total number of central directory records
    eocd.writeUInt32LE(centralDirBuf.length, 12); // Size of central directory
    eocd.writeUInt32LE(currentOffset, 16);        // Offset of start of central directory
    eocd.writeUInt16LE(0, 20);         // Comment length

    return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

/**
 * Extracts a standard PKZIP archive into a Map of relative file paths to uncompressed Buffers.
 */
export function extractZipArchive(zipBuf: Buffer): Map<string, Buffer> {
    const result = new Map<string, Buffer>();

    // Find End of Central Directory (0x06054b50) scanning backwards from end
    let eocdOffset = -1;
    for (let i = zipBuf.length - 22; i >= Math.max(0, zipBuf.length - 65557); i--) {
        if (zipBuf.readUInt32LE(i) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }

    if (eocdOffset === -1) {
        throw new Error("Invalid ZIP archive: End of Central Directory signature not found.");
    }

    const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
    let cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

    for (let e = 0; e < totalEntries; e++) {
        if (cdOffset + 46 > zipBuf.length || zipBuf.readUInt32LE(cdOffset) !== 0x02014b50) {
            break;
        }
        const method = zipBuf.readUInt16LE(cdOffset + 10);
        const compressedSize = zipBuf.readUInt32LE(cdOffset + 20);
        const nameLen = zipBuf.readUInt16LE(cdOffset + 28);
        const extraLen = zipBuf.readUInt16LE(cdOffset + 30);
        const commentLen = zipBuf.readUInt16LE(cdOffset + 32);
        const localHeaderOffset = zipBuf.readUInt32LE(cdOffset + 42);

        const fileName = zipBuf.toString("utf8", cdOffset + 46, cdOffset + 46 + nameLen).replace(/\\/g, "/");

        const localNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = zipBuf.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const rawSlice = zipBuf.subarray(dataStart, dataStart + compressedSize);

        if (!fileName.endsWith("/")) {
            if (method === 0) {
                result.set(fileName, Buffer.from(rawSlice));
            } else if (method === 8) {
                result.set(fileName, zlib.inflateRawSync(rawSlice));
            }
        }

        cdOffset += 46 + nameLen + extraLen + commentLen;
    }

    return result;
}

/**
 * Escapes XML attribute/text content safely.
 */
export function escapeXml(val: string | number | boolean | undefined): string {
    if (val === undefined || val === null) return "";
    return String(val)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export function unescapeXml(val: string): string {
    return val
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

export interface ParsedXmlNode {
    tag: string;
    attrs: Record<string, string>;
    text: string;
    children: ParsedXmlNode[];
}

/**
 * Lightweight, deterministic XML parser for `.hacanvas` XML documents and `.svg` files.
 */
export function parseXmlDocument(xml: string): ParsedXmlNode {
    const cleaned = xml
        .replace(/<\?xml[\s\S]*?\?>/gi, "")
        .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();

    const root: ParsedXmlNode = { tag: "root", attrs: {}, text: "", children: [] };
    const stack: ParsedXmlNode[] = [root];

    const tagRegex = /<\/?([a-zA-Z0-9_:-]+)([^>]*?)(\/?)>/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(cleaned)) !== null) {
        const fullTag = match[0];
        const tagName = match[1];
        const attrStr = match[2] || "";
        const selfClosing = match[3] === "/";
        const isClosing = fullTag.startsWith("</");

        const currentParent = stack[stack.length - 1];
        if (match.index > lastIndex && currentParent) {
            const betweenText = unescapeXml(cleaned.slice(lastIndex, match.index).trim());
            if (betweenText) {
                currentParent.text += (currentParent.text ? " " : "") + betweenText;
            }
        }
        lastIndex = tagRegex.lastIndex;

        if (isClosing) {
            if (stack.length > 1) {
                stack.pop();
            }
        } else {
            const attrs: Record<string, string> = {};
            const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
            let aMatch: RegExpExecArray | null;
            while ((aMatch = attrRegex.exec(attrStr)) !== null) {
                attrs[aMatch[1]] = unescapeXml(aMatch[2] ?? aMatch[3] ?? "");
            }

            const node: ParsedXmlNode = {
                tag: tagName,
                attrs,
                text: "",
                children: []
            };
            currentParent.children.push(node);

            if (!selfClosing) {
                stack.push(node);
            }
        }
    }

    return root.children[0] || root;
}
