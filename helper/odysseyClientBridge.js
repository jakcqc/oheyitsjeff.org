/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// This bridge runs only inside Odyssey's isolated capture iframe.
// Normal visual pages keep their native clocks and startup behavior.
import { controlAnimation, seekAnimation } from './animationHelp.js';
const nativeTimeout = typeof window === 'undefined' ? null : window.setTimeout.bind(window);
function readRequest() {
  if (typeof window === 'undefined' || window.parent === window) return null;
  if (window.__ODYSSEY_REQUEST__ && window.__ODYSSEY_HOST_ORIGIN__) return window.__ODYSSEY_REQUEST__;
  try {
    const token = new URLSearchParams(location.search).get('odyssey');
    const request = JSON.parse(window.name);
    return token && request?.odyssey === token && ['index', 'run'].includes(request.mode) ? request : null;
  } catch { return null; }
}
const request = readRequest();
let clock;
export const getOdysseyClientRequest = () => request;
function installClock() {
  const nativeTimeout = window.setTimeout.bind(window);
  const epoch = Date.now();
  let now = 0, nextId = 1;
  const frames = new Map(), timers = new Map();
  window.requestAnimationFrame = fn => { const id = nextId++; frames.set(id, fn); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const schedule = (fn, delay, repeat, args) => {
    const id = nextId++, duration = Math.max(repeat ? 1 : 0, Number(delay) || 0);
    timers.set(id, { fn, at: now + duration, duration, repeat, args });
    return id;
  };
  window.setTimeout = (fn, delay, ...args) => schedule(fn, delay, false, args);
  window.setInterval = (fn, delay, ...args) => schedule(fn, delay, true, args);
  window.clearTimeout = window.clearInterval = id => timers.delete(id);
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  Date.now = () => epoch + now;
  let hash = 2166136261;
  for (const c of String(request.seed || 'odyssey')) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  Math.random = () => { hash += 0x6D2B79F5; let t = Math.imul(hash ^ hash >>> 15, hash | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return {
    get now() { return now; },
    async advance(ms) {
      const target = now + Math.max(0, Math.min(3600000, Number(ms) || 0));
      let ticks = 0;
      do {
        now = Math.min(target, now + 1000 / 60);
        let calls = 0;
        while (true) {
          const due = [...timers].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at);
          if (!due.length) break;
          for (const [id, timer] of due) {
            if (!timers.has(id)) continue;
            if (++calls > 10000) throw new Error('Too many timer callbacks in one simulation step.');
            if (timer.repeat) timer.at += timer.duration; else timers.delete(id);
            if (typeof timer.fn === 'function') timer.fn(...timer.args);
          }
        }
        const pending = [...frames]; frames.clear();
        for (const [, fn] of pending) fn(now);
        await Promise.resolve();
        // Let the host UI, async workers, and resource loads keep progressing.
        if (++ticks % 6 === 0) await new Promise(resolve => nativeTimeout(resolve, 0));
      } while (now < target);
      return now;
    },
  };
}
if (request?.mode === 'run') clock = installClock();
const plain = value => JSON.parse(JSON.stringify(value, (key, item) => key === '__history' ? undefined : item));
export function attachOdysseyClient(app, visualId, mountEl) {
  if (!request) return;
  const hostOrigin = window.__ODYSSEY_HOST_ORIGIN__ || location.origin;
  const send = value => parent.postMessage({ odyssey: request.odyssey, ...value }, hostOrigin);
  const errors = [];
  let captureMount = mountEl, staticSVG = false;
  const animationContext = { mountEl, state: app.state, onChange: () => app.refresh?.() };
  if (request.animationCapture) controlAnimation(animationContext, 'stop');
  window.addEventListener('error', event => errors.push(event.message));
  window.addEventListener('unhandledrejection', event => errors.push(String(event.reason?.message || event.reason)));
  const describe = () => plain({ id: visualId, title: app.spec.title, description: app.spec.description,
    params: app.spec.params, simulation: app.spec.simulation,
    ...(visualId === 'svgGallery' ? { captureWarning: 'SVG Wall displays image previews; it does not expose a generated SVG for capture.' } : {}) });
  const ready = () => ({ svg: !!captureMount.querySelector('svg'), busy: captureMount.getAttribute('aria-busy') === 'true', errors: errors.splice(0) });
  const capture = (afterTools) => {
    if (!staticSVG) { app.state.__exportSvg?.(); app.applyTools?.(); }
    afterTools?.();
    const svg = captureMount.querySelector('svg');
    if (!svg) throw new Error('The visual has not produced an SVG.');
    const copy = svg.cloneNode(true), from = [svg, ...svg.querySelectorAll('*')], to = [copy, ...copy.querySelectorAll('*')];
    const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
      'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'visibility'];
    from.forEach((node, i) => {
      if (!(node instanceof SVGElement) || ['defs', 'metadata'].includes(node.localName)) return;
      const style = getComputedStyle(node);
      for (const key of properties) to[i].style.setProperty(key, style.getPropertyValue(key));
    });
    copy.querySelectorAll('script,foreignObject').forEach(node => node.remove());
    for (const node of [copy, ...copy.querySelectorAll('*')]) for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    }
    copy.querySelectorAll('#ohey-settings').forEach(node => node.remove());
    const state = plain(app.state), metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
    metadata.id = 'ohey-settings'; metadata.setAttribute('data-owner', 'ohey-settings'); metadata.setAttribute('data-format', 'json');
    metadata.textContent = JSON.stringify(state); copy.prepend(metadata);
    const box = svg.getBoundingClientRect();
    if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
    copy.setAttribute('width', String(box.width)); copy.setAttribute('height', String(box.height));
    const empty = !copy.querySelector('path,rect,circle,line,ellipse,polygon,polyline,text,image,use');
    const warnings = errors.splice(0);
    if (empty) warnings.push('Empty SVG: this parameter combination produced no geometry.');
    return { svg: new XMLSerializer().serializeToString(copy), state, empty, errors: warnings, timeMs: clock?.now || 0 };
  };
  window.addEventListener('message', async event => {
    if (event.source !== parent || event.origin !== hostOrigin || event.data?.odyssey !== request.odyssey) return;
    const { id, command, value } = event.data;
    if (!command) return;
    try {
      let result;
      if (command === 'describe') result = describe();
      else if (command === 'prepare') {
        if (visualId === 'svgGallery') throw new Error('SVG Wall displays image previews; it does not expose a generated SVG for capture.');
        if (request.animationCapture && visualId === 'imageToSVG') {
          throw new Error('Image conversion parameter rendering cannot reload an uploaded image. Animate the current SVG attributes or styles instead.');
        }
        const sample = app.spec.params.find(p => p.key === 'useSample');
        const convert = app.spec.params.find(p => p.key === 'convertImage');
        if (sample && convert) { sample.onClick({ state: app.state }); convert.onClick({ state: app.state }); app.refresh(); }
        if (typeof app.state.__exportSvg === 'function') { app.state.showSvgOverlay = true; app.state.__exportSvg(); }
        result = ready();
      } else if (command === 'animation-prepare') {
        if (!request.animationCapture) throw new Error('This source was not opened for animation rendering.');
        // Factories may seed animation defaults. Restore the requested tracks
        // before resolving omitted starts against this private visual's state.
        const requested = request.state?.__anim?.ui;
        if (requested) app.state.__anim.ui = { ...plain(requested), autoPlay: false };
        controlAnimation(animationContext, 'stop');
        if (request.svgSource) {
          if (app.state.__anim.ui.targetType !== 'svg') throw new Error('A saved SVG can only render SVG attribute or style animation.');
          const parsed = new DOMParser().parseFromString(request.svgSource, 'image/svg+xml');
          const svg = parsed.documentElement;
          if (parsed.querySelector('parsererror') || svg.localName !== 'svg') throw new Error('The current SVG artwork is invalid.');
          svg.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node => node.remove());
          const checkCSS = text => {
            if (/@import\b/i.test(text) || [...String(text).matchAll(/url\(\s*['"]?([^)'"\s]+)/gi)]
              .some(match => !match[1].startsWith('#') && !match[1].startsWith('data:image/'))) {
              throw new Error('The current SVG contains an external image or stylesheet. Embed its resources before rendering.');
            }
          };
          for (const node of [svg, ...svg.querySelectorAll('*')]) for (const attr of [...node.attributes]) {
            if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
            else if (/href$/i.test(attr.name) && !attr.value.startsWith('#') && !attr.value.startsWith('data:image/')) {
              throw new Error('The current SVG contains an external image. Embed it before rendering.');
            } else if (attr.name === 'style') checkCSS(attr.value);
          }
          svg.querySelectorAll('style').forEach(node => checkCSS(node.textContent));
          app.instance?.destroy?.();
          const surface = document.createElement('div');
          surface.style.cssText = 'position:fixed;inset:0;width:' + request.width + 'px;height:' + request.height + 'px;overflow:hidden';
          svg.setAttribute('width', String(request.width)); svg.setAttribute('height', String(request.height));
          svg.style.width = '100%'; svg.style.height = '100%';
          surface.append(document.importNode(svg, true)); document.body.append(surface);
          captureMount = surface; staticSVG = true;
          animationContext.mountEl = surface; animationContext.onChange = () => {};
          if (app.state.__anim.ui.svgKind !== 'style') {
            const property = String(app.state.__anim.ui.svgName || '').replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
            // Computed styles were baked into the supplied copy. Let a numeric
            // presentation attribute override its previously captured value.
            surface.querySelectorAll(app.state.__anim.ui.selector || 'svg').forEach(node => node.style?.removeProperty(property));
          }
          // This copy already contains the requested styling. It has its own
          // surface so old app workers cannot replace its nodes or reset it.
          errors.splice(0);
        } else if (visualId === 'imageToSVG') {
          throw new Error('Image to SVG rendering needs the current SVG artwork. Animate its SVG attributes or styles.');
        }
        result = ready();
      } else if (command === 'animation-frame') {
        if (!request.animationCapture) throw new Error('This source was not opened for animation rendering.');
        const progress = Number(value?.progress), deltaMs = Number(value?.deltaMs ?? 0);
        if (!Number.isFinite(progress) || progress < 0 || progress > 1 || !Number.isFinite(deltaMs) || deltaMs < 0 || deltaMs > 3600000) {
          throw new Error('Invalid animation frame progress or simulation interval.');
        }
        seekAnimation(animationContext, progress);
        if (!staticSVG) await clock?.advance(deltaMs);
        const warnings = [];
        let status = ready();
        warnings.push(...status.errors);
        while (!status.svg || status.busy) {
          // Native worker messages need real event-loop turns. The virtual
          // clock still advances deferred visual renders and queued timers.
          await new Promise(resolve => nativeTimeout(resolve, 8));
          await clock?.advance(1000 / 60);
          status = ready(); warnings.push(...status.errors);
        }
        const applySVG = app.state.__anim.ui.targetType === 'svg'
          ? () => seekAnimation({ ...animationContext, onChange: () => {} }, progress) : undefined;
        // Capture flushes saved tools first, then reapplies the numeric SVG
        // tween so effects cannot overwrite the requested frame value.
        result = capture(applySVG); result.errors.unshift(...warnings);
      } else if (command === 'advance') { await clock?.advance(value); result = ready(); }
      else if (command === 'capture') result = capture();
      else throw new Error('Unknown Odyssey command.');
      send({ id, result });
    } catch (error) { send({ id, error: error.message || String(error) }); }
  });
  send({ ready: true });
}

