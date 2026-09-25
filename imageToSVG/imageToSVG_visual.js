/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
import { registerVisual, registerTab, buildControl } from '../helper/visualHelp.js';
import { FILTERS } from './preprocess.js';
import { METHODS } from './converters.js';
import { conversionParams } from './conversionControls.js';
import { readCachedImage, cacheImage, clearCachedImage } from './imageCache.js';

const NS = 'http://www.w3.org/2000/svg';
const sessions = new WeakMap();
const number = (key, label, value, min, max, step = 1, category = 'Conversion') =>
  ({ key, label, type: 'number', default: value, min, max, step, category });
const select = (key, label, value, options, category = 'Conversion') =>
  ({ key, label, type: 'select', default: value, options: options.map(option => typeof option === 'string' ? option : option.value), displayOptions: options, category });
const action = (key, label, onClick, category = 'Image') => ({ key, label, type: 'button', onClick, category });
const imageParams = [
  action('chooseImage', 'Choose image', ({ state }) => sessionFor(state).open()),
  select('sample', 'Built-in sample', 'landscape', ['landscape', 'logo', 'spectrum'], 'Image'),
  action('useSample', 'Use sample', ({ state }) => sessionFor(state).sample(state.sample)),
  action('imageTools', 'Image previews & filters', () => {
    if (document.querySelector('#config .vr-tabs.hidden')) document.querySelector('#config .vr-tabsToggle')?.click();
    Array.from(document.querySelectorAll('#config .vr-tab')).find(tab => tab.textContent === 'image')?.click();
  }),
];
const params = [
  ...imageParams, ...conversionParams,
  action('convertImage', 'Convert to SVG', ({ state }) => { sessionFor(state).force = true; }, 'Conversion'),
  action('cancelConversion', 'Cancel conversion', ({ state }) => sessionFor(state).cancel?.(), 'Conversion'),
  action('resetCrop', 'Reset crop', ({ state }) => { state.crop = { x: 0, y: 0, width: 1, height: 1 }; }, 'Preparation'),
];

const get = (state, key) => key.split('.').reduce((obj, k) => obj?.[k], state);
function put(state, key, value) {
  const keys = key.split('.');
  let parent = state;
  for (const part of keys.slice(0, -1)) parent = parent[part] ||= {};
  parent[keys.at(-1)] = value;
}
function conversionOptions(state) {
  const out = {};
  for (const param of conversionParams) if (param.key !== 'autoConvert') put(out, param.key, get(state, param.key));
  out.filters = Array.isArray(state.filters) ? state.filters.map(filter => ({ ...filter })) : [];
  return out;
}
function node(tag, props = {}, children = []) {
  const element = document.createElement(tag);
  Object.assign(element, props);
  element.append(...children);
  return element;
}
function status(session, message, error = false) {
  session.statusText = message; session.statusError = error; session.notify();
}

/** Canvas samples are genuine raster inputs; converters only receive RGBA pixels. */
function makeSample(kind = 'landscape') {
  const canvas = node('canvas', { width: 720, height: 540 });
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (kind === 'logo') {
    c.fillStyle = '#e9b76d'; c.beginPath(); c.arc(360, 270, 175, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(360, 270, 90, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'source-over'; c.fillStyle = '#418a9a'; c.fillRect(130, 100, 100, 280);
    c.fillStyle = '#d76b4e'; c.beginPath(); c.moveTo(410, 100); c.lineTo(635, 420); c.lineTo(370, 420); c.closePath(); c.fill();
  } else if (kind === 'spectrum') {
    const gradient = c.createLinearGradient(0, 0, 720, 540);
    ['#e88b6c', '#e9c35e', '#68a490', '#477493', '#745983'].forEach((color, i) => gradient.addColorStop(i / 4, color));
    c.fillStyle = gradient; c.fillRect(0, 0, 720, 540);
    for (let i = 0; i < 8; i++) { c.fillStyle = `rgba(255,255,255,${i / 18})`; c.fillRect(i * 90, 0, 45, 540); }
    c.fillStyle = '#152e3c'; c.beginPath(); c.arc(260, 270, 120, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f1e5c5'; c.beginPath(); c.arc(460, 270, 85, 0, Math.PI * 2); c.fill();
  } else {
    const sky = c.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, '#263f4e'); sky.addColorStop(.65, '#81a8a3'); sky.addColorStop(1, '#d7d3ad');
    c.fillStyle = sky; c.fillRect(0, 0, 720, 540);
    c.fillStyle = '#efc47f'; c.beginPath(); c.arc(507, 157, 66, 0, Math.PI * 2); c.fill();
    const hill = (color, points) => { c.fillStyle = color; c.beginPath(); c.moveTo(0, 540); for (const [x, y] of points) c.lineTo(x, y); c.lineTo(720, 540); c.closePath(); c.fill(); };
    hill('#608782', [[0, 325], [99, 252], [192, 307], [343, 200], [464, 305], [576, 239], [720, 329]]);
    hill('#30535b', [[0, 330], [121, 368], [257, 301], [404, 380], [554, 300], [720, 350]]);
    hill('#173744', [[0, 437], [148, 373], [315, 416], [506, 373], [720, 449]]);
    c.fillStyle = '#b7c9b3'; c.beginPath(); c.moveTo(355, 383); c.bezierCurveTo(220, 432, 610, 455, 383, 540); c.lineTo(474, 540); c.bezierCurveTo(657, 450, 286, 421, 355, 383); c.fill();
    c.fillStyle = '#102831';
    for (const [x, y, size] of [[110, 412, 58], [155, 414, 40], [607, 450, 65]]) {
      c.fillRect(x - 3, y, 6, 40); c.beginPath(); c.moveTo(x, y - size); c.lineTo(x - size * .4, y + 14); c.lineTo(x + size * .4, y + 14); c.closePath(); c.fill();
    }
  }
  return { width: canvas.width, height: canvas.height, data: c.getImageData(0, 0, canvas.width, canvas.height).data };
}

function drawRaster(canvas, raster) {
  canvas.width = raster.width; canvas.height = raster.height;
  canvas.getContext('2d').putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0);
}
function drawPrepared(canvas, session) {
  const { width, height, data, palette, indices } = session.prepared;
  if (session.state.previewMode === 'filtered') drawRaster(canvas, { width, height, data });
  else {
    const pixels = new Uint8ClampedArray(data.length);
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] < 0) continue;
      pixels.set(palette[indices[i]], i * 4); pixels[i * 4 + 3] = data[i * 4 + 3];
    }
    drawRaster(canvas, { width, height, data: pixels });
  }
}
function sourceSummary(session) {
  if (!session.source) return 'Choose an image or use a built-in sample.';
  const { width, height } = session.source;
  const original = session.originalSize;
  return `${session.sourceName} · ${width} × ${height}${original ? ` (original ${original.width} × ${original.height})` : ''}`;
}
function sessionFor(state) {
  if (sessions.has(state)) return sessions.get(state);
  const session = { state, revision: 0, source: null, sourceName: 'Landscape sample', statusText: 'Preparing sample…', listeners: new Set(),
    notify() { for (const listener of this.listeners) listener(); },
    change(key = 'filters') { if (this.onChange) this.onChange(key); else this.render?.(); this.notify(); },
    sample(kind, clearCache = true) {
      const loadId = this.loadId = (this.loadId || 0) + 1;
      this.cacheMessage = '';
      if (clearCache) clearCachedImage().catch(() => {
        if (loadId === this.loadId) {
          this.cacheMessage = 'Could not clear the saved image in this browser.'; this.notify();
        }
      });
      this.setSource(makeSample(kind), `${kind === 'logo' ? 'Transparent mark' : kind === 'spectrum' ? 'Color study' : 'Landscape'} sample`);
    },
    setSource(source, name, original = null) {
      this.source = source; this.sourceName = name; this.originalSize = original; this.revision++;
      this.render?.(); this.notify();
    },
    async restore() {
      const loadId = this.loadId;
      try {
        const file = await readCachedImage();
        if (file && loadId === this.loadId) await this.load(file, false);
      } catch { /* Storage may be disabled; the sample remains usable. */ }
    },
    async load(file, persist = true) {
      if (!file) return;
      const loadId = this.loadId = (this.loadId || 0) + 1;
      if (file.size > 64 * 1024 * 1024) { status(this, 'Choose an image smaller than 64 MB.', true); return; }
      if (file.type && !file.type.startsWith('image/')) { status(this, 'Choose a supported image file (PNG, JPEG, WebP, GIF, AVIF, or BMP).', true); return; }
      const url = URL.createObjectURL(file);
      status(this, 'Opening image…');
      try {
        const img = new Image(); img.src = url; await img.decode();
        if (loadId !== this.loadId) return;
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) throw new Error('This image has no readable dimensions.');
        const scale = Math.min(1, 4096 / Math.max(w, h), Math.sqrt(16000000 / (w * h)));
        const canvas = node('canvas', { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) });
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        this.cacheMessage = '';
        this.setSource({ width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data }, file.name,
          scale < 1 ? { width: w, height: h } : null);
        if (persist) {
          try { await cacheImage(file); }
          catch {
            if (loadId === this.loadId) {
              this.cacheMessage = 'This image is open, but could not be saved for your next visit.'; this.notify();
            }
          }
        }
      } catch (error) {
        if (loadId === this.loadId) status(this, `Could not open this image. ${error.message}`, true);
      } finally { URL.revokeObjectURL(url); }
    },
    open() {
      const input = node('input', { type: 'file', accept: 'image/*' });
      input.onchange = () => this.load(input.files[0]); input.click();
    },
  };
  sessions.set(state, session);
  return session;
}

// Image-specific tools use the same shared rows, sliders, toggles and groups as Params.
function buildPanel({ state, onChange }) {
  const session = sessionFor(state); session.onChange = onChange;
  const panel = node('div', { className: 'image-svg-panel' });
  const control = param => buildControl({ param, state, onChange: key => session.change(key) });
  function section(title) {
    const content = node('div', { className: 'vr-paramGroupBody' });
    panel.append(node('details', { className: 'vr-paramGroup', open: true }, [node('summary', { className: 'vr-paramGroupTitle', textContent: title }), content]));
    return content;
  }
  const source = section('Image previews');
  source.append(control(imageParams[0]));
  const sourceCanvas = node('canvas', { id: 'source-preview', ariaLabel: 'Original image preview' });
  const preparedCanvas = node('canvas', { id: 'prepared-preview', ariaLabel: 'Prepared image preview' });
  const originalInfo = node('p', { id: 'source-summary' });
  const preparedInfo = node('p', { id: 'prepared-summary' });
  const dropArea = node('figure', { id: 'source-drop', className: 'image-svg-preview' }, [node('figcaption', { textContent: 'Original · drop an image here' }), sourceCanvas, originalInfo]);
  source.append(node('div', { className: 'image-svg-previews' }, [dropArea,
    node('figure', { className: 'image-svg-preview' }, [node('figcaption', { textContent: 'Prepared' }), preparedCanvas, preparedInfo])]),
  control(select('previewMode', 'Prepared preview mode', 'palette', ['palette', 'filtered'])));
  const swatches = node('div', { className: 'image-svg-palette', id: 'palette-swatches', ariaLabel: 'Output palette' });
  const statistics = node('p', { id: 'result-stats' });
  const conversionStatus = node('p', { className: 'image-svg-status', id: 'conversion-status', role: 'status' });
  conversionStatus.setAttribute('aria-live', 'polite');
  const cacheNotice = node('p', { className: 'vr-help', role: 'status' });
  source.append(swatches, statistics, node('p', { className: 'vr-help', textContent: 'Crop, downsampling, palette and conversion settings are in Params. Your latest uploaded image is saved in this browser for your next visit. Save exports the current SVG using the shared visual controls.' }));
  source.append(conversionStatus, cacheNotice);
  const filterSection = section('Ordered filters');
  filterSection.append(control(select('filterToAdd', 'Filter to add', 'brightness', FILTERS.map(filter => filter.id))),
    control(action('addFilter', 'Add filter', () => {
      state.filters = Array.isArray(state.filters) ? state.filters : [];
      if (state.filters.length >= 24) { status(session, 'The stack supports up to 24 filters. Remove one before adding another.', true); return; }
      const filter = FILTERS.find(item => item.id === state.filterToAdd) || FILTERS[0];
      state.filters.push({ type: filter.id, value: filter.defaultValue, enabled: true });
    })));
  const filterList = node('div');
  filterSection.append(filterList, control(action('clearFilters', 'Clear filters', () => { state.filters = []; })),
    node('p', { className: 'vr-help', textContent: 'Enabled filters run from top to bottom before palette quantization. Filters can be repeated, reordered, or disabled.' }));
  let previousFilters = null, filterStructure = '', previousSource = null, previousPrepared = null, previousPreviewMode = null;
  function drawFilters() {
    const list = Array.isArray(state.filters) ? state.filters : [];
    const structure = JSON.stringify(list.map(filter => [filter?.type, filter?.enabled]));
    if (previousFilters === list && filterStructure === structure) return;
    previousFilters = list; filterStructure = structure;
    filterList.replaceChildren();
    if (!list.length) filterList.append(node('p', { className: 'vr-help', textContent: 'No filters applied.' }));
    list.forEach((filter, index) => {
      const spec = FILTERS.find(item => item.id === filter?.type); if (!spec) return;
      const row = node('div', { className: 'image-svg-filter' });
      row.append(control({ key: `filters.${index}.enabled`, label: `${index + 1}. ${spec.label} enabled`, type: 'boolean', default: true }),
        control({ ...number(`filters.${index}.value`, spec.amountLabel || `${spec.label} amount`, spec.defaultValue, spec.min, spec.max, spec.step),
          shouldShowWhen: { [`filters.${index}.type`]: spec.id } }));
      const actions = node('div', { className: 'image-svg-filter-actions' });
      for (const [label, offset] of [['Move up', -1], ['Move down', 1], ['Remove', 0]]) {
        const button = node('button', { type: 'button', className: 'btn-inline', textContent: label, disabled: offset === -1 && index === 0 || offset === 1 && index === list.length - 1 });
        button.setAttribute('aria-label', `${label} ${spec.label} filter ${index + 1}`);
        button.onclick = () => {
          if (offset) [list[index], list[index + offset]] = [list[index + offset], list[index]];
          else list.splice(index, 1);
          filterStructure = ''; session.change();
        };
        actions.append(button);
      }
      row.append(actions); filterList.append(row);
    });
  }
  function sync() {
    drawFilters();
    for (const row of panel.querySelectorAll('.vr-row')) {
      row._syncVisibility?.();
      if (!row.contains(document.activeElement)) row._sync?.();
    }
    if (session.source && session.source !== previousSource) { drawRaster(sourceCanvas, session.source); previousSource = session.source; }
    originalInfo.textContent = sourceSummary(session);
    if (session.prepared && (session.prepared !== previousPrepared || state.previewMode !== previousPreviewMode)) {
      drawPrepared(preparedCanvas, session);
      previousPrepared = session.prepared; previousPreviewMode = state.previewMode;
      const { width, height, palette } = session.prepared;
      preparedInfo.textContent = `${width} × ${height} · ${palette.length} palette colors`;
      swatches.replaceChildren(...palette.map(rgb => {
        const hex = '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
        const chip = node('span', { className: 'image-svg-palette-chip', title: hex });
        chip.style.background = hex; chip.setAttribute('aria-label', hex); return chip;
      }));
    }
    statistics.textContent = session.statistics || 'Preparing sample…';
    conversionStatus.textContent = session.statusText;
    conversionStatus.classList.toggle('error', !!session.statusError);
    cacheNotice.textContent = session.cacheMessage || '';
    cacheNotice.hidden = !session.cacheMessage;
  }
  const dragover = event => { event.preventDefault(); dropArea.classList.add('dragover'); };
  const dragleave = () => dropArea.classList.remove('dragover');
  const drop = event => { event.preventDefault(); dragleave(); session.load(event.dataTransfer.files[0]); };
  dropArea.addEventListener('dragover', dragover); dropArea.addEventListener('dragleave', dragleave); dropArea.addEventListener('drop', drop);
  session.listeners.add(sync); panel._onShow = sync;
  panel._destroy = () => {
    session.listeners.delete(sync); if (session.onChange === onChange) session.onChange = null;
    dropArea.removeEventListener('dragover', dragover); dropArea.removeEventListener('dragleave', dragleave); dropArea.removeEventListener('drop', drop);
  };
  sync(); return panel;
}

registerTab('image', buildPanel);
registerVisual('imageToSVG', {
  title: 'Image to SVG',
  description: 'Local image-to-SVG conversion with 22 methods, continuous line drawings, fine controls, and palette limits.',
  params,
  defaultState: { filters: [], filterToAdd: 'brightness', previewMode: 'palette' },
  create({ mountEl }, state) {
    const session = sessionFor(state);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', NS); svg.setAttribute('viewBox', '0 0 720 540');
    svg.setAttribute('width', '720'); svg.setAttribute('height', '540');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Converted vector image');
    const group = document.createElementNS(NS, 'g'); svg.append(group);
    mountEl.replaceChildren(svg);
    let worker = null, timer = null, pendingJob = null, scheduledRevision = null, generation = 0, destroyed = false;
    const saveButton = () => document.querySelector('#config [aria-label="Save SVG"]');
    const syncStatus = () => {
      const save = saveButton(); if (save) save.disabled = !session.valid;
    };
    session.valid = false; session.listeners.add(syncStatus); syncStatus();
    function stop() {
      generation++; clearTimeout(timer); timer = null; worker?.terminate(); worker = null;
      pendingJob = null; scheduledRevision = null;
      session.busy = false; mountEl.setAttribute('aria-busy', 'false');
    }
    function fail(message) { stop(); session.lastKey = ''; session.valid = false; status(session, message, true); }
    function finish(message, job) {
      const { result, prepared, elapsed } = message;
      const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
      if (parsed.querySelector('parsererror')) { fail('The converter returned an invalid SVG. Try another method.'); return; }
      // Restore the live source if the shared Load control displayed another SVG.
      if (mountEl.firstElementChild !== svg) mountEl.replaceChildren(svg);
      svg.setAttribute('viewBox', `0 0 ${result.width} ${result.height}`);
      svg.setAttribute('width', result.width); svg.setAttribute('height', result.height);
      group.replaceChildren(...Array.from(parsed.documentElement.childNodes, child => document.importNode(child, true)));
      session.prepared = prepared; session.result = result; session.finishedOptions = job.options;
      const label = METHODS.find(method => method.id === result.method)?.label || result.method;
      session.statistics = `${label} · ${result.elementCount.toLocaleString()} shapes · ${result.colorsUsed} colors · ${(new Blob([result.svg]).size / 1024).toFixed(1)} KB geometry`;
      const next = pendingJob;
      stop(); session.valid = job.key === session.lastKey;
      status(session, result.elementCount ? `${session.statistics} · ${(elapsed / 1000).toFixed(2)} s` : 'No visible geometry. Lower the alpha cutoff, change the method, or adjust the filters.');
      if (next) schedule(next, 0);
    }
    function schedule(job, delay = 180) {
      pendingJob = job; scheduledRevision = job.revision;
      session.busy = true; mountEl.setAttribute('aria-busy', 'true');
      // Throttle continuous edits without restarting the timer or active worker.
      // One pending snapshot keeps playback responsive without a growing backlog.
      if (worker || timer !== null) return;
      timer = setTimeout(() => {
        const next = pendingJob; pendingJob = null; run(next);
      }, delay);
    }
    function run(job) {
      timer = null;
      if (destroyed) return;
      const current = ++generation;
      try {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          if (current !== generation || destroyed) return;
          if (data.type === 'progress') status(session, data.message);
          else if (data.type === 'error') fail(data.message);
          else if (data.type === 'result') finish(data, job);
        };
        worker.onerror = () => { if (current === generation) fail('Could not run the converter. Serve this app over HTTP and check that its modules are available.'); };
        const source = { ...session.source, data: new Uint8ClampedArray(session.source.data) };
        worker.postMessage({ source, options: job.options }, [source.data.buffer]);
      } catch (error) { fail(`Could not start conversion. ${error.message}`); }
    }
    function render() {
      if (destroyed || !session.source) return;
      session.notify();
      const options = conversionOptions(state);
      const key = JSON.stringify([session.revision, options]);
      if (key === session.lastKey && !session.force) return;
      session.valid = false;
      if (!state.autoConvert && !session.force) {
        stop();
        session.lastKey = ''; status(session, 'Changes pending · use Convert to SVG in Params.'); return;
      }
      // A different image invalidates both running and queued work immediately.
      if (session.busy && scheduledRevision !== session.revision) stop();
      session.force = false; session.lastKey = key;
      if (!session.busy) status(session, 'Preparing conversion…');
      else session.notify();
      schedule({ options, key, revision: session.revision });
    }
    session.render = render; session.lastKey = '';
    session.cancel = () => {
      if (!session.busy) return;
      stop(); session.force = false;
      status(session, 'Conversion canceled · use Convert to SVG in Params to retry.');
    };
    const dragover = event => event.preventDefault();
    const drop = event => { event.preventDefault(); session.load(event.dataTransfer.files[0]); };
    mountEl.addEventListener('dragover', dragover); mountEl.addEventListener('drop', drop);
    if (!session.source) { session.sample('landscape', false); session.restore(); } else render();
    return {
      render,
      destroy() {
        destroyed = true; stop(); session.valid = false; syncStatus();
        session.loadId = (session.loadId || 0) + 1; session.render = null; session.cancel = null;
        session.listeners.delete(syncStatus);
        mountEl.removeEventListener('dragover', dragover); mountEl.removeEventListener('drop', drop);
      },
    };
  },
});
