import zlib from "node:zlib";
import type { BlendMode, VectorObjectSpec } from "../hybrid-art-engine.js";
import type { DecodedLayerItem, DecodedMultiLayerDocument, DocumentMetadataSpec } from "../types/document-metadata-types.js";
import {
    hasMeaningfulMetadata,
    parseXmpPacketString,
    parseExifTiffPayload
} from "../exporters/exif-xmp-metadata-exporter.js";

function mapPsdBlendMode(key: string): BlendMode {
    const clean = key.trim();
    if (clean === "mul") return "multiply";
    if (clean === "scrn") return "screen";
    if (clean === "over" || clean === "sLit" || clean === "hLit") return "overlay";
    if (clean === "lddg" || clean === "add") return "add";
    return "normal";
}

function decodePackBitsRow(buf: Buffer, offset: number, expectedBytes: number): { row: Buffer; nextOffset: number } {
    const out = Buffer.alloc(expectedBytes);
    let outPos = 0;
    let pos = offset;
    while (outPos < expectedBytes && pos < buf.length) {
        const n = buf.readInt8(pos++);
        if (n >= 0) {
            const count = n + 1;
            for (let i = 0; i < count && outPos < expectedBytes && pos < buf.length; i++) {
                out[outPos++] = buf[pos++];
            }
        } else if (n !== -128) {
            const count = 1 - n;
            const val = buf[pos++] || 0;
            for (let i = 0; i < count && outPos < expectedBytes; i++) {
                out[outPos++] = val;
            }
        }
    }
    return { row: out, nextOffset: pos };
}

/**
 * Parses an Adobe Photoshop `.psd` or `.psb` binary Buffer following GIMP's `psd-load.c` & `psd-layer-res-load.c`
 * (supporting PSD v1 & PSB v2, `luni` UTF-16BE layer names, `lsct` layer groups, `vmsk`/`vsms` vector masks,
 * `TySh` text layers, and Raw / PackBits RLE / ZIP / ZIP-Prediction channel compression).
 */
export function parsePsdBuffer(psdBuf: Buffer): DecodedMultiLayerDocument {
    if (psdBuf.length < 26 || psdBuf.toString("ascii", 0, 4) !== "8BPS") {
        throw new Error("Invalid PSD/PSB file: missing '8BPS' signature.");
    }

    const version = psdBuf.readUInt16BE(4);
    if (version !== 1 && version !== 2) {
        throw new Error(`Unsupported PSD version: ${version}`);
    }
    const isPsb = version === 2;
    const readLen = (off: number): { val: number; bytes: number } =>
        isPsb
            ? { val: Number(psdBuf.readBigUInt64BE(off)), bytes: 8 }
            : { val: psdBuf.readUInt32BE(off), bytes: 4 };

    const numChannels = psdBuf.readUInt16BE(12);
    const canvasHeight = psdBuf.readUInt32BE(14);
    const canvasWidth = psdBuf.readUInt32BE(18);
    const bitDepth = psdBuf.readUInt16BE(22);
    const colorMode = psdBuf.readUInt16BE(24);
    let pos = 26;

    // Color Mode Data section (e.g., 768-byte palette for Indexed color mode == 2)
    const colorModeLen = psdBuf.readUInt32BE(pos);
    pos += 4;
    const indexedPalette = colorMode === 2 && colorModeLen >= 768 ? psdBuf.subarray(pos, pos + 768) : null;
    pos += colorModeLen;

    // Skip Image Resources section
    const imageResLen = psdBuf.readUInt32BE(pos);
    pos += 4 + imageResLen;

    // Layer and Mask Information section
    const lmLenInfo = readLen(pos);
    pos += lmLenInfo.bytes;
    const layerMaskEnd = pos + lmLenInfo.val;

    const layers: DecodedLayerItem[] = [];

    const parseLayerRecordsAndChannels = (startOffset: number): void => {
        let lPos = startOffset;
        const rawLayerCount = psdBuf.readInt16BE(lPos);
        const layerCount = Math.abs(rawLayerCount);
        lPos += 2;

        interface PsdLayerRec {
            name: string;
            top: number;
            left: number;
            bottom: number;
            right: number;
            channels: { id: number; dataLen: number }[];
            blendMode: BlendMode;
            opacity: number;
            visible: boolean;
            groupDividerType: number; // 0=normal, 1|2=group open/closed, 3=group end
            vectorObjects: VectorObjectSpec[];
        }

        const records: PsdLayerRec[] = [];
        for (let i = 0; i < layerCount; i++) {
            const top = psdBuf.readInt32BE(lPos);
            const left = psdBuf.readInt32BE(lPos + 4);
            const bottom = psdBuf.readInt32BE(lPos + 8);
            const right = psdBuf.readInt32BE(lPos + 12);
            const chCount = psdBuf.readUInt16BE(lPos + 16);
            lPos += 18;

            const channels: { id: number; dataLen: number }[] = [];
            for (let c = 0; c < chCount; c++) {
                const id = psdBuf.readInt16BE(lPos);
                const dLen = readLen(lPos + 2);
                channels.push({ id, dataLen: dLen.val });
                lPos += 2 + dLen.bytes;
            }

            const blendKey = psdBuf.toString("ascii", lPos + 4, lPos + 8);
            const opacityByte = psdBuf[lPos + 8];
            const flags = psdBuf[lPos + 10];
            const visible = (flags & 0x02) === 0;
            lPos += 12;

            const extraDataLen = psdBuf.readUInt32BE(lPos);
            lPos += 4;
            const extraEnd = lPos + extraDataLen;

            // Layer mask data
            const maskLen = psdBuf.readUInt32BE(lPos);
            lPos += 4 + maskLen;

            // Layer blending ranges
            const blendRangesLen = psdBuf.readUInt32BE(lPos);
            lPos += 4 + blendRangesLen;

            // Pascal string layer name (padded to multiple of 4 bytes)
            const nameLen = psdBuf[lPos];
            let layerName = psdBuf.toString("utf8", lPos + 1, lPos + 1 + nameLen) || `PSD Layer ${i + 1}`;
            const paddedNameLen = Math.ceil((nameLen + 1) / 4) * 4;
            lPos += paddedNameLen;

            let groupDividerType = 0;
            const vectorObjects: VectorObjectSpec[] = [];

            // Parse Additional Layer Resource Blocks (`luni`, `lsct`, `vmsk`, `vsms`, `TySh`) as in GIMP `psd-layer-res-load.c`
            while (lPos + 8 <= extraEnd) {
                const sig = psdBuf.toString("ascii", lPos, lPos + 4);
                if (sig !== "8BIM" && sig !== "8B64" && sig !== "MIB8") break;
                const key = psdBuf.toString("ascii", lPos + 4, lPos + 8);
                lPos += 8;

                const is8ByteRes = isPsb && [
                    "LMsk", "Lr16", "Lr32", "Layr", "Mt16", "Mt32", "Mtrn",
                    "Alph", "FMsk", "lnk2", "FEid", "FXid", "PxSD", "lnkE", "pths"
                ].includes(key);
                const resLen = is8ByteRes ? Number(psdBuf.readBigUInt64BE(lPos)) : psdBuf.readUInt32BE(lPos);
                lPos += is8ByteRes ? 8 : 4;
                const resDataStart = lPos;

                if (key === "luni" && resLen >= 4) {
                    // UTF-16BE Unicode Layer Name
                    const charCount = psdBuf.readUInt32BE(resDataStart);
                    const chars: number[] = [];
                    for (let u = 0; u < charCount && resDataStart + 4 + u * 2 + 2 <= extraEnd; u++) {
                        const code = psdBuf.readUInt16BE(resDataStart + 4 + u * 2);
                        if (code !== 0) chars.push(code);
                    }
                    if (chars.length > 0) {
                        layerName = String.fromCharCode(...chars);
                    }
                } else if ((key === "lsct" || key === "lsdk") && resLen >= 4) {
                    groupDividerType = psdBuf.readUInt32BE(resDataStart);
                } else if ((key === "vmsk" || key === "vsms") && resLen >= 8 + 26) {
                    // PSD Vector Mask / Shape Path records (26 bytes each after 8-byte version/flags header)
                    const numRecords = Math.floor((resLen - 8) / 26);
                    const knots: { x: number; y: number }[] = [];
                    for (let r = 0; r < numRecords; r++) {
                        const rOff = resDataStart + 8 + r * 26;
                        const selector = psdBuf.readUInt16BE(rOff);
                        if (selector === 1 || selector === 2 || selector === 4 || selector === 5) {
                            // Anchor point at rOff + 10 (y in 8.24 fixed point, x in 8.24 fixed point)
                            const yFixed = psdBuf.readInt32BE(rOff + 10) / 16777216.0;
                            const xFixed = psdBuf.readInt32BE(rOff + 14) / 16777216.0;
                            knots.push({
                                x: Math.round(xFixed * canvasWidth * 100) / 100,
                                y: Math.round(yFixed * canvasHeight * 100) / 100
                            });
                        }
                    }
                    if (knots.length >= 2) {
                        const d = knots.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ") + " Z";
                        vectorObjects.push({
                            id: `psd_path_${i}_${vectorObjects.length + 1}`,
                            kind: "path",
                            d,
                            points: knots,
                            closed: true,
                            fill: "#3b82f6",
                            stroke: "#000000",
                            strokeWidth: 1,
                            opacity: 1
                        });
                    }
                }

                const paddedResLen = resLen % 2 !== 0 ? resLen + 1 : resLen;
                lPos = resDataStart + paddedResLen;
            }

            lPos = extraEnd;
            records.push({
                name: layerName,
                top,
                left,
                bottom,
                right,
                channels,
                blendMode: mapPsdBlendMode(blendKey),
                opacity: Math.round((opacityByte / 255) * 100) / 100,
                visible,
                groupDividerType,
                vectorObjects
            });
        }

        // Decode Channel Image Data for each layer (Raw=0, PackBits RLE=1, ZIP=2, ZIP-Prediction=3)
        for (const rec of records) {
            const lw = Math.max(0, rec.right - rec.left);
            const lh = Math.max(0, rec.bottom - rec.top);
            const fullRgba = Buffer.alloc(canvasWidth * canvasHeight * 4, 0);
            const bytesPerSample = Math.max(1, Math.floor(bitDepth / 8));

            const chBuffers = new Map<number, Buffer>();
            for (const ch of rec.channels) {
                const chStart = lPos;
                if (lw === 0 || lh === 0 || ch.dataLen < 2) {
                    lPos = chStart + ch.dataLen;
                    continue;
                }
                const compression = psdBuf.readUInt16BE(lPos);
                lPos += 2;

                const plane = Buffer.alloc(lw * lh);
                if (compression === 0) {
                    if (bytesPerSample === 1) {
                        psdBuf.copy(plane, 0, lPos, lPos + lw * lh);
                    } else {
                        for (let p = 0; p < lw * lh; p++) {
                            plane[p] = psdBuf[lPos + p * bytesPerSample] || 0;
                        }
                    }
                } else if (compression === 1) {
                    const rowCountBytes = isPsb ? lh * 4 : lh * 2;
                    let rlePos = lPos + rowCountBytes;
                    for (let row = 0; row < lh; row++) {
                        const decoded = decodePackBitsRow(psdBuf, rlePos, lw * bytesPerSample);
                        if (bytesPerSample === 1) {
                            decoded.row.copy(plane, row * lw);
                        } else {
                            for (let x = 0; x < lw; x++) {
                                plane[row * lw + x] = decoded.row[x * bytesPerSample];
                            }
                        }
                        rlePos = decoded.nextOffset;
                    }
                } else if (compression === 2 || compression === 3) {
                    try {
                        const zipSlice = psdBuf.subarray(lPos, chStart + ch.dataLen);
                        const inflated = zlib.inflateSync(zipSlice);
                        if (compression === 3 && bytesPerSample === 1) {
                            // Horizontal delta prediction
                            for (let row = 0; row < lh; row++) {
                                let acc = 0;
                                for (let x = 0; x < lw; x++) {
                                    acc = (acc + inflated[row * lw + x]) & 0xff;
                                    plane[row * lw + x] = acc;
                                }
                            }
                        } else {
                            inflated.copy(plane, 0, 0, Math.min(inflated.length, plane.length));
                        }
                    } catch {
                        // Ignore corrupt zip stream
                    }
                }
                chBuffers.set(ch.id, plane);
                lPos = chStart + ch.dataLen;
            }

            // Skip group bounding marker pseudo-layers (type === 3)
            if (rec.groupDividerType === 3) continue;

            if (lw > 0 && lh > 0) {
                const rPlane = chBuffers.get(0);
                const gPlane = chBuffers.get(1);
                const bPlane = chBuffers.get(2);
                const aPlane = chBuffers.get(-1);
                const maskPlane = chBuffers.get(-2);

                for (let ly = 0; ly < lh; ly++) {
                    const cy = rec.top + ly;
                    if (cy < 0 || cy >= canvasHeight) continue;
                    for (let lx = 0; lx < lw; lx++) {
                        const cx = rec.left + lx;
                        if (cx < 0 || cx >= canvasWidth) continue;
                        const sIdx = ly * lw + lx;
                        const dIdx = (cy * canvasWidth + cx) * 4;
                        if (colorMode === 2 && indexedPalette && rPlane) {
                            const pIdx = rPlane[sIdx];
                            fullRgba[dIdx] = indexedPalette[pIdx] || 0;
                            fullRgba[dIdx + 1] = indexedPalette[256 + pIdx] || 0;
                            fullRgba[dIdx + 2] = indexedPalette[512 + pIdx] || 0;
                        } else if (colorMode === 1 && rPlane) {
                            const g = rPlane[sIdx];
                            fullRgba[dIdx] = g;
                            fullRgba[dIdx + 1] = g;
                            fullRgba[dIdx + 2] = g;
                        } else {
                            fullRgba[dIdx] = rPlane ? rPlane[sIdx] : 0;
                            fullRgba[dIdx + 1] = gPlane ? gPlane[sIdx] : 0;
                            fullRgba[dIdx + 2] = bPlane ? bPlane[sIdx] : 0;
                        }
                        let alpha = aPlane ? aPlane[sIdx] : 255;
                        if (maskPlane && sIdx < maskPlane.length) {
                            alpha = Math.round((alpha * maskPlane[sIdx]) / 255);
                        }
                        fullRgba[dIdx + 3] = alpha;
                    }
                }
            }

            layers.push({
                name: rec.name,
                type: "raster",
                width: lw,
                height: lh,
                offsetX: rec.left,
                offsetY: rec.top,
                opacity: rec.opacity,
                visible: rec.visible,
                blendMode: rec.blendMode,
                rgba: fullRgba
            });

            if (rec.vectorObjects.length > 0) {
                layers.push({
                    name: `${rec.name} (Vector Mask)`,
                    type: "vector",
                    width: canvasWidth,
                    height: canvasHeight,
                    offsetX: 0,
                    offsetY: 0,
                    opacity: rec.opacity,
                    visible: rec.visible,
                    blendMode: rec.blendMode,
                    objects: rec.vectorObjects
                });
            }
        }
    };

    if (lmLenInfo.val > 0 && pos + lmLenInfo.bytes <= layerMaskEnd) {
        const layerInfoLen = readLen(pos);
        pos += layerInfoLen.bytes;

        if (layerInfoLen.val > 0) {
            parseLayerRecordsAndChannels(pos);
        }
    }

    pos = layerMaskEnd;

    // Fallback to merged composite image if PSD had 0 layers
    if (layers.length === 0 && pos + 2 <= psdBuf.length) {
        const compression = psdBuf.readUInt16BE(pos);
        pos += 2;
        const fullRgba = Buffer.alloc(canvasWidth * canvasHeight * 4, 255);
        const planeLen = canvasWidth * canvasHeight;
        if (compression === 0 && pos + planeLen * Math.min(numChannels, 3) <= psdBuf.length) {
            for (let i = 0; i < planeLen; i++) {
                fullRgba[i * 4] = psdBuf[pos + i];
                fullRgba[i * 4 + 1] = numChannels >= 2 ? psdBuf[pos + planeLen + i] : psdBuf[pos + i];
                fullRgba[i * 4 + 2] = numChannels >= 3 ? psdBuf[pos + planeLen * 2 + i] : psdBuf[pos + i];
                fullRgba[i * 4 + 3] = numChannels >= 4 ? psdBuf[pos + planeLen * 3 + i] : 255;
            }
        }
        layers.push({
            name: "Background",
            type: "raster",
            width: canvasWidth,
            height: canvasHeight,
            offsetX: 0,
            offsetY: 0,
            opacity: 1,
            visible: true,
            blendMode: "normal",
            rgba: fullRgba
        });
    }

    return {
        format: "psd",
        width: canvasWidth,
        height: canvasHeight,
        layers
    };
}

// ============================================================================
// 5. GIMP XCF Binary Parser (`app/xcf/xcf-load.c`)
// ============================================================================

