/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createDragIntent } from '../helper/galleryGestures.js';

function fixture(options = {}) {
  let time = 0;
  let nextId = 0;
  const timers = new Map();
  const calls = [];
  const intent = createDragIntent({
    now: () => time,
    schedule(callback, delay) { const id = ++nextId; timers.set(id, { at: time + delay, callback }); return id; },
    unschedule: id => timers.delete(id),
    onDragStart: point => calls.push(['start', point]),
    onDragMove: point => calls.push(['move', point]),
    onDragEnd: point => calls.push(['end', point]),
    ...options,
  });
  return { intent, calls, advance(ms) {
    const end = time + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      time = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = end;
  } };
}

test('short movements activate the route without restarting the simulation', () => {
  const { intent, calls, advance } = fixture();
  intent.begin({ x: 10, y: 10 });
  advance(100);
  intent.move({ x: 30, y: 20 });
  advance(49);
  assert.deepEqual(intent.end(), { dragged: false, activate: true });
  advance(500);
  assert.deepEqual(calls, []);
});

test('a long stationary press remains a tap', () => {
  const { intent, calls, advance } = fixture();
  intent.begin({ x: 10, y: 10 });
  advance(1500);
  assert.equal(intent.end().activate, true);
  assert.deepEqual(calls, []);
});

test('jitter within eight pixels remains a tap even after the delay', () => {
  const { intent, calls, advance } = fixture();
  intent.begin({ x: 10, y: 10 });
  intent.move({ x: 14, y: 14 });
  advance(400);
  intent.move({ x: 15, y: 11 });
  assert.equal(intent.end().activate, true);
  assert.deepEqual(calls, []);
});

test('moving away then back before the delay remains a tap', () => {
  const { intent, calls, advance } = fixture();
  intent.begin({ x: 0, y: 0 });
  intent.move({ x: 20, y: 20 });
  advance(100);
  intent.move({ x: 2, y: 2 });
  advance(200);
  assert.equal(intent.end().activate, true);
  assert.deepEqual(calls, []);
});

test('holding a moved pointer for the delay starts one drag and releases it', () => {
  const { intent, calls, advance } = fixture();
  intent.begin({ x: 0, y: 0 });
  intent.move({ x: 20, y: 10 });
  advance(149);
  assert.deepEqual(calls, []);
  advance(1);
  assert.deepEqual(calls.map(call => call[0]), ['start', 'move']);
  intent.move({ x: 30, y: 20 });
  advance(500);
  assert.deepEqual(intent.end(), { dragged: true, activate: false });
  assert.deepEqual(calls.map(call => call[0]), ['start', 'move', 'move', 'end']);
  assert.deepEqual(calls.at(-1)[1], { x: 30, y: 20 });
});

test('movement after the delay starts a drag without another delay', () => {
  const { intent, calls, advance } = fixture();
  intent.begin({ x: 0, y: 0 });
  advance(400);
  intent.move({ x: 8, y: 0 });
  assert.equal(calls[0][0], 'start');
  assert.equal(intent.end().activate, false);
});

test('cancellation cancels pending activation and timers', () => {
  const { intent, calls, advance } = fixture();
  intent.begin({ x: 0, y: 0 });
  intent.move({ x: 20, y: 10 });
  assert.deepEqual(intent.cancel(), { dragged: false, activate: false });
  advance(500);
  assert.deepEqual(calls, []);
  assert.equal(intent.end().activate, false);
});

test('cancelling an active drag releases it without activating', () => {
  const { intent, calls, advance } = fixture();
  intent.begin({ x: 0, y: 0 });
  advance(300);
  intent.move({ x: 20, y: 10 });
  assert.deepEqual(intent.cancel(), { dragged: true, activate: false });
  assert.equal(calls.at(-1)[0], 'end');
});

test('a configured delay applies to each new gesture', () => {
  let delay = 500;
  const { intent, calls, advance } = fixture({ delayMs: () => delay });
  intent.begin({ x: 0, y: 0 });
  intent.move({ x: 20, y: 10 });
  advance(400);
  assert.equal(intent.end().activate, true);
  assert.deepEqual(calls, []);
  delay = 100;
  intent.begin({ x: 0, y: 0 });
  intent.move({ x: 20, y: 10 });
  advance(100);
  assert.equal(intent.end().activate, false);
  assert.equal(calls[0][0], 'start');
});

test('zero delay still requires deliberate movement', () => {
  const { intent, calls, advance } = fixture({ delayMs: 0 });
  intent.begin({ x: 0, y: 0 });
  advance(0);
  intent.move({ x: 1, y: 1 });
  assert.deepEqual(calls, []);
  intent.move({ x: 10, y: 0 });
  assert.equal(intent.end().activate, false);
});

test('movement beyond forty pixels bypasses even a long configured delay', () => {
  const { intent, calls, advance } = fixture({ delayMs: 1500 });
  intent.begin({ x: 10, y: 10 });
  advance(10);
  intent.move({ x: 50, y: 10 });
  assert.deepEqual(calls, []); // Exactly 40 px still waits.
  intent.move({ x: 51, y: 10 });
  assert.deepEqual(calls.map(call => call[0]), ['start', 'move']);
  advance(2000);
  assert.equal(calls.filter(call => call[0] === 'start').length, 1);
  assert.deepEqual(intent.end(), { dragged: true, activate: false });
});

test('the immediate threshold uses diagonal displacement from the press', () => {
  const { intent, calls, advance } = fixture();
  intent.begin({ x: 0, y: 0 });
  advance(5);
  intent.move({ x: 29, y: 29 });
  assert.equal(calls[0][0], 'start');
  intent.move({ x: 0, y: 0 });
  assert.equal(intent.end().activate, false); // Returning does not turn a drag into a tap.
});

test('scaled SVG coordinates do not change the screen-pixel threshold', () => {
  const { intent, calls } = fixture();
  intent.begin({ x: 0, y: 0, clientX: 100, clientY: 100 });
  intent.move({ x: 80, y: 0, clientX: 120, clientY: 100 });
  assert.deepEqual(calls, []);
  intent.move({ x: 164, y: 0, clientX: 141, clientY: 100 });
  assert.equal(calls[0][0], 'start');
  assert.equal(calls[0][1].x, 164); // Rendering still receives the SVG position.
  assert.equal(intent.end().activate, false);
});
