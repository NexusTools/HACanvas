export function decodePpmToRgba(ppmBuf: Buffer): { width: number; height: number; rgba: Buffer } {
    const magic = ppmBuf.toString("ascii", 0, 2);
    if (magic === "P7") {
        // PAM header
        const hdrEnd = ppmBuf.indexOf("ENDHDR\n");
        const hdrStr = ppmBuf.toString("ascii", 0, hdrEnd);
        const wMatch = hdrStr.match(/WIDTH\s+(\d+)/);
        const hMatch = hdrStr.match(/HEIGHT\s+(\d+)/);
        const dMatch = hdrStr.match(/DEPTH\s+(\d+)/);
        const width = wMatch ? parseInt(wMatch[1], 10) : 1;
        const height = hMatch ? parseInt(hMatch[1], 10) : 1;
        const depth = dMatch ? parseInt(dMatch[1], 10) : 4;
        const dataOffset = hdrEnd + 7;
        const rgba = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            const s = dataOffset + i * depth;
            const d = i * 4;
            rgba[d] = ppmBuf[s] || 0;
            rgba[d + 1] = depth >= 3 ? ppmBuf[s + 1] : ppmBuf[s];
            rgba[d + 2] = depth >= 3 ? ppmBuf[s + 2] : ppmBuf[s];
            rgba[d + 3] = depth === 2 ? ppmBuf[s + 1] : depth >= 4 ? ppmBuf[s + 3] : 255;
        }
        return { width, height, rgba };
    }

    let idx = 2;
    const nextToken = (): string => {
        while (idx < ppmBuf.length) {
            const c = ppmBuf[idx];
            if (c === 35) {
                while (idx < ppmBuf.length && ppmBuf[idx] !== 10) idx++;
            } else if (c <= 32) {
                idx++;
            } else {
                break;
            }
        }
        let tok = "";
        while (idx < ppmBuf.length && ppmBuf[idx] > 32 && ppmBuf[idx] !== 35) {
            tok += String.fromCharCode(ppmBuf[idx++]);
        }
        return tok;
    };

    const width = parseInt(nextToken(), 10);
    const height = parseInt(nextToken(), 10);
    const maxVal = magic === "P1" || magic === "P4" ? 1 : parseInt(nextToken(), 10) || 255;
    idx++; // single whitespace after header

    const rgba = Buffer.alloc(width * height * 4);
    if (magic === "P6") {
        for (let i = 0; i < width * height; i++) {
            const dIdx = i * 4;
            rgba[dIdx] = Math.round(((ppmBuf[idx++] || 0) * 255) / maxVal);
            rgba[dIdx + 1] = Math.round(((ppmBuf[idx++] || 0) * 255) / maxVal);
            rgba[dIdx + 2] = Math.round(((ppmBuf[idx++] || 0) * 255) / maxVal);
            rgba[dIdx + 3] = 255;
        }
    } else if (magic === "P5") {
        for (let i = 0; i < width * height; i++) {
            const g = Math.round(((ppmBuf[idx++] || 0) * 255) / maxVal);
            const dIdx = i * 4;
            rgba[dIdx] = g;
            rgba[dIdx + 1] = g;
            rgba[dIdx + 2] = g;
            rgba[dIdx + 3] = 255;
        }
    } else if (magic === "P2") {
        for (let i = 0; i < width * height; i++) {
            const g = Math.round((parseInt(nextToken(), 10) * 255) / maxVal);
            const dIdx = i * 4;
            rgba[dIdx] = g;
            rgba[dIdx + 1] = g;
            rgba[dIdx + 2] = g;
            rgba[dIdx + 3] = 255;
        }
    } else {
        for (let i = 0; i < width * height; i++) {
            const dIdx = i * 4;
            rgba[dIdx] = Math.round((parseInt(nextToken(), 10) * 255) / maxVal);
            rgba[dIdx + 1] = Math.round((parseInt(nextToken(), 10) * 255) / maxVal);
            rgba[dIdx + 2] = Math.round((parseInt(nextToken(), 10) * 255) / maxVal);
            rgba[dIdx + 3] = 255;
        }
    }
    return { width, height, rgba };
}

