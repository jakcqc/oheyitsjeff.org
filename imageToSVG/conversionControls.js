/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
import { METHODS } from './converters.js';

const number = (key, label, value, min, max, step = 1, category = 'Conversion') =>
  ({ key, label, type: 'number', default: value, min, max, step, category });
const select = (key, label, value, options, category = 'Conversion') =>
  ({ key, label, type: 'select', default: value, options: options.map(option => typeof option === 'string' ? option : option.value), displayOptions: options, category });
const forMethods = (param, ...methods) => ({ ...param, shouldShowWhen: { method: methods } });
const marks = ['dots', 'squares', 'stipple', 'horizontal-lines', 'vertical-lines', 'hatching', 'crosshatching'];
const lines = ['horizontal-lines', 'vertical-lines', 'hatching', 'crosshatching', 'edges'];
const mosaics = ['pixels', 'runs', 'triangles', 'hexagons', 'voronoi'];
const continuous = METHODS.filter(method => method.id.endsWith('-squiggles')).map(method => method.id);
const sampled = METHODS.map(method => method.id).filter(method => method !== 'voronoi' && !continuous.includes(method));
const grids = sampled.filter(method => method !== 'hexagons');
const lineNumber = (key, label, value, min, max, step = 1, methods = continuous) =>
  forMethods(number(key, label, value, min, max, step, 'Continuous lines'), ...methods);

// Selector conditions are interpreted by the shared parameter renderer. Hidden
// settings retain their values so switching algorithms restores each recipe.
export const conversionParams = [
  select('method', 'Conversion method', 'simplified-contours', METHODS.map(m => ({ value: m.id, label: m.label }))),
  number('complexity', 'Detail / complexity', 45, 1, 100),
  number('maxShapes', 'Maximum shapes', 8000, 100, 30000, 100),
  forMethods(number('samplingCount', 'Sampling cells (0 = automatic)', 0, 0, 30000, 1), ...sampled),
  forMethods(number('gridAspect', 'Sample cell aspect ratio', 1, .1, 10, .05), ...grids),
  forMethods(number('simplify', 'Boundary simplification', 1, 0, 5, .05), 'simplified-contours', 'smooth-contours'),
  forMethods(number('contourMinArea', 'Minimum region / hole area (px²)', 0, 0, 4096, 1), 'contours', 'simplified-contours', 'smooth-contours'),
  forMethods(number('cornerRounding', 'Corner rounding', 1, 0, 3, .1), 'smooth-contours'),
  forMethods(number('quadtreeTolerance', 'Quadtree color tolerance', 1, 0, 3, .05), 'quadtree'),
  forMethods(number('quadtreeMinSize', 'Minimum block size (px)', 1, 1, 128), 'quadtree'),
  forMethods(select('triangleDirection', 'Triangle diagonal', 'alternating', [
    { value: 'alternating', label: 'Alternating' }, { value: 'forward', label: 'Forward' }, { value: 'backward', label: 'Backward' },
  ]), 'triangles'),
  forMethods(number('mosaicInset', 'Tile inset', 0, 0, .45, .01), ...mosaics),
  forMethods(number('markScale', 'Mark size', 1, .05, 5, .05), 'dots', 'squares', 'stipple'),
  forMethods(number('toneResponse', 'Darkness response', 1, .1, 5, .05), ...marks, ...continuous),
  forMethods(number('toneCutoff', 'Minimum darkness', 0, 0, 1, .01), ...marks),
  forMethods(number('stippleDensity', 'Stipple density multiplier', 1, .05, 4, .05), 'stipple'),
  forMethods(number('stippleJitter', 'Stipple scatter', .72, 0, 1, .02), 'stipple'),
  forMethods(number('hatchAngle', 'Hatch angle', 45, 0, 180), 'hatching', 'crosshatching'),
  forMethods(number('crosshatchThreshold', 'Crosshatch darkness threshold', .2, 0, 1, .01), 'crosshatching'),
  forMethods(number('crosshatchAngle', 'Crosshatch crossing angle', 90, 0, 180), 'crosshatching'),
  forMethods(number('strokeLength', 'Stroke length multiplier', 1, .05, 3, .05), ...lines.filter(method => method !== 'edges')),
  forMethods(number('edgeThreshold', 'Edge contrast threshold', 12, 0, 442), 'edges'),
  forMethods(number('strokeWidth', 'Stroke width', 1, .05, 20, .05), ...lines, ...continuous),
  forMethods(number('voronoiSites', 'Voronoi cell count', 768, 1, 30000), 'voronoi'),
  forMethods(select('voronoiCountMode', 'Voronoi count mode', 'exact', [
    { value: 'exact', label: 'Use cell count directly' }, { value: 'detail', label: 'Scale count with Detail' },
  ]), 'voronoi'),
  forMethods(number('voronoiJitter', 'Voronoi site jitter', .7, 0, 1, .02), 'voronoi'),
  forMethods(number('voronoiAspect', 'Voronoi cell aspect', 1, .1, 10, .05), 'voronoi'),
  forMethods(number('voronoiRelaxation', 'Voronoi relaxation passes', 0, 0, 5), 'voronoi'),
  forMethods(number('seed', 'Random seed', 42, 0, 999999), 'stipple', 'voronoi', ...continuous),
  lineNumber('lineCount', 'Continuous line count', 48, 1, 512),
  lineNumber('lineColors', 'Total line colors (maximum)', 4, 1, 64),
  forMethods(select('lineColorMode', 'Line color assignment', 'layered', [
    { value: 'layered', label: 'Distribute palette across lines' }, { value: 'dominant', label: 'Dominant color along each line' },
  ], 'Continuous lines'), ...continuous),
  lineNumber('lineSamples', 'Samples per line', 1200, 64, 8192, 16),
  lineNumber('lineAmplitude', 'Squiggle amplitude', 1, 0, 5, .05),
  lineNumber('lineFrequency', 'Base wave frequency', 32, 1, 160),
  lineNumber('lineDensity', 'Extra density in dark areas', 2, 0, 8, .1),
  lineNumber('lineDensityFloor', 'Minimum wave coverage', .08, 0, 1, .01),
  lineNumber('lineAngle', 'Drawing angle', 0, 0, 180),
  lineNumber('lineSmoothing', 'Curve smoothing', .65, 0, 1, .05),
  lineNumber('serpentineRows', 'Rows per ribbon', 6, 1, 64, 1, ['serpentine-squiggles']),
  lineNumber('spiralTurns', 'Total spiral turns', 24, 1, 160, 1, ['spiral-squiggles']),
  lineNumber('flowLength', 'Flow travel distance', 4, .25, 20, .25, ['flow-squiggles']),
  lineNumber('flowInfluence', 'Follow image edges', 1, 0, 4, .1, ['flow-squiggles']),
  lineNumber('hilbertOrder', 'Hilbert subdivision level', 5, 1, 7, 1, ['hilbert-squiggles']),
  select('colorMode', 'Color mode', 'rgb', [
    { value: 'rgb', label: 'RGB color' }, { value: 'grayscale', label: 'Grayscale' },
    { value: 'monochrome', label: 'Black & white' }, { value: 'duotone', label: 'Duotone' },
  ], 'Palette'),
  number('colors', 'Color bins (maximum)', 8, 2, 64, 1, 'Palette'),
  { ...select('quantizer', 'Palette algorithm', 'median-cut', [
    { value: 'median-cut', label: 'Median cut' }, { value: 'kmeans', label: 'K-means' },
    { value: 'uniform', label: 'Uniform RGB' },
  ], 'Palette'), shouldShowWhen: { colorMode: ['rgb', 'grayscale', 'duotone'] } },
  select('dither', 'Dithering', 'none', [
    { value: 'none', label: 'None' }, { value: 'ordered', label: 'Ordered Bayer' },
    { value: 'floyd-steinberg', label: 'Floyd–Steinberg' },
  ], 'Palette'),
  { key: 'darkColor', label: 'Duotone dark', type: 'text', default: '#132a40', category: 'Palette', shouldShowWhen: { colorMode: 'duotone' } },
  { key: 'lightColor', label: 'Duotone light', type: 'text', default: '#f6d8a0', category: 'Palette', shouldShowWhen: { colorMode: 'duotone' } },
  number('maxDimension', 'Working resolution (long edge)', 320, 32, 1024, 16, 'Preparation'),
  select('resample', 'Downsampling', 'area', [
    { value: 'area', label: 'Area average' }, { value: 'bilinear', label: 'Bilinear' },
    { value: 'nearest', label: 'Nearest neighbor' },
  ], 'Preparation'),
  number('crop.x', 'Crop left (0–1)', 0, 0, .99, .01, 'Preparation'),
  number('crop.y', 'Crop top (0–1)', 0, 0, .99, .01, 'Preparation'),
  number('crop.width', 'Crop width (0–1)', 1, .01, 1, .01, 'Preparation'),
  number('crop.height', 'Crop height (0–1)', 1, .01, 1, .01, 'Preparation'),
  select('transparency', 'Transparency', 'preserve', [
    { value: 'preserve', label: 'Preserve transparent areas' },
    { value: 'white', label: 'Flatten onto white' }, { value: 'black', label: 'Flatten onto black' },
  ], 'Preparation'),
  { ...number('alphaThreshold', 'Alpha cutoff', 16, 1, 255, 1, 'Preparation'), shouldShowWhen: { transparency: 'preserve' } },
  { key: 'autoConvert', label: 'Convert automatically', type: 'boolean', default: true, category: 'Conversion' },
];

const descriptions = {
  method: '22 tracing, mosaic, halftone, and continuous-line methods. Image previews and ordered filters are in the image tab.',
  colors: 'Maximum total palette colors (2–64). Black and white uses at most two; sparse outputs may use fewer.',
  maxDimension: 'Long edge after cropping, up to 1024 pixels. Small images are not enlarged.',
  'crop.x': 'Crop values are fractions of the original image: 0.25 = 25%. Crops stop at the image edges.',
  maxShapes: 'Caps drawing elements across the whole image. Transparency may add one shared clip path.',
  gridAspect: 'Relative width of sampling cells: above 1 favors wider cells; below 1 favors taller cells.',
  simplify: 'Reduces contour vertices while preserving closed paths.',
  samplingCount: 'Set a sampling target directly, independently of Detail. Zero uses automatic density. Maximum shapes and image resolution still bound the result.',
  contourMinArea: 'Remove tiny contour islands and holes below this area in prepared-image pixels. Zero keeps all regions.',
  quadtreeMinSize: 'Stop subdividing blocks at this size in prepared-image pixels.',
  toneCutoff: 'Skip marks in areas lighter than this darkness. Zero includes the full tonal range.',
  stippleDensity: 'Control how many candidate dots survive tone-weighted sampling. Sampling cells sets the candidate count.',
  strokeLength: 'Change stroke length without changing its width or the sample grid.',
  edgeThreshold: 'Suppress boundaries whose RGB color distance falls below this threshold.',
  crosshatchAngle: 'Angle between the two hatch directions, independently of the base hatch angle.',
  cornerRounding: 'Scales the local rounding of smooth contour corners. Zero keeps sharp corners.',
  quadtreeTolerance: 'Higher values allow more color variation inside each unsplit block. Detail and the shape budget still limit subdivision.',
  mosaicInset: 'Shrinks each tile inward by this fraction, leaving gaps between tiles.',
  markScale: 'Scales dot radii or square sides. Large marks can overlap.',
  toneResponse: 'Changes how source darkness affects mark coverage. Higher values leave more space in midtones.',
  hatchAngle: 'Rotates hatch strokes; crosshatching adds a second direction in dark areas.',
  crosshatchThreshold: 'Only areas darker than this value get the second hatch direction.',
  voronoiSites: 'Request 1–30,000 cells. The default direct-count mode does not reduce this with Detail. Increase Maximum shapes for counts above its limit. Transparent cells may be absent.',
  voronoiCountMode: 'Direct count uses the requested cell count; the other mode scales it with Detail.',
  voronoiAspect: 'Stretch the initial site distribution into wider or taller cells.',
  voronoiRelaxation: 'Move sites toward their cell centroids for more even spacing. Extra passes take longer.',
  voronoiJitter: 'Zero uses regular cell centers; higher values create more irregular cells using Random seed.',
  strokeWidth: 'Width in prepared-image pixels for continuous lines; a width multiplier for the short-stroke methods.',
  lineCount: 'Total continuous paths, capped by Maximum shapes. Each path uses one ink color. Fully transparent paths are omitted.',
  lineColors: 'Maximum distinct colors across all lines, limited by Color bins, available image colors, and line count. One makes a single-ink drawing.',
  lineColorMode: 'Distributed colors use squiggle density to emphasize each ink’s image regions. Dominant mode picks the strongest local color for each path.',
  lineSamples: 'More samples retain finer waves. Detail scales this value; a total limit of 250,000 samples bounds SVG size.',
  lineAmplitude: 'Width of the sideways waves. Zero follows the underlying route without waves.',
  lineFrequency: 'Base oscillations along each path. Increase Samples per line when using very tight waves.',
  lineDensity: 'Add more oscillations in dark regions; zero keeps wave frequency constant.',
  lineDensityFloor: 'Residual wave amplitude in light or off-color regions. The path stays connected even at zero.',
  lineAngle: 'Rotate the drawing around the image center; coordinates remain inside the image.',
  lineSmoothing: 'Round path corners with quadratic curves. Zero exports straight segments.',
  serpentineRows: 'Back-and-forth traversals within each continuous ribbon.',
  spiralTurns: 'Total turns across the whole spiral, divided among the requested lines.',
  flowLength: 'Travel distance of each thread in multiples of the image’s short edge.',
  flowInfluence: 'Steer flow along local image edges. Zero uses only the seeded flow field.',
  hilbertOrder: 'Each level doubles the traversal grid width and height. Increase Samples per line to resolve higher levels.',
};
for (const param of conversionParams) if (descriptions[param.key]) param.description = descriptions[param.key];
