/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { VIDEO_FPS, videoEncodingProfiles } from './video-plan.js';
import { applyToolFlow } from '../helper/toolFlowHelp.js';
import { initTransformRuntime } from '../helper/transformHelp.js';
const elementNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const artworkElements = svg => [...svg.querySelectorAll('path,rect,circle,line,ellipse,polygon,polyline,text,image,use')]
  .filter(node => !node.closest('defs,clipPath,mask,symbol,pattern,marker'));
const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));
const check = signal => { if (signal?.aborted) throw new DOMException('Video export cancelled.', 'AbortError'); };

function bounded(promise, signal, label, ms = 30000) {
  // Some callers have already started work before entering this function.
  // Consume its rejection even if cancellation prevents us from awaiting it.
  if (signal?.aborted) Promise.resolve(promise).catch(() => {});
  check(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value);
    };
    const abort = () => finish(reject, new DOMException('Video export cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(reject, new Error(label + ' timed out.')), ms);
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

export function videoSVG(text, renderSize = {}, flow = null, allowBlankFrames = false) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  let svg = doc.documentElement;
  if (doc.querySelector('parsererror') || svg.localName !== 'svg') throw new Error('Invalid saved SVG.');
  const limit = (value, fallback) => Number.isFinite(value) && value > 0 ? Math.min(4096, Math.ceil(value)) : fallback;
  const limits = { width: limit(renderSize.width, 1200), height: limit(renderSize.height, 800) };
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  const validBox = viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0;
  let adjusted = false;
  const dimension = (key, axis) => {
    const raw = (svg.getAttribute(key) || '').trim();
    const parsed = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:px)?$/.test(raw) ? parseFloat(raw) : NaN;
    const valid = Number.isFinite(parsed) && parsed > 0;
    const value = valid ? parsed : validBox ? viewBox[axis] : limits[key];
    if (!valid || value > limits[key]) adjusted = true;
    return Math.max(1, Math.min(limits[key], Math.ceil(value)));
  };
  const width = dimension('width', 2), height = dimension('height', 3);
  if (viewBox && !validBox) {
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height); adjusted = true;
  }
  doc.querySelectorAll('script,foreignObject,iframe,object,embed,animate,animateTransform,set,metadata').forEach(node => node.remove());
  if (!allowBlankFrames && !artworkElements(svg).length) throw new Error('No rendered SVG geometry.');
  for (const node of doc.querySelectorAll('*')) for (const attr of [...node.attributes]) {
    if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    if (/href$/i.test(attr.name) && !attr.value.startsWith('#') && !attr.value.startsWith('data:image/')) {
      throw new Error('SVG contains an unloaded external image or resource.');
    }
  }
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', width); svg.setAttribute('height', height);
  svg.style.overflow = 'hidden';
  if (flow) {
    // Mount an isolated copy so computed colors, geometry measurements and
    // every shared flow stage behave as they do in the toolbar.
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
    host.setAttribute('aria-hidden', 'true');
    const mountEl = host.attachShadow({ mode: 'closed' });
    svg = document.importNode(svg, true); mountEl.append(svg); document.body.append(host);
    const state = {}; let runtime;
    try {
      if (flow.stages.some(stage => stage.enabled !== false && stage.kind === 'transform')) {
        // Treat the complete saved result as the next flow's source, including
        // existing transformed layers. Keep their visibility and transforms.
        svg.querySelectorAll('[data-xf-layer],[data-xf-source]').forEach(node => {
          node.removeAttribute('data-xf-layer'); node.removeAttribute('data-xf-source');
        });
        const group = document.createElementNS(svg.namespaceURI, 'g');
        while (svg.firstChild) group.appendChild(svg.firstChild);
        svg.append(group);
        runtime = initTransformRuntime({ mountEl, state });
      }
      const result = applyToolFlow({ mountEl, state, xfRuntime: runtime, stages: flow.stages });
      if (!result.ok) throw new Error('Could not apply SVG flow: ' + flow.name);
    } finally { runtime?.destroy(); host.remove(); }
  }
  return { width, height, adjusted, elementCount: artworkElements(svg).length, text: new XMLSerializer().serializeToString(svg) };
}

function drawVideoLabel(context, item, width, height, elementCount) {
  const run = item.runNumber ?? Number(/^run-(\d+)$/.exec(item.runId || '')?.[1]);
  const number = (Number.isFinite(run) ? 'Run ' + run + ' / ' : '') + 'Frame ' + item.index;
  const name = String(item.title || item.app || 'Unknown visual').replace(/\s+/g, ' ').trim();
  const count = elementNumber.format(elementCount).toLowerCase() + (elementCount === 1 ? ' element' : ' elements');
  const size = Math.min(24, Math.max(12, height * 0.018), height / 7, width / 12);
  const margin = size * 0.7, padding = size * 0.45, lineHeight = size * 1.3;
  const maxWidth = width - 2 * (margin + padding);
  context.save();
  try {
    context.font = size + 'px sans-serif';
    context.textAlign = 'right'; context.textBaseline = 'top';
    const fit = text => {
      if (context.measureText(text).width <= maxWidth) return text;
      const chars = Array.from(text);
      let low = 0, high = chars.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (context.measureText(chars.slice(0, mid).join('') + '\u2026').width <= maxWidth) low = mid;
        else high = mid - 1;
      }
      return chars.slice(0, low).join('') + '\u2026';
    };
    const lines = [fit(number), fit(name), fit(count)];
    const boxWidth = Math.max(...lines.map(line => context.measureText(line).width)) + padding * 2;
    const boxHeight = lineHeight * lines.length + padding * 2;
    const right = width - margin, top = height - margin - boxHeight;
    context.fillStyle = 'rgba(0, 0, 0, 0.65)';
    context.fillRect(right - boxWidth, top, boxWidth, boxHeight);
    context.fillStyle = '#ffffff';
    lines.forEach((line, index) => context.fillText(line, right - padding, top + padding + index * lineHeight));
  } finally { context.restore(); }
  return number + ' - ' + name + ' - ' + count;
}

export async function exportVideo(options) {
  const { signal, onProgress = () => {} } = options;
  check(signal);
  if (typeof VideoEncoder === 'undefined') throw new Error('MP4 export needs a browser with video encoding support. Open Odyssey in current desktop Chrome or Edge.');
  const prepared = {}, retries = [], maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    check(signal);
    const progress = value => onProgress({ ...value, attempt: attempt + 1, maxAttempts });
    try {
      const result = await exportVideoAttempt({ ...options, onProgress: progress }, prepared, attempt);
      return { ...result, attempts: attempt + 1, retries };
    } catch (error) {
      check(signal);
      // Disk errors, download limits, invalid sources and user cancellation
      // cannot be fixed by replacing the encoder.
      if (error.name === 'AbortError' || !error.encodingFailure) throw error;
      retries.push({ attempt: attempt + 1, profile: error.profile, frame: error.frame, reason: error.message });
      if (attempt + 1 === maxAttempts) {
        const failure = new Error('MP4 encoding failed after ' + maxAttempts + ' attempts. ' + error.message
          + ' Saved captures are intact; try a smaller frame range or another browser.', { cause: error });
        failure.retries = retries; throw failure;
      }
      const nextProfile = videoEncodingProfiles(prepared.width, prepared.height)[attempt + 1];
      progress({ phase: 'Retrying', done: 0, total: prepared.usable.length * options.plan.repeats,
        message: 'Encoder failed' + (error.frame === undefined ? '' : ' near saved frame ' + error.frame)
          + '. Restarting MP4 from saved captures: attempt ' + (attempt + 2) + '/' + maxAttempts
          + ' (' + nextProfile.label + '). ' + error.message });
      await yieldUI();
    }
  }
}

async function exportVideoAttempt({ plan, storage, fileHandle, signal, onProgress, onFrame = () => {} }, prepared, attempt) {
  const { Output, Mp4OutputFormat, BufferTarget, StreamTarget, CanvasSource, canEncodeVideo, Quality } = await import('./vendor/mediabunny.mjs');
  let output, writable, targetError, activeFrame, profile, completed = false;
  const canvas = document.createElement('canvas'), skipped = [...(prepared.skipped || [])];
  const encode = async (work, label, ms) => {
    try { check(signal); return await bounded(Promise.resolve().then(work), signal, label, ms); }
    catch (error) {
      check(signal);
      if (error.name === 'AbortError') throw error;
      if (targetError) throw targetError;
      const failure = new Error(label + ': ' + (error.message || String(error)), { cause: error });
      Object.assign(failure, { encodingFailure: true, frame: activeFrame, profile: profile.label });
      throw failure;
    }
  };
  const skip = (item, error) => {
    check(signal);
    if (error.name === 'AbortError') throw error;
    skipped.push({ index: item.index, runId: item.runId, file: item.frame?.file, reason: error.message });
  };
  const noFrames = () => Object.assign(new Error('No usable SVG frames remain; skipped ' + skipped.length + ' frame(s).'), { skipped });
  const read = async (item, flow = null) => {
    check(signal);
    const frame = item.frame;
    if (!frame?.file || (!plan.allowBlankFrames && frame.empty) || frame.failed || frame.error || ['failed', 'error', 'timeout', 'cancelled', 'stopped'].includes(frame.status)
      || (!plan.allowBlankFrames && frame.errors?.some(error => /^Empty SVG:/i.test(String(error))))) throw new Error('Frame is missing, empty, or marked as failed.');
    const blob = await bounded(storage.read(plan.sessionId, frame.file), signal, 'Reading ' + item.frame.file);
    return videoSVG(await bounded(blob.text(), signal, 'Reading saved SVG'), plan.renderSize, flow, plan.allowBlankFrames === true);
  };
  try {
    // Index only once. Retries reuse the dimensions and usable-frame list;
    // SVGs/images remain one-at-a-time to avoid retaining the whole export.
    if (!prepared.usable) {
      let width = 0, height = 0;
      const usable = [];
      for (let i = 0; i < plan.items.length; i++) {
        try {
          const svg = await read(plan.items[i]);
          width = Math.max(width, svg.width); height = Math.max(height, svg.height); usable.push(plan.items[i]);
        } catch (error) { skip(plan.items[i], error); }
        onProgress({ phase: 'Preparing', done: i + 1, total: plan.items.length, skipped: skipped.length });
        await yieldUI();
      }
      if (!usable.length) throw noFrames();
      // AVC requires even dimensions. Pad odd sizes; never rescale artwork.
      Object.assign(prepared, { width: width + width % 2, height: height + height % 2, usable, skipped: [...skipped] });
    }
    const { width, height, usable } = prepared;
    profile = videoEncodingProfiles(width, height)[attempt];
    const encoding = { quality: new Quality(profile.quality), latencyMode: 'quality', contentHint: 'detail',
      ...(profile.hardwareAcceleration ? { hardwareAcceleration: profile.hardwareAcceleration } : {}) };
    await encode(async () => {
      if (!await canEncodeVideo('avc', { width, height, frameRate: VIDEO_FPS, ...encoding })) {
        throw new Error(profile.label + ' is not supported at ' + width + ' x ' + height + '.');
      }
    }, 'Checking MP4 support');
    check(signal);
    let target;
    if (fileHandle) {
      writable = await fileHandle.createWritable();
      // Commit only after successful finalization. Cancellation must not replace an existing file.
      target = new StreamTarget(new WritableStream({ write: async chunk => {
        try { await writable.write(chunk); } catch (error) { targetError = error; throw error; }
      } }), { chunked: true, chunkSize: 1024 * 1024 });
    } else {
      target = new BufferTarget();
      target.on('write', ({ end }) => {
        if (end > 256 * 1024 * 1024) {
          targetError = new Error('Download export exceeded 256 MB. Export a smaller frame range or choose an output file before rendering.');
          throw targetError;
        }
      });
    }
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target });
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) throw new Error('Could not create the video image canvas.');
    const source = new CanvasSource(canvas, { codec: 'avc', ...encoding, keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: VIDEO_FPS, maximumPacketCount: plan.totalFrames });
    await bounded(output.start(), signal, 'Starting MP4 export');
    let encoded = 0, adjusted = 0, total = usable.length * plan.repeats;
    for (const item of usable) {
      activeFrame = item.index;
      let url, image, elementCount;
      try {
        const svg = await read(item, plan.flow);
        elementCount = svg.elementCount;
        url = URL.createObjectURL(new Blob([svg.text], { type: 'image/svg+xml' }));
        image = new Image(); image.src = url;
        await bounded(image.decode(), signal, 'Rasterizing saved frame ' + item.index);
        context.clearRect(0, 0, width, height);
        context.drawImage(image, Math.floor((width - svg.width) / 2), Math.floor((height - svg.height) / 2), svg.width, svg.height);
        const rendered = context.getImageData(0, 0, width, height), pixels = rendered.data;
        let painted = false;
        for (let alpha = 3; alpha < pixels.length; alpha += 4) if (pixels[alpha]) { painted = true; break; }
        // A fade or zero-count animation can intentionally be blank. Preserve
        // those timestamps as black frames; saved-search exports retain their
        // default rejection of empty captures.
        if (!painted && !plan.allowBlankFrames) throw new Error('SVG rendered no visible pixels.');
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = '#000000'; context.fillRect(0, 0, width, height);
        context.globalCompositeOperation = 'source-over';
        if (svg.adjusted) adjusted++;
      } catch (error) {
        skip(item, error); total -= plan.repeats;
        // Reset the canvas as well, including any failed/tainted image draw.
        canvas.width = width;
        onProgress({ phase: 'Encoding', done: encoded, total, width, height, frame: item.index, skipped: skipped.length });
        await yieldUI(); continue;
      } finally { if (image) image.src = ''; if (url) URL.revokeObjectURL(url); }
      // Add labels after the empty-frame check and styling, so blank captures
      // cannot become usable just because the label contains visible text.
      const label = plan.showLabel ? drawVideoLabel(context, item, width, height, elementCount) : '';
      // The preview receives the same finished pixels used by the encoder.
      onFrame({ canvas, item, width, height, flowName: plan.flow?.name || 'Captured styling', label, elementCount });
      await yieldUI();
      for (let repeat = 0; repeat < plan.repeats; repeat++) {
        check(signal);
        await encode(() => source.add(encoded / VIDEO_FPS, 1 / VIDEO_FPS, { keyFrame: repeat === 0 }), 'Encoding saved frame ' + item.index);
        encoded++;
        if (encoded % 6 === 0 || encoded === total) {
          onProgress({ phase: 'Encoding', done: encoded, total, width, height, frame: item.index, skipped: skipped.length });
          await yieldUI();
        }
      }
    }
    if (!encoded) throw noFrames();
    onProgress({ phase: 'Finalizing', done: encoded, total: encoded, width, height, skipped: skipped.length });
    await encode(() => output.finalize(), 'Finalizing MP4', 60000);
    check(signal);
    if (writable) await writable.close();
    completed = true;
    return { blob: fileHandle ? null : new Blob([target.buffer], { type: 'video/mp4' }), width, height,
      frames: encoded, duration: encoded / VIDEO_FPS, sourceFrames: encoded / plan.repeats, skipped, adjusted, encodingProfile: profile.label };
  } finally {
    if (!completed) {
      if (output && output.state !== 'finalized') await bounded(output.cancel(), null, 'Releasing video encoder', 5000).catch(() => {});
      if (writable) await bounded(writable.abort(), null, 'Discarding incomplete MP4', 5000).catch(() => {});
    }
    canvas.width = canvas.height = 0;
  }
}
