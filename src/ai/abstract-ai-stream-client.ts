import {
    AbstractAiStreamClient as BaseAiToolingStreamClient,
    LmStudioAiClient as BaseAiToolingLmStudioClient,
    MultiProviderToolStreamClient,
    AiProviderRegistry,
    type CustomAiServiceAdapter,
    AiLiveChatController,
    AiReasoningControlsWidget,
    DEFAULT_REASONING_LEVEL_OPTIONS,
    type ReasoningLevelDescriptor,
    ModelCatalog,
    GoogleOAuthManager,
    ProviderFactory,
    CostCalculator,
    EngineQueue,
    resolveReasoningConfig,
    type ProviderPromptOptions,
    type ResolvedReasoningConfig,
    type AiChatMessage,
    type AiReasoningMode,
    type AiStreamRequestPayload,
    type CustomAiStreamHandler
} from "@nexustools/aitooling";
import type { AiReasoningLevel, HaAiProviderId } from "../shared-object-library.js";
import {
    HaCanvasAiToolRegistry,
    type HaCanvasAiContext,
    type OpenAiToolSchema
} from "./abstract-ai-tool.js";

export {
    MultiProviderToolStreamClient,
    AiProviderRegistry,
    type CustomAiServiceAdapter,
    AiLiveChatController,
    AiReasoningControlsWidget,
    DEFAULT_REASONING_LEVEL_OPTIONS,
    type ReasoningLevelDescriptor,
    ModelCatalog,
    GoogleOAuthManager,
    ProviderFactory,
    CostCalculator,
    EngineQueue,
    resolveReasoningConfig,
    type ProviderPromptOptions,
    type ResolvedReasoningConfig,
    type AiChatMessage,
    type AiReasoningMode,
    type AiStreamRequestPayload,
    type CustomAiStreamHandler
};

/**
 * Builds the `HACanvas` / `HAEditor` system prompt with live canvas context so the active AI model
 * knows the current canvas dimensions, layers, shared objects, active editing mode, and reasoning level.
 */
export function buildHaCanvasSystemPrompt(state: HaCanvasAiContext, reasoningMode: AiReasoningMode): string {
    const cState = state.getCanvasState();
    const layerSummary =
        cState.layers.length > 0
            ? cState.layers
                  .map(
                      (l, idx) =>
                          `  [${idx}] id="${l.id}", name="${l.name}", type="${l.type}", visible=${l.visible}, opacity=${l.opacity}, blendMode="${l.blendMode}", objects=${l.objects.length}, attachedFilters=${(l.attachedFilters || []).map(f => `${f.filterType}(${f.enabled !== false ? "on" : "off"})`).join(",") || "none"}`
                  )
                  .join("\n")
            : "  (no layers yet — calling any drawing/layer tool or create_new_canvas will automatically initialize the canvas)";
    const sharedList = Object.values(cState.sharedObjects);
    const sharedSummary =
        sharedList.length > 0
            ? sharedList
                  .map(
                      s =>
                          `  - id="${s.id}", name="${s.name}", category="${s.category || "Uncategorized"}", size=${s.width}x${s.height}, layers=${s.layers.length}, attachedFilters=${(s.attachedFilters || []).map(f => `${f.filterType}(${f.enabled !== false ? "on" : "off"})`).join(",") || "none"}`
                  )
                  .join("\n")
            : "  (none)";

    const reasoningInstruction =
        reasoningMode === "none"
            ? "Do NOT output internal thinking or <think> blocks. Execute the required tools immediately and reply concisely."
            : `Reasoning mode is active at level "${reasoningMode.toUpperCase()}". Think carefully (${
                  reasoningMode === "low"
                      ? "briefly and directly"
                      : reasoningMode === "medium"
                        ? "methodically step-by-step"
                        : "deeply and exhaustively across composition, layers, colors, and geometry"
              }) before calling tools.`;

    return `You are the built-in AI Studio Assistant for HACanvas / HAEditor (GIMP Raster + Inkscape Vector + Categorized Shared Objects Graphical Engine).
You have full tool access to inspect and modify every single part of the canvas, layers, vector shapes, Bezier paths, vector shape & line deformation (\`deform_vector_object\` supporting \`bend_segment\`, \`move_endpoint\`, \`straighten_segment\`, \`add_vertex\`, \`remove_vertex\`, \`convert_to_path\`, \`inspect_nodes\`), text, raster paint strokes, flood/gradient fills, 85+ immediate or dynamic non-destructive GIMP pixel filters (\`apply_gimp_filter\` with \`immediate\`, \`attach\`, \`update_attached\`, \`bake\`, \`remove\`, \`toggle_preview\`, \`list_attached\`), Shared Objects (embeddable sub-canvases), the persistent OS Shared Object Library, animation timeline inspection (\`inspect_animation_timeline\`), keyframes (\`configure_timeline\`, \`set_animation_keyframe\`), cubic-Bezier movement/interpolation curves (\`configure_animation_curve\`), raster keyframe blending & custom JavaScript blending scripts (\`configure_raster_keyframe_blend\`), document EXIF/GPS/XMP metadata & embedded fonts (\`manage_metadata_and_fonts\`), undo/redo/image transforms/color adjustments (\`undo_redo_and_transform\`), and file import/export across all 18 formats.

CURRENT CANVAS CONTEXT:
- Canvas ID: "${state.canvasId}" (${cState.width}x${cState.height}px, dpi=${cState.dpi ?? 72}, background="${cState.backgroundColor}", previewDynamicFilters=${cState.previewDynamicFilters !== false})
- Editing Mode: "${state.editMode}"${state.activeSharedObjectId ? ` (Active Shared Object: "${state.activeSharedObjectId}")` : ""}
- Active Layer ID: "${state.activeLayerId || ""}"
- Selected Object IDs: [${state.selectedObjectIds.join(", ")}]
- Current Animation Frame: ${state.currentFrame} / ${cState.animation.durationFrames} (${cState.animation.fps} FPS, tracks=${cState.animation.tracks.length})
- Primary Color: ${state.toolOptions.primaryColor}, Secondary Color: ${state.toolOptions.secondaryColor}, Stroke Color: ${state.toolOptions.strokeColor}

MAIN CANVAS LAYERS:
${layerSummary}

SHARED OBJECTS ON CANVAS:
${sharedSummary}

GUIDELINES:
1. Always use your tools to inspect or make the requested changes directly on the canvas so the user sees live updates.
2. You can chain multiple tool calls across turns (e.g., inspect the scene first, then draw vector shapes, deform shapes/lines, paint raster strokes, attach or apply GIMP filters, configure animation curves/transitions, or create Shared Objects).
3. ${reasoningInstruction}`;
}

/**
 * Abstract parent class for streaming AI clients in `HACanvas` (extending `@nexustools/aitooling`'s
 * `AbstractAiStreamClient` with `HaCanvasAiContext` system prompt and 26 canvas tools).
 */
export abstract class AbstractAiStreamClient extends BaseAiToolingStreamClient<HaCanvasAiContext> {
    constructor(state: HaCanvasAiContext, urlOverrideGetter?: () => string | null | undefined) {
        super(
            state,
            urlOverrideGetter,
            () => HaCanvasAiToolRegistry.getOpenAiToolsSchema(),
            (ctx, mode) => buildHaCanvasSystemPrompt(ctx, mode)
        );
    }
}

