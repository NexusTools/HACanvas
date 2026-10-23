import { escapeXml } from "../zip-xml-package.js";
import type { ArtCanvasState, ArtLayerSpec, VectorObjectSpec } from "../types/canvas-types.js";

export function serializeVectorObjectToSvgElement(obj: VectorObjectSpec): string {
    if (obj.kind === "ref") {
        const transforms: string[] = [];
        if (obj.x || obj.y) transforms.push(`translate(${obj.x ?? 0}, ${obj.y ?? 0})`);
        if ((obj.scaleX !== undefined && obj.scaleX !== 1) || (obj.scaleY !== undefined && obj.scaleY !== 1)) {
            transforms.push(`scale(${obj.scaleX ?? 1}, ${obj.scaleY ?? 1})`);
        }
        if (obj.rotation) transforms.push(`rotate(${obj.rotation})`);
        if (obj.skewX) transforms.push(`skewX(${obj.skewX})`);
        if (obj.skewY) transforms.push(`skewY(${obj.skewY})`);
        const tfAttr = transforms.length > 0 ? ` transform="${transforms.join(" ")}"` : "";
        const extraRefAttrs = [
            obj.rotation !== undefined ? `data-rotation="${obj.rotation}"` : "",
            obj.skewX !== undefined ? `data-skew-x="${obj.skewX}"` : "",
            obj.skewY !== undefined ? `data-skew-y="${obj.skewY}"` : "",
            obj.startFrame !== undefined ? `data-start-frame="${obj.startFrame}"` : "",
            obj.endFrame !== undefined ? `data-end-frame="${obj.endFrame}"` : "",
            obj.filtersEnabled !== undefined ? `data-filters-enabled="${obj.filtersEnabled}"` : "",
            obj.attachedFilters && obj.attachedFilters.length > 0
                ? `data-attached-filters-b64="${Buffer.from(JSON.stringify(obj.attachedFilters), "utf8").toString("base64")}"`
                : ""
        ].filter(Boolean).join(" ");
        return `<use id="${escapeXml(obj.id)}" href="#${escapeXml(obj.refId)}" opacity="${obj.opacity ?? 1}"${extraRefAttrs ? " " + extraRefAttrs : ""}${tfAttr} />`;
    }
    const metaDataAttrs = [
        obj.rotation !== undefined ? `data-rotation="${obj.rotation}"` : "",
        obj.skewX !== undefined ? `data-skew-x="${obj.skewX}"` : "",
        obj.skewY !== undefined ? `data-skew-y="${obj.skewY}"` : "",
        obj.startFrame !== undefined ? `data-start-frame="${obj.startFrame}"` : "",
        obj.endFrame !== undefined ? `data-end-frame="${obj.endFrame}"` : "",
        obj.filtersEnabled !== undefined ? `data-filters-enabled="${obj.filtersEnabled}"` : "",
        obj.attachedFilters && obj.attachedFilters.length > 0
            ? `data-attached-filters-b64="${Buffer.from(JSON.stringify(obj.attachedFilters), "utf8").toString("base64")}"`
            : ""
    ].filter(Boolean).join(" ");

    if (obj.kind === "image") {
        const w = obj.width ?? obj.imageWidth ?? 100;
        const h = obj.height ?? obj.imageHeight ?? 100;
        const imgW = obj.imageWidth ?? w;
        const imgH = obj.imageHeight ?? h;
        const href = obj.imageDataUrl || "";
        const tfAttr = obj.transform ? ` transform="${escapeXml(obj.transform)}"` : "";
        return `<image id="${escapeXml(obj.id)}" x="${obj.x ?? 0}" y="${obj.y ?? 0}" width="${w}" height="${h}" data-image-width="${imgW}" data-image-height="${imgH}" opacity="${obj.opacity ?? 1}"${metaDataAttrs ? " " + metaDataAttrs : ""}${tfAttr} href="${escapeXml(href)}" />`;
    }

    let computedTransform = obj.transform || "";
    if (!computedTransform && (obj.rotation || obj.skewX || obj.skewY)) {
        const tParts: string[] = [];
        if (obj.rotation) tParts.push(`rotate(${obj.rotation})`);
        if (obj.skewX) tParts.push(`skewX(${obj.skewX})`);
        if (obj.skewY) tParts.push(`skewY(${obj.skewY})`);
        computedTransform = tParts.join(" ");
    }

    const common = `id="${escapeXml(obj.id)}" fill="${escapeXml(obj.fill ?? "none")}" stroke="${escapeXml(obj.stroke ?? "none")}" stroke-width="${obj.strokeWidth ?? 1}" opacity="${obj.opacity ?? 1}"${metaDataAttrs ? " " + metaDataAttrs : ""}${computedTransform ? ` transform="${escapeXml(computedTransform)}"` : ""}`;
    if (obj.kind === "rect") {
        return `<rect ${common} x="${obj.x ?? 0}" y="${obj.y ?? 0}" width="${obj.width ?? 100}" height="${obj.height ?? 100}"${obj.rx ? ` rx="${obj.rx}"` : ""}${obj.ry ? ` ry="${obj.ry}"` : ""} />`;
    }
    if (obj.kind === "circle") {
        const r = obj.r ?? (obj.width ? obj.width / 2 : 50);
        return `<circle ${common} cx="${obj.x ?? r}" cy="${obj.y ?? r}" r="${r}" />`;
    }
    if (obj.kind === "ellipse") {
        const rx = obj.rx ?? (obj.width ? obj.width / 2 : 50);
        const ry = obj.ry ?? (obj.height ? obj.height / 2 : 50);
        return `<ellipse ${common} cx="${obj.x ?? rx}" cy="${obj.y ?? ry}" rx="${rx}" ry="${ry}" />`;
    }
    if (obj.kind === "line") {
        const curveAttrs = obj.cx !== undefined && obj.cy !== undefined ? ` data-cx="${obj.cx}" data-cy="${obj.cy}"` : "";
        return `<line ${common} x1="${obj.x ?? 0}" y1="${obj.y ?? 0}" x2="${obj.x2 ?? 100}" y2="${obj.y2 ?? 100}"${curveAttrs} />`;
    }
    if ((obj.kind === "polygon" || obj.kind === "star") && obj.points) {
        const ptsStr = obj.points.map(p => `${p.x},${p.y}`).join(" ");
        return `<polygon ${common} points="${ptsStr}" />`;
    }
    if (obj.kind === "path") {
        return `<path ${common} d="${escapeXml(obj.d || "")}" />`;
    }
    if (obj.kind === "text") {
        const fwAttr = obj.fontWeight ? ` font-weight="${escapeXml(obj.fontWeight)}"` : "";
        const fsAttr = obj.fontStyle ? ` font-style="${escapeXml(obj.fontStyle)}"` : "";
        const lsAttr = obj.letterSpacing !== undefined ? ` letter-spacing="${obj.letterSpacing}"` : "";
        const fidAttr = obj.fontId ? ` data-font-id="${escapeXml(obj.fontId)}"` : "";
        return `<text ${common} x="${obj.x ?? 0}" y="${obj.y ?? 16}" font-family="${escapeXml(obj.fontFamily || "sans-serif")}" font-size="${obj.fontSize ?? 16}"${fwAttr}${fsAttr}${lsAttr}${fidAttr}>${escapeXml(obj.text || "")}</text>`;
    }
    if (obj.kind === "boolean" && obj.booleanOp) {
        return `<g ${common} data-boolean-op="${obj.booleanOp.operation}">${serializeVectorObjectToSvgElement(obj.booleanOp.shapeA)}${serializeVectorObjectToSvgElement(obj.booleanOp.shapeB)}</g>`;
    }
    return "";
}

export function encodeLayerToSvgDocument(state: ArtCanvasState, layer: ArtLayerSpec): string {
    const elements = layer.objects.map(obj => serializeVectorObjectToSvgElement(obj)).join("\n  ");
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${state.width}" height="${state.height}" viewBox="0 0 ${state.width} ${state.height}">
  <g id="${layer.id}" opacity="${layer.opacity}">
  ${elements}
  </g>
</svg>`;
}
