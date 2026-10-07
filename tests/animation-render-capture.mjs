/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const read = async path => (await readFile(new URL(path, import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const animationSource = await read('../helper/animationHelp.js');
const bridgeSource = await read('../helper/odysseyClientBridge.js');
const captureSource = await read('../helper/animationRenderCapture.js');

class SVGElement {
  constructor(name, attributes = {}) {
    this.localName = name; this.attrs = { ...attributes }; this.children = [];
    this.style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } };
  }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  append(child) { this.children.push(child); }
  prepend(child) { this.children.unshift(child); }
  querySelectorAll(selector) {
    const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    return selector === '*' ? all : all.filter(child => selector.split(',').includes(child.localName));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return { width: 100, height: 80 }; }
  cloneNode() {
    const clone = new SVGElement(this.localName, this.attrs);
    Object.assign(clone.style, this.style); clone.textContent = this.textContent;
    clone.children = this.children.map(child => child.cloneNode()); return clone;
  }
}

function bridgeFixture(ui, { workerDelay = 0, svgSource, visualId = 'fixture' } = {}) {
  const requested = { amount: 12, untouched: 34, __anim: { ui: { targetType: 'params',
    paramTargets: [{ key: 'amount', to: 28 }], ...ui } } };
  const state = structuredClone(requested), svg = new SVGElement('svg'), circle = new SVGElement('circle', { r: 12 });
  svg.append(circle);
  let busy = false, listener, destroyed = false, renders = 0;
  const mountEl = { querySelector: selector => selector === 'svg' ? svg : null,
    querySelectorAll: selector => selector === 'svg' ? [svg] : svg.querySelectorAll(selector),
    getAttribute: key => key === 'aria-busy' && busy ? 'true' : null };
  const messages = [];
  const parent = { postMessage(message) { messages.push(message); } };
  const context = {
    parent, Element: SVGElement, SVGElement, setTimeout, clearTimeout, setInterval, clearInterval,
    performance: { now: () => 0 },
    document: { createElementNS: (_, tag) => new SVGElement(tag), createElement: tag => new SVGElement(tag),
      importNode: node => node.cloneNode(), body: new SVGElement('body') },
    DOMParser: class { parseFromString(text) {
      const svg = new SVGElement('svg'), circle = new SVGElement('circle');
      for (const [, key, value] of text.matchAll(/([\w-]+)="([^"]*)"/g)) circle.setAttribute(key, value);
      circle.style.opacity = '0.9'; svg.append(circle);
      return { documentElement: svg, querySelector: () => null };
    } },
    getComputedStyle: node => ({ getPropertyValue: key => node.style[key] || node.getAttribute(key) || '' }),
    XMLSerializer: class { serializeToString(node) {
      const geometry = node.querySelector('circle');
      return JSON.stringify({ radius: geometry.getAttribute('r'), opacity: geometry.style.opacity });
    } },
    getByPath: (value, key) => key.split('.').reduce((value, part) => value?.[part], value),
    setByPath(value, key, item) {
      const parts = key.split('.'), last = parts.pop();
      for (const part of parts) value = value[part] ??= {};
      value[last] = item;
    },
    __ODYSSEY_HOST_ORIGIN__: 'https://example.test',
    __ODYSSEY_REQUEST__: { mode: 'run', animationCapture: true, state: requested, odyssey: 'test', svgSource, width: 100, height: 80 },
    addEventListener(type, callback) { if (type === 'message') listener = callback; },
  };
  context.window = context;
  const api = vm.runInNewContext(animationSource + '\n' + bridgeSource + '\n({attachOdysseyClient})', context);
  const app = { state, spec: { title: 'Capture fixture', params: [] },
    instance: { destroy() { destroyed = true; } },
    refresh() {
      renders++;
      const radius = state.amount;
      if (!workerDelay) circle.setAttribute('r', radius);
      else { busy = true; setTimeout(() => { circle.setAttribute('r', radius); busy = false; }, workerDelay); }
    },
    applyTools() { circle.style.opacity = '0.9'; },
  };
  api.attachOdysseyClient(app, visualId, mountEl);
  let id = 0;
  return { state, requested, get destroyed() { return destroyed; }, get renders() { return renders; }, async command(command, value) {
    const current = ++id;
    await listener({ source: parent, origin: 'https://example.test', data: { odyssey: 'test', id: current, command, value } });
    const reply = messages.find(message => message.id === current);
    if (reply.error) throw new Error(reply.error);
    return reply.result;
  } };
}

test('isolated capture seeks exact eased values, waits workers and preserves omitted starts', async () => {
  const fixture = bridgeFixture({ easing: 'easeInQuad' }, { workerDelay: 12 });
  await fixture.command('animation-prepare');
  const halfway = await fixture.command('animation-frame', { progress: 0.5, deltaMs: 42 });
  assert.equal(JSON.parse(halfway.svg).radius, '16');
  assert.equal(halfway.state.amount, 16);
  assert.equal(halfway.state.untouched, 34);
  const end = await fixture.command('animation-frame', { progress: 1, deltaMs: 42 });
  const rewind = await fixture.command('animation-frame', { progress: 0.5, deltaMs: 42 });
  assert.equal(JSON.parse(end.svg).radius, '28');
  assert.equal(JSON.parse(rewind.svg).radius, '16');
  assert.equal(fixture.requested.amount, 12, 'requested state is never mutated');
});

test('numeric SVG styles are applied after saved tools are flushed', async () => {
  const fixture = bridgeFixture({ targetType: 'svg', selector: 'circle', svgKind: 'style',
    svgName: 'opacity', from: 0.2, to: 0.6, easing: 'linear' });
  await fixture.command('animation-prepare');
  const frame = await fixture.command('animation-frame', { progress: 0.5 });
  assert.equal(Number(JSON.parse(frame.svg).opacity), 0.4);
  await assert.rejects(fixture.command('animation-frame', { progress: Infinity }), /Invalid animation/);
});

test('live SVG copies preserve uploaded artwork and attribute animation overrides baked styles', async () => {
  const fixture = bridgeFixture({ targetType: 'svg', selector: 'circle', svgKind: 'attr',
    svgName: 'opacity', from: 0.2, to: 0.6 }, { svgSource: '<svg><circle r="31"/></svg>', visualId: 'imageToSVG' });
  await fixture.command('animation-prepare');
  const frame = await fixture.command('animation-frame', { progress: 0.5, deltaMs: 1000 });
  assert.equal(JSON.parse(frame.svg).radius, '31', 'the live source survives instead of becoming the app sample');
  assert.equal(Number(JSON.parse(frame.svg).opacity), 0.4);
  assert.equal(fixture.destroyed, true, 'unused native app workers are stopped');
  assert.equal(fixture.renders, 0, 'SVG-only capture never reruns the visual');
});

test('image conversion parameter capture and external SVG resources fail clearly', async () => {
  const uploaded = bridgeFixture({}, { visualId: 'imageToSVG' });
  await assert.rejects(uploaded.command('prepare'), /cannot reload an uploaded image/);
  const external = bridgeFixture({ targetType: 'svg' }, { svgSource: '<svg><circle href="https://external.test/image.svg"/></svg>' });
  await assert.rejects(external.command('animation-prepare'), /external image/);
});

function adapterFixture() {
  const sources = [];
  class VisualFrame {
    constructor(url, request, signal) {
      Object.assign(this, { url, request, signal, calls: [] }); sources.push(this);
    }
    prepare(ms) { this.calls.push(['prepare', ms]); return Promise.resolve(['startup warning']); }
    deadline(ms, label, operation) { this.calls.push([label, ms]); return operation(); }
    async call(command, value) {
      this.calls.push([command, value]);
      if (this.pending) return this.pending;
      return command === 'animation-prepare' ? { errors: [] } : { svg: '<svg/>' };
    }
    destroy(error) { this.destroyed = error; this.reject?.(error); }
  }
  const { createAnimationCapture } = vm.runInNewContext(captureSource + '\n({createAnimationCapture})',
    { VisualFrame, DOMException, location: { href: 'https://example.test/visual/' } });
  return { sources, createAnimationCapture };
}

test('capture wrapper snapshots settings, requires prepare and passes deadlines and frame timing', async () => {
  const fixture = adapterFixture(), state = { amount: 12, __history: { past: [1] }, __anim: { ui: { autoPlay: true } } };
  const capture = fixture.createAnimationCapture({ state, width: 640, height: 480, computeMs: 200, frameMs: 50 });
  state.amount = 99;
  const source = fixture.sources[0];
  assert.equal(source.request.state.amount, 12);
  assert.equal(source.request.state.__history, undefined);
  assert.equal(source.request.state.__anim.ui.autoPlay, false);
  assert.equal(state.__anim.ui.autoPlay, true);
  await assert.rejects(capture.frame({ progress: 0 }), /Prepare/);
  const ready = await capture.prepare();
  assert.equal(ready.errors[0], 'startup warning');
  await capture.frame({ progress: 0.25, deltaMs: 42 });
  assert.equal(JSON.stringify(source.calls.at(-1)), '["animation-frame",{"progress":0.25,"deltaMs":42}]');
  assert.equal(source.calls.find(call => call[0] === 'Animation frame')[1], 50);
  capture.destroy(); assert.equal(source.destroyed.name, 'AbortError');
  await assert.rejects(capture.frame({ progress: 0 }), { name: 'AbortError' });
});

test('cancelling an active frame rejects it as AbortError', async () => {
  const fixture = adapterFixture(), controller = new AbortController();
  const capture = fixture.createAnimationCapture({ state: {}, signal: controller.signal });
  await capture.prepare();
  const source = fixture.sources[0];
  source.pending = new Promise((resolve, reject) => { source.reject = reject; });
  const pending = capture.frame({ progress: 0.5 });
  controller.abort(); capture.destroy();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.throws(() => fixture.createAnimationCapture({ state: {}, signal: controller.signal }), { name: 'AbortError' });
});

test('SVG source snapshots bypass sample preparation and parameter image conversion is rejected early', async () => {
  const fixture = adapterFixture();
  assert.throws(() => fixture.createAnimationCapture({ state: {}, app: 'imageToSVG' }), /uploaded image/);
  assert.equal(fixture.sources.length, 0);
  const svgSource = '<svg><circle r="31"/></svg>';
  const capture = fixture.createAnimationCapture({ state: { __anim: { ui: { targetType: 'svg' } } }, app: 'imageToSVG', svgSource });
  await capture.prepare();
  assert.equal(fixture.sources[0].request.svgSource, svgSource);
  assert.equal(fixture.sources[0].calls.some(call => call[0] === 'prepare'), false);
  capture.destroy();
});
