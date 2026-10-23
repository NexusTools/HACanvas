import path from "node:path";
import type { DecodedMultiLayerDocument } from "../format-importers.js";

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
