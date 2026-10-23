import { parseXmlDocument, type ParsedXmlNode } from "../zip-xml-package.js";

export interface ParsedSvgHeaderInfo {
    root: ParsedXmlNode;
    width: number;
    height: number;
}

export function parseSvgXmlHeader(svgContent: string): ParsedSvgHeaderInfo {
    const root = parseXmlDocument(svgContent);
    let svgW = parseFloat(root.attrs.width || "0");
    let svgH = parseFloat(root.attrs.height || "0");
    if ((!svgW || !svgH) && root.attrs.viewBox) {
        const parts = root.attrs.viewBox.trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4) {
            svgW = svgW || parts[2];
            svgH = svgH || parts[3];
        }
    }
    svgW = Math.max(1, Math.round(svgW || 512));
    svgH = Math.max(1, Math.round(svgH || 512));
    return { root, width: svgW, height: svgH };
}
