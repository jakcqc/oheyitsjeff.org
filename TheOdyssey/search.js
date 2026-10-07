/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
export const METHODS = {
  stratified: 'Stratified coverage', random: 'Fully random', ascending: 'Small to large',
  descending: 'Large to small', alternating: 'Large / small / large',
  halton: 'Low-discrepancy sequence', grid: 'Full Cartesian grid',
};
export const DEFAULTS = {
  version: 1, seed: 'odyssey-1', randomizeSeed: false, method: 'stratified', samples: 2, respectParamSamples: false,
  frames: 1, computeMs: 15000, frameMs: 5000, intervalMs: 100,
  width: 1200, height: 800, maxRuns: 500, apps: {}, toolbar: {}, toolbarParams: [],
};
export const clone = value => JSON.parse(JSON.stringify(value));
export function setPath(obj, path, value) {
  const keys = path.split('.');
  if (keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('Unsafe parameter path');
  const last = keys.pop();
  let target = obj;
  for (const key of keys) target = target[key] ||= {};
  target[last] = value;
}
export function flattenParams(params) {
  return params.flatMap(p => ['vector2', 'vector3', 'vector2D', 'vector3D'].includes(p.type)
    ? (['vector3', 'vector3D'].includes(p.type) ? ['x', 'y', 'z'] : ['x', 'y']).map(axis => ({ ...p,
      key: p.key + '.' + axis, label: (p.label || p.key) + ' · ' + axis, type: 'number',
      default: p.default?.[axis] ?? 0,
      min: typeof p.min === 'object' ? p.min?.[axis] : p.min,
      max: typeof p.max === 'object' ? p.max?.[axis] : p.max,
    })) : [p]);
}
export function defaultParam(p) {
  const numeric = p.type === 'number';
  const options = p.type === 'boolean' ? [false, true] : (p.options || []).map(o => typeof o === 'object' ? o.value : o);
  const bounded = numeric && Number.isFinite(p.min) && Number.isFinite(p.max);
  return { enabled: bounded, min: bounded ? p.min : Number(p.default) || 0,
    max: bounded ? p.max : Number(p.default) || 0, samples: 2, step: p.step || 0,
    below: 0, above: 0, extension: 'percent', values: options, fixed: p.default };
}
export function bounds(p, c) {
  const span = Number.isFinite(p.min) && Number.isFinite(p.max) ? p.max - p.min : c.max - c.min;
  const unit = c.extension === 'percent' ? span / 100 : 1;
  return { min: c.min - c.below * unit, max: c.max + c.above * unit };
}
export function dimensions(app, settings) {
  return [...flattenParams(app.params), ...(settings.toolbarParams || [])]
    .map(p => ({ p, c: settings.apps[app.id]?.params?.[p.key] || defaultParam(p) }));
}
function random(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ h >>> 15, h | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function prime(index) {
  let found = -1;
  for (let n = 2; ; n++) { let ok = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { ok = false; break; } if (ok && ++found === index) return n; }
}
function radical(n, base) { let f = 1, r = 0; while (n > 0) { f /= base; r += f * (n % base); n = Math.floor(n / base); } return r; }
function permutation(count, seed) {
  const arr = Array.from({ length: count }, (_, i) => i), rng = random(seed);
  for (let i = count - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function valuesCount(p, c, settings) { return p.type === 'number' ? (settings.respectParamSamples === true ? Math.max(settings.samples, c.samples) : settings.samples) : Math.max(1, c.values.length); }
export function appRunCount(app, settings) {
  const ds = dimensions(app, settings).filter(({ c }) => c.enabled);
  if (settings.method === 'grid') return ds.reduce((n, { p, c }) => n * valuesCount(p, c, settings), 1);
  return settings.respectParamSamples === true ? Math.max(settings.samples, ...ds.map(({ c }) => c.samples)) : settings.samples;
}
export function plan(settings, catalog) {
  return catalog.apps.filter(a => settings.apps[a.id]?.enabled).map(app => ({ app, count: appRunCount(app, settings) }));
}
export function validate(settings, catalog) {
  if (settings.version !== 1 || !METHODS[settings.method]) throw new Error('Unsupported search settings or sampling method.');
  for (const [key, min, max] of [['samples', 1, 10000], ['frames', 1, 10000], ['computeMs', 10, 3600000], ['frameMs', 10, 3600000], ['intervalMs', 0, 3600000], ['width', 100, 4096], ['height', 100, 4096], ['maxRuns', 1, 100000]]) {
    if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) throw new Error(key + ' must be an integer from ' + min + ' to ' + max + '.');
  }
  if (settings.intervalMs >= settings.frameMs) throw new Error('Time between frames must be shorter than the frame deadline.');
  if (settings.respectParamSamples !== undefined && typeof settings.respectParamSamples !== 'boolean') throw new Error('Per-parameter sample minimums must be enabled or disabled.');
  if (settings.randomizeSeed !== undefined && typeof settings.randomizeSeed !== 'boolean') throw new Error('Random seed per search must be enabled or disabled.');
  const jobs = plan(settings, catalog);
  if (!jobs.length) throw new Error('Select at least one visual app.');
  let total = 0;
  for (const { app, count } of jobs) {
    for (const { p, c } of dimensions(app, settings)) {
      setPath({}, p.key, null);
      if (p.type === 'number' && !c.enabled && !Number.isFinite(c.fixed ?? p.default)) throw new Error(p.key + ': fixed value must be finite.');
      if (!c.enabled) continue;
      if (!['percent', 'raw'].includes(c.extension)) throw new Error(p.key + ': invalid extension units.');
      if (settings.respectParamSamples === true && (!Number.isInteger(c.samples) || c.samples < 1 || c.samples > 10000)) throw new Error(p.key + ': samples must be 1–10000.');
      if (p.type === 'number') {
        if (![c.min, c.max, c.below, c.above, c.step].every(Number.isFinite) || c.step < 0 || c.below < 0 || c.above < 0) throw new Error(app.title + ' / ' + p.key + ': invalid bounds, extension, or step.');
        const b = bounds(p, c);
        if (c.min > c.max || b.min > b.max || !Number.isFinite(b.max - b.min)) throw new Error(p.key + ': minimum must not exceed maximum.');
      } else if (!Array.isArray(c.values) || !c.values.length || c.values.some(v => !['number', 'string', 'boolean'].includes(typeof v))) throw new Error(p.key + ': enter at least one valid choice.');
    }
    total += count;
  }
  if (!Number.isSafeInteger(total) || total > settings.maxRuns) throw new Error('This search needs ' + total.toLocaleString() + ' runs; increase the run limit or narrow the search.');
  return total;
}
export function sample(app, settings, index, count = appRunCount(app, settings)) {
  const state = clone(settings.toolbar || {}), requested = {};
  let stride = 1, dim = 0;
  for (const { p, c } of dimensions(app, settings)) {
    if (p.type === 'button') continue;
    let value = c.fixed ?? p.default;
    if (c.enabled) {
      const rng = random(settings.seed + ':' + app.id + ':' + p.key + ':' + index);
      let t;
      const n = valuesCount(p, c, settings);
      switch (settings.method) {
        case 'grid': t = n === 1 ? 0 : (Math.floor(index / stride) % n) / (n - 1); stride *= n; break;
        case 'random': t = rng(); break;
        case 'halton': t = (radical(index + 1, prime(dim)) + random(settings.seed + ':' + p.key)()) % 1; break;
        case 'ascending': case 'descending':
          t = count === 1 || index === 0 ? 0 : index === count - 1 ? 1 : (index - 0.5 + rng()) / (count - 1);
          if (settings.method === 'descending') t = 1 - t;
          break;
        case 'alternating': { const rank = index % 2 === 0 ? count - 1 - index / 2 : (index - 1) / 2; t = count === 1 ? 1 : rank / (count - 1); break; }
        default: t = (permutation(count, settings.seed + ':' + app.id + ':' + p.key)[index] + rng()) / count;
      }
      if (p.type === 'number') {
        const b = bounds(p, c);
        value = b.min + t * (b.max - b.min);
        if (c.step > 0 && t !== 1) value = b.min + Math.round((value - b.min) / c.step) * c.step;
        value = Math.min(b.max, Math.max(b.min, Number(value.toPrecision(12))));
      } else value = c.values[Math.min(c.values.length - 1, Math.floor(t * c.values.length))];
      dim++;
    }
    if (value !== undefined) { setPath(state, p.key, value); requested[p.key] = value; }
  }
  return { state, requested };
}

