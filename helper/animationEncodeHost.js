/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { exportVideo } from '../TheOdyssey/video-export.js';

// Runs only inside VisualFrame's opaque, separately verified renderer process.
// The parent owns private storage; this process receives one SVG at a time.
const request = globalThis.__ODYSSEY_REQUEST__;
if (request?.mode === 'encode' && parent !== window) {
  const origin = globalThis.__ODYSSEY_HOST_ORIGIN__, token = request.odyssey;
  const send = (value, transfer = []) => parent.postMessage({ odyssey: token, ...value }, origin, transfer);
  const pending = new Map();
  let serial = 0, active = false, preview;
  function remote(method, value = {}, transfer = []) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ encodeRequest: { id, method, ...value } }, transfer);
    });
  }
  window.addEventListener('message', async event => {
    if (event.source !== parent || event.origin !== origin || event.data?.odyssey !== token) return;
    const data = event.data;
    if (data.encodeResponse) {
      const { id, result, error } = data.encodeResponse, entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (error) { const failure = new Error(error.message); failure.name = error.name; entry.reject(failure); }
      else entry.resolve(result);
      return;
    }
    if (data.command !== 'encode') return;
    if (active) { send({ id: data.id, error: 'An MP4 is already rendering.' }); return; }
    active = true;
    try {
      const result = await exportVideo({ plan: data.value.plan,
        storage: { read: (sessionId, file) => remote('read', { sessionId, file }) },
        fileHandle: data.value.useFile ? { createWritable: async () => {
          await remote('open');
          return {
            write: chunk => {
              // Transfer an owned copy; the muxer may retain its chunk buffer.
              const bytes = chunk.data instanceof Uint8Array ? chunk.data : new Uint8Array(chunk.data);
              const owned = bytes.slice();
              return remote('write', { chunk: { ...chunk, data: owned } }, [owned.buffer]);
            },
            close: () => remote('close'), abort: () => remote('abort'),
          };
        } } : null,
        onProgress: value => send({ encodeProgress: value }),
        onFrame: value => {
          if (!data.value.preview) return;
          const scale = Math.min(1, 960 / value.width, 540 / value.height);
          preview ??= new OffscreenCanvas(1, 1);
          preview.width = Math.max(1, Math.round(value.width * scale));
          preview.height = Math.max(1, Math.round(value.height * scale));
          preview.getContext('2d').drawImage(value.canvas, 0, 0, preview.width, preview.height);
          const bitmap = preview.transferToImageBitmap();
          const { canvas, ...metadata } = value;
          send({ encodeFrame: { ...metadata, bitmap } }, [bitmap]);
        },
      });
      send({ id: data.id, result });
    } catch (error) {
      send({ id: data.id, error: error.message || String(error) });
    } finally { active = false; if (preview) preview.width = preview.height = 1; }
  });
  send({ ready: true });
}
