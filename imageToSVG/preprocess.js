/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

/** CPU-only image preparation, shared by the app worker and Node checks.
 * Sources are { width, height, data: RGBA array }. Crop values are fractions.
 * Cropping/downsampling precede the ordered, enabled { type, value } filters.
 * Returned data is filtered RGBA before palette quantization; indices address
 * palette RGB triples, with -1 for pixels below the alpha threshold.
 * Color mode is applied after the filter stack, before palette construction.
 */
export const FILTERS = Object.freeze([
  { id: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1, defaultValue: 10, unit: '%' },
  { id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, defaultValue: 20, unit: '%' },
  { id: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, defaultValue: 20, unit: '%' },
  { id: 'hue', label: 'Hue rotation', min: -180, max: 180, step: 1, defaultValue: 30, unit: '°' },
  { id: 'gamma', label: 'Gamma', amountLabel: 'Gamma correction', min: 0.1, max: 4, step: 0.05, defaultValue: 1.2 },
  { id: 'grayscale', label: 'Grayscale', min: 0, max: 100, step: 1, defaultValue: 100, unit: '%' },
  { id: 'sepia', label: 'Sepia', min: 0, max: 100, step: 1, defaultValue: 70, unit: '%' },
  { id: 'invert', label: 'Invert', min: 0, max: 100, step: 1, defaultValue: 100, unit: '%' },
  { id: 'threshold', label: 'Threshold', amountLabel: 'Threshold cutoff', min: 0, max: 255, step: 1, defaultValue: 128 },
  { id: 'posterize', label: 'Posterize', amountLabel: 'Posterize levels', min: 2, max: 32, step: 1, defaultValue: 5 },
  { id: 'blur', label: 'Blur', amountLabel: 'Blur radius (px)', min: 0, max: 12, step: 1, defaultValue: 2, unit: 'px' },
  { id: 'sharpen', label: 'Sharpen', amountLabel: 'Sharpen strength', min: 0, max: 4, step: 0.1, defaultValue: 1 },
]);

export const DEFAULT_OPTIONS = Object.freeze({
  maxDimension: 320, resample: 'area', colors: 8, colorMode: 'rgb',
  quantizer: 'median-cut', dither: 'none', alphaThreshold: 16,
  transparency: 'preserve', darkColor: '#132a40', lightColor: '#f6d8a0',
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const FILTER_MAP = new Map(FILTERS.map(filter => [filter.id, filter]));

function validate(source) {
  if (!source || !Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height)
    || source.width < 1 || source.height < 1 || source.width * source.height > 64_000_000
    || !source.data || source.data.length < source.width * source.height * 4) {
    throw new TypeError('Provide a nonempty RGBA image with integer dimensions (at most 64 million pixels).');
  }
}

function settings(options = {}) {
  options = options && typeof options === 'object' ? options : {};
  const choose = (key, choices) => choices.includes(options[key]) ? options[key] : DEFAULT_OPTIONS[key];
  return {
    ...options,
    maxDimension: Math.round(clamp(finite(options.maxDimension, 320), 32, 1024)),
    colors: Math.round(clamp(finite(options.colors, 8), 2, 64)),
    alphaThreshold: Math.round(clamp(finite(options.alphaThreshold, 16), 1, 255)),
    resample: choose('resample', ['nearest', 'bilinear', 'area']),
    colorMode: choose('colorMode', ['rgb', 'grayscale', 'monochrome', 'duotone']),
    quantizer: choose('quantizer', ['median-cut', 'kmeans', 'uniform']),
    dither: choose('dither', ['none', 'ordered', 'floyd-steinberg']),
    transparency: choose('transparency', ['preserve', 'white', 'black']),
    darkColor: parseColor(options.darkColor, DEFAULT_OPTIONS.darkColor),
    lightColor: parseColor(options.lightColor, DEFAULT_OPTIONS.lightColor),
  };
}

function parseColor(value, fallback) {
  const hex = typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value.slice(1) : fallback.slice(1);
  const expanded = hex.length === 3 ? [...hex].map(char => char + char).join('') : hex;
  return [0, 2, 4].map(offset => parseInt(expanded.slice(offset, offset + 2), 16));
}

function cropAndResize(source, options) {
  const { width: sw, height: sh } = source;
  const crop = options.crop && typeof options.crop === 'object' ? options.crop : {};
  const x = Math.min(sw - 1, Math.floor(clamp(finite(crop.x, 0), 0, 1) * sw));
  const y = Math.min(sh - 1, Math.floor(clamp(finite(crop.y, 0), 0, 1) * sh));
  const cw = Math.min(sw - x, Math.max(1, Math.round(clamp(finite(crop.width, 1), 0, 1) * sw)));
  const ch = Math.min(sh - y, Math.max(1, Math.round(clamp(finite(crop.height, 1), 0, 1) * sh)));
  const scale = Math.min(1, options.maxDimension / Math.max(cw, ch));
  const width = Math.max(1, Math.round(cw * scale));
  const height = Math.max(1, Math.round(ch * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const sx = cw / width;
  const sy = ch / height;
  const input = source.data;
  for (let oy = 0; oy < height; oy++) {
    for (let ox = 0; ox < width; ox++) {
      const out = (oy * width + ox) * 4;
      let rr = 0, gg = 0, bb = 0, aa = 0, weight = 0;
      const add = (px, py, w) => {
        const p = ((y + py) * sw + x + px) * 4;
        const a = clamp(finite(input[p + 3], 0), 0, 255) / 255;
        rr += clamp(finite(input[p], 0), 0, 255) * a * w;
        gg += clamp(finite(input[p + 1], 0), 0, 255) * a * w;
        bb += clamp(finite(input[p + 2], 0), 0, 255) * a * w;
        aa += a * w;
        weight += w;
      };
      if (options.resample === 'nearest' || (sx === 1 && sy === 1)) {
        add(Math.min(cw - 1, Math.floor((ox + 0.5) * sx)), Math.min(ch - 1, Math.floor((oy + 0.5) * sy)), 1);
      } else if (options.resample === 'bilinear') {
        const px = clamp((ox + 0.5) * sx - 0.5, 0, cw - 1);
        const py = clamp((oy + 0.5) * sy - 0.5, 0, ch - 1);
        const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
        add(ix, iy, (1 - fx) * (1 - fy));
        add(Math.min(ix + 1, cw - 1), iy, fx * (1 - fy));
        add(ix, Math.min(iy + 1, ch - 1), (1 - fx) * fy);
        add(Math.min(ix + 1, cw - 1), Math.min(iy + 1, ch - 1), fx * fy);
      } else {
        const left = ox * sx, right = (ox + 1) * sx, top = oy * sy, bottom = (oy + 1) * sy;
        for (let py = Math.floor(top); py < Math.min(ch, Math.ceil(bottom)); py++) {
          const wy = Math.min(bottom, py + 1) - Math.max(top, py);
          for (let px = Math.floor(left); px < Math.min(cw, Math.ceil(right)); px++) {
            add(px, py, wy * (Math.min(right, px + 1) - Math.max(left, px)));
          }
        }
      }
      const alpha = weight ? aa / weight : 0;
      if (options.transparency === 'preserve') {
        data[out] = aa ? rr / aa : 0;
        data[out + 1] = aa ? gg / aa : 0;
        data[out + 2] = aa ? bb / aa : 0;
        data[out + 3] = alpha * 255;
      } else {
        const background = options.transparency === 'white' ? 255 : 0;
        data[out] = rr / weight + background * (1 - alpha);
        data[out + 1] = gg / weight + background * (1 - alpha);
        data[out + 2] = bb / weight + background * (1 - alpha);
        data[out + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

// Separable box blur uses premultiplied alpha to avoid color fringes.
function blur(source, width, height, radius) {
  radius = Math.round(radius);
  if (!radius) return source.slice();
  const temp = new Float32Array(source.length);
  const premult = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 4) {
    const a = source[i + 3] / 255;
    premult[i] = source[i] * a;
    premult[i + 1] = source[i + 1] * a;
    premult[i + 2] = source[i + 2] * a;
    premult[i + 3] = a;
  }
  const pass = (input, output, horizontal) => {
    const lines = horizontal ? height : width, length = horizontal ? width : height;
    const stride = horizontal ? 4 : width * 4;
    for (let line = 0; line < lines; line++) {
      const start = horizontal ? line * width * 4 : line * 4;
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let p = 0; p <= Math.min(radius, length - 1); p++) sum += input[start + p * stride + c];
        for (let p = 0; p < length; p++) {
          const count = Math.min(length - 1, p + radius) - Math.max(0, p - radius) + 1;
          output[start + p * stride + c] = sum / count;
          if (p - radius >= 0) sum -= input[start + (p - radius) * stride + c];
          if (p + radius + 1 < length) sum += input[start + (p + radius + 1) * stride + c];
        }
      }
    }
  };
  pass(premult, temp, true);
  pass(temp, premult, false);
  const result = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 4) {
    const a = premult[i + 3];
    result[i] = a > 1e-8 ? premult[i] / a : 0;
    result[i + 1] = a > 1e-8 ? premult[i + 1] / a : 0;
    result[i + 2] = a > 1e-8 ? premult[i + 2] / a : 0;
    result[i + 3] = a * 255;
  }
  return result;
}

function hueRotate(r, g, b, degrees) {
  // Rotate hue in HSL while preserving saturation and lightness.
  r /= 255; g /= 255; b /= 255;
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), delta = hi - lo;
  if (!delta) return [r * 255, g * 255, b * 255];
  const light = (hi + lo) / 2;
  const sat = delta / (1 - Math.abs(2 * light - 1));
  let hue = hi === r ? ((g - b) / delta) % 6 : hi === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = ((hue + degrees / 60) % 6 + 6) % 6;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(hue % 2 - 1)), m = light - chroma / 2;
  const triplets = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]];
  return triplets[Math.floor(hue)].map(c => (c + m) * 255);
}

function applyFilters(image, filters) {
  if (!Array.isArray(filters)) return;
  for (const filter of filters.slice(0, 64)) {
    if (!filter || filter.enabled === false || !FILTER_MAP.has(filter.type)) continue;
    const definition = FILTER_MAP.get(filter.type);
    const value = clamp(finite(filter.value, definition.defaultValue), definition.min, definition.max);
    let { data } = image;
    if (filter.type === 'blur') {
      image.data = blur(data, image.width, image.height, value);
      continue;
    }
    if (filter.type === 'sharpen') {
      const smooth = blur(data, image.width, image.height, 1);
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) data[i + c] += value * (data[i + c] - smooth[i + c]);
      }
      continue;
    }
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      const gray = luminance(r, g, b), t = value / 100;
      switch (filter.type) {
        case 'brightness': r += t * 255; g += t * 255; b += t * 255; break;
        case 'contrast': r = (r - 127.5) * (1 + t) + 127.5; g = (g - 127.5) * (1 + t) + 127.5; b = (b - 127.5) * (1 + t) + 127.5; break;
        case 'saturation': r = gray + (r - gray) * (1 + t); g = gray + (g - gray) * (1 + t); b = gray + (b - gray) * (1 + t); break;
        case 'hue': [r, g, b] = hueRotate(r, g, b, value); break;
        case 'gamma': r = 255 * (r / 255) ** (1 / value); g = 255 * (g / 255) ** (1 / value); b = 255 * (b / 255) ** (1 / value); break;
        case 'grayscale': r += (gray - r) * t; g += (gray - g) * t; b += (gray - b) * t; break;
        case 'sepia': {
          const sr = r * 0.393 + g * 0.769 + b * 0.189;
          const sg = r * 0.349 + g * 0.686 + b * 0.168;
          const sb = r * 0.272 + g * 0.534 + b * 0.131;
          r += (Math.min(255, sr) - r) * t; g += (Math.min(255, sg) - g) * t; b += (Math.min(255, sb) - b) * t;
          break;
        }
        case 'invert': r += (255 - 2 * r) * t; g += (255 - 2 * g) * t; b += (255 - 2 * b) * t; break;
        case 'threshold': r = g = b = gray >= value ? 255 : 0; break;
        case 'posterize': {
          const steps = Math.round(value) - 1;
          r = Math.round(r / 255 * steps) * 255 / steps;
          g = Math.round(g / 255 * steps) * 255 / steps;
          b = Math.round(b / 255 * steps) * 255 / steps;
          break;
        }
      }
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
}

function applyColorMode(data, options) {
  if (options.colorMode === 'rgb') return;
  for (let i = 0; i < data.length; i += 4) {
    const gray = luminance(data[i], data[i + 1], data[i + 2]);
    if (options.colorMode === 'duotone') {
      for (let c = 0; c < 3; c++) data[i + c] = options.darkColor[c] + (options.lightColor[c] - options.darkColor[c]) * gray / 255;
    } else {
      // Monochrome keeps luminance here so dithering can recover tonal detail.
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
  }
}

function histogram(data, alphaThreshold) {
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaThreshold) continue;
    const key = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3;
    const weight = data[i + 3] / 255;
    let bin = bins.get(key);
    if (!bin) { bin = { r: 0, g: 0, b: 0, weight: 0 }; bins.set(key, bin); }
    bin.r += data[i] * weight; bin.g += data[i + 1] * weight; bin.b += data[i + 2] * weight;
    bin.weight += weight;
  }
  return [...bins.values()].map(bin => ({ rgb: [bin.r / bin.weight, bin.g / bin.weight, bin.b / bin.weight], weight: bin.weight }));
}

function average(points) {
  const rgb = [0, 0, 0];
  let total = 0;
  for (const point of points) {
    total += point.weight;
    for (let c = 0; c < 3; c++) rgb[c] += point.rgb[c] * point.weight;
  }
  return rgb.map(value => Math.round(value / Math.max(total, 1e-8)));
}

function medianCut(points, count) {
  const describe = points => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    let weight = 0;
    for (const point of points) {
      weight += point.weight;
      for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], point.rgb[c]); hi[c] = Math.max(hi[c], point.rgb[c]); }
    }
    const ranges = hi.map((value, c) => value - lo[c]);
    const channel = ranges.indexOf(Math.max(...ranges));
    return { points, channel, weight, score: ranges[channel] * Math.sqrt(weight) };
  };
  const boxes = [describe(points)];
  while (boxes.length < count) {
    let candidate = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].points.length > 1 && (candidate < 0 || boxes[i].score > boxes[candidate].score)) candidate = i;
    }
    if (candidate < 0) break;
    const box = boxes[candidate];
    box.points.sort((a, b) => a.rgb[box.channel] - b.rgb[box.channel]);
    let weight = 0, split = 1;
    for (; split < box.points.length; split++) {
      weight += box.points[split - 1].weight;
      if (weight >= box.weight / 2) break;
    }
    split = Math.min(split, box.points.length - 1);
    boxes.splice(candidate, 1, describe(box.points.slice(0, split)), describe(box.points.slice(split)));
  }
  return boxes.map(box => average(box.points));
}

function nearest(palette, r, g, b) {
  let best = 0, distance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
    if (d < distance) { best = i; distance = d; }
  }
  return best;
}

function kmeans(points, count) {
  let palette = medianCut(points, count);
  for (let iteration = 0; iteration < 8; iteration++) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    for (const point of points) {
      const sum = sums[nearest(palette, ...point.rgb)];
      for (let c = 0; c < 3; c++) sum[c] += point.rgb[c] * point.weight;
      sum[3] += point.weight;
    }
    const next = sums.map((sum, i) => sum[3] ? sum.slice(0, 3).map(value => Math.round(value / sum[3])) : palette[i]);
    const same = next.every((rgb, i) => rgb.every((value, c) => value === palette[i][c]));
    palette = next;
    if (same) break;
  }
  return palette;
}

function uniform(points, options) {
  const { colors, colorMode } = options;
  if (colorMode === 'grayscale' || colorMode === 'duotone') {
    const lo = colorMode === 'duotone' ? options.darkColor : [0, 0, 0];
    const hi = colorMode === 'duotone' ? options.lightColor : [255, 255, 255];
    return Array.from({ length: colors }, (_, i) => lo.map((value, c) => Math.round(value + (hi[c] - value) * i / (colors - 1))));
  }
  // Occupied regular RGB lattice cells, keeping the most frequent color bins.
  const levels = Math.max(2, Math.ceil(Math.cbrt(colors))), cells = new Map();
  for (const point of points) {
    const rgb = point.rgb.map(value => Math.round(value / 255 * (levels - 1)) * 255 / (levels - 1));
    const key = rgb.join(',');
    const cell = cells.get(key) || { rgb: rgb.map(Math.round), weight: 0 };
    cell.weight += point.weight;
    cells.set(key, cell);
  }
  return [...cells.values()].sort((a, b) => b.weight - a.weight).slice(0, colors).map(cell => cell.rgb);
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function assignPalette(image, palette, options) {
  const { width, height, data } = image;
  const indices = new Int16Array(width * height).fill(-1);
  if (!palette.length) return indices;
  const diffusion = options.dither === 'floyd-steinberg';
  let errors = diffusion ? new Float32Array((width + 2) * 3) : null;
  let nextErrors = diffusion ? new Float32Array((width + 2) * 3) : null;
  const strength = 255 / Math.max(2, options.colorMode === 'rgb' ? Math.cbrt(palette.length) : palette.length);
  // Repeated solid colors dominate many images; cache exact RGB assignments.
  const cache = options.dither === 'none' ? new Map() : null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x, p = pixel * 4, ep = (x + 1) * 3;
      if (data[p + 3] < options.alphaThreshold) continue;
      let r = data[p], g = data[p + 1], b = data[p + 2];
      if (options.dither === 'ordered') {
        const delta = ((BAYER4[(y % 4) * 4 + x % 4] + 0.5) / 16 - 0.5) * strength;
        r += delta; g += delta; b += delta;
      } else if (diffusion) {
        r += errors[ep]; g += errors[ep + 1]; b += errors[ep + 2];
      }
      r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
      const key = cache ? (r << 16) | (g << 8) | b : 0;
      let index = cache?.get(key);
      if (index === undefined) {
        index = nearest(palette, r, g, b);
        if (cache && cache.size < 65536) cache.set(key, index);
      }
      indices[pixel] = index;
      if (diffusion) {
        const rgb = [r, g, b];
        for (let c = 0; c < 3; c++) {
          const error = rgb[c] - palette[index][c];
          errors[ep + 3 + c] += error * 7 / 16;
          nextErrors[ep - 3 + c] += error * 3 / 16;
          nextErrors[ep + c] += error * 5 / 16;
          nextErrors[ep + 3 + c] += error / 16;
        }
      }
    }
    if (diffusion) { [errors, nextErrors] = [nextErrors, errors]; nextErrors.fill(0); }
  }
  return indices;
}

function quantizePrepared(image, options) {
  const points = histogram(image.data, options.alphaThreshold);
  let palette = [];
  if (points.length) {
    if (options.colorMode === 'monochrome') palette = [[0, 0, 0], [255, 255, 255]];
    else if (options.quantizer === 'uniform') palette = uniform(points, options);
    else if (options.quantizer === 'kmeans') palette = kmeans(points, options.colors);
    else palette = medianCut(points, options.colors);
  }
  palette = [...new Map(palette.map(rgb => [rgb.join(','), rgb])).values()];
  return { palette, indices: assignPalette(image, palette, options) };
}

/** Quantize an already prepared RGBA image without resizing or filtering it.
 * RGB data is interpreted as supplied, so apply a color mode beforehand if needed.
 * Monochrome forces a black/white palette; other mode names guide uniform bins.
 */
export function quantizeImage(source, options = {}) {
  validate(source);
  const normalized = settings(options);
  const image = { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data).subarray(0, source.width * source.height * 4) };
  return quantizePrepared(image, normalized);
}

export function preprocessImage(source, options = {}) {
  validate(source);
  const normalized = settings(options);
  const image = cropAndResize(source, normalized);
  applyFilters(image, normalized.filters);
  applyColorMode(image.data, normalized);
  return { ...image, ...quantizePrepared(image, normalized) };
}
