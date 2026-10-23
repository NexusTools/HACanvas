import { decodeXbmToRgba, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class XbmCodec extends AbstractImageCodec {
    public readonly formatId = "xbm";
    public readonly label = "X11 Bitmap (XBM)";
    public readonly extensions = ["xbm"];
    public readonly supportsLayers = false;
    public readonly supportsExport = false;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return ext === "xbm" || buf.toString("ascii", 0, 7) === "#define";
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodeXbmToRgba(buf.toString("utf8"));
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }
}
