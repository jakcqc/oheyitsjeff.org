/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import { DEFAULTS, clone, defaultParam, bounds, flattenParams, sample, validate, appRunCount } from '../TheOdyssey/search.js';
const app = { id: 'test', title: 'Fixture', params: [
  { key: 'position', type: 'vector2D', min: { x: -10, y: 0 }, max: { x: 10, y: 20 }, default: { x: 0, y: 5 } },
  { key: 'mode', type: 'select', default: 'a', options: ['a', 'b'] },
] };
const params = flattenParams(app.params);
assert.deepEqual(params.map(p => p.key), ['position.x', 'position.y', 'mode']);
function setup() {
  const settings = { ...clone(DEFAULTS), samples: 5 };
  settings.apps.test = { enabled: true, params: Object.fromEntries(params.map(p => [p.key, { ...defaultParam(p), step: 0 }])) };
  return settings;
}
const settings = setup(), catalog = { apps: [app] }, c = settings.apps.test.params['position.x'];
Object.assign(c, { below: 50, above: 25 });
assert.deepEqual(bounds(params[0], c), { min: -20, max: 15 });
Object.assign(c, { extension: 'raw', below: 3, above: 2 });
assert.deepEqual(bounds(params[0], c), { min: -13, max: 12 });
Object.assign(c, { below: 0, above: 0 });
for (const method of ['stratified', 'random', 'ascending', 'descending', 'alternating', 'halton']) {
  settings.method = method;
  const values = Array.from({ length: 5 }, (_, i) => sample(app, settings, i).state.position.x);
  assert.deepEqual(values, Array.from({ length: 5 }, (_, i) => sample(app, settings, i).state.position.x), method + ' is reproducible');
  assert.ok(values.every(x => x >= -10 && x <= 10), method + ' stays bounded');
  if (method === 'ascending') { assert.equal(values[0], -10); assert.equal(values[4], 10); assert.deepEqual(values, [...values].sort((a,b)=>a-b)); }
  if (method === 'descending') { assert.equal(values[0], 10); assert.equal(values[4], -10); assert.deepEqual(values, [...values].sort((a,b)=>b-a)); }
  if (method === 'alternating') assert.deepEqual(values, [10, -10, 5, -5, 0]);
  if (method === 'stratified') assert.equal(new Set(values.map(x => Math.floor((x + 10) / 4))).size, 5);
}
settings.method = 'grid';
settings.apps.test.params.mode.enabled = true;
assert.equal(validate(settings, catalog), 50);
const combinations = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(sample(app, settings, i).requested)));
assert.equal(combinations.size, 50);
settings.maxRuns = 49;
assert.throws(() => validate(settings, catalog), /50 runs/);
settings.maxRuns = 500;
c.min = 20;
assert.throws(() => validate(settings, catalog), /minimum/);
c.min = -10; c.below = Infinity;
assert.throws(() => validate(settings, catalog), /invalid bounds/);
c.below = 0;
settings.intervalMs = settings.frameMs;
assert.throws(() => validate(settings, catalog), /shorter/);
settings.intervalMs = 100;
settings.apps.test.params.mode.values = [];
assert.throws(() => validate(settings, catalog), /valid choice/);
settings.apps.test.params.mode.values = ['a', 'b'];
settings.method = 'random'; c.samples = 8;
assert.equal(appRunCount(app, settings), 5, 'Global sample count wins by default');
settings.samples = 2;
assert.equal(appRunCount(app, settings), 2, 'Two means two even with an old per-parameter minimum');
settings.respectParamSamples = true;
assert.equal(appRunCount(app, settings), 8, 'Explicit parameter minimums can increase coverage');
settings.respectParamSamples = false;
settings.method = 'grid';
settings.apps.test.params.mode.enabled = false;
assert.equal(appRunCount(app, settings), 4, 'Grid uses 2 values for each of the 2 numeric dimensions');
assert.equal(new Set(Array.from({length: 4}, (_, i) => JSON.stringify(sample(app, settings, i).requested))).size, 4);
settings.method = 'random';
settings.apps.test.params.mode.enabled = false;
assert.equal(sample(app, settings, 0).state.mode, 'a');
settings.toolbarParams = [{ key: '__proto__.polluted', type: 'number', min: 0, max: 1 }];
assert.throws(() => validate(settings, catalog), /Unsafe/);
assert.equal({}.polluted, undefined);
console.log('Odyssey sampling: bounds, all 7 methods, coverage, grid combinations, vectors, replay, validation, and unsafe paths passed.');

