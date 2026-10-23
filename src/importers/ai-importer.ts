import zlib from "node:zlib";
import type { VectorObjectSpec } from "../hybrid-art-engine.js";
import type { DecodedLayerItem, DecodedMultiLayerDocument } from "../types/document-metadata-types.js";
import { parsePdfBuffer } from "./pdf-importer.js";

export function clampByte(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

export function rgbFloatsToHex(r: number, g: number, b: number): string {
    const rb = clampByte(r * 255).toString(16).padStart(2, "0");
    const gb = clampByte(g * 255).toString(16).padStart(2, "0");
    const bb = clampByte(b * 255).toString(16).padStart(2, "0");
    return `#${rb}${gb}${bb}`;
}

export function cmykFloatsToHex(c: number, m: number, y: number, k: number, tint = 1): string {
    const effC = c * tint;
    const effM = m * tint;
    const effY = y * tint;
    const effK = k * tint;
    const r = (1 - Math.min(1, effC)) * (1 - Math.min(1, effK));
    const g = (1 - Math.min(1, effM)) * (1 - Math.min(1, effK));
    const b = (1 - Math.min(1, effY)) * (1 - Math.min(1, effK));
    return rgbFloatsToHex(r, g, b);
}

export function unescapePsString(raw: string): string {
    return raw
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
}

interface AiGraphicsState {
    ctm: [number, number, number, number, number, number]; // [a, b, c, d, e, f]
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    opacity: number;
    fontSize: number;
    fontFamily: string;
    textX: number;
    textY: number;
}

export function multiplyMatrix(
    m1: [number, number, number, number, number, number],
    m2: [number, number, number, number, number, number]
): [number, number, number, number, number, number] {
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;
    return [
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2
    ];
}

/**
 * Tokenizes PostScript / PDF content streams into numbers, `(strings)`, `/names`, `[arrays]`, and operator keywords.
 */
export function tokenizeAiContentStream(streamText: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    const len = streamText.length;

    while (i < len) {
        const ch = streamText[i];

        // Skip whitespace
        if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f" || ch === "\0") {
            i++;
            continue;
        }

        // Handle comments: preserve `%AI5_BeginLayer`, `%AI5_EndLayer`, `%AI` directives as tokens; skip normal comments
        if (ch === "%") {
            let endLine = i;
            while (endLine < len && streamText[endLine] !== "\n" && streamText[endLine] !== "\r") {
                endLine++;
            }
            const commentLine = streamText.slice(i, endLine).trim();
            if (/^%AI\d*_(BeginLayer|EndLayer)/.test(commentLine)) {
                tokens.push(commentLine.split(/\s+/)[0]);
            }
            i = endLine;
            continue;
        }

        // Handle literal strings `(...)` with balanced parentheses & backslash escapes
        if (ch === "(") {
            let depth = 1;
            let j = i + 1;
            while (j < len && depth > 0) {
                if (streamText[j] === "\\") {
                    j += 2;
                    continue;
                }
                if (streamText[j] === "(") depth++;
                else if (streamText[j] === ")") depth--;
                j++;
            }
            tokens.push(streamText.slice(i, j));
            i = j;
            continue;
        }

        // Handle PDF dictionaries `<< ... >>` or hex strings `<...>`
        if (ch === "<") {
            if (streamText[i + 1] === "<") {
                let depth = 1;
                let j = i + 2;
                while (j < len - 1 && depth > 0) {
                    if (streamText[j] === "<" && streamText[j + 1] === "<") {
                        depth++;
                        j += 2;
                    } else if (streamText[j] === ">" && streamText[j + 1] === ">") {
                        depth--;
                        j += 2;
                    } else {
                        j++;
                    }
                }
                tokens.push(streamText.slice(i, j));
                i = j;
                continue;
            } else {
                let j = i + 1;
                while (j < len && streamText[j] !== ">") j++;
                tokens.push(streamText.slice(i, j + 1));
                i = j + 1;
                continue;
            }
        }

        // Handle arrays `[...]`
        if (ch === "[") {
            let depth = 1;
            let j = i + 1;
            while (j < len && depth > 0) {
                if (streamText[j] === "(") {
                    let sDepth = 1;
                    j++;
                    while (j < len && sDepth > 0) {
                        if (streamText[j] === "\\") {
                            j += 2;
                            continue;
                        }
                        if (streamText[j] === "(") sDepth++;
                        else if (streamText[j] === ")") sDepth--;
                        j++;
                    }
                    continue;
                }
                if (streamText[j] === "[") depth++;
                else if (streamText[j] === "]") depth--;
                j++;
            }
            tokens.push(streamText.slice(i, j));
            i = j;
            continue;
        }

        // Handle `/Name` tokens
        if (ch === "/") {
            let j = i + 1;
            while (
                j < len &&
                !/[\s()<>[\]{}/%]/.test(streamText[j])
            ) {
                j++;
            }
            tokens.push(streamText.slice(i, j));
            i = j;
            continue;
        }

        // Regular number or operator token
        let j = i;
        while (
            j < len &&
            !/[\s()<>[\]{}/%]/.test(streamText[j])
        ) {
            j++;
        }
        if (j > i) {
            tokens.push(streamText.slice(i, j));
            i = j;
        } else {
            i++;
        }
    }

    return tokens;
}

/**
 * Parses an Adobe Illustrator (`.ai`) buffer (supporting both PDF-compatible `.ai` files with `/FlateDecode`
 * content streams and `/OCG` layers, as well as legacy PostScript-based `.ai` files with `%AI5_BeginLayer`)
 * into a multi-layer vector document (`DecodedMultiLayerDocument`).
 */
export function parseAiBuffer(aiBuf: Buffer): DecodedMultiLayerDocument {
    const rawLatin1 = aiBuf.toString("latin1");
    const head = rawLatin1.slice(0, 1024);

    const isPdf = head.includes("%PDF-");
    const isPs =
        head.includes("%!PS-Adobe-") ||
        head.includes("%%Creator: Adobe Illustrator") ||
        rawLatin1.includes("%AI5_BeginLayer");

    if (!isPdf && !isPs) {
        throw new Error("Invalid Adobe Illustrator (.ai) file: missing %PDF- or %!PS-Adobe- signature.");
    }

    // 1. Determine Artboard / BoundingBox coordinates `[llx, lly, urx, ury]`
    let llx = 0;
    let lly = 0;
    let urx = 512;
    let ury = 512;
    let foundBox = false;

    const pdfBoxPatterns = [
        /\/ArtBox\s*\[\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\]/,
        /\/CropBox\s*\[\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\]/,
        /\/MediaBox\s*\[\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\]/
    ];
    for (const pat of pdfBoxPatterns) {
        const m = rawLatin1.match(pat);
        if (m) {
            llx = parseFloat(m[1]);
            lly = parseFloat(m[2]);
            urx = parseFloat(m[3]);
            ury = parseFloat(m[4]);
            if (urx > llx && ury > lly) {
                foundBox = true;
                break;
            }
        }
    }

    if (!foundBox) {
        const psBoxPatterns = [
            /%%HiResBoundingBox:\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)/,
            /%%BoundingBox:\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)/
        ];
        for (const pat of psBoxPatterns) {
            const m = rawLatin1.match(pat);
            if (m) {
                llx = parseFloat(m[1]);
                lly = parseFloat(m[2]);
                urx = parseFloat(m[3]);
                ury = parseFloat(m[4]);
                if (urx > llx && ury > lly) {
                    foundBox = true;
                    break;
                }
            }
        }
    }

    const canvasWidth = Math.max(1, Math.round(urx - llx) || 512);
    const canvasHeight = Math.max(1, Math.round(ury - lly) || 512);

    // 2. Extract PDF Optional Content Group (`/OCG`) layer names and `/Properties` mappings
    const ocgObjIdToName = new Map<string, string>();
    const propTagToLayerName = new Map<string, string>();

    if (isPdf) {
        const objRegex = /(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g;
        let objMatch: RegExpExecArray | null;
        while ((objMatch = objRegex.exec(rawLatin1)) !== null) {
            const objId = objMatch[1];
            const body = objMatch[2];
            if (body.includes("/OCG") || body.includes("/Layer")) {
                const nameMatch = body.match(/\/Name\s*\(([^)]*)\)/);
                if (nameMatch) {
                    ocgObjIdToName.set(objId, unescapePsString(nameMatch[1]).trim() || `Layer ${objId}`);
                }
            }
        }

        const propRegex = /\/Properties\s*<<([\s\S]*?)>>/g;
        let propMatch: RegExpExecArray | null;
        while ((propMatch = propRegex.exec(rawLatin1)) !== null) {
            const propBody = propMatch[1];
            const entryRegex = /\/([A-Za-z0-9_.-]+)\s+(\d+)\s+0\s+R/g;
            let entryMatch: RegExpExecArray | null;
            while ((entryMatch = entryRegex.exec(propBody)) !== null) {
                const tag = entryMatch[1];
                const targetObjId = entryMatch[2];
                const resolvedName = ocgObjIdToName.get(targetObjId);
                if (resolvedName) {
                    propTagToLayerName.set(tag, resolvedName);
                }
            }
        }
    }

    // 3. Collect content streams to parse
    const contentStreams: string[] = [];

    if (isPdf) {
        const streamRegex = /<<([\s\S]*?)>>\s*\r?\n?stream\r?\n/g;
        let sMatch: RegExpExecArray | null;
        while ((sMatch = streamRegex.exec(rawLatin1)) !== null) {
            const dict = sMatch[1];
            const streamStart = sMatch.index + sMatch[0].length;
            const endStreamIdx = rawLatin1.indexOf("endstream", streamStart);
            if (endStreamIdx === -1) break;

            // Skip image XObjects, thumbnails, metadata XML, and font programs
            if (
                /\/Subtype\s*\/Image\b/.test(dict) ||
                /\/Type\s*\/Metadata\b/.test(dict) ||
                /\/Subtype\s*\/XML\b/.test(dict) ||
                /\/FontFile/.test(dict)
            ) {
                streamRegex.lastIndex = endStreamIdx + 9;
                continue;
            }

            let rawSlice = aiBuf.subarray(streamStart, endStreamIdx);
            // Trim trailing \r\n before endstream
            if (rawSlice.length > 0 && rawSlice[rawSlice.length - 1] === 0x0a) {
                rawSlice = rawSlice.subarray(0, rawSlice.length - 1);
                if (rawSlice.length > 0 && rawSlice[rawSlice.length - 1] === 0x0d) {
                    rawSlice = rawSlice.subarray(0, rawSlice.length - 1);
                }
            }

            let decodedText = "";
            if (/\/FlateDecode\b/.test(dict)) {
                try {
                    decodedText = zlib.inflateSync(rawSlice).toString("latin1");
                } catch {
                    try {
                        decodedText = zlib.inflateRawSync(rawSlice).toString("latin1");
                    } catch {
                        decodedText = "";
                    }
                }
            } else {
                decodedText = rawSlice.toString("latin1");
            }

            if (decodedText.trim().length > 0) {
                contentStreams.push(decodedText);
            }
            streamRegex.lastIndex = endStreamIdx + 9;
        }
    }

    // Also include PostScript private data / direct PostScript body if present and not already captured
    if (isPs && (contentStreams.length === 0 || rawLatin1.includes("%AI5_BeginLayer"))) {
        const psStart = rawLatin1.indexOf("%AI5_BeginLayer");
        if (psStart !== -1) {
            contentStreams.push(rawLatin1.slice(psStart));
        } else if (!isPdf) {
            contentStreams.push(rawLatin1);
        }
    }

    // 4. Execute PostScript / PDF vector interpreter across collected streams
    const layersByName = new Map<string, DecodedLayerItem>();
    const layerOrder: DecodedLayerItem[] = [];

    const getOrCreateLayer = (name: string, visible = true): DecodedLayerItem => {
        const cleanName = (name || "Layer 1").trim() || "Layer 1";
        let existing = layersByName.get(cleanName);
        if (!existing) {
            existing = {
                name: cleanName,
                type: "vector",
                width: canvasWidth,
                height: canvasHeight,
                offsetX: 0,
                offsetY: 0,
                opacity: 1,
                visible,
                blendMode: "normal",
                objects: []
            };
            layersByName.set(cleanName, existing);
            layerOrder.push(existing);
        }
        return existing;
    };

    let currentLayer: DecodedLayerItem | null = null;
    const layerStack: DecodedLayerItem[] = [];
    let objCounter = 1;

    for (const streamText of contentStreams) {
        const tokens = tokenizeAiContentStream(streamText);
        const operandStack: string[] = [];
        const stateStack: AiGraphicsState[] = [];

        let state: AiGraphicsState = {
            ctm: [1, 0, 0, 1, 0, 0],
            fillColor: "#000000",
            strokeColor: "#000000",
            strokeWidth: 1,
            opacity: 1,
            fontSize: 16,
            fontFamily: "sans-serif",
            textX: 0,
            textY: 0
        };

        const toCanvasPt = (x: number, y: number): { x: number; y: number } => {
            const [a, b, c, d, e, f] = state.ctm;
            const tx = a * x + c * y + e;
            const ty = b * x + d * y + f;
            return {
                x: Math.round((tx - llx) * 100) / 100,
                y: Math.round((canvasHeight - (ty - lly)) * 100) / 100
            };
        };

        let pathCommands: string[] = [];
        let pathPoints: { x: number; y: number }[] = [];
        let subpathStartPt: { x: number; y: number } | null = null;
        let curPt: { x: number; y: number } = { x: 0, y: 0 };
        let curRawPt: { x: number; y: number } = { x: 0, y: 0 };
        let pathClosed = false;
        let pendingRectSpec: { x: number; y: number; width: number; height: number } | null = null;
        let pendingLayerVisible = true;

        const resetPath = () => {
            pathCommands = [];
            pathPoints = [];
            subpathStartPt = null;
            pathClosed = false;
            pendingRectSpec = null;
        };

        const popNumber = (): number => {
            const tok = operandStack.pop();
            return tok !== undefined ? parseFloat(tok) : 0;
        };

        const popNumbers = (count: number): number[] => {
            const out: number[] = [];
            for (let k = 0; k < count; k++) {
                out.unshift(popNumber());
            }
            return out;
        };

        const emitCurrentPath = (doFill: boolean, doStroke: boolean, closeFirst: boolean) => {
            if (pathCommands.length === 0 && !pendingRectSpec) {
                resetPath();
                return;
            }
            if (!currentLayer) {
                currentLayer = getOrCreateLayer("Layer 1", true);
            }
            if (closeFirst && !pathClosed) {
                pathCommands.push("Z");
                if (subpathStartPt && pathPoints.length > 0) {
                    pathPoints.push({ ...subpathStartPt });
                }
                pathClosed = true;
            }

            const fill = doFill ? state.fillColor : "none";
            const stroke = doStroke ? state.strokeColor : "none";

            if (pendingRectSpec && pathCommands.length <= 5) {
                currentLayer.objects!.push({
                    id: `ai_rect_${objCounter++}`,
                    kind: "rect",
                    x: pendingRectSpec.x,
                    y: pendingRectSpec.y,
                    width: pendingRectSpec.width,
                    height: pendingRectSpec.height,
                    fill,
                    stroke,
                    strokeWidth: state.strokeWidth,
                    opacity: state.opacity
                });
                resetPath();
                return;
            }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of pathPoints) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
            if (!Number.isFinite(minX)) {
                minX = 0;
                minY = 0;
                maxX = 100;
                maxY = 100;
            }

            currentLayer.objects!.push({
                id: `ai_path_${objCounter++}`,
                kind: "path",
                d: pathCommands.join(" "),
                points: pathPoints,
                closed: pathClosed,
                x: Math.floor(minX),
                y: Math.floor(minY),
                width: Math.max(1, Math.ceil(maxX - minX)),
                height: Math.max(1, Math.ceil(maxY - minY)),
                fill,
                stroke,
                strokeWidth: state.strokeWidth,
                opacity: state.opacity
            });
            resetPath();
        };

        const emitTextObject = (rawStr: string) => {
            const cleanText = unescapePsString(rawStr.replace(/^\(|\)$/g, ""));
            if (!cleanText) return;
            if (!currentLayer) {
                currentLayer = getOrCreateLayer("Layer 1", true);
            }
            const pt = toCanvasPt(state.textX, state.textY);
            const scale = Math.max(1, Math.round(state.fontSize / 7));
            currentLayer.objects!.push({
                id: `ai_text_${objCounter++}`,
                kind: "text",
                x: pt.x,
                y: pt.y,
                width: cleanText.length * 6 * scale,
                height: 7 * scale,
                text: cleanText,
                fontFamily: state.fontFamily,
                fontSize: state.fontSize,
                fill: state.fillColor,
                stroke: "none",
                strokeWidth: 0,
                opacity: state.opacity
            });
        };

        for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
            const tok = tokens[tIdx];

            // Handle operands (numbers, strings, names, arrays, dicts)
            if (
                tok.startsWith("(") ||
                tok.startsWith("/") ||
                tok.startsWith("[") ||
                tok.startsWith("<") ||
                /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(tok)
            ) {
                operandStack.push(tok);
                continue;
            }

            // Handle PostScript AI Layer Directives
            if (tok === "%AI5_BeginLayer") {
                pendingLayerVisible = true;
                operandStack.length = 0;
                continue;
            }
            if (tok.startsWith("%AI5_EndLayer")) {
                operandStack.length = 0;
                continue;
            }
            if (tok === "Lb") {
                // `visible preview enabled ... Lb`
                if (operandStack.length >= 1) {
                    const firstVis = parseInt(operandStack[0], 10);
                    pendingLayerVisible = firstVis !== 0;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "Ln") {
                const nameTok = operandStack.pop() || "(Layer 1)";
                const layerName = unescapePsString(nameTok.replace(/^\(|\)$/g, ""));
                currentLayer = getOrCreateLayer(layerName, pendingLayerVisible);
                operandStack.length = 0;
                continue;
            }

            // Handle PDF Marked Content / OCG Layer Blocks (`BDC`, `BMC`, `EMC`)
            if (tok === "BDC" || tok === "BMC") {
                const propOrTag = operandStack.pop() || "";
                const ocTag = operandStack.pop() || "";
                let layerName = "";
                if (propOrTag.startsWith("<<")) {
                    const nm = propOrTag.match(/\/Name\s*\(([^)]*)\)/) || propOrTag.match(/\/Title\s*\(([^)]*)\)/);
                    if (nm) layerName = unescapePsString(nm[1]);
                } else if (propOrTag.startsWith("/")) {
                    const cleanProp = propOrTag.slice(1);
                    layerName = propTagToLayerName.get(cleanProp) || (ocTag === "/OC" || ocTag === "/Layer" ? cleanProp : "");
                }
                if (layerName) {
                    if (currentLayer) layerStack.push(currentLayer);
                    currentLayer = getOrCreateLayer(layerName, true);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "EMC") {
                if (layerStack.length > 0) {
                    currentLayer = layerStack.pop()!;
                }
                operandStack.length = 0;
                continue;
            }

            // Graphics State Operators (`q`, `Q`, `cm`, `w`)
            if (tok === "q") {
                stateStack.push({
                    ...state,
                    ctm: [...state.ctm] as [number, number, number, number, number, number]
                });
                continue;
            }
            if (tok === "Q") {
                if (stateStack.length > 0) {
                    state = stateStack.pop()!;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "cm") {
                if (operandStack.length >= 6) {
                    const [a, b, c, d, e, f] = popNumbers(6);
                    state.ctm = multiplyMatrix([a, b, c, d, e, f], state.ctm);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "w") {
                const wVal = popNumber();
                if (wVal > 0) state.strokeWidth = wVal;
                operandStack.length = 0;
                continue;
            }

            // Color Operators (RGB: `Xa`, `XA`, `rg`, `RG`; CMYK: `k`, `K`, `x`, `X`; Gray: `g`, `G`; Generic `sc`/`SC`/`scn`/`SCN`)
            if (tok === "Xa" || tok === "rg") {
                if (operandStack.length >= 3) {
                    const [r, g, b] = popNumbers(3);
                    state.fillColor = rgbFloatsToHex(r, g, b);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "XA" || tok === "RG") {
                if (operandStack.length >= 3) {
                    const [r, g, b] = popNumbers(3);
                    state.strokeColor = rgbFloatsToHex(r, g, b);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "k") {
                if (operandStack.length >= 4) {
                    const [c, m, y, k] = popNumbers(4);
                    state.fillColor = cmykFloatsToHex(c, m, y, k);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "K") {
                if (operandStack.length >= 4) {
                    const [c, m, y, k] = popNumbers(4);
                    state.strokeColor = cmykFloatsToHex(c, m, y, k);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "x" || tok === "X") {
                // Custom CMYK spot color: `c m y k (SpotName) tint x`
                const tint = popNumber();
                operandStack.pop(); // spot name
                if (operandStack.length >= 4) {
                    const [c, m, y, k] = popNumbers(4);
                    const hex = cmykFloatsToHex(c, m, y, k, 1 - tint);
                    if (tok === "x") state.fillColor = hex;
                    else state.strokeColor = hex;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "g") {
                if (operandStack.length >= 1) {
                    const gray = popNumber();
                    state.fillColor = rgbFloatsToHex(gray, gray, gray);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "G") {
                if (operandStack.length >= 1) {
                    const gray = popNumber();
                    state.strokeColor = rgbFloatsToHex(gray, gray, gray);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "sc" || tok === "scn" || tok === "SC" || tok === "SCN") {
                const numericArgs = operandStack.filter(a => /^[-+]?(?:\d+\.?\d*|\.\d+)/.test(a)).map(Number);
                let hex = "";
                if (numericArgs.length === 3) {
                    hex = rgbFloatsToHex(numericArgs[0], numericArgs[1], numericArgs[2]);
                } else if (numericArgs.length >= 4) {
                    hex = cmykFloatsToHex(numericArgs[0], numericArgs[1], numericArgs[2], numericArgs[3]);
                } else if (numericArgs.length === 1) {
                    hex = rgbFloatsToHex(numericArgs[0], numericArgs[0], numericArgs[0]);
                }
                if (hex) {
                    if (tok === "sc" || tok === "scn") state.fillColor = hex;
                    else state.strokeColor = hex;
                }
                operandStack.length = 0;
                continue;
            }

            // Path Construction Operators (`m`, `l`/`L`, `c`/`C`, `v`/`V`, `y`/`Y`, `re`, `h`)
            if (tok === "m") {
                if (operandStack.length >= 2) {
                    const [rawX, rawY] = popNumbers(2);
                    curRawPt = { x: rawX, y: rawY };
                    curPt = toCanvasPt(rawX, rawY);
                    subpathStartPt = { ...curPt };
                    pathCommands.push(`M ${curPt.x} ${curPt.y}`);
                    pathPoints.push({ ...curPt });
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "l" || tok === "L") {
                if (operandStack.length >= 2) {
                    const [rawX, rawY] = popNumbers(2);
                    curRawPt = { x: rawX, y: rawY };
                    curPt = toCanvasPt(rawX, rawY);
                    pathCommands.push(`L ${curPt.x} ${curPt.y}`);
                    pathPoints.push({ ...curPt });
                    pendingRectSpec = null;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "c" || tok === "C") {
                if (operandStack.length >= 6) {
                    const [rx1, ry1, rx2, ry2, rx3, ry3] = popNumbers(6);
                    const p0 = { ...curPt };
                    const p1 = toCanvasPt(rx1, ry1);
                    const p2 = toCanvasPt(rx2, ry2);
                    const p3 = toCanvasPt(rx3, ry3);
                    pathCommands.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
                    for (let s = 1; s <= 12; s++) {
                        const t = s / 12;
                        const mt = 1 - t;
                        pathPoints.push({
                            x: Math.round((mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x) * 100) / 100,
                            y: Math.round((mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y) * 100) / 100
                        });
                    }
                    curRawPt = { x: rx3, y: ry3 };
                    curPt = p3;
                    pendingRectSpec = null;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "v" || tok === "V") {
                if (operandStack.length >= 4) {
                    const [rx2, ry2, rx3, ry3] = popNumbers(4);
                    const p0 = { ...curPt };
                    const p1 = { ...curPt };
                    const p2 = toCanvasPt(rx2, ry2);
                    const p3 = toCanvasPt(rx3, ry3);
                    pathCommands.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
                    for (let s = 1; s <= 12; s++) {
                        const t = s / 12;
                        const mt = 1 - t;
                        pathPoints.push({
                            x: Math.round((mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x) * 100) / 100,
                            y: Math.round((mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y) * 100) / 100
                        });
                    }
                    curRawPt = { x: rx3, y: ry3 };
                    curPt = p3;
                    pendingRectSpec = null;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "y" || tok === "Y") {
                if (operandStack.length >= 4) {
                    const [rx1, ry1, rx3, ry3] = popNumbers(4);
                    const p0 = { ...curPt };
                    const p1 = toCanvasPt(rx1, ry1);
                    const p3 = toCanvasPt(rx3, ry3);
                    const p2 = { ...p3 };
                    pathCommands.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
                    for (let s = 1; s <= 12; s++) {
                        const t = s / 12;
                        const mt = 1 - t;
                        pathPoints.push({
                            x: Math.round((mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x) * 100) / 100,
                            y: Math.round((mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y) * 100) / 100
                        });
                    }
                    curRawPt = { x: rx3, y: ry3 };
                    curPt = p3;
                    pendingRectSpec = null;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "re") {
                if (operandStack.length >= 4) {
                    const [rx, ry, rw, rh] = popNumbers(4);
                    const p1 = toCanvasPt(rx, ry);
                    const p2 = toCanvasPt(rx + rw, ry);
                    const p3 = toCanvasPt(rx + rw, ry + rh);
                    const p4 = toCanvasPt(rx, ry + rh);
                    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
                    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
                    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
                    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

                    if (pathCommands.length === 0 && state.ctm[1] === 0 && state.ctm[2] === 0) {
                        pendingRectSpec = {
                            x: Math.round(minX),
                            y: Math.round(minY),
                            width: Math.max(1, Math.round(maxX - minX)),
                            height: Math.max(1, Math.round(maxY - minY))
                        };
                    }
                    pathCommands.push(`M ${p4.x} ${p4.y} L ${p3.x} ${p3.y} L ${p2.x} ${p2.y} L ${p1.x} ${p1.y} Z`);
                    pathPoints.push(p4, p3, p2, p1, { ...p4 });
                    pathClosed = true;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "h") {
                if (!pathClosed && pathCommands.length > 0) {
                    pathCommands.push("Z");
                    if (subpathStartPt && pathPoints.length > 0) {
                        pathPoints.push({ ...subpathStartPt });
                    }
                    pathClosed = true;
                }
                operandStack.length = 0;
                continue;
            }

            // Path Painting Operators (`f`, `F`, `f*`, `s`, `S`, `b`, `B`, `b*`, `B*`, `n`, `N`)
            if (tok === "f" || tok === "f*") {
                emitCurrentPath(true, false, true);
                operandStack.length = 0;
                continue;
            }
            if (tok === "F") {
                emitCurrentPath(true, false, false);
                operandStack.length = 0;
                continue;
            }
            if (tok === "s") {
                emitCurrentPath(false, true, true);
                operandStack.length = 0;
                continue;
            }
            if (tok === "S") {
                emitCurrentPath(false, true, false);
                operandStack.length = 0;
                continue;
            }
            if (tok === "b" || tok === "b*") {
                emitCurrentPath(true, true, true);
                operandStack.length = 0;
                continue;
            }
            if (tok === "B" || tok === "B*") {
                emitCurrentPath(true, true, false);
                operandStack.length = 0;
                continue;
            }
            if (tok === "n" || tok === "N") {
                resetPath();
                operandStack.length = 0;
                continue;
            }

            // Text Operators (`BT`, `ET`, `Tf`, `Td`, `TD`, `Tm`, `Tp`, `Tj`, `TJ`, `Tx`)
            if (tok === "BT" || tok === "To") {
                state.textX = 0;
                state.textY = 0;
                operandStack.length = 0;
                continue;
            }
            if (tok === "ET" || tok === "TO") {
                operandStack.length = 0;
                continue;
            }
            if (tok === "Tf") {
                const sz = popNumber();
                const fontTok = operandStack.pop() || "/sans-serif";
                if (sz > 0) state.fontSize = sz;
                state.fontFamily = fontTok.replace(/^\/+_?/, "") || "sans-serif";
                operandStack.length = 0;
                continue;
            }
            if (tok === "Td" || tok === "TD") {
                if (operandStack.length >= 2) {
                    const [tx, ty] = popNumbers(2);
                    state.textX += tx;
                    state.textY += ty;
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "Tm" || tok === "Tp") {
                // `a b c d tx ty Tm` or `a b c d tx ty startX Tp`
                if (tok === "Tp" && operandStack.length >= 7) {
                    operandStack.pop(); // drop trailing startX param
                }
                if (operandStack.length >= 6) {
                    const [a, _b, _c, d, tx, ty] = popNumbers(6);
                    state.textX = tx;
                    state.textY = ty;
                    const scale = Math.max(Math.abs(a), Math.abs(d));
                    if (scale > 1 && state.fontSize <= 1) {
                        state.fontSize = Math.round(scale);
                    }
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "Tj" || tok === "Tx") {
                const strTok = operandStack.pop() || "";
                if (strTok.startsWith("(")) {
                    emitTextObject(strTok);
                }
                operandStack.length = 0;
                continue;
            }
            if (tok === "TJ") {
                const arrTok = operandStack.pop() || "";
                if (arrTok.startsWith("[")) {
                    const parts: string[] = [];
                    const litRegex = /\((?:\\.|[^\\)])*\)/g;
                    let m: RegExpExecArray | null;
                    while ((m = litRegex.exec(arrTok)) !== null) {
                        parts.push(unescapePsString(m[0].slice(1, -1)));
                    }
                    if (parts.length > 0) {
                        emitTextObject(`(${parts.join("")})`);
                    }
                }
                operandStack.length = 0;
                continue;
            }

            // Any other unrecognized PostScript/PDF operator clears the operand stack
            operandStack.length = 0;
        }
    }

    // Ensure at least one vector layer exists
    const nonEmptyLayers = layerOrder.filter(l => (l.objects?.length ?? 0) > 0);
    const finalLayers = nonEmptyLayers.length > 0
        ? nonEmptyLayers
        : layerOrder.length > 0
          ? layerOrder
          : [
                {
                    name: "Illustrator Layer 1",
                    type: "vector" as const,
                    width: canvasWidth,
                    height: canvasHeight,
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    visible: true,
                    blendMode: "normal" as const,
                    objects: []
                }
            ];

    return {
        format: "ai",
        width: canvasWidth,
        height: canvasHeight,
        layers: finalLayers
    };
}

// ============================================================================
// 5. Multi-Page PDF Vector + Raster Object + Embedded Font Importer & Exporter
// ============================================================================

