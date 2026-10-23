import { decodePcxToRgba, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class PcxCodec extends AbstractImageCodec {
    public readonly formatId = "pcx";
    public readonly label = "ZSoft PCX";
    public readonly extensions = ["pcx"];
    public readonly supportsLayers = false;
    public readonly supportsExport = false;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return ext === "pcx" || (buf.length >= 128 && buf[0] === 0x0a && buf[2] === 1);
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodePcxToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }
}
