/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { makeAnimationRenderPlan } from './animationRenderPlan.js';
import { getFlowLibrary } from './toolFlowHelp.js';

// Keep the encoder and capture loader out of the normal visual startup graph.
const engineURL = new URL('./animationRender.js', import.meta.url).href;
const bytes = value => value < 1024 * 1024 ? (value / 1024).toFixed(0) + ' KB' : (value / 1024 / 1024).toFixed(1) + ' MB';
const time = value => !Number.isFinite(value) ? 'calculating…' : value < 60 ? Math.max(1, Math.ceil(value)) + ' sec' : Math.ceil(value / 60) + ' min';
const node = (tag, props = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className' || key === 'textContent' || key in element && !key.startsWith('aria-')) element[key] = value;
    else element.setAttribute(key, value);
  }
  element.append(...children); return element;
};
const button = (text, onclick) => node('button', { type: 'button', textContent: text, onclick });

function waitForOperation(promise, signal, label, lateValue, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value);
    };
    const abort = () => finish(reject, new DOMException(label + ' cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(reject, new Error(label + ' timed out.')), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => {
      if (settled) lateValue?.(value);
      else finish(resolve, value);
    }, error => finish(reject, error));
    if (signal?.aborted) abort();
  });
}

async function snapshotSVG(mountEl, signal) {
  const svg = mountEl?.querySelector('svg');
  if (!svg) throw new Error('The simulation has not produced an SVG to animate.');
  const copy = svg.cloneNode(true), source = [svg, ...svg.querySelectorAll('*')], target = [copy, ...copy.querySelectorAll('*')];
  const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
    'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'visibility', 'display'];
  for (let index = 0; index < source.length; index++) {
    signal.throwIfAborted();
    if (source[index] instanceof SVGElement) {
      const style = getComputedStyle(source[index]);
      for (const key of properties) target[index].style.setProperty(key, style.getPropertyValue(key));
    }
    if (index % 128 === 127) await new Promise(resolve => setTimeout(resolve, 0));
  }
  copy.querySelectorAll('script,foreignObject,#ohey-settings').forEach(element => element.remove());
  for (const element of [copy, ...copy.querySelectorAll('*')]) for (const attr of [...element.attributes]) {
    if (/^on/i.test(attr.name)) element.removeAttribute(attr.name);
  }
  const box = svg.getBoundingClientRect();
  if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(copy);
}

export function buildAnimationRenderPanel({ mountEl, state, spec, onStateChange }) {
  const root = node('div', { className: 'anim-render', 'data-animation-render': '' });
  // Captured sources never start a nested renderer or create a preview overlay.
  if (globalThis.__ODYSSEY_REQUEST__) return root;
  if (!state.__anim.render || typeof state.__anim.render !== 'object' || Array.isArray(state.__anim.render)) state.__anim.render = {};
  const settings = state.__anim.render;
  const fields = {}, form = node('fieldset', { className: 'anim-render-options' });
  let flows = [], prepared, completed, controller, destination, resultURL, frameURL;
  let destroyed = false, previewPlaying = false, previewTimer, previewSerial = 0;
  let activePlan, startTime = 0, heartbeat, lastProgress;
  const field = (key, label, input, fallback) => {
    input.setAttribute('aria-label', label);
    if (input.type === 'checkbox') input.checked = !!(settings[key] ?? fallback);
    else input.value = String(settings[key] ?? fallback);
    fields[key] = input;
    input.onchange = () => {
      settings[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? input.valueAsNumber : input.value;
      onStateChange?.(); void clearPrepared(); estimate();
    };
    form.append(node('label', { className: input.type === 'checkbox' ? 'anim-check' : 'anim-row' }, input.type === 'checkbox'
      ? [input, node('span', { textContent: label })]
      : [node('span', { className: 'anim-label', textContent: label }), input]));
    return input;
  };
  const select = choices => node('select', {}, choices.map(([value, label]) => node('option', { value, textContent: label })));
  field('format', 'Render format', select([['mp4', 'MP4 · high quality'], ['svg', 'SVG frames · preload preview']]), 'mp4');
  field('width', 'Output width', node('input', { type: 'number', min: 2, max: 4096, step: 1 }), 1200);
  field('height', 'Output height', node('input', { type: 'number', min: 2, max: 4096, step: 1 }), 800);
  field('durationSec', 'Render duration (seconds)', node('input', { type: 'number', min: 1 / 24, step: 'any' }), state.__anim.ui.durationSec || 3);
  field('cycles', 'Cycles', node('input', { type: 'number', min: 1, max: 100, step: 1 }), 1);
  field('ranges', 'Frame ranges', node('input', { type: 'text', placeholder: 'All frames, or 0-23, 48-71' }), '');
  form.append(node('p', { className: 'anim-help', textContent: '24 fps. Ranges start at 0 and include both ends. Each cycle includes the return trip when Yoyo is enabled in Flow.' }));
  field('flowId', 'Render flow', select([['', 'Keep captured styling']]), '');
  field('showLabel', 'Show frame labels', node('input', { type: 'checkbox' }), false);
  const destinationName = node('p', { className: 'anim-help', textContent: 'Preview first. Save MP4 downloads the finished video when you choose.' });
  const chooseFile = button('Choose output file', async () => {
    try {
      destination = await window.showSaveFilePicker({ suggestedName: 'animation.mp4', types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] });
      destinationName.textContent = 'Save MP4 will write to ' + destination.name + ' after you review the preview.';
    } catch (error) { if (error.name !== 'AbortError') status.textContent = error.message; }
  });
  chooseFile.hidden = typeof window.showSaveFilePicker !== 'function';
  form.append(node('div', { className: 'tool-flow-actions' }, [chooseFile, button('Use download', () => {
    destination = null; destinationName.textContent = 'Preview first. Save MP4 downloads the finished video when you choose.';
  })]), destinationName);
  const estimates = node('p', { className: 'anim-render-estimates anim-help', 'aria-live': 'polite' });
  const status = node('p', { className: 'anim-render-status anim-status', role: 'status' });
  const progress = node('progress', { value: 0, max: 1, hidden: true, 'aria-label': 'Animation render progress' });
  const preload = button('Preload frames', () => void run(false));
  const render = button('Render MP4', () => void run(true));
  const cancel = button('Cancel render', () => controller?.abort()); cancel.hidden = true;
  const show = button('Show preview', () => { preview.hidden = false; }); show.hidden = true;
  const clear = button('Clear preload', () => { void clearPrepared(); status.textContent = 'Preloaded frames released.'; estimate(); }); clear.hidden = true;
  root.append(node('p', { className: 'anim-help', textContent: 'Render the animation configured in Flow or applied JSON. Preload captures a snapshot for review and reuse. The MP4 uses Odyssey’s high-quality encoder.' }),
    form, estimates, progress, status, node('div', { className: 'tool-flow-actions' }, [preload, render, cancel, show, clear]));

  const preview = node('section', { className: 'anim-render-preview', hidden: true, 'aria-label': 'Animation render preview' });
  const previewTitle = node('strong', { textContent: 'Animation render' });
  const previewStatus = node('p', { className: 'anim-render-preview-status', role: 'status' });
  const canvas = node('canvas', { hidden: true, 'aria-label': 'Frame being encoded' });
  const img = node('img', { hidden: true, alt: 'Preloaded animation frame' });
  const video = node('video', { hidden: true, controls: true, playsInline: true, preload: 'metadata', 'aria-label': 'Rendered animation' });
  const media = node('div', { className: 'anim-render-media' }, [canvas, img, video]);
  const previewCancel = button('Cancel render', () => controller?.abort());
  const save = button('Save MP4', () => void saveMP4()); save.hidden = true;
  const discard = button('Discard', () => { void clearPrepared(); preview.hidden = true; status.textContent = 'Preview discarded and temporary files released.'; estimate(); }); discard.hidden = true;
  const back = button('Back to simulation', () => { preview.hidden = true; video.pause(); stopPreview(); });
  const frameSlider = node('input', { type: 'range', min: 0, max: 0, value: 0, step: 1, 'aria-label': 'Preloaded frame' });
  const playFrames = button('Play preloaded frames', () => {
    if (previewPlaying) { stopPreview(); return; }
    previewPlaying = true; playFrames.textContent = 'Pause preview'; void playNext();
  });
  const svgControls = node('div', { className: 'anim-render-svg-controls', hidden: true }, [playFrames, frameSlider]);
  frameSlider.oninput = () => { stopPreview(); void showFrame(Number(frameSlider.value)); };
  preview.append(node('header', {}, [previewTitle, back]), media, svgControls, previewStatus,
    node('div', { className: 'tool-flow-actions' }, [previewCancel, save, discard]));
  const host = mountEl?.closest?.('#background') || mountEl?.parentElement;
  host?.append(preview);

  function readPlan() {
    const options = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key,
      input.type === 'checkbox' ? input.checked : input.type === 'number' ? input.valueAsNumber : input.value]));
    options.flow = flows.find(flow => flow.id === options.flowId) || null;
    return makeAnimationRenderPlan(state, options);
  }
  function estimate() {
    if (destroyed || controller) return;
    try {
      const plan = readPlan(), range = plan.estimatedSecondsRange;
      estimates.textContent = plan.frames.toLocaleString() + ' frames · ' + plan.duration.toFixed(2) + ' sec at 24 fps · '
        + plan.width + ' × ' + plan.height + '. Estimated MP4: ' + bytes(plan.estimatedFileBytes)
        + '; working memory: ' + bytes(plan.estimatedMemoryBytes) + '. Estimated render: '
        + (range ? time(range[0]) + '–' + time(range[1]) : time(plan.estimatedSeconds))
        + '. Estimates vary with SVG complexity and your device; encoder retries can take longer.';
      preload.disabled = false; render.disabled = false;
      render.textContent = fields.format.value === 'svg' ? 'Preload & preview' : prepared ? 'Render preloaded MP4' : 'Render MP4';
    } catch (error) { estimates.textContent = error.message; preload.disabled = render.disabled = true; }
    clear.hidden = !prepared; show.hidden = preview.hidden && !prepared && !completed;
  }
  function stopPreview() {
    previewPlaying = false; clearTimeout(previewTimer); playFrames.textContent = 'Play preloaded frames';
  }
  async function showFrame(index) {
    const source = prepared, serial = ++previewSerial;
    if (!source) return;
    try {
      const item = source.items[index];
      if (!item) return;
      const blob = await source.storage.read(source.sessionId, item.frame.file);
      if (serial !== previewSerial || source !== prepared || destroyed) return;
      if (frameURL) URL.revokeObjectURL(frameURL);
      frameURL = URL.createObjectURL(blob); img.src = frameURL; img.hidden = false;
      canvas.hidden = video.hidden = true;
      frameSlider.value = String(index);
      previewStatus.textContent = 'Preloaded frame ' + item.index + ' · ' + (index + 1) + ' / ' + source.items.length
        + ' · SVG cache ' + bytes(source.bytes) + '. This preview shows captured styling; the selected render flow and labels are applied to the MP4.';
    } catch (error) { if (!destroyed && source === prepared) status.textContent = error.message; }
  }
  async function playNext() {
    if (!previewPlaying || !prepared) return;
    const index = (Number(frameSlider.value) + 1) % prepared.items.length;
    await showFrame(index);
    if (previewPlaying) previewTimer = setTimeout(() => void playNext(), 1000 / 24);
  }
  async function releaseVideo() {
    video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true; save.hidden = true;
    if (resultURL) URL.revokeObjectURL(resultURL); resultURL = null;
    const old = completed; completed = null; await old?.release();
  }
  async function clearPrepared() {
    stopPreview(); previewSerial++;
    const old = prepared; prepared = null;
    if (frameURL) URL.revokeObjectURL(frameURL); frameURL = null;
    img.removeAttribute('src'); img.hidden = true; svgControls.hidden = true;
    canvas.hidden = true; canvas.width = canvas.height = 0;
    show.hidden = clear.hidden = discard.hidden = true;
    await Promise.allSettled([old?.release(), releaseVideo()]);
  }
  function progressText() {
    if (!lastProgress || !controller) return;
    const p = lastProgress, elapsed = (performance.now() - startTime) / 1000;
    const remaining = p.estimatedSecondsRemaining;
    const message = p.message || p.phase + ': ' + (p.done || 0).toLocaleString() + ' / ' + (p.total || 0).toLocaleString();
    const text = message + ' · Elapsed ' + time(elapsed) + ' · Phase remaining ≈ ' + time(remaining)
      + ' · MP4 ≈ ' + bytes(p.estimatedFileBytes ?? activePlan.estimatedFileBytes)
      + ' · Working memory ≈ ' + bytes(p.estimatedMemoryBytes ?? activePlan.estimatedMemoryBytes)
      + (p.bytes ? ' · SVG cache ' + bytes(p.bytes) : '') + '. You can cancel at any time.';
    status.textContent = previewStatus.textContent = controller.signal.aborted ? 'Cancelling render and releasing temporary files…' : text;
  }
  function updateProgress(value) {
    if (destroyed) return;
    lastProgress = value; progress.max = Math.max(1, value.total || 1); progress.value = value.done || 0; progressText();
  }
  function setBusy(busy) {
    form.disabled = busy; preload.disabled = render.disabled = clear.disabled = busy;
    cancel.hidden = previewCancel.hidden = !busy; discard.disabled = busy; save.disabled = busy;
    progress.hidden = !busy;
  }
  async function run(encode) {
    if (controller || destroyed) return;
    let plan, requestedState;
    try {
      plan = readPlan();
      requestedState = JSON.parse(JSON.stringify(state, (key, value) => key === '__history' ? undefined : value));
    } catch (error) { status.textContent = error.message; return; }
    const task = new AbortController(); controller = task; activePlan = prepared?.plan || plan;
    startTime = performance.now(); lastProgress = null;
    setBusy(true); stopPreview(); previewSerial++; preview.hidden = false; show.hidden = false;
    previewTitle.textContent = 'Rendering animation'; svgControls.hidden = true;
    heartbeat = setInterval(progressText, 1000);
    task.signal.addEventListener('abort', progressText, { once: true });
    updateProgress({ phase: 'Loading renderer', done: 0, total: activePlan.frames, estimatedSecondsRemaining: activePlan.estimatedSeconds });
    try {
      const svgSource = (!encode || !prepared) && requestedState.__anim.ui.targetType === 'svg'
        ? await snapshotSVG(mountEl, task.signal) : undefined;
      const engine = await import(engineURL); task.signal.throwIfAborted();
      await releaseVideo(); task.signal.throwIfAborted();
      if (!encode || !prepared) {
        await clearPrepared(); task.signal.throwIfAborted();
        prepared = await engine.preloadAnimation({ state: requestedState, plan, svgSource, signal: task.signal, onProgress: updateProgress, title: spec?.title || 'Visual' });
      }
      task.signal.throwIfAborted();
      if (encode && plan.format === 'mp4') {
        completed = await engine.renderAnimation({ prepared, signal: task.signal, onProgress: updateProgress,
          onFrame: ({ canvas: frame }) => {
            if (destroyed || task.signal.aborted) return;
            img.hidden = video.hidden = true; canvas.hidden = false;
            const scale = Math.min(1, 960 / frame.width, 540 / frame.height);
            canvas.width = Math.round(frame.width * scale); canvas.height = Math.round(frame.height * scale);
            canvas.getContext('2d').drawImage(frame, 0, 0, canvas.width, canvas.height);
          } });
        task.signal.throwIfAborted();
        resultURL = URL.createObjectURL(completed.blob); video.src = resultURL; video.hidden = false; canvas.hidden = img.hidden = true;
        save.hidden = false; previewTitle.textContent = 'MP4 ready to review';
        status.textContent = previewStatus.textContent = 'MP4 ready · ' + bytes(completed.blob.size) + ' · '
          + completed.width + ' × ' + completed.height + ' · ' + completed.duration.toFixed(2) + ' sec at 24 fps. '
          + (completed.encodingProfile || 'High quality') + '. Choose Save MP4 or Discard.';
      } else {
        previewTitle.textContent = 'Preloaded animation'; svgControls.hidden = false;
        frameSlider.max = String(prepared.items.length - 1); await showFrame(0);
        status.textContent = 'Preloaded ' + prepared.items.length + ' frames · ' + bytes(prepared.bytes) + ' (' + prepared.cacheMode
          + '). Render uses this snapshot. Preload again to capture changed animation settings.';
      }
      discard.hidden = false;
    } catch (error) {
      await releaseVideo();
      if (!destroyed) {
        const text = task.signal.aborted || error.name === 'AbortError' ? 'Render cancelled. You can change settings or try again.' : 'Render failed: ' + error.message;
        status.textContent = previewStatus.textContent = text;
        previewTitle.textContent = task.signal.aborted ? 'Render cancelled' : 'Render stopped';
        discard.hidden = false;
      }
    } finally {
      clearInterval(heartbeat); controller = null;
      if (destroyed) await clearPrepared();
      else { setBusy(false); estimate(); }
    }
  }
  async function saveMP4() {
    if (!completed || controller) return;
    if (!destination) {
      const link = node('a', { href: resultURL, download: 'animation.mp4' }); link.click();
      status.textContent = 'MP4 download started. The preview remains available.'; return;
    }
    const task = new AbortController(); controller = task; setBusy(true); let writable;
    const result = completed;
    const abortWrite = () => { void writable?.abort().catch(() => {}); };
    task.signal.addEventListener('abort', abortWrite, { once: true });
    try {
      status.textContent = previewStatus.textContent = 'Saving MP4…';
      writable = await waitForOperation(destination.createWritable(), task.signal, 'Opening output file', handle => { void handle.abort().catch(() => {}); });
      task.signal.throwIfAborted();
      // Copy bounded chunks so saving is cancellable too.
      for (let offset = 0; offset < result.blob.size; offset += 1024 * 1024) {
        task.signal.throwIfAborted();
        const chunk = await waitForOperation(result.blob.slice(offset, offset + 1024 * 1024).arrayBuffer(), task.signal, 'Reading MP4');
        await waitForOperation(writable.write(chunk), task.signal, 'Writing MP4');
        progress.max = result.blob.size; progress.value = Math.min(result.blob.size, offset + 1024 * 1024);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      task.signal.throwIfAborted(); await waitForOperation(writable.close(), task.signal, 'Finishing MP4 save'); writable = null;
      status.textContent = previewStatus.textContent = 'Saved MP4 to ' + destination.name + '.';
    } catch (error) {
      if (writable) await waitForOperation(writable.abort(), null, 'Releasing output file', null, 2000).catch(() => {});
      if (!destroyed) status.textContent = previewStatus.textContent = task.signal.aborted ? 'Save cancelled. The preview is still available.' : 'Could not save MP4: ' + error.message;
    } finally {
      task.signal.removeEventListener('abort', abortWrite);
      controller = null; if (!destroyed) { setBusy(false); estimate(); }
    }
  }
  const escape = event => { if (event.key === 'Escape') { if (controller) { controller.abort(); event.preventDefault(); } else { preview.hidden = true; video.pause(); stopPreview(); } } };
  const destroy = () => {
    destroyed = true; controller?.abort(); clearInterval(heartbeat); stopPreview();
    window.removeEventListener('keydown', escape); window.removeEventListener('pagehide', destroy);
    preview.remove(); void clearPrepared();
  };
  root._onShow = () => {
    if (settings.durationSec == null && !controller && !prepared) fields.durationSec.value = String(state.__anim.ui.durationSec || 3);
    const selected = fields.flowId.value || settings.flowId || '';
    flows = getFlowLibrary();
    fields.flowId.replaceChildren(node('option', { value: '', textContent: 'Keep captured styling' }),
      ...flows.map(flow => node('option', { value: flow.id, textContent: flow.name })));
    fields.flowId.value = flows.some(flow => flow.id === selected) ? selected : '';
    estimate();
  };
  root._destroy = destroy;
  window.addEventListener('keydown', escape); window.addEventListener('pagehide', destroy);
  root._onShow(); return root;
}
