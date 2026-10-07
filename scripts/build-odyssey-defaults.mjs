/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run after crawling: node scripts/build-odyssey-defaults.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { DEFAULTS, clone, flattenParams, defaultParam } from '../TheOdyssey/search.js';
const catalog = JSON.parse(await readFile(new URL('../TheOdyssey/catalog.json', import.meta.url), 'utf8'));
const preset = JSON.parse(await readFile(new URL('../TheOdyssey/odyssey-settings-extreme-selected.json', import.meta.url), 'utf8'));
const settings = { ...clone(DEFAULTS), ...preset };
for (const app of catalog.apps) {
  const selected = settings.apps[app.id] ||= { enabled: false, params: {} };
  selected.params ||= {};
  for (const p of flattenParams(app.params)) {
    const config = selected.params[p.key] = { ...defaultParam(p), ...selected.params[p.key] };
    if (p.key === app.simulation?.param || app.id === 'mondrianAbstraction' && p.key === 'motion.enabled') {
      Object.assign(config, { enabled: false, fixed: true, values: [true] });
    }
    // Seeds are identifiers: extending beyond accepted bounds can collapse
    // many different requested values to the same clamped seed in an app.
    if (p.type === 'number' && p.key.split('.').at(-1) === 'seed') {
      Object.assign(config, { enabled: true, min: p.min, max: p.max, step: 1, below: 0, above: 0, extension: 'percent' });
    }
  }
}
await writeFile(new URL('../TheOdyssey/default-settings.json', import.meta.url), JSON.stringify(settings, null, 2) + '\n');
console.log('Saved selected preset for ' + catalog.apps.length + ' apps / ' + Object.values(settings.apps).reduce((n, a) => n + Object.keys(a.params).length, 0) + ' controls.');
