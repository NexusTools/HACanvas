import type { FilterParameterSchema } from "../abstract-raster-filter-base.js";

/**
 * Documentation metadata for internal functions and scope variables available inside
 * HAEditor's JavaScript Filter Studio and Raster Transition Blend JS Editor.
 * Supports Modifier+Click (`Ctrl+Click` / `Cmd+Click` / `Alt+Click`) IDE inspection.
 */
export interface GimpJsInternalDoc {
    symbol: string;
    namespace: "helpers" | "gimp" | "gegl" | "scope";
    signature: string;
    summary: string;
    details: string;
    gimpSourceRef?: string;
    example: string;
}

export interface GimpFilterPreset {
    id: string;
    name: string;
    /** Folder category (e.g. "Blur", "Enhance", "Distorts", "Light and Shadow", "Noise", "Edge-Detect", "Artistic", "Combine", "Generic", "Map", "Render", "Colors", "Decor", "Custom", or slash-delimited folder path) */
    category: string;
    description: string;
    /** Corresponding GIMP PDB / GEGL operation name from GIMP's C source */
    gimpProcedure?: string;
    parameterSchemas: FilterParameterSchema[];
    /** Full human-readable, editable JavaScript source code for this filter */
    code: string;
    builtIn?: boolean;
}

export type GimpFilterCategory = string;

export const GIMP_FILTER_CATEGORIES: string[] = [
    "Blur",
    "Enhance",
    "Distorts",
    "Light and Shadow",
    "Noise",
    "Edge-Detect",
    "Artistic",
    "Combine",
    "Generic",
    "Map",
    "Render",
    "Colors",
    "Decor",
    "Custom"
];

export const RASTER_TRANSITION_CATEGORIES: string[] = [
    "Dissolve & Fade",
    "Wipe & Sweep",
    "Iris & Geometric",
    "Light & Chromatic",
    "Displacement & Optical",
    "Custom"
];

export const GIMP_JS_INTERNAL_DOCS: Record<string, GimpJsInternalDoc> = {
    "srcBuf": {
        symbol: "srcBuf",
        namespace: "scope",
        signature: "const srcBuf: Uint8Array",
        summary: "Read-only input RGBA pixel buffer (length = width * height * 4).",
        details: "Contains 8-bit unsigned [R, G, B, A] channels in row-major order: index = (y * width + x) * 4.",
        gimpSourceRef: "GeglBuffer *input (app/operations/)",
        example: "const idx = (y * width + x) * 4;\nconst r = srcBuf[idx], g = srcBuf[idx + 1], b = srcBuf[idx + 2], a = srcBuf[idx + 3];"
    },
    "outBuf": {
        symbol: "outBuf",
        namespace: "scope",
        signature: "const outBuf: Uint8Array",
        summary: "Destination RGBA pixel buffer to populate (length = width * height * 4).",
        details: "Pre-initialized with a copy of srcBuf for filters (or zeros for transitions). Write modified [R, G, B, A] bytes into outBuf.",
        gimpSourceRef: "GeglBuffer *output (app/operations/)",
        example: "outBuf[idx] = helpers.clamp255(r);\noutBuf[idx + 1] = helpers.clamp255(g);\noutBuf[idx + 2] = helpers.clamp255(b);\noutBuf[idx + 3] = a;"
    },
    "bufA": {
        symbol: "bufA",
        namespace: "scope",
        signature: "const bufA: Uint8Array",
        summary: "Start keyframe RGBA pixel buffer for raster keyframe transitions.",
        details: "Contains the source raster cel pixels at t = 0.0 (length = width * height * 4).",
        example: "const rA = bufA[i], gA = bufA[i + 1], bA = bufA[i + 2], aA = bufA[i + 3];"
    },
    "bufB": {
        symbol: "bufB",
        namespace: "scope",
        signature: "const bufB: Uint8Array",
        summary: "End keyframe RGBA pixel buffer for raster keyframe transitions.",
        details: "Contains the target raster cel pixels at t = 1.0 (length = width * height * 4).",
        example: "const rB = bufB[i], gB = bufB[i + 1], bB = bufB[i + 2], aB = bufB[i + 3];"
    },
    "width": {
        symbol: "width",
        namespace: "scope",
        signature: "const width: number",
        summary: "Pixel width of the layer or canvas buffer.",
        details: "Integer width in pixels. Row stride in bytes is width * 4.",
        example: "for (let x = 0; x < width; x++) { /* ... */ }"
    },
    "height": {
        symbol: "height",
        namespace: "scope",
        signature: "const height: number",
        summary: "Pixel height of the layer or canvas buffer.",
        details: "Integer height in pixels. Total pixel count is width * height.",
        example: "for (let y = 0; y < height; y++) { /* ... */ }"
    },
    "params": {
        symbol: "params",
        namespace: "scope",
        signature: "const params: Record<string, any>",
        summary: "Dictionary of user/AI parameter values for the filter.",
        details: "Merged from the filter preset's parameterSchemas default values and any runtime overrides.",
        example: "const radius = Number(params.radius ?? 4);"
    },
    "selection": {
        symbol: "selection",
        namespace: "scope",
        signature: "const selection: SelectionMaskSpec | undefined",
        summary: "Active canvas selection mask descriptor (`none`, `rect`, `ellipse`).",
        details: "Pass to `helpers.isSelected(selection, x, y)` to respect active selections.",
        example: "if (!helpers.isSelected(selection, x, y)) continue;"
    },
    "t": {
        symbol: "t",
        namespace: "scope",
        signature: "const t: number",
        summary: "Curve-eased transition interpolation factor (typically in [0, 1]).",
        details: "Evaluated through the keyframe's easing or custom cubic-Bezier curve.",
        example: "const k = helpers.clamp01(t);"
    },
    "rawT": {
        symbol: "rawT",
        namespace: "scope",
        signature: "const rawT: number",
        summary: "Un-eased linear time progress in [0, 1] between start and end keyframes.",
        details: "Useful when a transition script wants linear timing alongside curve-eased `t`.",
        example: "const linearProgress = rawT;"
    },
    "helpers.clamp": {
        symbol: "helpers.clamp",
        namespace: "helpers",
        signature: "helpers.clamp(v: number, min: number, max: number): number",
        summary: "Clamps a numeric value `v` into the inclusive range `[min, max]`.",
        details: "Equivalent to GIMP's `CLAMP(v, min, max)` macro in GLib/GIMP C source.",
        gimpSourceRef: "CLAMP(x, low, high) in glib/gmacros.h",
        example: "const safeRadius = helpers.clamp(Number(params.radius ?? 5), 1, 50);"
    },
    "helpers.clamp01": {
        symbol: "helpers.clamp01",
        namespace: "helpers",
        signature: "helpers.clamp01(v: number): number",
        summary: "Clamps a floating-point value into `[0.0, 1.0]`.",
        details: "Fast normalized clamping for blend factors, UVs, and alpha weights.",
        gimpSourceRef: "CLAMP(x, 0.0, 1.0)",
        example: "const alpha = helpers.clamp01(rawAlpha);"
    },
    "helpers.clamp255": {
        symbol: "helpers.clamp255",
        namespace: "helpers",
        signature: "helpers.clamp255(v: number): number",
        summary: "Rounds and clamps a channel value into an 8-bit integer `[0, 255]`.",
        details: "Equivalent to GIMP's `ROUND_CLAMP_U8` for writing into RGBA byte buffers.",
        gimpSourceRef: "GIMP_CLAMP_U8(v)",
        example: "outBuf[idx] = helpers.clamp255(r * 1.2);"
    },
    "helpers.lerp": {
        symbol: "helpers.lerp",
        namespace: "helpers",
        signature: "helpers.lerp(a: number, b: number, t: number): number",
        summary: "Linearly interpolates between `a` and `b` by factor `t` (`a + (b - a) * t`).",
        details: "Used for color mixing, coordinate morphing, and filter wet/dry blending.",
        example: "const mixed = helpers.lerp(srcBuf[idx], blurred[idx], mixAmount);"
    },
    "helpers.smoothstep": {
        symbol: "helpers.smoothstep",
        namespace: "helpers",
        signature: "helpers.smoothstep(edge0: number, edge1: number, x: number): number",
        summary: "Hermite cubic smooth interpolation `3k^2 - 2k^3` between `edge0` and `edge1`.",
        details: "Creates smooth feathered transitions for wipes, vignettes, soft masks, and bevels.",
        example: "const mask = helpers.smoothstep(0.2, 0.8, distNorm);"
    },
    "helpers.hash2d": {
        symbol: "helpers.hash2d",
        namespace: "helpers",
        signature: "helpers.hash2d(x: number, y: number, seed?: number): number",
        summary: "Deterministic 2D spatial pseudo-random hash in `[0.0, 1.0)`.",
        details: "Reproducible per-pixel random generator used for noise, dithering, hurl, pick, and dissolve.",
        gimpSourceRef: "GRand / gegl_random_float_range (gegl-random.c)",
        example: "const rnd = helpers.hash2d(x, y, Number(params.seed ?? 42));"
    },
    "helpers.perlin2d": {
        symbol: "helpers.perlin2d",
        namespace: "helpers",
        signature: "helpers.perlin2d(x: number, y: number, seed?: number): number",
        summary: "2D gradient Perlin noise returning smooth values in `[-1.0, 1.0]`.",
        details: "Replicates GEGL's `gegl:perlin-noise` lattice gradient interpolation with quintic fade curve.",
        gimpSourceRef: "operations/common/perlin-noise.c (GEGL)",
        example: "const n = helpers.perlin2d(x * 0.05, y * 0.05, seed) * 0.5 + 0.5;"
    },
    "helpers.simplex2d": {
        symbol: "helpers.simplex2d",
        namespace: "helpers",
        signature: "helpers.simplex2d(x: number, y: number, seed?: number): number",
        summary: "2D triangular lattice Simplex noise returning values in `[-1.0, 1.0]`.",
        details: "Replicates GEGL's `gegl:simplex-noise` isotropic 2D noise generator.",
        gimpSourceRef: "operations/common/simplex-noise.c (GEGL)",
        example: "const val = (helpers.simplex2d(x / scale, y / scale, seed) + 1) * 127.5;"
    },
    "helpers.fbm2d": {
        symbol: "helpers.fbm2d",
        namespace: "helpers",
        signature: "helpers.fbm2d(x: number, y: number, octaves?: number, persistence?: number, lacunarity?: number, seed?: number): number",
        summary: "Multi-octave Fractal Brownian Motion (fBm) noise normalized to `[0.0, 1.0]`.",
        details: "Sums `octaves` layers of Perlin noise with amplitude decay `persistence` and frequency multiplier `lacunarity`.",
        gimpSourceRef: "plug-ins/common/noise-solid.c & gegl:perlin-noise",
        example: "const cloud = helpers.fbm2d(x * 0.02, y * 0.02, 4, 0.5, 2.0, seed);"
    },
    "helpers.voronoi2d": {
        symbol: "helpers.voronoi2d",
        namespace: "helpers",
        signature: "helpers.voronoi2d(x: number, y: number, jitter?: number, seed?: number): { f1: number; f2: number; cellX: number; cellY: number; id: number }",
        summary: "Worley / Voronoi cellular distance evaluator (`f1` nearest, `f2` second-nearest).",
        details: "Replicates `gegl:cell-noise`, `gegl:mosaic`, and `gegl:waterpixels` cellular partitioning.",
        gimpSourceRef: "operations/common/cell-noise.c & mosaic.c",
        example: "const cell = helpers.voronoi2d(x / 20, y / 20, 0.85, seed);\nconst edge = cell.f2 - cell.f1;"
    },
    "helpers.getPixel": {
        symbol: "helpers.getPixel",
        namespace: "helpers",
        signature: "helpers.getPixel(buf: Uint8Array, width: number, height: number, x: number, y: number): [number, number, number, number]",
        summary: "Reads `[R, G, B, A]` at `(x, y)` with edge-clamped coordinates.",
        details: "Automatically clamps `x` to `[0, width-1]` and `y` to `[0, height-1]` (GIMP `GEGL_ABYSS_CLAMP`).",
        gimpSourceRef: "gegl_buffer_sample / GEGL_ABYSS_CLAMP",
        example: "const [r, g, b, a] = helpers.getPixel(srcBuf, width, height, x - 1, y + 1);"
    },
    "helpers.getPixelWrap": {
        symbol: "helpers.getPixelWrap",
        namespace: "helpers",
        signature: "helpers.getPixelWrap(buf: Uint8Array, width: number, height: number, x: number, y: number): [number, number, number, number]",
        summary: "Reads `[R, G, B, A]` at `(x, y)` with periodic wrap-around coordinates.",
        details: "Wraps coordinates modulo `(width, height)` (`GEGL_ABYSS_LOOP`), ideal for seamless tiles and shift/ripple.",
        gimpSourceRef: "GEGL_ABYSS_LOOP",
        example: "const [r, g, b, a] = helpers.getPixelWrap(srcBuf, width, height, x + dx, y + dy);"
    },
    "helpers.setPixel": {
        symbol: "helpers.setPixel",
        namespace: "helpers",
        signature: "helpers.setPixel(buf: Uint8Array, width: number, height: number, x: number, y: number, r: number, g: number, b: number, a: number): void",
        summary: "Writes clamped `[R, G, B, A]` bytes at integer coordinate `(x, y)`.",
        details: "Safely ignores out-of-bounds coordinates and clamps channels to `[0, 255]`.",
        example: "helpers.setPixel(outBuf, width, height, x, y, r, g, b, a);"
    },
    "helpers.sampleBilinear": {
        symbol: "helpers.sampleBilinear",
        namespace: "helpers",
        signature: "helpers.sampleBilinear(buf: Uint8Array, width: number, height: number, u: number, v: number, wrap?: boolean): [number, number, number, number]",
        summary: "Bilinearly interpolates `[R, G, B, A]` at sub-pixel coordinates `(u, v)`.",
        details: "Replicates GIMP's `gimp_bilinear_rgba` sampler used in Distorts (`whirl-pinch`, `ripple`, `waves`, `spherize`, `polar-coordinates`, `pagecurl`, `curve-bend`).",
        gimpSourceRef: "libgimpmath/gimpbilinear.c (gimp_bilinear_rgba)",
        example: "const [r, g, b, a] = helpers.sampleBilinear(srcBuf, width, height, srcX, srcY, false);"
    },
    "helpers.luminance": {
        symbol: "helpers.luminance",
        namespace: "helpers",
        signature: "helpers.luminance(r: number, g: number, b: number): number",
        summary: "Computes perceptual CIE / Rec.601 luminance (`0.299*R + 0.587*G + 0.114*B`).",
        details: "Matches `GIMP_RGB_LUMINANCE(r, g, b)` used across GIMP threshold, bump-map, emboss, and retinex filters.",
        gimpSourceRef: "libgimpcolor/gimprgb.h (GIMP_RGB_LUMINANCE)",
        example: "const lum = helpers.luminance(r, g, b);"
    },
    "helpers.rgbToHsv": {
        symbol: "helpers.rgbToHsv",
        namespace: "helpers",
        signature: "helpers.rgbToHsv(r: number, g: number, b: number): [number, number, number]",
        summary: "Converts 8-bit RGB `[0..255]` to HSV `[h (0..360), s (0..1), v (0..1)]`.",
        details: "Replicates `gimp_rgb_to_hsv` from `libgimpcolor/gimecolorspace.c`.",
        gimpSourceRef: "libgimpcolor/gimpcolorspace.c (gimp_rgb_to_hsv)",
        example: "const [h, s, v] = helpers.rgbToHsv(r, g, b);"
    },
    "helpers.hsvToRgb": {
        symbol: "helpers.hsvToRgb",
        namespace: "helpers",
        signature: "helpers.hsvToRgb(h: number, s: number, v: number): [number, number, number]",
        summary: "Converts HSV `[h (0..360), s (0..1), v (0..1)]` to 8-bit RGB `[0..255]`.",
        details: "Replicates `gimp_hsv_to_rgb` from `libgimpcolor/gimpcolorspace.c`.",
        gimpSourceRef: "libgimpcolor/gimpcolorspace.c (gimp_hsv_to_rgb)",
        example: "const [nr, ng, nb] = helpers.hsvToRgb((h + 30) % 360, s, v);"
    },
    "helpers.rgbToHsl": {
        symbol: "helpers.rgbToHsl",
        namespace: "helpers",
        signature: "helpers.rgbToHsl(r: number, g: number, b: number): [number, number, number]",
        summary: "Converts 8-bit RGB `[0..255]` to HSL `[h (0..360), s (0..1), l (0..1)]`.",
        details: "Replicates `gimp_rgb_to_hsl` from `libgimpcolor/gimpcolorspace.c`.",
        gimpSourceRef: "libgimpcolor/gimpcolorspace.c (gimp_rgb_to_hsl)",
        example: "const [h, s, l] = helpers.rgbToHsl(r, g, b);"
    },
    "helpers.hslToRgb": {
        symbol: "helpers.hslToRgb",
        namespace: "helpers",
        signature: "helpers.hslToRgb(h: number, s: number, l: number): [number, number, number]",
        summary: "Converts HSL `[h (0..360), s (0..1), l (0..1)]` to 8-bit RGB `[0..255]`.",
        details: "Replicates `gimp_hsl_to_rgb` from `libgimpcolor/gimpcolorspace.c`.",
        gimpSourceRef: "libgimpcolor/gimpcolorspace.c (gimp_hsl_to_rgb)",
        example: "const [nr, ng, nb] = helpers.hslToRgb(h, s, helpers.clamp01(l * 1.1));"
    },
    "helpers.parseColor": {
        symbol: "helpers.parseColor",
        namespace: "helpers",
        signature: "helpers.parseColor(colorStr: string): { r: number; g: number; b: number; a: number }",
        summary: "Parses a hex (`#rrggbb`) or CSS `rgba(...)` string into 8-bit `{ r, g, b, a }`.",
        details: "Useful for color parameters in filters like Drop Shadow, Supernova, Vignette, and Border.",
        example: "const col = helpers.parseColor(params.color || '#00d4ff');"
    },
    "helpers.isSelected": {
        symbol: "helpers.isSelected",
        namespace: "helpers",
        signature: "helpers.isSelected(selection: SelectionMaskSpec | undefined, x: number, y: number): boolean",
        summary: "Returns `true` if pixel `(x, y)` is inside the active selection mask.",
        details: "Automatically handles `none`, `rect`, `ellipse`, and `inverted` selection modes.",
        example: "if (!helpers.isSelected(selection, x, y)) continue;"
    },
    "helpers.boxBlurBuffer": {
        symbol: "helpers.boxBlurBuffer",
        namespace: "helpers",
        signature: "helpers.boxBlurBuffer(srcBuf: Uint8Array, width: number, height: number, radiusX: number, radiusY?: number): Uint8Array",
        summary: "Fast separable horizontal+vertical box blur returning a new `Uint8Array`.",
        details: "Runs in O(width * height) sliding-window time independent of blur radius.",
        gimpSourceRef: "operations/common/box-blur.c (GEGL)",
        example: "const blurred = helpers.boxBlurBuffer(srcBuf, width, height, 5, 5);"
    },
    "helpers.gaussianBlurBuffer": {
        symbol: "helpers.gaussianBlurBuffer",
        namespace: "helpers",
        signature: "helpers.gaussianBlurBuffer(srcBuf: Uint8Array, width: number, height: number, radiusX: number, radiusY?: number): Uint8Array",
        summary: "3-pass separable Gaussian blur returning a new `Uint8Array`.",
        details: "Approximates true Gaussian convolution (`gegl:gaussian-blur`) used standalone or inside Unsharp Mask, High Pass, Difference of Gaussians, Retinex, Bloom, and Softglow.",
        gimpSourceRef: "operations/common/gaussian-blur.c (GEGL)",
        example: "const blurred = helpers.gaussianBlurBuffer(srcBuf, width, height, radius);"
    },
    "helpers.convolve3x3": {
        symbol: "helpers.convolve3x3",
        namespace: "helpers",
        signature: "helpers.convolve3x3(srcBuf: Uint8Array, outBuf: Uint8Array, width: number, height: number, kernel9: number[], divisor?: number, bias?: number, selection?: SelectionMaskSpec): void",
        summary: "Applies a 3×3 spatial convolution matrix `kernel9` (`length === 9`) into `outBuf`.",
        details: "Supports custom divisor, bias offset, and active selection mask.",
        gimpSourceRef: "operations/common/convolution-matrix.c (GEGL)",
        example: "helpers.convolve3x3(srcBuf, outBuf, width, height, [0, -1, 0, -1, 5, -1, 0, -1, 0], 1, 0, selection);"
    },
    "helpers.sobelAt": {
        symbol: "helpers.sobelAt",
        namespace: "helpers",
        signature: "helpers.sobelAt(srcBuf: Uint8Array, width: number, height: number, x: number, y: number): { gx: number; gy: number; mag: number; angle: number }",
        summary: "Computes 3×3 Sobel luminance gradient `(gx, gy, mag, angle)` at pixel `(x, y)`.",
        details: "Used by Edge-Sobel, Edge-Neon, Van Gogh LIC tangent fields, Normal Map, Bump Map, and Image Gradient.",
        gimpSourceRef: "operations/common/edge-sobel.c & plug-ins/common/van-gogh-lic.c",
        example: "const grad = helpers.sobelAt(srcBuf, width, height, x, y);"
    },
    "helpers.medianWindow": {
        symbol: "helpers.medianWindow",
        namespace: "helpers",
        signature: "helpers.medianWindow(srcBuf: Uint8Array, width: number, height: number, x: number, y: number, radius: number, percentile?: number): [number, number, number, number]",
        summary: "Computes the rank-order median (or `percentile` in `0..100`) in a `(2r+1)×(2r+1)` window.",
        details: "Replicates `gegl:median-blur` and `plug-ins/common/despeckle.c` histogram rank filtering.",
        gimpSourceRef: "operations/common/median-blur.c & plug-ins/common/despeckle.c",
        example: "const [mr, mg, mb, ma] = helpers.medianWindow(srcBuf, width, height, x, y, 2, 50);"
    },
    "gimp.bilinear": {
        symbol: "gimp.bilinear",
        namespace: "gimp",
        signature: "gimp.bilinear(buf: Uint8Array, width: number, height: number, u: number, v: number, wrap?: boolean): [number, number, number, number]",
        summary: "Alias for `helpers.sampleBilinear` (`gimp_bilinear_rgba` in `libgimpmath`).",
        details: "Samples sub-pixel coordinates with bilinear interpolation.",
        gimpSourceRef: "libgimpmath/gimpbilinear.c",
        example: "const [r, g, b, a] = gimp.bilinear(srcBuf, width, height, sx, sy);"
    },
    "gimp.rgbToHsv": {
        symbol: "gimp.rgbToHsv",
        namespace: "gimp",
        signature: "gimp.rgbToHsv(r: number, g: number, b: number): [number, number, number]",
        summary: "GIMP color space helper converting RGB `[0..255]` to `[H (0..360), S (0..1), V (0..1)]`.",
        details: "Direct alias for `helpers.rgbToHsv`.",
        gimpSourceRef: "libgimpcolor/gimpcolorspace.c",
        example: "const [h, s, v] = gimp.rgbToHsv(r, g, b);"
    },
    "gimp.hsvToRgb": {
        symbol: "gimp.hsvToRgb",
        namespace: "gimp",
        signature: "gimp.hsvToRgb(h: number, s: number, v: number): [number, number, number]",
        summary: "GIMP color space helper converting `[H (0..360), S (0..1), V (0..1)]` to RGB `[0..255]`.",
        details: "Direct alias for `helpers.hsvToRgb`.",
        gimpSourceRef: "libgimpcolor/gimpcolorspace.c",
        example: "const [r, g, b] = gimp.hsvToRgb(h, s, v);"
    },
    "gegl.gaussianBlur": {
        symbol: "gegl.gaussianBlur",
        namespace: "gegl",
        signature: "gegl.gaussianBlur(srcBuf: Uint8Array, width: number, height: number, stdDevX: number, stdDevY?: number): Uint8Array",
        summary: "Executes `gegl:gaussian-blur` on `srcBuf` and returns a new `Uint8Array`.",
        details: "Separable Gaussian blur buffer operation.",
        gimpSourceRef: "operations/common/gaussian-blur.c",
        example: "const blurred = gegl.gaussianBlur(srcBuf, width, height, 4.0);"
    },
    "gegl.boxBlur": {
        symbol: "gegl.boxBlur",
        namespace: "gegl",
        signature: "gegl.boxBlur(srcBuf: Uint8Array, width: number, height: number, radiusX: number, radiusY?: number): Uint8Array",
        summary: "Executes `gegl:box-blur` on `srcBuf` and returns a new `Uint8Array`.",
        details: "Separable uniform box blur.",
        gimpSourceRef: "operations/common/box-blur.c",
        example: "const blurred = gegl.boxBlur(srcBuf, width, height, 3);"
    },
    "gegl.convolve3x3": {
        symbol: "gegl.convolve3x3",
        namespace: "gegl",
        signature: "gegl.convolve3x3(srcBuf: Uint8Array, outBuf: Uint8Array, width: number, height: number, kernel9: number[], divisor?: number, bias?: number, selection?: SelectionMaskSpec): void",
        summary: "Executes `gegl:convolution-matrix` with a 3×3 kernel.",
        details: "Direct alias for `helpers.convolve3x3`.",
        gimpSourceRef: "operations/common/convolution-matrix.c",
        example: "gegl.convolve3x3(srcBuf, outBuf, width, height, [-1,-1,-1, -1,8,-1, -1,-1,-1], 1, 0, selection);"
    }
};

