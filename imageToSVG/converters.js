/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

/** Pure vectorizers: no DOM, dependencies, raster embeds, or external resources. */
export const METHODS = Object.freeze([
  { id: 'contours', label: 'Region contours', description: 'Trace closed color boundaries, retaining angular detail and holes.' },
  { id: 'simplified-contours', label: 'Simplified contours', description: 'Reduce closed boundary vertices to make lighter polygon paths.' },
  { id: 'smooth-contours', label: 'Smooth contours', description: 'Round traced boundaries with quadratic curves.' },
  { id: 'pixels', label: 'Pixel tiles', description: 'Represent the sampled image with a regular grid of colored rectangles.' },
  { id: 'runs', label: 'Merged horizontal runs', description: 'Join neighboring tiles of the same color into long rectangles.' },
  { id: 'quadtree', label: 'Adaptive quadtree', description: 'Subdivide varied areas into smaller rectangles while keeping flat areas large.' },
  { id: 'triangles', label: 'Triangle mosaic', description: 'Sample alternating pairs of triangles for a faceted mosaic.' },
  { id: 'hexagons', label: 'Hexagon mosaic', description: 'Sample a honeycomb of touching six-sided tiles.' },
  { id: 'dots', label: 'Dot halftone', description: 'Use regularly spaced circles sized by local darkness.' },
  { id: 'squares', label: 'Square halftone', description: 'Use regularly spaced squares sized by local darkness.' },
  { id: 'stipple', label: 'Seeded stippling', description: 'Scatter reproducible, tone-weighted dots within a sampling grid.' },
  { id: 'horizontal-lines', label: 'Horizontal scanlines', description: 'Draw horizontal strokes whose thickness follows local tone.' },
  { id: 'vertical-lines', label: 'Vertical scanlines', description: 'Draw vertical strokes whose thickness follows local tone.' },
  { id: 'hatching', label: 'Diagonal hatching', description: 'Build the image from short diagonal strokes.' },
  { id: 'crosshatching', label: 'Crosshatching', description: 'Overlay two diagonal stroke directions in darker areas.' },
  { id: 'edges', label: 'Color edge strokes', description: 'Draw boundaries between sufficiently different sampled colors.' },
  { id: 'voronoi', label: 'Voronoi mosaic', description: 'Up to 30,000 seeded cells with direct count, aspect, jitter, and relaxation controls.' },
  { id: 'wave-squiggles', label: 'Parallel squiggles', description: 'Continuous waves whose amplitude and frequency follow image tone.' },
  { id: 'serpentine-squiggles', label: 'Serpentine ribbons', description: 'Unbroken paths snake back and forth, with dense squiggles in darker areas.' },
  { id: 'spiral-squiggles', label: 'Spiral squiggles', description: 'Divide a winding rectangular spiral into colored, tone-modulated paths.' },
  { id: 'flow-squiggles', label: 'Flowing scribbles', description: 'Seeded continuous threads follow image gradients and a swirling flow field.' },
  { id: 'hilbert-squiggles', label: 'Hilbert line drawing', description: 'A space-filling curve divided into continuous colored, wavy paths.' },
].map(Object.freeze));

const METHOD_IDS = new Set(METHODS.map(({ id }) => id));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const numberOption = (value, fallback, low, high) => Number.isFinite(Number(value)) && value !== null
  ? clamp(Number(value), low, high) : fallback;
const fmt = (value) => String(Math.round(value * 1000) / 1000);
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const colorHex = (color) => `#${color.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function validateFrame(frame) {
  if (!frame || typeof frame !== 'object') throw new TypeError('A quantized image is required.');
  const { width, height, data, palette, indices } = frame;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width * height > 16777216) {
    throw new RangeError('Image width and height must be positive integers totaling at most 16,777,216 pixels.');
  }
  if (!data || data.length !== width * height * 4) throw new RangeError('RGBA data length must equal width × height × 4.');
  if (!indices || indices.length !== width * height) throw new RangeError('Color indices length must equal width × height.');
  if (!Array.isArray(palette) || palette.length > 4096 || palette.some((color) => !Array.isArray(color)
    || color.length !== 3 || color.some((value) => !Number.isInteger(value) || value < 0 || value > 255))) {
    throw new TypeError('The palette must contain at most 4096 RGB arrays with integer channels from 0 to 255.');
  }
  let visiblePixels = 0;
  for (let index = 0; index < indices.length; index += 1) {
    if (!Number.isInteger(indices[index]) || indices[index] < -1 || indices[index] >= palette.length) {
      throw new RangeError(`Invalid palette index at pixel ${index}. Use -1 for transparency.`);
    }
    const alpha = data[index * 4 + 3];
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 255) throw new RangeError('RGBA alpha must be finite and between 0 and 255.');
    if (indices[index] >= 0 && alpha > 0) visiblePixels += 1;
  }
  return visiblePixels;
}

function gridDimensions(width, height, target, aspect = 1) {
  const budget = Math.max(1, Math.min(width * height, Math.floor(target)));
  let columns = Math.max(1, Math.min(width, Math.floor(Math.sqrt(budget * width / height / aspect))));
  const rows = Math.max(1, Math.min(height, Math.floor(budget / columns)));
  columns = Math.max(1, Math.min(width, Math.floor(budget / rows)));
  return { columns, rows };
}

/** Sample a geometric area by alpha-weighted majority from the existing palette. */
function makeSampler(frame) {
  const { width, height, data, indices, palette } = frame;
  const weights = new Float64Array(palette.length);
  return (x0, y0, x1, y1, contains) => {
    const touched = [];
    let count = 0;
    let alpha = 0;
    let best = -1;
    let bestWeight = 0;
    const left = Math.max(0, Math.ceil(x0 - 0.5));
    const right = Math.min(width, Math.ceil(x1 - 0.5));
    const top = Math.max(0, Math.ceil(y0 - 0.5));
    const bottom = Math.min(height, Math.ceil(y1 - 0.5));
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        if (contains && !contains(x + 0.5, y + 0.5)) continue;
        const offset = y * width + x;
        const index = indices[offset];
        const a = data[offset * 4 + 3];
        if (index < 0 || a === 0) continue;
        if (weights[index] === 0) touched.push(index);
        weights[index] += a;
        if (weights[index] > bestWeight) {
          best = index;
          bestWeight = weights[index];
        }
        count += 1;
        alpha += a;
      }
    }
    for (const index of touched) weights[index] = 0;
    return { index: best, alpha: count ? alpha / (255 * count) : 0, count };
  };
}

function makeGrid(context, target) {
  const { width, height } = context.frame;
  const { columns, rows } = gridDimensions(width, height, target, context.settings.gridAspect);
  const cells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      cells.push(context.sample(x * width / columns, y * height / rows,
        (x + 1) * width / columns, (y + 1) * height / rows));
    }
  }
  return { columns, rows, cells, dx: width / columns, dy: height / rows };
}

/** Merge binary coverage runs vertically. One reusable path preserves transparent holes exactly. */
function transparencyPath(frame) {
  const { width, height, indices, data } = frame;
  const rectangles = [];
  let active = new Map();
  for (let y = 0; y < height; y += 1) {
    const next = new Map();
    let x = 0;
    while (x < width) {
      while (x < width && (indices[y * width + x] < 0 || data[(y * width + x) * 4 + 3] === 0)) x += 1;
      const start = x;
      while (x < width && indices[y * width + x] >= 0 && data[(y * width + x) * 4 + 3] > 0) x += 1;
      if (start === x) continue;
      const key = `${start}:${x}`;
      const rectangle = active.get(key) || [start, y, x, y + 1];
      rectangle[3] = y + 1;
      next.set(key, rectangle);
      active.delete(key);
    }
    rectangles.push(...active.values());
    active = next;
  }
  rectangles.push(...active.values());
  return rectangles.map(([x0, y0, x1, y1]) => `M${x0} ${y0}H${x1}V${y1}H${x0}Z`).join('');
}

function createContext(frame, settings) {
  const parts = [];
  const used = new Set();
  const colors = frame.palette.map(colorHex);
  let pointCount = 0;
  return {
    frame, settings, parts, used, sample: makeSampler(frame),
    get pointCount() { return pointCount; },
    emit(tag, attributes, cell, points = 1, stroke = false) {
      if (!cell || cell.index < 0 || cell.alpha <= 0) return;
      if (parts.length >= settings.maxShapes) throw new Error('The vectorizer exceeded its shape budget.');
      const paint = stroke ? `fill="none" stroke="${colors[cell.index]}"` : `fill="${colors[cell.index]}"`;
      const opacity = cell.alpha < 0.9995 ? ` opacity="${fmt(Math.max(0.001, cell.alpha))}"` : '';
      parts.push(`<${tag} ${attributes} ${paint}${opacity}/>`);
      pointCount += points;
      used.add(cell.index);
    },
  };
}

function rect(context, x, y, width, height, cell) {
  if (['pixels', 'runs'].includes(context.settings.method) && context.settings.mosaicInset) {
    const inset = context.settings.mosaicInset;
    x += width * inset; y += height * inset;
    width *= 1 - 2 * inset; height *= 1 - 2 * inset;
  }
  // Touching sampled tiles must snap consistently to device pixels. Otherwise
  // independent antialiasing creates bright seams between fractional rectangles.
  const crisp = ['pixels', 'runs', 'quadtree'].includes(context.settings.method) ? ' shape-rendering="crispEdges"' : '';
  context.emit('rect', `x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}"${crisp}`, cell, 4);
}

function polygon(context, points, cell) {
  if (context.settings.mosaicInset) {
    const center = points.reduce(([x, y], point) => [x + point[0] / points.length, y + point[1] / points.length], [0, 0]);
    const scale = 1 - 2 * context.settings.mosaicInset;
    points = points.map(([x, y]) => [center[0] + (x - center[0]) * scale, center[1] + (y - center[1]) * scale]);
  }
  context.emit('polygon', `points="${points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')}"`, cell, points.length);
}

function line(context, x1, y1, x2, y2, cell, thickness) {
  context.emit('line', `x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke-width="${fmt(Math.max(0.05, thickness))}" stroke-linecap="round"`, cell, 2, true);
}

function tiles(context, merged = false) {
  const grid = makeGrid(context, context.settings.target);
  const { rows, columns, cells, dx, dy } = grid;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns;) {
      const cell = cells[y * columns + x];
      let end = x + 1;
      if (merged) {
        while (end < columns && cells[y * columns + end].index === cell.index
          && Math.abs(cells[y * columns + end].alpha - cell.alpha) < 0.005) end += 1;
      }
      rect(context, x * dx, y * dy, (end - x) * dx, dy, cell);
      x = end;
    }
  }
}

// Directed cell edges keep filled pixels on the right. The right-turn rule separates
// diagonally touching regions and traces hole loops in the opposite direction.
function traceBoundaries(grid) {
  const { rows, columns, cells } = grid;
  const stride = columns + 1;
  const groups = new Map();
  const add = (index, x, y, direction) => {
    let edges = groups.get(index);
    if (!edges) { edges = new Map(); groups.set(index, edges); }
    const vertex = y * stride + x;
    edges.set(vertex, (edges.get(vertex) || 0) | (1 << direction));
  };
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const index = cells[y * columns + x].index;
      if (index < 0) continue;
      if (y === 0 || cells[(y - 1) * columns + x].index !== index) add(index, x, y, 0);
      if (x === columns - 1 || cells[y * columns + x + 1].index !== index) add(index, x + 1, y, 1);
      if (y === rows - 1 || cells[(y + 1) * columns + x].index !== index) add(index, x + 1, y + 1, 2);
      if (x === 0 || cells[y * columns + x - 1].index !== index) add(index, x, y + 1, 3);
    }
  }
  const offsets = [1, stride, -1, -stride];
  const result = [];
  for (const [index, edges] of groups) {
    const loops = [];
    while (edges.size) {
      const [start, firstBits] = edges.entries().next().value;
      let vertex = start;
      let direction = [0, 1, 2, 3].find((candidate) => firstBits & (1 << candidate));
      const loop = [];
      do {
        loop.push([vertex % stride, Math.floor(vertex / stride)]);
        const bits = edges.get(vertex) & ~(1 << direction);
        if (bits) edges.set(vertex, bits); else edges.delete(vertex);
        vertex += offsets[direction];
        if (vertex === start) break;
        const next = edges.get(vertex) || 0;
        direction = [(direction + 1) % 4, direction, (direction + 3) % 4, (direction + 2) % 4]
          .find((candidate) => next & (1 << candidate));
        if (direction === undefined) throw new Error('A color boundary could not be closed.');
      } while (vertex !== start);
      // Remove collinear vertices without changing the boundary.
      const corners = loop.filter((point, offset) => {
        const previous = loop[(offset + loop.length - 1) % loop.length];
        const next = loop[(offset + 1) % loop.length];
        return (point[0] - previous[0]) * (next[1] - point[1])
          !== (point[1] - previous[1]) * (next[0] - point[0]);
      });
      if (corners.length >= 3) loops.push(corners);
    }
    result.push({ index, loops });
  }
  return result;
}

function segmentDistanceSquared(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length, 0, 1) : 0;
  return (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2;
}

// Iterative RDP avoids recursion limits on detailed paths.
function simplifyOpen(points, tolerance) {
  if (points.length <= 2 || tolerance <= 0) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const pending = [[0, points.length - 1]];
  const threshold = tolerance * tolerance;
  while (pending.length) {
    const [start, end] = pending.pop();
    let farthest = -1;
    let distance = threshold;
    for (let index = start + 1; index < end; index += 1) {
      const candidate = segmentDistanceSquared(points[index], points[start], points[end]);
      if (candidate > distance) { farthest = index; distance = candidate; }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      pending.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function simplifyLoop(points, tolerance) {
  if (points.length <= 4 || tolerance <= 0) return points;
  let opposite = 1;
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = (points[index][0] - points[0][0]) ** 2 + (points[index][1] - points[0][1]) ** 2;
    if (candidate > distance) { opposite = index; distance = candidate; }
  }
  const first = simplifyOpen(points.slice(0, opposite + 1), tolerance);
  const second = simplifyOpen([...points.slice(opposite), points[0]], tolerance);
  const simplified = [...first.slice(0, -1), ...second.slice(0, -1)];
  return simplified.length >= 3 ? simplified : points;
}

function contours(context, variant) {
  const grid = makeGrid(context, context.settings.target);
  const alphaByColor = new Map();
  for (const cell of grid.cells) {
    if (cell.index < 0) continue;
    const entry = alphaByColor.get(cell.index) || [0, 0];
    entry[0] += cell.alpha * cell.count;
    entry[1] += cell.count;
    alphaByColor.set(cell.index, entry);
  }
  for (const { index, loops } of traceBoundaries(grid)) {
    let pointsCount = 0;
    const path = loops.filter(loop => {
      const area = Math.abs(loop.reduce((sum, p, i) => {
        const q = loop[(i + 1) % loop.length]; return sum + p[0] * q[1] - q[0] * p[1];
      }, 0)) * grid.dx * grid.dy / 2;
      return area >= context.settings.contourMinArea;
    }).map((loop) => {
      const reduced = variant === 'contours' ? loop : simplifyLoop(loop, context.settings.simplify * 0.35);
      const points = reduced.map(([x, y]) => [x * grid.dx, y * grid.dy]);
      pointsCount += points.length;
      if (variant === 'smooth-contours') {
        // Round only a local neighborhood of each corner. Using whole-edge
        // midpoints turns long bands into ovals and removes large filled areas.
        const radius = Math.min(grid.dx, grid.dy) * (0.35 + context.settings.simplify * 0.08) * context.settings.cornerRounding;
        let result = '';
        for (let offset = 0; offset < points.length; offset += 1) {
          const current = points[offset];
          const previous = points[(offset + points.length - 1) % points.length];
          const next = points[(offset + 1) % points.length];
          const incoming = Math.hypot(previous[0] - current[0], previous[1] - current[1]);
          const outgoing = Math.hypot(next[0] - current[0], next[1] - current[1]);
          // Keep viewport intersections and corners exact, including long bands
          // whose ends meet the image border.
          const onBorder = current[0] <= 1e-7 || current[1] <= 1e-7
            || current[0] >= context.frame.width - 1e-7 || current[1] >= context.frame.height - 1e-7;
          const distance = onBorder ? 0 : Math.min(radius, incoming * 0.45, outgoing * 0.45);
          const entry = distance > 0 ? [current[0] + (previous[0] - current[0]) * distance / incoming,
            current[1] + (previous[1] - current[1]) * distance / incoming] : current;
          result += `${offset ? 'L' : 'M'}${fmt(entry[0])} ${fmt(entry[1])}`;
          if (distance > 0) {
            const exit = [current[0] + (next[0] - current[0]) * distance / outgoing,
              current[1] + (next[1] - current[1]) * distance / outgoing];
            result += `Q${fmt(current[0])} ${fmt(current[1])} ${fmt(exit[0])} ${fmt(exit[1])}`;
            pointsCount += 2;
          }
        }
        return `${result}Z`;
      }
      return `${points.map(([x, y], offset) => `${offset ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join('')}Z`;
    }).join('');
    const [totalAlpha, count] = alphaByColor.get(index);
    if (path) context.emit('path', `d="${path}" fill-rule="evenodd"`, { index, alpha: totalAlpha / count }, pointsCount);
  }
}

function triangles(context) {
  const { columns, rows, dx, dy } = makeGrid(context, Math.max(1, Math.floor(context.settings.target / 2)));
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const x0 = x * dx;
      const y0 = y * dy;
      const x1 = x0 + dx;
      const y1 = y0 + dy;
      const flip = context.settings.triangleDirection === 'alternating' ? (x + y) % 2 === 0
        : context.settings.triangleDirection === 'backward';
      const firstHalf = (px, py) => flip ? (px - x0) / dx >= (py - y0) / dy : (px - x0) / dx + (py - y0) / dy <= 1;
      const a = context.sample(x0, y0, x1, y1, firstHalf);
      const b = context.sample(x0, y0, x1, y1, (px, py) => !firstHalf(px, py));
      // A subpixel triangle can have no pixel center, so use its partner's sample.
      const first = a.index < 0 && a.count === 0 ? b : a;
      const second = b.index < 0 && b.count === 0 ? a : b;
      polygon(context, flip ? [[x0, y0], [x1, y0], [x1, y1]] : [[x0, y0], [x1, y0], [x0, y1]], first);
      polygon(context, flip ? [[x0, y0], [x1, y1], [x0, y1]] : [[x1, y0], [x1, y1], [x0, y1]], second);
    }
  }
}

function hexagons(context) {
  const { width, height } = context.frame;
  const budget = context.settings.target;
  let radius = Math.max(0.6, Math.sqrt(width * height / (2.598076211 * budget)));
  let centers;
  for (;;) {
    const dx = Math.sqrt(3) * radius;
    const dy = 1.5 * radius;
    centers = [];
    for (let row = 0; row * dy - radius < height; row += 1) {
      const shift = row % 2 ? dx / 2 : 0;
      for (let column = -1; column * dx + shift - dx / 2 < width; column += 1) {
        const x = column * dx + shift;
        const y = row * dy;
        if (x + dx / 2 > 0) centers.push([x, y]);
      }
    }
    if (centers.length <= budget) break;
    radius *= Math.max(1.03, Math.sqrt(centers.length / budget) * 1.005);
  }
  const halfWidth = Math.sqrt(3) * radius / 2;
  for (const [x, y] of centers) {
    const cell = context.sample(x - halfWidth, y - radius, x + halfWidth, y + radius,
      (px, py) => Math.abs(px - x) <= halfWidth + 1e-7 && Math.abs(py - y) <= radius - Math.abs(px - x) / Math.sqrt(3) + 1e-7);
    const points = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 3;
      return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
    });
    polygon(context, points, cell);
  }
}

function marks(context, method) {
  const cross = method === 'crosshatching';
  const grid = makeGrid(context, Math.max(1, Math.floor(context.settings.target / (cross ? 2 : 1))));
  const { columns, rows, dx, dy, cells } = grid;
  const random = randomGenerator(context.settings.seed);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const cell = cells[y * columns + x];
      if (cell.index < 0) continue;
      const darkness = (1 - luminance(context.frame.palette[cell.index])) ** context.settings.toneResponse;
      if (darkness < context.settings.toneCutoff) continue;
      const tone = Math.sqrt(0.08 + 0.92 * darkness);
      const cx = (x + 0.5) * dx;
      const cy = (y + 0.5) * dy;
      const size = Math.min(dx, dy);
      if (method === 'dots') {
        context.emit('circle', `cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(size * 0.48 * tone * context.settings.markScale)}"`, cell);
      } else if (method === 'squares') {
        const side = size * 0.96 * tone * context.settings.markScale;
        rect(context, cx - side / 2, cy - side / 2, side, side, cell);
      } else if (method === 'stipple') {
        if (random() > (0.12 + darkness * 0.88) * context.settings.stippleDensity) continue;
        const px = cx + (random() - 0.5) * dx * context.settings.stippleJitter;
        const py = cy + (random() - 0.5) * dy * context.settings.stippleJitter;
        const radius = size * (0.1 + random() * 0.19) * tone * context.settings.markScale;
        context.emit('circle', `cx="${fmt(px)}" cy="${fmt(py)}" r="${fmt(radius)}"`, cell);
      } else if (method === 'horizontal-lines') {
        line(context, cx - dx * .47 * context.settings.strokeLength, cy, cx + dx * .47 * context.settings.strokeLength, cy, cell,
          Math.min(dy * 0.9, context.settings.strokeWidth * dy * 0.42 * tone));
      } else if (method === 'vertical-lines') {
        line(context, cx, cy - dy * .47 * context.settings.strokeLength, cx, cy + dy * .47 * context.settings.strokeLength, cell,
          Math.min(dx * 0.9, context.settings.strokeWidth * dx * 0.42 * tone));
      } else {
        const angle = context.settings.hatchAngle * Math.PI / 180;
        const cosine = Math.cos(angle) * Math.SQRT2;
        const sine = Math.sin(angle) * Math.SQRT2;
        const halfX = dx * (0.12 + tone * 0.3) * context.settings.strokeLength;
        const halfY = dy * (0.12 + tone * 0.3) * context.settings.strokeLength;
        const thickness = Math.min(size * 0.4, context.settings.strokeWidth * size * 0.11);
        line(context, cx - halfX * cosine, cy + halfY * sine, cx + halfX * cosine, cy - halfY * sine, cell, thickness);
        if (cross && darkness > context.settings.crosshatchThreshold) {
          const second = angle + context.settings.crosshatchAngle * Math.PI / 180;
          line(context, cx - halfX * Math.cos(second) * Math.SQRT2, cy + halfY * Math.sin(second) * Math.SQRT2,
            cx + halfX * Math.cos(second) * Math.SQRT2, cy - halfY * Math.sin(second) * Math.SQRT2, cell, thickness);
        }
      }
    }
  }
}

function quadtree(context) {
  const grid = makeGrid(context, context.settings.target * 4);
  const { columns, rows, cells, dx, dy } = grid;
  const evaluate = (x0, y0, x1, y1) => {
    const histogram = new Map();
    let count = 0;
    let alpha = 0;
    let index = -1;
    let best = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const cell = cells[y * columns + x];
        // Transparency is handled by the shared source clip. Choose a visible
        // color whenever one exists, including isolated marks on an empty canvas.
        if (cell.index < 0) continue;
        const total = (histogram.get(cell.index) || 0) + cell.alpha;
        histogram.set(cell.index, total);
        if (total > best) { best = total; index = cell.index; }
        count += 1;
        alpha += cell.alpha;
      }
    }
    const area = (x1 - x0) * (y1 - y0);
    const error = histogram.size > 1 ? alpha - best : 0;
    return { x0, y0, x1, y1, index, alpha: count ? alpha / count : 0, error, area };
  };
  const heap = [];
  const push = (value) => {
    heap.push(value);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heap[parent].error >= value.error) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = value;
  };
  const pop = () => {
    const result = heap[0];
    const value = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].error > heap[child].error) child += 1;
        if (heap[child].error <= value.error) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = value;
    }
    return result;
  };
  push(evaluate(0, 0, columns, rows));
  const finished = [];
  let leafCount = 1;
  while (heap.length) {
    const node = pop();
    const { x0, y0, x1, y1 } = node;
    const middleX = Math.floor((x0 + x1) / 2);
    const middleY = Math.floor((y0 + y1) / 2);
    const xs = x1 - x0 > 1 ? [x0, middleX, x1] : [x0, x1];
    const ys = y1 - y0 > 1 ? [y0, middleY, y1] : [y0, y1];
    const children = (xs.length - 1) * (ys.length - 1);
    const threshold = (1 - context.settings.complexity / 100) * 0.32 * context.settings.quadtreeTolerance;
    if (children === 1 || Math.min((x1 - x0) * dx, (y1 - y0) * dy) <= context.settings.quadtreeMinSize
      || node.error / node.area <= threshold || leafCount + children - 1 > context.settings.target) {
      finished.push(node);
      continue;
    }
    leafCount += children - 1;
    for (let y = 0; y < ys.length - 1; y += 1) {
      for (let x = 0; x < xs.length - 1; x += 1) push(evaluate(xs[x], ys[y], xs[x + 1], ys[y + 1]));
    }
  }
  for (const node of finished) rect(context, node.x0 * dx, node.y0 * dy,
    (node.x1 - node.x0) * dx, (node.y1 - node.y0) * dy, node);
}

function edgeStrokes(context) {
  const grid = makeGrid(context, Math.max(1, Math.floor(context.settings.target / 4)));
  const { columns, rows, cells, dx, dy } = grid;
  const threshold = context.settings.edgeThreshold;
  const boundary = (first, second) => {
    if (first.index < 0 && (!second || second.index < 0)) return null;
    if (!second || second.index < 0) return first.index >= 0 ? first : null;
    if (first.index < 0) return second;
    if (first.index === second.index) return null;
    const a = context.frame.palette[first.index];
    const b = context.frame.palette[second.index];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= threshold) return null;
    return luminance(a) <= luminance(b) ? first : second;
  };
  const thickness = Math.min(dx, dy) * 0.12 * context.settings.strokeWidth;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const cell = cells[y * columns + x];
      const left = boundary(cell, x ? cells[y * columns + x - 1] : null);
      const top = boundary(cell, y ? cells[(y - 1) * columns + x] : null);
      if (left) line(context, x * dx, y * dy, x * dx, (y + 1) * dy, left, thickness);
      if (top) line(context, x * dx, y * dy, (x + 1) * dx, y * dy, top, thickness);
      if (x === columns - 1 && cell.index >= 0) line(context, (x + 1) * dx, y * dy, (x + 1) * dx, (y + 1) * dy, cell, thickness);
      if (y === rows - 1 && cell.index >= 0) line(context, x * dx, (y + 1) * dy, (x + 1) * dx, (y + 1) * dy, cell, thickness);
    }
  }
}

function clipHalfPlane(points, nx, ny, limit) {
  if (!points.length) return points;
  const result = [];
  let previous = points[points.length - 1];
  let previousDistance = nx * previous[0] + ny * previous[1] - limit;
  for (const current of points) {
    const distance = nx * current[0] + ny * current[1] - limit;
    if ((distance <= 1e-7) !== (previousDistance <= 1e-7)) {
      const t = previousDistance / (previousDistance - distance);
      result.push([previous[0] + t * (current[0] - previous[0]), previous[1] + t * (current[1] - previous[1])]);
    }
    if (distance <= 1e-7) result.push(current);
    previous = current;
    previousDistance = distance;
  }
  return result;
}

// Exact half-plane clipping with spatial pruning. A site farther than twice the
// current cell radius cannot cut that cell, so distant buckets can be skipped.
function voronoiCells(sites, width, height) {
  const size = Math.sqrt(width * height / sites.length);
  const columns = Math.max(1, Math.ceil(width / size)), rows = Math.max(1, Math.ceil(height / size));
  const buckets = new Map();
  sites.forEach(([x, y], index) => {
    const key = Math.min(rows - 1, Math.floor(y / size)) * columns + Math.min(columns - 1, Math.floor(x / size));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  });
  return sites.map(([x, y], index) => {
    let points = [[0, 0], [width, 0], [width, height], [0, height]];
    const cx = Math.min(columns - 1, Math.floor(x / size)), cy = Math.min(rows - 1, Math.floor(y / size));
    for (let ring = 0; ring < Math.max(columns, rows); ring++) {
      const left = Math.max(0, cx - ring), right = Math.min(columns - 1, cx + ring);
      const top = Math.max(0, cy - ring), bottom = Math.min(rows - 1, cy + ring);
      const candidates = [];
      const add = (bx, by) => { for (const other of buckets.get(by * columns + bx) || []) if (other !== index) candidates.push(other); };
      // Enumerate only the new ring, including grids much thinner than tall.
      for (let by = top; by <= bottom; by++) {
        if (Math.abs(by - cy) === ring) for (let bx = left; bx <= right; bx++) add(bx, by);
        else {
          if (cx - ring >= 0) add(cx - ring, by);
          if (ring && cx + ring < columns) add(cx + ring, by);
        }
      }
      const distance = other => (sites[other][0] - x) ** 2 + (sites[other][1] - y) ** 2;
      candidates.sort((a, b) => distance(a) - distance(b));
      for (const other of candidates) {
        const [ox, oy] = sites[other];
        points = clipHalfPlane(points, 2 * (ox - x), 2 * (oy - y), ox * ox + oy * oy - x * x - y * y);
      }
      const radius = Math.sqrt(Math.max(0, ...points.map(([px, py]) => (px - x) ** 2 + (py - y) ** 2)));
      const unvisited = Math.min(left > 0 ? x - left * size : Infinity,
        right < columns - 1 ? (right + 1) * size - x : Infinity,
        top > 0 ? y - top * size : Infinity, bottom < rows - 1 ? (bottom + 1) * size - y : Infinity);
      if (unvisited > 2 * radius + 1e-7) break;
    }
    return points;
  });
}

function voronoi(context) {
  const { width, height } = context.frame, s = context.settings;
  const target = Math.max(1, Math.floor(Math.min(s.maxShapes, s.voronoiSites) * (s.voronoiCountMode === 'detail' ? s.density : 1)));
  const rows = Math.max(1, Math.min(target, Math.round(Math.sqrt(target * height / width * s.voronoiAspect))));
  const random = randomGenerator(s.seed);
  let sites = [];
  for (let y = 0; y < rows; y++) {
    const columns = Math.floor(target / rows) + (y < target % rows ? 1 : 0);
    for (let x = 0; x < columns; x++) sites.push([
      (x + .5 + (random() - .5) * s.voronoiJitter) * width / columns,
      (y + .5 + (random() - .5) * s.voronoiJitter) * height / rows,
    ]);
  }
  let cells;
  for (let pass = 0; pass <= s.voronoiRelaxation; pass++) {
    cells = voronoiCells(sites, width, height);
    if (pass === s.voronoiRelaxation) break;
    sites = cells.map((points, index) => {
      let area = 0, x = 0, y = 0;
      points.forEach((a, i) => {
        const b = points[(i + 1) % points.length], cross = a[0] * b[1] - b[0] * a[1];
        area += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
      });
      return Math.abs(area) > 1e-12 ? [x / (3 * area), y / (3 * area)] : sites[index];
    });
  }
  cells.forEach((points, index) => {
    if (points.length < 3) return;
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    let cell = context.sample(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (px, py) =>
      points.every((a, i) => {
        const b = points[(i + 1) % points.length];
        return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) >= -1e-7;
      }));
    // Subpixel cells still receive a color; the shared alpha mask retains holes.
    if (!cell.count) {
      const x = Math.min(width - 1, Math.floor(sites[index][0])), y = Math.min(height - 1, Math.floor(sites[index][1]));
      cell = context.sample(x, y, x + 1, y + 1);
    }
    polygon(context, points, cell);
  });
}

function hilbertPoints(order) {
  const side = 2 ** order, result = [];
  for (let d = 0; d < side * side; d++) {
    let t = d, x = 0, y = 0;
    for (let scale = 1; scale < side; scale *= 2) {
      const rx = 1 & (t >> 1), ry = 1 & (t ^ rx);
      if (!ry) { if (rx) { x = scale - 1 - x; y = scale - 1 - y; } [x, y] = [y, x]; }
      x += scale * rx; y += scale * ry; t >>= 2;
    }
    result.push([(x + .5) / side, (y + .5) / side]);
  }
  return result;
}

function continuousLines(context) {
  const { frame, settings: s } = context, { width, height, palette, indices, data } = frame;
  const count = Math.min(s.lineCount, s.maxShapes);
  // Bound path vertices independently from shape count; one path can be huge.
  const samples = Math.max(8, Math.min(Math.floor(250000 / count), Math.round(s.lineSamples * (.15 + .85 * s.complexity / 100))));
  const histogram = new Float64Array(palette.length);
  for (let i = 0; i < indices.length; i++) if (indices[i] >= 0) histogram[indices[i]] += data[i * 4 + 3];
  const candidates = Array.from(histogram, (weight, index) => ({ weight, index })).filter(p => p.weight > 0)
    .sort((a, b) => a.weight - b.weight || a.index - b.index);
  if (!candidates.length) return;
  const colorDistance = (a, b) => palette[a].reduce((sum, value, channel) => sum + (value - palette[b][channel]) ** 2, 0);
  const inks = [candidates.reduce((best, item) => luminance(palette[item.index]) < luminance(palette[best]) ? item.index : best, candidates[0].index)];
  while (inks.length < Math.min(s.lineColors, count, candidates.length)) {
    const next = candidates.filter(p => !inks.includes(p.index)).sort((a, b) =>
      Math.min(...inks.map(ink => colorDistance(b.index, ink))) * Math.sqrt(b.weight)
      - Math.min(...inks.map(ink => colorDistance(a.index, ink))) * Math.sqrt(a.weight))[0];
    inks.push(next.index);
  }
  const nearestInk = palette.map((_, index) => inks.reduce((best, ink) => colorDistance(index, ink) < colorDistance(index, best) ? ink : best, inks[0]));
  const sample = (x, y) => {
    const px = clamp(Math.floor(x), 0, width - 1), py = clamp(Math.floor(y), 0, height - 1), i = py * width + px;
    const index = indices[i], alpha = index < 0 ? 0 : data[i * 4 + 3] / 255;
    const dark = 1 - luminance([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
    return { index, alpha, dark: clamp(dark, 0, 1) ** s.toneResponse };
  };
  const random = randomGenerator(s.seed), angle = s.lineAngle * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const rotate = ([x, y]) => [clamp(width / 2 + (x - width / 2) * cosine - (y - height / 2) * sine, 0, width),
    clamp(height / 2 + (x - width / 2) * sine + (y - height / 2) * cosine, 0, height)];
  const hilbert = s.method === 'hilbert-squiggles' ? hilbertPoints(s.hilbertOrder) : null;
  const short = Math.min(width, height);
  for (let lineIndex = 0; lineIndex < count; lineIndex++) {
    let ink = inks[lineIndex % inks.length];
    // Each ink covers the full image with its own share of the requested paths.
    // Otherwise a color assigned to one spiral/Hilbert segment cannot depict
    // that color anywhere outside that arbitrary segment of the image.
    const layers = s.lineColorMode === 'layered' ? inks.length : 1;
    const layerIndex = Math.floor(lineIndex / layers);
    const layerCount = Math.floor((count - 1 - lineIndex % layers) / layers) + 1;
    const base = [];
    let fx = random() * width, fy = random() * height, direction = random() * Math.PI * 2;
    const phaseOffset = random() * Math.PI * 2;
    if (s.method === 'flow-squiggles') {
      // Pick a visible, tone-weighted start without an unbounded rejection loop.
      let best = -1;
      for (let trial = 0; trial < 24; trial++) {
        const x = random() * width, y = random() * height, p = sample(x, y);
        const match = p.index >= 0 && nearestInk[p.index] === ink ? 1 : .02;
        const weight = p.alpha * (.05 + p.dark) * match * random();
        if (weight > best) { best = weight; fx = x; fy = y; }
      }
    }
    for (let step = 0; step < samples; step++) {
      const u = step / (samples - 1), t = (layerIndex + u) / layerCount;
      let point;
      if (s.method === 'wave-squiggles') point = [u * width, (layerIndex + .5) * height / layerCount];
      else if (s.method === 'serpentine-squiggles') {
        const progress = Math.min(s.serpentineRows - 1e-9, u * s.serpentineRows), row = Math.floor(progress), v = progress - row;
        // A short vertical connector between alternating traversals stays continuous.
        const across = Math.min(1, v / .9), join = Math.max(0, (v - .9) / .1);
        point = [(row % 2 ? 1 - across : across) * width,
          (layerIndex + (row + .5 + (row < s.serpentineRows - 1 ? join : 0)) / s.serpentineRows) * height / layerCount];
      } else if (s.method === 'spiral-squiggles') {
        const theta = t * s.spiralTurns * Math.PI * 2, a = Math.cos(theta), b = Math.sin(theta);
        const radius = .98 * t / Math.max(Math.abs(a), Math.abs(b));
        point = [width / 2 * (1 + radius * a), height / 2 * (1 + radius * b)];
      } else if (hilbert) {
        const position = Math.min(hilbert.length - 1.000001, t * (hilbert.length - 1)), i = Math.floor(position), v = position - i;
        point = [(hilbert[i][0] * (1 - v) + hilbert[i + 1][0] * v) * width,
          (hilbert[i][1] * (1 - v) + hilbert[i + 1][1] * v) * height];
      } else {
        point = [fx, fy];
        const gx = sample(fx + 1, fy).dark - sample(fx - 1, fy).dark, gy = sample(fx, fy + 1).dark - sample(fx, fy - 1).dark;
        const tangent = Math.atan2(gy, gx) + Math.PI / 2;
        const turn = Math.atan2(Math.sin(tangent - direction), Math.cos(tangent - direction));
        direction += turn * Math.min(.6, Math.hypot(gx, gy) * s.flowInfluence)
          + Math.sin(step * .035 + phaseOffset) * s.lineDensity * .025;
        const local = sample(fx, fy);
        const strength = local.alpha * local.dark * (inks.length === 1 || local.index >= 0 && nearestInk[local.index] === ink ? 1 : .02);
        const distance = short * s.flowLength / samples * (1.8 - 1.5 * strength);
        let nx = fx + Math.cos(direction) * distance, ny = fy + Math.sin(direction) * distance;
        if (nx < 0 || nx > width) { direction = Math.PI - direction; nx = clamp(nx, 0, width); }
        if (ny < 0 || ny > height) { direction = -direction; ny = clamp(ny, 0, height); }
        fx = nx; fy = ny;
      }
      base.push(rotate(point));
    }
    if (s.lineColorMode === 'dominant') {
      const votes = new Map(inks.map(index => [index, 0]));
      for (const [x, y] of base) { const p = sample(x, y); if (p.index >= 0) votes.set(nearestInk[p.index], votes.get(nearestInk[p.index]) + p.alpha); }
      ink = [...votes].sort((a, b) => b[1] - a[1])[0][0];
    }
    let phase = phaseOffset, alpha = 0, visible = 0;
    const points = base.map(([x, y], i) => {
      const p = sample(x, y), previous = base[Math.max(0, i - 1)], next = base[Math.min(samples - 1, i + 1)];
      const dx = next[0] - previous[0], dy = next[1] - previous[1], length = Math.hypot(dx, dy) || 1;
      const strength = p.alpha * p.dark * (inks.length === 1 || p.index >= 0 && nearestInk[p.index] === ink ? 1 : .04);
      const tone = s.lineDensityFloor + (1 - s.lineDensityFloor) * strength;
      phase += Math.PI * 2 * s.lineFrequency * (1 + strength * s.lineDensity) / samples;
      const spacing = s.method === 'serpentine-squiggles' ? height / (layerCount * s.serpentineRows)
        : s.method === 'hilbert-squiggles' ? short / 2 ** s.hilbertOrder
        : s.method === 'spiral-squiggles' ? short / (2 * s.spiralTurns)
        : s.method === 'flow-squiggles' ? short / Math.sqrt(count) * .3 : height / layerCount;
      const offset = Math.sin(phase) * spacing * .45 * s.lineAmplitude * tone;
      if (p.alpha) { alpha += p.alpha; visible++; }
      return [clamp(x - dy / length * offset, 0, width), clamp(y + dx / length * offset, 0, height)];
    });
    if (!visible) continue;
    let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], next = points[i + 1], previous = points[i - 1];
      if (s.lineSmoothing) {
        const entry = p.map((v, axis) => v + (previous[axis] - v) * .5 * s.lineSmoothing);
        const exit = p.map((v, axis) => v + (next[axis] - v) * .5 * s.lineSmoothing);
        d += `L${fmt(entry[0])} ${fmt(entry[1])}Q${fmt(p[0])} ${fmt(p[1])} ${fmt(exit[0])} ${fmt(exit[1])}`;
      } else d += `L${fmt(p[0])} ${fmt(p[1])}`;
    }
    d += `L${fmt(points.at(-1)[0])} ${fmt(points.at(-1)[1])}`;
    context.emit('path', `d="${d}" stroke-width="${fmt(s.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"`,
      { index: ink, alpha: alpha / visible }, points.length * (s.lineSmoothing ? 3 : 1), true);
  }
}

/**
 * Convert a palette-quantized RGBA image to self-contained SVG geometry.
 * Complexity controls sample density (and adaptive subdivision), independently of
 * the hard visible-element budget. Contour paths may contain multiple loops.
 * elementCount excludes the optional single shared transparency clip path.
 * pointCount measures visible geometry, so contour complexity is inspectable.
 * Binary transparency is exact; nonzero alpha is averaged within each sample.
 */
export function convertToSVG(frame, options = {}) {
  const visiblePixels = validateFrame(frame);
  if (!options || typeof options !== 'object') throw new TypeError('Conversion options must be an object.');
  const method = options.method ?? 'contours';
  if (!METHOD_IDS.has(method)) throw new RangeError(`Unknown SVG conversion method: ${String(method)}.`);
  const complexity = numberOption(options.complexity, 45, 1, 100);
  const maxShapes = Math.floor(numberOption(options.maxShapes, 8000, 4, 30000));
  const density = 0.005 + 0.995 * (complexity / 100) ** 1.5;
  const settings = {
    method, complexity, maxShapes, density,
    target: Math.min(frame.width * frame.height, maxShapes, Math.max(1, Math.floor(numberOption(options.samplingCount, 0, 0, 30000)
      || Math.max(16, Math.floor(maxShapes * density))))),
    simplify: numberOption(options.simplify, 1, 0, 5),
    strokeWidth: numberOption(options.strokeWidth, 1, 0.05, 20),
    seed: Math.round(numberOption(options.seed, 42, -2147483648, 4294967295)),
    gridAspect: numberOption(options.gridAspect, 1, 0.1, 10),
    contourMinArea: numberOption(options.contourMinArea, 0, 0, 4096),
    cornerRounding: numberOption(options.cornerRounding, 1, 0, 3),
    quadtreeTolerance: numberOption(options.quadtreeTolerance, 1, 0, 3),
    quadtreeMinSize: numberOption(options.quadtreeMinSize, 1, 1, 128),
    triangleDirection: ['alternating', 'forward', 'backward'].includes(options.triangleDirection) ? options.triangleDirection : 'alternating',
    mosaicInset: numberOption(options.mosaicInset, 0, 0, 0.45),
    markScale: numberOption(options.markScale, 1, 0.05, 5),
    toneResponse: numberOption(options.toneResponse, 1, 0.1, 5),
    toneCutoff: numberOption(options.toneCutoff, 0, 0, 1),
    stippleDensity: numberOption(options.stippleDensity, 1, 0.05, 4),
    strokeLength: numberOption(options.strokeLength, 1, 0.05, 3),
    edgeThreshold: numberOption(options.edgeThreshold, 12, 0, 442),
    stippleJitter: numberOption(options.stippleJitter, 0.72, 0, 1),
    hatchAngle: numberOption(options.hatchAngle, 45, 0, 180),
    crosshatchThreshold: numberOption(options.crosshatchThreshold, 0.2, 0, 1),
    crosshatchAngle: numberOption(options.crosshatchAngle, 90, 0, 180),
    voronoiSites: Math.floor(numberOption(options.voronoiSites, 768, 1, 30000)),
    voronoiCountMode: options.voronoiCountMode === 'detail' ? 'detail' : 'exact',
    voronoiAspect: numberOption(options.voronoiAspect, 1, .1, 10),
    voronoiRelaxation: Math.floor(numberOption(options.voronoiRelaxation, 0, 0, 5)),
    voronoiJitter: numberOption(options.voronoiJitter, 0.7, 0, 1),
    lineCount: Math.floor(numberOption(options.lineCount, 48, 1, 512)),
    lineColors: Math.floor(numberOption(options.lineColors, 4, 1, 64)),
    lineColorMode: options.lineColorMode === 'dominant' ? 'dominant' : 'layered',
    lineSamples: Math.floor(numberOption(options.lineSamples, 1200, 64, 8192)),
    lineAmplitude: numberOption(options.lineAmplitude, 1, 0, 5),
    lineFrequency: numberOption(options.lineFrequency, 32, 1, 160),
    lineDensity: numberOption(options.lineDensity, 2, 0, 8),
    lineDensityFloor: numberOption(options.lineDensityFloor, .08, 0, 1),
    lineAngle: numberOption(options.lineAngle, 0, 0, 180),
    lineSmoothing: numberOption(options.lineSmoothing, .65, 0, 1),
    serpentineRows: Math.floor(numberOption(options.serpentineRows, 6, 1, 64)),
    spiralTurns: numberOption(options.spiralTurns, 24, 1, 160),
    flowLength: numberOption(options.flowLength, 4, .25, 20),
    flowInfluence: numberOption(options.flowInfluence, 1, 0, 4),
    hilbertOrder: Math.floor(numberOption(options.hilbertOrder, 5, 1, 7)),
  };
  const context = createContext(frame, settings);
  if (visiblePixels) {
    if (method.endsWith('contours')) contours(context, method);
    else if (method === 'pixels' || method === 'runs') tiles(context, method === 'runs');
    else if (method === 'quadtree') quadtree(context);
    else if (method === 'triangles') triangles(context);
    else if (method === 'hexagons') hexagons(context);
    else if (method === 'edges') edgeStrokes(context);
    else if (method === 'voronoi') voronoi(context);
    else if (method.endsWith('-squiggles')) continuousLines(context);
    else marks(context, method);
  }
  let body = context.parts.join('');
  if (visiblePixels > 0 && visiblePixels < frame.width * frame.height && body) {
    body = `<defs><clipPath id="image-to-svg-coverage"><path d="${transparencyPath(frame)}"/></clipPath></defs><g clip-path="url(#image-to-svg-coverage)">${body}</g>`;
  }
  const { width, height } = frame;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return { svg, elementCount: context.parts.length, colorsUsed: context.used.size, pointCount: context.pointCount, width, height, method };
}
