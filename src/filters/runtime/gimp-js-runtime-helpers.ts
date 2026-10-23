import { parseColor, type SelectionMaskSpec } from "../../hybrid-art-engine.js";

// ============================================================================
// Runtime Implementation of `helpers`, `gimp`, and `gegl` for JS Filters & Transitions
// ============================================================================

function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp255(v: number): number {
    return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const span = edge1 - edge0;
    const k = span === 0 ? (x >= edge1 ? 1 : 0) : clamp01((x - edge0) / span);
    return k * k * (3 - 2 * k);
}

function hash2d(x: number, y: number, seed = 0): number {
    const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
    return h - Math.floor(h);
}

function grad2d(ix: number, iy: number, x: number, y: number, seed: number): number {
    const angle = hash2d(ix, iy, seed) * Math.PI * 2;
    const gx = Math.cos(angle);
    const gy = Math.sin(angle);
    return gx * (x - ix) + gy * (y - iy);
}

function perlin2d(x: number, y: number, seed = 0): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const sx = x - x0;
    const sy = y - y0;
    const u = sx * sx * sx * (sx * (sx * 6 - 15) + 10);
    const v = sy * sy * sy * (sy * (sy * 6 - 15) + 10);
    const n00 = grad2d(x0, y0, x, y, seed);
    const n10 = grad2d(x1, y0, x, y, seed);
    const n01 = grad2d(x0, y1, x, y, seed);
    const n11 = grad2d(x1, y1, x, y, seed);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.4142;
}

function simplex2d(x: number, y: number, seed = 0): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const contrib = (giX: number, giY: number, dx: number, dy: number) => {
        let attn = 0.5 - dx * dx - dy * dy;
        if (attn <= 0) return 0;
        attn *= attn;
        const ang = hash2d(giX, giY, seed) * Math.PI * 2;
        return attn * attn * (Math.cos(ang) * dx + Math.sin(ang) * dy);
    };
    const n0 = contrib(i, j, x0, y0);
    const n1 = contrib(i + i1, j + j1, x1, y1);
    const n2 = contrib(i + 1, j + 1, x2, y2);
    return clamp(70 * (n0 + n1 + n2), -1, 1);
}

function fbm2d(x: number, y: number, octaves = 4, persistence = 0.5, lacunarity = 2.0, seed = 0): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxVal = 0;
    const oct = clamp(Math.round(octaves), 1, 8);
    for (let i = 0; i < oct; i++) {
        total += (perlin2d(x * frequency, y * frequency, seed + i * 17) * 0.5 + 0.5) * amplitude;
        maxVal += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return maxVal > 0 ? clamp01(total / maxVal) : 0;
}

function voronoi2d(x: number, y: number, jitter = 0.85, seed = 0): { f1: number; f2: number; cellX: number; cellY: number; id: number } {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let f1 = 1e9;
    let f2 = 1e9;
    let bestX = ix;
    let bestY = iy;
    let bestId = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const cx = ix + dx;
            const cy = iy + dy;
            const rx = cx + 0.5 + (hash2d(cx, cy, seed) - 0.5) * jitter;
            const ry = cy + 0.5 + (hash2d(cx + 37, cy + 91, seed) - 0.5) * jitter;
            const d = Math.hypot(x - rx, y - ry);
            if (d < f1) {
                f2 = f1;
                f1 = d;
                bestX = rx;
                bestY = ry;
                bestId = hash2d(cx * 13, cy * 29, seed);
            } else if (d < f2) {
                f2 = d;
            }
        }
    }
    return { f1, f2, cellX: bestX, cellY: bestY, id: bestId };
}

function getPixel(buf: Uint8Array, width: number, height: number, x: number, y: number): [number, number, number, number] {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : Math.floor(x);
    const cy = y < 0 ? 0 : y >= height ? height - 1 : Math.floor(y);
    const idx = (cy * width + cx) * 4;
    return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]];
}

function getPixelWrap(buf: Uint8Array, width: number, height: number, x: number, y: number): [number, number, number, number] {
    const cx = ((Math.floor(x) % width) + width) % width;
    const cy = ((Math.floor(y) % height) + height) % height;
    const idx = (cy * width + cx) * 4;
    return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]];
}

function setPixel(buf: Uint8Array, width: number, height: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return;
    const idx = (iy * width + ix) * 4;
    buf[idx] = clamp255(r);
    buf[idx + 1] = clamp255(g);
    buf[idx + 2] = clamp255(b);
    buf[idx + 3] = clamp255(a);
}

function sampleBilinear(
    buf: Uint8Array,
    width: number,
    height: number,
    u: number,
    v: number,
    wrap = false
): [number, number, number, number] {
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const getter = wrap ? getPixelWrap : getPixel;
    const p00 = getter(buf, width, height, x0, y0);
    const p10 = getter(buf, width, height, x0 + 1, y0);
    const p01 = getter(buf, width, height, x0, y0 + 1);
    const p11 = getter(buf, width, height, x0 + 1, y0 + 1);
    const invFx = 1 - fx;
    const invFy = 1 - fy;
    const w00 = invFx * invFy;
    const w10 = fx * invFy;
    const w01 = invFx * fy;
    const w11 = fx * fy;
    return [
        clamp255(p00[0] * w00 + p10[0] * w10 + p01[0] * w01 + p11[0] * w11),
        clamp255(p00[1] * w00 + p10[1] * w10 + p01[1] * w01 + p11[1] * w11),
        clamp255(p00[2] * w00 + p10[2] * w10 + p01[2] * w01 + p11[2] * w11),
        clamp255(p00[3] * w00 + p10[3] * w10 + p01[3] * w01 + p11[3] * w11)
    ];
}

function luminance(r: number, g: number, b: number): number {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const rf = r / 255;
    const gf = g / 255;
    const bf = b / 255;
    const max = Math.max(rf, gf, bf);
    const min = Math.min(rf, gf, bf);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d !== 0) {
        if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60;
        else if (max === gf) h = ((bf - rf) / d + 2) * 60;
        else h = ((rf - gf) / d + 4) * 60;
    }
    return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const hn = (((h % 360) + 360) % 360) / 60;
    const i = Math.floor(hn);
    const f = hn - i;
    const p = v * (1 - clamp01(s));
    const q = v * (1 - clamp01(s) * f);
    const t = v * (1 - clamp01(s) * (1 - f));
    let r = 0, g = 0, b = 0;
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        default: r = v; g = p; b = q; break;
    }
    return [clamp255(r * 255), clamp255(g * 255), clamp255(b * 255)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const rf = r / 255;
    const gf = g / 255;
    const bf = b / 255;
    const max = Math.max(rf, gf, bf);
    const min = Math.min(rf, gf, bf);
    let h = 0;
    let s = 0;
    const l = (max + min) * 0.5;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60;
        else if (max === gf) h = ((bf - rf) / d + 2) * 60;
        else h = ((rf - gf) / d + 4) * 60;
    }
    return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const hn = (((h % 360) + 360) % 360) / 360;
    const sn = clamp01(s);
    const ln = clamp01(l);
    if (sn === 0) {
        const v = clamp255(ln * 255);
        return [v, v, v];
    }
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    return [
        clamp255(hue2rgb(p, q, hn + 1 / 3) * 255),
        clamp255(hue2rgb(p, q, hn) * 255),
        clamp255(hue2rgb(p, q, hn - 1 / 3) * 255)
    ];
}

function isSelected(sel: SelectionMaskSpec | undefined, x: number, y: number): boolean {
    if (!sel || sel.mode === "none") return true;
    let inside = false;
    if (sel.mode === "rect") {
        inside = x >= sel.x && x < sel.x + sel.width && y >= sel.y && y < sel.y + sel.height;
    } else if (sel.mode === "ellipse") {
        const rx = sel.width / 2;
        const ry = sel.height / 2;
        const cx = sel.x + rx;
        const cy = sel.y + ry;
        if (rx > 0 && ry > 0) {
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            inside = dx * dx + dy * dy <= 1;
        }
    }
    return sel.inverted ? !inside : inside;
}

function boxBlurBuffer(srcBuf: Uint8Array, width: number, height: number, radiusX: number, radiusY = radiusX): Uint8Array {
    const rx = Math.max(0, Math.min(64, Math.round(radiusX)));
    const ry = Math.max(0, Math.min(64, Math.round(radiusY)));
    if (rx === 0 && ry === 0) return new Uint8Array(srcBuf);
    const tmp = new Uint8Array(width * height * 4);
    const dst = new Uint8Array(width * height * 4);

    // Horizontal pass
    const diamX = rx * 2 + 1;
    for (let y = 0; y < height; y++) {
        const rowOff = y * width * 4;
        for (let x = 0; x < width; x++) {
            let sr = 0, sg = 0, sb = 0, sa = 0;
            for (let dx = -rx; dx <= rx; dx++) {
                const nx = x + dx < 0 ? 0 : x + dx >= width ? width - 1 : x + dx;
                const i = rowOff + nx * 4;
                sr += srcBuf[i];
                sg += srcBuf[i + 1];
                sb += srcBuf[i + 2];
                sa += srcBuf[i + 3];
            }
            const o = rowOff + x * 4;
            tmp[o] = clamp255(sr / diamX);
            tmp[o + 1] = clamp255(sg / diamX);
            tmp[o + 2] = clamp255(sb / diamX);
            tmp[o + 3] = clamp255(sa / diamX);
        }
    }

    // Vertical pass
    const diamY = ry * 2 + 1;
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let sr = 0, sg = 0, sb = 0, sa = 0;
            for (let dy = -ry; dy <= ry; dy++) {
                const ny = y + dy < 0 ? 0 : y + dy >= height ? height - 1 : y + dy;
                const i = (ny * width + x) * 4;
                sr += tmp[i];
                sg += tmp[i + 1];
                sb += tmp[i + 2];
                sa += tmp[i + 3];
            }
            const o = (y * width + x) * 4;
            dst[o] = clamp255(sr / diamY);
            dst[o + 1] = clamp255(sg / diamY);
            dst[o + 2] = clamp255(sb / diamY);
            dst[o + 3] = clamp255(sa / diamY);
        }
    }
    return dst;
}

function gaussianBlurBuffer(srcBuf: Uint8Array, width: number, height: number, radiusX: number, radiusY = radiusX): Uint8Array {
    const rX = Math.max(1, Math.min(40, Math.round(radiusX)));
    const rY = Math.max(1, Math.min(40, Math.round(radiusY)));
    const pass1 = boxBlurBuffer(srcBuf, width, height, Math.max(1, Math.round(rX * 0.6)), Math.max(1, Math.round(rY * 0.6)));
    return boxBlurBuffer(pass1, width, height, Math.max(1, Math.round(rX * 0.6)), Math.max(1, Math.round(rY * 0.6)));
}

function convolve3x3(
    srcBuf: Uint8Array,
    outBuf: Uint8Array,
    width: number,
    height: number,
    kernel9: number[],
    divisor?: number,
    bias = 0,
    selection?: SelectionMaskSpec
): void {
    const autoDiv = kernel9.reduce((a, b) => a + b, 0) || 1;
    const div = divisor !== undefined && divisor !== 0 ? divisor : autoDiv;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!isSelected(selection, x, y)) continue;
            let r = 0, g = 0, b = 0, k = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy < 0 ? 0 : y + dy >= height ? height - 1 : y + dy;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx < 0 ? 0 : x + dx >= width ? width - 1 : x + dx;
                    const idx = (ny * width + nx) * 4;
                    const w = kernel9[k++] || 0;
                    r += srcBuf[idx] * w;
                    g += srcBuf[idx + 1] * w;
                    b += srcBuf[idx + 2] * w;
                }
            }
            const o = (y * width + x) * 4;
            outBuf[o] = clamp255(r / div + bias);
            outBuf[o + 1] = clamp255(g / div + bias);
            outBuf[o + 2] = clamp255(b / div + bias);
            outBuf[o + 3] = srcBuf[o + 3];
        }
    }
}

function sobelAt(
    srcBuf: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number
): { gx: number; gy: number; mag: number; angle: number } {
    const l = (px: number, py: number) => {
        const [r, g, b] = getPixel(srcBuf, width, height, px, py);
        return luminance(r, g, b);
    };
    const tl = l(x - 1, y - 1), tc = l(x, y - 1), tr = l(x + 1, y - 1);
    const ml = l(x - 1, y),                       mr = l(x + 1, y);
    const bl = l(x - 1, y + 1), bc = l(x, y + 1), br = l(x + 1, y + 1);
    const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
    const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
    const mag = Math.hypot(gx, gy);
    const angle = Math.atan2(gy, gx);
    return { gx, gy, mag, angle };
}

function medianWindow(
    srcBuf: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number,
    radius: number,
    percentile = 50
): [number, number, number, number] {
    const r = clamp(Math.round(radius), 1, 6);
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy < 0 ? 0 : y + dy >= height ? height - 1 : y + dy;
        for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx < 0 ? 0 : x + dx >= width ? width - 1 : x + dx;
            const i = (ny * width + nx) * 4;
            rs.push(srcBuf[i]);
            gs.push(srcBuf[i + 1]);
            bs.push(srcBuf[i + 2]);
        }
    }
    rs.sort((a, b) => a - b);
    gs.sort((a, b) => a - b);
    bs.sort((a, b) => a - b);
    const pIdx = clamp(Math.floor(((rs.length - 1) * clamp(percentile, 0, 100)) / 100), 0, rs.length - 1);
    const centerA = srcBuf[(y * width + x) * 4 + 3];
    return [rs[pIdx], gs[pIdx], bs[pIdx], centerA];
}


export const GIMP_JS_RUNTIME_HELPERS = {
    clamp,
    clamp01,
    clamp255,
    lerp,
    smoothstep,
    hash2d,
    perlin2d,
    simplex2d,
    fbm2d,
    voronoi2d,
    getPixel,
    getPixelWrap,
    setPixel,
    sampleBilinear,
    luminance,
    rgbToHsv,
    hsvToRgb,
    rgbToHsl,
    hslToRgb,
    parseColor,
    isSelected,
    boxBlurBuffer,
    gaussianBlurBuffer,
    convolve3x3,
    sobelAt,
    medianWindow
};

export const GIMP_NAMESPACE_HELPERS = {
    bilinear: sampleBilinear,
    rgbToHsv,
    hsvToRgb,
    rgbToHsl,
    hslToRgb,
    luminance,
    parseColor,
    getPixel,
    getPixelWrap,
    setPixel,
    clamp,
    clamp01,
    clamp255
};

export const GEGL_NAMESPACE_HELPERS = {
    gaussianBlur: gaussianBlurBuffer,
    boxBlur: boxBlurBuffer,
    convolve3x3,
    perlin2d,
    simplex2d,
    fbm2d,
    voronoi2d,
    sobelAt,
    medianWindow,
    sampleBilinear
};

// ============================================================================
// Built-In GIMP Filter Presets Replicated from GIMP's C Source & GEGL Ops
// ============================================================================

