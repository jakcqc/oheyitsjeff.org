/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// node --test tests/animation-encode.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../helper/animationEncode.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
  .replaceAll('import.meta.url', "'https://visual.test/helper/animationEncode.js'");
const plan = { width: 320, height: 240 };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture(scenario) {
  const listeners = new Set(), timeouts = [], stats = { destroyed: 0 };
  class VisualFrame {
    constructor(url, request, signal) {
      this.iframe = { contentWindow: {} }; this.token = 'test-token'; this.ready = Promise.resolve();
      this.pending = new Map(); this.serial = 0; this.end = deferred(); this.end.promise.catch(() => {});
      this.abort = () => this.destroy(new Error('Search stopped.'));
      this.signal = signal; signal?.addEventListener('abort', this.abort);
    }
    deadline(ms, label, operation) { return operation(); }
    call() { return Promise.race([scenario(this), this.end.promise]); }
    request(method, value = {}) {
      const id = ++this.serial, response = deferred(); this.pending.set(id, response);
      this.emit({ encodeRequest: { id, method, ...value } }); return response.promise;
    }
    emit(value) {
      for (const listener of listeners) Promise.resolve(listener({ source: this.iframe.contentWindow, origin: 'null',
        data: { odyssey: this.token, ...value } })).catch(error => this.destroy(error));
    }
    send({ encodeResponse }) {
      if (this.destroyed || !encodeResponse) return;
      const response = this.pending.get(encodeResponse.id);
      if (encodeResponse.error) response.reject(new Error(encodeResponse.error.message));
      else response.resolve(encodeResponse.result);
    }
    destroy(error = new Error('Closed')) {
      if (this.destroyed) return;
      this.destroyed = true; stats.destroyed++;
      this.signal?.removeEventListener('abort', this.abort); this.end.reject(error);
    }
  }
  const context = { VisualFrame, URL, DOMException,
    window: { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) },
    setTimeout(fn, ms) { timeouts.push(ms); return setTimeout(fn, ms === 2000 ? 10 : ms); }, clearTimeout,
  };
  const api = vm.runInNewContext(source + '\n({exportAnimationVideo})', context);
  return { ...api, stats, listeners, timeouts };
}

test('isolated encoding streams multiple output chunks, reads SVGs and commits only after completion', async () => {
  const writes = [], reads = [];
  let closed = 0, aborted = 0;
  const runner = fixture(async remote => {
    const blob = await remote.request('read', { sessionId: 'animation', file: '0.svg' });
    assert.equal(await blob.text(), '<svg/>');
    await remote.request('open');
    for (let index = 0; index < 3; index++) await remote.request('write', { chunk: {
      type: 'write', position: index * 1024 * 1024, data: new Uint8Array(1024 * 1024).fill(index),
    } });
    await remote.request('close');
    return { frames: 24, duration: 1 };
  });
  const result = await runner.exportAnimationVideo({ plan,
    storage: { read: async (...args) => { reads.push(args); return new Blob(['<svg/>']); } },
    fileHandle: { createWritable: async () => ({ write: async value => writes.push(value),
      close: async () => { closed++; }, abort: async () => { aborted++; } }) },
  });
  assert.equal(result.frames, 24); assert.equal(writes.length, 3);
  assert.deepEqual(reads, [['animation', '0.svg']]);
  assert.equal(writes[2].position, 2 * 1024 * 1024); assert.equal(writes[2].data.at(-1), 2);
  assert.equal(closed, 1); assert.equal(aborted, 0); assert.equal(runner.stats.destroyed, 1); assert.equal(runner.listeners.size, 0);
});

test('cancel during a delayed output open returns promptly and aborts the writer when it arrives', async () => {
  const controller = new AbortController(), opening = deferred(), handle = deferred();
  let aborted = 0;
  const runner = fixture(async remote => { await remote.request('open'); return {}; });
  const pending = runner.exportAnimationVideo({ plan, signal: controller.signal,
    fileHandle: { createWritable: () => { opening.resolve(); return handle.promise; } } });
  await opening.promise; controller.abort();
  await assert.rejects(() => pending, error => error.name === 'AbortError');
  assert.equal(runner.stats.destroyed, 1);
  handle.resolve({ abort: async () => { aborted++; } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(aborted, 1); assert.equal(runner.listeners.size, 0);
});

test('cancel while output cleanup is stuck has a bounded two-second cleanup budget', async () => {
  const controller = new AbortController(), writing = deferred();
  let aborted = 0;
  const runner = fixture(async remote => {
    await remote.request('open'); await remote.request('write', { chunk: {} }); return {};
  });
  const pending = runner.exportAnimationVideo({ plan, signal: controller.signal,
    fileHandle: { createWritable: async () => ({ write: () => { writing.resolve(); return new Promise(() => {}); },
      abort: () => { aborted++; return new Promise(() => {}); } }) } });
  await writing.promise; controller.abort();
  await assert.rejects(() => pending, error => error.name === 'AbortError');
  assert.equal(aborted, 1); assert(runner.timeouts.includes(2000)); assert.equal(runner.listeners.size, 0);
});

test('preview callback failures close transferred bitmaps and terminate the isolated renderer', async () => {
  let closed = 0;
  const runner = fixture(async remote => {
    remote.emit({ encodeFrame: { bitmap: { width: 320, height: 240, close: () => { closed++; } } } });
    return new Promise(() => {});
  });
  await assert.rejects(() => runner.exportAnimationVideo({ plan, onFrame: () => { throw new Error('Preview failed'); } }), /Preview failed/);
  assert.equal(closed, 1); assert.equal(runner.stats.destroyed, 1); assert.equal(runner.listeners.size, 0);
});
