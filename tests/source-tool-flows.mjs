/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Run: node --experimental-default-type=module --test tests/source-tool-flows.mjs
// Requires jsdom. JSDOM_MODULE may point to its package directory.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)(process.env.JSDOM_MODULE || 'jsdom');
const dom = new JSDOM('<!doctype html><body><div id="config"></div><div id="vis"></div></body>', {
  url: 'https://visuals.example/Fixture/', pretendToBeVisual: true,
});
const { window } = dom;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'SVGSVGElement', 'SVGElement', 'Element', 'Node', 'Event', 'CustomEvent', 'DOMParser', 'XMLSerializer', 'localStorage', 'getComputedStyle', 'MutationObserver']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true, writable: true });
}
globalThis.CSS = { escape: value => String(value), supports: () => true };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const frames = new Map(); let nextFrame = 0;
globalThis.requestAnimationFrame = window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
globalThis.cancelAnimationFrame = window.cancelAnimationFrame = id => frames.delete(id);
const { initTransformRuntime } = await import('../helper/transformHelp.js');
const { runEffectsFromUI } = await import('../helper/effectsHelp.js');
const { scalePathsInSubtree } = await import('../helper/scriptOpsUtils.js');
const { registerVisual, runVisualApp } = await import('../helper/visualHelp.js');
const svgNS = 'http://www.w3.org/2000/svg';
const element = (tag, attrs = {}) => {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const mutations = () => new Promise(resolve => queueMicrotask(resolve));
async function nextAnimationFrame() {
  await mutations();
  const pending = [...frames.values()]; frames.clear();
  for (const callback of pending) callback(100);
  await mutations();
}
function fixture() {
  frames.clear(); document.body.innerHTML = '<div id="config"></div><div id="vis"></div>';
  const mountEl = document.getElementById('vis');
  const svg = element('svg', { viewBox: '0 0 100 100', width: 100, height: 100 });
  const background = element('g'); const source = element('g');
  const rect = element('rect', { width: 10, height: 10, fill: '#111111' });
  source.append(rect); svg.append(background, source); mountEl.append(svg);
  return { mountEl, svg, source, rect };
}

test('native changes to a sibling SVG group run one post-render pass without observing its own mutations', async () => {
  const { mountEl, svg, source, rect } = fixture();
  const state = { __xf: { stack: [{ kind: 'rotate', deg: 4 }] } };
  const runtime = initTransformRuntime({ mountEl, state });
  let passes = 0;
  runtime.setSourceChangeHandler(() => {
    passes++;
    runtime.rebuildNow();
    source.setAttribute('data-pass', passes);
    rect.setAttribute('fill', '#abcdef');
  });
  rect.setAttribute('width', 12); svg.setAttribute('viewBox', '0 0 120 100');
  await nextAnimationFrame();
  assert.equal(passes, 1);
  assert.equal(rect.getAttribute('fill'), '#abcdef');
  assert.equal(frames.size, 0, 'tool mutations must not schedule another pass');
  await nextAnimationFrame(); assert.equal(passes, 1);
  runtime.destroy();
});

test('nested tool transactions cancel queued work and resume observing real source changes', async () => {
  const { mountEl, source } = fixture();
  const runtime = initTransformRuntime({ mountEl, state: {} }); let passes = 0;
  runtime.setSourceChangeHandler(() => { passes++; });
  source.setAttribute('data-native', 'first'); await mutations();
  assert.equal(frames.size, 1);
  runtime.withSourceUpdatesSuspended(() => {
    source.setAttribute('data-tool', 'outer');
    runtime.withSourceUpdatesSuspended(() => source.setAttribute('data-tool', 'inner'));
    runtime.rebuildNow();
  });
  await nextAnimationFrame(); assert.equal(passes, 0); assert.equal(frames.size, 0);
  source.setAttribute('data-native', 'second'); await nextAnimationFrame(); assert.equal(passes, 1);
  runtime.destroy();
});

test('generated clone updates and destroyed runtimes cannot enqueue a source pass', async () => {
  const { mountEl, svg, source } = fixture();
  const runtime = initTransformRuntime({ mountEl, state: { __xf: { stack: [{ kind: 'split', count: 2 }] } } });
  let passes = 0; runtime.setSourceChangeHandler(() => { passes++; });
  runtime.rebuildNow(); await mutations(); assert.equal(frames.size, 0);
  svg.querySelector('[data-xf-layer]').setAttribute('data-tool', '1');
  await nextAnimationFrame(); assert.equal(passes, 0);
  source.setAttribute('data-native', '1'); await mutations(); assert.equal(frames.size, 1);
  runtime.destroy(); assert.equal(frames.size, 0);
  await nextAnimationFrame(); assert.equal(passes, 0);
});

test('manual color effects do not rerun the saved chain through the source observer', async () => {
  const { mountEl, rect } = fixture(); const state = {};
  const runtime = initTransformRuntime({ mountEl, state }); let passes = 0;
  runtime.setSourceChangeHandler(() => { passes++; });
  state.__effects = { ui: { effectType: 'color', color: {
    selector: 'rect', sourceProp: 'fill', targetProp: 'fill', mode: 'byIndex',
    paletteText: '#ff0000,#0000ff', paletteSteps: 2, useComputed: false, skipNone: true,
  } } };
  assert.notEqual(runEffectsFromUI({ mountEl, state, xfRuntime: runtime })?.ok, false);
  assert.notEqual(rect.getAttribute('fill'), '#111111');
  await nextAnimationFrame(); assert.equal(passes, 0); assert.equal(frames.size, 0);
  runtime.destroy();
});

test('path echo scaling reads every bounding box before replacing connected source paths', () => {
  const { mountEl, svg, source } = fixture();
  source.replaceChildren();
  const paths = [element('path', { d: 'M0 0L10 0L10 10Z' }), element('path', { d: 'M20 20L30 20L30 30Z' })];
  source.append(...paths);
  paths.forEach((path, index) => {
    path.getBBox = () => {
      assert.ok(paths.every(item => item.isConnected), 'no source path may be replaced between bounds reads');
      return { x: index * 20, y: index * 20, width: 10, height: 10 };
    };
  });
  const result = scalePathsInSubtree({ root: svg, create: element }, { range: [1, 2, 2], opacity: false });
  assert.equal(result.replaced, 2);
  assert.equal(result.clonesMade, 4);
  const clones = [...mountEl.querySelectorAll('[data-scale-clone]')];
  assert.equal(clones[0].getAttribute('transform'), 'translate(5 5) scale(1) translate(-5 -5)');
  assert.equal(clones[3].getAttribute('transform'), 'translate(25 25) scale(2) translate(-25 -25)');
});

test('converted-shape scaling batches center reads before any connected transform writes', () => {
  const { mountEl, source } = fixture();
  source.replaceChildren(element('circle', { cx: 10, cy: 10, r: 4 }), element('circle', { cx: 30, cy: 30, r: 6 }));
  const prototype = window.SVGElement.prototype;
  const originalBBox = prototype.getBBox;
  const originalSet = prototype.setAttribute;
  const trace = [];
  prototype.getBBox = function() {
    trace.push('read');
    return { x: +this.getAttribute('x'), y: +this.getAttribute('y'), width: +this.getAttribute('width'), height: +this.getAttribute('height') };
  };
  prototype.setAttribute = function(name, value) {
    if (name === 'transform' && this.isConnected && this.hasAttribute('data-convert-run')) trace.push('write');
    return originalSet.call(this, name, value);
  };
  try {
    const state = { __effects: { ui: { effectType: 'convert', convertFrom: 'circle', convertTo: 'rect',
      selector: 'circle', convertScaleMode: 'center', convertScaleFactor: 1.5 } } };
    assert.notEqual(runEffectsFromUI({ mountEl, state })?.ok, false);
    assert.deepEqual(trace, ['read', 'read', 'write', 'write']);
    assert.match(source.querySelector('rect').getAttribute('transform'), /translate\(10 10\) scale\(1.5\)/);
  } finally {
    if (originalBBox) prototype.getBBox = originalBBox;
    else delete prototype.getBBox;
    prototype.setAttribute = originalSet;
  }
});

let nativeDraw, nativeDraws = 0;
registerVisual('sourceFlowFixture', {
  title: 'Native source flow fixture',
  params: [{ key: 'amount', type: 'number', default: 2 }],
  create({ mountEl }, state) {
    const svg = element('svg', { viewBox: '0 0 100 100', width: 100, height: 100 });
    const background = element('g'); const source = element('g'); svg.append(background, source); mountEl.append(svg);
    nativeDraw = () => {
      nativeDraws++;
      source.replaceChildren(element('rect', { fill: '#ffffff', width: 8, height: 8 }),
        element('rect', { fill: '#111111', width: state.amount, height: 8 }));
    };
    nativeDraw(); return { render: nativeDraw, destroy() {} };
  },
});
test('saved property rules and flow paint apply after native redraw, resize and explicit refresh', async () => {
  fixture(); document.getElementById('vis').replaceChildren(); nativeDraws = 0;
  const state = {
    __propOps: { stack: [{ kind: 'propRule', selector: { rect: { fill: { eq: '#ffffff' } } }, apply: { $delete: true } }] },
    __toolFlows: { ui: { autoRun: true }, stages: [{ id: 'paint', kind: 'effect', enabled: true, config: {
      effectType: 'paint', selector: 'rect', paintFill: '#ff00ff', paintStroke: '',
    } }] },
  };
  const app = runVisualApp({ visualId: 'sourceFlowFixture', mountEl: document.getElementById('vis'), uiEl: document.getElementById('config'), state });
  const verify = () => {
    const rects = [...document.querySelectorAll('#vis rect')];
    assert.equal(rects.length, 1, 'property deletion precedes chain paint');
    assert.equal(rects[0].getAttribute('fill'), '#ff00ff');
  };
  verify(); await nextAnimationFrame(); verify(); assert.equal(frames.size, 0);
  const initialDraws = nativeDraws;
  nativeDraw(); await nextAnimationFrame(); verify();
  assert.equal(nativeDraws, initialDraws + 1, 'post-render processing must not call native render');
  assert.equal(frames.size, 0);
  document.querySelector('#vis svg').setAttribute('viewBox', '0 0 120 100');
  nativeDraw(); await nextAnimationFrame(); verify(); assert.equal(frames.size, 0);
  app.setParam('amount', 7); await nextAnimationFrame(); verify();
  app.refresh(); await nextAnimationFrame(); verify(); assert.equal(frames.size, 0);
  app.setParam('shouldRender', false); await nextAnimationFrame(); assert.equal(frames.size, 0);
});
after(() => dom.window.close());
