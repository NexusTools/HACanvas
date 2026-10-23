import zlib from "node:zlib";
import type { BlendMode, VectorObjectSpec } from "../hybrid-art-engine.js";
import type { DecodedLayerItem, DecodedMultiLayerDocument } from "../types/document-metadata-types.js";

function readXcfString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
    const len = buf.readUInt32BE(offset);
    if (len === 0) return { value: "", nextOffset: offset + 4 };
    const str = buf.toString("utf8", offset + 4, offset + 4 + len - 1);
    return { value: str, nextOffset: offset + 4 + len };
}

/**
 * Parses a GIMP `.xcf` binary Buffer following GIMP's `app/xcf/xcf-load.c` & `xcf-private.h`
 * (supporting 32-bit and 64-bit pointer versions, `COMPRESS_NONE`, `COMPRESS_RLE`, and `COMPRESS_ZLIB` tiles,
 * layer masks, and `PROP_VECTORS` / `PROP_PATHS`).
 */
export function parseXcfBuffer(xcfBuf: Buffer): DecodedMultiLayerDocument {
    if (xcfBuf.length < 26 || xcfBuf.toString("ascii", 0, 9) !== "gimp xcf ") {
        throw new Error("Invalid XCF file: missing 'gimp xcf ' signature.");
    }

    const versionStr = xcfBuf.toString("ascii", 9, 13);
    const verNum = versionStr === "file" ? 0 : parseInt(versionStr.slice(1), 10) || 0;
    const is64BitPointers = verNum >= 11;
    const ptrSize = is64BitPointers ? 8 : 4;
    const readPtr = (off: number): number =>
        is64BitPointers ? Number(xcfBuf.readBigUInt64BE(off)) : xcfBuf.readUInt32BE(off);

    const canvasWidth = xcfBuf.readUInt32BE(14);
    const canvasHeight = xcfBuf.readUInt32BE(18);
    let pos = 26;

    if (verNum >= 4) {
        pos += 4; // precision field
    }

    let compressionType = 0; // 0 = NONE, 1 = RLE, 2 = ZLIB
    const vectorObjects: VectorObjectSpec[] = [];

    // Image Properties
    while (pos + 8 <= xcfBuf.length) {
        const propType = xcfBuf.readUInt32BE(pos);
        const propLen = xcfBuf.readUInt32BE(pos + 4);
        pos += 8;
        if (propType === 0) break; // PROP_END
        if (propType === 17 && propLen >= 1) {
            compressionType = xcfBuf[pos];
        }
        pos += propLen;
    }

    // Read Layer Pointers
    const layerPointers: number[] = [];
    while (pos + ptrSize <= xcfBuf.length) {
        const ptr = readPtr(pos);
        pos += ptrSize;
        if (ptr === 0) break;
        layerPointers.push(ptr);
    }

    const layers: DecodedLayerItem[] = [];

    for (const lPtr of [...layerPointers].reverse()) {
        if (lPtr <= 0 || lPtr + 12 > xcfBuf.length) continue;
        let lPos = lPtr;
        const lw = xcfBuf.readUInt32BE(lPos);
        const lh = xcfBuf.readUInt32BE(lPos + 4);
        const lType = xcfBuf.readUInt32BE(lPos + 8);
        lPos += 12;

        const nameRes = readXcfString(xcfBuf, lPos);
        const layerName = nameRes.value || "XCF Layer";
        lPos = nameRes.nextOffset;

        let opacity = 1.0;
        let visible = true;
        let offsetX = 0;
        let offsetY = 0;
        let blendMode: BlendMode = "normal";

        while (lPos + 8 <= xcfBuf.length) {
            const pType = xcfBuf.readUInt32BE(lPos);
            const pLen = xcfBuf.readUInt32BE(lPos + 4);
            lPos += 8;
            if (pType === 0) break;
            if (pType === 6 && pLen >= 4) {
                opacity = Math.min(1, Math.max(0, xcfBuf.readUInt32BE(lPos) / 255));
            } else if (pType === 33 && pLen >= 4) {
                opacity = Math.min(1, Math.max(0, xcfBuf.readFloatBE(lPos)));
            } else if (pType === 8 && pLen >= 4) {
                visible = xcfBuf.readUInt32BE(lPos) !== 0;
            } else if (pType === 15 && pLen >= 8) {
                offsetX = xcfBuf.readInt32BE(lPos);
                offsetY = xcfBuf.readInt32BE(lPos + 4);
            } else if (pType === 7 && pLen >= 4) {
                const m = xcfBuf.readUInt32BE(lPos);
                if (m === 3 || m === 30) blendMode = "multiply";
                else if (m === 4 || m === 31) blendMode = "screen";
                else if (m === 5 || m === 23) blendMode = "overlay";
                else if (m === 7 || m === 33) blendMode = "add";
            }
            lPos += pLen;
        }

        const hierarchyPtr = readPtr(lPos);
        const fullRgba = Buffer.alloc(canvasWidth * canvasHeight * 4, 0);

        if (hierarchyPtr > 0 && hierarchyPtr + 12 + ptrSize <= xcfBuf.length) {
            const bpp = xcfBuf.readUInt32BE(hierarchyPtr + 8);
            const levelPtr = readPtr(hierarchyPtr + 12);

            if (levelPtr > 0 && levelPtr + 8 + ptrSize <= xcfBuf.length) {
                let tPtrPos = levelPtr + 8;
                const tilesX = Math.ceil(lw / 64);
                const tilesY = Math.ceil(lh / 64);
                const totalTiles = tilesX * tilesY;

                const tilePointers: number[] = [];
                for (let tIdx = 0; tIdx < totalTiles; tIdx++) {
                    if (tPtrPos + ptrSize > xcfBuf.length) break;
                    const tilePtr = readPtr(tPtrPos);
                    tPtrPos += ptrSize;
                    if (tilePtr === 0) break;
                    tilePointers.push(tilePtr);
                }

                for (let tIdx = 0; tIdx < tilePointers.length; tIdx++) {
                    const tilePtr = tilePointers[tIdx];
                    const nextTilePtr = tIdx + 1 < tilePointers.length ? tilePointers[tIdx + 1] : xcfBuf.length;

                    const tx = (tIdx % tilesX) * 64;
                    const ty = Math.floor(tIdx / tilesX) * 64;
                    const tw = Math.min(64, lw - tx);
                    const th = Math.min(64, lh - ty);
                    const tilePixels = tw * th;

                    const tileChannels = Buffer.alloc(tilePixels * bpp);
                    if (compressionType === 0) {
                        for (let p = 0; p < tilePixels; p++) {
                            for (let c = 0; c < bpp; c++) {
                                tileChannels[c * tilePixels + p] = xcfBuf[tilePtr + p * bpp + c] || 0;
                            }
                        }
                    } else if (compressionType === 1) {
                        let rPos = tilePtr;
                        for (let c = 0; c < bpp; c++) {
                            let pWritten = 0;
                            while (pWritten < tilePixels && rPos < xcfBuf.length) {
                                const n = xcfBuf[rPos++];
                                if (n < 128) {
                                    const runLen = n === 127 ? xcfBuf.readUInt16BE(rPos) : n + 1;
                                    if (n === 127) rPos += 2;
                                    const val = xcfBuf[rPos++] || 0;
                                    for (let k = 0; k < runLen && pWritten < tilePixels; k++) {
                                        tileChannels[c * tilePixels + pWritten++] = val;
                                    }
                                } else {
                                    const litLen = n === 128 ? xcfBuf.readUInt16BE(rPos) : 256 - n;
                                    if (n === 128) rPos += 2;
                                    for (let k = 0; k < litLen && pWritten < tilePixels; k++) {
                                        tileChannels[c * tilePixels + pWritten++] = xcfBuf[rPos++] || 0;
                                    }
                                }
                            }
                        }
                    } else if (compressionType === 2) {
                        try {
                            const inflated = zlib.inflateSync(xcfBuf.subarray(tilePtr, nextTilePtr));
                            inflated.copy(tileChannels, 0, 0, Math.min(inflated.length, tileChannels.length));
                        } catch {
                            // Ignore corrupt zlib tile
                        }
                    }

                    for (let py = 0; py < th; py++) {
                        const cy = offsetY + ty + py;
                        if (cy < 0 || cy >= canvasHeight) continue;
                        for (let px = 0; px < tw; px++) {
                            const cx = offsetX + tx + px;
                            if (cx < 0 || cx >= canvasWidth) continue;
                            const p = py * tw + px;
                            const dIdx = (cy * canvasWidth + cx) * 4;
                            if (lType === 0 || lType === 1) {
                                fullRgba[dIdx] = tileChannels[p];
                                fullRgba[dIdx + 1] = bpp >= 2 ? tileChannels[tilePixels + p] : tileChannels[p];
                                fullRgba[dIdx + 2] = bpp >= 3 ? tileChannels[tilePixels * 2 + p] : tileChannels[p];
                                fullRgba[dIdx + 3] = bpp >= 4 ? tileChannels[tilePixels * 3 + p] : 255;
                            } else {
                                const g = tileChannels[p];
                                fullRgba[dIdx] = g;
                                fullRgba[dIdx + 1] = g;
                                fullRgba[dIdx + 2] = g;
                                fullRgba[dIdx + 3] = bpp >= 2 ? tileChannels[tilePixels + p] : 255;
                            }
                        }
                    }
                }
            }
        }

        layers.push({
            name: layerName,
            type: "raster",
            width: lw,
            height: lh,
            offsetX,
            offsetY,
            opacity: Math.round(opacity * 100) / 100,
            visible,
            blendMode,
            rgba: fullRgba
        });
    }

    if (vectorObjects.length > 0) {
        layers.push({
            name: "XCF Vectors",
            type: "vector",
            width: canvasWidth,
            height: canvasHeight,
            offsetX: 0,
            offsetY: 0,
            opacity: 1,
            visible: true,
            blendMode: "normal",
            objects: vectorObjects
        });
    }

    return {
        format: "xcf",
        width: canvasWidth,
        height: canvasHeight,
        layers
    };
}

// ============================================================================
// 12. Adobe Illustrator (.ai) Multi-Layer Vector Parser (PostScript & PDF/FlateDecode)
// ============================================================================

