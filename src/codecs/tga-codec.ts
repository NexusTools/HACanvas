import { decodeTgaToRgba, encodeRgbaToTga, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class TgaCodec extends AbstractImageCodec {
    public readonly formatId = "tga";
    public readonly label = "Truevision Targa (TGA)";
    public readonly extensions = ["tga"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(_buf: Buffer, ext: string): boolean {
        return ext === "tga";
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodeTgaToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToTga(width, height, rgba);
    }
}
