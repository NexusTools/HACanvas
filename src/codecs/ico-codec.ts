import { decodeIcoToLayers, encodeRgbaToIco, encodeLayersToIco, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class IcoCodec extends AbstractImageCodec {
    public readonly formatId = "ico";
    public readonly label = "Windows Icon / Cursor (ICO/CUR)";
    public readonly extensions = ["ico", "cur"];
    public readonly supportsLayers = true;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (
            ext === "ico" ||
            ext === "cur" ||
            (buf.length >= 22 &&
                buf.readUInt16LE(0) === 0 &&
                (buf.readUInt16LE(2) === 1 || buf.readUInt16LE(2) === 2) &&
                buf.readUInt16LE(4) >= 1 &&
                buf.readUInt16LE(4) <= 64 &&
                buf.readUInt32LE(18) === 6 + buf.readUInt16LE(4) * 16)
        );
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        return decodeIcoToLayers(buf, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToIco(width, height, rgba);
    }

    public encodeLayers(
        entries: Parameters<typeof encodeLayersToIco>[0]
    ): Buffer {
        return encodeLayersToIco(entries);
    }
}
