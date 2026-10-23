import { decodeGifToRgba, encodeFramesToAnimatedGif, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class GifCodec extends AbstractImageCodec {
    public readonly formatId = "gif";
    public readonly label = "CompuServe GIF87a/GIF89a";
    public readonly extensions = ["gif"];
    public readonly supportsLayers = true;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 6 && buf.toString("ascii", 0, 3) === "GIF") || ext === "gif";
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodeGifToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeFramesToAnimatedGif(width, height, [{ rgba, delayMs: 100 }]);
    }
}
