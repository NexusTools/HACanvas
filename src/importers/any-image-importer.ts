import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { decodePngToRgba } from "./png-importer.js";
import { decodeBmpToRgba } from "./bmp-importer.js";
import { decodeFarbfeldToRgba } from "./farbfeld-importer.js";
import { decodePpmToRgba } from "./ppm-importer.js";
import { decodeGifToRgba } from "./gif-importer.js";
import { decodeTgaToRgba } from "./tga-importer.js";
import { decodePcxToRgba } from "./pcx-importer.js";
import { decodeIcoToRgba } from "./ico-importer.js";
import { decodeXbmToRgba } from "./xbm-importer.js";

/**
 * Decodes any raster image file (PNG, BMP, TGA, PCX, ICO, PNM/PPM/PGM/PBM/PAM, Farbfeld, XBM, GIF, JPEG, WebP, TIFF) into an RGBA buffer.
 */
export function decodeAnyImageToRgba(filePath: string, fileBuf?: Buffer): { width: number; height: number; rgba: Buffer } {
    const buf = fileBuf || fs.readFileSync(filePath);
    const ext = path.extname(filePath || "").toLowerCase();

    if (buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) {
        return decodePngToRgba(buf);
    }
    if (buf.length >= 54 && buf[0] === 0x42 && buf[1] === 0x4d) {
        return decodeBmpToRgba(buf);
    }
    if (buf.length >= 16 && buf.toString("ascii", 0, 8) === "farbfeld") {
        return decodeFarbfeldToRgba(buf);
    }
    if (buf.length >= 10 && buf[0] === 0x50 && buf[1] >= 0x31 && buf[1] <= 0x37) {
        return decodePpmToRgba(buf);
    }
    if (buf.length >= 13 && buf.toString("ascii", 0, 3) === "GIF") {
        return decodeGifToRgba(buf);
    }
    if (ext === ".tga") {
        return decodeTgaToRgba(buf);
    }
    if (ext === ".pcx" || (buf.length >= 128 && buf[0] === 0x0a && buf[2] === 1)) {
        return decodePcxToRgba(buf);
    }
    if (
        ext === ".ico" ||
        ext === ".cur" ||
        (buf.length >= 22 &&
            buf.readUInt16LE(0) === 0 &&
            (buf.readUInt16LE(2) === 1 || buf.readUInt16LE(2) === 2) &&
            buf.readUInt16LE(4) >= 1 &&
            buf.readUInt16LE(4) <= 64 &&
            buf.readUInt32LE(18) === 6 + buf.readUInt16LE(4) * 16)
    ) {
        return decodeIcoToRgba(buf);
    }
    if (ext === ".xbm" || buf.toString("ascii", 0, 7) === "#define") {
        return decodeXbmToRgba(buf.toString("utf8"));
    }

    // For JPEG, WebP, TIFF: convert via PowerShell System.Drawing or Python if available
    const tmpPng = path.join(os.tmpdir(), `aicore_img_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
    const srcPath = filePath && fs.existsSync(filePath)
        ? filePath
        : (() => {
            const tmpIn = path.join(os.tmpdir(), `aicore_in_${Date.now()}`);
            fs.writeFileSync(tmpIn, buf);
            return tmpIn;
        })();

    try {
        if (process.platform === "win32") {
            const psCmd = `Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${srcPath.replace(/'/g, "''")}'); $img.Save('${tmpPng.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); $img.Dispose()`;
            execFileSync("powershell.exe", ["-NoProfile", "-Command", psCmd], { timeout: 10000 });
            if (fs.existsSync(tmpPng)) {
                const pngData = fs.readFileSync(tmpPng);
                fs.unlinkSync(tmpPng);
                return decodePngToRgba(pngData);
            }
        }
    } catch {
        // Fallback to TGA if extensionless buffer matches TGA header
        if (buf.length >= 18 && [1, 2, 3, 9, 10, 11].includes(buf[2])) {
            return decodeTgaToRgba(buf);
        }
    } finally {
        if (fs.existsSync(tmpPng)) {
            try { fs.unlinkSync(tmpPng); } catch { /* ignore */ }
        }
    }

    throw new Error(`Unsupported or corrupted image buffer for ${filePath}`);
}

// ============================================================================
// 4. Adobe Photoshop PSD / PSB Binary Parser (`plug-ins/file-psd/psd-load.c`)
// ============================================================================

