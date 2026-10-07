/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
// Run: node --test tests/time-model.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const modelSource = await readFile(new URL('../helper/timeModel.js', import.meta.url), 'utf8');
const { DEFAULT_TIME_CONFIG, MAX_TIME_SNAPSHOTS, TIME_LAYOUTS, normalizeTimeConfig, compileTimeExpression, getTimeCapacity, layoutSnapshots } = await import(
  `data:text/javascript;base64,${Buffer.from(modelSource).toString('base64')}`,
);

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const snapshots = (count, width = 100, height = 100) => Array.from({ length: count }, () => ({ width, height }));
const center = rect => [rect.x + rect.width / 2, rect.y + rect.height / 2];

test('settings keep stable defaults and normalize numeric form inputs without modifying them', () => {
  assert.deepEqual(normalizeTimeConfig(), DEFAULT_TIME_CONFIG);
  const input = Object.freeze({ columns: '4', rows: '2', sampleInterval: '0.2', width: '1600' });
  const config = normalizeTimeConfig(input);
  assert.equal(config.columns, 4);
  assert.equal(config.width, 1600);
  assert.equal(config.sampleInterval, 0.2);
  assert.equal(getTimeCapacity(config), 8);
  assert.equal(getTimeCapacity({ layout: 'free' }), MAX_TIME_SNAPSHOTS);
  assert.equal(normalizeTimeConfig({ sampleMode: 'replace' }).sampleMode, 'replace');
  assert.deepEqual(normalizeTimeConfig(config), config);
});

test('invalid sizes, counts, capacity, gap and expression syntax fail with useful messages', () => {
  for (const value of [null, '', ' ', true, NaN, Infinity, -1, 0]) {
    assert.throws(() => normalizeTimeConfig({ width: value }), /Canvas width/);
  }
  assert.throws(() => normalizeTimeConfig({ columns: 2.5 }), /Columns must be a whole number/);
  assert.throws(() => normalizeTimeConfig({ columns: 21, rows: 20 }), /at most 400 slots/);
  assert.throws(() => normalizeTimeConfig({ sampleCount: 401 }), /Sample count must be at most 400/);
  assert.throws(() => normalizeTimeConfig({ sampleInterval: 0 }), /Sampling interval must be greater than 0/);
  assert.throws(() => normalizeTimeConfig({ gap: 600 }), /no space for snapshots/);
  assert.throws(() => normalizeTimeConfig({ layout: 'hexagon' }), /Unknown Time layout/);
  assert.throws(() => normalizeTimeConfig({ sampleMode: 'overwrite' }), /append or replace/);
  assert.throws(() => normalizeTimeConfig({ xExpression: 'W/' }), /X expression/);
});

test('safe expressions support variables, constants, math functions and arithmetic precedence', () => {
  const evaluate = (expression, scope = {}) => compileTimeExpression(expression)(scope);
  assert.equal(evaluate('2 + 3 * 4 ^ 2'), 50);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-2**2'), -4);
  assert.equal(evaluate('2^-2'), 0.25);
  assert.equal(evaluate('-(2 + 3) * +4'), -20);
  assert.equal(evaluate('1e2 + .5 - 3. % 2'), 99.5);
  near(evaluate('sin(pi/2) + cos(0) + log(e) + exp(0)'), 4);
  near(evaluate('sqrt(9)+abs(-2)+floor(2.8)+ceil(.1)+round(1.6)+pow(2,3)'), 18);
  near(evaluate('tan(0)+atan2(1,0)'), Math.PI / 2);
  assert.equal(evaluate('max(1,2,3) + min(7,4)'), 7);
  assert.equal(evaluate('i + n + t + W/H', { i: 2, n: 3, t: 0.5, W: 100, H: 20 }), 10.5);
});

test('expression parser rejects arbitrary JavaScript, invalid math and pathological input', () => {
  for (const source of ['globalThis', 'constructor', 'Math.sin(0)', 'i = 5', 'alert(1)', 'i;1', '[1]', '`x`', '1 ? 2 : 3', 'sin.constructor(1)', '1 2', 'sin()', 'atan2(1)', 'pow(1,2,3)', '1e999']) {
    assert.throws(() => compileTimeExpression(source), undefined, source);
  }
  for (const source of ['1/0', 'sqrt(-1)', 'log(0)', 'pow(2,1024)']) {
    assert.throws(() => compileTimeExpression(source)(), /finite number/, source);
  }
  assert.throws(() => compileTimeExpression('W')(), /Variable W/);
  assert.throws(() => compileTimeExpression('('.repeat(80) + '1' + ')'.repeat(80)), /nested too deeply/);
  assert.throws(() => compileTimeExpression('1'.repeat(1025)), /1024 characters/);
});

test('grid rectangles fit cells, preserve aspect, and follow array order without overflow', () => {
  const settings = { width: 600, height: 400, columns: 2, rows: 2, gap: 20 };
  const items = [{ width: 200, height: 100 }, { width: 100, height: 200 }];
  const rects = layoutSnapshots(settings, items);
  assert.deepEqual(rects[0], { x: 0, y: 22.5, width: 290, height: 145, scale: 1 });
  assert.deepEqual(rects[1], { x: 407.5, y: 0, width: 95, height: 190, scale: 1 });
  const reordered = layoutSnapshots(settings, [...items].reverse());
  near(reordered[0].width / reordered[0].height, 0.5);
  assert.deepEqual(center(reordered[0]), center(rects[0]));
  assert.throws(() => layoutSnapshots(settings, snapshots(5)), /room for 4 snapshots/);
});

test('circle and polygons sample their circumference and perimeter in order', () => {
  const settings = { width: 1000, height: 1000, size: 100, radius: 300 };
  const circle = layoutSnapshots({ ...settings, layout: 'circle' }, snapshots(4));
  [[500, 200], [800, 500], [500, 800], [200, 500]].forEach((expected, i) => {
    center(circle[i]).forEach((value, axis) => near(value, expected[axis]));
  });
  const triangle = layoutSnapshots({ ...settings, layout: 'triangle' }, snapshots(6));
  const a = center(triangle[0]), midpoint = center(triangle[1]), b = center(triangle[2]);
  midpoint.forEach((value, axis) => near(value, (a[axis] + b[axis]) / 2));
  const square = layoutSnapshots({ ...settings, layout: 'square' }, snapshots(4));
  near(center(square[0])[1], center(square[1])[1]);
  near(center(square[1])[0], center(square[2])[0]);
  const polygon = layoutSnapshots({ ...settings, layout: 'polygon', sides: 5 }, snapshots(5));
  polygon.forEach(rect => near(Math.hypot(center(rect)[0] - 500, center(rect)[1] - 500), 300));
});

test('free placement preserves independent center and scale, including negative coordinates', () => {
  const item = { width: 200, height: 100, placement: { x: -50, y: 350, scale: 2 } };
  assert.deepEqual(layoutSnapshots({ layout: 'free', size: 100 }, [item])[0], { x: -150, y: 300, width: 200, height: 100, scale: 2 });
  assert.deepEqual(item.placement, { x: -50, y: 350, scale: 2 });
  assert.throws(() => layoutSnapshots({ layout: 'free' }, [{ ...item, placement: { scale: 0 } }]), /scale must be greater than 0/);
});

test('function placement maps index, normalized time, count, canvas and independent scale', () => {
  const config = { layout: 'function', width: 1000, height: 600, size: 200, xExpression: '100 + i * 200', yExpression: 'H/2 + t*100', scaleExpression: '(i+1)/n' };
  const rects = layoutSnapshots(config, snapshots(3, 200, 100));
  assert.deepEqual(center(rects[0]), [100, 300]);
  assert.deepEqual(center(rects[1]), [300, 350]);
  assert.deepEqual(center(rects[2]), [500, 400]);
  near(rects[0].width, 200 / 3);
  near(rects[1].height, 200 / 3);
  assert.equal(rects[2].scale, 1);
  assert.deepEqual(center(layoutSnapshots({ ...config, yExpression: 't' }, snapshots(1))[0]), [100, 0]);
  assert.throws(() => layoutSnapshots({ ...config, xExpression: '1/(i-1)' }, snapshots(3)), /X expression at snapshot 2.*finite/);
  assert.throws(() => layoutSnapshots({ ...config, scaleExpression: 'i' }, snapshots(3)), /Scale expression at snapshot 1.*greater than 0/);
  assert.throws(() => layoutSnapshots({ ...config, scaleExpression: '1e308' }, snapshots(3)), /placement is too large/);
});

test('default function placement distributes snapshots without overlapping circle endpoints', () => {
  const rects = layoutSnapshots({ layout: 'function' }, snapshots(4));
  const centers = rects.map(center);
  assert.equal(new Set(centers.map(point => point.map(value => value.toFixed(8)).join(','))).size, 4);
  centers.forEach(point => near(Math.hypot(point[0] - 600, point[1] - 600), 384));
});

test('finite positions cannot overflow rectangle edges or the exported composition bounds', () => {
  const config = { layout: 'function', size: 1e308, xExpression: '1.5e308', yExpression: 'H/2', scaleExpression: '1' };
  assert.throws(() => layoutSnapshots(config, snapshots(1)), /Snapshot 1 placement is too large/);
  assert.throws(() => layoutSnapshots({ ...config, size: 100, xExpression: '(i*2-1)*1e308' }, snapshots(2)), /Composition bounds are too large/);
});

test('every layout supports an empty collection and enforces bounded snapshot count', () => {
  for (const layout of TIME_LAYOUTS) {
    assert.deepEqual(layoutSnapshots({ layout }, []), []);
    assert.throws(() => layoutSnapshots({ layout }, snapshots(401)), /room for/);
  }
  assert.throws(() => layoutSnapshots({}, [{ width: Infinity, height: 100 }]), /Snapshot 1 width/);
});
