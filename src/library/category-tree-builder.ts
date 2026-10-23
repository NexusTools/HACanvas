import { parseSharedObjectCategory } from "../hybrid-art-engine.js";

export interface CategoryTreeNode<T = any> {
    name: string;
    fullPath: string;
    folders: Record<string, CategoryTreeNode<T>>;
    items: T[];
}

/**
 * Builds a hierarchical collapsible folder tree from items that have `name` (supporting slash paths like `"UI/Icons/Star"`)
 * and/or an explicit `category` property.
 */
export function buildCategoryTree<T extends { name: string; category?: string }>(items: T[]): CategoryTreeNode<T> {
    const root: CategoryTreeNode<T> = {
        name: "Root",
        fullPath: "",
        folders: {},
        items: []
    };

    for (const item of items) {
        const parsed = parseSharedObjectCategory(item.name, item.category);
        let cursor = root;
        let currentPath = "";
        const segs = parsed.segments.length > 0 ? parsed.segments : ["Uncategorized"];

        for (const seg of segs) {
            currentPath = currentPath ? `${currentPath}/${seg}` : seg;
            if (!cursor.folders[seg]) {
                cursor.folders[seg] = {
                    name: seg,
                    fullPath: currentPath,
                    folders: {},
                    items: []
                };
            }
            cursor = cursor.folders[seg];
        }
        cursor.items.push(item);
    }

    return root;
}

