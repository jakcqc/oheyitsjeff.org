/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Run: node --experimental-default-type=module --test tests/tab-dock-model.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_DOCK_PANES, MAX_DOCK_DEPTH, normalizeDockLayout, getDockPanes, findDockNode,
  activateDockTab, moveDockTab, setDockRatio, flattenDockLayout,
} from '../helper/tabDockModel.js';

const names = ['params', 'transforms', 'filters', 'save', 'load'];
const initial = () => normalizeDockLayout(null, names);
const pane = (id, active) => ({ type: 'pane', id, active });
const split = (id, first, second, axis = 'column', ratio = 0.5) => ({ type: 'split', id, first, second, axis, ratio });
const paired = () => normalizeDockLayout({ version: 2, root: split('split', pane('left', 'params'), pane('right', 'transforms'), 'row'), activePaneId: 'right' }, names);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

function invariant(layout, expectedNames = names) {
  const ids = new Set();
  const visible = new Set();
  const read = (node, depth = 0) => {
    assert.ok(depth <= MAX_DOCK_DEPTH, 'bounded nesting');
    assert.equal(ids.has(node.id), false, 'unique node IDs');
    ids.add(node.id);
    if (node.type === 'pane') {
      assert.equal(Object.hasOwn(node, 'tabs'), false, 'panes do not own tabs');
      assert.ok(layout.tabs.includes(node.active), 'each pane shows a registered editor');
      assert.equal(visible.has(node.active), false, 'visible editors are unique');
      visible.add(node.active);
    } else {
      assert.equal(node.type, 'split');
      assert.ok(['row', 'column'].includes(node.axis));
      assert.ok(node.ratio >= 0.15 && node.ratio <= 0.85);
      read(node.first, depth + 1);
      read(node.second, depth + 1);
    }
  };
  assert.equal(layout.version, 2);
  assert.deepEqual(layout.tabs, expectedNames, 'all global tabs retain registered order');
  if (layout.root) read(layout.root);
  else assert.equal(expectedNames.length, 0, 'non-empty apps always show an editor');
  assert.ok(visible.size <= MAX_DOCK_PANES);
  if (visible.size) assert.equal(findDockNode(layout, layout.activePaneId)?.type, 'pane');
  else assert.equal(layout.activePaneId, null);
  assert.deepEqual(normalizeDockLayout(layout, expectedNames), layout, 'normalization is idempotent');
}

test('starts with the legacy selected editor and keeps every global tab in registered order', () => {
  const layout = normalizeDockLayout(null, names, 'transforms');
  invariant(layout);
  assert.equal(layout.root.active, 'transforms');
  assert.equal(getDockPanes(layout).length, 1);
  const saved = freeze({ version: 2, tabs: ['save', 'params', 'obsolete'], root: pane('existing', 'save'), activePaneId: 'existing' });
  const restored = normalizeDockLayout(saved, names);
  invariant(restored);
  assert.equal(restored.root.active, 'save');
  assert.equal(restored.root.id, 'existing');
});

test('migrates v1 grouped tabs to unique visible editors and removes empty panes', () => {
  const oldPane = (id, tabs, active) => ({ type: 'pane', id, tabs, active });
  const saved = freeze({ version: 1, root: split('main',
    oldPane('left', ['params', 'filters'], 'filters'),
    split('nested', oldPane('right', ['transforms', 'load', 'save'], 'transforms'), oldPane('empty', [], null))),
  activePaneId: 'right' });
  const layout = normalizeDockLayout(saved, names);
  invariant(layout);
  assert.deepEqual(getDockPanes(layout).map(item => item.active), ['filters', 'transforms']);
  assert.equal(layout.activePaneId, 'right');
  assert.equal(layout.root.second.type, 'pane');
});

test('repairs unknown and duplicate visible editors, IDs, invalid focus, and split settings', () => {
  const saved = freeze({ version: 2, root: split('duplicate',
    pane('duplicate', 'params'), split('nested', pane('duplicate', 'filters'),
      split('removed', pane('gone', 'missing'), pane('again', 'params'))), 'diagonal', Infinity),
  activePaneId: 'missing' });
  const result = normalizeDockLayout(saved, names, 'filters');
  invariant(result);
  assert.equal(getDockPanes(result).length, 2);
  assert.equal(result.root.axis, 'column');
  assert.equal(result.root.ratio, 0.5);
  assert.equal(findDockNode(result, result.activePaneId).active, 'filters');
});

test('normalization bounds cyclic, deep and oversized state and handles apps without tabs', () => {
  const cyclic = split('cycle', pane('first', 'params'), null);
  cyclic.second = cyclic;
  invariant(normalizeDockLayout({ root: cyclic }, names));
  const many = Array.from({ length: 200 }, (_, i) => `tab${i}`);
  let deep = pane('end', 'tab199');
  for (let i = 198; i >= 0; i--) deep = split(`split-${i}`, pane(`pane-${i}`, many[i]), deep);
  const repaired = normalizeDockLayout({ root: deep }, many);
  invariant(repaired, many);
  assert.equal(getDockPanes(repaired).length, MAX_DOCK_PANES);
  invariant(normalizeDockLayout({ root: { type: 'unrecognized' } }, names));
  invariant(normalizeDockLayout(null, []), []);
});

test('global tab activation replaces the last-focused pane and leaves other panes intact', () => {
  const original = freeze(paired());
  const result = activateDockTab(original, 'filters');
  invariant(result);
  assert.equal(findDockNode(result, 'left').active, 'params');
  assert.equal(findDockNode(result, 'right').active, 'filters');
  assert.equal(result.activePaneId, 'right');
  assert.equal(original.root.second.active, 'transforms');
  assert.equal(activateDockTab(result, 'filters'), result);
  assert.equal(activateDockTab(result, 'missing'), result);
});

test('activating an already-visible global tab swaps editors and preserves split geometry', () => {
  const original = freeze(setDockRatio(paired(), 'split', .35));
  const result = activateDockTab(original, 'params');
  invariant(result);
  assert.equal(findDockNode(result, 'left').active, 'transforms');
  assert.equal(findDockNode(result, 'right').active, 'params');
  assert.equal(result.activePaneId, 'right');
  assert.equal(result.root.id, 'split');
  assert.equal(result.root.ratio, .35);
  assert.equal(result.root.axis, 'row');
});

test('center drops replace the target or swap existing editors while focusing that pane', () => {
  const original = freeze(paired());
  const replaced = moveDockTab(original, 'save', 'left');
  invariant(replaced);
  assert.equal(replaced.activePaneId, 'left');
  assert.equal(findDockNode(replaced, 'left').active, 'save');
  assert.equal(findDockNode(replaced, 'right').active, 'transforms');
  const swapped = moveDockTab(original, 'transforms', 'left', 'center');
  invariant(swapped);
  assert.equal(findDockNode(swapped, 'left').active, 'transforms');
  assert.equal(findDockNode(swapped, 'right').active, 'params');
  const focused = moveDockTab(original, 'params', 'left', 'center');
  assert.equal(focused.activePaneId, 'left');
  assert.equal(getDockPanes(focused).length, 2);
});

test('all four edge drops split the target without changing global tab order', () => {
  const original = freeze(initial());
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const result = moveDockTab(original, 'filters', original.root.id, edge);
    invariant(result);
    assert.equal(result.root.axis, ['left', 'right'].includes(edge) ? 'row' : 'column');
    const added = ['left', 'top'].includes(edge) ? result.root.first : result.root.second;
    const retained = ['left', 'top'].includes(edge) ? result.root.second : result.root.first;
    assert.equal(added.active, 'filters');
    assert.equal(retained.active, 'params');
    assert.equal(retained.id, original.root.id);
    assert.equal(result.activePaneId, added.id);
  }
  assert.equal(moveDockTab(original, 'params', original.root.id, 'top'), original);
  assert.equal(moveDockTab(original, 'filters', 'missing', 'right'), original);
});

test('edge docking a visible editor removes its former pane and preserves target identity', () => {
  const original = freeze(moveDockTab(paired(), 'filters', 'right', 'bottom'));
  const result = moveDockTab(original, 'params', 'right', 'left');
  invariant(result);
  assert.equal(getDockPanes(result).length, 3);
  assert.equal(findDockNode(result, 'left'), null);
  assert.equal(findDockNode(result, 'right').active, 'transforms');
  const newPane = findDockNode(result, result.activePaneId);
  assert.equal(newPane.active, 'params');
  assert.equal(result.root.first.axis, 'row');
  assert.equal(result.root.first.second.id, 'right');
});

test('caps panes at eight and permits relocating a visible editor at the cap', () => {
  const many = Array.from({ length: 12 }, (_, i) => `tab${i}`);
  let layout = normalizeDockLayout(null, many);
  for (const tab of many.slice(1)) {
    layout = moveDockTab(freeze(layout), tab, getDockPanes(layout)[0].id, 'bottom');
    invariant(layout, many);
  }
  assert.equal(getDockPanes(layout).length, MAX_DOCK_PANES);
  assert.equal(moveDockTab(layout, 'tab11', getDockPanes(layout)[0].id, 'right'), layout);
  const originalPanes = getDockPanes(layout);
  const relocated = moveDockTab(freeze(layout), originalPanes[0].active, originalPanes.at(-1).id, 'right');
  invariant(relocated, many);
  assert.notEqual(relocated, layout);
  assert.equal(getDockPanes(relocated).length, MAX_DOCK_PANES);
});

test('long-press isolation keeps global tabs and can select a hidden or already-visible editor', () => {
  const original = freeze(paired());
  const hidden = flattenDockLayout(original, 'load');
  invariant(hidden);
  assert.equal(hidden.root.type, 'pane');
  assert.equal(hidden.root.active, 'load');
  const visible = flattenDockLayout(original, 'params');
  invariant(visible);
  assert.equal(visible.root.active, 'params');
  const focused = flattenDockLayout(original);
  assert.equal(focused.root.active, 'transforms');
  assert.equal(flattenDockLayout(focused, 'transforms'), focused);
  const replaced = flattenDockLayout(focused, 'filters');
  assert.equal(replaced.root.active, 'filters');
  assert.deepEqual(replaced.tabs, names);
});

test('split ratios clamp without mutating layout or editor selections', () => {
  const layout = freeze(paired());
  for (const [value, expected] of [[0, .15], [100, .85], [NaN, .5], [Infinity, .5], [.72, .72]]) {
    const result = setDockRatio(layout, 'split', value);
    invariant(result);
    assert.equal(result.root.ratio, expected);
    assert.deepEqual(getDockPanes(result).map(item => item.active), ['params', 'transforms']);
  }
  assert.equal(setDockRatio(layout, 'missing', .3), layout);
  assert.equal(layout.root.ratio, .5);
});

test('mixed global selection, replacement, splitting and isolation preserve state invariants', () => {
  let layout = initial();
  let seed = 731;
  const random = limit => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % limit);
  for (let i = 0; i < 600; i++) {
    const original = freeze(layout);
    const panes = getDockPanes(layout);
    const target = panes[random(panes.length)];
    const tab = names[random(names.length)];
    switch (random(5)) {
      case 0: layout = moveDockTab(layout, tab, target.id, ['center', 'left', 'right', 'top', 'bottom'][random(5)]); break;
      case 1: layout = activateDockTab(layout, tab); break;
      case 2: layout = setDockRatio(layout, layout.root.id, random(100) / 100); break;
      case 3: layout = moveDockTab(layout, tab, target.id); break;
      case 4: if (i % 17 === 0) layout = flattenDockLayout(layout, tab); break;
    }
    invariant(layout);
    invariant(original);
  }
});
