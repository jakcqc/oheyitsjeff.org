/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// node --experimental-default-type=module --test tests/math-transform-geometry.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSvgPath, pointOnSvgSegment, parseSvgTransform, applySvgMatrix, mapSvgPath } from '../helper/mathTransformGeometry.js';
import { createMathMapper } from '../helper/mathTransformMath.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const nearPoint = (a, b) => a.forEach((v, i) => near(v, b[i]));
const identity = { sample: (x, y) => ({ point: [x, y], region: 'one' }) };
const box = { x: -100, y: -100, w: 200, h: 200 };

test('compound paths preserve independent move and close commands and relative coordinates', () => {
  const paths = parseSvgPath('m 1 2 3 4 h 5 v -2 z m 10 20 l 1 1 M -3 -4 L 8 9');
  assert.equal(paths.length, 3);
  assert.equal(paths[0].closed, true);
  assert.equal(paths[1].closed, false);
  nearPoint(paths[0].segments[1].end, [9, 6]);
  nearPoint(paths[0].segments[2].end, [9, 4]);
  nearPoint(paths[1].start, [11, 22]);
  const output = mapSvgPath(paths, identity, { maxStep: 100 });
  assert.equal((output.intact.match(/M /g) || []).length, 3);
  assert.equal((output.intact.match(/Z/g) || []).length, 1);
  assert.equal(output.broken, '');
});

test('smooth cubic/quadratic reflection resets after intervening commands', () => {
  const paths = parseSvgPath('M 0 0 C 1 2 3 4 5 6 S 8 9 10 11 L 12 13 S 14 15 16 17 Q 18 19 20 21 T 22 23 L 24 25 T 26 27');
  nearPoint(paths[0].segments[1].c1, [7, 8]);
  nearPoint(paths[0].segments[3].c1, [12, 13]);
  nearPoint(paths[0].segments[5].c1, [22, 23]);
  nearPoint(paths[0].segments[7].c1, [24, 25]);
});

test('elliptic arcs support adjacent flags, rotation, corrected radii, and exact endpoints', () => {
  const arc = parseSvgPath('M 0 0 A 10 20 30 0110 20')[0].segments[0];
  nearPoint(pointOnSvgSegment(arc, 0), [0, 0]);
  nearPoint(pointOnSvgSegment(arc, 1), [10, 20]);
  assert.ok(pointOnSvgSegment(arc, .5).every(Number.isFinite));
  const semicircle = parseSvgPath('M -10 0 A 1 1 0 0 1 10 0')[0].segments[0];
  near(semicircle.rx, 10); near(semicircle.ry, 10);
  nearPoint(pointOnSvgSegment(semicircle, .5), [0, -10]);
});

test('malformed geometry is rejected before it can produce non-finite SVG output', () => {
  for (const data of ['M 1', 'L 1 2 X 3 4', 'M NaN 0', 'M 0 0 A 5 5 0 2 0 4 4', 'M 1e999 0']) {
    assert.throws(() => parseSvgPath(data));
  }
  assert.throws(() => parseSvgPath('M 0 0 L 1 1 L 2 2', 2), /budget/);
});

test('SVG transform-list ordering and rotations about centers match SVG user space', () => {
  nearPoint(applySvgMatrix(parseSvgTransform('translate(10 20) scale(2 3)'), [1, 1]), [12, 23]);
  nearPoint(applySvgMatrix(parseSvgTransform('rotate(90 10 20)'), [12, 20]), [10, 22]);
  nearPoint(applySvgMatrix(parseSvgTransform('matrix(1 0 0 1 7 9) skewX(45)'), [1, 2]), [10, 11]);
  assert.throws(() => parseSvgTransform('translate(NaN 1)'));
});

test('nonlinear mapping takes place in root space then returns to local geometry', () => {
  const matrix = parseSvgTransform('translate(15 20) rotate(30) scale(2 .75)');
  const mapper = createMathMapper({ type: 'vortex', strength: 1.4 }, box);
  const output = mapSvgPath(parseSvgPath('M 5 7 L 9 8'), mapper, { matrix });
  const mapped = parseSvgPath(output.intact)[0];
  const originalWorld = applySvgMatrix(matrix, [5, 7]);
  const expected = mapper.sample(...originalWorld).point;
  const actual = applySvgMatrix(matrix, mapped.start);
  expected.forEach((v, i) => near(v, actual[i], 2e-5));
});

test('adaptive sampling preserves inflected cubics whose midpoint lies on their chord', () => {
  const paths = parseSvgPath('M 0 0 C 0 80 100 -80 100 0');
  const output = mapSvgPath(paths, identity, { tolerance: .15, maxStep: 1000 });
  const points = parseSvgPath(output.intact)[0].segments.map(segment => segment.end);
  assert.ok(points.some(p => p[1] > 20));
  assert.ok(points.some(p => p[1] < -20));
  assert.ok(points.length > 10);
});

test('flat dense paths keep their existing sample density instead of doubling each operation', () => {
  const data = `M 0 0 ${Array.from({ length: 100 }, (_, i) => `L ${i + 1} 0`).join(' ')}`;
  const output = mapSvgPath(parseSvgPath(data), identity, { maxStep: 1000 });
  assert.equal(parseSvgPath(output.intact)[0].segments.length, 100);
});

test('wrap seam breaks cannot draw a bridge; only affected compound fills are dropped', () => {
  const mapper = createMathMapper({ type: 'wrap', wrapX: .25, wrapY: 0 }, box);
  const paths = parseSvgPath('M 40 -10 L 60 -10 L 60 10 L 40 10 Z M -20 -20 L -10 -20 L -10 -10 Z');
  const output = mapSvgPath(paths, mapper, { tolerance: .1, maxStep: 10 });
  assert.equal(output.seamCount, 1);
  assert.equal(parseSvgPath(output.intact).length, 1);
  assert.ok(parseSvgPath(output.intact)[0].closed);
  const pieces = parseSvgPath(output.broken);
  assert.ok(pieces.length >= 2);
  for (const fragment of pieces) {
    assert.equal(fragment.closed, false);
    for (const segment of fragment.segments) assert.ok(Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]) < 20);
  }
});

test('root branch cuts and Joukowski poles split paths without NaN or Infinity', () => {
  for (const [config, data] of [
    [{ type: 'root', power: 3 }, 'M -70 -20 L -70 20'],
    [{ type: 'joukowski', lambda: .2 }, 'M -30 0 L 30 0'],
  ]) {
    const output = mapSvgPath(parseSvgPath(data), createMathMapper(config, box), { maxStep: 5 });
    assert.ok(output.seamCount > 0);
    assert.ok(parseSvgPath(output.broken).length >= 2);
    assert.doesNotMatch(output.intact + output.broken, /NaN|Infinity/);
  }
  const positive = mapSvgPath(parseSvgPath('M 70 -20 L 70 20'), createMathMapper({ type: 'root' }, box));
  assert.equal(positive.seamCount, 0);
});

test('a shared sample budget stops all further branch and operation evaluation', () => {
  const budget = { used: 0, max: 20 };
  const path = parseSvgPath('M -100 -90 C 300 200 -200 400 100 90');
  assert.throws(() => mapSvgPath(path, createMathMapper({ type: 'vortex', strength: 20 }, box), { budget }), /limit/);
  assert.ok(budget.used <= 21);
  assert.throws(() => mapSvgPath(path, identity, { budget }), /limit/);
});
