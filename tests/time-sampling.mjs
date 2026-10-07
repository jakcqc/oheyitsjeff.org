/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../helper/timeSampling.js', import.meta.url), 'utf8');
const { createTimeSampler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const options = { sampleStart: 0, sampleInterval: 0.2, sampleCount: 3, sampleMode: 'append' };
function fixture(overrides = {}) {
  const frames = [], messages = [], starts = [];
  const sampler = createTimeSampler({ capture: data => frames.push(data), begin: data => starts.push(data), notify: message => messages.push(message), ...overrides });
  const event = (type, elapsedSec = 0, runId = 1) => sampler.handle({ type, elapsedSec, runId });
  return { sampler, frames, messages, starts, event };
}

test('only the next new run consumes arming; samples rendered times once', () => {
  const { sampler, frames, event } = fixture();
  sampler.arm(options);
  event('frame', 0.2); event('resume'); assert.equal(frames.length, 0);
  event('start'); assert.equal(sampler.armed, false);
  event('frame'); event('frame', 0.1); event('frame', 0.2); event('frame', 0.2); event('frame', 0.4);
  assert.deepEqual(frames.map(frame => frame.elapsedSec), [0, 0.2, 0.4]);
  assert.equal(sampler.running, false);
  event('complete', 1); event('start', 0, 2); event('frame', 0, 2);
  assert.equal(frames.length, 3);
});

test('start offsets, pause/resume and run identity do not generate extra frames', () => {
  const { sampler, frames, event } = fixture();
  sampler.arm({ ...options, sampleStart: 1 }); event('start'); event('frame', 0.5);
  event('frame', 1, 4); assert.equal(frames.length, 0);
  event('frame', 1); event('pause', 1); event('resume', 1); event('frame', 1);
  event('frame', 1.21); event('frame', 1.4);
  assert.deepEqual(frames.map(frame => frame.elapsedSec), [1, 1.21, 1.4]);
});

test('slow frames skip deadlines rather than create copies of the same frame', () => {
  const { sampler, frames, messages, event } = fixture();
  sampler.arm(options); event('start'); event('frame', 0); event('frame', 0.45);
  assert.deepEqual(frames.map(frame => frame.elapsedSec), [0, 0.45]);
  assert.equal(sampler.running, false); assert.match(messages.at(-1), /2\/3/);
});

test('stop ends incomplete runs and cancel also clears future arming', () => {
  const { sampler, frames, messages, event } = fixture();
  sampler.arm(options); event('start'); event('frame'); event('stop', 0.1);
  assert.equal(sampler.running, false); assert.match(messages.at(-1), /1\/3/);
  event('frame', 0.2); assert.equal(frames.length, 1);
  sampler.arm(options); sampler.cancel(); event('start', 0, 2); event('frame', 0, 2);
  assert.equal(frames.length, 1);
});

test('append/replace option is frozen for the run and replacement is signalled on first capture', () => {
  const { sampler, frames, starts, event } = fixture();
  const settings = { ...options, sampleMode: 'replace' }; sampler.arm(settings); settings.sampleMode = 'append';
  event('start'); event('frame'); event('frame', 0.2);
  assert.equal(starts[0].sampleMode, 'replace');
  assert.deepEqual(frames.map(frame => [frame.index, frame.options.sampleMode]), [[0, 'replace'], [1, 'replace']]);
});

test('empty, invalid or failed capture cannot leave sampling stuck on', () => {
  const { sampler, event, messages } = fixture({ capture() { throw new Error('The layout is full.'); } });
  for (const invalid of [{ sampleInterval: 0 }, { sampleStart: -1 }, { sampleCount: 1.5 }, { sampleCount: 401 }, { sampleMode: 'discard' }]) {
    assert.throws(() => sampler.arm({ ...options, ...invalid }), /valid/);
  }
  sampler.arm(options); event('start'); event('frame');
  assert.equal(sampler.running, false); assert.equal(sampler.armed, false); assert.match(messages.at(-1), /full/);
  const other = fixture({ begin() { throw new Error('Missing artwork'); } });
  other.sampler.arm(options); other.event('start');
  assert.equal(other.sampler.running, false); assert.equal(other.sampler.armed, false);
});
