import * as fs from "fs";
import * as path from "path";
import {
    type BlendMode,
    type EasingMode,
    type VectorObjectSpec
} from "../../hybrid-art-engine.js";
import {
    BUILT_IN_CURVE_PRESETS,
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    RASTER_TRANSITION_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS,
    type GimpFilterPreset
} from "../../shared-object-library.js";
import { AbstractAiTool, type HaCanvasAiContext } from "../abstract-ai-tool-base.js";

export class ConfigureGimpFilterPresetAiTool extends AbstractAiTool {
    public readonly name = "configure_gimp_filter_preset";
    public readonly category = "filter" as const;
    public readonly icon = "🧬";
    public readonly description =
        "Manages GIMP JavaScript filter presets and folder categories. Can list all 85+ built-in and custom GIMP filters (with their folder categories, parameter schemas, and full JavaScript source code), inspect a filter's JS source code or internal helper documentation (`helpers.*`, `gimp.*`, `gegl.*`), validate custom JavaScript filter scripts, create/save custom categorized JS filter presets into the project (`.hacanvas`) and global config, delete custom filter presets, or apply a preset to a raster layer.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: [
                    "list_presets",
                    "list_categories",
                    "inspect_preset",
                    "inspect_internal_docs",
                    "validate_code",
                    "save_preset",
                    "delete_preset",
                    "apply_preset"
                ],
                description:
                    "Action to execute: 'list_presets' (lists filters, optionally filtered by category), 'list_categories' (lists all GIMP folder categories), 'inspect_preset' (returns full JS source code & schema for a filter), 'inspect_internal_docs' (returns documentation & GIMP C references for internal functions), 'validate_code' (tests JS filter script on a sandbox buffer), 'save_preset' (validates & saves a custom JS filter preset), 'delete_preset', or 'apply_preset'."
            },
            filterId: {
                type: "string",
                description: "Filter preset ID (e.g. 'gaussian_blur', 'whirl_pinch', 'plasma', 'cartoon', or a custom filter ID)."
            },
            category: {
                type: "string",
                description:
                    "GIMP filter folder category (e.g. 'Blur', 'Enhance', 'Distorts', 'Light and Shadow', 'Noise', 'Edge-Detect', 'Artistic', 'Combine', 'Generic', 'Map', 'Render', 'Colors', 'Decor', 'Custom', or slash-delimited folder path)."
            },
            includeCode: {
                type: "boolean",
                description: "When action === 'list_presets', whether to include the full JS source code of every filter in the list response (default true)."
            },
            name: {
                type: "string",
                description: "Human-readable filter preset name when action === 'save_preset'."
            },
            description: {
                type: "string",
                description: "Filter description when action === 'save_preset'."
            },
            gimpProcedure: {
                type: "string",
                description: "Optional GIMP/GEGL procedure reference string when action === 'save_preset'."
            },
            parameterSchemas: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        type: { type: "string", enum: ["number", "string", "boolean"] },
                        defaultValue: {},
                        min: { type: "number" },
                        max: { type: "number" },
                        description: { type: "string" }
                    },
                    required: ["name", "type", "defaultValue", "description"]
                },
                description: "Optional parameter schema definitions when action === 'save_preset'."
            },
            code: {
                type: "string",
                description: "JavaScript filter source code operating on (srcBuf, outBuf, width, height, params, selectionMask, helpers, gimp, gegl)."
            },
            symbolName: {
                type: "string",
                description: "Optional internal symbol name to look up when action === 'inspect_internal_docs' (e.g. 'helpers.perlin2d', 'gimp.convolve3x3', 'gegl.gaussianBlur')."
            },
            params: {
                type: "object",
                description: "Optional filter parameter dictionary when action === 'apply_preset' or 'validate_code'."
            },
            layerId: {
                type: "string",
                description: "Optional target raster layer ID when action === 'apply_preset'."
            },
            frame: {
                type: "number",
                description: "Optional animation frame index when action === 'apply_preset'."
            },
            sharedObjectId: {
                type: "string",
                description: "Optional Shared Object ID."
            }
        },
        required: ["action"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const act = partialArgs.action || "list_presets";
        if (act === "save_preset") return `Saving custom JS GIMP filter preset '${partialArgs.name || "..."}' (${partialArgs.category || "Custom"})...`;
        if (act === "inspect_preset") return `Inspecting JS source code for GIMP filter '${partialArgs.filterId || "..."}'...`;
        if (act === "apply_preset") return `Applying GIMP filter preset '${partialArgs.filterId || "..."}'...`;
        return `Managing GIMP JS filter presets (${act})...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        const act = args.action || "list_presets";
        if (act === "save_preset") return `Saved JS GIMP filter preset '${result?.preset?.name}' in category '${result?.preset?.category}'`;
        if (act === "inspect_preset") return `Inspected JS source code for filter '${result?.preset?.id}'`;
        if (act === "apply_preset") return `Applied GIMP filter '${result?.filterType}' on '${result?.layerId}'`;
        if (act === "validate_code") return `Validated JS filter script (${result?.valid ? "valid" : "invalid"})`;
        return `Listed ${result?.presets?.length ?? result?.categories?.length ?? 0} GIMP filter items`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const act = args.action || "list_presets";
        const sharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);

        const getMergedFilterPresets = (): GimpFilterPreset[] => {
            const fromEngine = state.engine.listGimpFilterPresets(state.hasOpenCanvas ? state.canvasId : undefined);
            const fromConfig = state.configManager.listGimpFilterPresets();
            const merged = [...fromEngine];
            for (const cp of fromConfig) {
                const idx = merged.findIndex(m => m.id === cp.id);
                if (idx >= 0) {
                    if (!merged[idx].builtIn) merged[idx] = cp;
                } else {
                    merged.push(cp);
                }
            }
            return merged;
        };

        if (act === "list_categories") {
            const presets = getMergedFilterPresets();
            const counts: Record<string, number> = {};
            for (const p of presets) {
                const cat = p.category || "Generic";
                counts[cat] = (counts[cat] || 0) + 1;
            }
            return {
                categories: [...GIMP_FILTER_CATEGORIES, ...Object.keys(counts).filter(k => !GIMP_FILTER_CATEGORIES.includes(k as any))],
                countsByCategory: counts,
                totalPresets: presets.length
            };
        }

        if (act === "list_presets") {
            let presets = getMergedFilterPresets();
            if (args.category && String(args.category).trim()) {
                const q = String(args.category).trim().toLowerCase();
                presets = presets.filter(p => (p.category || "").toLowerCase() === q || (p.category || "").toLowerCase().startsWith(q + "/"));
            }
            const includeCode = args.includeCode !== false;
            return {
                categories: GIMP_FILTER_CATEGORIES,
                presets: includeCode
                    ? presets
                    : presets.map(({ code: _code, ...rest }) => rest)
            };
        }

        if (act === "inspect_preset") {
            const filterId = args.filterId || "gaussian_blur";
            const found = getMergedFilterPresets().find(p => p.id === filterId);
            if (!found) {
                throw new Error(`GIMP filter preset '${filterId}' not found.`);
            }
            return { preset: found };
        }

        if (act === "inspect_internal_docs") {
            if (args.symbolName) {
                const sym = String(args.symbolName).trim();
                const doc = GIMP_JS_INTERNAL_DOCS[sym]
                    || Object.values(GIMP_JS_INTERNAL_DOCS).find(d => d.symbol === sym || d.symbol.endsWith("." + sym));
                return { doc: doc || null, availableSymbols: Object.keys(GIMP_JS_INTERNAL_DOCS) };
            }
            return { docs: GIMP_JS_INTERNAL_DOCS };
        }

        if (act === "validate_code") {
            if (!args.code || !String(args.code).trim()) {
                throw new Error("JavaScript 'code' is required when action === 'validate_code'.");
            }
            return state.engine.validateGimpFilterScript(String(args.code), args.params || {});
        }

        if (act === "save_preset") {
            if (!args.code || !String(args.code).trim()) {
                throw new Error("JavaScript 'code' is required when action === 'save_preset'.");
            }
            const validation = state.engine.validateGimpFilterScript(String(args.code), args.params || {});
            if (!validation.valid) {
                throw new Error(`Invalid GIMP filter JavaScript: ${validation.error}`);
            }
            const savedInConfig = state.configManager.saveGimpFilterPreset({
                id: args.filterId,
                name: args.name || "Custom Filter",
                category: args.category || "Custom",
                description: args.description,
                gimpProcedure: args.gimpProcedure,
                parameterSchemas: args.parameterSchemas,
                code: String(args.code)
            });
            if (state.hasOpenCanvas) {
                state.engine.saveCustomGimpFilterPreset(state.canvasId, {
                    id: savedInConfig.id,
                    name: savedInConfig.name,
                    category: savedInConfig.category,
                    description: savedInConfig.description,
                    gimpProcedure: savedInConfig.gimpProcedure,
                    parameterSchemas: savedInConfig.parameterSchemas,
                    code: savedInConfig.code
                });
            }
            state.setStatus(`AI saved custom JS GIMP filter preset "${savedInConfig.name}" (${savedInConfig.category}).`);
            return { preset: savedInConfig };
        }

        if (act === "delete_preset") {
            if (!args.filterId) throw new Error("filterId is required for delete_preset.");
            const deletedConfig = state.configManager.deleteGimpFilterPreset(String(args.filterId));
            const deletedCanvas = state.hasOpenCanvas
                ? state.engine.deleteCustomGimpFilterPreset(state.canvasId, String(args.filterId))
                : false;
            return { filterId: args.filterId, deleted: deletedConfig || deletedCanvas };
        }

        if (act === "apply_preset") {
            state.ensureCanvasOpen?.();
            const { layerId } = this.ensureTargetLayer(state, "raster", args.layerId, sharedId);
            const targetFrame = args.frame !== undefined ? Number(args.frame) : state.currentFrame;
            const res = state.engine.rasterFilter(
                state.canvasId,
                layerId,
                {
                    ...(args.params || {}),
                    filterType: args.filterId || "gaussian_blur",
                    customCode: args.code,
                    frame: targetFrame
                },
                targetFrame,
                sharedId
            );
            state.setStatus(`AI applied GIMP filter preset "${res.filterType}" on "${res.layerId}".`);
            return res;
        }

        throw new Error(`Unknown configure_gimp_filter_preset action: '${act}'`);
    }
}
