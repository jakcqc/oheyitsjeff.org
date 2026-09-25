/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Run: node --experimental-default-type=module --test tests/linked-settings.mjs
// Requires jsdom. Set JSDOM_MODULE to its package directory when not installed locally.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
const dom = new JSDOM('<!doctype html><body><div id="config"></div><div id="vis"></div></body>', {
  url: 'https://visuals.example/Fixture/', pretendToBeVisual: true,
});
const { window } = dom;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'SVGSVGElement', 'SVGElement', 'Element', 'Node', 'Event', 'CustomEvent', 'DOMParser', 'XMLSerializer', 'localStorage', 'getComputedStyle', 'MutationObserver']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true, writable: true });
}
globalThis.CSS = { escape: value => String(value) };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
let frameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = window.cancelAnimationFrame = id => frames.delete(id);
const { preloadLinkedSettings, consumeLinkedSettings } = await import('../helper/linkedSettings.js');
const { registerVisual, runVisualApp, getByPath, setByPath } = await import('../helper/visualHelp.js');
const { controlAnimation } = await import('../helper/animationHelp.js');
const visualId = 'linkedSettingsFixture';
const createdStates = [], renderedValues = [];
registerVisual(visualId, {
  title: 'Linked settings fixture',
  params: [{ key: 'amount', type: 'number', default: 3, min: 0, max: 10, step: 1 }],
  create({ mountEl }, state) {
    createdStates.push(JSON.parse(JSON.stringify(state)));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', '100'); svg.setAttribute('height', '100');
    const group = document.createElementNS(svg.namespaceURI, 'g');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    for (const [key, value] of Object.entries({ x1: 10, y1: 10, x2: 90, y2: 90, stroke: 'black' })) line.setAttribute(key, value);
    group.append(line); svg.append(group); mountEl.replaceChildren(svg);
    return { render() { renderedValues.push(state.amount); }, destroy() {} };
  },
});

let fetchCalls = [];
function reset(query = '', response = '{}', status = 200) {
  consumeLinkedSettings(visualId);
  dom.reconfigure({ url: 'https://visuals.example/Fixture/' + query });
  document.body.innerHTML = '<div id="config"></div><div id="vis"></div>';
  localStorage.clear(); frames.clear(); createdStates.length = 0; renderedValues.length = 0; fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    if (response instanceof Error) throw response;
    return { ok: status >= 200 && status < 300, status, async text() { return response; } };
  };
}
function start(providedState, id = visualId) {
  return runVisualApp({ visualId: id, mountEl: document.getElementById('vis'), uiEl: document.getElementById('config'), state: providedState });
}
function settingsQuery(source = '../saved/study.json', target = visualId) {
  return '?' + new URLSearchParams({ settings: source, settingsVisual: target });
}
function assertVisibleFailure() {
  const alert = document.querySelector('#vis [role="alert"]');
  assert.ok(alert, 'failure is shown in the visual mount');
  assert.match(alert.textContent, /Could not load the saved study settings/);
  assert.equal(document.querySelector('#vis button')?.textContent, 'Retry loading settings');
  assert.equal(document.querySelector('#vis [role="status"]'), null);
  assert.equal(document.getElementById('vis').hasAttribute('aria-busy'), false);
  assert.equal(consumeLinkedSettings(visualId), null);
}

test('ordinary app startup needs no settings request and keeps its normal preset', async () => {
  reset();
  assert.equal(await preloadLinkedSettings(visualId), true);
  assert.equal(fetchCalls.length, 0);
  const app = start({ amount: 7 });
  assert.equal(app.state.amount, 7);
  assert.deepEqual(renderedValues, [7]);
});

test('linked state is loaded before the first native render, isolating it from cache and startup presets', async () => {
  const transform = { kind: 'rotate', deg: 37, targets: [0] };
  const saved = {
    amount: '1600', shouldRender: true, overrideMinMax: true,
    __paramRanges: { amount: { min: -50, max: 1800 } },
    __xf: { ui: { rotateDeg: 37 }, stack: [transform] },
    __toolFlows: { ui: { autoRun: true }, stages: [{ id: 'saved-flow', name: 'Saved rotation', kind: 'transform', enabled: true, config: { stack: [transform] } }] },
  };
  reset(settingsQuery(), '\uFEFF' + JSON.stringify(saved));
  localStorage.setItem('visualHelp.persist.v1:' + visualId, '1');
  localStorage.setItem('visualHelp.settings.v1:' + visualId, JSON.stringify({ amount: 9, staleCache: true, __anim: { ui: { autoPlay: true, durationSec: 91 } }, __toolFlows: { ui: { cachedOnly: true }, stages: [{ id: 'cached' }] } }));
  localStorage.setItem('visualHelp.ui.v1:' + visualId, JSON.stringify({ cachedUiOnly: true }));
  assert.equal(await preloadLinkedSettings(visualId), true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://visuals.example/saved/study.json');
  assert.equal(fetchCalls[0].options.credentials, 'same-origin');
  assert.equal(fetchCalls[0].options.redirect, 'error');
  assert.equal(document.getElementById('vis').hasAttribute('aria-busy'), false);
  const app = start({ amount: 1, stalePreset: true, __anim: { ui: { autoPlay: true, durationSec: 71 } }, __toolFlows: { ui: { presetOnly: true }, stages: [{ id: 'preset' }] } });
  assert.equal(createdStates.length, 1);
  assert.equal(createdStates[0].amount, 1600, 'numeric imports coerce without clamping to the slider maximum');
  assert.deepEqual(renderedValues, [1600], 'there is no default frame before the imported frame');
  assert.equal(app.state.staleCache, undefined);
  assert.equal(app.state.stalePreset, undefined);
  assert.equal(app.state.__ui?.cachedUiOnly, undefined);
  assert.notEqual(app.state.__anim?.ui?.autoPlay, true);
  assert.notEqual(app.state.__anim?.ui?.durationSec, 91);
  assert.notEqual(app.state.__anim?.ui?.durationSec, 71);
  assert.equal(app.state.__toolFlows.ui.cachedOnly, undefined);
  assert.equal(app.state.__toolFlows.ui.presetOnly, undefined);
  assert.equal(app.state.__toolFlows.ui.autoRun, true);
  assert.deepEqual(app.state.__toolFlows.stages.map(stage => stage.id), ['saved-flow']);
  assert.deepEqual(app.state.__xf.stack, [transform]);
  assert.equal(app.state.__paramRanges.amount.max, 1800);
  assert.equal(consumeLinkedSettings(visualId), null, 'the native runtime consumed the linked state');
  localStorage.clear();
  app.instance?.destroy?.();
  const preset = start({ amount: 6 });
  assert.equal(preset.state.amount, 6, 'later manual presets are not overridden by the launch file');
  assert.equal(renderedValues.at(-1), 6);
});

// Mirror native simulations and visuals that install animation defaults during
// factory creation. The rendered state, not just the imported JSON, must pause.
function registerPlaybackFixture(id, { param = 'running', runningValue = true, seedInFactory = false } = {}) {
  const observed = { created: [], rendered: [], ticks: 0 };
  const animation = {
    ui: { autoPlay: true, progress01: 0.63, durationSec: 19, loop: true, snapToEndOnStop: true,
      paramTargets: [{ key: 'amount', from: 3, to: 200 }] },
  };
  registerVisual(id, {
    title: id,
    simulation: { param, runningValue },
    params: [
      { key: 'amount', type: 'number', default: 3, min: 0, max: 10 },
      { key: param, type: 'boolean', default: runningValue },
      { key: 'trails', type: 'boolean', default: true },
      { key: 'effects.enabled', type: 'boolean', default: true },
    ],
    defaultState: { __anim: structuredClone(animation) },
    create({ mountEl }, state) {
      observed.created.push(JSON.parse(JSON.stringify(state)));
      if (seedInFactory) {
        state.__anim.ui.autoPlay = true;
        setByPath(state, param, runningValue);
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.innerHTML = '<g><path d="M0 0L100 100" stroke="black"/></g>';
      mountEl.replaceChildren(svg);
      let raf = 0;
      const tick = () => {
        raf = 0;
        if (getByPath(state, param) !== runningValue) return;
        observed.ticks++;
        raf = requestAnimationFrame(tick);
      };
      return {
        render() {
          observed.rendered.push(JSON.parse(JSON.stringify(state)));
          if (getByPath(state, param) === runningValue && !raf) raf = requestAnimationFrame(tick);
          else if (getByPath(state, param) !== runningValue && raf) { cancelAnimationFrame(raf); raf = 0; }
        },
        destroy() { if (raf) cancelAnimationFrame(raf); },
      };
    },
  });
  return { observed, animation, param, runningValue };
}

for (const fixture of [
  { name: 'saved autoplay and native run flag', savedAnimation: true },
  { name: 'inherited autoplay defaults', savedAnimation: false },
  { name: 'factory-seeded playback defaults', savedAnimation: true, seedInFactory: true },
  { name: 'nested inverted simulation flag', savedAnimation: true, param: 'motion.paused', runningValue: false },
]) {
  test('linked study pauses ' + fixture.name + ' without losing the saved picture or manual playback', async () => {
    const id = 'playback-' + fixture.name.replaceAll(' ', '-');
    const { observed, animation, param, runningValue } = registerPlaybackFixture(id, fixture);
    const saved = { amount: 72, trails: true, effects: { enabled: true }, shouldRender: true };
    setByPath(saved, param, runningValue);
    if (fixture.savedAnimation) saved.__anim = structuredClone(animation);
    reset(settingsQuery('../saved/study.json', id), JSON.stringify(saved));
    assert.equal(await preloadLinkedSettings(id), true);
    const app = start(undefined, id);
    assert.equal(getByPath(observed.created[0], param), !runningValue, 'native creation sees the paused flag');
    assert.equal(observed.created[0].__anim.ui.autoPlay, false);
    assert.equal(observed.rendered.length, 1, 'the saved picture still renders once');
    assert.equal(observed.rendered[0].amount, 72, 'autoplay never applies the animation start/end value');
    assert.equal(getByPath(observed.rendered[0], param), !runningValue);
    assert.equal(observed.ticks, 0);
    assert.ok(document.querySelector('#vis svg path'), 'pausing does not disable rendering');
    assert.equal(app.state.shouldRender, true);
    assert.equal(app.state.trails, true);
    assert.equal(app.state.effects.enabled, true);
    assert.deepEqual(app.state.__anim.ui.paramTargets, animation.ui.paramTargets);
    assert.equal(app.state.__anim.ui.progress01, 0.63, 'launch does not reset the saved timeline');
    assert.equal(app.state.__anim.ui.durationSec, 19);
    assert.equal(app.state.__anim.ui.loop, true);
    assert.equal(app.state.__anim.ui.snapToEndOnStop, true);
    assert.equal(app.state.__anim.ui.autoPlay, false);

    assert.equal(app.toggleSimulation(), true);
    assert.equal(getByPath(app.state, param), runningValue, 'the user can resume the native simulation');
    for (const [frame, callback] of [...frames]) { frames.delete(frame); callback(performance.now() + 100); }
    assert.equal(observed.ticks, 1);
    app.toggleSimulation();
    assert.equal(getByPath(app.state, param), !runningValue);
    assert.equal(controlAnimation({ state: app.state, mountEl: document.getElementById('vis'), onChange: app.refresh }, 'play').playing, true, 'animation tracks can still be played explicitly');
    controlAnimation({ state: app.state }, 'stop');
    app.instance.destroy();
  });
}

test('ordinary launch keeps native simulation and animation autoplay defaults', async () => {
  const id = 'ordinaryPlaybackFixture';
  const { observed } = registerPlaybackFixture(id);
  reset();
  assert.equal(await preloadLinkedSettings(id), true);
  const app = start(undefined, id);
  assert.equal(observed.created[0].running, true);
  assert.equal(observed.created[0].__anim.ui.autoPlay, true);
  assert.equal(app.state.running, true);
  assert.equal(app.state.__anim.ui.autoPlay, true);
  assert.equal(controlAnimation({ state: app.state }, 'pause').paused, true, 'ordinary launch began playing');
  app.setParam('running', false);
  app.instance.destroy();
});

test('preloaded settings remain reserved for the correct visual and are consumed only once', async () => {
  reset(settingsQuery(), '{"amount":22}');
  assert.equal(await preloadLinkedSettings(visualId), true);
  assert.equal(consumeLinkedSettings('different-visual'), null);
  assert.deepEqual(JSON.parse(consumeLinkedSettings(visualId)), { amount: 22 });
  assert.equal(consumeLinkedSettings(visualId), null);
});

for (const [name, query, response, status, expectedRequests] of [
  ['empty settings link', settingsQuery(''), '{}', 200, 0],
  ['mismatched source app', settingsQuery('../saved/study.json', 'different-visual'), '{}', 200, 0],
  ['cross-origin settings', settingsQuery('https://other.example/study.json'), '{}', 200, 0],
  ['missing settings file', settingsQuery(), '{}', 404, 1],
  ['malformed JSON', settingsQuery(), '{bad json', 200, 1],
  ['non-object JSON', settingsQuery(), '[]', 200, 1],
  ['prototype mutation key', settingsQuery(), '{"__proto__":{"polluted":true}}', 200, 1],
  ['network failure', settingsQuery(), new Error('Offline'), 200, 1],
]) {
  test(name + ' fails visibly without starting a default visual', async () => {
    reset(query, response, status);
    const loaded = await preloadLinkedSettings(visualId);
    if (loaded) start(); // Match the source-app bootstrap contract.
    assert.equal(loaded, false);
    assert.equal(fetchCalls.length, expectedRequests);
    assert.equal(createdStates.length, 0);
    assertVisibleFailure();
    assert.equal({}.polluted, undefined);
  });
}

test('loading status is present during fetch and a subsequent valid attempt recovers', async () => {
  reset(settingsQuery());
  let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = preloadLinkedSettings(visualId);
  assert.equal(document.getElementById('vis').getAttribute('aria-busy'), 'true');
  assert.match(document.querySelector('#vis [role="status"]').textContent, /Loading saved study/);
  finish({ ok: false, status: 503 });
  assert.equal(await pending, false);
  assertVisibleFailure();
  reset(settingsQuery(), '{"amount":45}');
  assert.equal(await preloadLinkedSettings(visualId), true);
  assert.equal(start().state.amount, 45);
  assert.equal(document.querySelector('#vis [role="alert"]'), null);
});

after(() => { frames.clear(); dom.window.close(); });
