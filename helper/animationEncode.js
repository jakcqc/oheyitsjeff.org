/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { VisualFrame } from '../TheOdyssey/client.js';

const check = signal => { if (signal?.aborted) throw new DOMException('Animation render cancelled.', 'AbortError'); };
const errorData = error => ({ name: error.name || 'Error', message: error.message || String(error) });
async function abortWriter(writable) {
  if (!writable) return;
  let timer;
  try {
    await Promise.race([Promise.resolve().then(() => writable.abort()).catch(() => {}),
      new Promise(resolve => { timer = setTimeout(resolve, 2000); })]);
  } finally { clearTimeout(timer); }
}

// SVG parsing, flow application, rasterization and H.264 work all run outside
// the visible page's renderer. Cancellation can terminate a stuck SVG/flow.
export async function exportAnimationVideo({ plan, storage, fileHandle, signal, onProgress = () => {}, onFrame }) {
  check(signal);
  const source = new VisualFrame(new URL('./animationEncode.html', import.meta.url).href,
    { mode: 'encode', width: plan.width, height: plan.height }, signal);
  let writable, preview, idleTimer, closed = false, failure;
  const resetTimeout = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => source.destroy(new Error('Video rendering did not respond for 60 seconds. Try a smaller frame size or a simpler flow.')), 60000);
  };
  const receive = async event => {
    if (event.source !== source.iframe.contentWindow || event.origin !== 'null' || event.data?.odyssey !== source.token) return;
    const data = event.data;
    if (closed || source.destroyed || signal?.aborted) { data.encodeFrame?.bitmap?.close(); return; }
    if (!data.encodeRequest && !data.encodeProgress && !data.encodeFrame) return;
    resetTimeout();
    try {
      if (data.encodeProgress) onProgress(data.encodeProgress);
      if (data.encodeFrame) {
        const { bitmap, ...metadata } = data.encodeFrame;
        try {
          if (onFrame) {
            preview ??= document.createElement('canvas');
            preview.width = bitmap.width; preview.height = bitmap.height;
            preview.getContext('2d').drawImage(bitmap, 0, 0);
            onFrame({ ...metadata, canvas: preview });
          }
        } finally { bitmap.close(); }
      }
      if (data.encodeRequest) {
        const request = data.encodeRequest;
        let result;
        try {
          check(signal);
          if (request.method === 'read') result = await storage.read(request.sessionId, request.file);
          else if (request.method === 'open') {
            if (!fileHandle || writable) throw new Error('Invalid video output request.');
            const opened = await fileHandle.createWritable();
            if (closed || source.destroyed || signal?.aborted) { await abortWriter(opened); check(signal); throw new Error('Video renderer closed.'); }
            writable = opened;
          } else if (request.method === 'write') {
            if (!writable) throw new Error('The video output is closed.');
            await writable.write(request.chunk);
          } else if (request.method === 'close') {
            if (!writable) throw new Error('The video output is closed.');
            await writable.close(); writable = null;
          } else if (request.method === 'abort') {
            const old = writable; writable = null; await abortWriter(old);
          } else throw new Error('Unknown video storage request.');
          check(signal);
          source.send({ encodeResponse: { id: request.id, result } });
        } catch (error) { source.send({ encodeResponse: { id: request.id, error: errorData(error) } }); }
      }
    } catch (error) { failure = error; source.destroy(error); }
  };
  window.addEventListener('message', receive);
  try {
    await source.deadline(30000, 'Loading video renderer', () => source.ready); check(signal);
    resetTimeout();
    const result = await source.call('encode', { plan, useFile: !!fileHandle, preview: !!onFrame });
    check(signal); if (failure) throw failure;
    return result;
  } catch (error) { check(signal); throw error; }
  finally {
    closed = true; clearTimeout(idleTimer); window.removeEventListener('message', receive); source.destroy();
    if (preview) preview.width = preview.height = 0;
    const old = writable; writable = null;
    await abortWriter(old);
  }
}
