/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Run: node tests/image-to-svg-converters.mjs
// A data URL keeps the browser's dependency-free ES module usable without
// changing the repository's Node module conventions or installing packages.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../imageToSVG/converters.js', import.meta.url), 'utf8');
const { METHODS, convertToSVG } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

let checks = 0;
function check(message, test) {
  test();
  checks += 1;
  console.log(`PASS ${message}`);
}

const palette = [[24, 30, 48], [234, 74, 86], [28, 154, 135], [241, 182, 47], [233, 230, 216], [65, 83, 206]];
function fixture(width, height, colorAt = (x, y) => (x + y) % palette.length, colors = palette) {
  const data = new Uint8ClampedArray(width * height * 4);
  const indices = new Int16Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * width + x;
      const index = colorAt(x, y);
      indices[offset] = index;
      data.set(index < 0 ? [0, 0, 0, 0] : [...colors[index], 255], offset * 4);
    }
  }
  return { width, height, data, indices, palette: colors.map((color) => [...color]) };
}
const visibleSVG = (svg) => svg.replace(/<defs>[\s\S]*?<\/defs>/g, '');
const elementCount = (svg) => [...visibleSVG(svg).matchAll(/<(?:path|rect|polygon|polyline|circle|ellipse|line)\b/g)].length;
const attributes = (text) => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
const polygons = (svg) => [...visibleSVG(svg).matchAll(/<polygon\b([^>]+)\/>/g)].map((match) =>
  attributes(match[1]).points.split(' ').map((point) => point.split(',').map(Number)));
const area = (points) => Math.abs(points.reduce((total, [x, y], index) => {
  const next = points[(index + 1) % points.length];
  return total + x * next[1] - next[0] * y;
}, 0) / 2);
// Flatten exported straight/quadratic loops to measure actual enclosed area.
function flattenedPath(path) {
  const tokens = path.match(/[MLQZ]|-?\d+(?:\.\d+)?/g);
  const loops = [];
  let points = [];
  let current = [0, 0];
  let cursor = 0;
  const pair = () => [Number(tokens[cursor++]), Number(tokens[cursor++])];
  while (cursor < tokens.length) {
    const command = tokens[cursor++];
    if (command === 'M' || command === 'L') {
      current = pair();
      points.push(current);
    } else if (command === 'Q') {
      const control = pair();
      const end = pair();
      for (let step = 1; step <= 32; step += 1) {
        const t = step / 32;
        const u = 1 - t;
        points.push([u * u * current[0] + 2 * u * t * control[0] + t * t * end[0],
          u * u * current[1] + 2 * u * t * control[1] + t * t * end[1]]);
      }
      current = end;
    } else if (command === 'Z') {
      loops.push(points);
      points = [];
    } else assert.fail(`Unexpected path command ${command}`);
  }
  return loops;
}

check('22 distinct documented conversion methods are exported', () => {
  assert.equal(METHODS.length, 22);
  assert.equal(new Set(METHODS.map(({ id }) => id)).size, 22);
  assert.ok(METHODS.every(({ label, description }) => label && description));
});

const detailed = fixture(128, 80, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2) + ((x * y) % 5)) % palette.length);
const originalData = detailed.data.slice();
const originalIndices = detailed.indices.slice();
for (const { id } of METHODS) {
  check(`${id}: deterministic, finite, palette-bound geometry honors a hard budget`, () => {
    const options = { method: id, complexity: 100, maxShapes: 37, seed: 123 };
    const result = convertToSVG(detailed, options);
    assert.deepEqual(result, convertToSVG(detailed, options));
    assert.equal(result.method, id);
    assert.equal(result.width, 128);
    assert.equal(result.height, 80);
    assert.ok(result.elementCount > 0 && result.elementCount <= 37, `${result.elementCount} shapes`);
    assert.equal(elementCount(result.svg), result.elementCount);
    assert.ok(result.pointCount >= result.elementCount);
    assert.doesNotMatch(result.svg, /NaN|Infinity|undefined|<image\b|<script\b|data:image|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    assert.match(result.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.ok(result.svg.endsWith('</svg>'));
    const allowed = new Set(palette.map((color) => `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`));
    const actual = new Set([...visibleSVG(result.svg).matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map((match) => match[1]));
    assert.ok([...actual].every((color) => allowed.has(color)));
    assert.equal(actual.size, result.colorsUsed);
  });
  check(`${id}: lower complexity reduces geometric density`, () => {
    const low = convertToSVG(detailed, { method: id, complexity: 3, maxShapes: 1800, voronoiCountMode: 'detail' });
    const high = convertToSVG(detailed, { method: id, complexity: 100, maxShapes: 1800, voronoiCountMode: 'detail' });
    assert.ok(low.pointCount < high.pointCount, `${id}: ${low.pointCount} !< ${high.pointCount}`);
    assert.ok(high.elementCount <= 1800);
  });
}

check('conversion leaves caller-owned pixels, indices, and palette unchanged', () => {
  assert.deepEqual(detailed.data, originalData);
  assert.deepEqual(detailed.indices, originalIndices);
  assert.deepEqual(detailed.palette, palette);
});

check('pixel tiles, merged runs, and triangle mosaics cover the entire opaque image', () => {
  const frame = fixture(18, 12, (x) => x < 9 ? 0 : 1);
  for (const method of ['pixels', 'runs', 'triangles']) {
    const result = convertToSVG(frame, { method, complexity: 100, maxShapes: 100 });
    const rectangles = [...result.svg.matchAll(/<rect\b([^>]+)\/>/g)].map((match) => attributes(match[1]));
    const covered = rectangles.reduce((sum, rectangle) => sum + Number(rectangle.width) * Number(rectangle.height), 0)
      + polygons(result.svg).reduce((sum, points) => sum + area(points), 0);
    assert.ok(Math.abs(covered - frame.width * frame.height) < 0.1, `${method}: area ${covered}`);
  }
});

check('merged runs actually coalesce tiles and quadtree preserves large flat regions', () => {
  const flat = fixture(48, 32, () => 0);
  const pixel = convertToSVG(flat, { method: 'pixels', complexity: 100, maxShapes: 1500 });
  const run = convertToSVG(flat, { method: 'runs', complexity: 100, maxShapes: 1500 });
  const adaptive = convertToSVG(flat, { method: 'quadtree', complexity: 100, maxShapes: 1500 });
  assert.ok(run.elementCount < pixel.elementCount);
  assert.equal(adaptive.elementCount, 1);
  assert.match(adaptive.svg, /width="48" height="32"/);
  const varied = fixture(48, 32, (x, y) => x < 24 ? 0 : (x + y) % palette.length);
  const result = convertToSVG(varied, { method: 'quadtree', complexity: 100, maxShapes: 1500 });
  const sizes = new Set([...result.svg.matchAll(/<rect\b([^>]+)\/>/g)].map((match) => {
    const rectangle = attributes(match[1]);
    return `${rectangle.width},${rectangle.height}`;
  }));
  assert.ok(sizes.size > 1);
});

check('closed contours retain an interior hole and diagonal regions close separately', () => {
  const ring = fixture(9, 9, (x, y) => x >= 3 && x < 6 && y >= 3 && y < 6 ? -1 : 0);
  const result = convertToSVG(ring, { method: 'contours', complexity: 100, maxShapes: 500 });
  const paths = [...visibleSVG(result.svg).matchAll(/<path\b([^>]+)\/>/g)].map((match) => attributes(match[1]));
  assert.equal(paths.length, 1);
  assert.equal(paths[0]['fill-rule'], 'evenodd');
  assert.equal((paths[0].d.match(/M/g) || []).length, 2);
  assert.equal((paths[0].d.match(/Z/g) || []).length, 2);
  const checkerboard = fixture(8, 8, (x, y) => (x + y) % 2);
  const checks = convertToSVG(checkerboard, { method: 'contours', complexity: 100, maxShapes: 500 });
  assert.equal((checks.svg.match(/Z/g) || []).length, 64);
});

check('simplification removes staircase vertices and smooth mode emits curve geometry', () => {
  const stair = fixture(48, 48, (x, y) => x <= y ? 0 : 1);
  const exact = convertToSVG(stair, { method: 'contours', complexity: 100, maxShapes: 3000 });
  const simplified = convertToSVG(stair, { method: 'simplified-contours', complexity: 100, maxShapes: 3000, simplify: 4 });
  const smooth = convertToSVG(stair, { method: 'smooth-contours', complexity: 100, maxShapes: 3000 });
  assert.ok(simplified.pointCount < exact.pointCount / 2);
  assert.match(smooth.svg, /d="[^"]*Q/);
});

check('smooth contours keep long rectangular regions full instead of rounding them into ovals', () => {
  const frame = fixture(240, 100, (x, y) => x >= 20 && x < 220 && y >= 25 && y < 75 ? 1 : 0);
  const result = convertToSVG(frame, { method: 'smooth-contours', complexity: 100, maxShapes: 30000, simplify: 5 });
  const paths = [...result.svg.matchAll(/<path\b([^>]+)\/>/g)].map((match) => attributes(match[1]));
  const region = paths.find((path) => path.fill === '#ea4a56');
  assert.match(region.d, /Q/, 'Interior corners should still be smoothed');
  assert.match(region.d, /L/, 'Long straight edge segments should remain');
  const covered = flattenedPath(region.d).reduce((sum, points) => sum + area(points), 0);
  assert.ok(covered >= 200 * 50 * 0.995, `The 10,000-square-pixel rectangle retained only ${covered}`);
  assert.ok(covered <= 200 * 50 + 0.01);
});

check('smooth contours keep viewport border corners and full-width band coverage exact', () => {
  const bands = fixture(240, 60, (_, y) => Math.floor(y / 20));
  const result = convertToSVG(bands, { method: 'smooth-contours', complexity: 100, maxShapes: 30000, simplify: 5 });
  const paths = [...result.svg.matchAll(/<path\b([^>]+)\/>/g)].map((match) => attributes(match[1]));
  assert.equal(paths.length, 3);
  for (const path of paths) {
    assert.doesNotMatch(path.d, /Q/);
    assert.equal(flattenedPath(path.d).reduce((sum, points) => sum + area(points), 0), 240 * 20);
  }
});

check('touching rectangular tiles request crisp rendering to prevent fractional-boundary seams', () => {
  const frame = fixture(101, 67);
  for (const method of ['pixels', 'runs', 'quadtree']) {
    const result = convertToSVG(frame, { method, complexity: 100, maxShapes: 173 });
    const rectangles = [...result.svg.matchAll(/<rect\b([^>]+)\/>/g)].map((match) => attributes(match[1]));
    assert.ok(rectangles.length > 1);
    assert.ok(rectangles.every((rectangle) => rectangle['shape-rendering'] === 'crispEdges'));
  }
  const halftone = convertToSVG(frame, { method: 'squares', complexity: 100, maxShapes: 173 });
  assert.doesNotMatch(halftone.svg, /crispEdges/, 'Separated halftone marks should retain antialiasing');
});

check('hexagons have six vertices and Voronoi cells tile the full viewport', () => {
  const frame = fixture(80, 48, () => 2);
  const hex = convertToSVG(frame, { method: 'hexagons', complexity: 100, maxShapes: 80 });
  assert.ok(polygons(hex.svg).every((points) => points.length === 6));
  const cells = convertToSVG(frame, { method: 'voronoi', complexity: 100, maxShapes: 80 });
  const covered = polygons(cells.svg).reduce((sum, points) => sum + area(points), 0);
  assert.ok(Math.abs(covered - 80 * 48) < 0.2, `Voronoi area ${covered}`);
});

check('seed changes reproducible stipple and Voronoi geometry', () => {
  for (const method of ['stipple', 'voronoi']) {
    const first = convertToSVG(detailed, { method, maxShapes: 120, complexity: 100, seed: 1 });
    const second = convertToSVG(detailed, { method, maxShapes: 120, complexity: 100, seed: 2 });
    assert.notEqual(first.svg, second.svg);
  }
});

check('all approaches preserve binary transparency with a shared non-raster clip', () => {
  const frame = fixture(12, 8, (x, y) => x > 3 && x < 8 && y > 1 && y < 6 ? -1 : (x + y) % palette.length);
  for (const { id } of METHODS) {
    const result = convertToSVG(frame, { method: id, complexity: 100, maxShapes: 100 });
    assert.match(result.svg, /<clipPath id="image-to-svg-coverage"><path d="M/);
    assert.match(result.svg, /<g clip-path="url\(#image-to-svg-coverage\)">/);
    assert.equal(elementCount(result.svg), result.elementCount);
    assert.ok(result.elementCount <= 100);
  }
});

check('nonzero alpha survives, and alpha-zero pixels are transparent even with a palette index', () => {
  const frame = fixture(2, 1, () => 0);
  frame.data[3] = 128;
  frame.data[7] = 0;
  const result = convertToSVG(frame, { method: 'pixels', complexity: 100, maxShapes: 100 });
  assert.equal(result.elementCount, 1);
  assert.match(result.svg, /opacity="0\.502"/);
  assert.match(result.svg, /<clipPath[^>]*><path d="M0 0H1V1H0Z"/);
});

check('quadtree retains sparse visible marks on a large transparent canvas', () => {
  const frame = fixture(80, 80, (x, y) => x === 40 && y === 40 ? 1 : -1);
  const result = convertToSVG(frame, { method: 'quadtree', complexity: 1, maxShapes: 100 });
  assert.equal(result.elementCount, 1);
  assert.equal(result.colorsUsed, 1);
  assert.match(result.svg, /<clipPath[^>]*><path d="M40 40H41V41H40Z"/);
});

check('empty transparent images, one-pixel images, and extreme aspect ratios remain valid', () => {
  const empty = fixture(5, 3, () => -1, []);
  for (const { id } of METHODS) {
    const result = convertToSVG(empty, { method: id });
    assert.equal(result.elementCount, 0);
    assert.equal(result.colorsUsed, 0);
    for (const [width, height] of [[1, 1], [1, 35], [35, 1]]) {
      const thin = convertToSVG(fixture(width, height, () => 0), { method: id, maxShapes: 37, complexity: 100 });
      assert.ok(thin.elementCount > 0 && thin.elementCount <= 37, `${id}: ${width}×${height}`);
      assert.doesNotMatch(thin.svg, /NaN|Infinity/);
    }
  }
});

check('invalid inputs fail with useful errors', () => {
  assert.throws(() => convertToSVG(null), /quantized image/);
  assert.throws(() => convertToSVG({ ...detailed, width: 0 }), /width and height/);
  assert.throws(() => convertToSVG({ ...detailed, data: [] }), /RGBA data length/);
  assert.throws(() => convertToSVG({ ...detailed, indices: [] }), /indices length/);
  assert.throws(() => convertToSVG({ ...detailed, palette: [[-1, 0, 0]] }), /palette/);
  assert.throws(() => convertToSVG({ ...detailed, indices: Int16Array.from(detailed.indices, () => 999) }), /Invalid palette index/);
  assert.throws(() => convertToSVG(detailed, { method: '<script>' }), /Unknown SVG conversion method/);
  assert.throws(() => convertToSVG(detailed, null), /options must be an object/);
});

console.log(`\n${checks} image-to-SVG converter checks passed.`);
