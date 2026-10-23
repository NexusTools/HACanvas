import { decodePngToRgba, encodeRgbaToPng, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class PngCodec extends AbstractImageCodec {
    public readonly formatId = "png";
    public readonly label = "Portable Network Graphics (PNG)";
    public readonly extensions = ["png"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) || ext === "png";
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodePngToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToPng(width, height, rgba);
    }
}
