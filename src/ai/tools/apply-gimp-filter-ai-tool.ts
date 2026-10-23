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

export class ApplyGimpFilterAiTool extends AbstractAiTool {
    public readonly name = "apply_gimp_filter";
    public readonly category = "filter" as const;
    public readonly icon = "✨";
    public readonly description =
        "Applies any of the 85+ built-in GIMP pixel filters immediately to mutate a raster layer ('mode: immediate'), or attaches/updates/manages dynamic non-destructive filters ('mode: attach | update_attached | bake | remove | toggle_preview | list_attached') on a raster layer, vector layer, individual vector object, or shared object.";
    public readonly parameters = {
        type: "object" as const,
        properties: {
            mode: {
                type: "string",
                enum: [
                    "immediate",
                    "attach",
                    "update_attached",
                    "bake",
                    "remove",
                    "toggle_preview",
                    "list_attached"
                ],
                description:
                    "Execution mode: 'immediate' (default, mutates raster layer pixels immediately), 'attach' (attaches filter dynamically without touching underlying pixels), 'update_attached' (updates params, enabled state, or stack order of an existing attached filter), 'bake' (permanently bakes attached filters into layer pixels), 'remove' (removes an attached filter or clears all), 'toggle_preview' (toggles dynamic filter preview on/off), or 'list_attached' (lists all attached filters with full settings & schemas)."
            },
            targetType: {
                type: "string",
                enum: ["layer", "object", "shared_object", "canvas"],
                description:
                    "Target type when attaching, updating, toggling, or listing dynamic filters: 'layer' (default), 'object' (vector object or ObjectRef), 'shared_object', or 'canvas' (global preview toggle)."
            },
            objectId: {
                type: "string",
                description: "Target vector object ID when targetType === 'object'."
            },
            attachedFilterId: {
                type: "string",
                description: "Attached filter instance ID when mode === 'remove' or 'update_attached'."
            },
            moveDirection: {
                type: "string",
                enum: ["up", "down"],
                description: "Optional stack reorder direction when mode === 'update_attached'."
            },
            clearAll: {
                type: "boolean",
                description: "When mode === 'remove', set true to remove all attached filters on the target."
            },
            enabled: {
                type: "boolean",
                description: "Optional boolean toggle state when mode === 'toggle_preview', 'attach', or 'update_attached'."
            },
            filterType: {
                type: "string",
                description:
                    "GIMP filter ID to apply or attach (e.g. 'gaussian_blur', 'box_blur', 'median_blur', 'pixelize', 'motion_blur_linear', 'motion_blur_circular', 'motion_blur_zoom', 'lens_blur', 'selective_gaussian_blur', 'tileable_blur', 'sharpen', 'high_pass', 'despeckle', 'destripe', 'nl_filter', 'contrast_retinex', 'red_eye_removal', 'deinterlace', 'noise_reduction', 'wavelet_decompose', 'blinds', 'ripple', 'waves', 'whirl_pinch', 'spherize', 'polar_coordinates', 'kaleidoscope', 'mosaic', 'wind', 'emboss', 'engrave', 'newsprint', 'video_degradation', 'shift', 'pagecurl', 'curve_bend', 'lens_distortion', 'drop_shadow', 'long_shadow', 'vignette', 'bloom', 'softglow', 'supernova', 'lens_flare', 'sparkle', 'lighting_effects', 'gradient_flare', 'noise_rgb', 'noise_hsv', 'noise_hurl', 'noise_pick', 'noise_slur', 'noise_spread', 'cie_lch_noise', 'edge_sobel', 'edge_laplace', 'edge_neon', 'difference_of_gaussians', 'image_gradient', 'oilify', 'cartoon', 'photocopy', 'cubism', 'waterpixels', 'van_gogh_lic', 'apply_canvas', 'clothify', 'weave', 'glass_tile', 'predator', 'filmstrip', 'depth_merge', 'convolution_matrix', 'dilate', 'erode', 'distance_map', 'normal_map', 'bump_map', 'displace', 'fractal_trace', 'illusion', 'little_planet', 'make_seamless', 'tile_small', 'warp_curl', 'plasma', 'perlin_noise', 'simplex_noise', 'cell_noise', 'checkerboard', 'grid_render', 'maze', 'sinus', 'spiral', 'bayer_matrix', 'fractal_explorer', 'cml_explorer', 'qbist', 'sphere_designer', 'jigsaw', 'flame', 'invert', 'value_invert', 'threshold', 'brightness_contrast', 'posterize', 'sepia', 'alien_map', 'color_to_alpha', 'hot_pixels', 'sample_colorize', 'border_average', 'add_bevel', 'add_border', 'coffee_stain', 'fuzzy_border', 'old_photo', 'round_corners', 'slide_frame', 'stencil_carve', 'stencil_chrome', any custom saved filter preset ID, or 'custom_js')."
            },
            params: {
                type: "object",
                description: "Optional filter parameter dictionary matching the filter's parameterSchemas (e.g. { radius: 5, amount: 1.5, amplitude: 12, wavelength: 24 })."
            },
            customCode: {
                type: "string",
                description: "Optional inline JavaScript filter script operating on (srcBuf, outBuf, width, height, params, selectionMask, helpers, gimp, gegl)."
            },
            radius: { type: "number", description: "Blur/effect radius in pixels (default 3)." },
            amount: { type: "number", description: "Intensity/amount parameter." },
            threshold: { type: "number", description: "Luminance cutoff 0..255 (default 128)." },
            brightness: { type: "number", description: "Brightness adjustment -100..100." },
            contrast: { type: "number", description: "Contrast adjustment -100..100." },
            offsetX: { type: "number", description: "X offset in pixels (for drop_shadow/shift)." },
            offsetY: { type: "number", description: "Y offset in pixels (for drop_shadow/shift)." },
            color: { type: "string", description: "Color hex parameter (e.g. '#000000')." },
            opacity: { type: "number", description: "Opacity 0.0..1.0." },
            frame: { type: "number", description: "Optional animation frame index." },
            layerId: { type: "string", description: "Optional target layer ID or name." },
            sharedObjectId: { type: "string", description: "Optional Shared Object ID." }
        },
        required: []
    };

    public getLiveStatusLabel(partialArgs: Record<string, any>): string {
        const mode = partialArgs.mode || partialArgs.action || "immediate";
        if (mode === "attach") return `Attaching dynamic filter '${partialArgs.filterType || "..."}' to ${partialArgs.targetType || "layer"}...`;
        if (mode === "update_attached") return `Updating attached dynamic filter '${partialArgs.attachedFilterId || partialArgs.filterType || "..."}'...`;
        if (mode === "bake") return `Baking attached dynamic filters on layer...`;
        if (mode === "toggle_preview") return `Toggling dynamic filter preview...`;
        return `Applying GIMP filter '${partialArgs.filterType || "..."}' to raster layer...`;
    }

    public getCompletedStatusLabel(args: Record<string, any>, result: any): string {
        const mode = args.mode || args.action || "immediate";
        if (mode === "attach") return `Attached dynamic filter '${result?.attachedFilter?.filterType || args.filterType}'`;
        if (mode === "update_attached") return `Updated attached dynamic filter '${result?.updatedFilter?.filterType || args.attachedFilterId}'`;
        if (mode === "bake") return `Baked ${result?.filtersBaked ?? 0} filter(s) on '${result?.layerId}'`;
        if (mode === "toggle_preview") return `Set filter preview enabled=${result?.enabled}`;
        return `Applied GIMP filter '${result?.filterType || args.filterType}' on layer '${result?.layerId}'`;
    }

    public execute(state: HaCanvasAiContext, args: Record<string, any>): any {
        const mode = args.mode || args.action || "immediate";
        const sharedId = args.sharedObjectId || (state.editMode !== "none" ? state.activeSharedObjectId : undefined);
        const extraParams = args.params && typeof args.params === "object" ? args.params : {};
        const mergedParams: Record<string, any> = {
            ...extraParams,
            ...(args.customCode ? { customCode: args.customCode } : {}),
            ...(args.radius !== undefined ? { radius: Number(args.radius) } : {}),
            ...(args.amount !== undefined ? { amount: Number(args.amount) } : {}),
            ...(args.threshold !== undefined ? { threshold: Number(args.threshold) } : {}),
            ...(args.brightness !== undefined ? { brightness: Number(args.brightness) } : {}),
            ...(args.contrast !== undefined ? { contrast: Number(args.contrast) } : {}),
            ...(args.offsetX !== undefined ? { offsetX: Number(args.offsetX) } : {}),
            ...(args.offsetY !== undefined ? { offsetY: Number(args.offsetY) } : {}),
            ...(args.color !== undefined ? { color: args.color } : {}),
            ...(args.opacity !== undefined ? { opacity: Number(args.opacity) } : {})
        };

        const resolvedTargetType: "layer" | "object" | "shared_object" | "canvas" =
            args.targetType ||
            (args.objectId ? "object" : "layer");

        if (mode === "attach") {
            state.ensureCanvasOpen?.();
            const targetTypeForAttach: "layer" | "object" | "shared_object" =
                resolvedTargetType === "canvas" ? "layer" : resolvedTargetType;
            const targetId =
                targetTypeForAttach === "object"
                    ? args.objectId || state.selectedObjectIds?.[0]
                    : targetTypeForAttach === "shared_object"
                      ? args.sharedObjectId || state.activeSharedObjectId
                      : args.layerId || state.activeLayerId;
            const attached = state.engine.attachFilter(state.canvasId, {
                targetType: targetTypeForAttach,
                targetId,
                sharedObjectId: targetTypeForAttach === "shared_object" ? undefined : sharedId,
                filterType: args.filterType || "gaussian_blur",
                params: mergedParams,
                enabled: args.enabled !== false
            });
            const listed = state.engine.listAttachedFilters(state.canvasId, {
                targetType: targetTypeForAttach,
                targetId,
                sharedObjectId: targetTypeForAttach === "shared_object" ? undefined : sharedId
            });
            state.setStatus(`AI attached dynamic filter "${attached.name}" to ${targetTypeForAttach}.`);
            return {
                mode: "attach",
                targetType: targetTypeForAttach,
                targetId,
                attachedFilter: listed.attachedFilters.find((f: any) => f.id === attached.id) || attached,
                allAttachedFilters: listed.attachedFilters
            };
        }

        if (mode === "update_attached") {
            state.ensureCanvasOpen?.();
            const targetTypeForUpdate: "layer" | "object" | "shared_object" =
                resolvedTargetType === "canvas" ? "layer" : resolvedTargetType;
            const targetId =
                targetTypeForUpdate === "object"
                    ? args.objectId || state.selectedObjectIds?.[0]
                    : targetTypeForUpdate === "shared_object"
                      ? args.sharedObjectId || state.activeSharedObjectId
                      : args.layerId || state.activeLayerId;
            let filterId = args.attachedFilterId;
            if (!filterId && args.filterType) {
                const current = state.engine.listAttachedFilters(state.canvasId, {
                    targetType: targetTypeForUpdate,
                    targetId,
                    sharedObjectId: targetTypeForUpdate === "shared_object" ? undefined : sharedId
                });
                filterId = current.attachedFilters.find((f: any) => f.filterType === args.filterType)?.id;
            }
            if (!filterId) {
                throw new Error("attachedFilterId (or matching filterType) is required when mode === 'update_attached'.");
            }
            const updated = state.engine.updateAttachedFilter(state.canvasId, {
                targetType: targetTypeForUpdate,
                targetId,
                sharedObjectId: targetTypeForUpdate === "shared_object" ? undefined : sharedId,
                filterId,
                params: Object.keys(mergedParams).length > 0 ? mergedParams : undefined,
                enabled: args.enabled,
                moveDirection: args.moveDirection
            });
            const listed = state.engine.listAttachedFilters(state.canvasId, {
                targetType: targetTypeForUpdate,
                targetId,
                sharedObjectId: targetTypeForUpdate === "shared_object" ? undefined : sharedId
            });
            state.setStatus(`AI updated attached dynamic filter "${updated.name}".`);
            return {
                mode: "update_attached",
                targetType: targetTypeForUpdate,
                targetId,
                updatedFilter: listed.attachedFilters.find((f: any) => f.id === updated.id) || updated,
                allAttachedFilters: listed.attachedFilters
            };
        }

        if (mode === "bake") {
            state.ensureCanvasOpen?.();
            const targetLayerId = args.layerId || state.activeLayerId;
            const targetFrame = args.frame !== undefined ? Number(args.frame) : state.currentFrame;
            const baked = state.engine.bakeLayerFilters(state.canvasId, targetLayerId, targetFrame, sharedId);
            state.setStatus(`AI baked ${baked.filtersBaked} dynamic filter(s) on "${baked.layerId}".`);
            return { mode: "bake", ...baked };
        }

        if (mode === "remove") {
            state.ensureCanvasOpen?.();
            const targetTypeForRemove: "layer" | "object" | "shared_object" =
                resolvedTargetType === "canvas" ? "layer" : resolvedTargetType;
            const targetId =
                targetTypeForRemove === "object"
                    ? args.objectId || state.selectedObjectIds?.[0]
                    : targetTypeForRemove === "shared_object"
                      ? args.sharedObjectId || state.activeSharedObjectId
                      : args.layerId || state.activeLayerId;
            const remaining = state.engine.removeAttachedFilter(state.canvasId, {
                targetType: targetTypeForRemove,
                targetId,
                sharedObjectId: targetTypeForRemove === "shared_object" ? undefined : sharedId,
                filterId: args.attachedFilterId,
                filterType: args.filterType,
                clearAll: Boolean(args.clearAll)
            });
            return { mode: "remove", targetType: targetTypeForRemove, targetId, remainingFilters: remaining };
        }

        if (mode === "toggle_preview") {
            state.ensureCanvasOpen?.();
            const targetId =
                resolvedTargetType === "object"
                    ? args.objectId || state.selectedObjectIds?.[0]
                    : resolvedTargetType === "shared_object"
                      ? args.sharedObjectId || state.activeSharedObjectId
                      : args.layerId || state.activeLayerId;
            const enabled = state.engine.setTargetFiltersEnabled(state.canvasId, {
                targetType: resolvedTargetType,
                targetId,
                sharedObjectId: resolvedTargetType === "shared_object" ? undefined : sharedId,
                enabled: args.enabled
            });
            return { mode: "toggle_preview", targetType: resolvedTargetType, targetId, enabled };
        }

        if (mode === "list_attached") {
            state.ensureCanvasOpen?.();
            const targetTypeForList: "layer" | "object" | "shared_object" =
                resolvedTargetType === "canvas" ? "layer" : resolvedTargetType;
            const targetId =
                targetTypeForList === "object"
                    ? args.objectId || state.selectedObjectIds?.[0]
                    : targetTypeForList === "shared_object"
                      ? args.sharedObjectId || state.activeSharedObjectId
                      : args.layerId || state.activeLayerId;
            return state.engine.listAttachedFilters(state.canvasId, {
                targetType: targetTypeForList,
                targetId,
                sharedObjectId: targetTypeForList === "shared_object" ? undefined : sharedId
            });
        }

        const { layerId, sharedObjectId } = this.ensureTargetLayer(
            state,
            "raster",
            args.layerId,
            args.sharedObjectId
        );
        const targetFrame = args.frame !== undefined ? Number(args.frame) : state.currentFrame;
        const res = state.engine.rasterFilter(
            state.canvasId,
            layerId,
            {
                ...mergedParams,
                filterType: args.filterType || "gaussian_blur",
                frame: targetFrame
            },
            targetFrame,
            sharedObjectId
        );
        state.setStatus(`AI applied GIMP filter "${res.filterType}" on "${res.layerId}".`);
        return res;
    }
}
