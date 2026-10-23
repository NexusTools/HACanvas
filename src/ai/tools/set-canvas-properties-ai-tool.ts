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

export class SetCanvasPropertiesAiTool extends AbstractAiTool {
    public readonly name = "set_canvas_properties";
    public readonly category = "canvas" as const;
    public readonly icon = "⚙️";
    public readonly description =
        "Updates the current canvas background color, dimensions (width/height), print DPI, global dynamic filter preview toggle (`previewDynamicFilters`), viewport zoom, or document metadata without losing existing vector objects or shared objects.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            backgroundColor: { type: "string", description: "New canvas background color (e.g. '#101420' or 'transparent')." },
            width: { type: "number", description: "Optional new canvas width in pixels." },
            height: { type: "number", description: "Optional new canvas height in pixels." },
            dpi: { type: "number", description: "Optional print resolution in DPI (e.g. 72, 150, 300)." },
            previewDynamicFilters: { type: "boolean", description: "Optional global toggle for previewing attached dynamic filters in the viewport." },
            zoom: { type: "number", description: "Optional viewport zoom multiplier (0.25 to 4.0)." },
            metadata: {
                type: "object",
                description: "Optional document metadata fields to merge (e.g. { author, copyright, description, software, customAttributes })."
            }
        }
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const parts: string[] = [];
        if (partialArgs.backgroundColor) parts.push(`bg: ${partialArgs.backgroundColor}`);
        if (partialArgs.width || partialArgs.height) parts.push(`size: ${partialArgs.width ?? "?"}×${partialArgs.height ?? "?"}`);
        if (partialArgs.dpi) parts.push(`dpi: ${partialArgs.dpi}`);
        if (partialArgs.previewDynamicFilters !== undefined) parts.push(`previewFilters: ${partialArgs.previewDynamicFilters}`);
        if (partialArgs.zoom) parts.push(`zoom: ${Math.round(Number(partialArgs.zoom) * 100)}%`);
        return `Updating canvas properties (${parts.join(", ") || "..."})...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Updated canvas (${result?.width}×${result?.height}px, bg: ${result?.backgroundColor}, dpi: ${result?.dpi ?? 72})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        state.ensureCanvasOpen?.();
        const cState = state.getCanvasState();
        if (args.backgroundColor !== undefined) {
            cState.backgroundColor = String(args.backgroundColor);
        }
        if (args.dpi !== undefined) {
            cState.dpi = Math.max(1, Math.round(Number(args.dpi)));
        }
        if (args.previewDynamicFilters !== undefined) {
            cState.previewDynamicFilters = Boolean(args.previewDynamicFilters);
        }
        if (args.metadata && typeof args.metadata === "object") {
            cState.metadata = {
                ...(cState.metadata || {}),
                ...args.metadata
            };
        }
        if (args.width !== undefined || args.height !== undefined) {
            const newW = Math.max(16, Math.min(4096, Math.round(Number(args.width ?? cState.width))));
            const newH = Math.max(16, Math.min(4096, Math.round(Number(args.height ?? cState.height))));
            for (const layer of cState.layers) {
                if (layer.type === "raster") {
                    const oldBuf = (state.engine as any).loadRasterBuffer(cState, layer.id, cState.width, cState.height);
                    const fitted = (state.engine as any).fitRgbaBuffer(oldBuf, cState.width, cState.height, newW, newH);
                    (state.engine as any).saveRasterBuffer(cState, layer.id, fitted);
                }
            }
            cState.width = newW;
            cState.height = newH;
        }
        state.engine.saveCanvas(cState);
        if (args.zoom !== undefined) {
            state.zoom = Math.max(0.25, Math.min(4.0, Number(args.zoom)));
        }
        state.setStatus(`AI updated canvas properties (${cState.width}×${cState.height}px, bg: ${cState.backgroundColor}).`);
        return {
            width: cState.width,
            height: cState.height,
            dpi: cState.dpi ?? 72,
            backgroundColor: cState.backgroundColor,
            previewDynamicFilters: cState.previewDynamicFilters !== false,
            zoom: state.zoom,
            metadata: cState.metadata || null
        };
    }
}
