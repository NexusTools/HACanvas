import { parsePsdBuffer, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class PsdCodec extends AbstractImageCodec {
    public readonly formatId = "psd";
    public readonly label = "Adobe Photoshop Document (PSD/PSB)";
    public readonly extensions = ["psd", "psb"];
    public readonly supportsLayers = true;
    public readonly supportsExport = false;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 4 && buf.toString("ascii", 0, 4) === "8BPS") || this.extensions.includes(ext);
    }

    public override decodeToDocument(buf: Buffer): DecodedMultiLayerDocument {
        return parsePsdBuffer(buf);
    }
}
