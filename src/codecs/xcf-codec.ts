import { parseXcfBuffer, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class XcfCodec extends AbstractImageCodec {
    public readonly formatId = "xcf";
    public readonly label = "GIMP Native eXperimental Computing Facility (XCF)";
    public readonly extensions = ["xcf"];
    public readonly supportsLayers = true;
    public readonly supportsExport = false;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 9 && buf.toString("ascii", 0, 9) === "gimp xcf ") || ext === "xcf";
    }

    public override decodeToDocument(buf: Buffer): DecodedMultiLayerDocument {
        return parseXcfBuffer(buf);
    }
}
