/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BrowserOdyssey } from '../TheOdyssey/client.js';
import { DEFAULTS, clone, flattenParams, sample, validate } from '../TheOdyssey/search.js';

const read = async name => JSON.parse(await readFile(new URL('../TheOdyssey/' + name, import.meta.url), 'utf8'));
const settings = await read('default-settings.json'), preset = await read('odyssey-settings-extreme-selected.json');
const catalog = await read('catalog.json');
assert.deepEqual(settings, preset, 'The selected preset is the bundled default');
assert.equal(Object.values(settings.apps).filter(app => app.enabled).length, 20);
assert.equal(validate(settings, catalog), 5120);
assert.equal(settings.randomizeSeed, true);
assert.equal(DEFAULTS.randomizeSeed, false, 'Older settings retain reproducible explicit seeds');
assert.throws(() => validate({ ...settings, randomizeSeed: 'true' }, catalog), /Random seed/);

const simulation = {
  bacteriaMinimal: ['running'], gameOfLifeSVG: ['running'], innerLight: ['motionEnabled'],
  lissajousFigures: ['animate'], mondrianAbstraction: ['motion.running', 'motion.enabled'],
};
let seedControls = 0, broadControls = 0;
for (const app of catalog.apps) {
  // Include unselected apps so enabling another app also samples its seeds.
  const samples = Array.from({ length: settings.samples }, (_, index) => sample(app, settings, index));
  const combinations = new Set();
  const counts = [0, 0];
  for (const { state } of samples) {
    assert.equal(state.__toolFlows.ui.autoRun, true);
    assert.equal(state.__effects.ui.autoRun, false);
    assert.deepEqual(state.__xf.stack, []);
    assert.deepEqual(state.__scriptOps.stack, []);
    assert.deepEqual(state.__propOps.stack, [{ kind: 'propRule', selector: { svg: {} }, apply: { 'style.filter': 'grayscale(1)' } }]);
    const [kaleidoscope, spline, grayscale] = state.__toolFlows.stages;
    assert.equal(state.__toolFlows.stages.length, 3, 'Only the requested flow stages are present');
    assert.equal(kaleidoscope.config.ui.preset, 'kaleidoscope4');
    assert.equal(spline.config.effectType, 'splineLines');
    assert.equal(grayscale.enabled, true);
    assert.deepEqual(grayscale, settings.toolbar.__toolFlows.stages[2]);
    combinations.add([kaleidoscope.enabled, spline.enabled].join(','));
    counts[0] += Number(kaleidoscope.enabled); counts[1] += Number(spline.enabled);
  }
  assert.deepEqual(counts, [128, 128], app.id + ' samples each optional effect half the time');
  assert.equal(combinations.size, 4, app.id + ' covers every allowed effect combination');
  for (const p of settings.toolbarParams.filter(p => p.type === 'number')) {
    const values = samples.map(value => value.requested[p.key]);
    assert(values.every(value => value >= p.min && value <= p.max), app.id + '/' + p.key + ' stays in its configured range');
    assert(new Set(values).size > 1, app.id + '/' + p.key + ' varies');
  }
  for (const key of simulation[app.id] || []) {
    assert(samples.every(value => value.requested[key] === true), app.id + '/' + key + ' always runs');
  }
  for (const p of flattenParams(app.params)) {
    const config = settings.apps[app.id].params[p.key];
    if (settings.apps[app.id].enabled && config.enabled && config.below >= 500 && config.above >= 500) broadControls++;
    if (p.type !== 'number' || p.key.split('.').at(-1) !== 'seed') continue;
    seedControls++;
    const values = samples.map(value => value.requested[p.key]);
    assert(values.every(value => Number.isInteger(value) && value >= p.min && value <= p.max), app.id + ' uses accepted integer seeds');
    assert.equal(new Set(values).size, settings.samples, app.id + ' varies its seed on every sample');
    assert(Math.max(...values) - Math.min(...values) > (p.max - p.min) * 0.98, app.id + ' covers the full seed range');
    const other = sample(app, { ...settings, seed: settings.seed + '-another-search' }, 0);
    assert.notEqual(other.requested[p.key], samples[0].requested[p.key], app.id + ' changes with the search seed');
  }
}
assert.equal(seedControls, 14);
assert(broadControls > 250, 'Extreme numeric ranges remain enabled');

// Exercise real start/resume logic without launching thousands of captures.
const client = new BrowserOdyssey(), files = new Map();
client.catalog = catalog; client.sessions = new Map(); client.launch = () => {};
client.storage = {
  saveSettings: async value => { client.savedSettings = clone(value); },
  file: async (id, path, value) => { files.set(id + '/' + path, value); },
  manifest: async () => {},
};
const input = clone(settings);
const first = await client.request('start', input), firstSettings = client.sessions.get(first.id).settings;
const second = await client.request('start', input), secondSettings = client.sessions.get(second.id).settings;
assert.notEqual(firstSettings.seed, secondSettings.seed, 'Each new search gets fresh randomness');
assert.notEqual(firstSettings.seed, input.seed);
assert.deepEqual(input, settings, 'Starting a search does not mutate the editor input');
assert.equal(JSON.parse(files.get(first.id + '/settings.json')).seed, firstSettings.seed);
assert.equal(client.savedSettings.seed, secondSettings.seed);
const firstSamples = catalog.apps.map(app => sample(app, firstSettings, 0));
client.sessions.get(first.id).status = 'paused';
await client.request('resume', { id: first.id });
assert.equal(client.sessions.get(first.id).settings.seed, firstSettings.seed, 'Resume keeps the generated seed');
assert.deepEqual(catalog.apps.map(app => sample(app, firstSettings, 0)), firstSamples);
const replay = { ...firstSettings, randomizeSeed: false };
const repeated = await client.request('start', replay);
assert.equal(client.sessions.get(repeated.id).settings.seed, firstSettings.seed, 'Explicit seeds can replay a search');
assert.deepEqual(catalog.apps.map(app => sample(app, client.sessions.get(repeated.id).settings, 0)), firstSamples);
console.log('Default preset: 20 apps, 5,120 runs, fixed simulations, 14 varying seed controls, fresh search seeds, stable resume/replay, grayscale and optional spline/kaleidoscope coverage passed.');
