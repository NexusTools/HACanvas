import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AbstractJsonStore } from "../storage/abstract-json-store.js";
import {
    HybridArtEngine,
    parseSharedObjectCategory,
    BUILT_IN_RASTER_BLEND_PRESETS,
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    RASTER_TRANSITION_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    RasterFilterRegistry,
    type RasterBlendPreset,
    type GimpFilterPreset,
    type GimpFilterCategory,
    type GimpJsInternalDoc,
    type SharedObjectCanvasSpec,
    type VectorObjectSpec
} from "../hybrid-art-engine.js";

export {
    BUILT_IN_RASTER_BLEND_PRESETS,
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    RASTER_TRANSITION_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    type RasterBlendPreset,
    type GimpFilterPreset,
    type GimpFilterCategory,
    type GimpJsInternalDoc
};

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

export interface AnimationCurvePreset {
    id: string;
    name: string;
    /** Cubic-Bezier control points [x1, y1, x2, y2] */
    controlPoints: [number, number, number, number];
    builtIn?: boolean;
}

export const BUILT_IN_CURVE_PRESETS: AnimationCurvePreset[] = [
    { id: "linear", name: "Linear", controlPoints: [0, 0, 1, 1], builtIn: true },
    { id: "ease_in", name: "Ease In (Quad/Cubic)", controlPoints: [0.42, 0, 1, 1], builtIn: true },
    { id: "ease_out", name: "Ease Out (Quad/Cubic)", controlPoints: [0, 0, 0.58, 1], builtIn: true },
    { id: "ease_in_out", name: "Ease In-Out (Smooth)", controlPoints: [0.42, 0, 0.58, 1], builtIn: true },
    { id: "overshoot", name: "Overshoot / Spring Out", controlPoints: [0.34, 1.56, 0.64, 1], builtIn: true },
    { id: "ease_in_back", name: "Anticipate / Ease In Back", controlPoints: [0.36, 0, 0.66, -0.56], builtIn: true },
    { id: "snap", name: "Snap / Fast Out, Slow In", controlPoints: [0.075, 0.82, 0.165, 1], builtIn: true }
];

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
    customCurvePresets?: AnimationCurvePreset[];
    customRasterBlendPresets?: RasterBlendPreset[];
    customFilterPresets?: GimpFilterPreset[];
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
    collapsedCategories: [],
    customCurvePresets: [],
    customRasterBlendPresets: [],
    customFilterPresets: []
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
        for (const fp of this.state.customFilterPresets || []) {
            RasterFilterRegistry.registerCustomPreset(fp);
        }
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
        for (const fp of this.state.customFilterPresets || []) {
            RasterFilterRegistry.registerCustomPreset(fp);
        }
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
            collapsedCategories: [...this.state.collapsedCategories],
            customCurvePresets: [...(this.state.customCurvePresets || [])],
            customRasterBlendPresets: [...(this.state.customRasterBlendPresets || [])],
            customFilterPresets: [...(this.state.customFilterPresets || [])]
        };
    }

    public listCurvePresets(): AnimationCurvePreset[] {
        const custom = (this.state.customCurvePresets || []).map(p => ({ ...p, builtIn: false }));
        return [...BUILT_IN_CURVE_PRESETS, ...custom];
    }

    public saveCurvePreset(preset: { id?: string; name: string; controlPoints: [number, number, number, number] }): AnimationCurvePreset {
        const cleanName = (preset.name || "Custom Curve").trim();
        const id = preset.id || `curve_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now() % 10000}`;
        const cp: [number, number, number, number] = [
            Number(preset.controlPoints[0].toFixed(3)),
            Number(preset.controlPoints[1].toFixed(3)),
            Number(preset.controlPoints[2].toFixed(3)),
            Number(preset.controlPoints[3].toFixed(3))
        ];
        const entry: AnimationCurvePreset = { id, name: cleanName, controlPoints: cp, builtIn: false };
        const list = [...(this.state.customCurvePresets || [])];
        const idx = list.findIndex(p => p.id === id || p.name.toLowerCase() === cleanName.toLowerCase());
        if (idx >= 0) {
            list[idx] = entry;
        } else {
            list.push(entry);
        }
        this.state.customCurvePresets = list;
        this.saveConfigSync();
        return entry;
    }

    public deleteCurvePreset(presetId: string): boolean {
        const before = (this.state.customCurvePresets || []).length;
        this.state.customCurvePresets = (this.state.customCurvePresets || []).filter(p => p.id !== presetId);
        if (this.state.customCurvePresets.length !== before) {
            this.saveConfigSync();
            return true;
        }
        return false;
    }

    public listRasterBlendPresets(): RasterBlendPreset[] {
        const custom = (this.state.customRasterBlendPresets || []).map(p => ({
            ...p,
            category: p.category || "Custom",
            builtIn: false
        }));
        return [...BUILT_IN_RASTER_BLEND_PRESETS, ...custom];
    }

    public getRasterBlendPreset(presetId: string): RasterBlendPreset | undefined {
        return this.listRasterBlendPresets().find(p => p.id === presetId);
    }

    public saveRasterBlendPreset(preset: { id?: string; name: string; category?: string; description?: string; code: string }): RasterBlendPreset {
        const parsedCat = parseSharedObjectCategory(preset.name || "Custom Blend Script", preset.category || "Custom");
        const cleanName = parsedCat.displayName || (preset.name || "Custom Blend Script").trim();
        const resolvedCategory = parsedCat.category && parsedCat.category !== "Uncategorized"
            ? parsedCat.category
            : (preset.category || "Custom").trim() || "Custom";
        const id = preset.id && !BUILT_IN_RASTER_BLEND_PRESETS.some(b => b.id === preset.id)
            ? preset.id
            : `rblend_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now() % 10000}`;
        const entry: RasterBlendPreset = {
            id,
            name: cleanName,
            category: resolvedCategory,
            description: (preset.description || "Custom JavaScript raster keyframe blending preset.").trim(),
            code: preset.code || BUILT_IN_RASTER_BLEND_PRESETS[0].code,
            builtIn: false
        };
        const list = [...(this.state.customRasterBlendPresets || [])];
        const idx = list.findIndex(p => p.id === id || p.name.toLowerCase() === cleanName.toLowerCase());
        if (idx >= 0) {
            list[idx] = entry;
        } else {
            list.push(entry);
        }
        this.state.customRasterBlendPresets = list;
        this.saveConfigSync();
        return entry;
    }

    public deleteRasterBlendPreset(presetId: string): boolean {
        const before = (this.state.customRasterBlendPresets || []).length;
        this.state.customRasterBlendPresets = (this.state.customRasterBlendPresets || []).filter(p => p.id !== presetId);
        if (this.state.customRasterBlendPresets.length !== before) {
            this.saveConfigSync();
            return true;
        }
        return false;
    }

    public listGimpFilterPresets(): GimpFilterPreset[] {
        const custom = (this.state.customFilterPresets || []).map(p => ({
            ...p,
            category: p.category || "Custom",
            builtIn: false
        }));
        const merged = [...BUILT_IN_GIMP_FILTER_PRESETS];
        for (const cp of custom) {
            const idx = merged.findIndex(m => m.id === cp.id);
            if (idx >= 0) {
                merged[idx] = cp;
            } else {
                merged.push(cp);
            }
        }
        return merged;
    }

    public getGimpFilterPreset(presetId: string): GimpFilterPreset | undefined {
        return this.listGimpFilterPresets().find(p => p.id === presetId);
    }

    public saveGimpFilterPreset(preset: {
        id?: string;
        name: string;
        category?: string;
        description?: string;
        gimpProcedure?: string;
        parameterSchemas?: GimpFilterPreset["parameterSchemas"];
        code: string;
    }): GimpFilterPreset {
        const parsedCat = parseSharedObjectCategory(preset.name || "Custom Filter", preset.category || "Custom");
        const cleanName = parsedCat.displayName || (preset.name || "Custom Filter").trim();
        const resolvedCategory = parsedCat.category && parsedCat.category !== "Uncategorized"
            ? parsedCat.category
            : (preset.category || "Custom").trim() || "Custom";
        const id = preset.id && !BUILT_IN_GIMP_FILTER_PRESETS.some(b => b.id === preset.id)
            ? preset.id
            : `filter_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now() % 10000}`;
        const entry: GimpFilterPreset = {
            id,
            name: cleanName,
            category: resolvedCategory,
            description: (preset.description || "Custom JavaScript GIMP raster filter preset.").trim(),
            gimpProcedure: preset.gimpProcedure || `gimp-js-custom-${id}`,
            parameterSchemas: Array.isArray(preset.parameterSchemas) ? preset.parameterSchemas : [],
            code: preset.code || BUILT_IN_GIMP_FILTER_PRESETS[0].code,
            builtIn: false
        };
        const list = [...(this.state.customFilterPresets || [])];
        const idx = list.findIndex(p => p.id === id || p.name.toLowerCase() === cleanName.toLowerCase());
        if (idx >= 0) {
            list[idx] = entry;
        } else {
            list.push(entry);
        }
        this.state.customFilterPresets = list;
        RasterFilterRegistry.registerCustomPreset(entry);
        this.saveConfigSync();
        return entry;
    }

    public deleteGimpFilterPreset(presetId: string): boolean {
        const before = (this.state.customFilterPresets || []).length;
        this.state.customFilterPresets = (this.state.customFilterPresets || []).filter(p => p.id !== presetId);
        RasterFilterRegistry.unregisterCustomPreset(presetId);
        if (this.state.customFilterPresets.length !== before) {
            this.saveConfigSync();
            return true;
        }
        return false;
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

