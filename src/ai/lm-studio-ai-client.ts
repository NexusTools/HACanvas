import { LmStudioAiClient as BaseAiToolingLmStudioClient } from "@nexustools/aitooling";
import type { AiReasoningLevel, HaAiProviderId } from "../shared-object-library.js";
import { HaCanvasAiToolRegistry, type HaCanvasAiContext, type OpenAiToolSchema } from "./abstract-ai-tool.js";
import { buildHaCanvasSystemPrompt } from "./abstract-ai-stream-client.js";

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

