/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Run: node --experimental-default-type=module --test tests/image-to-svg-pipeline.mjs
// Pure RGBA-to-SVG integration checks; no browser or third-party packages needed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { preprocessImage } from '../imageToSVG/preprocess.js';
import { METHODS, convertToSVG } from '../imageToSVG/converters.js';

function fixture(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(pixel(x, y, width, height), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

// Gradients, fine texture, and broad light/dark regions exercise both palette
// quantization and methods that derive geometry from brightness or edges.
function photograph(width = 72, height = 48) {
  return fixture(width, height, (x, y, w, h) => {
    const grain = ((x * 73 + y * 151 + x * y * 17) % 37) - 18;
    const light = 45 * Math.sin(x / 8) * Math.cos(y / 6);
    return [
      15 + 215 * x / (w - 1) + grain + light,
      20 + 195 * y / (h - 1) - grain + light,
      220 - 140 * x / (w - 1) + grain - light,
      255,
    ];
  });
}

// Transparent surroundings, an enclosed hole, and partially transparent edge
// pixels must survive the same pipeline as photographs.
function transparentLogo(width = 48, height = 36) {
  return fixture(width, height, (x, y, w, h) => {
    const nx = (x + 0.5 - w / 2) / w;
    const ny = (y + 0.5 - h / 2) / h;
    const radius = Math.sqrt(nx * nx + ny * ny);
    const alpha = radius < 0.16 || radius > 0.43 ? 0 : radius > 0.4 ? 100 : 255;
    return x < w / 2 ? [218, 43, 82, alpha] : [28, 105, 201, alpha];
  });
}

function visibleMarkup(svg) {
  return svg.replace(/<defs\b[\s\S]*?<\/defs>/g, '');
}

function svgColors(svg) {
  return new Set([...visibleMarkup(svg).matchAll(/\b(?:fill|stroke)="(#[\da-f]+|rgb\([^"]+\))"/gi)]
    .map(match => match[1].toLowerCase()));
}

function visibleElementCount(svg) {
  return [...visibleMarkup(svg).matchAll(/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/g)].length;
}

function colorHex(color) {
  if (typeof color === 'string') return color.toLowerCase();
  return '#' + Array.from(color).slice(0, 3).map(channel => channel.toString(16).padStart(2, '0')).join('');
}

function verifySVG(result, frame, maxShapes, context) {
  const { svg } = result;
  assert.match(svg, /<svg\b/, `${context}: SVG root`);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${context}: standalone SVG namespace`);
  assert.match(svg, /<\/svg>\s*$/, `${context}: complete document`);
  assert.doesNotMatch(svg, /(?:NaN|Infinity|undefined|<image\b|<script\b|data:image)/, `${context}: finite vector geometry`);
  assert.equal(result.width, frame.width, `${context}: width`);
  assert.equal(result.height, frame.height, `${context}: height`);
  assert.equal(result.elementCount, visibleElementCount(svg), `${context}: reported visible geometry`);
  assert.ok(result.elementCount <= maxShapes, `${context}: element budget ${result.elementCount} <= ${maxShapes}`);
  const allowed = new Set(frame.palette.map(colorHex));
  const actual = svgColors(svg);
  assert.ok(actual.size <= allowed.size, `${context}: palette size`);
  for (const color of actual) assert.ok(allowed.has(color), `${context}: unexpected color ${color}`);
  assert.equal(result.colorsUsed, actual.size, `${context}: reported color count`);
}

test('all 22 approaches accept cropped/filterable RGBA and honor each color mode', () => {
  assert.equal(METHODS.length, 22);
  assert.equal(new Set(METHODS.map(method => method.id)).size, 22);
  const sourceImages = [photograph(), transparentLogo()];
  for (const source of sourceImages) {
    const original = source.data.slice();
    for (const colorMode of ['rgb', 'grayscale', 'monochrome', 'duotone']) {
      const frame = preprocessImage(source, {
        colorMode, colors: 7, maxDimension: 64,
        filters: [{ type: 'contrast', value: 12 }, { type: 'saturation', value: -10 }],
      });
      assert.ok(frame.palette.length > 0 && frame.palette.length <= 7);
      if (colorMode === 'grayscale') {
        assert.ok(frame.palette.every(([r, g, b]) => r === g && g === b));
      }
      if (colorMode === 'monochrome') {
        assert.deepEqual(frame.palette, [[0, 0, 0], [255, 255, 255]]);
      }
      const before = {
        data: frame.data.slice(), indices: frame.indices.slice(),
        palette: frame.palette.map(color => color.slice()),
      };
      for (const { id } of METHODS) {
        const options = { method: id, complexity: 57, maxShapes: 211, seed: 426 };
        const result = convertToSVG(frame, options);
        const context = `${id}/${colorMode}/${source.width}x${source.height}`;
        verifySVG(result, frame, options.maxShapes, context);
        assert.ok(result.elementCount > 0, `${context}: visible artwork`);
        assert.equal(result.method, id);
        assert.deepEqual(convertToSVG(frame, options), result, `${context}: deterministic repeat`);
      }
      assert.deepEqual(frame.data, before.data, 'conversion preserves the prepared RGBA preview');
      assert.deepEqual(frame.indices, before.indices, 'conversion preserves indexed pixels');
      assert.deepEqual(frame.palette, before.palette, 'conversion preserves the shared palette');
    }
    assert.deepEqual(source.data, original, 'the complete pipeline preserves the imported image');
  }
});

test('crop and downsample coordinates become the SVG coordinate system', () => {
  const source = fixture(160, 96, (x, y) => [x, y, (x + y) % 256, 255]);
  const frame = preprocessImage(source, {
    crop: { x: 0.125, y: 0.25, width: 0.5, height: 0.5 },
    maxDimension: 32, resample: 'nearest', colors: 5,
  });
  assert.equal(frame.width, 32);
  assert.equal(frame.height, 19);
  assert.deepEqual([...frame.data.slice(0, 4)], [21, 25, 46, 255]);
  for (const { id } of METHODS) {
    const result = convertToSVG(frame, { method: id, maxShapes: 101, complexity: 60 });
    verifySVG(result, frame, 101, `${id}/cropped`);
    assert.match(result.svg, /viewBox="0 0 32 19"/);
  }
});

test('filter ordering and enabled state affect exported colors and geometry', () => {
  const source = photograph(32, 24);
  const brightness = { type: 'brightness', value: 35 };
  const threshold = { type: 'threshold', value: 150 };
  const first = preprocessImage(source, { colors: 4, filters: [brightness, threshold] });
  const reordered = preprocessImage(source, { colors: 4, filters: [threshold, brightness] });
  const disabled = preprocessImage(source, {
    colors: 4, filters: [{ ...brightness, enabled: false }, threshold],
  });
  const thresholdOnly = preprocessImage(source, { colors: 4, filters: [threshold] });
  assert.deepEqual(disabled, thresholdOnly);
  const convert = frame => convertToSVG(frame, { method: 'runs', complexity: 90, maxShapes: 1000 }).svg;
  assert.notEqual(convert(first), convert(reordered));
  assert.notEqual(convert(first), convert(disabled));
});

test('quantizers and dithering keep the requested palette limit through vector export', () => {
  const source = photograph(48, 32);
  for (const quantizer of ['median-cut', 'kmeans', 'uniform']) {
    for (const dither of ['none', 'ordered', 'floyd-steinberg']) {
      for (const colors of [2, 5, 19]) {
        const frame = preprocessImage(source, { colors, quantizer, dither });
        assert.ok(frame.palette.length > 0 && frame.palette.length <= colors);
        assert.ok(frame.indices.every(index => index >= 0 && index < frame.palette.length));
        for (const method of ['contours', 'pixels', 'stipple']) {
          const result = convertToSVG(frame, { method, complexity: 68, maxShapes: 173 });
          verifySVG(result, frame, 173, `${method}/${quantizer}/${dither}/${colors}`);
          assert.ok(result.colorsUsed <= colors);
        }
      }
    }
  }
});

test('transparent holes are clipped across methods, while flattening produces an opaque source', () => {
  const source = transparentLogo();
  const frame = preprocessImage(source, { alphaThreshold: 128, colors: 4 });
  assert.equal(frame.indices[0], -1);
  assert.equal(frame.indices[Math.floor(frame.height / 2) * frame.width + Math.floor(frame.width / 2)], -1);
  for (const { id } of METHODS) {
    const result = convertToSVG(frame, { method: id, complexity: 70, maxShapes: 173 });
    verifySVG(result, frame, 173, `${id}/transparent`);
    assert.match(result.svg, /<clipPath\b/, `${id}: transparency mask definition`);
    assert.match(result.svg, /clip-path="url\(#/, `${id}: transparency mask applied`);
  }
  for (const transparency of ['white', 'black']) {
    const flattened = preprocessImage(source, { transparency });
    assert.ok(flattened.indices.every(index => index >= 0));
    assert.ok(flattened.data.every((value, index) => index % 4 !== 3 || value === 255));
  }
  const empty = preprocessImage(fixture(12, 8, () => [200, 100, 50, 0]), {});
  assert.equal(empty.palette.length, 0);
  for (const { id } of METHODS) {
    const result = convertToSVG(empty, { method: id });
    verifySVG(result, empty, 8000, `${id}/fully-transparent`);
    assert.equal(result.elementCount, 0);
  }
});

test('complexity changes each approach and detailed conversions respect a small geometry budget', () => {
  const frame = preprocessImage(photograph(128, 80), { colors: 11 });
  const start = performance.now();
  for (const { id } of METHODS) {
    const low = convertToSVG(frame, { method: id, complexity: 3, maxShapes: 8000, voronoiCountMode: 'detail' });
    const high = convertToSVG(frame, { method: id, complexity: 97, maxShapes: 8000, voronoiCountMode: 'detail' });
    verifySVG(low, frame, 8000, `${id}/low-complexity`);
    verifySVG(high, frame, 8000, `${id}/high-complexity`);
    assert.notEqual(low.svg, high.svg, `${id}: complexity changes the generated geometry`);
    const limited = convertToSVG(frame, { method: id, complexity: 100, maxShapes: 37 });
    verifySVG(limited, frame, 37, `${id}/high-complexity-budget`);
    assert.ok(limited.elementCount > 0, `${id}: small budget retains artwork`);
  }
  // Catch accidental quadratic explosions without making normal CI speed a requirement.
  assert.ok(performance.now() - start < 30_000, 'all detailed approaches finish within the smoke-test budget');
});

test('worker returns standalone SVG, progress, and transferable preview data', async () => {
  const messages = [];
  const previousSelf = globalThis.self;
  globalThis.self = { postMessage: (message, transfer) => messages.push({ message, transfer }) };
  try {
    await import('../imageToSVG/worker.js');
    globalThis.self.onmessage({
      data: { source: photograph(12, 8), options: { method: 'pixels', complexity: 50, maxShapes: 100 } },
    });
    assert.ok(messages.some(({ message }) => message.type === 'progress'));
    const completed = messages.find(({ message }) => message.type === 'result');
    assert.ok(completed, JSON.stringify(messages));
    verifySVG(completed.message.result, completed.message.prepared, 100, 'worker');
    assert.ok(Number.isFinite(completed.message.elapsed));
    assert.deepEqual(completed.transfer, [
      completed.message.prepared.data.buffer,
      completed.message.prepared.indices.buffer,
    ]);

    messages.length = 0;
    globalThis.self.onmessage({ data: { source: null, options: {} } });
    assert.equal(messages.at(-1).message.type, 'error');
    assert.ok(messages.at(-1).message.message.length > 0);
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});
