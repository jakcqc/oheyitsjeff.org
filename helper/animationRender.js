/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { exportAnimationVideo } from './animationEncode.js';
import { videoOutput } from '../TheOdyssey/video-output.js';
import { createAnimationCapture } from './animationRenderCapture.js';
import { animationFrameProgress, ANIMATION_SVG_MEMORY_LIMIT } from './animationRenderPlan.js';
export { makeAnimationRenderPlan } from './animationRenderPlan.js';

const check = signal => { if (signal?.aborted) throw new DOMException('Animation render cancelled.', 'AbortError'); };
const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));
const clock = () => performance.now();
const id = () => globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2);

function reportProgress(plan, onProgress = () => {}, estimate) {
  const start = clock();
  let phase, phaseStart = start;
  return value => {
    const now = clock();
    if (value.phase !== phase) { phase = value.phase; phaseStart = now; }
    const elapsedSeconds = (now - start) / 1000;
    const finalizing = value.phase === 'Finalizing';
    const measured = !finalizing && value.done > 0 && now - phaseStart > 200;
    const remaining = finalizing ? null : measured ? (now - phaseStart) / 1000 / value.done * Math.max(0, value.total - value.done)
      : Math.max(0, estimate - elapsedSeconds);
    onProgress({ estimatedFileBytes: plan.estimatedFileBytes, estimatedMemoryBytes: plan.estimatedMemoryBytes,
      elapsedSeconds, estimatedSecondsRemaining: remaining, estimateMeasured: measured, ...value });
  };
}

async function createFrameCache(signal) {
  const sessionId = 'animation-' + id();
  let parent, directory, released = false, bytes = 0;
  const memory = new Map(), files = new Set();
  try {
    if (globalThis.navigator?.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory(); check(signal);
      parent = await root.getDirectoryHandle('animation-render-cache', { create: true }); check(signal);
      directory = await parent.getDirectoryHandle(sessionId, { create: true });
    }
    check(signal);
  } catch (error) {
    if (signal?.aborted) { if (parent) await parent.removeEntry(sessionId, { recursive: true }).catch(() => {}); check(signal); }
    // Private-mode/disabled OPFS uses the explicitly bounded memory cache.
    directory = null;
  }
  const ready = () => { if (released) throw new Error('This animation preload has been released. Preload it again.'); };
  return {
    sessionId, mode: directory ? 'disk' : 'memory', get bytes() { return bytes; },
    async write(file, blob) {
      ready(); check(signal);
      if (blob.size > ANIMATION_SVG_MEMORY_LIMIT) throw new Error('A single SVG frame exceeds the 64 MB frame limit. Reduce the animation complexity.');
      if (directory) {
        const handle = await directory.getFileHandle(file, { create: true }); check(signal);
        const writable = await handle.createWritable();
        const abort = () => { writable.abort().catch(() => {}); };
        signal?.addEventListener('abort', abort, { once: true });
        let complete = false;
        try { check(signal); await writable.write(blob); check(signal); await writable.close(); check(signal); complete = true; }
        finally { signal?.removeEventListener('abort', abort); if (!complete) await writable.abort().catch(() => {}); }
      } else {
        if (bytes + blob.size > ANIMATION_SVG_MEMORY_LIMIT) throw new Error('SVG preload reached the 64 MB memory limit. Render a shorter animation, use a smaller frame range, or allow browser private storage.');
        memory.set(file, blob);
      }
      files.add(file); bytes += blob.size;
    },
    async read(requestSessionId, file) {
      ready();
      if (requestSessionId !== sessionId || !files.has(file)) throw new Error('Animation frame is unavailable.');
      const blob = directory ? await (await directory.getFileHandle(file)).getFile() : memory.get(file);
      ready(); return blob;
    },
    async release() {
      if (released) return;
      released = true; memory.clear(); files.clear(); bytes = 0;
      if (directory) await parent.removeEntry(sessionId, { recursive: true }).catch(() => {});
    },
  };
}

// Capture into an isolated visual app. The visible simulation and its state
// remain available while SVG frames are generated and written one at a time.
export async function preloadAnimation({ state, plan, signal, onProgress, sourceURL, svgSource, app = '', title = '' }) {
  check(signal);
  let snapshot;
  try {
    // Live visual state may include export callbacks and other runtime helpers.
    // Capture saved settings using the same serialization as the app renderer.
    snapshot = JSON.parse(JSON.stringify(state, (key, value) => key === '__history' ? undefined : value));
  } catch (error) {
    throw new Error('Could not snapshot the animation settings: ' + error.message, { cause: error });
  }
  const progress = reportProgress(plan, onProgress, plan.estimatedCaptureSeconds);
  const started = clock();
  let cache, capture, complete = false;
  const items = [];
  try {
    progress({ phase: 'Starting preload', done: 0, total: plan.captureFrames, bytes: 0 });
    cache = await createFrameCache(signal); check(signal);
    capture = createAnimationCapture({ state: snapshot, sourceURL, svgSource, app, width: plan.width, height: plan.height, signal });
    const setup = await capture.prepare(); check(signal);
    const setupErrors = setup?.errors?.filter(error => !/^Empty SVG:/i.test(String(error)));
    if (setupErrors?.length) throw new Error('Could not prepare the animation: ' + setupErrors.join('; '));
    let selected = 0;
    for (let index = 0; index < plan.captureFrames; index++) {
      check(signal);
      const frame = await capture.frame({ progress: animationFrameProgress(plan, index), deltaMs: index ? 1000 / plan.fps : 0 });
      check(signal);
      if (index === plan.indices[selected]) {
        const errors = frame?.errors?.filter(error => !/^Empty SVG:/i.test(String(error)));
        if (!frame?.svg || errors?.length) {
          throw new Error('Could not capture animation frame ' + index + ': ' + (errors?.join('; ') || 'The renderer returned no SVG.'));
        }
        const file = 'frame-' + String(index).padStart(6, '0') + '.svg';
        await cache.write(file, new Blob([frame.svg], { type: 'image/svg+xml' })); check(signal);
        items.push(Object.freeze({ index, app, title, frame: Object.freeze({ index, file }) }));
        selected++;
      }
      progress({ phase: 'Preloading SVG', done: index + 1, total: plan.captureFrames, captured: items.length,
        selectedFrames: plan.frames, frame: index, bytes: cache.bytes, cacheMode: cache.mode });
      await yieldUI(); check(signal);
    }
    complete = true;
    return Object.freeze({ plan, items: Object.freeze(items), storage: cache, sessionId: cache.sessionId,
      bytes: cache.bytes, cacheMode: cache.mode, elapsedSeconds: (clock() - started) / 1000,
      release: () => cache.release() });
  } catch (error) {
    check(signal); throw error;
  } finally {
    try { capture?.destroy(); }
    finally { if (!complete) await cache?.release(); }
  }
}

// Odyssey owns H.264 quality, retries and cancellation. A temporary output file
// lets the UI show the completed movie before the user decides whether to save.
export async function renderAnimation({ prepared, signal, onProgress, onFrame }) {
  check(signal);
  if (!prepared?.items?.length) throw new Error('Preload the animation before rendering MP4.');
  const { plan } = prepared;
  const progress = reportProgress(plan, onProgress, plan.estimatedEncodeSeconds);
  const started = clock();
  let output, complete = false;
  try {
    progress({ phase: 'Starting MP4', done: 0, total: plan.frames, bytes: prepared.bytes, cacheMode: prepared.cacheMode });
    output = await videoOutput(); check(signal);
    const result = await exportAnimationVideo({
      plan: { ...plan, sessionId: prepared.sessionId, items: prepared.items, repeats: 1,
        totalFrames: prepared.items.length, secondsPerFrame: 1 / plan.fps, allowBlankFrames: true },
      storage: prepared.storage, fileHandle: output.fileHandle, signal, onFrame,
      onProgress: value => progress({ bytes: prepared.bytes, cacheMode: prepared.cacheMode, ...value }),
    });
    check(signal);
    const blob = await output.blob(result); check(signal);
    if (!blob || !blob.size) throw new Error('The animation encoder returned an empty MP4.');
    complete = true;
    return { ...result, blob, elapsedSeconds: (clock() - started) / 1000, release: () => output.release() };
  } catch (error) {
    check(signal); throw error;
  } finally {
    if (!complete) await output?.release();
  }
}
