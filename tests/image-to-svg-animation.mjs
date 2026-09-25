/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
// Exercise the actual animation runtime and visual lifecycle with a deterministic
// clock and delayed conversion worker, including work slower than animation FPS.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { conversionParams } from '../imageToSVG/conversionControls.js';
import { FILTERS, preprocessImage } from '../imageToSVG/preprocess.js';
import { METHODS, convertToSVG } from '../imageToSVG/converters.js';

const stripImports = source => source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const visualSource = stripImports(await readFile(new URL('../imageToSVG/imageToSVG_visual.js', import.meta.url), 'utf8'))
  .replaceAll('import.meta.url', JSON.stringify(import.meta.url));
const animationSource = stripImports(await readFile(new URL('../helper/animationHelp.js', import.meta.url), 'utf8'));
const getByPath = (state, key) => key.split('.').reduce((value, part) => value?.[part], state);
function setByPath(state, key, value) {
  const parts = key.split('.'), last = parts.pop();
  for (const part of parts) state = state[part] ??= {};
  state[last] = value;
}
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attributes = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  get childNodes() { return this.children; }
  get firstElementChild() { return this.children[0]; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  setAttributeNS(ns, key, value) { this.setAttribute(key, value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener() {}
  removeEventListener() {}
}

function fixture({ workerDelay = 120, autoConvert = true } = {}) {
  let now = 0, nextId = 0, spec;
  const tasks = new Map(), workers = [], save = { disabled: false };
  const later = (callback, delay) => { const id = ++nextId; tasks.set(id, { at: now + delay, callback }); return id; };
  const cancel = id => tasks.delete(id);
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...tasks.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, task] = next; tasks.delete(id); now = task.at; task.callback(now);
    }
    now = end;
  }
  class Worker {
    constructor() { workers.push(this); this.terminated = false; }
    postMessage(message) {
      this.message = structuredClone(message);
      this.task = later(() => {
        const prepared = preprocessImage(this.message.source, this.message.options);
        const result = convertToSVG(prepared, this.message.options);
        this.onmessage({ data: { type: 'result', prepared, result, elapsed: workerDelay } });
      }, workerDelay);
    }
    terminate() { this.terminated = true; cancel(this.task); }
  }
  const timing = {
    performance: { now: () => now }, setTimeout: later, clearTimeout: cancel,
    requestAnimationFrame: callback => later(callback, 16), cancelAnimationFrame: cancel,
  };
  const api = vm.runInNewContext(visualSource + '\n({ sessionFor })', {
    ...timing, URL, Blob, Uint8ClampedArray, Worker, FILTERS, METHODS, conversionParams,
    registerTab() {}, registerVisual(id, value) { spec = value; },
    document: {
      createElement: tag => new Element(tag), createElementNS: (ns, tag) => new Element(tag),
      querySelector: () => save, importNode: child => child,
    },
    DOMParser: class {
      parseFromString(markup) {
        const root = new Element('svg'); root.append(Object.assign(new Element('g'), { markup }));
        return { querySelector: () => null, documentElement: root };
      }
    },
  });
  const state = { ...spec.defaultState };
  for (const param of spec.params) if (param.default !== undefined) setByPath(state, param.key, param.default);
  Object.assign(state, { autoConvert, method: 'pixels', maxDimension: 32, filters: [] });
  const session = api.sessionFor(state);
  const raster = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(255) };
  session.setSource(raster, 'Uploaded fixture.png');
  const mountEl = new Element('div'), instance = spec.create({ mountEl }, state);
  state.__anim = { ui: { paramTargets: [{ key: 'mosaicInset', from: 0, to: .4 }], durationSec: 1, fps: 20 } };
  const animation = vm.runInNewContext(animationSource + '\n({ controlAnimation, getOrMakeRuntime, numericParamKeys })', {
    ...timing, Element, getByPath, setByPath,
  });
  const ctx = { mountEl, state, onChange: () => instance.render() };
  return {
    state, session, instance, mountEl, workers, save, advance, raster,
    command: command => animation.controlAnimation(ctx, command),
    scrub: progress => animation.getOrMakeRuntime(ctx).scrubTo(progress),
    keys: () => animation.numericParamKeys(spec),
  };
}

test('20 FPS playback produces SVG updates before stopping, even with a slower worker', () => {
  const f = fixture(); f.advance(300);
  const initial = f.session.result.svg;
  f.command('play'); f.advance(600);
  assert.notEqual(f.session.result.svg, initial);
  assert.ok(f.workers.length >= 3);
  assert.equal(f.save.disabled, true, 'in-flight geometry cannot be exported as the current frame');
  f.advance(1000);
  assert.equal(f.state.mosaicInset, .4);
  assert.equal(f.session.finishedOptions.mosaicInset, .4);
  assert.equal(f.session.valid, true);
  assert.equal(f.save.disabled, false);
});

test('pause, resume, restart, stop and scrubbing settle on the current animation values', () => {
  const f = fixture(); f.advance(300);
  f.command('play'); f.advance(450); f.command('pause');
  const paused = f.state.mosaicInset; f.advance(600);
  assert.equal(f.session.finishedOptions.mosaicInset, paused);
  f.command('play'); f.advance(200);
  assert.ok(f.state.mosaicInset > paused);
  f.command('restart'); assert.equal(f.state.mosaicInset, 0);
  f.advance(250); f.command('stop');
  const stopped = f.state.mosaicInset; f.advance(600);
  assert.equal(f.session.finishedOptions.mosaicInset, stopped);
  f.scrub(.75); f.advance(400);
  assert.ok(Math.abs(f.session.finishedOptions.mosaicInset - .3) < 1e-9);
  assert.equal(f.session.valid, true);
});

test('loop and yoyo keep converting without building a worker backlog', () => {
  const f = fixture(); f.advance(300);
  Object.assign(f.state.__anim.ui, { loop: true, yoyo: true });
  f.command('play'); f.advance(1400);
  assert.ok(f.state.mosaicInset > 0 && f.state.mosaicInset < .4);
  assert.ok(f.workers.length > 5);
  assert.equal(f.workers.filter(worker => !worker.terminated).length, 1);
  f.command('pause'); f.advance(500);
  assert.equal(f.session.finishedOptions.mosaicInset, f.state.mosaicInset);
});

test('pending conversion snapshots filters and retains only the latest frame', () => {
  const f = fixture(); f.advance(300);
  f.state.filters = [{ type: 'brightness', value: 10, enabled: true }]; f.instance.render();
  f.state.filters[0].value = 90;
  f.advance(180);
  assert.equal(f.workers.at(-1).message.options.filters[0].value, 10);
  f.instance.render(); f.state.filters[0].value = 70; f.instance.render();
  f.advance(300);
  assert.equal(f.session.finishedOptions.filters[0].value, 70);
});

test('multiple crop and filter targets reach the converter together', () => {
  const f = fixture(); f.advance(300);
  f.state.filters = [{ type: 'brightness', value: 0, enabled: true }];
  f.state.__anim.ui.paramTargets = [
    { key: 'crop.width', from: 1, to: .5 },
    { key: 'filters.0.value', from: 0, to: -50 },
  ];
  f.command('play'); f.advance(1500);
  assert.equal(f.session.finishedOptions.crop.width, .5);
  assert.equal(f.session.finishedOptions.filters[0].value, -50);
  assert.equal(f.session.result.width, 4);
  assert.equal(f.session.valid, true);
  const count = f.workers.length;
  f.state.previewMode = 'filtered'; f.instance.render(); f.advance(500);
  assert.equal(f.workers.length, count, 'preview-only changes do not restart conversion');
});

test('new images cancel older frames and conversion cancel/destroy release all work', () => {
  const f = fixture(); f.advance(180);
  const old = f.workers[0];
  f.session.setSource({ ...f.raster, width: 4, height: 16 }, 'Replacement.png');
  assert.equal(old.terminated, true);
  old.onmessage({ data: { type: 'error', message: 'stale worker' } });
  assert.notEqual(f.session.statusText, 'stale worker');
  f.advance(300); assert.equal(f.session.result.width, 4);
  f.command('play'); f.advance(200); f.command('pause'); f.session.cancel();
  const result = f.session.result; f.advance(1000);
  assert.equal(f.session.result, result); assert.equal(f.session.busy, false);
  f.session.force = true; f.instance.render(); f.advance(180);
  f.instance.destroy(); f.advance(1000);
  assert.ok(f.workers.every(worker => worker.terminated));
});

test('manual conversion stays manual and numeric preparation/method controls are animation targets', () => {
  const f = fixture({ autoConvert: false });
  f.command('play'); f.advance(1400); assert.equal(f.workers.length, 0);
  f.session.force = true; f.instance.render(); f.advance(300);
  assert.equal(f.session.finishedOptions.mosaicInset, .4);
  assert.equal(f.session.valid, true);
  for (const key of ['mosaicInset', 'complexity', 'colors', 'crop.x', 'hatchAngle', 'maxDimension']) assert.ok(f.keys().includes(key), key);
});

test('new continuous-line and Voronoi controls animate through the conversion worker', () => {
  for (const [method, key, from, to] of [
    ['wave-squiggles', 'lineAmplitude', 0, 2],
    ['serpentine-squiggles', 'serpentineRows', 1, 8],
    ['spiral-squiggles', 'spiralTurns', 4, 12],
    ['flow-squiggles', 'flowLength', 1, 5],
    ['hilbert-squiggles', 'hilbertOrder', 2, 4],
    ['voronoi', 'voronoiSites', 10, 1000],
  ]) {
    const f = fixture();
    Object.assign(f.state, { method, lineCount: 3, lineSamples: 64 });
    f.state.__anim.ui.paramTargets = [{ key, from, to }];
    f.command('play'); f.advance(1500);
    assert.equal(f.session.finishedOptions[key], to, key);
    assert.equal(f.session.result.method, method);
    assert.equal(f.session.valid, true);
    assert.ok(f.keys().includes(key), key);
  }
});
