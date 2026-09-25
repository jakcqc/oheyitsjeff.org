/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
// Run: node tests/image-to-svg-preprocess.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// The site uses browser ES modules without a package.json.
const source = await readFile(new URL('../imageToSVG/preprocess.js', import.meta.url), 'utf8');
const { preprocessImage, quantizeImage, FILTERS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const image = (width, height, fn) => ({ width, height, data: Uint8ClampedArray.from(Array.from({ length: width * height }, (_, i) => fn(i % width, Math.floor(i / width))).flat()) });
const rainbow = image(96, 48, (x, y) => [x * 255 / 95, y * 255 / 47, (x + y) * 255 / 142, (x + y) % 11 ? 255 : 0]);
const original = rainbow.data.slice();

for (const colorMode of ['rgb', 'grayscale', 'monochrome', 'duotone']) {
  for (const quantizer of ['median-cut', 'kmeans', 'uniform']) {
    for (const dither of ['none', 'ordered', 'floyd-steinberg']) {
      for (const colors of [2, 7, 32]) {
        const result = preprocessImage(rainbow, { colors, colorMode, quantizer, dither });
        assert.ok(result.palette.length >= 1 && result.palette.length <= colors, `${colorMode}/${quantizer}/${dither} respects ${colors} bins`);
        assert.equal(result.indices.length, result.width * result.height);
        assert.ok(result.indices.every((index, i) => result.data[i * 4 + 3] < 16 ? index === -1 : index >= 0 && index < result.palette.length));
        assert.ok(result.palette.flat().every(value => Number.isInteger(value) && value >= 0 && value <= 255));
        if (colorMode === 'grayscale' || colorMode === 'monochrome') {
          assert.ok(result.palette.every(([r, g, b]) => r === g && g === b));
        }
      }
    }
  }
}
assert.deepEqual(rainbow.data, original, 'preprocessing must never mutate the source');

const striped = image(4, 2, x => [x * 60, 20, 30, 255]);
const cropped = preprocessImage(striped, { crop: { x: 0.5, y: 0, width: 0.5, height: 1 } });
assert.equal(cropped.width, 2);
assert.equal(cropped.height, 2);
assert.deepEqual([...cropped.data.slice(0, 4)], [120, 20, 30, 255]);
for (const resample of ['nearest', 'bilinear', 'area']) {
  const tiny = preprocessImage(image(1, 10000, () => [100, 110, 120, 255]), { maxDimension: 32, resample });
  assert.equal(tiny.width, 1);
  assert.equal(tiny.height, 32);
  assert.deepEqual([...tiny.data.slice(0, 4)], [100, 110, 120, 255]);
}
const checker = image(64, 64, (x, y) => (x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
const averaged = preprocessImage(checker, { maxDimension: 32, resample: 'area' });
assert.deepEqual([...averaged.data.slice(0, 4)], [128, 128, 128, 255], 'area resampling averages the entire source footprint');

const transparent = image(64, 32, x => x % 2 ? [0, 0, 255, 0] : [255, 0, 0, 255]);
const antialiased = preprocessImage(transparent, { maxDimension: 32 });
assert.deepEqual([...antialiased.data.slice(0, 4)], [255, 0, 0, 128], 'resampling must avoid transparent blue fringes');
const empty = preprocessImage(image(4, 4, () => [255, 100, 10, 0]));
assert.deepEqual(empty.palette, []);
assert.ok(empty.indices.every(value => value === -1));
const white = preprocessImage(image(1, 1, () => [255, 0, 0, 0]), { transparency: 'white' });
assert.deepEqual([...white.data], [255, 255, 255, 255]);
const black = preprocessImage(image(1, 1, () => [255, 0, 0, 0]), { transparency: 'black' });
assert.deepEqual([...black.data], [0, 0, 0, 255]);

const sample = image(1, 1, () => [50, 100, 150, 255]);
const invertThenBrighten = preprocessImage(sample, { filters: [{ type: 'invert', value: 100 }, { type: 'brightness', value: 20 }] });
const brightenThenInvert = preprocessImage(sample, { filters: [{ type: 'brightness', value: 20 }, { type: 'invert', value: 100 }] });
assert.notDeepEqual(invertThenBrighten.data, brightenThenInvert.data, 'filter order changes the result');
assert.deepEqual(preprocessImage(sample, { filters: [{ type: 'invert', value: 100, enabled: false }] }).data, sample.data);
assert.deepEqual([...preprocessImage(image(1, 1, () => [255, 0, 0, 255]), { filters: [{ type: 'hue', value: 120 }] }).data], [0, 255, 0, 255]);
for (const filter of FILTERS) {
  for (const value of [filter.min, filter.max, NaN, Infinity]) {
    const filtered = preprocessImage(rainbow, { filters: [{ type: filter.id, value }], colors: 4 });
    assert.ok(filtered.palette.length <= 4);
    assert.ok(filtered.data.every(Number.isFinite), `${filter.id} stays finite`);
  }
}
const blurFringe = preprocessImage(image(3, 1, x => x === 1 ? [255, 0, 0, 255] : [0, 0, 255, 0]), { filters: [{ type: 'blur', value: 1 }] });
assert.ok(blurFringe.palette.every(([r, g, b]) => r === 255 && g === 0 && b === 0));
const same = image(8, 8, () => [70, 90, 120, 255]);
assert.deepEqual(preprocessImage(same, { filters: [{ type: 'sharpen', value: 4 }] }).data, same.data);

const midgray = image(32, 32, () => [128, 128, 128, 255]);
const undithered = preprocessImage(midgray, { colorMode: 'monochrome' });
const dithered = preprocessImage(midgray, { colorMode: 'monochrome', dither: 'floyd-steinberg' });
assert.equal(new Set(undithered.indices).size, 1);
assert.equal(new Set(dithered.indices).size, 2, 'error diffusion retains midtone appearance in monochrome');
const whiteCount = [...dithered.indices].filter(index => index === 1).length;
assert.ok(whiteCount > 450 && whiteCount < 575, 'midgray should produce roughly equal black and white pixels');

const invalid = preprocessImage(sample, { colors: Infinity, maxDimension: NaN, crop: { x: 2, y: -1, width: -1, height: 0 }, filters: [null, {}, { type: 'gamma', value: 0 }], colorMode: 'unknown', quantizer: 'unknown', darkColor: 'bad' });
assert.equal(invalid.width, 1);
assert.equal(invalid.height, 1);
assert.ok(invalid.palette.length <= 8);
assert.ok(preprocessImage(sample, null).palette.length > 0);
for (const broken of [null, {}, { width: 0, height: 2, data: [] }, { width: 1.5, height: 1, data: [0, 0, 0, 255] }, { width: 1, height: 1, data: [] }]) {
  assert.throws(() => preprocessImage(broken), TypeError);
}
const quantized = quantizeImage(rainbow, { colors: 5 });
assert.ok(quantized.palette.length <= 5);
assert.equal(quantized.indices.length, rainbow.width * rainbow.height);
console.log('PASS image-to-SVG preprocessing: color budgets, all filters/modes/quantizers/dithers, crop/resample, transparency, ordered filters, and invalid input.');
