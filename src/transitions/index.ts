export { type RasterBlendPreset, RASTER_TRANSITION_CATEGORIES } from "./transition-types.js";
import type { RasterBlendPreset } from "./transition-types.js";
import { CROSSFADE_TRANSITION } from "./crossfade-transition.js";
import { STEP_HOLD_TRANSITION } from "./step-hold-transition.js";
import { PIXEL_DISSOLVE_TRANSITION } from "./pixel-dissolve-transition.js";
import { DIRECTIONAL_WIPE_TRANSITION } from "./directional-wipe-transition.js";
import { LUMA_WIPE_TRANSITION } from "./luma-wipe-transition.js";
import { VENETIAN_BLINDS_WIPE_TRANSITION } from "./venetian-blinds-wipe-transition.js";
import { CLOCK_SWEEP_TRANSITION } from "./clock-sweep-transition.js";
import { RADIAL_IRIS_TRANSITION } from "./radial-iris-transition.js";
import { CHECKERBOARD_REVEAL_TRANSITION } from "./checkerboard-reveal-transition.js";
import { ADDITIVE_GLOW_TRANSITION } from "./additive-glow-transition.js";
import { CHROMATIC_MORPH_TRANSITION } from "./chromatic-morph-transition.js";
import { BURN_EXPOSURE_TRANSITION } from "./burn-exposure-transition.js";
import { RIPPLE_WARP_TRANSITION } from "./ripple-warp-transition.js";
import { ZOOM_CROSS_BLUR_TRANSITION } from "./zoom-cross-blur-transition.js";

export {
    CROSSFADE_TRANSITION,
    STEP_HOLD_TRANSITION,
    PIXEL_DISSOLVE_TRANSITION,
    DIRECTIONAL_WIPE_TRANSITION,
    LUMA_WIPE_TRANSITION,
    VENETIAN_BLINDS_WIPE_TRANSITION,
    CLOCK_SWEEP_TRANSITION,
    RADIAL_IRIS_TRANSITION,
    CHECKERBOARD_REVEAL_TRANSITION,
    ADDITIVE_GLOW_TRANSITION,
    CHROMATIC_MORPH_TRANSITION,
    BURN_EXPOSURE_TRANSITION,
    RIPPLE_WARP_TRANSITION,
    ZOOM_CROSS_BLUR_TRANSITION
};

export const BUILT_IN_RASTER_BLEND_PRESETS: RasterBlendPreset[] = [
    CROSSFADE_TRANSITION,
    STEP_HOLD_TRANSITION,
    PIXEL_DISSOLVE_TRANSITION,
    DIRECTIONAL_WIPE_TRANSITION,
    LUMA_WIPE_TRANSITION,
    VENETIAN_BLINDS_WIPE_TRANSITION,
    CLOCK_SWEEP_TRANSITION,
    RADIAL_IRIS_TRANSITION,
    CHECKERBOARD_REVEAL_TRANSITION,
    ADDITIVE_GLOW_TRANSITION,
    CHROMATIC_MORPH_TRANSITION,
    BURN_EXPOSURE_TRANSITION,
    RIPPLE_WARP_TRANSITION,
    ZOOM_CROSS_BLUR_TRANSITION
];
