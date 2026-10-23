import type { GimpFilterPreset } from "../runtime/gimp-js-internal-docs.js";
import { GAUSSIAN_BLUR_FILTER_PRESET } from "./gaussian-blur-filter-preset.js";
import { BOX_BLUR_FILTER_PRESET } from "./box-blur-filter-preset.js";
import { MEDIAN_BLUR_FILTER_PRESET } from "./median-blur-filter-preset.js";
import { PIXELIZE_FILTER_PRESET } from "./pixelize-filter-preset.js";
import { MOTION_BLUR_LINEAR_FILTER_PRESET } from "./motion-blur-linear-filter-preset.js";
import { MOTION_BLUR_CIRCULAR_FILTER_PRESET } from "./motion-blur-circular-filter-preset.js";
import { MOTION_BLUR_ZOOM_FILTER_PRESET } from "./motion-blur-zoom-filter-preset.js";
import { LENS_BLUR_FILTER_PRESET } from "./lens-blur-filter-preset.js";
import { SELECTIVE_GAUSSIAN_BLUR_FILTER_PRESET } from "./selective-gaussian-blur-filter-preset.js";
import { TILEABLE_BLUR_FILTER_PRESET } from "./tileable-blur-filter-preset.js";
import { SHARPEN_FILTER_PRESET } from "./sharpen-filter-preset.js";
import { HIGH_PASS_FILTER_PRESET } from "./high-pass-filter-preset.js";
import { DESPECKLE_FILTER_PRESET } from "./despeckle-filter-preset.js";
import { DESTRIPE_FILTER_PRESET } from "./destripe-filter-preset.js";
import { NL_FILTER_FILTER_PRESET } from "./nl-filter-filter-preset.js";
import { CONTRAST_RETINEX_FILTER_PRESET } from "./contrast-retinex-filter-preset.js";
import { RED_EYE_REMOVAL_FILTER_PRESET } from "./red-eye-removal-filter-preset.js";
import { DEINTERLACE_FILTER_PRESET } from "./deinterlace-filter-preset.js";
import { NOISE_REDUCTION_FILTER_PRESET } from "./noise-reduction-filter-preset.js";
import { WAVELET_DECOMPOSE_FILTER_PRESET } from "./wavelet-decompose-filter-preset.js";
import { BLINDS_FILTER_PRESET } from "./blinds-filter-preset.js";
import { RIPPLE_FILTER_PRESET } from "./ripple-filter-preset.js";
import { WAVES_FILTER_PRESET } from "./waves-filter-preset.js";
import { WHIRL_PINCH_FILTER_PRESET } from "./whirl-pinch-filter-preset.js";
import { SPHERIZE_FILTER_PRESET } from "./spherize-filter-preset.js";
import { POLAR_COORDINATES_FILTER_PRESET } from "./polar-coordinates-filter-preset.js";
import { KALEIDOSCOPE_FILTER_PRESET } from "./kaleidoscope-filter-preset.js";
import { MOSAIC_FILTER_PRESET } from "./mosaic-filter-preset.js";
import { WIND_FILTER_PRESET } from "./wind-filter-preset.js";
import { EMBOSS_FILTER_PRESET } from "./emboss-filter-preset.js";
import { ENGRAVE_FILTER_PRESET } from "./engrave-filter-preset.js";
import { NEWSPRINT_FILTER_PRESET } from "./newsprint-filter-preset.js";
import { VIDEO_DEGRADATION_FILTER_PRESET } from "./video-degradation-filter-preset.js";
import { SHIFT_FILTER_PRESET } from "./shift-filter-preset.js";
import { PAGECURL_FILTER_PRESET } from "./pagecurl-filter-preset.js";
import { CURVE_BEND_FILTER_PRESET } from "./curve-bend-filter-preset.js";
import { LENS_DISTORTION_FILTER_PRESET } from "./lens-distortion-filter-preset.js";
import { DROP_SHADOW_FILTER_PRESET } from "./drop-shadow-filter-preset.js";
import { LONG_SHADOW_FILTER_PRESET } from "./long-shadow-filter-preset.js";
import { VIGNETTE_FILTER_PRESET } from "./vignette-filter-preset.js";
import { BLOOM_FILTER_PRESET } from "./bloom-filter-preset.js";
import { SOFTGLOW_FILTER_PRESET } from "./softglow-filter-preset.js";
import { SUPERNOVA_FILTER_PRESET } from "./supernova-filter-preset.js";
import { LENS_FLARE_FILTER_PRESET } from "./lens-flare-filter-preset.js";
import { SPARKLE_FILTER_PRESET } from "./sparkle-filter-preset.js";
import { LIGHTING_EFFECTS_FILTER_PRESET } from "./lighting-effects-filter-preset.js";
import { GRADIENT_FLARE_FILTER_PRESET } from "./gradient-flare-filter-preset.js";
import { NOISE_RGB_FILTER_PRESET } from "./noise-rgb-filter-preset.js";
import { NOISE_HSV_FILTER_PRESET } from "./noise-hsv-filter-preset.js";
import { NOISE_HURL_FILTER_PRESET } from "./noise-hurl-filter-preset.js";
import { NOISE_PICK_FILTER_PRESET } from "./noise-pick-filter-preset.js";
import { NOISE_SLUR_FILTER_PRESET } from "./noise-slur-filter-preset.js";
import { NOISE_SPREAD_FILTER_PRESET } from "./noise-spread-filter-preset.js";
import { CIE_LCH_NOISE_FILTER_PRESET } from "./cie-lch-noise-filter-preset.js";
import { EDGE_SOBEL_FILTER_PRESET } from "./edge-sobel-filter-preset.js";
import { EDGE_LAPLACE_FILTER_PRESET } from "./edge-laplace-filter-preset.js";
import { EDGE_NEON_FILTER_PRESET } from "./edge-neon-filter-preset.js";
import { DIFFERENCE_OF_GAUSSIANS_FILTER_PRESET } from "./difference-of-gaussians-filter-preset.js";
import { IMAGE_GRADIENT_FILTER_PRESET } from "./image-gradient-filter-preset.js";
import { OILIFY_FILTER_PRESET } from "./oilify-filter-preset.js";
import { CARTOON_FILTER_PRESET } from "./cartoon-filter-preset.js";
import { PHOTOCOPY_FILTER_PRESET } from "./photocopy-filter-preset.js";
import { CUBISM_FILTER_PRESET } from "./cubism-filter-preset.js";
import { WATERPIXELS_FILTER_PRESET } from "./waterpixels-filter-preset.js";
import { VAN_GOGH_LIC_FILTER_PRESET } from "./van-gogh-lic-filter-preset.js";
import { APPLY_CANVAS_FILTER_PRESET } from "./apply-canvas-filter-preset.js";
import { CLOTHIFY_FILTER_PRESET } from "./clothify-filter-preset.js";
import { WEAVE_FILTER_PRESET } from "./weave-filter-preset.js";
import { GLASS_TILE_FILTER_PRESET } from "./glass-tile-filter-preset.js";
import { PREDATOR_FILTER_PRESET } from "./predator-filter-preset.js";
import { FILMSTRIP_FILTER_PRESET } from "./filmstrip-filter-preset.js";
import { DEPTH_MERGE_FILTER_PRESET } from "./depth-merge-filter-preset.js";
import { CONVOLUTION_MATRIX_FILTER_PRESET } from "./convolution-matrix-filter-preset.js";
import { DILATE_FILTER_PRESET } from "./dilate-filter-preset.js";
import { ERODE_FILTER_PRESET } from "./erode-filter-preset.js";
import { DISTANCE_MAP_FILTER_PRESET } from "./distance-map-filter-preset.js";
import { NORMAL_MAP_FILTER_PRESET } from "./normal-map-filter-preset.js";
import { BUMP_MAP_FILTER_PRESET } from "./bump-map-filter-preset.js";
import { DISPLACE_FILTER_PRESET } from "./displace-filter-preset.js";
import { FRACTAL_TRACE_FILTER_PRESET } from "./fractal-trace-filter-preset.js";
import { ILLUSION_FILTER_PRESET } from "./illusion-filter-preset.js";
import { LITTLE_PLANET_FILTER_PRESET } from "./little-planet-filter-preset.js";
import { MAKE_SEAMLESS_FILTER_PRESET } from "./make-seamless-filter-preset.js";
import { TILE_SMALL_FILTER_PRESET } from "./tile-small-filter-preset.js";
import { WARP_CURL_FILTER_PRESET } from "./warp-curl-filter-preset.js";
import { PLASMA_FILTER_PRESET } from "./plasma-filter-preset.js";
import { PERLIN_NOISE_FILTER_PRESET } from "./perlin-noise-filter-preset.js";
import { SIMPLEX_NOISE_FILTER_PRESET } from "./simplex-noise-filter-preset.js";
import { CELL_NOISE_FILTER_PRESET } from "./cell-noise-filter-preset.js";
import { CHECKERBOARD_FILTER_PRESET } from "./checkerboard-filter-preset.js";
import { GRID_RENDER_FILTER_PRESET } from "./grid-render-filter-preset.js";
import { MAZE_FILTER_PRESET } from "./maze-filter-preset.js";
import { SINUS_FILTER_PRESET } from "./sinus-filter-preset.js";
import { SPIRAL_FILTER_PRESET } from "./spiral-filter-preset.js";
import { BAYER_MATRIX_FILTER_PRESET } from "./bayer-matrix-filter-preset.js";
import { FRACTAL_EXPLORER_FILTER_PRESET } from "./fractal-explorer-filter-preset.js";
import { CML_EXPLORER_FILTER_PRESET } from "./cml-explorer-filter-preset.js";
import { QBIST_FILTER_PRESET } from "./qbist-filter-preset.js";
import { SPHERE_DESIGNER_FILTER_PRESET } from "./sphere-designer-filter-preset.js";
import { JIGSAW_FILTER_PRESET } from "./jigsaw-filter-preset.js";
import { FLAME_FILTER_PRESET } from "./flame-filter-preset.js";
import { INVERT_FILTER_PRESET } from "./invert-filter-preset.js";
import { VALUE_INVERT_FILTER_PRESET } from "./value-invert-filter-preset.js";
import { THRESHOLD_FILTER_PRESET } from "./threshold-filter-preset.js";
import { BRIGHTNESS_CONTRAST_FILTER_PRESET } from "./brightness-contrast-filter-preset.js";
import { POSTERIZE_FILTER_PRESET } from "./posterize-filter-preset.js";
import { SEPIA_FILTER_PRESET } from "./sepia-filter-preset.js";
import { ALIEN_MAP_FILTER_PRESET } from "./alien-map-filter-preset.js";
import { COLOR_TO_ALPHA_FILTER_PRESET } from "./color-to-alpha-filter-preset.js";
import { HOT_PIXELS_FILTER_PRESET } from "./hot-pixels-filter-preset.js";
import { SAMPLE_COLORIZE_FILTER_PRESET } from "./sample-colorize-filter-preset.js";
import { BORDER_AVERAGE_FILTER_PRESET } from "./border-average-filter-preset.js";
import { ADD_BEVEL_FILTER_PRESET } from "./add-bevel-filter-preset.js";
import { ADD_BORDER_FILTER_PRESET } from "./add-border-filter-preset.js";
import { COFFEE_STAIN_FILTER_PRESET } from "./coffee-stain-filter-preset.js";
import { FUZZY_BORDER_FILTER_PRESET } from "./fuzzy-border-filter-preset.js";
import { OLD_PHOTO_FILTER_PRESET } from "./old-photo-filter-preset.js";
import { ROUND_CORNERS_FILTER_PRESET } from "./round-corners-filter-preset.js";
import { SLIDE_FRAME_FILTER_PRESET } from "./slide-frame-filter-preset.js";
import { STENCIL_CARVE_FILTER_PRESET } from "./stencil-carve-filter-preset.js";
import { STENCIL_CHROME_FILTER_PRESET } from "./stencil-chrome-filter-preset.js";

export {
    GAUSSIAN_BLUR_FILTER_PRESET,
    BOX_BLUR_FILTER_PRESET,
    MEDIAN_BLUR_FILTER_PRESET,
    PIXELIZE_FILTER_PRESET,
    MOTION_BLUR_LINEAR_FILTER_PRESET,
    MOTION_BLUR_CIRCULAR_FILTER_PRESET,
    MOTION_BLUR_ZOOM_FILTER_PRESET,
    LENS_BLUR_FILTER_PRESET,
    SELECTIVE_GAUSSIAN_BLUR_FILTER_PRESET,
    TILEABLE_BLUR_FILTER_PRESET,
    SHARPEN_FILTER_PRESET,
    HIGH_PASS_FILTER_PRESET,
    DESPECKLE_FILTER_PRESET,
    DESTRIPE_FILTER_PRESET,
    NL_FILTER_FILTER_PRESET,
    CONTRAST_RETINEX_FILTER_PRESET,
    RED_EYE_REMOVAL_FILTER_PRESET,
    DEINTERLACE_FILTER_PRESET,
    NOISE_REDUCTION_FILTER_PRESET,
    WAVELET_DECOMPOSE_FILTER_PRESET,
    BLINDS_FILTER_PRESET,
    RIPPLE_FILTER_PRESET,
    WAVES_FILTER_PRESET,
    WHIRL_PINCH_FILTER_PRESET,
    SPHERIZE_FILTER_PRESET,
    POLAR_COORDINATES_FILTER_PRESET,
    KALEIDOSCOPE_FILTER_PRESET,
    MOSAIC_FILTER_PRESET,
    WIND_FILTER_PRESET,
    EMBOSS_FILTER_PRESET,
    ENGRAVE_FILTER_PRESET,
    NEWSPRINT_FILTER_PRESET,
    VIDEO_DEGRADATION_FILTER_PRESET,
    SHIFT_FILTER_PRESET,
    PAGECURL_FILTER_PRESET,
    CURVE_BEND_FILTER_PRESET,
    LENS_DISTORTION_FILTER_PRESET,
    DROP_SHADOW_FILTER_PRESET,
    LONG_SHADOW_FILTER_PRESET,
    VIGNETTE_FILTER_PRESET,
    BLOOM_FILTER_PRESET,
    SOFTGLOW_FILTER_PRESET,
    SUPERNOVA_FILTER_PRESET,
    LENS_FLARE_FILTER_PRESET,
    SPARKLE_FILTER_PRESET,
    LIGHTING_EFFECTS_FILTER_PRESET,
    GRADIENT_FLARE_FILTER_PRESET,
    NOISE_RGB_FILTER_PRESET,
    NOISE_HSV_FILTER_PRESET,
    NOISE_HURL_FILTER_PRESET,
    NOISE_PICK_FILTER_PRESET,
    NOISE_SLUR_FILTER_PRESET,
    NOISE_SPREAD_FILTER_PRESET,
    CIE_LCH_NOISE_FILTER_PRESET,
    EDGE_SOBEL_FILTER_PRESET,
    EDGE_LAPLACE_FILTER_PRESET,
    EDGE_NEON_FILTER_PRESET,
    DIFFERENCE_OF_GAUSSIANS_FILTER_PRESET,
    IMAGE_GRADIENT_FILTER_PRESET,
    OILIFY_FILTER_PRESET,
    CARTOON_FILTER_PRESET,
    PHOTOCOPY_FILTER_PRESET,
    CUBISM_FILTER_PRESET,
    WATERPIXELS_FILTER_PRESET,
    VAN_GOGH_LIC_FILTER_PRESET,
    APPLY_CANVAS_FILTER_PRESET,
    CLOTHIFY_FILTER_PRESET,
    WEAVE_FILTER_PRESET,
    GLASS_TILE_FILTER_PRESET,
    PREDATOR_FILTER_PRESET,
    FILMSTRIP_FILTER_PRESET,
    DEPTH_MERGE_FILTER_PRESET,
    CONVOLUTION_MATRIX_FILTER_PRESET,
    DILATE_FILTER_PRESET,
    ERODE_FILTER_PRESET,
    DISTANCE_MAP_FILTER_PRESET,
    NORMAL_MAP_FILTER_PRESET,
    BUMP_MAP_FILTER_PRESET,
    DISPLACE_FILTER_PRESET,
    FRACTAL_TRACE_FILTER_PRESET,
    ILLUSION_FILTER_PRESET,
    LITTLE_PLANET_FILTER_PRESET,
    MAKE_SEAMLESS_FILTER_PRESET,
    TILE_SMALL_FILTER_PRESET,
    WARP_CURL_FILTER_PRESET,
    PLASMA_FILTER_PRESET,
    PERLIN_NOISE_FILTER_PRESET,
    SIMPLEX_NOISE_FILTER_PRESET,
    CELL_NOISE_FILTER_PRESET,
    CHECKERBOARD_FILTER_PRESET,
    GRID_RENDER_FILTER_PRESET,
    MAZE_FILTER_PRESET,
    SINUS_FILTER_PRESET,
    SPIRAL_FILTER_PRESET,
    BAYER_MATRIX_FILTER_PRESET,
    FRACTAL_EXPLORER_FILTER_PRESET,
    CML_EXPLORER_FILTER_PRESET,
    QBIST_FILTER_PRESET,
    SPHERE_DESIGNER_FILTER_PRESET,
    JIGSAW_FILTER_PRESET,
    FLAME_FILTER_PRESET,
    INVERT_FILTER_PRESET,
    VALUE_INVERT_FILTER_PRESET,
    THRESHOLD_FILTER_PRESET,
    BRIGHTNESS_CONTRAST_FILTER_PRESET,
    POSTERIZE_FILTER_PRESET,
    SEPIA_FILTER_PRESET,
    ALIEN_MAP_FILTER_PRESET,
    COLOR_TO_ALPHA_FILTER_PRESET,
    HOT_PIXELS_FILTER_PRESET,
    SAMPLE_COLORIZE_FILTER_PRESET,
    BORDER_AVERAGE_FILTER_PRESET,
    ADD_BEVEL_FILTER_PRESET,
    ADD_BORDER_FILTER_PRESET,
    COFFEE_STAIN_FILTER_PRESET,
    FUZZY_BORDER_FILTER_PRESET,
    OLD_PHOTO_FILTER_PRESET,
    ROUND_CORNERS_FILTER_PRESET,
    SLIDE_FRAME_FILTER_PRESET,
    STENCIL_CARVE_FILTER_PRESET,
    STENCIL_CHROME_FILTER_PRESET
};

export const BUILT_IN_GIMP_FILTER_PRESETS: GimpFilterPreset[] = [
    GAUSSIAN_BLUR_FILTER_PRESET,
    BOX_BLUR_FILTER_PRESET,
    MEDIAN_BLUR_FILTER_PRESET,
    PIXELIZE_FILTER_PRESET,
    MOTION_BLUR_LINEAR_FILTER_PRESET,
    MOTION_BLUR_CIRCULAR_FILTER_PRESET,
    MOTION_BLUR_ZOOM_FILTER_PRESET,
    LENS_BLUR_FILTER_PRESET,
    SELECTIVE_GAUSSIAN_BLUR_FILTER_PRESET,
    TILEABLE_BLUR_FILTER_PRESET,
    SHARPEN_FILTER_PRESET,
    HIGH_PASS_FILTER_PRESET,
    DESPECKLE_FILTER_PRESET,
    DESTRIPE_FILTER_PRESET,
    NL_FILTER_FILTER_PRESET,
    CONTRAST_RETINEX_FILTER_PRESET,
    RED_EYE_REMOVAL_FILTER_PRESET,
    DEINTERLACE_FILTER_PRESET,
    NOISE_REDUCTION_FILTER_PRESET,
    WAVELET_DECOMPOSE_FILTER_PRESET,
    BLINDS_FILTER_PRESET,
    RIPPLE_FILTER_PRESET,
    WAVES_FILTER_PRESET,
    WHIRL_PINCH_FILTER_PRESET,
    SPHERIZE_FILTER_PRESET,
    POLAR_COORDINATES_FILTER_PRESET,
    KALEIDOSCOPE_FILTER_PRESET,
    MOSAIC_FILTER_PRESET,
    WIND_FILTER_PRESET,
    EMBOSS_FILTER_PRESET,
    ENGRAVE_FILTER_PRESET,
    NEWSPRINT_FILTER_PRESET,
    VIDEO_DEGRADATION_FILTER_PRESET,
    SHIFT_FILTER_PRESET,
    PAGECURL_FILTER_PRESET,
    CURVE_BEND_FILTER_PRESET,
    LENS_DISTORTION_FILTER_PRESET,
    DROP_SHADOW_FILTER_PRESET,
    LONG_SHADOW_FILTER_PRESET,
    VIGNETTE_FILTER_PRESET,
    BLOOM_FILTER_PRESET,
    SOFTGLOW_FILTER_PRESET,
    SUPERNOVA_FILTER_PRESET,
    LENS_FLARE_FILTER_PRESET,
    SPARKLE_FILTER_PRESET,
    LIGHTING_EFFECTS_FILTER_PRESET,
    GRADIENT_FLARE_FILTER_PRESET,
    NOISE_RGB_FILTER_PRESET,
    NOISE_HSV_FILTER_PRESET,
    NOISE_HURL_FILTER_PRESET,
    NOISE_PICK_FILTER_PRESET,
    NOISE_SLUR_FILTER_PRESET,
    NOISE_SPREAD_FILTER_PRESET,
    CIE_LCH_NOISE_FILTER_PRESET,
    EDGE_SOBEL_FILTER_PRESET,
    EDGE_LAPLACE_FILTER_PRESET,
    EDGE_NEON_FILTER_PRESET,
    DIFFERENCE_OF_GAUSSIANS_FILTER_PRESET,
    IMAGE_GRADIENT_FILTER_PRESET,
    OILIFY_FILTER_PRESET,
    CARTOON_FILTER_PRESET,
    PHOTOCOPY_FILTER_PRESET,
    CUBISM_FILTER_PRESET,
    WATERPIXELS_FILTER_PRESET,
    VAN_GOGH_LIC_FILTER_PRESET,
    APPLY_CANVAS_FILTER_PRESET,
    CLOTHIFY_FILTER_PRESET,
    WEAVE_FILTER_PRESET,
    GLASS_TILE_FILTER_PRESET,
    PREDATOR_FILTER_PRESET,
    FILMSTRIP_FILTER_PRESET,
    DEPTH_MERGE_FILTER_PRESET,
    CONVOLUTION_MATRIX_FILTER_PRESET,
    DILATE_FILTER_PRESET,
    ERODE_FILTER_PRESET,
    DISTANCE_MAP_FILTER_PRESET,
    NORMAL_MAP_FILTER_PRESET,
    BUMP_MAP_FILTER_PRESET,
    DISPLACE_FILTER_PRESET,
    FRACTAL_TRACE_FILTER_PRESET,
    ILLUSION_FILTER_PRESET,
    LITTLE_PLANET_FILTER_PRESET,
    MAKE_SEAMLESS_FILTER_PRESET,
    TILE_SMALL_FILTER_PRESET,
    WARP_CURL_FILTER_PRESET,
    PLASMA_FILTER_PRESET,
    PERLIN_NOISE_FILTER_PRESET,
    SIMPLEX_NOISE_FILTER_PRESET,
    CELL_NOISE_FILTER_PRESET,
    CHECKERBOARD_FILTER_PRESET,
    GRID_RENDER_FILTER_PRESET,
    MAZE_FILTER_PRESET,
    SINUS_FILTER_PRESET,
    SPIRAL_FILTER_PRESET,
    BAYER_MATRIX_FILTER_PRESET,
    FRACTAL_EXPLORER_FILTER_PRESET,
    CML_EXPLORER_FILTER_PRESET,
    QBIST_FILTER_PRESET,
    SPHERE_DESIGNER_FILTER_PRESET,
    JIGSAW_FILTER_PRESET,
    FLAME_FILTER_PRESET,
    INVERT_FILTER_PRESET,
    VALUE_INVERT_FILTER_PRESET,
    THRESHOLD_FILTER_PRESET,
    BRIGHTNESS_CONTRAST_FILTER_PRESET,
    POSTERIZE_FILTER_PRESET,
    SEPIA_FILTER_PRESET,
    ALIEN_MAP_FILTER_PRESET,
    COLOR_TO_ALPHA_FILTER_PRESET,
    HOT_PIXELS_FILTER_PRESET,
    SAMPLE_COLORIZE_FILTER_PRESET,
    BORDER_AVERAGE_FILTER_PRESET,
    ADD_BEVEL_FILTER_PRESET,
    ADD_BORDER_FILTER_PRESET,
    COFFEE_STAIN_FILTER_PRESET,
    FUZZY_BORDER_FILTER_PRESET,
    OLD_PHOTO_FILTER_PRESET,
    ROUND_CORNERS_FILTER_PRESET,
    SLIDE_FRAME_FILTER_PRESET,
    STENCIL_CARVE_FILTER_PRESET,
    STENCIL_CHROME_FILTER_PRESET
];
