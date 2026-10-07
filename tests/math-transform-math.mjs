/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
// Run: node --experimental-default-type=module --test tests/math-transform-math.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { MATH_TRANSFORM_TYPES, normalizeMathTransform, createMathMapper } from '../helper/mathTransformMath.js';

const unitBox = { x: -1, y: -1, w: 2, h: 2 };
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const nearPoint = (actual, expected, tolerance) => {
  assert.ok(actual, 'Expected a defined mapped point');
  actual.forEach((value, index) => near(value, expected[index], tolerance));
};
const mapper = (type, config = {}, box = unitBox) => createMathMapper({ type, ...config }, box);

test('normalization has stable defaults and ignores invalid serialized settings', () => {
  const defaults = normalizeMathTransform();
  assert.equal(defaults.type, 'vortex');
  assert.deepEqual(defaults.center, { x: null, y: null });
  assert.deepEqual(MATH_TRANSFORM_TYPES, ['vortex', 'mobius', 'power', 'root', 'wrap', 'annulus', 'joukowski']);
  for (const value of [undefined, null, false, {}, [], '', '  ', NaN, Infinity, -Infinity]) {
    const config = normalizeMathTransform({ power: value, scale: value, center: { x: value, y: value }, radius: value, turns: value });
    assert.deepEqual(config, defaults);
    assert.deepEqual(normalizeMathTransform(JSON.parse(JSON.stringify(config))), config);
  }
  assert.deepEqual(normalizeMathTransform(null), defaults);
  assert.equal(normalizeMathTransform({ type: 'unknown', topology: 'unknown' }).type, 'vortex');
  assert.equal(normalizeMathTransform({ allBranches: 'false' }).allBranches, false);
  assert.equal(normalizeMathTransform({ allBranches: 'true' }).allBranches, true);
  assert.equal(normalizeMathTransform({ power: '4', branch: '-1' }).branch, 3);
});

test('normalization clamps dangerous imports and enforces valid annulus and disk parameters', () => {
  const config = normalizeMathTransform({
    type: 'root', power: 100, branch: 25, scale: -100, strength: 1e100, radius: 0,
    mobiusRe: 1, mobiusIm: 1, innerRadius: 2, outerRadius: 0.1,
    turns: 100, wrapScale: -1, wrapX: -100, lambda: 20,
  });
  assert.equal(config.power, 12);
  assert.equal(config.branch, 1);
  assert.equal(config.scale, 0.1);
  assert.equal(config.strength, 20);
  assert.equal(config.radius, 0.05);
  near(Math.hypot(config.mobiusRe, config.mobiusIm), 0.9);
  assert.ok(config.outerRadius > config.innerRadius);
  assert.equal(config.turns, 8);
  assert.equal(config.wrapScale, 0.25);
  assert.equal(config.wrapX, -10);
  assert.equal(config.lambda, 2);
  const frozen = Object.freeze({ type: 'annulus', center: Object.freeze({ x: 0.2, y: 0.7 }) });
  const normalized = normalizeMathTransform(frozen);
  assert.deepEqual(normalizeMathTransform(normalized), normalized);
});

test('viewBox normalization preserves aspect ratio, origin and fractional centers', () => {
  const box = { x: -100, y: 50, w: 800, h: 200 };
  const identity = mapper('vortex', { strength: 0 }, box);
  assert.deepEqual(identity.center, [300, 150]);
  assert.equal(identity.size, 100);
  nearPoint(identity.sample(600, 90).point, [600, 90]);
  const fractional = mapper('power', { center: { x: 0.25, y: 0.75 }, scale: 2 }, box);
  assert.deepEqual(fractional.center, [100, 200]);
  assert.equal(fractional.size, 200);
  nearPoint(fractional.sample(100, 400).point, [-100, 200]);
  assert.deepEqual(mapper('power', { center: { x: -12, y: 27 } }, box).center, [-12, 27]);
});

test('Hamiltonian vortex keeps radius, is reversible, and preserves local area', () => {
  const forward = mapper('vortex', { strength: 2.7, radius: 0.8 });
  const inverse = mapper('vortex', { strength: -2.7, radius: 0.8 });
  for (const p of [[0, 0], [0.1, 0.7], [-0.5, 0.3], [1.8, -0.1]]) {
    const q = forward.sample(...p).point;
    near(Math.hypot(...q), Math.hypot(...p));
    nearPoint(inverse.sample(...q).point, p);
  }
  const p = [0.37, -0.21];
  const epsilon = 1e-5;
  const dx1 = forward.sample(p[0] + epsilon, p[1]).point;
  const dx0 = forward.sample(p[0] - epsilon, p[1]).point;
  const dy1 = forward.sample(p[0], p[1] + epsilon).point;
  const dy0 = forward.sample(p[0], p[1] - epsilon).point;
  const dx = dx1.map((value, i) => (value - dx0[i]) / (2 * epsilon));
  const dy = dy1.map((value, i) => (value - dy0[i]) / (2 * epsilon));
  near(dx[0] * dy[1] - dx[1] * dy[0], 1, 1e-6);
});

test('Möbius lens maps its parameter to zero and preserves the unit circle', () => {
  const lens = mapper('mobius', { mobiusRe: 0.3, mobiusIm: -0.2 });
  const inverse = mapper('mobius', { mobiusRe: -0.3, mobiusIm: 0.2 });
  nearPoint(lens.sample(0.3, -0.2).point, [0, 0]);
  for (let i = 0; i < 40; i++) {
    const theta = Math.PI * 2 * i / 40;
    const p = [Math.cos(theta), Math.sin(theta)];
    near(Math.hypot(...lens.sample(...p).point), 1);
    nearPoint(inverse.sample(...lens.sample(...p).point).point, p);
    const interior = lens.sample(p[0] * 0.7, p[1] * 0.7).point;
    assert.ok(Math.hypot(...interior) < 1);
  }
});

test('Möbius poles are excluded and detected between finite endpoints', () => {
  const lens = mapper('mobius', { mobiusRe: 0.5 });
  assert.equal(lens.sample(2, 0).point, null);
  assert.ok(lens.sample(1.9, 0).point);
  assert.ok(lens.sample(2.1, 0).point);
  assert.equal(lens.crossesSeam([1.9, 0], [2.1, 0]), true);
  assert.equal(lens.crossesSeam([1.9, 0.1], [2.1, 0.1]), false);
  const identity = mapper('mobius', { mobiusRe: 0, mobiusIm: 0 });
  nearPoint(identity.sample(0.8, -0.5).point, [0.8, -0.5]);
  assert.equal(identity.crossesSeam([-0.1, 0], [0.1, 0]), false);
});

test('every complex-root branch is a distinct inverse sheet of its polynomial', () => {
  for (let power = 2; power <= 12; power++) {
    const polynomial = mapper('power', { power });
    const roots = mapper('root', { power, allBranches: true });
    assert.deepEqual(roots.branches, Array.from({ length: power }, (_, index) => index));
    const outputs = [];
    for (const branch of roots.branches) {
      const sheet = createMathMapper({ type: 'root', power }, unitBox, branch);
      const p = [-0.41, 0.62];
      const q = sheet.sample(...p).point;
      nearPoint(polynomial.sample(...q).point, p);
      for (const previous of outputs) assert.ok(Math.hypot(q[0] - previous[0], q[1] - previous[1]) > 0.1);
      outputs.push(q);
    }
    const selected = mapper('root', { power, branch: power - 1 });
    assert.deepEqual(selected.branches, [power - 1]);
    nearPoint(selected.sample(0, 0).point, [0, 0]);
  }
});

test('root cut splits the negative axis only, without spurious positive-axis seams', () => {
  const root = mapper('root');
  assert.equal(root.crossesSeam([-0.5, -0.1], [-0.5, 0.1]), true);
  assert.equal(root.crossesSeam([-0.5, 0], [-0.5, -0.1]), true);
  assert.equal(root.crossesSeam([-0.5, 0], [-0.5, 0.1]), false);
  assert.equal(root.crossesSeam([0.5, -0.1], [0.5, 0.1]), false);
  assert.equal(root.sample(-0.5, -0.1).region, root.sample(-0.5, 0.1).region);
  assert.equal(mapper('power').crossesSeam([-0.5, -0.1], [-0.5, 0.1]), false);
  const above = root.sample(-0.5, 1e-8).point;
  const below = root.sample(-0.5, -1e-8).point;
  assert.ok(Math.hypot(above[0] - below[0], above[1] - below[1]) > 1);
});

test('torus chart wraps both axes and tracks positive and negative seam crossings', () => {
  const box = { x: 10, y: 20, w: 100, h: 200 };
  const torus = mapper('wrap', { wrapX: 0, wrapY: 0 }, box);
  nearPoint(torus.sample(135, 70).point, [35, 70]);
  nearPoint(torus.sample(-65, -130).point, [35, 70]);
  nearPoint(torus.sample(35, 470).point, [35, 70]);
  assert.equal(torus.crossesSeam([109, 70], [111, 70]), true);
  assert.equal(torus.crossesSeam([35, 219], [35, 221]), true);
  assert.equal(torus.crossesSeam([20, 30], [40, 50]), false);
  const offset = mapper('wrap', { wrapX: 0.25, wrapY: -0.25, wrapScale: 2 }, box);
  nearPoint(offset.sample(35, 70).point, [85, 70]);
});

test('Möbius quotient reflects odd horizontal charts including negative ones and bounds the strip', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  const strip = mapper('wrap', { topology: 'mobius', wrapX: 0 }, box);
  nearPoint(strip.sample(25, 20).point, [25, 20]);
  nearPoint(strip.sample(125, 20).point, [25, 80]);
  nearPoint(strip.sample(-75, 20).point, [25, 80]);
  nearPoint(strip.sample(-175, 20).point, [25, 20]);
  nearPoint(strip.sample(125, 100).point, [25, 0]);
  assert.equal(strip.sample(25, -1).point, null);
  assert.equal(strip.sample(125, 101).point, null);
  assert.equal(strip.crossesSeam([99, 20], [101, 20]), true);
});

test('Klein quotient combines horizontal orientation reversal with vertical periodicity', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  const klein = mapper('wrap', { topology: 'klein', wrapX: 0 }, box);
  nearPoint(klein.sample(125, 120).point, [25, 80]);
  nearPoint(klein.sample(-75, -80).point, [25, 80]);
  nearPoint(klein.sample(225, 120).point, [25, 20]);
  assert.equal(klein.crossesSeam([125, 99], [125, 101]), true);
});

test('annulus covers only the configured ring and remains continuous across angular periods', () => {
  const ring = mapper('annulus', { innerRadius: 0.2, outerRadius: 0.8, turns: 3 });
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const u = i / 10;
    const p = ring.sample(-1 + 2 * u, -1 + 2 * j / 10).point;
    near(Math.hypot(...p), 0.2 * 4 ** u);
    assert.ok(Math.hypot(...p) >= 0.2 - 1e-12);
    assert.ok(Math.hypot(...p) <= 0.8 + 1e-12);
  }
  nearPoint(ring.sample(0, -1).point, [0.4, 0]);
  nearPoint(ring.sample(0, 1).point, [0.4, 0]);
  assert.equal(ring.crossesSeam([0, 0.99], [0, 1.01]), false);
  assert.equal(ring.sample(-1.01, 0).point, null);
  assert.equal(ring.sample(1.01, 0).point, null);
});

test('Joukowski maps the unit circle to its expected ellipse and excludes the pole', () => {
  const transform = mapper('joukowski', { lambda: 0.3 });
  for (let i = 0; i < 20; i++) {
    const theta = 2 * Math.PI * i / 20;
    nearPoint(transform.sample(Math.cos(theta), Math.sin(theta)).point, [1.3 * Math.cos(theta), 0.7 * Math.sin(theta)]);
  }
  assert.equal(transform.sample(0, 0).point, null);
  assert.equal(transform.crossesSeam([-0.1, 0], [0.1, 0]), true);
  assert.equal(transform.crossesSeam([-0.1, 0.1], [0.1, 0.1]), false);
  const identity = mapper('joukowski', { lambda: 0 });
  nearPoint(identity.sample(0, 0).point, [0, 0]);
  assert.equal(identity.crossesSeam([-0.1, 0], [0.1, 0]), false);
});

test('all maps return finite bounded output or excluded samples for extreme inputs', () => {
  for (const type of MATH_TRANSFORM_TYPES) {
    for (const box of [unitBox, null, {}, { x: 1e308, y: -1e308, w: -10, h: Infinity }]) {
      const transform = mapper(type, { center: { x: 1e308, y: -1e308 } }, box);
      for (const p of [[0, 0], [1e308, -1e308], [NaN, 0], [Infinity, 1], [-1, 1]]) {
        const result = transform.sample(...p);
        assert.equal(typeof result.region, 'string');
        assert.ok(result.point === null || result.point.every(value => Number.isFinite(value) && Math.abs(value) <= 1e13));
      }
      assert.equal(transform.crossesSeam([NaN, 0], [0, 0]), true);
    }
  }
  assert.equal(mapper('power', { power: 12 }).sample(100, 100).point, null);
});
