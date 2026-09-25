/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { convertToSVG, METHODS } from '../imageToSVG/converters.js';
import { conversionParams } from '../imageToSVG/conversionControls.js';
import { matchesParamVisibility } from '../helper/paramVisibility.js';

function fixture(colorAt = (x, y) => (Math.floor(x / 8) + Math.floor(y / 8)) % 3) {
  const width = 80, height = 64;
  const palette = [[35, 35, 35], [128, 128, 128], [230, 230, 230]];
  const data = new Uint8ClampedArray(width * height * 4);
  const indices = new Int16Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x, color = colorAt(x, y);
    indices[p] = color; data.set([...palette[color], 255], p * 4);
  }
  return { width, height, data, indices, palette };
}
const attr = text => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const elements = (result, tag) => [...result.svg.matchAll(new RegExp(`<${tag}\\b([^>]+)\\/>`, 'g'))].map(match => attr(match[1]));
const shapeArea = result => elements(result, 'rect').reduce((sum, r) => sum + +r.width * +r.height, 0)
  + elements(result, 'polygon').reduce((sum, p) => {
    const points = p.points.split(' ').map(point => point.split(',').map(Number));
    return sum + Math.abs(points.reduce((area, [x, y], index) => {
      const next = points[(index + 1) % points.length];
      return area + x * next[1] - next[0] * y;
    }, 0)) / 2;
  }, 0);
const convert = (method, options = {}, frame = fixture()) => convertToSVG(frame, { method, complexity: 100, maxShapes: 160, ...options });

test('Voronoi site cap and jitter control cells independently of the shared budgets', () => {
  const frame = fixture(() => 1);
  const low = convert('voronoi', { voronoiSites: 24 }, frame);
  const high = convert('voronoi', { voronoiSites: 100 }, frame);
  assert.ok(low.elementCount <= 24 && high.elementCount <= 100);
  assert.ok(low.elementCount < high.elementCount);
  assert.ok(convert('voronoi', { maxShapes: 13, voronoiSites: 768 }, frame).elementCount <= 13);
  const regular = convert('voronoi', { voronoiSites: 24, voronoiJitter: 0, seed: 1 }, frame);
  assert.equal(regular.svg, convert('voronoi', { voronoiSites: 24, voronoiJitter: 0, seed: 999 }, frame).svg);
  const irregular = convert('voronoi', { voronoiSites: 24, voronoiJitter: 1 }, frame);
  assert.notEqual(regular.svg, irregular.svg);
  assert.ok(Math.abs(shapeArea(irregular) - frame.width * frame.height) < .2);
});

test('tile inset creates predictable gaps for every mosaic without adding shapes', () => {
  const frame = fixture(() => 0);
  for (const method of ['pixels', 'runs', 'triangles', 'hexagons', 'voronoi']) {
    const full = convert(method, {}, frame);
    const inset = convert(method, { mosaicInset: .2 }, frame);
    assert.equal(inset.elementCount, full.elementCount, method);
    assert.ok(Math.abs(shapeArea(inset) / shapeArea(full) - .36) < .001, method);
    assert.equal(inset.colorsUsed, full.colorsUsed, method);
  }
});

test('sampling aspect changes rectangular cells and triangle direction preserves coverage', () => {
  const frame = fixture(() => 0);
  const tall = elements(convert('pixels', { gridAspect: .25 }, frame), 'rect')[0];
  const wide = elements(convert('pixels', { gridAspect: 4 }, frame), 'rect')[0];
  assert.ok(+tall.width / +tall.height < 1);
  assert.ok(+wide.width / +wide.height > 1);
  const variants = ['alternating', 'forward', 'backward'].map(triangleDirection => convert('triangles', { triangleDirection }, frame));
  assert.equal(new Set(variants.map(result => result.svg)).size, 3);
  for (const result of variants) assert.ok(Math.abs(shapeArea(result) - frame.width * frame.height) < .2);
});

test('quadtree tolerance trades color detail for fewer adaptive blocks', () => {
  const fine = convert('quadtree', { complexity: 45, maxShapes: 2000, quadtreeTolerance: 0 });
  const coarse = convert('quadtree', { complexity: 45, maxShapes: 2000, quadtreeTolerance: 3 });
  assert.ok(coarse.elementCount < fine.elementCount, `${coarse.elementCount} < ${fine.elementCount}`);
  assert.ok(coarse.elementCount >= 1);
  assert.ok(fine.elementCount <= 2000);
});

test('mark size, tone response, and stipple scatter change only relevant geometry', () => {
  const frame = fixture(() => 1);
  for (const method of ['dots', 'squares', 'stipple']) {
    const small = convert(method, { markScale: .5 }, frame);
    const large = convert(method, { markScale: 1 }, frame);
    const tag = method === 'squares' ? 'rect' : 'circle', size = method === 'squares' ? 'width' : 'r';
    assert.equal(small.elementCount, large.elementCount, method);
    assert.ok(Math.abs(+elements(large, tag)[0][size] / +elements(small, tag)[0][size] - 2) < .02, method);
  }
  for (const method of ['dots', 'squares', 'stipple', 'horizontal-lines', 'vertical-lines', 'hatching', 'crosshatching']) {
    assert.notEqual(convert(method, { toneResponse: .25 }, frame).svg, convert(method, { toneResponse: 3 }, frame).svg, method);
  }
  const centered = convert('stipple', { stippleJitter: 0 }, frame);
  const scattered = convert('stipple', { stippleJitter: 1 }, frame);
  assert.equal(centered.elementCount, scattered.elementCount);
  assert.notEqual(elements(centered, 'circle')[0].cx, elements(scattered, 'circle')[0].cx);
});

test('hatch angle and second-direction threshold control stroke direction and count', () => {
  const frame = fixture(() => 1);
  const horizontal = elements(convert('hatching', { hatchAngle: 0 }, frame), 'line');
  const vertical = elements(convert('hatching', { hatchAngle: 90 }, frame), 'line');
  assert.ok(horizontal.every(line => line.y1 === line.y2 && line.x1 !== line.x2));
  assert.ok(vertical.every(line => line.x1 === line.x2 && line.y1 !== line.y2));
  const single = convert('crosshatching', { crosshatchThreshold: 1 }, frame);
  const double = convert('crosshatching', { crosshatchThreshold: 0 }, frame);
  assert.equal(double.elementCount, single.elementCount * 2);
  assert.ok(double.elementCount <= 160);
});

test('smooth corner rounding can be disabled while retaining closed contour paths', () => {
  const sharp = convert('smooth-contours', { cornerRounding: 0 });
  const rounded = convert('smooth-contours', { cornerRounding: 2 });
  assert.doesNotMatch(sharp.svg, /d="[^"]*Q/);
  assert.match(rounded.svg, /d="[^"]*Q/);
  assert.equal(sharp.elementCount, rounded.elementCount);
  assert.match(sharp.svg, /fill-rule="evenodd"/);
});

test('new option bounds preserve finite geometry and shape/palette budgets', () => {
  for (const { id: method } of METHODS) {
    for (const value of [-1e9, 1e9, NaN, Infinity, null, 'invalid']) {
      const options = Object.fromEntries(conversionParams.filter(param => param.type === 'number').map(param => [param.key, value]));
      const result = convert(method, { ...options, complexity: 90, maxShapes: 37 });
      assert.ok(result.elementCount <= 37, method);
      assert.ok(result.colorsUsed <= 3, method);
      assert.doesNotMatch(result.svg, /NaN|Infinity|undefined/);
    }
  }
});

test('explicit UI defaults match omitted method options for existing recipes', () => {
  const defaults = Object.fromEntries(conversionParams.map(param => [param.key, param.default]));
  for (const { id } of METHODS) {
    const shared = { method: id, complexity: 45, maxShapes: 160 };
    assert.equal(convertToSVG(fixture(), shared).svg, convertToSVG(fixture(), { ...defaults, ...shared }).svg, id);
  }
});

test('selector visibility exposes each method settings and retains universal budgets', () => {
  const visible = (key, state) => matchesParamVisibility(conversionParams.find(param => param.key === key).shouldShowWhen, state);
  for (const { id: method } of METHODS) {
    for (const key of ['method', 'complexity', 'maxShapes', 'colorMode', 'colors']) assert.ok(visible(key, { method }), `${method} ${key}`);
    assert.ok(conversionParams.some(param => param.shouldShowWhen?.method && matchesParamVisibility(param.shouldShowWhen, { method })), method);
    assert.equal(visible('voronoiSites', { method }), method === 'voronoi');
    assert.equal(visible('voronoiJitter', { method }), method === 'voronoi');
    assert.equal(visible('quadtreeTolerance', { method }), method === 'quadtree');
    assert.equal(visible('triangleDirection', { method }), method === 'triangles');
  }
  assert.ok(visible('darkColor', { colorMode: 'duotone' }));
  assert.ok(!visible('darkColor', { colorMode: 'rgb' }));
  assert.ok(!visible('quantizer', { colorMode: 'monochrome' }));
  assert.ok(visible('quantizer', { colorMode: 'grayscale' }));
  assert.ok(!visible('alphaThreshold', { transparency: 'white' }));
  assert.ok(visible('alphaThreshold', { transparency: 'preserve' }));
});
