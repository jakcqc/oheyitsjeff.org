/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
// The browser repository has no root package.json declaring ESM. Loading this
// dependency-free module as a data URL also supports the project's Node 20.
const source = await readFile(new URL('../PureAttractors/attractorMath.js', import.meta.url), 'utf8');
const { PRESETS, normalizeMap, step, sampleOrbit } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`,
);

const near = (actual, expected, tolerance = 1e-10) => assert.ok(
  Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
  `${actual} differs from ${expected}`,
);

function polarStep(x, y, map) {
  const r = Math.hypot(x, y);
  if (r === 0) return [0, 0];
  const theta = Math.atan2(y, x);
  const [a0, a1, a2, a3, a4] = map.a;
  const f = a0 + a1 * r ** 2 + a2 * r ** map.n * Math.cos(map.n * theta)
    + a3 * r * Math.cos(map.n * map.p * theta);
  return [
    f * x + a4 * r ** (map.n - 1) * Math.cos((map.n - 1) * theta),
    f * y - a4 * r ** (map.n - 1) * Math.sin((map.n - 1) * theta),
  ];
}

test('complex implementation agrees with the supplied formula, including angular harmonics', () => {
  const output = new Float64Array(2);
  for (const n of [3, 4, 5, 8, 12]) {
    for (const p of [1, 2, 3, 6]) {
      const map = normalizeMap({ n, p, a: [-2.4, 3.8, 0.85, -0.35, 1] });
      for (const [x, y] of [[0.13, 0.17], [-0.6, 0.3], [-0.4, -0.7], [0.7, -0.2], [1e-15, -1e-15]]) {
        const expected = polarStep(x, y, map);
        assert.equal(step(x, y, map, output), output);
        near(output[0], expected[0]);
        near(output[1], expected[1]);
      }
    }
  }
});

test('rotation and reflection commute with every tested generalized map', () => {
  for (let n = 3; n <= 12; n += 1) {
    for (const p of [1, 2, 3]) {
      const map = normalizeMap({ n, p, a: [-2.4, 3.8, 0.85, -0.35, 1] });
      const x = -0.31;
      const y = 0.57;
      const [fx, fy] = step(x, y, map);
      const angle = 2 * Math.PI / n;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const rotated = step(c * x - s * y, s * x + c * y, map);
      near(rotated[0], c * fx - s * fy);
      near(rotated[1], s * fx + c * fy);
      const reflected = step(x, -y, map);
      near(reflected[0], fx);
      near(reflected[1], -fy);
    }
  }
});

test('the origin is a fixed point, including the nonpolynomial term', () => {
  const map = normalizeMap({ a3: -0.35, p: 3 });
  assert.deepEqual(step(0, 0, map), [0, 0]);
  const orbit = sampleOrbit(map, { seed: [0, 0], count: 1000 });
  assert.equal(orbit.status, 'collapsed');
  assert.equal(orbit.count, 1);
  assert.deepEqual([...orbit.points], [0, 0]);
});

test('normalization bounds integer controls and coefficients without mutating presets', () => {
  const map = normalizeMap({ n: 100, p: -3, a: [Infinity, -50, 50, '0.25', NaN] });
  assert.equal(map.n, 12);
  assert.equal(map.p, 1);
  assert.deepEqual(map.a, [-2.4, -8, 8, 0.25, 1]);
  assert.equal(normalizeMap({ n: 4.7, p: 2.2, a2: 0.6 }).n, 5);
  assert.equal(normalizeMap({ a2: 0.6 }).a[2], 0.6);
  const copy = normalizeMap(PRESETS[0]);
  copy.a[0] = 7;
  assert.equal(PRESETS[0].a[0], -2.4);
  assert.deepEqual(normalizeMap(null), normalizeMap());
});

test('escape, fixed points, and short cycles produce honest compact outcomes', () => {
  const escaped = sampleOrbit({ a: [8, 0, 0, 0, 0] });
  assert.equal(escaped.status, 'escaped');
  assert.equal(escaped.count, 0);
  assert.ok(escaped.iterations < 20);
  const fixed = sampleOrbit({ a: [1, 0, 0, 0, 0] });
  assert.equal(fixed.status, 'collapsed');
  assert.equal(fixed.count, 1);
  const cycle = sampleOrbit({ a: [-1, 0, 0, 0, 0] });
  assert.equal(cycle.status, 'periodic');
  assert.equal(cycle.count, 2);
  near(cycle.points[0], -cycle.points[2]);
  near(cycle.points[1], -cycle.points[3]);
});

test('sampling is deterministic and contains actual consecutive iterates of one orbit', () => {
  const preset = PRESETS[0];
  const first = sampleOrbit(preset, { count: 2048, burnIn: 32 });
  const second = sampleOrbit(preset, { count: 2048, burnIn: 32 });
  assert.deepEqual(first, second);
  assert.ok(first.points instanceof Float64Array);
  assert.equal(first.count, 2048);
  assert.equal(first.iterations, 2080);
  let point = [...preset.seed];
  for (let i = 0; i < 33; i += 1) point = step(...point, preset);
  near(first.points[0], point[0]);
  near(first.points[1], point[1]);
  for (let i = 1; i < first.count; i += 1) {
    const expected = step(first.points[(i - 1) * 2], first.points[(i - 1) * 2 + 1], preset);
    assert.equal(first.points[i * 2], expected[0]);
    assert.equal(first.points[i * 2 + 1], expected[1]);
  }
  assert.equal(sampleOrbit(preset, { count: 500000 }).count, 300000);
});

function lyapunovEstimate(preset) {
  let [x, y] = preset.seed;
  let dx = 1e-8;
  let dy = 0;
  let total = 0;
  let measured = 0;
  const next = [0, 0];
  const nearby = [0, 0];
  for (let i = 0; i < 24000; i += 1) {
    step(x + dx, y + dy, preset, nearby);
    step(x, y, preset, next);
    x = next[0];
    y = next[1];
    const separation = Math.hypot(nearby[0] - x, nearby[1] - y);
    if (separation === 0 || !Number.isFinite(separation)) {
      dx = 1e-8;
      dy = 0;
      continue;
    }
    if (i >= 4000) {
      total += Math.log(separation / 1e-8);
      measured += 1;
    }
    dx = (nearby[0] - x) / separation * 1e-8;
    dy = (nearby[1] - y) / separation * 1e-8;
  }
  return total / measured;
}

for (const preset of PRESETS) {
  test(`${preset.name}: long orbit stays bounded, explores every sector, and shows sensitive dependence`, () => {
    const orbit = sampleOrbit(preset, { count: 200000, burnIn: 5000 });
    assert.equal(orbit.status, 'bounded');
    assert.equal(orbit.count, 200000);
    assert.ok(orbit.maxRadius > 0.1 && orbit.maxRadius < 2);
    const occupied = new Set();
    const sectors = new Uint32Array(preset.n * 2);
    for (let i = 0; i < orbit.count; i += 1) {
      const x = orbit.points[i * 2];
      const y = orbit.points[i * 2 + 1];
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      occupied.add(`${Math.round(x / orbit.maxRadius * 150)},${Math.round(y / orbit.maxRadius * 150)}`);
      const theta = Math.atan2(y, x) + Math.PI;
      const sector = Math.min(sectors.length - 1, Math.floor(theta / (2 * Math.PI) * sectors.length));
      sectors[sector] += 1;
    }
    assert.ok(occupied.size > 5000, `${preset.name}: insufficient spatial coverage (${occupied.size})`);
    assert.ok(sectors.every(hits => hits > 500), `${preset.name}: an empty or poorly explored symmetry sector`);
    // A positive finite-time estimate is evidence, not a mathematical proof.
    assert.ok(lyapunovEstimate(preset) > 0.05, `${preset.name}: no measured sensitive dependence`);
  });
}
