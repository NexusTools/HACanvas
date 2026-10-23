import { encodeRgbaToPng } from "./png-exporter.js";

export interface SpriteSheetExportParams {
    cellWidth: number;
    cellHeight: number;
    cellBuffers: Buffer[];
    columns?: number;
    padding?: number;
    compressionLevel?: number;
}

export function encodeCellsToSpriteSheetPng(params: SpriteSheetExportParams): Buffer {
    const { cellWidth, cellHeight, cellBuffers } = params;
    const pad = Math.max(0, Math.min(128, Math.round(params.padding ?? 0)));
    const count = Math.max(1, cellBuffers.length);
    const cols = params.columns && params.columns > 0 ? Math.min(count, Math.round(params.columns)) : count;
    const rows = Math.max(1, Math.ceil(count / cols));
    const sheetW = cols * cellWidth + Math.max(0, cols - 1) * pad;
    const sheetH = rows * cellHeight + Math.max(0, rows - 1) * pad;
    const sheetRgba = Buffer.alloc(sheetW * sheetH * 4, 0);

    cellBuffers.forEach((cBuf, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const dstX = col * (cellWidth + pad);
        const dstY = row * (cellHeight + pad);
        for (let y = 0; y < cellHeight; y++) {
            cBuf.copy(
                sheetRgba,
                ((dstY + y) * sheetW + dstX) * 4,
                y * cellWidth * 4,
                (y + 1) * cellWidth * 4
            );
        }
    });

    return encodeRgbaToPng(sheetW, sheetH, sheetRgba, {
        compressionLevel: params.compressionLevel ?? 6
    });
}
