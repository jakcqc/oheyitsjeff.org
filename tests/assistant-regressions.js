/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Browser integration tests. A simulated local worker exercises the real client
// without GPU work or model downloads. Serve assistant-regressions.html.
export async function runAssistantRegressions() {
  const { registerVisual, runVisualApp, exportStateToJSON } = await import('../helper/visualHelp.js');
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
      const render = () => {
        mountEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect x="10" y="10" height="30"/><circle cx="80" cy="80" r="20" fill="#00ff00"/></svg>';
        mountEl.querySelector('rect').setAttribute('width', state.amount);
        mountEl.querySelector('rect').setAttribute('fill', state.color);
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
  const status = () => uiEl.querySelector('.llm-status')?.textContent || '';
  const requests = [];
  const workers = [];
  let response = { message: 'Ready.', actions: [] };
  let deferred = null;
  const originalFetch = globalThis.fetch;
  const originalWorker = globalThis.Worker;
  const originalGPU = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  let networkCalls = 0;
  let gpuChecks = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected network request during local inference.'); };
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: {
    requestAdapter: async () => { gpuChecks++; return {
      info: { description: 'Test GPU' }, features: new Set(['shader-f16']),
      limits: { maxStorageBufferBindingSize: 2 ** 29, maxBufferSize: 2 ** 30 },
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
        queueMicrotask(() => receive({ data: { id: data.id, result: { loaded: true } } }));
      } else if (data.kind === 'complete') {
        requests.push(structuredClone(data));
        const content = JSON.stringify(response);
        if (deferred) await deferred.promise;
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
    tab('effects');
    const originalEffects = uiEl.querySelector('.fx-panel');
    tab('assistant');
    const assistant = uiEl.querySelector('.llm-tab');
    assert(workers.length === 0 && networkCalls === 0, 'Opening the assistant performs no model download or network request');
    assert(!assistant.querySelector('input[type="password"]') && assistant.querySelectorAll('select').length === 3, 'Assistant offers only local GPU, model, and scope controls');
    assert(find('Send').disabled, 'Send waits for a loaded local model');
    await idle();
    assert(gpuChecks === 1 && find('GPU memory budget').value === 'auto', 'Opening the assistant checks GPU memory automatically');
    assert(workers.length === 0 && networkCalls === 0, 'GPU discovery does not download a model or contact a service');
    assert(assistant.textContent.includes('4 GB fallback budget, not a memory measurement'), 'Unavailable memory information is clearly labeled as a fallback budget');
    assert(assistant.querySelector('select[aria-label^="Local model"]').value.startsWith('Qwen2.5-3B'), 'GPU discovery suggests the compatible 3B model');
    input('GPU memory budget', '12', 'change'); await idle();
    assert(gpuChecks === 2 && [...assistant.querySelector('select[aria-label^="Local model"]').options].some(item => item.value.includes('-7B-')), 'Changing the budget automatically refreshes compatible models');
    input('GPU memory budget', 'auto', 'change'); await idle();
    assert(![...assistant.querySelector('select[aria-label^="Local model"]').options].some(item => item.value.includes('-7B-')), 'Returning to Auto reapplies the detected or fallback budget');
    click('Check GPU / Find models'); await idle();
    assert(gpuChecks === 4, 'The manual GPU check remains available');
    await load();
    assert(workers.length === 1 && workers[0].url.endsWith('/helper/llmWorker.js') && workers[0].options.type === 'module', 'Explicit Load creates the dedicated local inference worker');
    await send('Set amount to 35', [{ op: 'set_param', key: 'amount', value: 35 }]);
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

    await send('Animate amount from 20 to 30', [
      { op: 'animation_configure', targets: [{ key: 'amount', from: 20, to: 30 }], durationSec: 0.2, fps: 60, easing: 'linear', loop: false, yoyo: false },
      { op: 'animation_play' },
    ], 'animation');
    await waitFor(() => state.amount === 30);
    assert(+mountEl.querySelector('rect').getAttribute('width') === 30, 'Assistant animation uses the real shared playback runtime');
    click('Undo last visual change');
    assert(state.amount === 35, 'Animation frames do not fill undo history; one Undo restores the previous visual');

    await send('Make a grayscale flow', [
      { op: 'flow_configure', name: 'Monochrome', stages: [{ kind: 'effect', label: 'Grayscale', config: [
        { key: 'effectType', value: 'color' }, { key: 'color.selector', value: '*' },
        { key: 'color.mode', value: 'byLuminance' }, { key: 'color.paletteText', value: '#000,#fff' },
      ] }] }, { op: 'flow_apply' },
    ], 'flows');
    assert(state.__toolFlows.ui.autoRun && state.__toolFlows.stages.length === 1, 'Flow actions configure and run the shared flow pipeline');
    click('Undo last visual change');

    const beforeCancel = state.amount;
    let release;
    deferred = { promise: new Promise(resolve => { release = resolve; }) };
    response = { message: 'Late response', actions: [{ op: 'set_param', key: 'amount', value: 90 }] };
    input('Control scope', 'params', 'change');
    input('Message to visual assistant', 'Set amount to 90');
    click('Send');
    await waitFor(() => !find('Stop').disabled);
    click('Stop'); release(); deferred = null;
    await waitFor(() => assistant.getAttribute('aria-busy') === 'false');
    assert(state.amount === beforeCancel && status().startsWith('Stopped.'), 'Cancellation discards even a late local worker response');
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
