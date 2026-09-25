/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { LocalLLMClient } from '../helper/llmLocal.js';

const schema = { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false };
const messages = [{ role: 'system', content: 'Use JSON.' }, { role: 'user', content: 'Make it blue.' }];
const content = '{"message":"Done"}';
const request = { messages, schema };
const tick = () => new Promise(resolve => setImmediate(resolve));

function navigatorGPU({ f16 = true, limit = 2 ** 30, info = {} } = {}) {
  return {
    deviceMemory: 128, // System RAM must not influence model eligibility.
    gpu: { requestAdapter: async () => ({
      info: { description: 'Test GPU', ...info }, features: new Set(f16 ? ['shader-f16'] : []),
      limits: { maxStorageBufferBindingSize: limit, maxBufferSize: limit },
    }) },
  };
}

class FakeWorker {
  messages = [];
  terminated = false;
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  reply(result, message = this.messages.at(-1)) { this.onmessage?.({ data: { id: message.id, result } }); }
}

function localClient() {
  const workers = [];
  const client = new LocalLLMClient({ navigatorObject: navigatorGPU(), workerFactory: () => {
    const worker = new FakeWorker(); workers.push(worker); return worker;
  } });
  return { client, workers };
}

test('model discovery reserves memory, probes capabilities, and downloads nothing', async () => {
  let workerCount = 0;
  const client = new LocalLLMClient({ navigatorObject: navigatorGPU(), workerFactory: () => workerCount++ });
  const result = await client.getLocalModels({ budgetMB: 4096 });
  assert.equal(result.reservedMB, 1024);
  assert.equal(result.availableMB, 3072);
  assert.equal(result.gpu.label, 'Test GPU');
  assert.ok(result.models.every(model => model.vramMB <= 3072 && model.id.includes('q4f16')));
  assert.ok(!result.models.some(model => model.id.includes('-7B-')));
  assert.ok((await client.getLocalModels({ budgetMB: 12288 })).models.some(model => model.id.includes('-7B-')));
  assert.equal(workerCount, 0);
  assert.equal(client.isLocalLoaded, false);
});

test('f32 fallback and unavailable GPU do not mistake RAM or buffer limits for VRAM', async () => {
  const fallback = new LocalLLMClient({ navigatorObject: navigatorGPU({ f16: false }) });
  const result = await fallback.getLocalModels();
  assert.ok(result.models.every(model => model.id.includes('q4f32')));
  assert.equal(result.budgetMB, 4096);
  assert.equal(result.gpu.capacityMB, null);
  assert.equal(result.gpu.memorySource, 'fallback');
  assert.match(result.gpu.note, /not a memory measurement/);
  const limited = new LocalLLMClient({ navigatorObject: navigatorGPU({ limit: 2 ** 26 }) });
  assert.deepEqual((await limited.getLocalModels()).models, []);
  const unavailable = new LocalLLMClient({ navigatorObject: { deviceMemory: 128 } });
  assert.equal((await unavailable.getLocalModels()).gpu.supported, false);
  await assert.rejects(unavailable.getLocalModels({ budgetMB: NaN }), /budget/);
});

test('automatic memory detection uses the largest device-local heap and reserves rendering space', async () => {
  const client = new LocalLLMClient({
    heapProperties: { DEVICE_LOCAL: 1, HOST_VISIBLE: 2 },
    navigatorObject: navigatorGPU({ info: { type: 'discrete GPU', memoryHeaps: [
      { size: 12 * 2 ** 30, properties: 1 },
      { size: 64 * 2 ** 30, properties: 2 }, // Host-only RAM is not VRAM.
      { size: 256 * 2 ** 20, properties: 3 }, // BAR mapping is not extra VRAM.
    ] } }),
  });
  const result = await client.getLocalModels();
  assert.equal(result.gpu.memorySource, 'detected');
  assert.equal(result.gpu.capacityMB, 12288);
  assert.equal(result.budgetMB, 12288);
  assert.equal(result.availableMB, 9216);
  assert.equal(result.reservedMB, 3072);
  assert.ok(result.models.some(model => model.id.includes('-7B-')));
  assert.match(result.gpu.note, /Free GPU memory is not exposed/);
  const smaller = await client.getLocalModels({ budgetMB: 4096 });
  assert.equal(smaller.gpu.memorySource, 'manual');
  assert.equal(smaller.availableMB, 3072);
  assert.ok(!smaller.models.some(model => model.id.includes('-7B-')));
  const capped = await client.getLocalModels({ budgetMB: 24576 });
  assert.equal(capped.budgetMB, 12288);
  assert.match(capped.gpu.note, /capped to the reported capacity/);
});

test('shared integrated memory gets a larger reserve while a visible discrete heap is not assumed shared', async () => {
  for (const [type, availableMB, shared] of [['integrated GPU', 4096, true], ['discrete GPU', 6144, false]]) {
    const client = new LocalLLMClient({
      heapProperties: { DEVICE_LOCAL: 1, HOST_VISIBLE: 2 },
      navigatorObject: navigatorGPU({ info: { type, memoryHeaps: [{ size: 8 * 2 ** 30, properties: 3 }] } }),
    });
    const result = await client.getLocalModels();
    assert.equal(result.availableMB, availableMB);
    assert.equal(result.gpu.sharedMemory, shared);
  }
});

test('unavailable, malformed, or inaccessible heap metadata uses an honest fallback', async () => {
  const inaccessible = {};
  Object.defineProperty(inaccessible, 'memoryHeaps', { enumerable: true, get: () => { throw new Error('unavailable'); } });
  for (const info of [
    {}, { memoryHeaps: [] },
    { memoryHeaps: [{ size: Infinity, properties: 1 }, { size: -1024, properties: 1 }] },
    { memoryHeaps: [{ size: 128 * 2 ** 30, properties: 2 }] }, inaccessible,
  ]) {
    const navigatorObject = navigatorGPU();
    const adapter = await navigatorObject.gpu.requestAdapter();
    adapter.info = info;
    navigatorObject.gpu.requestAdapter = async () => adapter;
    const client = new LocalLLMClient({ navigatorObject, heapProperties: { DEVICE_LOCAL: 1 } });
    const result = await client.getLocalModels();
    assert.equal(result.budgetMB, 4096);
    assert.equal(result.gpu.capacityMB, null);
    assert.equal(result.gpu.memorySource, 'fallback');
  }
});

test('loading a model rechecks automatic memory capacity before creating its worker', async () => {
  const info = { memoryHeaps: [{ size: 12 * 2 ** 30, properties: 1 }] };
  let workers = 0;
  const client = new LocalLLMClient({
    heapProperties: { DEVICE_LOCAL: 1 }, navigatorObject: navigatorGPU({ info }),
    workerFactory: () => { workers++; return new FakeWorker(); },
  });
  const largeModel = (await client.getLocalModels()).models.find(model => model.id.includes('-7B-'));
  info.memoryHeaps[0].size = 4 * 2 ** 30;
  await assert.rejects(client.loadLocal(largeModel.id), /compatible model/);
  assert.equal(workers, 0);
});

test('completion requires the selected model to be ready', async () => {
  const { client, workers } = localClient();
  await assert.rejects(client.complete(request), /Load the selected local model/);
  const model = (await client.getLocalModels()).models[0].id;
  const loaded = client.loadLocal(model);
  await tick();
  await assert.rejects(client.complete(request), /Load the selected local model/);
  workers[0].reply({ loaded: true });
  await loaded;
  await assert.rejects(client.complete({ ...request, model: 'a-different-model' }), /Load the selected local model/);
  assert.equal(workers[0].messages.length, 1);
  await client.unloadLocal();
  await assert.rejects(client.complete(request), /Load the selected local model/);
});

test('invalid messages, response schemas, and output limits fail before generation', async () => {
  const { client, workers } = localClient();
  const model = (await client.getLocalModels()).models[0].id;
  const loaded = client.loadLocal(model);
  await tick();
  workers[0].reply({ loaded: true });
  await loaded;
  for (const invalid of [undefined, [], [null], [{ role: 'tool', content: 'bad' }], [{ role: 'user', content: {} }]]) {
    await assert.rejects(client.complete({ ...request, messages: invalid }), /Chat messages/);
  }
  for (const invalid of [undefined, {}, [], { type: 'string' }]) {
    await assert.rejects(client.complete({ ...request, schema: invalid }), /structured response schema/);
  }
  for (const invalid of [63, 4097, 768.5, NaN]) {
    await assert.rejects(client.complete({ ...request, maxTokens: invalid }), /output limit/);
  }
  assert.equal(workers[0].messages.length, 1);
  await client.unloadLocal();
});

test('cancelling load before adapter resolves prevents a late worker creation', async () => {
  let resolveAdapter;
  let workerCount = 0;
  const client = new LocalLLMClient({
    navigatorObject: { gpu: { requestAdapter: () => new Promise(resolve => { resolveAdapter = resolve; }) } },
    workerFactory: () => { workerCount++; return new FakeWorker(); },
  });
  const pending = client.loadLocal('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  client.cancel();
  resolveAdapter(await navigatorGPU().gpu.requestAdapter());
  await rejected;
  assert.equal(workerCount, 0);
  assert.equal(client.isLocalLoaded, false);
});

test('worker load progress, completion and unload use one worker and release it', async () => {
  const { client, workers } = localClient();
  const model = (await client.getLocalModels()).models[0].id;
  let progress;
  const loaded = client.loadLocal(model, { onProgress: value => { progress = value; } });
  await tick();
  const worker = workers[0];
  worker.onmessage({ data: { id: worker.messages[0].id, kind: 'progress', progress: { progress: 0.5 } } });
  assert.equal(progress.progress, 0.5);
  worker.reply({ loaded: true });
  await loaded;
  assert.equal(client.loadedModel, model);
  const pending = client.complete({ model, messages, schema });
  assert.equal(worker.messages[1].kind, 'complete');
  assert.deepEqual(worker.messages[1].schema, schema);
  worker.reply({ content, usage: { inputTokens: 30, outputTokens: 8 } });
  assert.equal((await pending).content, content);
  await client.unloadLocal();
  assert.equal(worker.terminated, true);
  assert.equal(client.isLocalLoaded, false);
});

test('concurrent and pre-cancelled requests never start another generation', async () => {
  const { client, workers } = localClient();
  const model = (await client.getLocalModels()).models[0].id;
  const loaded = client.loadLocal(model);
  await tick();
  workers[0].reply({ loaded: true });
  await loaded;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.complete({ ...request, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(workers[0].messages.length, 1);
  assert.equal(client.isLocalLoaded, true);
  const pending = client.complete(request);
  await assert.rejects(client.complete(request), /current request/);
  assert.equal(workers[0].messages.length, 2);
  workers[0].reply({ content });
  assert.deepEqual(await pending, { content, usage: null });
  await client.unloadLocal();
});

test('cancel and unload reject a completion even after the worker has just replied', async () => {
  for (const action of ['cancel', 'unloadLocal']) {
    const { client, workers } = localClient();
    const model = (await client.getLocalModels()).models[0].id;
    const loaded = client.loadLocal(model);
    await tick();
    workers[0].reply({ loaded: true });
    await loaded;
    const pending = client.complete(request);
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    workers[0].reply({ content });
    client[action]();
    await rejected;
    assert.equal(workers[0].terminated, true);
    assert.equal(client.isLocalLoaded, false);
  }
});

test('empty and excessive model output cannot become an executable proposal', async () => {
  const { client, workers } = localClient();
  const model = (await client.getLocalModels()).models[0].id;
  const loaded = client.loadLocal(model);
  await tick();
  workers[0].reply({ loaded: true });
  await loaded;
  for (const invalid of [undefined, '', '  ', 'x'.repeat(65537)]) {
    const pending = client.complete(request);
    const rejected = assert.rejects(pending, /usable response|too large/);
    workers[0].reply({ content: invalid });
    await rejected;
  }
  const pending = client.complete(request);
  workers[0].reply({ content });
  assert.equal((await pending).content, content);
  await client.unloadLocal();
});

test('cancelled worker downloads and generation reject promptly and cannot restore model state', async () => {
  const { client, workers } = localClient();
  const model = (await client.getLocalModels()).models[0].id;
  let pending = client.loadLocal(model);
  let rejected = assert.rejects(pending, { name: 'AbortError' });
  await tick();
  const staleCallback = workers[0].onmessage;
  client.cancel();
  await rejected;
  assert.equal(workers[0].terminated, true);
  staleCallback({ data: { id: workers[0].messages[0].id, result: { loaded: true } } });
  assert.equal(client.isLocalLoaded, false);
  const loaded = client.loadLocal(model);
  await tick();
  workers[1].reply({ loaded: true });
  await loaded;
  const controller = new AbortController();
  pending = client.complete({ model, messages, schema, signal: controller.signal });
  rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await rejected;
  assert.equal(workers[1].terminated, true);
  assert.equal(client.isLocalLoaded, false);
});

test('fatal worker failures clear loaded state while incomplete output permits another request', async () => {
  const { client, workers } = localClient();
  const model = (await client.getLocalModels()).models[0].id;
  const loaded = client.loadLocal(model);
  await tick();
  workers[0].reply({ loaded: true });
  await loaded;
  let pending = client.complete({ model, messages, schema });
  let rejected = assert.rejects(pending, /response tokens/);
  workers[0].onmessage({ data: { id: workers[0].messages.at(-1).id, error: 'incomplete' } });
  await rejected;
  assert.equal(client.isLocalLoaded, true);
  pending = client.complete({ model, messages, schema });
  rejected = assert.rejects(pending, /Local model failed/);
  workers[0].onmessage({ data: { id: workers[0].messages.at(-1).id, error: 'failed' } });
  await rejected;
  assert.equal(workers[0].terminated, true);
  assert.equal(client.isLocalLoaded, false);
});

test('replacing a pending load cannot unload the newer worker when the old load rejects', async () => {
  const { client, workers } = localClient();
  const models = (await client.getLocalModels()).models;
  const first = client.loadLocal(models[0].id);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await tick();
  const second = client.loadLocal(models[1].id);
  await rejected;
  await tick();
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[1].terminated, false);
  workers[1].reply({ loaded: true });
  await second;
  assert.equal(client.loadedModel, models[1].id);
  await client.unloadLocal();
});

test('local worker supplies the schema as model instructions and grammar without mutating messages', async () => {
  const replies = [];
  const completions = [];
  const loads = [];
  class StubEngine {
    async reload(model, options) { loads.push({ model, options }); }
    chat = { completions: { create: async request => {
      completions.push(request);
      return { choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 50, completion_tokens: 8 } };
    } } };
  }
  const workerSelf = { postMessage: value => replies.push(value) };
  const source = await readFile(new URL('../helper/llmWorker.js', import.meta.url), 'utf8');
  // Substitute only the external module loader. Execute the real worker message
  // handler against a stub engine; no model download or WebGPU is required.
  vm.runInNewContext(source.replace('import(WEBLLM_URL)', 'loadWebLLM(WEBLLM_URL)'), {
    self: workerSelf,
    loadWebLLM: async url => {
      assert.equal(url, 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm');
      return { MLCEngine: StubEngine, prebuiltAppConfig: { model_list: [{ model_id: 'test-model' }] } };
    },
  });
  await workerSelf.onmessage({ data: { id: 1, kind: 'load', modelId: 'test-model' } });
  assert.equal(loads[0].options.context_window_size, 4096);
  for (const original of [messages, [{ role: 'user', content: 'Make it blue.' }]]) {
    const before = structuredClone(original);
    await workerSelf.onmessage({ data: { id: 2, kind: 'complete', messages: original, schema, maxTokens: 768 } });
    const sent = completions.at(-1);
    assert.equal(sent.messages[0].role, 'system');
    assert.ok(sent.messages[0].content.includes(JSON.stringify(schema)));
    assert.equal(sent.response_format.schema, JSON.stringify(schema));
    assert.equal(sent.messages.at(-1).content, 'Make it blue.');
    assert.deepEqual(original, before);
    assert.equal(replies.at(-1).result.content, content);
  }
  assert.ok(completions[0].messages[0].content.startsWith('Use JSON.\n'));
});
