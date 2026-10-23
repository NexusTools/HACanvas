import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AbstractJsonStore } from "./storage/abstract-json-store.js";
import {
    HybridArtEngine,
    parseSharedObjectCategory,
    type SharedObjectCanvasSpec,
    type VectorObjectSpec
} from "./hybrid-art-engine.js";

/**
 * Returns the OS-specific user configuration directory for HAEditor (`haeditor`):
 * - Windows: `%APPDATA%\haeditor`
 * - macOS: `~/Library/Application Support/haeditor`
 * - Linux/Unix: `$XDG_CONFIG_HOME/haeditor` or `~/.config/haeditor`
 */
export function getDefaultHaEditorOSConfigDir(): string {
    if (process.platform === "win32") {
        return path.join(
            process.env.APPDATA || path.join(process.env.USERPROFILE || os.homedir(), "AppData", "Roaming"),
            "haeditor"
        );
    } else if (process.platform === "darwin") {
        return path.join(process.env.HOME || os.homedir(), "Library", "Application Support", "haeditor");
    } else {
        return path.join(
            process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || os.homedir(), ".config"),
            "haeditor"
        );
    }
}

import type { ProviderType } from "@nexustools/aitooling";

export type AiReasoningLevel = "low" | "medium" | "max";

export type HaAiProviderId = ProviderType;

export interface HaEditorConfig {
    theme: "dark-gimp" | "light";
    defaultCanvasWidth: number;
    defaultCanvasHeight: number;
    defaultBackgroundColor: string;
    showGrid: boolean;
    gridSize: number;
    snapToGrid: boolean;
    inPlaceDimOpacity: number;
    activeProvider?: HaAiProviderId;
    lmStudioUrl: string;
    aiModel: string;
    openaiApiKey?: string;
    openaiModel?: string;
    claudeApiKey?: string;
    claudeModel?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    geminiOAuthTokens?: any;
    grokApiKey?: string;
    grokModel?: string;
    customOpenAiBaseUrl?: string;
    customOpenAiApiKey?: string;
    customOpenAiModel?: string;
    customClaudeBaseUrl?: string;
    customClaudeApiKey?: string;
    customClaudeModel?: string;
    defaultReasoningLevel: AiReasoningLevel;
    recentFiles: string[];
    customLibraryDirs: string[];
    collapsedCategories: string[];
}

const DEFAULT_HAEDITOR_CONFIG: HaEditorConfig = {
    theme: "dark-gimp",
    defaultCanvasWidth: 640,
    defaultCanvasHeight: 480,
    defaultBackgroundColor: "#ffffff",
    showGrid: false,
    gridSize: 32,
    snapToGrid: false,
    inPlaceDimOpacity: 0.72,
    activeProvider: "lmstudio",
    lmStudioUrl: "http://localhost:1234",
    aiModel: "local-model",
    openaiApiKey: "",
    openaiModel: "gpt-4o",
    claudeApiKey: "",
    claudeModel: "claude-3-7-sonnet-latest",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-pro",
    grokApiKey: "",
    grokModel: "grok-2-latest",
    customOpenAiBaseUrl: "http://localhost:1234/v1",
    customOpenAiApiKey: "",
    customOpenAiModel: "local-model",
    customClaudeBaseUrl: "http://localhost:1234",
    customClaudeApiKey: "",
    customClaudeModel: "local-model",
    defaultReasoningLevel: "medium",
    recentFiles: [],
    customLibraryDirs: [],
    collapsedCategories: []
};

/**
 * Manages HAEditor user configuration stored in `<osConfigDir>/config.json`.
 * Inherits persistent JSON serialization & directory lifecycle from `AbstractJsonStore<HaEditorConfig>`.
 */
export class HaEditorConfigManager extends AbstractJsonStore<HaEditorConfig> {
    public readonly configDir: string;
    public readonly configPath: string;
    public readonly defaultLibraryDir: string;

    constructor(configDir?: string) {
        const resolvedDir = configDir || getDefaultHaEditorOSConfigDir();
        super(path.join(resolvedDir, "config.json"), DEFAULT_HAEDITOR_CONFIG);
        this.configDir = resolvedDir;
        this.configPath = this.filePath;
        this.defaultLibraryDir = path.join(this.configDir, "library");
        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
        if (!fs.existsSync(this.defaultLibraryDir)) {
            fs.mkdirSync(this.defaultLibraryDir, { recursive: true });
        }
    }

    public loadConfigSync(): HaEditorConfig {
        this.state = this.loadFromDisk(DEFAULT_HAEDITOR_CONFIG);
        return this.getConfig();
    }

    public saveConfigSync(): void {
        this.ensureDirectories();
        this.saveToDisk();
    }

    public getConfig(): HaEditorConfig {
        return {
            ...this.state,
            recentFiles: [...this.state.recentFiles],
            customLibraryDirs: [...this.state.customLibraryDirs],
            collapsedCategories: [...this.state.collapsedCategories]
        };
    }

    public getConfigDir(): string {
        return this.configDir;
    }

    public getStoreFilePath(): string {
        return this.configPath;
    }

    public updateConfig(partial: Partial<HaEditorConfig> & { customLibraryDir?: string }): HaEditorConfig {
        if (partial.customLibraryDir) {
            this.addCustomLibraryDir(partial.customLibraryDir);
        }
        const { customLibraryDir: _ignored, ...rest } = partial;
        this.state = {
            ...this.state,
            ...rest
        };
        this.saveConfigSync();
        return this.getConfig();
    }

    public addRecentFile(filePath: string): void {
        const normalized = path.resolve(filePath);
        this.state.recentFiles = [
            normalized,
            ...this.state.recentFiles.filter(f => f !== normalized)
        ].slice(0, 15);
        this.saveConfigSync();
    }

    public addCustomLibraryDir(dirPath: string): HaEditorConfig {
        const resolved = path.resolve(dirPath);
        if (!fs.existsSync(resolved)) {
            fs.mkdirSync(resolved, { recursive: true });
        }
        if (!this.state.customLibraryDirs.includes(resolved)) {
            this.state.customLibraryDirs.push(resolved);
            this.saveConfigSync();
        }
        return this.getConfig();
    }

    public removeCustomLibraryDir(dirPath: string): HaEditorConfig {
        const resolved = path.resolve(dirPath);
        this.state.customLibraryDirs = this.state.customLibraryDirs.filter(d => d !== resolved);
        this.saveConfigSync();
        return this.getConfig();
    }

    public getAllLibraryDirs(): string[] {
        this.ensureDirectories();
        return [this.defaultLibraryDir, ...this.state.customLibraryDirs.filter(d => fs.existsSync(d))];
    }
}

export interface LibraryObjectEntry {
    id: string;
    entryId: string;
    objectId: string;
    name: string;
    displayName: string;
    category: string;
    width: number;
    height: number;
    filePath: string;
    packagePath: string;
    libraryDir: string;
    thumbnailBase64: string;
    createdAt: string;
    updatedAt: string;
    dependentObjectCount: number;
}

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

/**
 * SharedObjectLibrary stores reusable Shared Objects (`.haobj` / `.hacanvas` ZIP+XML packages)
 * in the OS configuration directory (`<osConfigDir>/library/`) and any configured custom library folders
 * so they can be categorized, browsed, and imported into any future project.
 */
export class SharedObjectLibrary {
    public readonly configManager: HaEditorConfigManager;

    constructor(configManager?: HaEditorConfigManager) {
        this.configManager = configManager || new HaEditorConfigManager();
    }

    private getIndexFilePath(libDir: string): string {
        return path.join(libDir, "library-index.json");
    }

    private readDirIndex(libDir: string): LibraryObjectEntry[] {
        const idxPath = this.getIndexFilePath(libDir);
        try {
            if (fs.existsSync(idxPath)) {
                const raw = JSON.parse(fs.readFileSync(idxPath, "utf8"));
                if (Array.isArray(raw)) {
                    return raw.filter(e => e && e.packagePath && fs.existsSync(e.packagePath));
                }
            }
        } catch {
            // Ignore malformed index
        }
        return [];
    }

    private writeDirIndex(libDir: string, entries: LibraryObjectEntry[]): void {
        if (!fs.existsSync(libDir)) {
            fs.mkdirSync(libDir, { recursive: true });
        }
        fs.writeFileSync(this.getIndexFilePath(libDir), JSON.stringify(entries, null, 2), "utf8");
    }

    /**
     * Collects all transitive `<ObjectRef>` dependencies of a shared object so nested sub-canvases
     * are bundled together when saved to the library.
     */
    private collectTransitiveSharedObjects(
        allShared: Record<string, SharedObjectCanvasSpec>,
        rootId: string,
        collected: Set<string> = new Set()
    ): Set<string> {
        if (collected.has(rootId)) return collected;
        const spec = allShared[rootId];
        if (!spec) return collected;
        collected.add(rootId);
        for (const layer of spec.layers) {
            for (const obj of layer.objects) {
                if (obj.kind === "ref" && obj.refId && allShared[obj.refId]) {
                    this.collectTransitiveSharedObjects(allShared, obj.refId, collected);
                }
            }
        }
        return collected;
    }

    /**
     * Saves a Shared Object from an active `HybridArtEngine` canvas into the persistent Shared Object Library
     * as a self-contained `.hacanvas` ZIP+XML package (including all vector layers, raster pixel buffers,
     * and any nested shared object dependencies).
     */
    public saveSharedObjectToLibrary(
        engine: HybridArtEngine,
        canvasId: string,
        objectId: string,
        options: {
            name?: string;
            category?: string;
            targetLibraryDir?: string;
            entryId?: string;
        } = {}
    ): LibraryObjectEntry {
        const srcState = engine.loadCanvas(canvasId);
        const rootShared = srcState.sharedObjects[objectId];
        if (!rootShared) {
            throw new Error(`Shared object '${objectId}' not found on canvas '${canvasId}'.`);
        }

        const libDir = options.targetLibraryDir || this.configManager.defaultLibraryDir;
        if (!fs.existsSync(libDir)) {
            fs.mkdirSync(libDir, { recursive: true });
        }

        const parsedCat = parseSharedObjectCategory(
            options.name || rootShared.name,
            options.category ?? rootShared.category
        );
        const entryId = options.entryId || `lib_${objectId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}`;
        const packagePath = path.join(libDir, `${entryId}.hacanvas`);

        // Create a temporary isolated canvas inside a temp engine to package only this shared object + its dependencies
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-lib-export-"));
        try {
            const tmpEngine = new HybridArtEngine(tmpRoot);
            const tmpCanvasId = "lib_pkg";
            const pkgState = tmpEngine.createCanvas(tmpCanvasId, rootShared.width, rootShared.height, "transparent");
            pkgState.layers = [];
            pkgState.sharedObjects = {};

            const neededIds = this.collectTransitiveSharedObjects(srcState.sharedObjects, objectId);
            for (const depId of neededIds) {
                const depSpec = JSON.parse(JSON.stringify(srcState.sharedObjects[depId])) as SharedObjectCanvasSpec;
                if (depId === objectId) {
                    depSpec.name = parsedCat.fullPath;
                    depSpec.category = parsedCat.category;
                }
                pkgState.sharedObjects[depId] = depSpec;

                for (const l of depSpec.layers) {
                    if (l.type === "raster") {
                        const rawBuf = (engine as any).loadRasterBuffer(srcState, l.id, depSpec.width, depSpec.height, undefined, depId);
                        (tmpEngine as any).saveRasterBuffer(pkgState, l.id, Buffer.from(rawBuf), undefined, depId);
                    }
                }
            }

            // Place a single root <ObjectRef> on the package canvas so the package itself also renders as a preview canvas
            pkgState.layers.push({
                id: "preview_layer",
                name: "Preview Layer",
                type: "vector",
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: "normal",
                objects: [
                    {
                        id: "preview_ref",
                        kind: "ref",
                        refId: objectId,
                        x: 0,
                        y: 0,
                        width: rootShared.width,
                        height: rootShared.height,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        opacity: 1
                    }
                ]
            });

            tmpEngine.saveCanvas(pkgState);
            tmpEngine.saveCanvasPackage(tmpCanvasId, packagePath);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }

        const thumbnailBase64 = engine.renderSharedObjectThumbnailBase64(canvasId, objectId, 0);
        const nowIso = new Date().toISOString();
        const existingEntries = this.readDirIndex(libDir);
        const existingIdx = existingEntries.findIndex(e => e.entryId === entryId);

        const entry: LibraryObjectEntry = {
            id: entryId,
            entryId,
            objectId,
            name: parsedCat.fullPath,
            displayName: parsedCat.displayName,
            category: parsedCat.category,
            width: rootShared.width,
            height: rootShared.height,
            filePath: packagePath,
            packagePath,
            libraryDir: libDir,
            thumbnailBase64,
            createdAt: existingIdx !== -1 ? existingEntries[existingIdx].createdAt : nowIso,
            updatedAt: nowIso,
            dependentObjectCount: this.collectTransitiveSharedObjects(srcState.sharedObjects, objectId).size - 1
        };

        if (existingIdx !== -1) {
            existingEntries[existingIdx] = entry;
        } else {
            existingEntries.push(entry);
        }
        this.writeDirIndex(libDir, existingEntries);
        return entry;
    }

    public getLibraryDir(): string {
        return this.configManager.defaultLibraryDir;
    }

    public listEntries(): LibraryObjectEntry[] {
        return this.listLibraryObjects();
    }

    /**
     * Lists all reusable Shared Objects across the OS config library directory and any custom library directories.
     */
    public listLibraryObjects(): LibraryObjectEntry[] {
        const allDirs = this.configManager.getAllLibraryDirs();
        const results: LibraryObjectEntry[] = [];
        for (const dir of allDirs) {
            for (const item of this.readDirIndex(dir)) {
                results.push({
                    ...item,
                    id: item.id || item.entryId,
                    filePath: item.filePath || item.packagePath
                });
            }
        }
        return results;
    }

    public importIntoProject(
        entryId: string,
        engine: HybridArtEngine,
        canvasId: string,
        options: {
            newObjectId?: string;
            instantiateOnMainCanvas?: boolean;
            layerId?: string;
            x?: number;
            y?: number;
        } = {}
    ): { sharedObject: SharedObjectCanvasSpec; refObject?: VectorObjectSpec } {
        const res = this.importLibraryObjectIntoCanvas(engine, canvasId, entryId, {
            newObjectId: options.newObjectId,
            instantiateOnCanvas: options.instantiateOnMainCanvas,
            layerId: options.layerId,
            x: options.x,
            y: options.y
        });
        return { sharedObject: res.sharedObject, refObject: res.instance };
    }

    public renameLibraryEntry(entryId: string, newName: string, newCategory?: string): LibraryObjectEntry {
        return this.renameLibraryObject(entryId, newName, newCategory);
    }

    public deleteLibraryEntry(entryId: string): void {
        this.deleteLibraryObject(entryId);
    }

    /**
     * Imports a saved Shared Object from the global library into a target project canvas
     * (including all its vector layers, raster layers, and any nested `<ObjectRef>` dependencies),
     * and optionally instantiates an `<ObjectRef>` on the canvas.
     */
    public importLibraryObjectIntoCanvas(
        engine: HybridArtEngine,
        canvasId: string,
        entryId: string,
        options: {
            newObjectId?: string;
            instantiateOnCanvas?: boolean;
            layerId?: string;
            x?: number;
            y?: number;
        } = {}
    ): { sharedObject: SharedObjectCanvasSpec; instance?: VectorObjectSpec } {
        const allEntries = this.listLibraryObjects();
        const entry = allEntries.find(e => e.entryId === entryId);
        if (!entry || !fs.existsSync(entry.packagePath)) {
            throw new Error(`Library object '${entryId}' not found.`);
        }

        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-lib-import-"));
        try {
            const tmpEngine = new HybridArtEngine(tmpRoot);
            const tmpCanvasId = "lib_loaded";
            tmpEngine.loadFromFile(tmpCanvasId, entry.packagePath, { mode: "new_canvas" });
            const pkgState = tmpEngine.loadCanvas(tmpCanvasId);

            const dstState = engine.loadCanvas(canvasId);
            const targetRootId = options.newObjectId || entry.objectId;

            for (const [depId, depSpec] of Object.entries(pkgState.sharedObjects)) {
                const mappedId = depId === entry.objectId ? targetRootId : depId;
                const clonedSpec: SharedObjectCanvasSpec = JSON.parse(JSON.stringify(depSpec));
                clonedSpec.id = mappedId;
                if (depId === entry.objectId) {
                    const parsed = parseSharedObjectCategory(entry.name, entry.category);
                    clonedSpec.name = parsed.fullPath;
                    clonedSpec.category = parsed.category;
                }

                for (const l of clonedSpec.layers) {
                    if (l.type === "raster") {
                        const rawBuf = (tmpEngine as any).loadRasterBuffer(pkgState, l.id, depSpec.width, depSpec.height, undefined, depId);
                        (engine as any).saveRasterBuffer(dstState, l.id, Buffer.from(rawBuf), undefined, mappedId);
                    }
                }
                dstState.sharedObjects[mappedId] = clonedSpec;
            }

            engine.saveCanvas(dstState);
            const importedShared = dstState.sharedObjects[targetRootId];
            let instance: VectorObjectSpec | undefined;

            if (options.instantiateOnCanvas) {
                instance = engine.instantiateObjectRef(canvasId, targetRootId, {
                    layerId: options.layerId,
                    x: options.x ?? 32,
                    y: options.y ?? 32
                });
            }

            return { sharedObject: importedShared, instance };
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    }

    /**
     * Renames or recategorizes a saved Library Shared Object.
     */
    public renameLibraryObject(entryId: string, newName: string, newCategory?: string): LibraryObjectEntry {
        for (const dir of this.configManager.getAllLibraryDirs()) {
            const entries = this.readDirIndex(dir);
            const idx = entries.findIndex(e => e.entryId === entryId);
            if (idx !== -1) {
                const parsed = parseSharedObjectCategory(newName, newCategory);
                entries[idx].name = parsed.fullPath;
                entries[idx].displayName = parsed.displayName;
                entries[idx].category = parsed.category;
                entries[idx].updatedAt = new Date().toISOString();
                this.writeDirIndex(dir, entries);
                return entries[idx];
            }
        }
        throw new Error(`Library object '${entryId}' not found.`);
    }

    /**
     * Deletes a saved Shared Object from the Library.
     */
    public deleteLibraryObject(entryId: string): void {
        for (const dir of this.configManager.getAllLibraryDirs()) {
            const entries = this.readDirIndex(dir);
            const idx = entries.findIndex(e => e.entryId === entryId);
            if (idx !== -1) {
                const [removed] = entries.splice(idx, 1);
                if (removed.packagePath && fs.existsSync(removed.packagePath)) {
                    fs.unlinkSync(removed.packagePath);
                }
                this.writeDirIndex(dir, entries);
                return;
            }
        }
    }
}
