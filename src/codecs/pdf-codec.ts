import { parsePdfBuffer, encodeLayersToPdf, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class PdfCodec extends AbstractImageCodec {
    public readonly formatId = "pdf";
    public readonly label = "Portable Document Format (PDF Multi-Page Vector + Raster + Fonts)";
    public readonly extensions = ["pdf"];
    public readonly supportsLayers = true;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        if (ext === "pdf") return true;
        if (buf.length < 5) return false;
        const head = buf.subarray(0, Math.min(1024, buf.length)).toString("latin1");
        return head.includes("%PDF-") && !head.includes("/AIMetaData") && !head.includes("AIPrivateData");
    }

    public override decodeToDocument(buf: Buffer): DecodedMultiLayerDocument {
        return parsePdfBuffer(buf);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeLayersToPdf(width, height, [
            { name: "Page 1", type: "raster", width, height, visible: true, opacity: 1, rasterRgba: rgba }
        ]);
    }
}
