import path from "node:path";
import { AbstractImageCodec } from "./abstract-image-codec.js";
import { PngCodec } from "./png-codec.js";
import { BmpCodec } from "./bmp-codec.js";
import { TgaCodec } from "./tga-codec.js";
import { PcxCodec } from "./pcx-codec.js";
import { IcoCodec } from "./ico-codec.js";
import { PnmCodec } from "./pnm-codec.js";
import { FarbfeldCodec } from "./farbfeld-codec.js";
import { XbmCodec } from "./xbm-codec.js";
import { GifCodec } from "./gif-codec.js";
import { OraCodec } from "./ora-codec.js";
import { PsdCodec } from "./psd-codec.js";
import { XcfCodec } from "./xcf-codec.js";
import { AiCodec } from "./ai-codec.js";
import { PdfCodec } from "./pdf-codec.js";

/**
 * Registry of all `AbstractImageCodec` subclasses.
 */
export class ImageCodecRegistry {
    private static readonly codecs: AbstractImageCodec[] = [
        new PsdCodec(),
        new XcfCodec(),
        new AiCodec(),
        new PdfCodec(),
        new OraCodec(),
        new PngCodec(),
        new BmpCodec(),
        new TgaCodec(),
        new PcxCodec(),
        new IcoCodec(),
        new PnmCodec(),
        new FarbfeldCodec(),
        new XbmCodec(),
        new GifCodec()
    ];

    public static getAllCodecs(): AbstractImageCodec[] {
        return [...this.codecs];
    }

    public static findCodecForBuffer(buf: Buffer, filePath?: string): AbstractImageCodec | undefined {
        const ext = path.extname(filePath || "").toLowerCase().replace(/^\./, "");
        return this.codecs.find(c => c.matchesSignature(buf, ext));
    }
}
