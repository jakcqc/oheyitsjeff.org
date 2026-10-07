import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the shared runtime itself with a deterministic frame clock. UI-only
// imports are replaced with small adapters; no browser or dependencies needed.
const source = (await readFile(new URL('../helper/animationHelp.js', import.meta.url), 'utf8'))
  .replace(/^import .*?;\r?$/gm, '')
  .replace(/^export /gm, '');

function harness(ui = {}, node = null) {
  let now = 100;
  let nextRaf = 0;
  const scheduled = new Map();
  const rendered = [];
  const state = { value: 3, __anim: { ui: { paramTargets: [{ key: 'value', from: 0, to: 10 }], durationSec: 1, fps: 60, ...ui } } };
  const context = vm.createContext({
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { const id = ++nextRaf; scheduled.set(id, fn); return id; },
    cancelAnimationFrame: (id) => scheduled.delete(id),
    Element: FakeElement,
    getByPath: (object, path) => path.split('.').reduce((value, key) => value?.[key], object),
    setByPath: (object, path, value) => {
      const parts = path.split('.');
      const last = parts.pop();
      const parent = parts.reduce((value, key) => value[key] ||= {}, object);
      parent[last] = value;
    },
  });
  const api = vm.runInContext(`${source}\n;({controlAnimation, subscribeAnimation, seekAnimation});`, context);
  const ctx = {
    state,
    mountEl: { querySelectorAll: () => node ? [node] : [] },
    onChange: () => { rendered.push(state.value); if (node) node.setAttribute('opacity', 'render-reset'); },
  };
  const events = [];
  const unsubscribe = api.subscribeAnimation({ state }, (event) => events.push({
    ...event, value: state.value, rendered: rendered.at(-1), opacity: node?.getAttribute('opacity'),
  }));
  return {
    ...api, state, ctx, events, unsubscribe,
    command: (command) => api.controlAnimation(ctx, command),
    step(ms) {
      now += ms;
      const pending = [...scheduled.values()];
      scheduled.clear();
      for (const fn of pending) fn(now);
    },
  };
}

class FakeElement {
  attrs = new Map();
  style = {};
  getAttribute(key) { return this.attrs.get(key); }
  setAttribute(key, value) { this.attrs.set(key, value); }
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

{
  const h = harness();
  h.subscribeAnimation(h.ctx, () => { throw new Error('An observer may fail.'); });
  h.command('play');
  assert.deepEqual(h.events.map((event) => event.type), ['start', 'frame']);
  assert.equal(h.events[1].value, 0);
  assert.equal(h.events[1].rendered, 0, 'frame must follow the visual render');
  h.step(200);
  near(h.events.at(-1).elapsedSec, 0.2);
  assert.equal(h.events.at(-1).value, 2);
  h.command('pause');
  assert.equal(h.events.at(-1).type, 'pause');
  const pausedCount = h.events.length;
  h.step(5000);
  assert.equal(h.events.length, pausedCount, 'paused time produces no frames');
  h.command('play');
  assert.equal(h.events.at(-2).type, 'resume');
  near(h.events.at(-1).elapsedSec, 0.2);
  h.step(800);
  assert.equal(h.events.at(-2).type, 'frame');
  assert.equal(h.events.at(-2).value, 10);
  assert.equal(h.events.at(-1).type, 'complete');
  near(h.events.at(-1).elapsedSec, 1);
  assert.equal(h.events.filter((event) => event.type === 'start').length, 1);
  assert.ok(h.events.every((event) => event.runId === 1));
  h.command('play');
  assert.equal(h.events.at(-2).type, 'start');
  assert.equal(h.events.at(-1).runId, 2);
  assert.equal(h.events.at(-1).elapsedSec, 0);
  h.command('stop');
  assert.equal(h.events.at(-1).type, 'stop');
  const count = h.events.length;
  h.command('stop');
  assert.equal(h.events.length, count, 'stopping an inactive run emits nothing');
  h.unsubscribe();
  h.command('play');
  h.step(1000);
  assert.equal(h.events.length, count, 'unsubscribe removes lifecycle observers');
}

{
  const h = harness({ loop: true, yoyo: true });
  h.command('play');
  h.step(1000);
  assert.equal(h.events.at(-1).value, 10);
  near(h.events.at(-1).elapsedSec, 1);
  h.step(500);
  assert.equal(h.events.at(-1).value, 5);
  near(h.events.at(-1).elapsedSec, 1.5);
  h.command('pause');
  h.step(7000);
  h.command('play');
  h.step(500);
  assert.equal(h.events.at(-1).value, 0);
  near(h.events.at(-1).elapsedSec, 2);
  h.command('restart');
  assert.deepEqual(h.events.slice(-3).map((event) => event.type), ['stop', 'start', 'frame']);
  assert.equal(h.events.at(-1).runId, 2);
  assert.equal(h.events.at(-1).elapsedSec, 0);
}

{
  const h = harness();
  h.command('play');
  h.step(200);
  h.seekAnimation(h.ctx, 0.6);
  assert.equal(h.events.at(-1).type, 'stop', 'seeking ends a sampling run');
  assert.equal(h.state.value, 6);
  const count = h.events.length;
  h.seekAnimation(h.ctx, 0.6);
  assert.equal(h.events.length, count, 'seeking does not produce sampling frames');
  h.command('play');
  assert.equal(h.events.at(-2).type, 'start');
  assert.equal(h.events.at(-1).value, 6);
  assert.equal(h.events.at(-1).elapsedSec, 0);
  h.step(400);
  assert.equal(h.events.at(-1).type, 'complete');
  near(h.events.at(-1).elapsedSec, 0.4);
}

{
  const h = harness({ paramTargets: [] });
  h.command('play');
  assert.equal(h.events.length, 0, 'an invalid/no-target playback does not consume an armed sampler');
}

{
  const node = new FakeElement();
  const h = harness({ targetType: 'svg', selector: 'svg', svgName: 'opacity', from: 0, to: 1 }, node);
  h.command('play');
  assert.equal(h.events.at(-1).opacity, '0');
  h.step(500);
  assert.equal(h.events.at(-1).opacity, '0.5', 'SVG overrides must finish before frame observers');
  h.step(500);
  assert.equal(h.events.at(-2).opacity, '1');
  assert.equal(h.events.at(-1).type, 'complete');
}

console.log('Animation lifecycle checks passed (render ordering, pause/resume, loops, restart, seeking, observers, SVG).');
