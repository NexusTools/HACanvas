import { decodeFarbfeldToRgba, encodeRgbaToFarbfeld, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class FarbfeldCodec extends AbstractImageCodec {
    public readonly formatId = "farbfeld";
    public readonly label = "Farbfeld 16-bit RGBA (FF)";
    public readonly extensions = ["ff", "farbfeld"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 16 && buf.toString("ascii", 0, 8) === "farbfeld") || this.extensions.includes(ext);
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodeFarbfeldToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToFarbfeld(width, height, rgba);
    }
}
