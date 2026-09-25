/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { convertToSVG, METHODS } from '../imageToSVG/converters.js';
import { conversionParams } from '../imageToSVG/conversionControls.js';
import { matchesParamVisibility } from '../helper/paramVisibility.js';

const source = await readFile(new URL('../imageToSVG/converters.js', import.meta.url), 'utf8');
const { voronoiCells } = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport { voronoiCells };').toString('base64')}`);
const continuous = METHODS.filter(method => method.id.endsWith('-squiggles'));
function fixture(width = 80, height = 60, colorAt = (x, y) => (Math.floor(x / 10) + Math.floor(y / 10)) % 3) {
  const palette = [[20, 30, 40], [180, 50, 60], [245, 240, 230]];
  const data = new Uint8ClampedArray(width * height * 4), indices = new Int16Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, index = colorAt(x, y);
    indices[i] = index;
    if (index >= 0) data.set([...palette[index], 255], i * 4);
  }
  return { width, height, data, indices, palette };
}
const attrs = text => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const paths = svg => [...svg.replace(/<defs>[\s\S]*?<\/defs>/g, '').matchAll(/<path\b([^>]+)\/>/g)].map(match => attrs(match[1]));
const area = points => Math.abs(points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length]; return sum + a[0] * b[1] - b[0] * a[1];
}, 0)) / 2;
const convert = (method, options = {}, frame = fixture()) => convertToSVG(frame, { method, complexity: 80, maxShapes: 8000, ...options });

test('Voronoi direct count exceeds the old cap and stays independent of Detail', () => {
  for (const count of [1, 769, 2048, 10000, 30000]) {
    const result = convert('voronoi', { voronoiSites: count, maxShapes: 30000 });
    assert.equal(result.elementCount, count);
    assert.doesNotMatch(result.svg, /NaN|Infinity/);
  }
  const settings = { voronoiSites: 1000, maxShapes: 30000 };
  assert.equal(convert('voronoi', { ...settings, complexity: 1 }).svg, convert('voronoi', { ...settings, complexity: 100 }).svg);
  assert.equal(convert('voronoi', { voronoiSites: 2000, maxShapes: 41 }).elementCount, 41);
  assert.ok(convert('voronoi', { ...settings, complexity: 1, voronoiCountMode: 'detail' }).elementCount < 1000);
});

test('spatial Voronoi pruning yields nearest-site cells and full coverage', () => {
  for (const [width, height] of [[100, 70], [1, 200], [200, 1]]) {
    // Deliberately irregular clusters stress pruning beyond the regular seed grid.
    const sites = Array.from({ length: 80 }, (_, i) => [
      width * (((i * 151 + 17) % 997) / 997) ** 2,
      height * (((i * 271 + 61) % 991) / 991),
    ]);
    const cells = voronoiCells(sites, width, height);
    assert.ok(Math.abs(cells.reduce((sum, cell) => sum + area(cell), 0) - width * height) < 1e-6);
    cells.forEach((cell, i) => {
      assert.ok(cell.length >= 3);
      for (const [x, y] of cell) {
        const own = (x - sites[i][0]) ** 2 + (y - sites[i][1]) ** 2;
        assert.ok(x >= -1e-7 && x <= width + 1e-7 && y >= -1e-7 && y <= height + 1e-7);
        for (const [ox, oy] of sites) assert.ok(own <= (x - ox) ** 2 + (y - oy) ** 2 + 1e-5);
      }
    });
  }
});

test('Voronoi relaxation and aspect alter geometry while keeping requested cell count', () => {
  const options = { voronoiSites: 256 };
  const normal = convert('voronoi', options);
  for (const extra of [{ voronoiAspect: 4 }, { voronoiRelaxation: 2 }]) {
    const changed = convert('voronoi', { ...options, ...extra });
    assert.equal(changed.elementCount, 256);
    assert.notEqual(changed.svg, normal.svg);
    const polygons = [...changed.svg.matchAll(/<polygon points="([^"]+)"/g)].map(match => match[1].split(' ').map(p => p.split(',').map(Number)));
    assert.ok(Math.abs(polygons.reduce((sum, polygon) => sum + area(polygon), 0) - 4800) < .1);
  }
});

test('five continuous styles honor exact line counts, shared ink caps, and path continuity', () => {
  assert.equal(continuous.length, 5);
  const signatures = new Set();
  for (const { id } of continuous) {
    for (const count of [1, 7, 32]) {
      const result = convert(id, { lineCount: count, lineColors: 2, lineSamples: 256 });
      const strokes = paths(result.svg);
      assert.equal(result.elementCount, count, id);
      assert.equal(strokes.length, count, id);
      assert.equal(result.colorsUsed, Math.min(count, 2), id);
      for (const path of strokes) {
        assert.equal((path.d.match(/M/g) || []).length, 1, `${id} has one pen-down start`);
        assert.doesNotMatch(path.d, /Z|NaN|Infinity/);
        assert.equal(path.fill, 'none');
        assert.ok(path.stroke);
        const coordinates = path.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        coordinates.forEach((v, i) => assert.ok(v >= 0 && v <= (i % 2 ? 60 : 80)));
      }
      signatures.add(result.svg);
    }
    assert.equal(convert(id, { lineCount: 64, maxShapes: 9 }).elementCount, 9);
    assert.equal(convert(id, { lineColors: 1 }).colorsUsed, 1);
  }
  assert.equal(signatures.size, 15);
});

test('continuous line controls change real geometry and remain repeatable', () => {
  for (const { id } of continuous) {
    const baseline = convert(id, { lineCount: 5, lineSamples: 192 });
    assert.equal(convert(id, { lineCount: 5, lineSamples: 192 }).svg, baseline.svg);
    for (const option of [
      { lineAmplitude: 0 }, { lineFrequency: 8 }, { lineDensity: 0 }, { lineDensityFloor: .5 },
      { lineAngle: 45 }, { lineSmoothing: 0 }, { lineSamples: 512 }, { seed: 10 }, { strokeWidth: .2 },
      { lineColorMode: 'dominant' }, { toneResponse: 3 },
    ]) assert.notEqual(convert(id, { lineCount: 5, lineSamples: 192, ...option }).svg, baseline.svg, `${id} ${JSON.stringify(option)}`);
  }
  for (const [method, key, value] of [
    ['serpentine-squiggles', 'serpentineRows', 12], ['spiral-squiggles', 'spiralTurns', 10],
    ['flow-squiggles', 'flowLength', 1], ['flow-squiggles', 'flowInfluence', 0], ['hilbert-squiggles', 'hilbertOrder', 3],
  ]) assert.notEqual(convert(method, { [key]: value }).svg, convert(method).svg, key);
});

test('tone affects line geometry, even when palette indices stay fixed', () => {
  const dark = fixture(80, 60, () => 0), light = fixture(80, 60, () => 0);
  for (let i = 0; i < light.data.length; i += 4) light.data.set([220, 220, 220], i);
  for (const { id } of continuous) assert.notEqual(convert(id, {}, dark).svg, convert(id, {}, light).svg, id);
});

test('line sampling has an independent total budget and supports transparent clipping', () => {
  const frame = fixture(20, 16, (x, y) => x > 6 && x < 12 && y > 5 && y < 10 ? -1 : 0);
  for (const { id } of continuous) {
    const result = convert(id, { lineCount: 512, lineSamples: 8192, complexity: 100, lineSmoothing: 0 }, frame);
    assert.ok(result.pointCount <= 250000, id);
    assert.match(result.svg, /clip-path="url\(#image-to-svg-coverage\)"/);
    assert.ok(result.elementCount <= 512);
  }
});

test('existing method controls independently change sampling, coverage, or geometry', () => {
  assert.ok(convert('pixels', { samplingCount: 900, complexity: 1 }).elementCount > convert('pixels', { samplingCount: 100, complexity: 100 }).elementCount);
  const frame = fixture(80, 60, (x, y) => (x === 20 && y === 20 ? 1 : 0));
  assert.ok(convert('contours', { samplingCount: 4800, contourMinArea: 2 }, frame).pointCount < convert('contours', { samplingCount: 4800 }, frame).pointCount);
  assert.ok(convert('quadtree', { quadtreeMinSize: 32, complexity: 100 }).elementCount < convert('quadtree', { quadtreeMinSize: 1, complexity: 100 }).elementCount);
  assert.ok(convert('stipple', { stippleDensity: .1 }).elementCount < convert('stipple', { stippleDensity: 2 }).elementCount);
  assert.ok(convert('dots', { toneCutoff: .8 }).elementCount < convert('dots', { toneCutoff: 0 }).elementCount);
  assert.ok(convert('edges', { edgeThreshold: 400 }).elementCount < convert('edges', { edgeThreshold: 0 }).elementCount);
  assert.notEqual(convert('hatching', { strokeLength: .3 }).svg, convert('hatching', { strokeLength: 2 }).svg);
  assert.notEqual(convert('crosshatching', { crosshatchAngle: 30 }).svg, convert('crosshatching', { crosshatchAngle: 90 }).svg);
});

test('new controls are exposed only for the methods they affect', () => {
  const visible = (key, method) => matchesParamVisibility(conversionParams.find(p => p.key === key).shouldShowWhen, { method });
  for (const { id } of METHODS) {
    assert.equal(visible('lineCount', id), id.endsWith('-squiggles'));
    assert.equal(visible('lineColors', id), id.endsWith('-squiggles'));
    assert.equal(visible('voronoiRelaxation', id), id === 'voronoi');
    assert.equal(visible('serpentineRows', id), id === 'serpentine-squiggles');
    assert.equal(visible('flowLength', id), id === 'flow-squiggles');
  }
  assert.equal(conversionParams.find(p => p.key === 'voronoiSites').max, 30000);
});
