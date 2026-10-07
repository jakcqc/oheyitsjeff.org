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
import {
  LOCAL_MODELS, MODEL_CONTEXT_TOKENS, MAX_MODEL_VRAM_MB, WEBLLM_URL, WEBLLM_VERSION,
  formatQuantization, isModelWithinBudget, recommendLocalModel, recommendModelVariant,
} from '../helper/llmModels.js';

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

test('model estimates must fit the 30 GB cap and the available GPU memory', () => {
  assert.equal(MAX_MODEL_VRAM_MB, 30 * 1024);
  assert.equal(MODEL_CONTEXT_TOKENS, 4096);
  assert.equal(WEBLLM_VERSION, '0.2.85');
  assert.equal(WEBLLM_URL, `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/+esm`);
  assert.equal(isModelWithinBudget(MAX_MODEL_VRAM_MB), true);
  assert.equal(isModelWithinBudget(MAX_MODEL_VRAM_MB, MAX_MODEL_VRAM_MB), true);
  assert.equal(isModelWithinBudget(MAX_MODEL_VRAM_MB + 0.01), false);
  assert.equal(isModelWithinBudget(2048, 2048), true);
  assert.equal(isModelWithinBudget(2048, 2047), false);
  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, 0, -1, '2048', {}, []]) {
    assert.equal(isModelWithinBudget(invalid), false, `Invalid memory estimate: ${String(invalid)}`);
  }
  assert.ok(LOCAL_MODELS.length > 12);
  assert.equal(new Set(LOCAL_MODELS.map(model => model.id)).size, LOCAL_MODELS.length);
  assert.ok(LOCAL_MODELS.every(model => isModelWithinBudget(model.vramMB)));
  for (const model of LOCAL_MODELS) {
    assert.ok(model.familyId && model.id === `${model.familyId}-${model.quantization}-MLC`);
    assert.ok([4, 16, 32].includes(model.weightBits));
    assert.ok([16, 32].includes(model.precision));
    assert.equal(model.contextTokens, MODEL_CONTEXT_TOKENS);
    assert.equal(model.requiredFeatures.includes('shader-f16'), model.precision === 16);
    assert.ok(Number.isInteger(model.requiredBufferBytes) && model.requiredBufferBytes > 0);
    assert.match(formatQuantization(model), new RegExp(String(model.weightBits)));
  }
});

test('catalog quantizations represent distinct published formats and memory footprints', () => {
  const family = LOCAL_MODELS.filter(model => model.familyId === 'Qwen3-0.6B');
  assert.deepEqual(family.map(model => model.quantization).sort(), ['q0f16', 'q0f32', 'q4f16_1', 'q4f32_1']);
  const get = quantization => family.find(model => model.quantization === quantization);
  assert.equal(get('q4f16_1').weightBits, 4);
  assert.equal(get('q4f32_1').weightBits, 4);
  assert.equal(get('q0f16').weightBits, 16);
  assert.equal(get('q0f32').weightBits, 32);
  assert.ok(get('q0f16').vramMB > get('q4f16_1').vramMB);
  assert.ok(get('q0f32').vramMB > get('q0f16').vramMB);
  assert.ok(get('q0f32').requiredBufferBytes > get('q4f16_1').requiredBufferBytes);
  assert.equal(LOCAL_MODELS.filter(model => model.quantization.startsWith('q0')).length, 11);
});

test('small full-precision models remain available on GPUs with limited buffers', async () => {
  const client = new LocalLLMClient({ navigatorObject: navigatorGPU({ f16: false, limit: 128 * 2 ** 20 }) });
  const result = await client.getLocalModels({ budgetMB: 4096 });
  const tiny = result.models.find(model => model.id === 'SmolLM2-135M-Instruct-q0f32-MLC');
  assert.equal(tiny?.weightBits, 32);
  assert.equal(tiny?.vramMB, 720);
  assert.ok(!result.models.some(model => model.id === 'SmolLM2-360M-Instruct-q0f32-MLC'));
  assert.match(result.variants.find(model => model.id === 'SmolLM2-360M-Instruct-q0f32-MLC').unavailableReason, /buffer/);
  assert.ok(!LOCAL_MODELS.some(model => model.familyId === 'SmolLM2-135M-Instruct' && model.weightBits === 4));
});

test('variant recommendation favors compact weights independent of catalog order', () => {
  const variants = LOCAL_MODELS.filter(model => model.familyId === 'Qwen3-0.6B').reverse();
  assert.equal(recommendModelVariant(variants)?.id, 'Qwen3-0.6B-q4f16_1-MLC');
  assert.equal(recommendModelVariant(variants.filter(model => model.precision === 32))?.id, 'Qwen3-0.6B-q4f32_1-MLC');
  assert.equal(recommendModelVariant(variants.filter(model => model.weightBits !== 4))?.id, 'Qwen3-0.6B-q0f16-MLC');
  assert.equal(recommendModelVariant([]), undefined);
});

test('model discovery reserves memory, probes capabilities, and downloads nothing', async () => {
  let workerCount = 0;
  const client = new LocalLLMClient({ navigatorObject: navigatorGPU(), workerFactory: () => workerCount++ });
  const result = await client.getLocalModels({ budgetMB: 4096 });
  assert.equal(result.reservedMB, 1024);
  assert.equal(result.availableMB, 3072);
  assert.equal(result.gpu.label, 'Test GPU');
  assert.ok(result.models.every(model => model.vramMB <= 3072));
  assert.ok(result.models.some(model => model.quantization === 'q4f16_1'));
  assert.ok(result.models.some(model => model.quantization === 'q4f32_1'));
  assert.equal(result.variants.length, LOCAL_MODELS.length);
  assert.deepEqual(result.variants.filter(model => model.compatible).map(model => model.id), result.models.map(model => model.id));
  assert.ok(result.variants.filter(model => !model.compatible).every(model => typeof model.unavailableReason === 'string' && model.unavailableReason.length > 0));
  assert.ok(result.models.some(model => model.id.startsWith('Qwen3.5-2B-')));
  assert.equal(recommendLocalModel(result.models)?.id, 'Qwen3.5-2B-q4f16_1-MLC');
  assert.ok(!result.models.some(model => model.id.includes('-7B-')));
  assert.ok((await client.getLocalModels({ budgetMB: 12288 })).models.some(model => model.id.includes('-7B-')));
  assert.equal(workerCount, 0);
  assert.equal(client.isLocalLoaded, false);
});

test('recommendations use modern models that fit the GPU budget', async () => {
  const client = new LocalLLMClient({ navigatorObject: navigatorGPU() });
  const larger = await client.getLocalModels({ budgetMB: 12288 });
  assert.equal(recommendLocalModel(larger.models)?.id, 'Qwen3.5-4B-q4f16_1-MLC');
  const withoutLarger = larger.models.filter(model => !/^Qwen3\.5-(?:2|4)B-/.test(model.id));
  assert.equal(recommendLocalModel(withoutLarger)?.id, 'Qwen3.5-0.8B-q4f16_1-MLC');
  const withoutQwen35 = larger.models.filter(model => !model.id.startsWith('Qwen3.5-'));
  assert.ok(recommendLocalModel(withoutQwen35)?.id.startsWith('Qwen3-'));
  assert.equal(recommendLocalModel([]), undefined);
});

test('a 192 GB GPU still discovers only models at or below the 30 GB cap', async () => {
  const client = new LocalLLMClient({
    heapProperties: { DEVICE_LOCAL: 1 },
    navigatorObject: navigatorGPU({ info: {
      type: 'discrete GPU', memoryHeaps: [{ size: 192 * 2 ** 30, properties: 1 }],
    } }),
  });
  const result = await client.getLocalModels();
  assert.equal(result.budgetMB, 192 * 1024);
  assert.equal(result.availableMB, 30 * 1024);
  assert.equal(result.reservedMB, 48 * 1024);
  assert.ok(result.models.length > 6);
  assert.ok(result.models.every(model => model.vramMB <= 30 * 1024));
  assert.ok(result.models.some(model => model.id.startsWith('Qwen3.5-9B-')));
});

test('model discovery checks each model tensor buffer against the adapter limits', async () => {
  const discover = async limitMB => {
    const client = new LocalLLMClient({ navigatorObject: navigatorGPU({ limit: limitMB * 2 ** 20 }) });
    return (await client.getLocalModels({ budgetMB: 196608 })).models;
  };
  const standard = await discover(128);
  assert.ok(standard.some(model => model.id.startsWith('Qwen3.5-0.8B-')));
  assert.ok(standard.some(model => model.id.startsWith('Qwen3-0.6B-')));
  assert.ok(!standard.some(model => /^Qwen3\.5-(?:2|4|9)B-/.test(model.id)));
  const medium = await discover(256);
  assert.ok(medium.some(model => model.id.startsWith('Qwen3.5-2B-')));
  assert.ok(!medium.some(model => /^Qwen3\.5-(?:4|9)B-/.test(model.id) || model.id.startsWith('Phi-4-mini-')));
  const large = await discover(512);
  assert.deepEqual(large.map(model => model.id), LOCAL_MODELS.filter(model => model.requiredBufferBytes <= 512 * 2 ** 20).map(model => model.id));
});

test('GPU buffer limits reject the larger tensor of an unquantized variant independently', async () => {
  const client = new LocalLLMClient({ navigatorObject: navigatorGPU({ limit: 128 * 2 ** 20 }) });
  const result = await client.getLocalModels({ budgetMB: 196608 });
  assert.ok(result.models.some(model => model.id === 'Qwen3-0.6B-q4f16_1-MLC'));
  const fullPrecision = result.variants.find(model => model.id === 'Qwen3-0.6B-q0f32-MLC');
  assert.ok(fullPrecision.vramMB < result.availableMB);
  assert.equal(fullPrecision.compatible, false);
  assert.match(fullPrecision.unavailableReason, /buffer/i);
  assert.ok(!result.models.some(model => model.id === fullPrecision.id));
});

test('f32 fallback and unavailable GPU do not mistake RAM or buffer limits for VRAM', async () => {
  const fallback = new LocalLLMClient({ navigatorObject: navigatorGPU({ f16: false }) });
  const result = await fallback.getLocalModels();
  assert.ok(result.models.every(model => model.precision === 32));
  assert.ok(result.variants.filter(model => model.precision === 16).every(model => !model.compatible && /fp?16|16.bit/i.test(model.unavailableReason)));
  assert.equal(result.budgetMB, 4096);
  assert.equal(result.gpu.capacityMB, null);
  assert.equal(result.gpu.memorySource, 'fallback');
  assert.match(result.gpu.note, /not a memory measurement/);
  assert.equal(recommendLocalModel(result.models)?.id, 'Qwen3.5-2B-q4f32_1-MLC');
  const largeFallback = await fallback.getLocalModels({ budgetMB: 196608 });
  assert.ok(largeFallback.models.every(model => model.precision === 32));
  assert.ok(largeFallback.models.some(model => model.quantization === 'q0f32'));
  assert.ok(largeFallback.models.some(model => model.id.startsWith('Qwen3.5-')));
  assert.ok(largeFallback.models.some(model => model.id.startsWith('Qwen3-')));
  assert.ok(largeFallback.models.some(model => /Phi-?4-mini/i.test(model.id)));
  assert.ok(largeFallback.models.some(model => /Ministral/i.test(model.id)));
  assert.ok(largeFallback.models.every(model => LOCAL_MODELS.some(record => record.id === model.id)));
  const limited = new LocalLLMClient({ navigatorObject: navigatorGPU({ limit: 2 ** 26 }) });
  assert.deepEqual((await limited.getLocalModels()).models, []);
  const unavailable = new LocalLLMClient({ navigatorObject: { deviceMemory: 128 } });
  const missingGPU = await unavailable.getLocalModels();
  assert.equal(missingGPU.gpu.supported, false);
  assert.deepEqual(missingGPU.models, []);
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

test('an unquantized model cannot load when only its 4-bit variant fits the GPU budget', async () => {
  let workers = 0;
  const client = new LocalLLMClient({ navigatorObject: navigatorGPU(), workerFactory: () => { workers++; return new FakeWorker(); } });
  const result = await client.getLocalModels({ budgetMB: 4096 });
  const fullPrecision = result.variants.find(model => model.id === 'Qwen3-0.6B-q0f32-MLC');
  assert.ok(result.models.some(model => model.id === 'Qwen3-0.6B-q4f16_1-MLC'));
  assert.equal(fullPrecision.compatible, false);
  assert.ok(fullPrecision.vramMB > result.availableMB);
  await assert.rejects(client.loadLocal(fullPrecision.id), /compatible model/);
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

test('completion streams tokens before settling and ignores callback failures and stale chunks', async () => {
  const { client, workers } = localClient();
  const model = (await client.getLocalModels()).models[0].id;
  const loaded = client.loadLocal(model);
  await tick();
  const worker = workers[0];
  worker.reply({ loaded: true });
  await loaded;
  const tokens = [];
  let settled = false;
  const pending = client.complete({ ...request, onToken: delta => {
    tokens.push(delta);
    if (tokens.length === 1) throw new Error('Display callback failed');
  } });
  pending.then(() => { settled = true; });
  const { id } = worker.messages.at(-1);
  const token = delta => worker.onmessage({ data: { id, kind: 'token', delta } });
  token('{"message":');
  await tick();
  assert.equal(settled, false);
  assert.deepEqual(tokens, ['{"message":']);
  token(null);
  token('');
  token('"Done"}');
  assert.equal(settled, false);
  worker.reply({ content, usage: { inputTokens: 30, outputTokens: 8 } });
  assert.deepEqual(await pending, { content, usage: { inputTokens: 30, outputTokens: 8 } });
  assert.equal(tokens.join(''), content);
  token('stale after completion');
  assert.equal(tokens.join(''), content);
  await client.unloadLocal();
});

test('aborting a streamed completion ignores late tokens and final replies from its worker', async () => {
  const { client, workers } = localClient();
  const model = (await client.getLocalModels()).models[0].id;
  const loaded = client.loadLocal(model);
  await tick();
  workers[0].reply({ loaded: true });
  await loaded;
  const tokens = [];
  const controller = new AbortController();
  const pending = client.complete({ ...request, signal: controller.signal, onToken: delta => tokens.push(delta) });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  const staleCallback = workers[0].onmessage;
  const { id } = workers[0].messages.at(-1);
  staleCallback({ data: { id, kind: 'token', delta: '{"message":' } });
  controller.abort();
  await rejected;
  staleCallback({ data: { id, kind: 'token', delta: '"Done"}' } });
  staleCallback({ data: { id, result: { content } } });
  assert.deepEqual(tokens, ['{"message":']);
  assert.equal(client.isLocalLoaded, false);
  assert.equal(workers[0].terminated, true);
});

test('streamed output is bounded before a display callback receives excessive text', async () => {
  const { client, workers } = localClient();
  const model = (await client.getLocalModels()).models[0].id;
  const loaded = client.loadLocal(model);
  await tick();
  workers[0].reply({ loaded: true });
  await loaded;
  const tokens = [];
  const pending = client.complete({ ...request, onToken: delta => tokens.push(delta) });
  const rejected = assert.rejects(pending, /too large/);
  const { id } = workers[0].messages.at(-1);
  workers[0].onmessage({ data: { id, kind: 'token', delta: 'x'.repeat(65537) } });
  await rejected;
  assert.deepEqual(tokens, []);
  assert.equal(workers[0].terminated, true);
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
  rejected = assert.rejects(pending, /invalid structured response/);
  workers[0].onmessage({ data: { id: workers[0].messages.at(-1).id, error: 'invalid' } });
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

async function workerHarness({ modelId = 'test-model', vramMB = 2048, recordOverrides = {} } = {}) {
  const replies = [];
  const completions = [];
  const loads = [];
  const engineOptions = [];
  let responseContent = content;
  let streamChunks = null;
  class StubEngine {
    constructor(options) { engineOptions.push(options); }
    async reload(model, options) { loads.push({ model, options }); }
    chat = { completions: { create: async request => {
      completions.push(request);
      const chunks = streamChunks || [
        { choices: [{ delta: { content: responseContent }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
        { choices: [], usage: { prompt_tokens: 50, completion_tokens: 8 } },
      ];
      return (async function* () {
        for (const chunk of chunks) {
          if (typeof chunk === 'function') await chunk();
          else yield chunk;
        }
      })();
    } } };
  }
  const workerSelf = { postMessage: value => replies.push(value) };
  const source = await readFile(new URL('../helper/llmWorker.js', import.meta.url), 'utf8');
  // Inject the real catalog helpers and substitute the external runtime loader.
  // Execute the worker's message handler without downloading models or using GPU.
  const executable = source
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/llmModels\.js['"];?/, '')
    .replace('import(WEBLLM_URL)', 'loadWebLLM(WEBLLM_URL)');
  vm.runInNewContext(executable, {
    self: workerSelf,
    WEBLLM_URL, MODEL_CONTEXT_TOKENS, isModelWithinBudget,
    loadWebLLM: async url => {
      assert.equal(url, WEBLLM_URL);
      return { MLCEngine: StubEngine, prebuiltAppConfig: { model_list: [
        { model_id: modelId, vram_required_MB: vramMB, ...recordOverrides },
      ] } };
    },
  });
  return {
    replies, completions, loads, engineOptions,
    send: data => workerSelf.onmessage({ data }),
    setContent: value => { responseContent = value; streamChunks = null; },
    setStream: value => { streamChunks = value; },
  };
}

test('local worker supplies the schema as model instructions and grammar without mutating messages', async () => {
  const { replies, completions, loads, send, engineOptions } = await workerHarness({
    recordOverrides: { overrides: { max_history_size: 0, sliding_window_size: -1 } },
  });
  await send({ id: 1, kind: 'load', modelId: 'test-model' });
  assert.equal(loads[0].options.context_window_size, 4096);
  assert.equal(engineOptions[0].appConfig.model_list[0].overrides.max_history_size, 0);
  assert.equal(engineOptions[0].appConfig.model_list[0].overrides.sliding_window_size, -1);
  for (const original of [messages, [{ role: 'user', content: 'Make it blue.' }]]) {
    const before = structuredClone(original);
    await send({ id: 2, kind: 'complete', messages: original, schema, maxTokens: 768 });
    const sent = completions.at(-1);
    assert.equal(sent.messages[0].role, 'system');
    assert.ok(sent.messages[0].content.includes(JSON.stringify(schema)));
    assert.equal(sent.response_format.schema, JSON.stringify(schema));
    assert.equal(sent.stream, true);
    assert.equal(sent.stream_options.include_usage, true);
    assert.equal(sent.messages.at(-1).content, 'Make it blue.');
    assert.deepEqual(original, before);
    assert.equal(replies.at(-1).result.content, content);
    assert.equal(sent.extra_body?.enable_thinking, undefined);
  }
  assert.ok(completions[0].messages[0].content.startsWith('Use JSON.\n'));
});

test('local worker rejects missing, malformed, and over-cap runtime memory estimates before creating an engine', async () => {
  for (const vramMB of [null, NaN, Infinity, 0, -1, '2048', MAX_MODEL_VRAM_MB + 0.01]) {
    const { replies, loads, engineOptions, send } = await workerHarness({ vramMB });
    await send({ id: 1, kind: 'load', modelId: 'test-model' });
    assert.equal(replies.at(-1).error, 'failed', `Rejected memory estimate: ${String(vramMB)}`);
    assert.equal(engineOptions.length, 0);
    assert.equal(loads.length, 0);
  }
  const missing = await workerHarness({ recordOverrides: { vram_required_MB: undefined } });
  await missing.send({ id: 1, kind: 'load', modelId: 'test-model' });
  assert.equal(missing.replies.at(-1).error, 'failed');
  assert.equal(missing.engineOptions.length, 0);
  const boundary = await workerHarness({ vramMB: MAX_MODEL_VRAM_MB });
  await boundary.send({ id: 1, kind: 'load', modelId: 'test-model' });
  assert.equal(boundary.replies.at(-1).result.loaded, true);
  assert.equal(boundary.loads.length, 1);
});

test('Qwen3 models disable thinking, remove an empty prefix across chunks, and never stream reasoning', async () => {
  for (const modelId of ['Qwen3.5-2B-q4f16_1-MLC', 'Qwen3-1.7B-q4f32_1-MLC']) {
    const { replies, completions, send, setContent, setStream } = await workerHarness({ modelId });
    await send({ id: 1, kind: 'load', modelId });
    setStream([
      ...[...`<think>\n\n</think>\n\n${content}`].map(character => ({ choices: [{ delta: { content: character } }] })),
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]);
    await send({ id: 2, kind: 'complete', messages, schema, maxTokens: 768 });
    assert.equal(completions.at(-1).extra_body.enable_thinking, false);
    assert.equal(replies.at(-1).result.content, content);
    assert.equal(replies.filter(reply => reply.id === 2 && reply.kind === 'token').map(reply => reply.delta).join(''), content);
    const reasoning = `<think>Unwanted reasoning</think>\n${content}`;
    setContent(reasoning);
    await send({ id: 3, kind: 'complete', messages, schema, maxTokens: 768 });
    assert.equal(replies.at(-1).error, 'invalid');
    assert.equal(replies.some(reply => reply.id === 3 && reply.kind === 'token'), false);
    const embedded = '{"message":"<think></think>"}';
    setContent(embedded);
    await send({ id: 4, kind: 'complete', messages, schema, maxTokens: 768 });
    assert.equal(replies.at(-1).result.content, embedded);
  }
  const other = await workerHarness();
  await other.send({ id: 1, kind: 'load', modelId: 'test-model' });
  const prefixed = `<think>\n\n</think>\n\n${content}`;
  other.setContent(prefixed);
  await other.send({ id: 2, kind: 'complete', messages, schema, maxTokens: 768 });
  assert.equal(other.completions[0].extra_body?.enable_thinking, undefined);
  assert.equal(other.replies.at(-1).error, 'invalid');
  assert.equal(other.replies.some(reply => reply.kind === 'token'), false);
});

test('local worker emits deltas before generation ends and collects usage after the finish chunk', async () => {
  const { send, setStream, replies } = await workerHarness();
  await send({ id: 1, kind: 'load', modelId: 'test-model' });
  let continueStream;
  const blocked = new Promise(resolve => { continueStream = resolve; });
  setStream([
    { choices: [{ delta: { role: 'assistant' } }] },
    { choices: [{ delta: { content: '{"message":' }, finish_reason: null }] },
    () => blocked,
    { choices: [{ delta: { content: '"Done"}' }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 42, completion_tokens: 9 } },
  ]);
  const completion = send({ id: 2, kind: 'complete', messages, schema, maxTokens: 768 });
  await tick();
  assert.equal(replies.at(-1).kind, 'token');
  assert.equal(replies.at(-1).delta, '{"message":');
  assert.equal(replies.some(reply => reply.id === 2 && reply.result), false);
  continueStream();
  await completion;
  assert.equal(replies.filter(reply => reply.id === 2 && reply.kind === 'token').map(reply => reply.delta).join(''), content);
  assert.equal(replies.at(-1).result.content, content);
  assert.equal(replies.at(-1).result.usage.inputTokens, 42);
  assert.equal(replies.at(-1).result.usage.outputTokens, 9);
});

test('local worker never returns a completed proposal for interrupted or unfinished streams', async () => {
  const { send, setStream, replies } = await workerHarness();
  await send({ id: 1, kind: 'load', modelId: 'test-model' });
  for (const [index, finishReason] of ['length', 'abort', undefined].entries()) {
    const id = index + 2;
    setStream([
      { choices: [{ delta: { content }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: finishReason }] },
      { choices: [], usage: { prompt_tokens: 50, completion_tokens: 8 } },
    ]);
    await send({ id, kind: 'complete', messages, schema, maxTokens: 768 });
    assert.equal(replies.at(-1).error, 'incomplete');
    assert.equal(replies.some(reply => reply.id === id && reply.result), false);
  }
  setStream([
    { choices: [{ delta: { content: '{"message":' } }] },
    () => { throw new Error('GPU stream failed'); },
  ]);
  await send({ id: 5, kind: 'complete', messages, schema, maxTokens: 768 });
  assert.equal(replies.at(-1).error, 'failed');
  assert.equal(replies.some(reply => reply.id === 5 && reply.result), false);
});
