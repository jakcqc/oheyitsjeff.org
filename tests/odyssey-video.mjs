/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import { DEFAULTS } from '../TheOdyssey/search.js';
import { frameRanges, savedVideoFrames, videoPlan, videoQualityOptions, videoEncodingProfiles } from '../TheOdyssey/video-plan.js';
const session = { id: 'search-fixture', total: 4, deletedRuns: ['run-000004'],
  catalog: { apps: [{ id: 'a', title: 'A', params: [] }, { id: 'b', title: 'B', params: [] }] },
  settings: { ...DEFAULTS, samples: 2, apps: { a: { enabled: true }, b: { enabled: true } } },
  runs: [
    { id: 'run-000001', app: 'a', frames: [{ index: 2, file: 'a2.svg' }, { index: 1, file: 'a1.svg' }] },
    { id: 'run-000002', app: 'a', status: 'failed', frames: [] },
    { id: 'run-000003', app: 'b', status: 'timeout', frames: [{ index: 1, file: 'b1.svg' }] },
    { id: 'run-000004', app: 'b', frames: [{ index: 1, file: 'removed.svg' }] },
  ] };
assert.deepEqual(savedVideoFrames(session).map(item => item.frame.file), ['a1.svg', 'a2.svg', 'b1.svg']);
assert.deepEqual(savedVideoFrames(session, ['b']).map(item => item.index), [0]);
assert.deepEqual(frameRanges('0-200, 400-560', 600), [...Array(201).keys(), ...Array.from({ length: 161 }, (_, i) => i + 400)]);
assert.deepEqual(frameRanges('2, 0-2, 1', 3), [0, 1, 2]);
for (const ranges of ['-1', '2-1', '0-3', '1.5', '0,', 'what', 'Infinity']) assert.throws(() => frameRanges(ranges, 3));
assert.throws(() => videoPlan(session, { appIds: [] }), /No saved frames/);
assert.throws(() => videoPlan(null), /Choose a saved search/);
for (const seconds of [0, -1, NaN, Infinity, 3601]) assert.throws(() => videoPlan(session, { seconds }), /Seconds/);
const plan = videoPlan(session, { ranges: '0, 2', seconds: 1.5 });
assert.deepEqual(plan.renderSize, { width: DEFAULTS.width, height: DEFAULTS.height });
assert.equal(plan.flow, null);
assert.equal(plan.showLabel, false);
assert.equal(videoPlan(session, { showLabel: true }).showLabel, true);
assert.deepEqual(plan.items.map(item => item.runNumber), [1, 3]);
const flow = { name: 'Saved flow', stages: [{ kind: 'property', config: { stack: [] } }] };
const flowPlan = videoPlan(session, { flow });
assert.deepEqual(flowPlan.flow, flow);
flow.stages[0].enabled = false;
assert.notEqual(flowPlan.flow.stages[0].enabled, false, 'Render captures its own flow snapshot');
assert.throws(() => videoPlan(session, { flow }), /flow/);
assert.throws(() => videoPlan(session, { flow: { name: 'Bad', stages: [{ kind: 'unknown' }] } }), /flow/);
assert.equal(plan.repeats, 36); assert.equal(plan.totalFrames, 72); assert.equal(plan.duration, 3); assert.equal(plan.fps, 24);
assert.deepEqual(plan.items.map(item => item.frame.file), ['a1.svg', 'b1.svg']);
const rounded = videoPlan(session, { appIds: ['a'], seconds: 0.1 });
assert.equal(rounded.repeats, 2); assert.equal(rounded.duration, 4 / 24);
console.log('MP4 planning: visual subsets, inclusive zero-based ranges, ordering, duplicates, removed/empty runs, partial captures and exact 24 fps timing passed.');

// Inspect the actual encoder-support candidates without launching a browser.
const { Quality, canEncodeVideo } = await import('../TheOdyssey/vendor/mediabunny.mjs');
const originalEncoder = globalThis.VideoEncoder;
try {
  const attempts = [];
  globalThis.VideoEncoder = { isConfigSupported: async config => {
    attempts.push(config);
    return { supported: config.bitrateMode === 'variable', config };
  } };
  const options = videoQualityOptions(1200, 800);
  assert.equal(options.quantizer, 16);
  assert.equal(options.bitrate, 46080000);
  const profiles = videoEncodingProfiles(1200, 800);
  assert.equal(profiles.length, 3);
  assert.equal(profiles[1].quality.quantizer, undefined, 'Retry disables quantizer control');
  assert.equal(profiles[2].hardwareAcceleration, 'prefer-software', 'Last retry changes encoder preference');
  assert(profiles.every(profile => profile.quality.bitrate === options.bitrate), 'Retries retain the high bitrate');

  assert.equal(videoQualityOptions(1920, 1080).bitrate, 99532800);
  assert(videoQualityOptions(3840, 2160).bitrate > 40000000, 'Large renders are not capped at the old bitrate ceiling');
  assert.equal(await canEncodeVideo('avc', { width: 1200, height: 800, frameRate: 24,
    quality: new Quality(options), latencyMode: 'quality', contentHint: 'detail' }), true);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].bitrateMode, 'quantizer', 'Constant quality is preferred');
  assert.equal(attempts[0].bitrate, undefined, 'Quantizer encoding has no bitrate target');
  assert.equal(attempts[1].bitrate, 46080000, 'Compatibility fallback retains the higher bitrate');
  for (const config of attempts) {
    assert.equal(config.width, 1200); assert.equal(config.height, 800);
    assert.equal(config.latencyMode, 'quality'); assert.equal(config.contentHint, 'detail');
  }
  globalThis.VideoEncoder = { isConfigSupported: async config => ({ supported: false, config }) };
  assert.equal(await canEncodeVideo('avc', { width: 320, height: 240, frameRate: 24,
    quality: new Quality(videoQualityOptions(320, 240)), latencyMode: 'quality', contentHint: 'detail' }), false,
    'No silent fallback to a lower-quality bitrate');
} finally {
  if (originalEncoder === undefined) delete globalThis.VideoEncoder;
  else globalThis.VideoEncoder = originalEncoder;
}
console.log('MP4 quality: quantizer-first encoding, high-bitrate compatibility fallback, full resolution and unsupported-encoder handling passed.');
