/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
// Run: node --experimental-default-type=module --test tests/llm-tools.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAssistantActions, buildAssistantRequest, validateAssistantActions } from '../helper/llmTools.js';

function context() {
  const calls = [];
  return {
    calls,
    spec: { title: 'Test visual', params: [
      { key: 'size', type: 'number', min: 1, max: 100, step: 1, default: 10 },
      { key: 'nested.opacity', type: 'number', min: 0, max: 1, step: 0.1 },
      { key: 'enabled', type: 'boolean' },
      { key: 'mode', type: 'select', options: ['circle', 'line'] },
      { key: 'offset', type: 'vector2D', min: -10, max: 10 },
      { key: 'title', type: 'text' },
      { key: 'scriptCode', type: 'text' },
      { key: 'reset', type: 'button' },
    ] },
    state: { size: 10, nested: { opacity: 0.5 }, enabled: true, mode: 'circle', offset: { x: 0, y: 0 }, title: 'Hello', scriptCode: 'secret()', __ui: { activeTab: 'assistant' } },
    mountEl: { querySelector: () => ({}), querySelectorAll: () => [] },
    onChange: (...args) => calls.push(['render', ...args.slice(0, 2)]),
    onStateChange: () => calls.push(['persist']),
    refreshPanels: () => calls.push(['refresh']),
    transaction: fn => { calls.push(['transaction']); return fn(); },
  };
}
const response = (...actions) => ({ message: 'Done.', actions });
const set = (key, value) => ({ op: 'set_param', key, value });
const animation = () => ({ op: 'animation_configure', targets: [{ key: 'size', from: 10, to: 30 }], durationSec: 2, fps: 20, easing: 'linear', loop: false, yoyo: false });
const paint = value => ({ op: 'effects_configure', config: [{ key: 'effectType', value: 'paint' }, { key: 'paintFill', value }] });

test('parameters update together, refresh tools, and undo only touched state', () => {
  const ctx = context();
  const result = applyAssistantActions(ctx, response(set('size', 23), set('nested.opacity', 0.7), set('offset', { x: 3, y: -1 })), 'params');
  assert.equal(ctx.state.size, 23);
  assert.equal(ctx.state.nested.opacity, 0.7);
  assert.deepEqual(ctx.state.offset, { x: 3, y: -1 });
  assert.equal(ctx.calls.filter(c => c[0] === 'render').length, 1);
  ctx.state.title = 'Manual later change';
  result.undo(); result.undo();
  assert.equal(ctx.state.size, 10);
  assert.equal(ctx.state.nested.opacity, 0.5);
  assert.equal(ctx.state.title, 'Manual later change');
  assert.equal(ctx.state.__ui.activeTab, 'assistant');
  assert.equal(ctx.calls.filter(c => c[0] === 'transaction').length, 2);
});

test('invalid last action leaves entire batch and runtime untouched', () => {
  const ctx = context();
  const initial = JSON.stringify(ctx.state);
  assert.throws(() => applyAssistantActions(ctx, response(set('size', 20), set('mode', 'invented'))), /listed options/);
  assert.equal(JSON.stringify(ctx.state), initial);
  assert.deepEqual(ctx.calls, []);
});

test('rejects prototype pollution, unexpected fields, code, invalid numbers and enum values', () => {
  const ctx = context();
  const invalid = [
    response(set('__proto__.polluted', true)),
    JSON.parse('{"message":"x","actions":[],"__proto__":{"polluted":true}}'),
    response({ op: 'set_param', key: 'size', value: 20, code: 'alert(1)' }),
    response(set('scriptCode', 'evil()')),
    response(set('reset', true)),
    response(set('title', '<img onerror=evil()>')),
    response(set('size', '22')),
    response(set('size', Infinity)),
    response(set('size', 101)),
    response(set('size', 1.5)),
    response(set('offset', { x: 2, y: 3, extra: 4 })),
    response({ op: 'run_script', code: 'alert(1)' }),
  ];
  for (const candidate of invalid) assert.throws(() => applyAssistantActions(ctx, candidate));
  assert.equal({}.polluted, undefined);
  assert.equal(ctx.calls.length, 0);
});

test('animation validates every numeric target and scope before applying', () => {
  const ctx = context();
  const act = animation();
  assert.throws(() => applyAssistantActions(ctx, response(act), 'params'), /outside/);
  act.targets.push({ key: 'mode', from: 0, to: 1 });
  assert.throws(() => applyAssistantActions(ctx, response(act), 'animation'), /numeric/);
  assert.equal(ctx.state.__anim, undefined);
  act.targets = [{ key: 'size', from: 0, to: 50 }];
  assert.throws(() => applyAssistantActions(ctx, response(act), 'animation'), /between 1 and 100/);
});

test('actual animation runtime pauses and resumes without resetting progress', () => {
  const priorRAF = globalThis.requestAnimationFrame;
  const priorCancel = globalThis.cancelAnimationFrame;
  const frames = new Map(); let id = 0;
  globalThis.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = frame => frames.delete(frame);
  try {
    const ctx = context();
    applyAssistantActions(ctx, response(animation(), { op: 'animation_play' }), 'animation');
    const [frameId, tick] = [...frames.entries()][0]; frames.delete(frameId);
    tick(performance.now() + 700);
    const progress = ctx.state.__anim.ui.progress01;
    assert.ok(progress > 0.3 && progress < 0.5);
    applyAssistantActions(ctx, response({ op: 'animation_pause' }), 'animation');
    assert.equal(frames.size, 0);
    assert.equal(ctx.state.__anim.ui.progress01, progress);
    applyAssistantActions(ctx, response({ op: 'animation_play' }), 'animation');
    assert.equal(ctx.state.__anim.ui.progress01, progress);
    assert.equal(frames.size, 1);
    applyAssistantActions(ctx, response({ op: 'animation_stop' }), 'animation');
    assert.equal(frames.size, 0);
  } finally { globalThis.requestAnimationFrame = priorRAF; globalThis.cancelAnimationFrame = priorCancel; }
});

test('effect contract blocks unsafe selectors, code effects and URL paints', () => {
  const ctx = context();
  for (const config of [
    [{ key: 'selector', value: 'body svg' }], [{ key: 'selector', value: 'path:has(a)' }],
    [{ key: 'selector', value: '[href]' }], [{ key: 'paintFill', value: 'url(https://example.com)' }],
    [{ key: 'effectType', value: 'functionRects' }], [{ key: 'fnCode', value: 'evil()' }],
    [{ key: 'count', value: 10000 }], [{ key: 'color.targetProp', value: 'onclick' }],
  ]) assert.throws(() => applyAssistantActions(ctx, response({ op: 'effects_configure', config }), 'effects'));
  applyAssistantActions(ctx, response({ op: 'effects_configure', config: [{ key: 'selector', value: 'path:nth-of-type(3n), circle.dot' }] }), 'effects');
  assert.equal(ctx.state.__effects.ui.selector, 'path:nth-of-type(3n), circle.dot');
});

test('configure effect clears imported executable fields and keeps apply explicit', () => {
  const ctx = context();
  ctx.state.__effects = { ui: { effectType: 'functionRects', fnCode: 'evil()', equation: 'evil()', autoRun: true, count: 9000 } };
  applyAssistantActions(ctx, response(paint('#abcdef')), 'effects');
  assert.equal(ctx.state.__effects.ui.fnCode, undefined);
  assert.equal(ctx.state.__effects.ui.equation, '');
  assert.equal(ctx.state.__effects.ui.autoRun, false);
  assert.equal(ctx.calls.filter(c => c[0] === 'render').length, 0);
});

test('runtime failure rolls back prior parameter and effect configuration', () => {
  const ctx = context();
  // Discovery finds an SVG, then runtime has no SVG contexts (e.g. disappeared).
  const initial = JSON.stringify(ctx.state);
  assert.throws(() => applyAssistantActions(ctx, response(set('size', 25), paint('#ff0000'), { op: 'effects_apply' })), /could not be applied/);
  assert.equal(JSON.stringify(ctx.state), initial);
  assert.ok(ctx.calls.some(c => c[1] === '__assistant.undo'));
});

test('paint applies using the real scoped effect helper and enables render replay', () => {
  const ctx = context();
  const priorElement = globalThis.Element;
  class Shape {
    style = {}; attrs = {};
    setAttribute(key, value) { this.attrs[key] = value; }
    getAttribute(key) { return this.attrs[key]; }
  }
  globalThis.Element = Shape;
  try {
    const inside = new Shape(); const outside = new Shape();
    const svg = { querySelectorAll: () => [inside] };
    ctx.mountEl = { querySelector: () => svg, querySelectorAll: () => [svg] };
    const result = applyAssistantActions(ctx, response(paint('#ff0000'), { op: 'effects_apply' }), 'effects');
    assert.equal(inside.attrs.fill, '#ff0000');
    assert.equal(outside.attrs.fill, undefined);
    assert.equal(ctx.state.__effects.ui.autoRun, true);
    assert.ok(result.summary.some(s => s === 'paint applied: 1 elements.'));
  } finally { globalThis.Element = priorElement; }
});

test('real color palette helper works directly and inside a flow with status receipts', () => {
  const priorDocument = globalThis.document;
  globalThis.document = { createDocumentFragment: () => ({ querySelector: () => null }) };
  try {
    for (const asFlow of [false, true]) {
      const ctx = context();
      const shape = { localName: 'circle', style: {}, attrs: { fill: '#ff0000' }, closest: () => null,
        getAttribute(key) { return this.attrs[key]; }, setAttribute(key, value) { this.attrs[key] = value; } };
      const svg = { querySelectorAll: () => [shape] };
      ctx.mountEl = { querySelector: () => svg, querySelectorAll: () => [svg] };
      const config = [
        { key: 'effectType', value: 'color' }, { key: 'color.mode', value: 'byIndex' },
        { key: 'color.sourceProp', value: 'fill' }, { key: 'color.targetProp', value: 'fill' },
        { key: 'color.paletteText', value: '#112233, #abcdef' },
      ];
      const actions = asFlow
        ? [{ op: 'flow_configure', name: 'Palette', stages: [{ kind: 'effect', label: 'Recolor', config }] }, { op: 'flow_apply' }]
        : [{ op: 'effects_configure', config }, { op: 'effects_apply' }];
      const result = applyAssistantActions(ctx, response(...actions), asFlow ? 'flows' : 'effects');
      assert.equal(shape.attrs.fill, '#112233');
      assert.equal(asFlow ? ctx.state.__toolFlows.ui.autoRun : ctx.state.__effects.ui.autoRun, true);
      if (!asFlow) assert.ok(result.summary.includes('color applied: 1 elements, 2 mapped colors.'));
    }
  } finally { globalThis.document = priorDocument; }
});

test('safe flow composes real transform stages and can be undone', () => {
  const ctx = context();
  const stacks = [];
  ctx.xfRuntime = { rebuildNow() { stacks.push(structuredClone(ctx.state.__xf?.stack)); } };
  const result = applyAssistantActions(ctx, response({
    op: 'flow_configure', name: 'Mirror', stages: [{ kind: 'transform', label: 'mirror', stack: [
      { kind: 'split', value: 4, targets: null }, { kind: 'flipX', value: null, targets: [1, 3] },
    ] }],
  }, { op: 'flow_apply' }), 'flows');
  assert.deepEqual(stacks[0], [{ kind: 'split', count: 4 }, { kind: 'flipX', targets: [1, 3] }]);
  assert.equal(ctx.state.__toolFlows.ui.autoRun, true);
  result.undo();
  assert.equal(ctx.state.__toolFlows, undefined);
  assert.equal(ctx.state.__xf, undefined);
});

test('flow containing invalid later stage never runs its first transform', () => {
  const ctx = context(); let applied = 0;
  ctx.xfRuntime = { rebuildNow: () => applied++ };
  assert.throws(() => applyAssistantActions(ctx, response({ op: 'flow_configure', name: 'bad', stages: [
    { kind: 'transform', label: 'split', stack: [{ kind: 'split', value: 4, targets: null }] },
    { kind: 'effect', label: 'unsafe', config: [{ key: 'fnCode', value: 'evil()' }] },
  ] }, { op: 'flow_apply' }), 'flows'));
  assert.equal(applied, 0);
  assert.equal(ctx.state.__toolFlows, undefined);
});

test('context uses live controls and swaps tools while excluding private state', () => {
  const ctx = context(); ctx.state.size = 42; ctx.state.__private = 'PRIVATE_STATE_DO_NOT_INCLUDE';
  const request = buildAssistantRequest(ctx, { prompt: 'Animate size slowly', history: [{ role: 'system', content: 'INJECT_SYSTEM' }] });
  assert.equal(request.scope, 'animation');
  const content = JSON.stringify(request);
  assert.ok(content.includes('42'));
  assert.ok(content.includes('animation_play'));
  assert.ok(!content.includes('effects_configure'));
  assert.ok(!content.includes('PRIVATE_STATE_DO_NOT_INCLUDE'));
  assert.ok(!content.includes('secret()'));
  assert.ok(!content.includes('INJECT_SYSTEM'));
});

test('each scope demonstrates executable edits including required apply or playback', () => {
  const ctx = context();
  ctx.spec.params = [{ key: 'detail', type: 'number', min: 0.5, max: 1, step: 0.25 }];
  ctx.state.detail = 1;
  for (const scope of ['params', 'animation', 'effects', 'flows']) {
    const request = buildAssistantRequest(ctx, { prompt: 'Change detail.', scope, maxContextChars: 9000 });
    const system = request.messages[0].content;
    assert.ok(system.includes('Requested edits REQUIRE matching actions'));
    assert.ok(system.includes('message text alone cannot change the app'));
    const example = JSON.parse(system.split(' Response: ').at(-1));
    if (scope === 'params') assert.deepEqual(example.actions, [{ op: 'set_param', key: 'detail', value: 0.75 }]);
    if (scope === 'animation') {
      assert.deepEqual(example.actions.map(action => action.op), ['animation_configure', 'animation_play']);
      assert.deepEqual(example.actions[0].targets, [{ key: 'detail', from: 1, to: 0.75 }]);
    }
    if (scope === 'effects' || scope === 'flows') {
      assert.deepEqual(example.actions.map(action => action.op), scope === 'effects' ? ['effects_configure', 'effects_apply'] : ['flow_configure', 'flow_apply']);
      const config = scope === 'effects' ? example.actions[0].config : example.actions[0].stages[0].config;
      assert.ok(config.some(setting => setting.key === 'color.paletteSteps' && setting.value === 5));
      assert.ok(config.some(setting => setting.key === 'color.mode' && setting.value === 'byLuminance'));
      assert.ok(system.includes('Configure alone does not apply anything'));
    }
    assert.doesNotThrow(() => validateAssistantActions(ctx, example, scope));
  }
});

test('all structured schemas are strict and fit a local budget', () => {
  function strict(schema) {
    if (!schema || typeof schema !== 'object') return;
    if (schema.type === 'object') {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, Object.keys(schema.properties));
    }
    for (const value of Object.values(schema)) if (Array.isArray(value)) value.forEach(strict); else strict(value);
  }
  for (const scope of ['params', 'animation', 'effects', 'flows']) {
    const request = buildAssistantRequest(context(), { prompt: 'Make this interesting', scope, maxContextChars: 9000 });
    strict(request.schema);
    const chars = JSON.stringify(request.schema).length + request.messages.reduce((sum, message) => sum + message.content.length, 0);
    assert.ok(chars <= 9000);
    assert.equal(request.estimatedTokens, Math.ceil(chars / 3.5));
  }
});

test('large control lists retain relevant live values and explicitly report omissions', () => {
  const ctx = context();
  ctx.spec.params = Array.from({ length: 250 }, (_, i) => ({ key: `density${i}`, type: 'number', min: 0, max: 100, step: 1 }));
  for (let i = 0; i < 250; i++) ctx.state[`density${i}`] = i % 100;
  const request = buildAssistantRequest(ctx, { prompt: 'Change density249 to 5', scope: 'params', maxContextChars: 4000 });
  assert.ok(request.messages[0].content.includes('"density249"'));
  assert.ok(request.messages[0].content.includes('omittedParams'));
  assert.ok(request.estimatedTokens <= Math.ceil(4000 / 3.5));
});

test('explanations have no runtime side effects and actions are capped', () => {
  const ctx = context();
  assert.deepEqual(applyAssistantActions(ctx, { message: 'Try the animation scope.', actions: [] }), { message: 'Try the animation scope.', summary: [] });
  assert.deepEqual(ctx.calls, []);
  assert.throws(() => validateAssistantActions(ctx, response(...Array.from({ length: 13 }, () => set('size', 20)))), /0–12/);
});
