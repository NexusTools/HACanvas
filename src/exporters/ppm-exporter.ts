export interface PpmExportOptions {
    /** GIMP PNM data formatting: "raw" (P6 binary) or "ascii" (P3 plaintext). Default "raw". */
    dataFormatting?: "raw" | "ascii";
}

export function encodeRgbaToPpm(
    width: number,
    height: number,
    rgba: Buffer,
    options: PpmExportOptions = {}
): Buffer {
    if (options.dataFormatting === "ascii") {
        const lines: string[] = [`P3`, `# CREATOR: HAEditor / HACanvas PNM Filter`, `${width} ${height}`, `255`];
        let rowTokens: string[] = [];
        for (let i = 0; i < width * height; i++) {
            const r = rgba[i * 4] || 0;
            const g = rgba[i * 4 + 1] || 0;
            const b = rgba[i * 4 + 2] || 0;
            rowTokens.push(`${r} ${g} ${b}`);
            if (rowTokens.length >= 6) {
                lines.push(rowTokens.join(" "));
                rowTokens = [];
            }
        }
        if (rowTokens.length > 0) {
            lines.push(rowTokens.join(" "));
        }
        return Buffer.from(lines.join("\n") + "\n", "ascii");
    }

    const header = Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii");
    const body = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
        body[i * 3] = rgba[i * 4];
        body[i * 3 + 1] = rgba[i * 4 + 1];
        body[i * 3 + 2] = rgba[i * 4 + 2];
    }
    return Buffer.concat([header, body]);
}

/**
 * Decodes & encodes Farbfeld (`.ff`, GIMP `plug-ins/common/file-farbfeld.c`).
 */
