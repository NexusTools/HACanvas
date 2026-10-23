import { parseAiBuffer, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class AiCodec extends AbstractImageCodec {
    public readonly formatId = "ai";
    public readonly label = "Adobe Illustrator Artwork (AI)";
    public readonly extensions = ["ai"];
    public readonly supportsLayers = true;
    public readonly supportsExport = false;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        if (ext === "ai") return true;
        if (buf.length < 11) return false;
        const head = buf.subarray(0, Math.min(1024, buf.length)).toString("latin1");
        return (
            head.startsWith("%!PS-Adobe-") ||
            head.includes("%%Creator: Adobe Illustrator") ||
            head.includes("%AI5_BeginLayer") ||
            (head.startsWith("%PDF-") && (head.includes("Illustrator") || head.includes("/AIMetaData") || head.includes("AIPrivateData")))
        );
    }

    public override decodeToDocument(buf: Buffer): DecodedMultiLayerDocument {
        return parseAiBuffer(buf);
    }
}
