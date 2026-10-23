import { parseOraBuffer, encodeToOraBuffer, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class OraCodec extends AbstractImageCodec {
    public readonly formatId = "ora";
    public readonly label = "OpenRaster Multi-Layer Archive (ORA)";
    public readonly extensions = ["ora"];
    public readonly supportsLayers = true;
    public readonly supportsExport = true;

    public override matchesSignature(_buf: Buffer, ext: string): boolean {
        return ext === "ora";
    }

    public override decodeToDocument(buf: Buffer): DecodedMultiLayerDocument {
        return parseOraBuffer(buf);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeToOraBuffer(width, height, [
            { name: "Layer 1", visible: true, opacity: 1, blendMode: "normal", rgba }
        ]);
    }
}
