import { decodeBmpToRgba, encodeRgbaToBmp, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class BmpCodec extends AbstractImageCodec {
    public readonly formatId = "bmp";
    public readonly label = "Windows Bitmap (BMP)";
    public readonly extensions = ["bmp"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 54 && buf[0] === 0x42 && buf[1] === 0x4d) || ext === "bmp";
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodeBmpToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToBmp(width, height, rgba);
    }
}
