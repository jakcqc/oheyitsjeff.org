/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Run: node --experimental-default-type=module --test tests/param-visibility.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesParamVisibility } from '../helper/paramVisibility.js';

test('omitted conditions and empty maps preserve existing parameter visibility', () => {
  for (const condition of [undefined, null, {}]) {
    assert.equal(matchesParamVisibility(condition, {}), true);
  }
});

test('selector values match exact strings, including case and punctuation', () => {
  const condition = { method: 'voronoi' };
  assert.equal(matchesParamVisibility(condition, { method: 'voronoi' }), true);
  for (const method of ['Voronoi', 'voronoi ', 'mosaic', 'voronoi || mosaic']) {
    assert.equal(matchesParamVisibility(condition, { method }), false);
  }
});

test('multiple allowed values are alternatives and selector keys intersect', () => {
  const condition = { method: ['voronoi', 'triangles'], colorMode: ['rgb', 'duotone'] };
  for (const method of ['voronoi', 'triangles']) {
    for (const colorMode of ['rgb', 'duotone']) {
      assert.equal(matchesParamVisibility(condition, { method, colorMode }), true);
    }
  }
  assert.equal(matchesParamVisibility(condition, { method: 'voronoi', colorMode: 'greyscale' }), false);
  assert.equal(matchesParamVisibility(condition, { method: 'pixels', colorMode: 'rgb' }), false);
});

test('dot paths read nested selectors without evaluating expressions', () => {
  const state = { growth: { equation: 'monod', enabled: true }, 'growth.equation': 'logistic' };
  assert.equal(matchesParamVisibility({ 'growth.equation': 'monod' }, state), true);
  assert.equal(matchesParamVisibility({ 'growth.equation': 'logistic' }, state), false);
  assert.equal(matchesParamVisibility({ 'growth.enabled': true, 'growth.equation': 'monod' }, state), true);
  assert.equal(matchesParamVisibility({ 'growth.equation === "monod"': true }, state), false);
});

test('matching never coerces numbers, booleans, or strings', () => {
  for (const value of [0, 1, false, true, '']) {
    assert.equal(matchesParamVisibility({ selector: value }, { selector: value }), true);
    assert.equal(matchesParamVisibility({ selector: [value] }, { selector: value }), true);
  }
  assert.equal(matchesParamVisibility({ selector: 1 }, { selector: '1' }), false);
  assert.equal(matchesParamVisibility({ selector: 'false' }, { selector: false }), false);
  assert.equal(matchesParamVisibility({ selector: false }, { selector: 0 }), false);
});

test('missing selectors and empty alternatives hide their dependent controls', () => {
  assert.equal(matchesParamVisibility({ method: 'voronoi' }, {}), false);
  assert.equal(matchesParamVisibility({ method: [] }, { method: 'voronoi' }), false);
  assert.equal(matchesParamVisibility({ 'growth.equation': 'monod' }, { growth: null }), false);
  assert.equal(matchesParamVisibility({ 'growth.equation': 'monod' }, null), false);
  assert.equal(matchesParamVisibility({ method: null }, {}), false);
});

test('malformed conditions fail closed without invoking functions', () => {
  let invoked = false;
  const executable = () => { invoked = true; return true; };
  for (const condition of [true, false, 42, 'method=voronoi', [], ['voronoi'], new Date(), executable,
    { method: {} }, { method: ['voronoi', {}] }, { method: [['voronoi']] },
    { method: null }, { method: undefined }, { method: executable }, { method: NaN }, { method: Infinity }]) {
    assert.equal(matchesParamVisibility(condition, { method: 'voronoi' }), false);
  }
  assert.equal(invoked, false);
});

test('selectors read own state properties and require well-formed dot paths', () => {
  assert.equal(matchesParamVisibility({ method: 'voronoi' }, Object.create({ method: 'voronoi' })), false);
  for (const path of ['', '.method', 'method.', 'growth..equation', 'constructor', '__proto__.method']) {
    assert.equal(matchesParamVisibility({ [path]: 'voronoi' }, { method: 'voronoi' }), false);
  }
});

test('checking immutable settings neither edits conditions nor creates state keys', () => {
  const options = Object.freeze(['voronoi', 'triangles']);
  const condition = Object.freeze({ method: options, 'growth.equation': 'monod' });
  const state = Object.freeze({ method: 'voronoi', growth: Object.freeze({ equation: 'monod' }) });
  assert.equal(matchesParamVisibility(condition, state), true);
  assert.equal(matchesParamVisibility({ 'missing.path': 'anything' }, state), false);
  assert.equal(Object.hasOwn(state, 'missing'), false);
});
