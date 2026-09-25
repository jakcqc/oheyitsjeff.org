/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Snapshot of prebuiltAppConfig in @mlc-ai/web-llm@0.2.85, for a 4096-token
// context. Listing models does not import the runtime or download any weights.
// Values are estimates, not measurements of available GPU memory.
const MODEL_FAMILIES = [
  ['Qwen2.5-0.5B-Instruct', 'Qwen 2.5 0.5B · smallest', 944.62, 1060.2],
  ['Llama-3.2-1B-Instruct', 'Llama 3.2 1B', 879.04, 1128.82],
  ['Qwen2.5-1.5B-Instruct', 'Qwen 2.5 1.5B', 1629.75, 1888.97],
  ['Llama-3.2-3B-Instruct', 'Llama 3.2 3B', 2263.69, 2951.51],
  ['Qwen2.5-3B-Instruct', 'Qwen 2.5 3B', 2504.76, 2893.64],
  ['Qwen2.5-7B-Instruct', 'Qwen 2.5 7B · more capable', 5106.67, 5900.09],
];
const GPU_NOTE = 'Free GPU memory is not exposed. Model estimates include a 4096-token context; memory is reserved for the visual. Other apps and driver limits can still prevent a model from loading.';
const FALLBACK_BUDGET_MB = 4096;
const LOCAL_FAILURE = 'Local model failed. Try a smaller model, free GPU memory, or check WebGPU and the model download connection.';

function readMemoryHeap(info, heapProperties) {
  // memoryHeaps is an optional Chrome development extension, not standard
  // WebGPU. Never infer VRAM from system RAM or per-buffer allocation limits.
  // Use the largest device-local heap, rather than adding potentially aliased
  // host-visible/BAR heaps together. This reports capacity, never free memory.
  try {
    const deviceLocal = heapProperties?.DEVICE_LOCAL;
    if (!Number.isInteger(deviceLocal) || deviceLocal <= 0) return null;
    let largest = null;
    for (const heap of info.memoryHeaps || []) {
      const bytes = Number(heap.size);
      if (!(heap.properties & deviceLocal) || !Number.isSafeInteger(bytes) || bytes < 1024 * 1024) continue;
      if (!largest || bytes > largest.bytes) largest = { bytes, properties: heap.properties };
    }
    if (!largest) return null;
    return {
      capacityMB: Math.floor(largest.bytes / (1024 * 1024)),
      // HOST_VISIBLE alone can be resizable BAR on a discrete GPU; it does not
      // imply that the heap is shared system RAM.
      shared: info.type === 'integrated GPU',
    };
  } catch { return null; }
}

function abortError() {
  return new DOMException('Request cancelled.', 'AbortError');
}

function checkedContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('The model returned no usable response. No changes were applied.');
  }
  if (content.length > 65536) throw new Error('The model response was too large. Ask for fewer changes.');
  return content;
}

/** Runs inference in a local WebLLM worker after an explicit model load.
 * Optional constructor dependencies support offline GPU/lifecycle tests.
 */
export class LocalLLMClient {
  constructor({ navigatorObject, workerFactory, heapProperties = globalThis.GPUHeapProperty } = {}) {
    this._navigator = navigatorObject || globalThis.navigator;
    this._heapProperties = heapProperties;
    this._workerFactory = workerFactory || (() => new Worker(new URL('./llmWorker.js', import.meta.url), { type: 'module' }));
    this._worker = null;
    this._pending = new Map();
    this._nextId = 0;
    this._generation = 0;
    this._active = null;
    this._loadedModel = '';
    this._budgetMB = null;
  }

  get loadedModel() { return this._loadedModel; }
  get isLocalLoaded() { return Boolean(this._loadedModel && this._worker); }

  async getLocalModels({ budgetMB = null } = {}) {
    const override = budgetMB === null ? null : Number(budgetMB);
    if (override !== null && (!Number.isFinite(override) || override < 1024 || override > 196608)) {
      throw new Error('Choose a GPU memory budget between 1 and 192 GB.');
    }
    this._budgetMB = override;
    let adapter;
    try { adapter = await this._navigator?.gpu?.requestAdapter({ powerPreference: 'high-performance' }); }
    catch { /* WebGPU may exist but be blocked by browser or driver policy. */ }
    const info = adapter?.info || {};
    const memory = readMemoryHeap(info, this._heapProperties);
    const budget = Math.min(override ?? memory?.capacityMB ?? FALLBACK_BUDGET_MB, memory?.capacityMB ?? Infinity, 196608);
    const reservedMB = Math.min(budget, Math.max(1024, Math.ceil(budget * (memory?.shared ? 0.5 : 0.25))));
    const availableMB = Math.max(0, budget - reservedMB);
    const memorySource = override !== null ? 'manual' : memory ? 'detected' : 'fallback';
    const capacityNote = memory
      ? `Browser reports ${(memory.capacityMB / 1024).toFixed(1)} GB in its largest ${memory.shared ? 'shared GPU' : 'device-local GPU'} memory heap.`
      : 'This browser does not expose GPU memory capacity.';
    const budgetNote = override !== null
      ? `Using your ${(budget / 1024).toFixed(1)} GB budget${override > budget ? ', capped to the reported capacity' : ''}.`
      : memory ? 'Using the reported capacity automatically.'
        : 'Using a conservative 4 GB fallback budget, not a memory measurement. Adjust the budget if you know your GPU capacity.';
    const gpu = {
      supported: Boolean(adapter), label: 'WebGPU unavailable',
      note: [capacityNote, budgetNote, GPU_NOTE].join(' '), memorySource,
      capacityMB: memory?.capacityMB ?? null, sharedMemory: memory?.shared ?? null,
    };
    if (!adapter) return { models: [], gpu, budgetMB: budget, reservedMB, availableMB };
    gpu.label = info.description || [info.vendor, info.architecture].filter(Boolean).join(' ') || 'WebGPU adapter';
    const f16 = Boolean(adapter.features?.has('shader-f16'));
    // WebLLM requires at least the standard WebGPU storage-buffer allowance.
    // These limits are per buffer; they must never be presented as total VRAM.
    const bufferLimit = Math.min(adapter.limits?.maxStorageBufferBindingSize || 0, adapter.limits?.maxBufferSize || 0);
    const models = bufferLimit < 128 * 1024 * 1024 ? [] : MODEL_FAMILIES.map(([base, label, half, full]) => ({
      id: `${base}-q4f${f16 ? '16' : '32'}_1-MLC`,
      label,
      vramMB: Math.ceil(f16 ? half : full),
      contextTokens: 4096,
    })).filter(model => model.vramMB <= availableMB);
    if (!models.length && bufferLimit < 128 * 1024 * 1024) gpu.note = 'This adapter has insufficient WebGPU buffer limits. ' + gpu.note;
    return { models, gpu, budgetMB: budget, reservedMB, availableMB };
  }

  _stopWorker(reason = abortError()) {
    const worker = this._worker;
    this._worker = null;
    this._loadedModel = '';
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    for (const pending of this._pending.values()) pending.reject(reason);
    this._pending.clear();
  }

  cancel() {
    this._generation += 1;
    this._active?.abort();
    // A worker can be compiling, downloading, or blocked in GPU work. Terminate
    // it to stop all three promptly; a later load can reuse browser-cached weights.
    this._stopWorker();
  }

  async unloadLocal() {
    this.cancel();
  }

  _createWorker() {
    const worker = this._workerFactory();
    this._worker = worker;
    worker.onmessage = event => {
      if (this._worker !== worker) return;
      const { id, kind, result, progress, error } = event.data || {};
      const pending = this._pending.get(id);
      if (!pending) return;
      if (kind === 'progress') {
        try { pending.onProgress?.(progress); } catch { /* UI callbacks cannot break the worker protocol. */ }
        return;
      }
      this._pending.delete(id);
      if (error) {
        // Only fixed worker error codes cross the trust boundary, never raw errors.
        const failure = new Error(error === 'incomplete'
          ? 'The local model ran out of response tokens. Ask for fewer changes.'
          : LOCAL_FAILURE);
        if (error !== 'incomplete') this._stopWorker(failure);
        pending.reject(failure);
      } else pending.resolve(result);
    };
    worker.onerror = event => {
      event.preventDefault?.();
      if (this._worker === worker) this._stopWorker(new Error(LOCAL_FAILURE));
    };
    worker.onmessageerror = () => {
      if (this._worker === worker) this._stopWorker(new Error(LOCAL_FAILURE));
    };
  }

  _workerRequest(kind, payload, onProgress) {
    return new Promise((resolve, reject) => {
      if (!this._worker) { reject(new Error('Load a local model first.')); return; }
      const id = ++this._nextId;
      this._pending.set(id, { resolve, reject, onProgress });
      try { this._worker.postMessage({ id, kind, ...payload }); }
      catch { this._pending.delete(id); reject(new Error(LOCAL_FAILURE)); }
    });
  }

  async loadLocal(modelId, { onProgress } = {}) {
    this.cancel();
    const generation = this._generation;
    const { models, gpu } = await this.getLocalModels({ budgetMB: this._budgetMB });
    if (generation !== this._generation) throw abortError();
    if (!gpu.supported) throw new Error('Local models need WebGPU on HTTPS or localhost in a supported browser.');
    if (!models.some(model => model.id === modelId)) throw new Error('Choose a compatible model within your selected GPU budget.');
    try {
      this._createWorker();
      await this._workerRequest('load', { modelId }, onProgress);
      if (generation !== this._generation) throw abortError();
      this._loadedModel = modelId;
    } catch (error) {
      if (generation === this._generation) this._stopWorker();
      if (error.name === 'AbortError') throw error;
      throw new Error(LOCAL_FAILURE);
    }
  }

  async complete({ model, messages, schema, maxTokens = 768, signal } = {}) {
    if (signal?.aborted) throw abortError();
    if (this._active) throw new Error('Wait for the current request to finish or stop it first.');
    if (!Array.isArray(messages) || !messages.length || messages.some(message =>
      !message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) {
      throw new Error('Chat messages must contain text and supported roles.');
    }
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.type !== 'object') throw new Error('A structured response schema is required.');
    if (!Number.isInteger(maxTokens) || maxTokens < 64 || maxTokens > 4096) throw new Error('Choose an output limit between 64 and 4096 tokens.');
    if (!this.isLocalLoaded || (model !== undefined && model !== this._loadedModel)) throw new Error('Load the selected local model first.');
    const controller = new AbortController();
    this._active = controller;
    const onAbort = () => {
      controller.abort();
      this._stopWorker();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await this._workerRequest('complete', { messages, schema, maxTokens });
      if (controller.signal.aborted) throw abortError();
      return { content: checkedContent(result?.content), usage: result?.usage || null };
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (this._active === controller) this._active = null;
    }
  }
}
