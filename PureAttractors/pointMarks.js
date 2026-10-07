/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */

/** Closed SVG marks for the sampled orbit, with brightness from local visits. */
export const POINT_SHAPES = Object.freeze(['Circle', 'Square', 'Diamond', 'Triangle', 'Hexagon']);
export const BRIGHTNESS_MODES = Object.freeze(['Palette', 'Size halftone', 'Ordered dither', 'Stochastic dither']);

const MAX_MARKS = 300000;
const LEVELS = 32;
const BAYER_8 = [
  0, 48, 12, 60, 3, 51, 15, 63,
  32, 16, 44, 28, 35, 19, 47, 31,
  8, 56, 4, 52, 11, 59, 7, 55,
  40, 24, 36, 20, 43, 27, 39, 23,
  2, 50, 14, 62, 1, 49, 13, 61,
  34, 18, 46, 30, 33, 17, 45, 29,
  10, 58, 6, 54, 9, 57, 5, 53,
  42, 26, 38, 22, 41, 25, 37, 21,
];

const numberIn = (value, fallback, min, max) => {
  const valueAsNumber = Number(value);
  return Number.isFinite(valueAsNumber) ? Math.min(max, Math.max(min, valueAsNumber)) : fallback;
};
const sampleCount = orbit => Math.min(MAX_MARKS, Math.floor(Math.max(0,
  Math.min(numberIn(orbit?.count, 0, 0, MAX_MARKS), (orbit?.points?.length || 0) / 2),
)));
const quantize = brightness => Math.min(LEVELS - 1, Math.max(0, Math.round((LEVELS - 1) * brightness)));

/**
 * Count visits on a square grid, with a small margin around the measured orbit.
 * reference is the 98th percentile of occupied-cell counts, at least three.
 * Zero-radius orbits still receive a finite extent and map to the grid center.
 */
export function buildDensity(orbit, requestedResolution = 600) {
  const resolution = Math.round(numberIn(requestedResolution, 600, 1, 2048));
  const count = sampleCount(orbit);
  let radius = Number(orbit?.maxRadius);
  if (!Number.isFinite(radius) || radius < 0) {
    radius = 0;
    for (let i = 0; i < count; i += 1) {
      const r = Math.hypot(orbit.points[i * 2], orbit.points[i * 2 + 1]);
      if (Number.isFinite(r)) radius = Math.max(radius, r);
    }
  }
  const extent = Math.max(radius * 1.04, 1e-9);
  const scale = resolution / (2 * extent);
  const cells = new Uint32Array(resolution * resolution);
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor((orbit.points[i * 2] + extent) * scale);
    const y = Math.floor((extent - orbit.points[i * 2 + 1]) * scale);
    if (x >= 0 && x < resolution && y >= 0 && y < resolution) {
      cells[y * resolution + x] += 1;
    }
  }
  const occupied = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] > 0) occupied.push(cells[i]);
  }
  occupied.sort((a, b) => a - b);
  const reference = Math.max(3, occupied[Math.floor(occupied.length * 0.98)] || 3);
  return { cells, resolution, extent, reference };
}

// SVG's number grammar accepts .5 and -.5; trim unnecessary digits and zeroes.
function compactNumber(value, precision = 3) {
  const rounded = Number(value.toFixed(precision));
  return String(rounded).replace(/^(-?)0\./, '$1.');
}

/** Reuse each relative outline for every mark with the same shape and size. */
function shapeTemplate(shape, size) {
  const half = size / 2;
  const s = compactNumber(size);
  const h = compactNumber(half);
  if (shape === 'Square') {
    return { x: -half, y: -half, path: `h${s}v${s}h-${s}z` };
  }
  if (shape === 'Diamond') {
    return { x: 0, y: -half, path: `l${h},${h}-${h},${h}-${h},-${h}z` };
  }
  if (shape === 'Triangle') {
    const height = size * Math.sqrt(3) / 2;
    return { x: 0, y: -height * 2 / 3, path: `l${h},${compactNumber(height)}h-${s}z` };
  }
  if (shape === 'Hexagon') {
    const quarter = compactNumber(size / 4);
    const rise = compactNumber(size * Math.sqrt(3) / 4);
    return { x: half, y: 0, path: `l-${quarter},${rise}h-${h}l-${quarter},-${rise} ${quarter},-${rise}h${h}z` };
  }
  // Two semicircular arcs form a real circle, also usable as an outline.
  return { x: -half, y: 0, path: `a${h},${h} 0 1 0 ${s},0 ${h},${h} 0 1 0-${s},0z` };
}

function stochasticThreshold(index, cell) {
  let hash = (Math.imul(index + 1, 0x9e3779b1) ^ cell) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return ((hash >>> 0) + 0.5) / 4294967296;
}

/**
 * Return up to 32 {level, d, marks} path groups in grid coordinates.
 * pointSize is a diameter/width in grid-cell units. Fill and stroke are left to
 * the renderer, so each shape works both filled and outlined.
 *
 * Palette levels encode log-density independently of exposure, allowing color
 * changes without rebuilding geometry. Other modes apply brightness^(1/exposure):
 * halftone varies diameter by sqrt(brightness), quantized to 32 area levels;
 * dithering retains full-size marks at deterministic brightness thresholds.
 * Use flat ink for halftone/dithering; only Palette needs the level as a color.
 */
export function buildMarks(orbit, density, options = {}) {
  const { cells } = density || {};
  const resolution = Math.round(numberIn(density?.resolution, 0, 0, 2048));
  if (!cells || resolution === 0 || cells.length < resolution * resolution) return [];
  const extent = numberIn(density.extent, 1e-9, 1e-9, Number.MAX_VALUE);
  const reference = numberIn(density.reference, 3, 1, MAX_MARKS);
  const denominator = Math.log1p(reference);
  const exposure = numberIn(options.exposure ?? 1.3, 1.3, 0.05, 10);
  const pointSize = numberIn(options.pointSize ?? 1, 1, 0, 20);
  if (pointSize === 0) return [];
  const shape = POINT_SHAPES.includes(options.shape) ? options.shape : 'Circle';
  const mode = BRIGHTNESS_MODES.includes(options.brightnessMode) ? options.brightnessMode : 'Palette';
  const orbitPlacement = options.placement === 'Orbit points';
  const halftone = mode === 'Size halftone';
  const ordered = mode === 'Ordered dither';
  const stochastic = mode === 'Stochastic dither';
  const templates = Array.from({ length: LEVELS }, (_, level) => shapeTemplate(
    shape, pointSize * (halftone ? Math.sqrt(level / (LEVELS - 1)) : 1),
  ));
  const parts = Array.from({ length: LEVELS }, () => []);
  const totals = new Uint32Array(LEVELS);
  const scale = resolution / (2 * extent);
  // There are usually far fewer distinct visit counts than occupied cells.
  const brightnessByCount = new Map();
  let totalMarks = 0;

  const addMark = (x, y, cellX, cellY, index) => {
    const cell = cellY * resolution + cellX;
    const visits = cells[cell];
    if (!(visits > 0)) return;
    let tone = brightnessByCount.get(visits);
    if (tone === undefined) {
      const raw = Math.min(1, Math.log1p(visits) / denominator);
      const exposed = raw ** (1 / exposure);
      tone = { rawLevel: quantize(raw), exposed, exposedLevel: quantize(exposed) };
      brightnessByCount.set(visits, tone);
    }
    if (ordered && tone.exposed < (BAYER_8[(cellY & 7) * 8 + (cellX & 7)] + 0.5) / 64) return;
    if (stochastic && tone.exposed < stochasticThreshold(index, cell)) return;
    const level = halftone ? tone.exposedLevel : ((ordered || stochastic) ? LEVELS - 1 : tone.rawLevel);
    if (halftone && level === 0) return;
    const template = templates[level];
    parts[level].push(`M${compactNumber(x + template.x, 2)},${compactNumber(y + template.y, 2)}${template.path}`);
    totals[level] += 1;
    totalMarks += 1;
  };

  if (orbitPlacement) {
    const count = sampleCount(orbit);
    for (let i = 0; i < count; i += 1) {
      const x = (orbit.points[i * 2] + extent) * scale;
      const y = (extent - orbit.points[i * 2 + 1]) * scale;
      const cellX = Math.floor(x);
      const cellY = Math.floor(y);
      if (cellX >= 0 && cellX < resolution && cellY >= 0 && cellY < resolution) {
        addMark(x, y, cellX, cellY, i);
      }
    }
  } else {
    for (let cell = 0; cell < resolution * resolution && totalMarks < MAX_MARKS; cell += 1) {
      if (!cells[cell]) continue;
      const x = cell % resolution;
      const y = Math.floor(cell / resolution);
      addMark(x + 0.5, y + 0.5, x, y, cell);
    }
  }
  return parts.flatMap((commands, level) => totals[level]
    ? [{ level, d: commands.join(''), marks: totals[level] }]
    : []);
}
