import path from "node:path";
import type { BlendMode } from "../hybrid-art-engine.js";
import { extractZipArchive, parseXmlDocument } from "../zip-xml-package.js";
import type { DecodedLayerItem, DecodedMultiLayerDocument } from "../types/document-metadata-types.js";
import { decodePngToRgba } from "./png-importer.js";

export function parseOraBuffer(oraBuf: Buffer): DecodedMultiLayerDocument {
    const files = extractZipArchive(oraBuf);
    const stackXmlBuf = files.get("stack.xml");
    if (!stackXmlBuf) {
        throw new Error("Invalid OpenRaster (.ora) archive: missing stack.xml");
    }

    const root = parseXmlDocument(stackXmlBuf.toString("utf8"));
    const canvasW = parseInt(root.attrs.w || "512", 10);
    const canvasH = parseInt(root.attrs.h || "512", 10);

    const mapOraBlend = (op?: string): BlendMode => {
        if (op === "svg:multiply") return "multiply";
        if (op === "svg:screen") return "screen";
        if (op === "svg:overlay") return "overlay";
        if (op === "svg:plus") return "add";
        return "normal";
    };

    const rawLayers: DecodedLayerItem[] = [];
    const collectLayers = (node: any) => {
        for (const child of node.children || []) {
            if (child.tag === "layer") {
                const src = child.attrs.src || "";
                const name = child.attrs.name || path.basename(src, ".png") || "ORA Layer";
                const ox = parseInt(child.attrs.x || "0", 10);
                const oy = parseInt(child.attrs.y || "0", 10);
                const opacity = parseFloat(child.attrs.opacity ?? "1.0");
                const visible = child.attrs.visibility !== "hidden";
                const blendMode = mapOraBlend(child.attrs["composite-op"]);

                const fullRgba = Buffer.alloc(canvasW * canvasH * 4, 0);
                const pngData = files.get(src);
                if (pngData) {
                    const decoded = decodePngToRgba(pngData);
                    for (let ly = 0; ly < decoded.height; ly++) {
                        const cy = oy + ly;
                        if (cy < 0 || cy >= canvasH) continue;
                        for (let lx = 0; lx < decoded.width; lx++) {
                            const cx = ox + lx;
                            if (cx < 0 || cx >= canvasW) continue;
                            const sOff = (ly * decoded.width + lx) * 4;
                            const dOff = (cy * canvasW + cx) * 4;
                            decoded.rgba.copy(fullRgba, dOff, sOff, sOff + 4);
                        }
                    }
                }

                rawLayers.push({
                    name,
                    type: "raster",
                    width: canvasW,
                    height: canvasH,
                    offsetX: ox,
                    offsetY: oy,
                    opacity,
                    visible,
                    blendMode,
                    rgba: fullRgba
                });
            } else if (child.tag === "stack") {
                collectLayers(child);
            }
        }
    };
    collectLayers(root);

    // OpenRaster stack.xml lists layers from top to bottom; reverse so bottom layer is index 0
    return {
        format: "ora",
        width: canvasW,
        height: canvasH,
        layers: rawLayers.reverse()
    };
}

