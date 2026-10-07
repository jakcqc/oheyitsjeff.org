/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Browser integration tests. A simulated local worker exercises the real client
// without GPU work or model downloads. Serve assistant-regressions.html.
export async function runAssistantRegressions() {
  const { registerVisual, runVisualApp, exportStateToJSON } = await import('../helper/visualHelp.js');
  const { LOCAL_MODELS, formatQuantization } = await import('../helper/llmModels.js');
  const passed = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); passed.push(message); };
  const waitFor = async predicate => {
    for (let i = 0; i < 300; i++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for assistant: ' + document.querySelector('.llm-status')?.textContent);
  };
  const fixture = document.createElement('div');
  fixture.style.cssText = 'width:520px;max-width:100%;';
  fixture.innerHTML = '<div class="test-ui"></div><div class="test-visual"></div>';
  document.body.replaceChildren(fixture);
  const [uiEl, mountEl] = fixture.children;
  const visualId = 'assistantRegression';
  const persistKey = `visualHelp.persist.v1:${visualId}`;
  const previousPersistFlag = localStorage.getItem(persistKey);
  localStorage.setItem(persistKey, 'false'); // Keep this fixture independent of saved settings.
  registerVisual(visualId, {
    title: 'Assistant regression visual',
    params: [
      { key: 'amount', type: 'number', default: 10, min: 0, max: 100, step: 1 },
      { key: 'second', type: 'number', default: 20, min: 0, max: 100, step: 1 },
      { key: 'color', type: 'text', default: '#ff0000' },
    ],
    create({ mountEl }, state) {
      // Like app visuals, keep the SVG and source group mounted while redraws
      // update their geometry, so the real transform runtime observes them.
      mountEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><g></g></svg>';
      const source = mountEl.querySelector('g');
      const render = () => {
        source.innerHTML = '<rect x="10" y="10" height="30"/><circle cx="80" cy="80" r="20" fill="#00ff00"/>';
        source.querySelector('rect').setAttribute('width', state.amount);
        source.querySelector('rect').setAttribute('fill', state.color);
      };
      render();
      return { render };
    },
  });
  let app = runVisualApp({ visualId, mountEl, uiEl, state: { __ui: { tabsOpen: true } } });
  const state = app.state;
  const tab = name => {
    const button = [...uiEl.querySelectorAll('.vr-tab')].find(node => node.textContent === name);
    if (!button) throw new Error('Missing tab ' + name);
    button.click();
  };
  const find = label => {
    const node = [...uiEl.querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === label);
    if (!node) throw new Error('Missing field ' + label);
    return node;
  };
  const input = (label, value, event = 'input') => {
    const node = find(label);
    node.value = value;
    node.dispatchEvent(new Event(event, { bubbles: true }));
  };
  const click = label => find(label).click();
  const undoUntil = predicate => {
    // Tab navigation is also undoable. Restore the tested visual change after
    // inspecting its controls without changing the app's history behavior.
    for (let i = 0; i < 12 && !predicate(); i++) click('Undo last visual change');
    if (!predicate()) throw new Error('Could not undo the inspected assistant change');
  };
  const controlInRow = (panel, label) => {
    const row = [...panel.querySelectorAll('.vr-row')].find(node => node.querySelector('.vr-label')?.textContent === label);
    if (!row) throw new Error('Missing toolbar row ' + label);
    const group = row.closest('details');
    if (group) group.open = true;
    const control = row.querySelector('input:not([type="range"]), select, textarea');
    if (!control) throw new Error('Missing toolbar control ' + label);
    return control;
  };
  const selectFamily = familyId => {
    const node = uiEl.querySelector('select[aria-label^="Local model"]');
    node.value = familyId;
    node.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const familyOptions = () => [...uiEl.querySelector('select[aria-label^="Local model"]').options].map(node => node.value).filter(Boolean);
  const precisionOptions = () => [...find('Quantization level').options].map(node => node.value);
  const visibleQuantizations = () => [...find('Quantization').querySelectorAll('input[type="radio"]')];
  const visibleWeightBits = () => visibleQuantizations().map(node => LOCAL_MODELS.find(model => model.id === node.value)?.weightBits);
  const quantization = modelId => uiEl.querySelector(`fieldset[aria-label="Quantization"] input[type="radio"][value="${modelId}"]`);
  const selectQuantization = modelId => {
    const node = quantization(modelId);
    if (!node || node.disabled) throw new Error('Unavailable quantization ' + modelId);
    node.click();
  };
  const status = () => uiEl.querySelector('.llm-status')?.textContent || '';
  const requests = [];
  const modelLoads = [];
  const workers = [];
  let response = { message: 'Ready.', actions: [] };
  let deferred = null;
  const originalFetch = globalThis.fetch;
  const originalWorker = globalThis.Worker;
  const originalGPU = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  let networkCalls = 0;
  let gpuChecks = 0;
  let supportsFloat16 = true;
  globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected network request during local inference.'); };
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: {
    requestAdapter: async () => { gpuChecks++; return {
      info: { description: 'Test GPU' }, features: new Set(supportsFloat16 ? ['shader-f16'] : []),
      limits: { maxStorageBufferBindingSize: 2 ** 30, maxBufferSize: 2 ** 30 },
    }; },
  } });
  globalThis.Worker = class {
    constructor(url, options) {
      this.url = String(url);
      this.options = options;
      this.terminated = false;
      workers.push(this);
    }
    async postMessage(data) {
      const receive = this.onmessage;
      if (data.kind === 'load') {
        modelLoads.push(structuredClone(data));
        queueMicrotask(() => receive({ data: { id: data.id, result: { loaded: true } } }));
      } else if (data.kind === 'complete') {
        requests.push(structuredClone(data));
        const content = JSON.stringify(response);
        if (deferred) {
          const pending = deferred;
          pending.emitToken = delta => receive({ data: { id: data.id, kind: 'token', delta } });
          await pending.promise;
        }
        // Deliberately invoke a captured callback even after termination to
        // verify that the real client rejects obsolete worker responses.
        receive({ data: { id: data.id, result: { content, usage: { inputTokens: 250, outputTokens: 50 } } } });
      } else throw new Error('Unexpected worker command: ' + data.kind);
    }
    terminate() { this.terminated = true; }
  };
  const idle = () => waitFor(() => uiEl.querySelector('.llm-tab')?.getAttribute('aria-busy') === 'false');
  const load = async () => { click('Load / download model'); await idle(); };
  const send = async (prompt, actions, selectedScope = 'params') => {
    response = { message: 'Synthetic model response.', actions };
    input('Control scope', selectedScope, 'change');
    input('Message to visual assistant', prompt);
    click('Send');
    await idle();
  };
  try {
    tab('animate');
    const originalAnimation = uiEl.querySelector('.anim-panel');
    tab('transforms');
    const originalTransforms = uiEl.querySelector('.xf-panel');
    tab('flows');
    const originalFlows = uiEl.querySelector('.tool-flow-panel');
    tab('effects');
    const originalEffects = uiEl.querySelector('.fx-panel');
    tab('assistant');
    const assistant = uiEl.querySelector('.llm-tab');
    assert(workers.length === 0 && networkCalls === 0, 'Opening the assistant performs no model download or network request');
    assert(!assistant.querySelector('input[type="password"]') && assistant.querySelectorAll('select').length === 4, 'Assistant offers local GPU, quantization level, model family, and scope controls');
    assert(find('Send').disabled, 'Send waits for a loaded local model');
    await idle();
    assert(gpuChecks === 1 && find('GPU memory budget').value === 'auto', 'Opening the assistant checks GPU memory automatically');
    assert(workers.length === 0 && networkCalls === 0, 'GPU discovery does not download a model or contact a service');
    assert(assistant.textContent.includes('4 GB fallback budget, not a memory measurement'), 'Unavailable memory information is clearly labeled as a fallback budget');
    assert(assistant.textContent.includes('30 GB'), 'Assistant explains the 30 GB model cap');
    assert(assistant.querySelector('select[aria-label^="Local model"]').value === 'Qwen3.5-2B', 'GPU discovery suggests the compatible modern Qwen 3.5 2B family');
    assert(quantization('Qwen3.5-2B-q4f16_1-MLC')?.checked, 'The initial model selects its recommended 4-bit quantization');
    assert(quantization('Qwen3.5-2B-q4f32_1-MLC') && !quantization('Qwen3.5-2B-q4f32_1-MLC').disabled, 'GPUs with float16 support also offer compatible float32 compute');
    const qwenNote = assistant.querySelector('.llm-quantization-note')?.textContent || '';
    assert(qwenNote.includes('4-bit weights') && qwenNote.includes('FP16 and FP32') && qwenNote.includes('16-bit or 32-bit'), 'Qwen 2B explains that FP16 and FP32 are compute precision and its published weights are 4-bit');
    assert(find('Quantization level').value === 'all' && precisionOptions().join(',') === 'all,4,16,32', 'Quantization level starts with all formats and offers fitting 4-bit, 16-bit, and 32-bit weights');
    const beforeFilterGpuChecks = gpuChecks;
    input('Quantization level', '16', 'change');
    assert(uiEl.querySelector('select[aria-label^="Local model"]').value === 'Qwen3.5-0.8B' && quantization('Qwen3.5-0.8B-q0f16-MLC')?.checked, 'Choosing 16-bit weights suggests a smaller modern unquantized model that fits the GPU');
    assert(familyOptions().includes('Qwen3-0.6B') && !familyOptions().includes('Qwen3.5-2B') && familyOptions().every(familyId => LOCAL_MODELS.some(model => model.familyId === familyId && model.weightBits === 16)), 'The 16-bit list contains smaller full precision families and omits families without that weight format');
    assert(visibleWeightBits().length > 0 && visibleWeightBits().every(bits => bits === 16) && visibleQuantizations().every(node => !node.disabled), 'The 16-bit view only shows selectable 16-bit formats');
    input('Quantization level', '32', 'change');
    assert(familyOptions().includes('Qwen2.5-0.5B-Instruct') && !familyOptions().includes('Qwen3-0.6B') && visibleWeightBits().length > 0 && visibleWeightBits().every(bits => bits === 32), 'The 32-bit view offers fitting small models and omits the 32-bit Qwen 3 model above the GPU budget');
    selectFamily('Qwen2.5-0.5B-Instruct');
    assert(quantization('Qwen2.5-0.5B-Instruct-q0f32-MLC')?.checked, 'A small 32-bit unquantized model is selectable within the same GPU budget');
    input('Quantization level', '4', 'change');
    assert(uiEl.querySelector('select[aria-label^="Local model"]').value === 'Qwen2.5-0.5B-Instruct' && quantization('Qwen2.5-0.5B-Instruct-q4f16_1-MLC')?.checked, 'Changing weight level preserves a model family when it has a fitting format');
    assert(familyOptions().includes('Qwen3.5-2B'), 'The 4-bit view makes a larger compressed model available on the same GPU');
    selectFamily('Qwen3.5-2B');
    assert(visibleWeightBits().length === 2 && visibleWeightBits().every(bits => bits === 4), 'FP16 and FP32 compute variants both stay in the 4-bit weight level');
    input('Quantization level', 'all', 'change');
    assert(gpuChecks === beforeFilterGpuChecks && workers.length === 0 && modelLoads.length === 0 && networkCalls === 0, 'Changing weight levels uses the GPU results without rechecking or downloading a model');
    input('GPU memory budget', '12', 'change'); await idle();
    assert(gpuChecks === 2 && [...assistant.querySelector('select[aria-label^="Local model"]').options].some(item => item.value.includes('-7B-')), 'Changing the budget automatically refreshes compatible models');
    input('GPU memory budget', 'auto', 'change'); await idle();
    assert(![...assistant.querySelector('select[aria-label^="Local model"]').options].some(item => item.value.includes('-7B-')), 'Returning to Auto reapplies the detected or fallback budget');
    click('Check GPU / Find models'); await idle();
    assert(gpuChecks === 4, 'The manual GPU check remains available');
    selectFamily('Qwen3-0.6B');
    const quantChoices = visibleQuantizations();
    const variants = LOCAL_MODELS.filter(model => model.familyId === 'Qwen3-0.6B' && model.weightBits !== 32);
    assert(quantChoices.length === 3 && quantChoices.length === variants.length, 'A model family displays every 4-bit and 16-bit weight format fitting the current GPU');
    assert(new Set(quantChoices.map(node => node.name)).size === 1 && quantChoices.every(node => node.name), 'Quantization uses one native radio group for keyboard selection');
    for (const variant of variants) {
      const radio = quantization(variant.id);
      const label = radio?.labels?.[0];
      assert(label?.textContent.includes(formatQuantization(variant)) && label.textContent.includes(`${(variant.vramMB / 1024).toFixed(2)} GB`), `${variant.quantization} shows its format and correct estimated memory footprint together`);
    }
    assert(!quantization('Qwen3-0.6B-q0f32-MLC') && quantChoices.every(node => !node.disabled), 'A format exceeding the GPU budget is omitted and every visible format is selectable');
    input('Quantization level', '16', 'change');
    assert(quantization('Qwen3-0.6B-q0f16-MLC')?.checked, 'A weight filter retains the chosen family and selects its fitting full precision variant');
    input('Quantization level', 'all', 'change');
    assert(quantization('Qwen3-0.6B-q0f16-MLC')?.checked, 'Returning to all weight levels preserves the exact selected full precision variant');
    input('GPU memory budget', '12', 'change'); await idle();
    assert(quantization('Qwen3-0.6B-q0f32-MLC') && !quantization('Qwen3-0.6B-q0f32-MLC').disabled, 'Increasing the GPU budget reveals a full precision format that now fits');
    selectQuantization('Qwen3-0.6B-q0f32-MLC');
    click('Check GPU / Find models'); await idle();
    assert(quantization('Qwen3-0.6B-q0f32-MLC').checked, 'GPU refresh preserves a selected quantization while it remains compatible');
    input('Quantization level', '32', 'change');
    assert(quantization('Qwen3-0.6B-q0f32-MLC')?.checked, 'Selecting the current weight level preserves the exact chosen variant');
    input('GPU memory budget', 'auto', 'change'); await idle();
    assert(find('Quantization level').value === '32' && !familyOptions().includes('Qwen3-0.6B') && visibleWeightBits().every(bits => bits === 32), 'Reducing the GPU budget retains the weight level and switches to a fitting smaller model');
    input('GPU memory budget', '12', 'change'); await idle();
    selectFamily('Qwen3-0.6B');
    input('Quantization level', 'all', 'change');
    input('GPU memory budget', 'auto', 'change'); await idle();
    assert(quantization('Qwen3-0.6B-q4f16_1-MLC').checked && !quantization('Qwen3-0.6B-q0f32-MLC'), 'With all levels selected, a smaller GPU budget hides the incompatible format and selects a fitting 4-bit format');
    input('Quantization level', '16', 'change');
    supportsFloat16 = false;
    click('Check GPU / Find models'); await idle();
    assert(find('Quantization level').value === 'all' && !precisionOptions().includes('16'), 'A GPU without float16 compute hides the unsupported 16-bit level and resets the filter');
    assert(visibleQuantizations().length > 0 && visibleQuantizations().every(node => LOCAL_MODELS.find(model => model.id === node.value)?.precision === 32), 'A GPU without float16 compute only receives supported compute formats');
    supportsFloat16 = true;
    click('Check GPU / Find models'); await idle();
    selectFamily('Qwen3.5-2B');
    selectQuantization('Qwen3.5-2B-q4f32_1-MLC');
    assert(workers.length === 0 && networkCalls === 0, 'Changing the family and quantization never downloads or loads a model');
    await load();
    assert(workers.length === 1 && workers[0].url.endsWith('/helper/llmWorker.js') && workers[0].options.type === 'module', 'Explicit Load creates the dedicated local inference worker');
    assert(modelLoads[0].modelId === 'Qwen3.5-2B-q4f32_1-MLC', 'Load sends the exact selected quantized model ID to the worker');
    input('Message to visual assistant', 'Check selected quantization');
    selectQuantization('Qwen3.5-2B-q4f16_1-MLC');
    assert(find('Send').disabled && workers.length === 1 && modelLoads.length === 1, 'Selecting a different quantization disables Send until that variant is loaded');
    selectQuantization('Qwen3.5-2B-q4f32_1-MLC');
    assert(!find('Send').disabled, 'Returning to the already loaded quantization restores Send');
    let finishStream;
    deferred = { promise: new Promise(resolve => { finishStream = resolve; }) };
    response = { message: 'Setting "amount" to 35. <strong>Live</strong>', actions: [{ op: 'set_param', key: 'amount', value: 35 }] };
    input('Control scope', 'params', 'change');
    input('Message to visual assistant', 'Set amount to 35');
    click('Send');
    await waitFor(() => !!deferred?.emitToken);
    const streamedJSON = JSON.stringify(response);
    const firstChunk = '{"message":"Setting ';
    deferred.emitToken(firstChunk);
    await waitFor(() => uiEl.querySelector('.llm-stream-text')?.textContent.includes('Setting'));
    assert(uiEl.querySelector('.llm-stream') && state.amount === 10 && +mountEl.querySelector('rect').getAttribute('width') === 10, 'The first streamed text is visible while visual state remains unchanged');
    deferred.emitToken(streamedJSON.slice(firstChunk.length));
    await waitFor(() => uiEl.querySelector('.llm-stream-text')?.textContent.includes('"amount" to 35.'));
    assert(uiEl.querySelector('.llm-stream-text').textContent.includes('<strong>Live</strong>') && !uiEl.querySelector('.llm-stream-text strong'), 'Streamed message text decodes escaped quotes and treats markup as text');
    assert(state.amount === 10 && status().includes('Streaming'), 'Even a complete streamed action waits for the final model response before applying');
    finishStream(); deferred = null;
    await idle();
    assert(!uiEl.querySelector('.llm-stream') && uiEl.querySelector('.llm-chat').textContent.includes('"amount" to 35.'), 'The completed response replaces the temporary streaming message');
    assert(state.amount === 35 && +mountEl.querySelector('rect').getAttribute('width') === 35, 'Chat response updates real state and rendered SVG');
    assert(status().includes('Changes applied.') && status().includes('250 input / 50 output'), 'Assistant reports successful actions and actual token usage');
    assert(uiEl.querySelector('.llm-tab') === assistant && workers.length === 1, 'Applying changes preserves the assistant panel and loaded worker');
    assert(!exportStateToJSON(state).includes('Synthetic model response'), 'Chat remains separate from exported visual state');
    assert(requests[0].schema.additionalProperties === false && requests[0].maxTokens === 768, 'Local worker receives the strict action schema and bounded response budget');
    tab('params');
    assert(uiEl.querySelector('.vr-tabBody > :not([hidden]) input[type="number"]').value === '35', 'Parameter editor reflects assistant changes');
    tab('effects');
    assert(uiEl.querySelector('.fx-panel') !== originalEffects, 'Cached tool editors refresh after assistant changes');
    tab('assistant');
    await send('Set amount to 45', [{ op: 'set_param', key: 'amount', value: 45 }]);
    assert(requests.at(-1).messages[0].content.includes('"value":35'), 'Each new request reads live parameter values');
    click('Undo last visual change');
    assert(state.amount === 35 && uiEl.querySelector('.llm-tab') === assistant && workers.length === 1 && !workers[0].terminated, 'Undo restores visual state while preserving the chat and loaded model');

    await send('Change amount and an invalid control', [
      { op: 'set_param', key: 'amount', value: 55 },
      { op: 'set_param', key: '__proto__.polluted', value: true },
    ]);
    assert(state.amount === 35 && !({}).polluted && !status().includes('Changes applied.'), 'Invalid action rejects the entire batch without state or prototype changes');
    await send('Set amount outside bounds', [{ op: 'set_param', key: 'amount', value: 500 }]);
    assert(state.amount === 35 && status().includes('between'), 'Out-of-range model values cannot modify the visual');

    await send('Set amount to 40 and make the picture grayscale', [
      { op: 'set_param', key: 'amount', value: 40 },
      { op: 'effects_configure', config: [
        { key: 'effectType', value: 'color' }, { key: 'color.selector', value: '*' },
        { key: 'color.mode', value: 'byLuminance' }, { key: 'color.paletteText', value: '#000,#fff' },
        { key: 'color.paletteSteps', value: 5 },
      ] }, { op: 'effects_apply' },
    ], 'effects');
    assert(state.amount === 40 && state.__effects.ui.autoRun && /^rgb\((\d+), \1, \1\)$/.test(mountEl.querySelector('rect').getAttribute('fill')), 'Effect actions apply to SVG and remain enabled on future renders');
    click('Undo last visual change');
    assert(state.amount === 35 && mountEl.querySelector('rect').getAttribute('fill') === '#ff0000', 'One Undo reverts the whole parameter-and-effect response');

    const animationActions = [
      { op: 'animation_configure', targets: [{ key: 'amount', from: 20, to: 30 }], durationSec: 0.2, fps: 60, easing: 'linear', loop: false, yoyo: false },
      { op: 'animation_play' },
    ];
    await send('Animate amount from 20 to 30', animationActions, 'animation');
    await waitFor(() => state.amount === 30);
    assert(+mountEl.querySelector('rect').getAttribute('width') === 30, 'Assistant animation uses the real shared playback runtime');
    click('Undo last visual change');
    assert(state.amount === 35, 'Animation frames do not fill undo history; one Undo restores the previous visual');
    await send('Animate amount from 20 to 30 again', animationActions, 'animation');
    await waitFor(() => state.amount === 30);
    tab('animate');
    assert(uiEl.querySelector('.anim-panel') !== originalAnimation && find('Duration in seconds').value === '0.2' && find('Frames per second').value === '60', 'Animation toolbar refreshes duration and frame rate after an assistant update');
    assert(find('amount start').value === '20' && find('amount end').value === '30', 'Animation toolbar shows the assistant target and both endpoints');
    tab('params');
    assert(uiEl.querySelector('.vr-tabBody > :not([hidden]) input[type="number"]').value === '30', 'Parameter toolbar displays the completed assistant animation value');
    tab('assistant');
    undoUntil(() => state.amount === 35);

    const previousTransforms = JSON.stringify(state.__xf.stack);
    const transformActions = [
      { op: 'transforms_update', kind: 'split', config: [
        { key: 'splitCount', value: 4 }, { key: 'rotateDeg', value: 45 }, { key: 'tileTargets', value: 'all' },
      ] },
      { op: 'transforms_update', kind: 'rotate', config: [] },
    ];
    await send('Split into four copies and rotate every tile 45 degrees', transformActions, 'transforms');
    assert(state.__xf.stack.some(op => op.kind === 'split' && op.count === 4) && state.__xf.stack.some(op => op.kind === 'rotate' && op.deg === 45 && op.targets === null), 'Assistant configures and applies real Transforms tab operations');
    await waitFor(() => mountEl.querySelectorAll('rect[data-xf-mode]').length === 4);
    assert([...mountEl.querySelectorAll('rect[data-xf-mode]')].every(node => node.parentElement.getAttribute('transform')?.includes('rotate(45 ')), 'The transforms runtime renders four copies with the requested rotation');
    click('Undo last visual change');
    assert(JSON.stringify(state.__xf.stack) === previousTransforms && state.amount === 35, 'One Undo restores the entire assistant transform response');
    await send('Split into four copies and rotate every tile 45 degrees again', transformActions, 'transforms');
    tab('transforms');
    const transformPanel = uiEl.querySelector('.xf-panel');
    assert(transformPanel !== originalTransforms && transformPanel.querySelector('[data-xf-key="splitCount"]').value === '4' && transformPanel.querySelector('[data-xf-key="rotateDeg"]').value === '45' && transformPanel.querySelector('[data-xf-key="tileTargets"]').value === 'all', 'Transforms toolbar controls refresh to the assistant split, angle, and tile targets');
    assert(transformPanel.textContent.includes('split(4)') && transformPanel.textContent.includes('deg=45'), 'Transforms toolbar stack lists the applied assistant operations');
    tab('assistant');
    undoUntil(() => JSON.stringify(state.__xf.stack) === previousTransforms);

    await send('Make a grayscale flow', [
      { op: 'flow_configure', name: 'Monochrome', stages: [{ kind: 'effect', label: 'Grayscale', config: [
        { key: 'effectType', value: 'color' }, { key: 'color.selector', value: '*' },
        { key: 'color.mode', value: 'byLuminance' }, { key: 'color.paletteText', value: '#000,#fff' },
      ] }] }, { op: 'flow_apply' },
    ], 'flows');
    assert(state.__toolFlows.ui.autoRun && state.__toolFlows.stages.length === 1, 'Flow actions configure and run the shared flow pipeline');
    assert(/^rgb\((\d+), \1, \1\)$/.test(mountEl.querySelector('rect').getAttribute('fill')), 'Assistant flow changes are visible in the rendered SVG');
    tab('flows');
    const flowPanel = uiEl.querySelector('.tool-flow-panel');
    assert(flowPanel !== originalFlows && flowPanel.querySelector('input[type="text"]').value === 'Monochrome', 'Flows toolbar refreshes to show the assistant flow name');
    assert(flowPanel.querySelector('.tool-flow-stage-title')?.textContent === '1. Grayscale' && flowPanel.querySelector('.tool-flow-stage input[type="checkbox"]').checked, 'Flows toolbar shows the enabled assistant stage');
    assert(controlInRow(flowPanel, 'auto run').checked, 'Flows toolbar reflects the assistant auto-run state');
    tab('assistant');
    undoUntil(() => !state.__toolFlows.ui.autoRun);

    const beforeCancel = state.amount;
    let release;
    deferred = { promise: new Promise(resolve => { release = resolve; }) };
    response = { message: 'Late response', actions: [{ op: 'set_param', key: 'amount', value: 90 }] };
    input('Control scope', 'params', 'change');
    input('Message to visual assistant', 'Set amount to 90');
    click('Send');
    await waitFor(() => !!deferred?.emitToken);
    deferred.emitToken('{"message":"Partial response before cancellation","actions":[{"op":"set_param","key":"amount","value":90}]}');
    await waitFor(() => uiEl.querySelector('.llm-stream-text')?.textContent.includes('Partial response before cancellation'));
    assert(state.amount === beforeCancel, 'A streamed action stays unapplied while inference is pending');
    assert(find('Quantization level').disabled, 'Quantization level cannot change while a local response is being generated');
    click('Stop');
    deferred.emitToken('Late token from cancelled inference');
    release(); deferred = null;
    await waitFor(() => assistant.getAttribute('aria-busy') === 'false');
    assert(state.amount === beforeCancel && status().startsWith('Stopped.'), 'Cancellation discards even a late local worker response');
    assert(!uiEl.querySelector('.llm-stream') && !assistant.textContent.includes('Late token from cancelled inference'), 'Cancellation clears the streaming preview and ignores late tokens');
    assert(workers[0].terminated && find('Send').disabled, 'Stopping inference releases the worker and requires loading a model again');
    await load();
    await send('Set amount to 36 after reloading', [{ op: 'set_param', key: 'amount', value: 36 }]);
    assert(state.amount === 36 && workers.length === 2 && !workers[1].terminated, 'A new local worker can complete requests after cancellation');
    click('Undo last visual change');
    click('Unload model'); await idle();
    assert(workers[1].terminated && find('Send').disabled, 'Unload releases local model resources and disables Send');
    fixture.style.width = '320px';
    assert(assistant.scrollWidth <= assistant.clientWidth + 1, 'Assistant fits a narrow toolbar without horizontal overflow');
    click('Clear chat');
    assert(!uiEl.querySelector('.llm-message'), 'Clear chat removes conversation from the panel');

    await load();
    deferred = { promise: new Promise(resolve => { release = resolve; }) };
    response = { message: 'Old visual', actions: [{ op: 'set_param', key: 'amount', value: 95 }] };
    input('Message to visual assistant', 'Set amount to 95'); click('Send');
    await waitFor(() => !find('Stop').disabled);
    app = app.setVisual(visualId);
    release(); deferred = null;
    await new Promise(resolve => setTimeout(resolve, 20));
    assert(state.amount === beforeCancel && app.state.amount === 10 && workers.at(-1).terminated, 'Switching visual terminates local inference and prevents stale changes');
    assert(networkCalls === 0, 'All chat requests use the local worker without network transport');
    return passed;
  } finally {
    if (previousPersistFlag === null) localStorage.removeItem(persistKey);
    else localStorage.setItem(persistKey, previousPersistFlag);
    globalThis.fetch = originalFetch;
    uiEl.querySelector('.vr-autoUI')?._destroyTabs?.();
    globalThis.Worker = originalWorker;
    if (originalGPU) Object.defineProperty(navigator, 'gpu', originalGPU);
    else delete navigator.gpu;
  }
}
