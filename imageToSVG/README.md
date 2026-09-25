# Image to SVG

Open `/imageToSVG/` through the site's static HTTP server. The app is also registered in the main gallery and Apps directory. No build step, API key, upload service, or third-party tracing library is needed.

The page uses the same `visualHelp.js` / `uiHelper.css` interface as the other visual apps: **X** returns to the main gallery, **INFO** opens the controls, and the SVG fills the visual canvas. **Params** contains the generated image, conversion, palette, and preparation controls. The panel's `+` button exposes the standard transforms, animate, assistant, effects, flows, and developer tabs, plus the image-specific **image** tab. Pinning, navigation hiding, undo, settings, and SVG Save/Load all use the shared framework.

The tabs stay in their original vertical column. Drag a tab to an editor's edge to split the area, or inside an existing panel to replace its editor. A normal click replaces the last-focused panel; holding a tab name for half a second shows only that editor. Drag dividers to resize. See the [shared toolbar layout guide](../helper/TAB_DOCKING.md) for touch, keyboard, and persistence behavior.

Choose an image in **Params → Image**, drop one onto the canvas, or use one of the three built-in raster samples. **Image previews & filters** opens the **image** tab for original/prepared previews and the ordered filter stack.

1. Set a crop in **Params → Preparation** using fractions of the original image (0.25 = 25%). The crop is clamped at its right and bottom edges.
2. Set the working resolution (32–1024 pixels on the long edge) and nearest-neighbor, bilinear, or area-average downsampling. Small images are not enlarged.
3. In the **image** tab, add, reorder, disable, or remove filters using the shared control rows. The stack runs from top to bottom and supports repeated filters: brightness, contrast, saturation, hue, gamma, grayscale, sepia, invert, threshold, posterize, blur, and sharpen.
4. Choose RGB, grayscale, black and white, or duotone; 2–64 color bins; median cut, K-means, or uniform quantization; and optional ordered or Floyd–Steinberg dithering. Duotone has editable endpoint colors. Color bins limit the **total** palette, not each RGB channel. Black and white always uses at most two colors. Some inputs and sparse drawing methods use fewer colors than the limit.
5. In **Params → Conversion**, select a conversion method, detail, and maximum shape count. Convert automatically, or disable automatic conversion and press **Convert to SVG**. Continuous changes keep only the latest pending settings while the current conversion finishes. Choosing another image cancels the old image's work, and **Cancel conversion** stops the worker and clears pending work.
6. Compare the previews in the **image** tab with the SVG canvas. The standard **Save** button exports editable geometry and shared settings metadata, including any changes made with the shared SVG tools. **Load** restores SVGs or embedded settings using the same workflow as other visual apps. Save is disabled while the conversion has pending changes. The displayed shape/color counts and geometry size describe the base conversion before optional shared edits and settings metadata.

The 22 conversion methods include region contours, simplified contours, smooth contours, pixel tiles, merged horizontal runs, adaptive quadtree, triangle mosaic, hexagon mosaic, dot halftone, square halftone, seeded stippling, horizontal scanlines, vertical scanlines, diagonal hatching, crosshatching, color edge strokes, Voronoi mosaic, and five continuous-line methods described below. Smooth contours are quadratic approximations; hatching and line drawings intentionally leave gaps.

Use **animate → Flow** to animate numeric settings such as `mosaicInset`, `complexity`, `crop.x`, or `hatchAngle`. Keep **Convert automatically** enabled to update the SVG during playback. A setting only changes the picture when it applies to the selected conversion method. Existing filter amounts can also be entered by path, such as `filters.0.value`. Conversion speed limits the visible frame rate; slow conversions skip intermediate settings and catch up to the current values after pausing, stopping, or scrubbing. Play/resume, restart, loop, and yoyo use the shared animation controls.

Controls follow the selected algorithm using the shared `shouldShowWhen` parameter option. For example, choosing Voronoi shows its cell count, count mode, jitter, aspect, relaxation, tile inset, and seed. Choosing a continuous-line method opens its **Continuous lines** group. Switching methods retains hidden settings for the next time that method is selected. Numeric controls are also available to the Animate tab.

| Method family | Relevant controls |
| --- | --- |
| Region, simplified, and smooth contours | Direct sampling count, cell aspect, minimum region/hole area; boundary simplification for simplified/smooth contours; corner rounding for smooth contours |
| Pixel tiles and merged runs | Direct sampling count, cell aspect, tile inset |
| Adaptive quadtree | Direct sampling budget, cell aspect, color tolerance, minimum block size |
| Triangle / hexagon mosaics | Direct sampling count, tile inset; triangles also offer cell aspect and diagonal direction |
| Dot / square halftones and stippling | Direct sampling count, cell aspect, mark size, darkness response, minimum darkness; stippling also offers density, scatter, and seed |
| Scanlines and hatching | Direct sampling count, cell aspect, darkness response/cutoff, stroke width and length; hatching adds angle, crosshatching adds a second-direction threshold and crossing angle |
| Color edge strokes | Direct sampling count, cell aspect, independent RGB contrast threshold, stroke width |
| Voronoi mosaic | 1–30,000 cells, direct/detail count mode, site jitter, cell aspect, 0–5 relaxation passes, tile inset, seed |
| Continuous-line methods | 1–512 lines, 1–64 total ink colors, samples, amplitude, frequency, dark-area density, minimum coverage, angle, smoothing, stroke width, darkness response, seed |

Duotone endpoint controls appear only for duotone. The palette algorithm is hidden for black and white, which uses a fixed two-color palette; alpha cutoff appears when preserving transparency. Ordered filters keep the ranges and controls appropriate to their type, including blur radius, posterization levels, and threshold cutoff.

**Sampling cells** overrides the automatic sampling density when nonzero, so you can increase subdivisions without changing other detail settings. It remains bounded by the image resolution and shape budget; methods that use multiple shapes per sample divide their budget accordingly. Zero retains automatic sampling. Minimum contour area removes both small islands and small holes. Higher quadtree tolerance merges more color variation into larger blocks. Tile inset adds gaps without increasing shape count.

**Voronoi cell count** now uses the requested count directly, up to 30,000; increase **Maximum shapes** as well when requesting more than its current limit. Opaque images produce the requested count, even when cells are smaller than a prepared-image pixel. Transparent cells may be omitted. **Scale count with Detail** restores the previous density-based behavior. Spatially pruned half-plane clipping avoids comparing every site with every other site. Relaxation moves sites to polygon centroids for more even cells; additional passes cost more conversion time.

The shape budget counts visible drawing elements. A shared transparency clip path is excluded and can add file size for fragmented transparency. Seed controls reproducible stippling, Voronoi sites, and continuous-line phases/flow.

## Continuous-line drawings

Each emitted line is one SVG path with one starting move and one ink color. **Continuous line count** controls the total paths, and **Total line colors** caps distinct inks across those paths. The color count is also limited by **Color bins**, available source colors, and line count. Set line colors to 1 for a single-ink drawing, or use distributed colors to let each ink cover the whole image with its share of the paths. Dominant-color mode assigns each path the strongest source color along its route; it may use fewer inks.

| Method | Route and additional controls |
| --- | --- |
| Parallel squiggles | Parallel waves, rotated with Drawing angle; local darkness controls amplitude and extra oscillations |
| Serpentine ribbons | Each path snakes back and forth through a band; Rows per ribbon controls the number of traversals |
| Spiral squiggles | A rectangular spiral covers the image; Total spiral turns controls its density, and the requested paths divide its length per ink |
| Flowing scribbles | Seeded threads start in tone/color-weighted areas, turn along gradients, and move more slowly in dark areas; Flow travel distance and Follow image edges control the route |
| Hilbert line drawing | A space-filling route divided among the paths per ink; Hilbert subdivision level sets its grid detail |

Try **Parallel squiggles**, **48 lines**, **1 line color**, **amplitude 1**, and **stroke width 0.5** for a readable first pass. Then raise line count, amplitude, or dark-area density, or switch to 3–4 inks. For a single long path, set line count and line colors to 1 and choose Serpentine, Spiral, or Hilbert. These are stylized tonal approximations; disconnected color regions are connected by the same paths.

Samples per line and Detail set geometric fidelity, independently of line count. Tight waves, many ribbon rows, or high Hilbert levels need more samples. A total cap of 250,000 input path samples bounds memory and file size; smoothing adds quadratic control vertices. Zero smoothing exports straight segments. Stroke width is in prepared-image pixels for these five methods. Minimum wave coverage sets residual waviness in light/off-color areas; zero still leaves a connected baseline. Transparent regions are clipped, so an underlying continuous path can have visible gaps there.

The tone-modulated wave approach was informed by [SquiggleDraw](https://github.com/gwygonik/SquiggleDraw). The relationship between path density and image tone is also discussed in [Kaplan and Bosch's TSP art](https://cs.uwaterloo.ca/~csk/other/tsp/). These converters use their own bounded procedural routes and do not run a traveling-salesman optimizer.

Transparent pixels can be preserved or composited onto white or black before filtering. The alpha cutoff controls which pixels are traced. Preserved transparency uses an exact binary clip at the prepared-image resolution and averaged opacity within drawing cells. Partial transparency is therefore approximated in coarse methods. Palette counts refer to SVG paint colors, not extra shades produced by opacity or antialiasing.

Input decoding uses formats supported by the browser (including PNG, JPEG, WebP, GIF, AVIF, BMP, and SVG). Animated inputs use a still frame. Files are limited to 64 MB; large sources are reduced to at most a 4096-pixel edge and 16 million pixels before entering the working pipeline, with the original dimensions shown in the preview caption. Conversion runs in a module worker. The latest uploaded image is cached locally in IndexedDB and restored on reload, including the original preview in the **image** tab. Choosing a built-in sample clears that cached upload. Images are not included in shared settings or SVG exports. If browser storage is unavailable or full, the image still opens for the current session and the image tab shows a notice. Conversion progress and errors also appear in the image tab.

## Reusable functions

`preprocess.js` and `converters.js` are pure ES modules that run in a worker or Node. Neither needs a DOM or canvas.

```js
import { preprocessImage } from './preprocess.js';
import { convertToSVG, METHODS } from './converters.js';

const prepared = preprocessImage({ width, height, data: rgbaPixels }, {
  crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  maxDimension: 320,
  resample: 'area',
  filters: [
    { type: 'saturation', value: -20, enabled: true },
    { type: 'contrast', value: 15, enabled: true },
  ],
  colorMode: 'rgb', colors: 8, quantizer: 'median-cut',
  dither: 'none', transparency: 'preserve', alphaThreshold: 16,
});
const result = convertToSVG(prepared, {
  method: 'simplified-contours', complexity: 45,
  maxShapes: 8000, simplify: 1, strokeWidth: 1, seed: 42,
});
console.log(result.svg, result.elementCount, result.colorsUsed);
```

`preprocessImage` returns `{ width, height, data, palette, indices }`. `data` is the prepared RGBA image before quantization, `palette` contains RGB triples, and `indices` addresses that palette (`-1` means transparent). `FILTERS` describes filter ranges. `quantizeImage` is available for already prepared RGBA input. `METHODS` describes the converters. `convertToSVG` also returns `pointCount`, dimensions, and the method ID. Inputs are not mutated.

`conversionControls.js` exports all option keys, defaults, limits, help text, and method-specific visibility rules. Continuous methods use IDs `wave-squiggles`, `serpentine-squiggles`, `spiral-squiggles`, `flow-squiggles`, and `hilbert-squiggles`. Their main options are `lineCount`, `lineColors`, `lineColorMode`, `lineSamples`, `lineAmplitude`, `lineFrequency`, `lineDensity`, `lineDensityFloor`, `lineAngle`, `lineSmoothing`, `strokeWidth`, `toneResponse`, and `seed`; route-specific options are `serpentineRows`, `spiralTurns`, `flowLength`, `flowInfluence`, and `hilbertOrder`. Voronoi adds `voronoiCountMode`, `voronoiAspect`, and `voronoiRelaxation`. Existing saved method IDs still work; choose `voronoiCountMode: 'detail'` to scale site counts with Detail as before. Color edge strokes now use `edgeThreshold` independently of contour simplification.

Run the dependency-free regression checks on Node 20 with:

```sh
node --experimental-default-type=module --test tests/image-to-svg-preprocess.mjs tests/image-to-svg-converters.mjs tests/image-to-svg-pipeline.mjs tests/image-to-svg-method-options.mjs tests/image-to-svg-detail.mjs tests/image-to-svg-animation.mjs tests/animation-runtime.mjs
```

On Node versions that detect ES-module syntax automatically, the experimental default-type flag can be omitted.
