export interface ParsedSharedObjectCategory {
    category: string;
    displayName: string;
    fullPath: string;
    segments: string[];
}

/**
 * Parses slash-delimited category paths from a shared object's name (e.g. "UI/Icons/Star")
 * and/or an explicit `category` field, returning normalized category folders and display name.
 */
export function parseSharedObjectCategory(rawName: string, explicitCategory?: string): ParsedSharedObjectCategory {
    const cleanName = (rawName || "Untitled").trim().replace(/\\/g, "/");
    const cleanExplicit = (explicitCategory || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

    if (cleanName.includes("/")) {
        const parts = cleanName.split("/").map(p => p.trim()).filter(Boolean);
        const displayName = parts[parts.length - 1] || "Untitled";
        const pathCategory = parts.slice(0, -1).join("/");
        const finalCategory =
            !cleanExplicit || pathCategory === cleanExplicit || pathCategory.startsWith(`${cleanExplicit}/`)
                ? pathCategory
                : cleanExplicit;
        const segments = finalCategory ? finalCategory.split("/").filter(Boolean) : [];
        return {
            category: finalCategory || "Uncategorized",
            displayName,
            fullPath: finalCategory ? `${finalCategory}/${displayName}` : displayName,
            segments
        };
    }

    const finalCategory = cleanExplicit || "Uncategorized";
    const segments = cleanExplicit ? cleanExplicit.split("/").filter(Boolean) : [];
    return {
        category: finalCategory,
        displayName: cleanName,
        fullPath: cleanExplicit ? `${cleanExplicit}/${cleanName}` : cleanName,
        segments
    };
}

