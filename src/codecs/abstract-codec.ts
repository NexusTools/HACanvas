import path from "node:path";
import {
    decodePngToRgba,
    encodeRgbaToPng,
    decodeBmpToRgba,
    encodeRgbaToBmp,
    decodeTgaToRgba,
    encodeRgbaToTga,
    decodePcxToRgba,
    decodeIcoToRgba,
    encodeRgbaToIco,
    decodePpmToRgba,
    encodeRgbaToPpm,
    decodeFarbfeldToRgba,
    encodeRgbaToFarbfeld,
    decodeXbmToRgba,
    decodeGifToRgba,
    encodeFramesToAnimatedGif,
    parseOraBuffer,
    encodeToOraBuffer,
    parsePsdBuffer,
    parseXcfBuffer,
    parseAiBuffer,
    type DecodedMultiLayerDocument
} from "../format-importers.js";

/**
 * Abstract base class for all image and multi-layer document codecs in `lib/hacanvas`.
 * Provides shared single-layer document wrapping, signature inspection, and extension matching.
 */
export abstract class AbstractImageCodec {
    public abstract readonly formatId: string;
    public abstract readonly label: string;
    public abstract readonly extensions: string[];
    public abstract readonly supportsLayers: boolean;
    public abstract readonly supportsExport: boolean;

    public matchesExtension(filePath: string): boolean {
        const ext = path.extname(filePath || "").toLowerCase().replace(/^\./, "");
        return this.extensions.includes(ext);
    }

    public abstract matchesSignature(buf: Buffer, ext: string): boolean;

    public abstract decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument;

    public encodeRgba?(width: number, height: number, rgba: Buffer): Buffer;

    protected wrapSingleRasterLayer(
        width: number,
        height: number,
        rgba: Buffer,
        filePath?: string
    ): DecodedMultiLayerDocument {
        return {
            format: this.formatId,
            width,
            height,
            layers: [
                {
                    name: filePath ? path.basename(filePath) : `${this.label} Layer`,
                    type: "raster",
                    width,
                    height,
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    visible: true,
                    blendMode: "normal",
                    rgba
                }
            ]
        };
    }
}

export class PngCodec extends AbstractImageCodec {
    public readonly formatId = "png";
    public readonly label = "Portable Network Graphics (PNG)";
    public readonly extensions = ["png"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) || ext === "png";
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodePngToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToPng(width, height, rgba);
    }
}

export class BmpCodec extends AbstractImageCodec {
    public readonly formatId = "bmp";
    public readonly label = "Windows Bitmap (BMP)";
    public readonly extensions = ["bmp"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 54 && buf[0] === 0x42 && buf[1] === 0x4d) || ext === "bmp";
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodeBmpToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToBmp(width, height, rgba);
    }
}

export class TgaCodec extends AbstractImageCodec {
    public readonly formatId = "tga";
    public readonly label = "Truevision Targa (TGA)";
    public readonly extensions = ["tga"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(_buf: Buffer, ext: string): boolean {
        return ext === "tga";
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodeTgaToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToTga(width, height, rgba);
    }
}

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

export class IcoCodec extends AbstractImageCodec {
    public readonly formatId = "ico";
    public readonly label = "Windows Icon / Cursor (ICO/CUR)";
    public readonly extensions = ["ico", "cur"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (
            ext === "ico" ||
            ext === "cur" ||
            (buf.length >= 22 &&
                buf.readUInt16LE(0) === 0 &&
                (buf.readUInt16LE(2) === 1 || buf.readUInt16LE(2) === 2) &&
                buf.readUInt16LE(4) >= 1 &&
                buf.readUInt16LE(4) <= 64 &&
                buf.readUInt32LE(18) === 6 + buf.readUInt16LE(4) * 16)
        );
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodeIcoToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToIco(width, height, rgba);
    }
}

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

export class FarbfeldCodec extends AbstractImageCodec {
    public readonly formatId = "farbfeld";
    public readonly label = "Farbfeld 16-bit RGBA (FF)";
    public readonly extensions = ["ff", "farbfeld"];
    public readonly supportsLayers = false;
    public readonly supportsExport = true;

    public override matchesSignature(buf: Buffer, ext: string): boolean {
        return (buf.length >= 16 && buf.toString("ascii", 0, 8) === "farbfeld") || this.extensions.includes(ext);
    }

    public override decodeToDocument(buf: Buffer, filePath?: string): DecodedMultiLayerDocument {
        const { width, height, rgba } = decodeFarbfeldToRgba(buf);
        return this.wrapSingleRasterLayer(width, height, rgba, filePath);
    }

    public override encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
        return encodeRgbaToFarbfeld(width, height, rgba);
    }
}

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

/**
 * Registry of all `AbstractImageCodec` subclasses.
 */
export class ImageCodecRegistry {
    private static readonly codecs: AbstractImageCodec[] = [
        new PsdCodec(),
        new XcfCodec(),
        new AiCodec(),
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
