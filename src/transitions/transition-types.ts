export interface RasterBlendPreset {
    id: string;
    name: string;
    /** Folder category (e.g. "Dissolve & Fade", "Wipe & Sweep", "Iris & Geometric", "Light & Chromatic", "Displacement & Optical", "Custom", or slash-delimited folder path) */
    category?: string;
    description: string;
    /**
     * JavaScript source code executed to blend between two raster keyframes (`bufA` and `bufB`).
     * Available parameters in scope:
     * - `bufA`: Uint8Array (RGBA start keyframe pixels, length = width * height * 4)
     * - `bufB`: Uint8Array (RGBA end keyframe pixels, length = width * height * 4)
     * - `outBuf`: Uint8Array (RGBA output buffer to populate)
     * - `width`: number (canvas/layer pixel width)
     * - `height`: number (canvas/layer pixel height)
     * - `t`: number (curve-eased interpolation factor in [0, 1])
     * - `rawT`: number (linear un-eased factor in [0, 1])
     * - `helpers`, `gimp`, `gegl`: Full internal function libraries
     */
    code: string;
    builtIn?: boolean;
}

export const RASTER_TRANSITION_CATEGORIES: string[] = [
    "Dissolve & Fade",
    "Wipe & Sweep",
    "Iris & Geometric",
    "Light & Chromatic",
    "Displacement & Optical",
    "Custom"
];
