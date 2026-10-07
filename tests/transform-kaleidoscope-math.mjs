/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
// Run: node --experimental-default-type=module --test tests/transform-kaleidoscope-math.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeKaleidoscope, buildKaleidoscopeGeometry } from '../helper/kaleidoscopeMath.js';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const matrix = sector => sector.transform.slice(7, -1).split(/\s+/).map(Number);
const apply = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const point = (center, radius, degrees) => ({ x: center.x + radius * Math.cos(degrees * Math.PI / 180), y: center.y + radius * Math.sin(degrees * Math.PI / 180) });
const nearPoint = (a, b) => { near(a.x, b.x); near(a.y, b.y); };

test('normalization clamps repeat counts, wraps angles, and is JSON-stable', () => {
  assert.deepEqual(normalizeKaleidoscope(), { count: 6, mirror: true, rotationDeg: 0, center: { x: null, y: null } });
  assert.equal(normalizeKaleidoscope({ count: 1 }).count, 2);
  assert.equal(normalizeKaleidoscope({ count: 1000 }).count, 64);
  assert.equal(normalizeKaleidoscope({ count: 7.8 }).count, 8);
  assert.equal(normalizeKaleidoscope({ count: '9', rotationDeg: -390 }).rotationDeg, 330);
  assert.equal(normalizeKaleidoscope({ mirror: false }).mirror, false);
  for (const empty of ['', '   ', null, undefined, NaN, Infinity, -Infinity, [], {}, false]) {
    const normalized = normalizeKaleidoscope({ count: empty, rotationDeg: empty, center: { x: empty, y: empty } });
    assert.deepEqual(normalized.center, { x: null, y: null });
    assert.equal(normalized.count, 6);
    assert.equal(normalized.rotationDeg, 0);
    assert.deepEqual(normalizeKaleidoscope(JSON.parse(JSON.stringify(normalized))), normalized);
  }
  const supplied = Object.freeze({ count: 7, mirror: true, rotationDeg: 25, center: Object.freeze({ x: 0.25, y: -20 }) });
  assert.deepEqual(normalizeKaleidoscope(normalizeKaleidoscope(supplied)), supplied);
});

test('auto and fractional centers include the viewBox origin and radius covers every corner', () => {
  const bounds = { x: -120, y: 80, w: 640, h: 300 };
  assert.deepEqual(buildKaleidoscopeGeometry({}, bounds).center, { x: 200, y: 230 });
  assert.deepEqual(buildKaleidoscopeGeometry({ center: { x: 0.25, y: 0.75 } }, bounds).center, { x: 40, y: 305 });
  assert.deepEqual(buildKaleidoscopeGeometry({ center: { x: 0, y: 1 } }, bounds).center, { x: -120, y: 380 });
  for (const center of [{ x: null, y: null }, { x: -1000, y: 2500 }, { x: 0.2, y: 0.9 }]) {
    const geometry = buildKaleidoscopeGeometry({ center }, bounds);
    for (const x of [bounds.x, bounds.x + bounds.w]) for (const y of [bounds.y, bounds.y + bounds.h]) {
      assert.ok(geometry.radius > Math.hypot(x - geometry.center.x, y - geometry.center.y));
    }
  }
});

test('all N cover exactly one turn and map source wedge interiors, endpoints, and centers correctly', () => {
  // Include every odd N: alternating reflection across pi/N is valid for all N,
  // unlike treating N itself as the number of alternating mirrored sectors.
  for (let count = 2; count <= 64; count++) for (const mirror of [false, true]) for (const rotationDeg of [0, 23, 350]) {
    const geometry = buildKaleidoscopeGeometry({ count, mirror, rotationDeg, center: { x: 0.3, y: -75 } }, { x: 100, y: -250, w: 500, h: 370 });
    const { center, sectors, sectorAngleDeg } = geometry;
    assert.equal(sectors.length, count * (mirror ? 2 : 1));
    near(sectors[0].startDeg, rotationDeg);
    near(sectors.at(-1).endDeg, rotationDeg + 360);
    let totalAngle = 0;
    for (const sector of sectors) {
      const m = matrix(sector);
      assert.equal(m.length, 6);
      assert.ok(m.every(Number.isFinite));
      nearPoint(apply(m, center), center);
      near(m[0] * m[3] - m[1] * m[2], sector.mirrored ? -1 : 1);
      near(m[0] * m[0] + m[1] * m[1], 1);
      near(m[0] * m[2] + m[1] * m[3], 0);
      if (sector.index) near(sectors[sector.index - 1].endDeg, sector.startDeg);
      totalAngle += sector.endDeg - sector.startDeg;
      for (const fraction of [0, 0.23, 0.5, 1]) {
        const source = point(center, 47, rotationDeg + fraction * sectorAngleDeg);
        const expectedAngle = sector.mirrored ? sector.endDeg - fraction * sectorAngleDeg : sector.startDeg + fraction * sectorAngleDeg;
        nearPoint(apply(m, source), point(center, 47, expectedAngle));
      }
    }
    near(totalAngle, 360);
  }
});

test('dihedral generators obey rotation^N = identity, reflection^2 = identity, and SRS = inverse(R)', () => {
  for (const count of [2, 3, 5, 8, 63, 64]) {
    const { center, sectors } = buildKaleidoscopeGeometry({ count, rotationDeg: 39 }, { x: -80, y: 25, w: 640, h: 500 });
    const rotation = matrix(sectors[2]);
    const reflection = matrix(sectors[1]);
    const p = { x: center.x + 39, y: center.y - 21 };
    let rotated = p;
    for (let i = 0; i < count; i++) rotated = apply(rotation, rotated);
    nearPoint(rotated, p);
    nearPoint(apply(reflection, apply(reflection, p)), p);
    const inverseRotation = matrix(sectors[2 * (count - 1)]);
    nearPoint(apply(reflection, apply(rotation, apply(reflection, p))), apply(inverseRotation, p));
  }
});

test('N=2 rotation-only uses a half-circle arc rather than a degenerate triangle', () => {
  const geometry = buildKaleidoscopeGeometry({ count: 2, mirror: false }, { x: 0, y: 0, w: 100, h: 100 });
  assert.equal(geometry.sectorAngleDeg, 180);
  assert.equal(geometry.sectors.length, 2);
  const values = geometry.clipPath.match(/[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi).map(Number);
  assert.match(geometry.clipPath, / A /);
  assert.equal(values.length, 11);
  near(values[2], geometry.center.x + geometry.radius);
  near(values[3], geometry.center.y);
  near(values[9], geometry.center.x - geometry.radius);
  near(values[10], geometry.center.y);
  assert.ok(geometry.radius > Math.hypot(50, 50));
});

test('invalid or extreme imported values never emit non-finite geometry', () => {
  for (const input of [null, [], { count: Infinity, center: { x: 'bad', y: NaN } }, { count: 1e308, rotationDeg: -1e308, center: { x: -1e308, y: 1e308 } }]) {
    for (const bounds of [null, {}, { x: NaN, y: Infinity, w: -100, h: '' }, { x: -1e308, y: 1e308, w: 1e308, h: 1e308 }]) {
      const geometry = buildKaleidoscopeGeometry(input, bounds);
      assert.ok(Number.isFinite(geometry.radius));
      assert.ok(Number.isFinite(geometry.center.x));
      assert.ok(Number.isFinite(geometry.center.y));
      assert.doesNotMatch(geometry.clipPath, /NaN|Infinity/);
      for (const sector of geometry.sectors) assert.ok(matrix(sector).every(Number.isFinite));
    }
  }
});
