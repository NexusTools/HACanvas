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

export class DrawVectorShapeAiTool extends AbstractAiTool {
    public readonly name = "draw_vector_shape";
    public readonly category = "vector" as const;
    public readonly icon = "📐";
    public readonly description =
        "Draws an Inkscape SVG vector shape ('rect', 'circle', 'ellipse', 'polygon', 'star', or 'line') onto a vector layer on the Main Canvas or inside a Shared Object.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            kind: {
                type: "string",
                enum: ["rect", "circle", "ellipse", "polygon", "star", "line"],
                description: "Shape kind to draw."
            },
            x: { type: "number", description: "X coordinate (top-left for rect/polygon/star, center cx for circle/ellipse, x1 for line)." },
            y: { type: "number", description: "Y coordinate (top-left for rect/polygon/star, center cy for circle/ellipse, y1 for line)." },
            width: { type: "number", description: "Width in pixels (for rect, polygon, star, ellipse)." },
            height: { type: "number", description: "Height in pixels (for rect, polygon, star, ellipse)." },
            r: { type: "number", description: "Radius in pixels (for circle, or outer radius for star/polygon)." },
            rx: { type: "number", description: "Horizontal radius for ellipse or corner radius for rect." },
            ry: { type: "number", description: "Vertical radius for ellipse or corner radius for rect." },
            x2: { type: "number", description: "End X coordinate when kind === 'line'." },
            y2: { type: "number", description: "End Y coordinate when kind === 'line'." },
            sides: { type: "number", description: "Number of points/sides when kind === 'star' or 'polygon' (default 5)." },
            innerRadius: { type: "number", description: "Inner radius for 'star' shapes." },
            fill: { type: "string", description: "Fill color hex (e.g. '#00d4ff' or 'none')." },
            stroke: { type: "string", description: "Stroke color hex (e.g. '#ffffff' or 'none')." },
            strokeWidth: { type: "number", description: "Stroke width in pixels (default 2)." },
            opacity: { type: "number", description: "Opacity from 0.0 to 1.0 (default 1.0)." },
            layerId: { type: "string", description: "Optional target vector layer ID or name." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID to draw inside." }
        },
        required: ["kind", "x", "y"]
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const kind = partialArgs.kind || "shape";
        const pos = partialArgs.x !== undefined ? ` at (${partialArgs.x}, ${partialArgs.y ?? "..."})` : "";
        const fill = partialArgs.fill ? ` [${partialArgs.fill}]` : "";
        return `Drawing vector ${kind}${pos}${fill}...`;
    }

    public getCompletedStatusLabel(_args: Record<string, any>, result: any): string {
        return `Drew vector ${result?.kind || "shape"} '${result?.id}' at (${result?.x ?? 0}, ${result?.y ?? 0})`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "vector",
            args.layerId,
            args.sharedObjectId
        );
        const obj = state.engine.drawShape(state.canvasId, layerId, {
            sharedObjectId,
            kind: args.kind || "rect",
            x: Number(args.x ?? 50),
            y: Number(args.y ?? 50),
            width: args.width !== undefined ? Number(args.width) : undefined,
            height: args.height !== undefined ? Number(args.height) : undefined,
            r: args.r !== undefined ? Number(args.r) : undefined,
            rx: args.rx !== undefined ? Number(args.rx) : undefined,
            ry: args.ry !== undefined ? Number(args.ry) : undefined,
            x2: args.x2 !== undefined ? Number(args.x2) : undefined,
            y2: args.y2 !== undefined ? Number(args.y2) : undefined,
            sides: args.sides !== undefined ? Number(args.sides) : undefined,
            innerRadius: args.innerRadius !== undefined ? Number(args.innerRadius) : undefined,
            fill: args.fill ?? state.toolOptions.primaryColor,
            stroke: args.stroke ?? state.toolOptions.strokeColor,
            strokeWidth: args.strokeWidth !== undefined ? Number(args.strokeWidth) : state.toolOptions.strokeWidth,
            opacity: args.opacity !== undefined ? Number(args.opacity) : 1.0
        });
        state.selectedObjectIds = [obj.id];
        state.setStatus(`AI drew ${obj.kind} "${obj.id}".`);
        return obj;
    }
}
