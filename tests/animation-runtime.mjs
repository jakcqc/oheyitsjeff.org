/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Run with: node --test tests/animation-runtime.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Isolate the real runtime from the shared UI module's browser bootstrap. The
// small DOM below only covers transport bindings; layout is browser-tested in
// panel-regressions.js.
const source = (await readFile(new URL('../helper/animationHelp.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^export /gm, '');

class TestElement {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = {};
    this.min = '';
    this.value = '';
    this.disabled = false;
    Object.assign(this, attrs);
    this.append(...children);
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(key, value) { this[key] = String(value); }
  getAttribute(key) { return this[key] ?? null; }
  get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
}
const element = (tag, attrs, children) => new TestElement(tag, attrs, children);
const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const labelled = (root, label) => descendants(root).find(node => node['aria-label'] === label);
const button = (root, title) => descendants(root).find(node => node.tagName === 'BUTTON' && node.textContent === title);
const input = (node, value) => { node.value = String(value); node.oninput(); };

function fixture(ui = {}, values = {}) {
  let now = 0;
  let nextId = 0;
  const frames = new Map();
  const changes = [];
  const state = {
    amount: 72, untouched: 123, position: { x: 9, y: 8, z: 7 }, ...values,
    __anim: { ui: {
      paramTargets: [{ key: 'amount', from: 10, to: 30 }],
      durationSec: 1, fps: 20, ...ui,
    } },
  };
  const context = {
    Element: TestElement,
    performance: { now: () => now },
    requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    getByPath: (object, key) => String(key).split('.').reduce((value, part) => value?.[part], object),
    setByPath(object, key, value) {
      const parts = key.split('.');
      const last = parts.pop();
      for (const part of parts) object = object[part] ??= {};
      object[last] = value;
    },
    el: element,
    createSubTabs({ options, value, onChange }) {
      const tabs = { root: element('div'), setValue(next, notify = false) {
        options.forEach(option => { option.panel.hidden = option.value !== next; });
        if (notify) onChange?.(next);
      } };
      for (const option of options) tabs.root.append(element('button', {
        textContent: option.label, onclick: () => tabs.setValue(option.value, true),
      }));
      tabs.setValue(value);
      return tabs;
    },
  };
  const api = vm.runInNewContext(source + '\n({ controlAnimation, ensureAnimateState, buildAnimatePanel })', context);
  const ctx = { state, onChange: (key) => changes.push(key) };
  return {
    state, changes, ctx,
    command: (command) => api.controlAnimation(ctx, command),
    ensure: () => api.ensureAnimateState(state),
    panel: () => api.buildAnimatePanel({ ...ctx, spec: { params: [
      { key: 'amount', type: 'number' }, { key: 'position', type: 'vector3D' },
    ] } }),
    advance(ms, frameTimestamp) {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback(frameTimestamp ?? now));
    },
    get pendingFrames() { return frames.size; },
  };
}

test('old Edit and single-property saves migrate to Flow', () => {
  const f = fixture({ view: 'edit', targetType: 'param', paramKey: 'amount', paramTargets: [], from: 3, to: 9 });
  f.ensure();
  assert.equal(f.state.__anim.ui.view, 'flow');
  assert.equal(f.state.__anim.ui.targetType, 'params');
  assert.equal(JSON.stringify(f.state.__anim.ui.paramTargets), '[{"key":"amount","from":3,"to":9}]');
});

test('play immediately applies explicit starts and preserves unlisted scalar/vector values', () => {
  const f = fixture({ autoFromCurrent: true, paramTargets: [
    { key: 'amount', from: 10, to: 30 }, { key: 'position.x', from: -2, to: 2 },
  ] });
  f.command('play');
  assert.equal(f.state.amount, 10);
  assert.equal(f.state.position.x, -2);
  f.advance(250);
  assert.equal(f.state.amount, 15);
  assert.equal(f.state.position.x, -1);
  assert.equal(f.state.untouched, 123);
  assert.equal(f.state.position.y, 8);
  assert.equal(f.state.position.z, 7);
  assert.ok(f.changes.every(key => key === '__anim.progress01'));
});

test('toggle pauses and resumes the same progress and endpoints', () => {
  const f = fixture();
  f.command('toggle');
  f.advance(250);
  const paused = f.command('toggle');
  assert.equal(paused.playing, false);
  assert.equal(paused.paused, true);
  assert.equal(paused.progress01, 0.25);
  assert.equal(f.pendingFrames, 0);
  f.advance(500);
  assert.equal(f.state.amount, 15);
  assert.equal(f.command('toggle').playing, true);
  assert.equal(f.state.amount, 15);
  f.advance(250);
  assert.equal(f.state.amount, 20);
});

test('restart applies starts immediately and runs after a pause', () => {
  const f = fixture();
  f.command('play');
  f.advance(700);
  f.command('pause');
  const status = f.command('restart');
  assert.equal(status.playing, true);
  assert.equal(status.paused, false);
  assert.equal(status.progress01, 0);
  assert.equal(f.state.amount, 10);
  f.advance(1000);
  assert.equal(f.state.amount, 30);
  assert.equal(f.pendingFrames, 0);
});

test('a RAF timestamp older than resume time cannot move the playhead backwards', () => {
  const f = fixture();
  const progress = labelled(f.panel(), 'Animation progress');
  input(progress, 0.5);
  f.command('play');
  f.advance(0, -8);
  assert.equal(f.state.__anim.ui.progress01, 0.5);
  assert.equal(f.state.amount, 20);
  assert.equal(progress.value, '0.5');
  f.advance(100);
  assert.equal(f.state.__anim.ui.progress01, 0.6);
  assert.equal(f.state.amount, 22);
});

test('stop holds the current value despite a saved snap-to-end flag', () => {
  const f = fixture({ snapToEndOnStop: true });
  f.command('play');
  f.advance(200);
  assert.equal(f.command('stop').paused, false);
  assert.equal(f.state.amount, 14);
  f.advance(1000);
  assert.equal(f.state.amount, 14);
  assert.equal(f.pendingFrames, 0);
});

test('an omitted Start captures the current value and survives pause/resume', () => {
  const f = fixture({ paramTargets: [{ key: 'amount', to: 92 }] });
  f.ensure();
  assert.equal(f.state.__anim.ui.paramTargets[0].from, undefined);
  f.command('play');
  assert.equal(f.state.amount, 72);
  f.advance(500);
  assert.equal(f.state.amount, 82);
  f.command('pause');
  f.advance(1000);
  f.command('play');
  f.advance(500);
  assert.equal(f.state.amount, 92);
});

test('FPS throttles intermediate frames without changing the end time', () => {
  const f = fixture({ fps: 10 });
  f.command('play');
  f.advance(50);
  assert.equal(f.state.amount, 11);
  f.advance(50);
  assert.equal(f.state.amount, 11);
  f.advance(50);
  assert.equal(f.state.amount, 13);
  f.advance(850);
  assert.equal(f.state.amount, 30);
  assert.equal(f.pendingFrames, 0);
});

test('loop/yoyo reverses, then restart restores the configured forward direction', () => {
  const f = fixture({ loop: true, yoyo: true });
  f.command('play');
  f.advance(1000);
  assert.equal(f.state.amount, 30);
  f.advance(500);
  assert.equal(f.state.amount, 20);
  f.command('restart');
  assert.equal(f.state.amount, 10);
  f.advance(250);
  assert.equal(f.state.amount, 15);
});

test('Flow lists vector components and clearing Start uses current state on playback', () => {
  const f = fixture();
  const panel = f.panel();
  assert.equal(button(panel, 'Edit'), undefined);
  const options = descendants(panel).filter(node => node.tagName === 'OPTION').map(node => node.value);
  assert.deepEqual(options, ['amount', 'position.x', 'position.y', 'position.z']);
  input(labelled(panel, 'amount start'), '');
  f.command('play');
  assert.equal(f.state.amount, 72);
  f.advance(500);
  assert.equal(f.state.amount, 51);
});

test('repeated scrubbing with an omitted Start keeps the captured baseline', () => {
  const f = fixture({ paramTargets: [{ key: 'amount', to: 92 }] });
  const progress = labelled(f.panel(), 'Animation progress');
  input(progress, 0.25);
  assert.equal(f.state.amount, 77);
  input(progress, 0.5);
  assert.equal(f.state.amount, 82);
  f.command('play');
  f.advance(500);
  assert.equal(f.state.amount, 92);
});

test('stop invalidates captured endpoints before imported state is scrubbed', () => {
  const f = fixture({ paramTargets: [{ key: 'amount', to: 92 }] });
  const oldPanel = f.panel();
  input(labelled(oldPanel, 'Animation progress'), 0.5);
  assert.equal(f.state.amount, 82);
  f.command('stop');
  oldPanel._destroy();
  f.state.amount = 200;
  f.state.__anim = { ui: {
    paramTargets: [{ key: 'amount', to: 300 }], durationSec: 1, fps: 20,
  } };
  const progress = labelled(f.panel(), 'Animation progress');
  input(progress, 0.5);
  assert.equal(f.state.amount, 250);
  input(progress, 0.75);
  assert.equal(f.state.amount, 275);
  f.command('play');
  f.advance(250);
  assert.equal(f.state.amount, 300);
});

test('hidden cached transport stays synchronized with external P/R commands', () => {
  const f = fixture();
  const panel = f.panel();
  const play = button(panel, 'Play');
  const pause = button(panel, 'Pause');
  const stop = button(panel, 'Stop');
  const progress = labelled(panel, 'Animation progress');
  panel.hidden = true;
  f.command('toggle');
  assert.equal(play.disabled, true);
  assert.equal(pause.disabled, false);
  assert.equal(stop.disabled, false);
  f.advance(400);
  assert.equal(progress.value, '0.4');
  f.command('toggle');
  assert.equal(play.textContent, 'Resume');
  assert.equal(play.disabled, false);
  assert.equal(pause.disabled, true);
  f.command('restart');
  assert.equal(progress.value, '0');
  assert.equal(play.textContent, 'Play');
  assert.equal(play.disabled, true);
  panel.hidden = false;
  panel._onShow();
  assert.equal(pause.disabled, false);
  f.advance(1000);
  assert.equal(progress.value, '1');
  assert.equal(play.disabled, false);
  assert.equal(stop.disabled, true);
});

test('opening Animate after shortcut playback attaches to the active runtime', () => {
  const f = fixture();
  f.command('play');
  f.advance(300);
  const panel = f.panel();
  assert.equal(labelled(panel, 'Animation progress').value, '0.3');
  assert.equal(button(panel, 'Play').disabled, true);
  f.command('pause');
  assert.equal(button(panel, 'Resume').disabled, false);
  const progress = labelled(panel, 'Animation progress');
  panel._destroy();
  f.command('restart');
  assert.equal(progress.value, '0.3'); // Detached controls release their subscription.
  const replacement = f.panel();
  assert.equal(labelled(replacement, 'Animation progress').value, '0');
  assert.equal(button(replacement, 'Play').disabled, true);
});

test('loop-boundary and empty-flow restart progress notify cached controls', () => {
  const looping = fixture({ loop: true });
  const loopProgress = labelled(looping.panel(), 'Animation progress');
  looping.command('play');
  looping.advance(1000);
  assert.equal(loopProgress.value, String(looping.state.__anim.ui.progress01));
  assert.equal(loopProgress.value, '0');
  const empty = fixture({ paramTargets: [], progress01: 0.7 });
  const progress = labelled(empty.panel(), 'Animation progress');
  const status = empty.command('restart');
  assert.equal(status.playing, false);
  assert.equal(progress.value, '0');
  assert.equal(empty.state.amount, 72);
});

test('unsafe paths and malformed saved targets cannot mutate prototypes', () => {
  const f = fixture({ paramTargets: [null, 3, { key: 'constructor.prototype.polluted', from: 1, to: 2 }] });
  const status = f.command('restart');
  assert.equal(status.playing, false);
  assert.equal(({}).polluted, undefined);
  assert.equal(f.pendingFrames, 0);
});
