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
                          `  [${idx}] id="${l.id}", name="${l.name}", type="${l.type}", visible=${l.visible}, opacity=${l.opacity}, blendMode="${l.blendMode}", objects=${l.objects.length}`
                  )
                  .join("\n")
            : "  (no layers yet — calling any drawing/layer tool or create_new_canvas will automatically initialize the canvas)";
    const sharedList = Object.values(cState.sharedObjects);
    const sharedSummary =
        sharedList.length > 0
            ? sharedList
                  .map(
                      s =>
                          `  - id="${s.id}", name="${s.name}", category="${s.category || "Uncategorized"}", size=${s.width}x${s.height}, layers=${s.layers.length}`
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
You have full tool access to inspect and modify every single part of the canvas, layers, vector shapes, Bezier paths, text, raster paint strokes, flood/gradient fills, GIMP pixel filters, Shared Objects (embeddable sub-canvases), the persistent OS Shared Object Library, animation timeline keyframes, and file import/export.

CURRENT CANVAS CONTEXT:
- Canvas ID: "${state.canvasId}" (${cState.width}x${cState.height}px, background="${cState.backgroundColor}")
- Editing Mode: "${state.editMode}"${state.activeSharedObjectId ? ` (Active Shared Object: "${state.activeSharedObjectId}")` : ""}
- Active Layer ID: "${state.activeLayerId || ""}"
- Selected Object IDs: [${state.selectedObjectIds.join(", ")}]
- Current Animation Frame: ${state.currentFrame} / ${cState.animation.durationFrames} (${cState.animation.fps} FPS)
- Primary Color: ${state.toolOptions.primaryColor}, Secondary Color: ${state.toolOptions.secondaryColor}, Stroke Color: ${state.toolOptions.strokeColor}

MAIN CANVAS LAYERS:
${layerSummary}

SHARED OBJECTS ON CANVAS:
${sharedSummary}

GUIDELINES:
1. Always use your tools to inspect or make the requested changes directly on the canvas so the user sees live updates.
2. You can chain multiple tool calls across turns (e.g., inspect the scene first, then draw vector shapes, paint raster strokes, apply GIMP filters, or create Shared Objects).
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

/**
 * Concrete multi-provider streaming client for `HACanvas` / `HAEditor` (extending `AbstractAiStreamClient`
 * and delegating multi-provider transport to `@nexustools/aitooling`'s `LmStudioAiClient`).
 *
 * Connects to LM Studio (`http://localhost:1234`) by default, and supports OpenAI, Anthropic Claude,
 * Google Gemini (API Key & Google One OAuth), xAI Grok, Custom OpenAI/Claude endpoints, and custom code
 * providers registered via `AiProviderRegistry.registerProvider()`.
 */
export class LmStudioAiClient extends BaseAiToolingLmStudioClient<HaCanvasAiContext> {
    constructor(state: HaCanvasAiContext, urlOverrideGetter?: () => string | null | undefined) {
        super(
            state,
            urlOverrideGetter,
            () => HaCanvasAiToolRegistry.getOpenAiToolsSchema(),
            (ctx, mode) => buildHaCanvasSystemPrompt(ctx, mode)
        );
    }
}

export type { AiReasoningLevel, HaAiProviderId, OpenAiToolSchema };
