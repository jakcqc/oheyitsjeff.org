/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStudyRandomization } from '../scripts/study-randomization.mjs';
const config = (seed, rules) => ({ algorithm: 'mulberry32-v1', seed, rules });

test('seeded starting operations are reproducible without consuming ambient randomness', () => {
  const rules = [
    { path: 'grid.size', op: 'integer', min: 10, max: 100 },
    { path: 'width', op: 'multiply', min: 0.25, max: 2 },
    { path: 'phase', op: 'add', min: -1, max: 1 },
    { path: 'layout', op: 'choice', values: ['rows', 'radial', 'clumps'] },
  ];
  const original = { grid: { size: 50, untouched: true }, width: 4, phase: 2, layout: 'rows' };
  const keys = rules.map(rule => rule.path);
  const a = structuredClone(original), b = structuredClone(original), c = structuredClone(original);
  const ambient = Math.random;
  Math.random = () => { throw new Error('Must use the independent seeded stream'); };
  try {
    const receipt = applyStudyRandomization(a, config(500, rules), keys);
    assert.deepEqual(receipt, applyStudyRandomization(b, config(500, rules), keys));
    assert.deepEqual(a, b);
    applyStudyRandomization(c, config(501, rules), keys);
    assert.notDeepEqual(a, c);
    assert.equal(a.grid.untouched, true);
    assert.deepEqual(receipt.samples.map(sample => sample.before), [50, 4, 2, 'rows']);
    assert.deepEqual(receipt.samples.map(sample => sample.value), [a.grid.size, a.width, a.phase, a.layout]);
  } finally { Math.random = ambient; }
});

test('versioned generator and every sample respect explicit bounds and types', () => {
  const state = { number: 0 };
  const receipt = applyStudyRandomization(state, config(1, [{ path: 'number', op: 'uniform', min: 0, max: 1, digits: 12 }]), ['number']);
  assert.equal(receipt.samples[0].value, 0.627073940588, 'Keep mulberry32-v1 stable');
  const counts = new Set(), choices = new Set();
  for (let seed = 0; seed < 256; seed++) {
    const sample = { count: 0, opacity: 0, layout: '' };
    applyStudyRandomization(sample, config(seed, [
      { path: 'count', op: 'integer', min: 2, max: 5 },
      { path: 'opacity', op: 'uniform', min: 0.1, max: 0.8 },
      { path: 'layout', op: 'choice', values: ['rows', 'radial', 'clumps'] },
    ]), ['count', 'opacity', 'layout']);
    assert.ok(Number.isInteger(sample.count) && sample.count >= 2 && sample.count <= 5);
    assert.ok(sample.opacity >= 0.1 && sample.opacity <= 0.8);
    counts.add(sample.count); choices.add(sample.layout);
  }
  assert.deepEqual([...counts].sort(), [2, 3, 4, 5]);
  assert.deepEqual([...choices].sort(), ['clumps', 'radial', 'rows']);
});

test('invalid parameter paths and ranges fail before modifying any settings', () => {
  const good = { path: 'count', op: 'integer', min: 3, max: 5 };
  const invalid = [
    { ...good, path: 'unknown' },
    { ...good, path: 'constructor.prototype.polluted' },
    { ...good, path: 'nested.missing' },
    { ...good, path: 'width', min: 10, max: 1 },
    { ...good, path: 'width', min: 0.2 },
    { ...good, path: 'width', max: Infinity },
    { path: 'width', op: 'choice', values: [] },
    good,
  ];
  for (const bad of invalid) {
    const state = { count: 2, width: 5, nested: {} };
    assert.throws(() => applyStudyRandomization(state, config(100, [good, bad]), ['count', 'width', 'nested.missing', 'constructor.prototype.polluted']));
    assert.deepEqual(state, { count: 2, width: 5, nested: {} });
  }
  for (const seed of [-1, 1.5, 0x100000000, NaN]) assert.throws(() => applyStudyRandomization({ count: 2 }, config(seed, [good]), ['count']));
});
