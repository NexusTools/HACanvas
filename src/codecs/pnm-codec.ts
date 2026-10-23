import { decodePpmToRgba, encodeRgbaToPpm, type DecodedMultiLayerDocument } from "../format-importers.js";
import { AbstractImageCodec } from "./abstract-image-codec.js";

export class PnmCodec extends AbstractImageCodec {
    public readonly formatId = "ppm";
    public readonly label = "Netpbm Portable Any Map (PPM/PGM/PBM/PAM)";
    public readonly extensions = ["ppm", "pgm", "pbm", "pnm", "pam"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 10 && buf[0] === 0x50 && buf[1] >= 0x31 && buf[1] <= 0x37) || this.extensions.includes(ext);
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodePpmToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToPpm(width, height, rgba);
    }
}
