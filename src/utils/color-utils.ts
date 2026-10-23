import type { RGBA } from "../types/canvas-types.js";

export const NAMED_COLORS: Record<string, RGBA> = {
    transparent: { r: 0, g: 0, b: 0, a: 0 },
    none: { r: 0, g: 0, b: 0, a: 0 },
    black: { r: 0, g: 0, b: 0, a: 255 },
    white: { r: 255, g: 255, b: 255, a: 255 },
    red: { r: 255, g: 0, b: 0, a: 255 },
    green: { r: 0, g: 128, b: 0, a: 255 },
    lime: { r: 0, g: 255, b: 0, a: 255 },
    blue: { r: 0, g: 0, b: 255, a: 255 },
    yellow: { r: 255, g: 255, b: 0, a: 255 },
    cyan: { r: 0, g: 255, b: 255, a: 255 },
    magenta: { r: 255, g: 0, b: 255, a: 255 },
    orange: { r: 255, g: 165, b: 0, a: 255 },
    purple: { r: 128, g: 0, b: 128, a: 255 },
    gray: { r: 128, g: 128, b: 128, a: 255 },
    grey: { r: 128, g: 128, b: 128, a: 255 },
    silver: { r: 192, g: 192, b: 192, a: 255 },
    gold: { r: 255, g: 215, b: 0, a: 255 },
    navy: { r: 0, g: 0, b: 128, a: 255 },
    teal: { r: 0, g: 128, b: 128, a: 255 },
    pink: { r: 255, g: 192, b: 203, a: 255 },
    brown: { r: 165, g: 42, b: 42, a: 255 }
};

export function parseColor(colorStr?: string): RGBA {
    if (!colorStr) return { r: 0, g: 0, b: 0, a: 0 };
    const clean = colorStr.trim().toLowerCase();
    if (NAMED_COLORS[clean]) {
        return { ...NAMED_COLORS[clean] };
    }
    if (clean.startsWith("#")) {
        const hex = clean.slice(1);
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
                a: 255
            };
        }
        if (hex.length === 4) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
                a: parseInt(hex[3] + hex[3], 16)
            };
        }
        if (hex.length === 6) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
                a: 255
            };
        }
        if (hex.length === 8) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
                a: parseInt(hex.slice(6, 8), 16)
            };
        }
    }
    const rgbaMatch = clean.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
    if (rgbaMatch) {
        const aVal = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
        return {
            r: Math.min(255, Math.max(0, parseInt(rgbaMatch[1], 10))),
            g: Math.min(255, Math.max(0, parseInt(rgbaMatch[2], 10))),
            b: Math.min(255, Math.max(0, parseInt(rgbaMatch[3], 10))),
            a: Math.min(255, Math.max(0, Math.round(aVal <= 1 ? aVal * 255 : aVal)))
        };
    }
    return { r: 0, g: 0, b: 0, a: 255 };
}

export function rgbaToHex(c: RGBA): string {
    const h = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0");
    return `#${h(c.r)}${h(c.g)}${h(c.b)}${h(c.a)}`;
}

