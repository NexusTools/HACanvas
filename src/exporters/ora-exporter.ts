import type { BlendMode } from "../hybrid-art-engine.js";
import { resampleRgbaNearestOrBilinear } from "./ico-exporter.js";
import { createZipArchive } from "../zip-xml-package.js";
import { encodeRgbaToPng } from "./png-exporter.js";

export interface OraExportOptions {
    /** Export hidden layers into stack.xml (default true) */
    exportHiddenLayers?: boolean;
    /** Include mergedimage.png and Thumbnails/thumbnail.png per OpenRaster standard (default true) */
    includeMergedComposite?: boolean;
    /** PNG compression level (0..9, default 6) */
    compressionLevel?: number;
    /** Optional pre-rendered composite RGBA for mergedimage.png */
    mergedRgba?: Buffer;
}

export function encodeToOraBuffer(
    width: number,
    height: number,
    layers: { name: string; visible: boolean; opacity: number; blendMode: BlendMode; rgba: Buffer }[],
    options: OraExportOptions = {}
): Buffer {
    const zipEntries: Record<string, Buffer | string> = {
        mimetype: "image/openraster"
    };
    const compLevel = options.compressionLevel ?? 6;
    const filteredLayers =
        options.exportHiddenLayers === false ? layers.filter(l => l.visible) : layers;

    const layerXmlLines: string[] = [];
    // OpenRaster stack.xml is ordered top-to-bottom
    const reversed = [...filteredLayers].reverse();
    reversed.forEach((l, idx) => {
        const srcPath = `data/layer${idx}.png`;
        zipEntries[srcPath] = encodeRgbaToPng(width, height, l.rgba, { compressionLevel: compLevel });
        const compOp =
            l.blendMode === "multiply" ? "svg:multiply" :
            l.blendMode === "screen" ? "svg:screen" :
            l.blendMode === "overlay" ? "svg:overlay" :
            l.blendMode === "add" ? "svg:plus" : "svg:src-over";
        layerXmlLines.push(
            `    <layer name="${l.name.replace(/"/g, "&quot;")}" src="${srcPath}" x="0" y="0" opacity="${l.opacity}" visibility="${l.visible ? "visible" : "hidden"}" composite-op="${compOp}" />`
        );
    });

    if (options.includeMergedComposite !== false) {
        const merged = options.mergedRgba || (filteredLayers[0]?.rgba ?? Buffer.alloc(width * height * 4, 0));
        const mergedPng = encodeRgbaToPng(width, height, merged, { compressionLevel: compLevel });
        zipEntries["mergedimage.png"] = mergedPng;
        const thumbW = Math.max(1, Math.min(256, width));
        const thumbH = Math.max(1, Math.min(256, height));
        const thumbRgba = resampleRgbaNearestOrBilinear(merged, width, height, thumbW, thumbH);
        zipEntries["Thumbnails/thumbnail.png"] = encodeRgbaToPng(thumbW, thumbH, thumbRgba, { compressionLevel: compLevel });
    }

    zipEntries["stack.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<image version="0.0.3" w="${width}" h="${height}">
  <stack>
${layerXmlLines.join("\n")}
  </stack>
</image>`;

    return createZipArchive(zipEntries);
}

// ============================================================================
// 3. GIF87a / GIF89a Multi-Frame Decoder & Animated GIF89a Encoder
// ============================================================================

