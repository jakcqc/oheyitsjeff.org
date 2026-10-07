/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// node --test tests/animation-render.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { VIDEO_FPS, frameRanges, videoQualityOptions } from '../TheOdyssey/video-plan.js';

const planSource = (await readFile(new URL('../helper/animationRenderPlan.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const planAPI = vm.runInNewContext(planSource + '\n({makeAnimationRenderPlan,animationFrameProgress,ANIMATION_SVG_MEMORY_LIMIT})',
  { VIDEO_FPS, frameRanges, videoQualityOptions, structuredClone });
const { makeAnimationRenderPlan, animationFrameProgress } = planAPI;
const engineSource = (await readFile(new URL('../helper/animationRender.js', import.meta.url), 'utf8'))
  .replace(/^(?:import |export \{).*;\r?\n/gm, '').replace(/^export /gm, '');
const state = () => ({ amount: 10, __anim: { ui: { durationSec: 1, paramTargets: [{ key: 'amount', from: 10, to: 20 }] } } });

function engine(overrides = {}) {
  const calls = { frames: [], snapshots: [], captureOptions: [], destroyed: 0, encoded: [], outputReleased: 0 };
  const context = {
    ...planAPI, Blob, DOMException, structuredClone, performance, setTimeout,
    createAnimationCapture(options) {
      calls.captureOptions.push(options);
      calls.snapshots.push(options.state);
      return { prepare: async () => {},
        frame: async frame => { calls.frames.push(frame); return { svg: '<svg><path d="M0 0L10 10"/></svg>' }; },
        destroy() { calls.destroyed++; } };
    },
    videoOutput: async () => ({ fileHandle: null, blob: async result => result.blob,
      release: async () => { calls.outputReleased++; } }),
    exportAnimationVideo: async options => {
      calls.encoded.push(options);
      for (const item of options.plan.items) await options.storage.read(options.plan.sessionId, item.frame.file);
      return { blob: new Blob(['mp4'], { type: 'video/mp4' }), frames: options.plan.totalFrames, attempts: 1 };
    },
    ...overrides,
  };
  return { ...vm.runInNewContext(engineSource + '\n({preloadAnimation,renderAnimation,createFrameCache})', context), calls };
}

test('plans exact 24 fps, finite loops/yoyo, sorted frame ranges and both tween endpoints', () => {
  const original = state(); original.__anim.ui.yoyo = true; original.__anim.ui.loop = true;
  const plan = makeAnimationRenderPlan(original, { cycles: 2, ranges: '95,0-23,24', width: 319, height: 241 });
  assert.equal(plan.fps, 24); assert.equal(plan.availableFrames, 96);
  assert.equal(plan.frames, 26); assert.equal(plan.duration, 26 / 24);
  assert.equal(plan.width, 320); assert.equal(plan.height, 242);
  assert.equal(plan.captureFrames, 96);
  assert.equal(animationFrameProgress(plan, 0), 0);
  assert.equal(animationFrameProgress(plan, 23), 1);
  assert.equal(animationFrameProgress(plan, 24), 1);
  assert.equal(animationFrameProgress(plan, 47), 0);
  assert.equal(animationFrameProgress(plan, 48), 0);
  assert.equal(animationFrameProgress(plan, 71), 1);
  assert.equal(animationFrameProgress(plan, 95), 0);
  assert.throws(() => animationFrameProgress(plan, 96), /out of range/);
});

test('plans validate resource limits, snapshot saved flows and provide honest advisory estimates', () => {
  const flow = { name: 'Test', stages: [{ kind: 'effect', enabled: true, config: {} }] };
  const plan = makeAnimationRenderPlan(state(), { flow });
  flow.stages[0].enabled = false;
  assert.equal(plan.flow.stages[0].enabled, true);
  assert(Object.isFrozen(plan)); assert(Object.isFrozen(plan.indices)); assert(Object.isFrozen(plan.flow.stages[0]));
  assert(plan.estimatedFileBytes > 0); assert(plan.estimatedMemoryBytes > plan.estimatedFileBytes);
  assert(plan.estimatedSecondsRange[0] < plan.estimatedSeconds && plan.estimatedSecondsRange[1] > plan.estimatedSeconds);
  const shorter = makeAnimationRenderPlan(state(), { durationSec: 0.5 });
  assert(shorter.estimatedFileBytes < plan.estimatedFileBytes);
  for (const options of [{ width: 4097 }, { height: 0 }, { width: NaN }, { cycles: 0 }, { cycles: 1.5 },
    { durationSec: 0 }, { durationSec: Infinity }, { durationSec: 3600, cycles: 2 }, { format: 'avi' }, { ranges: '24' }, { flow }]) {
    assert.throws(() => makeAnimationRenderPlan(state(), options));
  }
});

test('preload captures a state snapshot, advances skipped frames and supports MP4 reuse without downloading', async () => {
  const fixture = engine(), original = state();
  original.__exportSvg = () => '<svg/>';
  original.__history = { undo: original };
  const plan = makeAnimationRenderPlan(original, { durationSec: 0.25, ranges: '1,3,5' });
  const updates = [];
  const pending = fixture.preloadAnimation({ state: original, plan, svgSource: '<svg/>', app: 'fixture', onProgress: value => updates.push(value) });
  original.amount = 200;
  const prepared = await pending;
  assert.equal(fixture.calls.snapshots[0].amount, 10);
  assert.equal(fixture.calls.snapshots[0].__exportSvg, undefined);
  assert.equal(fixture.calls.snapshots[0].__history, undefined);
  assert.equal(fixture.calls.captureOptions[0].svgSource, '<svg/>');
  assert.equal(fixture.calls.captureOptions[0].app, 'fixture');
  assert.equal(original.__anim.ui.progress01, undefined);
  assert.equal(fixture.calls.frames.length, 6, 'Native simulation clock advances across excluded frames');
  assert.equal(fixture.calls.frames[0].deltaMs, 0);
  assert(fixture.calls.frames.slice(1).every(frame => frame.deltaMs === 1000 / 24));
  assert.deepEqual(Array.from(prepared.items, item => item.index), [1, 3, 5]);
  assert.equal(prepared.cacheMode, 'memory'); assert(prepared.bytes > 0);
  assert.equal(fixture.calls.destroyed, 1);
  assert(updates.every(value => value.estimatedSecondsRemaining >= 0));
  const rendered = await fixture.renderAnimation({ prepared });
  assert.equal(rendered.blob.type, 'video/mp4'); assert.equal(rendered.frames, 3);
  assert.equal(fixture.calls.encoded[0].plan.repeats, 1);
  assert.equal(fixture.calls.encoded[0].plan.allowBlankFrames, true);
  assert.equal(fixture.calls.frames.length, 6, 'Rendering reuses captured SVGs');
  assert.equal(fixture.calls.outputReleased, 0, 'Keep MP4 available for preview/save');
  await rendered.release(); assert.equal(fixture.calls.outputReleased, 1);
  await prepared.release(); await prepared.release();
  await assert.rejects(() => prepared.storage.read(prepared.sessionId, prepared.items[0].frame.file), /released/);
});

test('prepare errors are reported and release the renderer before any frame is captured', async () => {
  let destroyed = 0, frames = 0;
  const fixture = engine({ createAnimationCapture: () => ({ prepare: async () => ({ errors: ['Image source is missing'] }),
    frame: async () => { frames++; }, destroy: () => { destroyed++; } }) });
  await assert.rejects(() => fixture.preloadAnimation({ state: state(), plan: makeAnimationRenderPlan(state()) }), /Image source is missing/);
  assert.equal(destroyed, 1); assert.equal(frames, 0);
});

test('intentionally empty SVG frames preserve animation timing and finalization reports uncertain ETA', async () => {
  const fixture = engine({ createAnimationCapture: () => ({ prepare: async () => ({ errors: ['Empty SVG: no geometry'] }),
    frame: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', empty: true, errors: ['Empty SVG: no geometry'] }), destroy() {} }),
    exportAnimationVideo: async options => {
      options.onProgress({ phase: 'Finalizing', done: 6, total: 6 });
      return { blob: new Blob(['mp4']), frames: options.plan.totalFrames };
    } });
  const prepared = await fixture.preloadAnimation({ state: state(), plan: makeAnimationRenderPlan(state(), { durationSec: 0.25 }) });
  assert.equal(prepared.items.length, 6);
  const progress = [];
  const result = await fixture.renderAnimation({ prepared, onProgress: value => progress.push(value) });
  assert.equal(result.frames, 6);
  assert.equal(progress.at(-1).estimatedSecondsRemaining, null);
  assert.equal(progress.at(-1).estimateMeasured, false);
  await result.release(); await prepared.release();
});

test('memory fallback refuses to exceed 64 MB and clears retained frames on release', async () => {
  const fixture = engine(), cache = await fixture.createFrameCache();
  await cache.write('a.svg', new Blob(['small']));
  await assert.rejects(() => cache.write('b.svg', { size: planAPI.ANIMATION_SVG_MEMORY_LIMIT }), /64 MB memory limit/);
  await assert.rejects(() => cache.write('c.svg', { size: planAPI.ANIMATION_SVG_MEMORY_LIMIT + 1 }), /64 MB frame limit/);
  await assert.rejects(() => cache.read('other-session', 'a.svg'), /unavailable/);
  await cache.release(); assert.equal(cache.bytes, 0);
});

test('cancel during capture destroys the isolated renderer; cancel during encode releases partial MP4', async () => {
  const controller = new AbortController();
  let destroyed = 0;
  const fixture = engine({ createAnimationCapture: () => ({ prepare: async () => {},
    frame: async () => { controller.abort(); throw new Error('Renderer destroyed'); }, destroy() { destroyed++; } }) });
  await assert.rejects(() => fixture.preloadAnimation({ state: state(), plan: makeAnimationRenderPlan(state()), signal: controller.signal }),
    error => error.name === 'AbortError');
  assert.equal(destroyed, 1);
  const encoderController = new AbortController();
  const encoding = engine({ exportAnimationVideo: async () => { encoderController.abort(); throw new Error('Encoder released'); } });
  const prepared = await encoding.preloadAnimation({ state: state(), plan: makeAnimationRenderPlan(state(), { durationSec: 0.05 }) });
  await assert.rejects(() => encoding.renderAnimation({ prepared, signal: encoderController.signal }), error => error.name === 'AbortError');
  assert.equal(encoding.calls.outputReleased, 1);
  await prepared.release();
});

test('OPFS preload cancellation removes its temporary directory and aborts an incomplete write', async () => {
  const controller = new AbortController(), removed = [], writes = [];
  let aborted = 0;
  const directory = { getFileHandle: async () => ({ createWritable: async () => ({
    write: async blob => { writes.push(blob); controller.abort(); }, close: async () => {}, abort: async () => { aborted++; },
  }) }) };
  const parent = { getDirectoryHandle: async () => directory, removeEntry: async (name, options) => removed.push({ name, options }) };
  const fixture = engine({ navigator: { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => parent }) } } });
  await assert.rejects(() => fixture.preloadAnimation({ state: state(), plan: makeAnimationRenderPlan(state()), signal: controller.signal }),
    error => error.name === 'AbortError');
  assert.equal(writes.length, 1); assert(aborted > 0); assert.equal(removed.length, 1);
  assert.equal(removed[0].options.recursive, true); assert.match(removed[0].name, /^animation-/);
});
