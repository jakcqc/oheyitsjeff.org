/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// A separate PRNG stream randomizes starting parameters without consuming the
// app's own geometry randomness. Persist the returned receipt with every export.
export function applyStudyRandomization(state, config, parameterKeys) {
  if (config.algorithm !== 'mulberry32-v1' || !Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff) {
    throw new Error('Expected mulberry32-v1 and a uint32 seed');
  }
  const allowed = new Set(parameterKeys);
  const seen = new Set();
  let cursor = config.seed;
  function random() {
    cursor = (cursor + 0x6d2b79f5) | 0;
    let t = cursor;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  if (!Array.isArray(config.rules) || !config.rules.length) throw new Error('Randomization rules are required');
  // Validate and sample all rules before mutating, so a malformed rule cannot
  // leave the starting state partially randomized.
  const updates = config.rules.map(rule => {
    const parts = typeof rule.path === 'string' ? rule.path.split('.') : [];
    if (!allowed.has(rule.path) || seen.has(rule.path) || !parts.length || parts.some(part => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(part) || ['constructor', 'prototype', '__proto__'].includes(part))) {
      throw new Error('Unknown, duplicate, or unsafe parameter: ' + rule.path);
    }
    seen.add(rule.path);
    let owner = state;
    for (const part of parts.slice(0, -1)) {
      if (!owner || !Object.hasOwn(owner, part)) throw new Error('Missing parameter: ' + rule.path);
      owner = owner[part];
    }
    const key = parts.at(-1);
    if (!owner || !Object.hasOwn(owner, key)) throw new Error('Missing parameter: ' + rule.path);
    const before = owner[key];
    let value;
    if (rule.op === 'choice') {
      if (!Array.isArray(rule.values) || !rule.values.length || rule.values.some(v => !['string','number','boolean'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v)))) throw new Error('Invalid choices');
      value = rule.values[Math.floor(random() * rule.values.length)];
    } else {
      if (!['uniform', 'integer', 'add', 'multiply'].includes(rule.op) || !Number.isFinite(rule.min) || !Number.isFinite(rule.max) || rule.min > rule.max) throw new Error('Invalid sampling range');
      if (rule.op === 'integer' && (!Number.isSafeInteger(rule.min) || !Number.isSafeInteger(rule.max))) throw new Error('Integer bounds required');
      if (rule.op === 'integer') value = rule.min + Math.floor(random() * (rule.max - rule.min + 1));
      else {
        value = rule.min + random() * (rule.max - rule.min);
        if (rule.op === 'add' || rule.op === 'multiply') {
          if (!Number.isFinite(before)) throw new Error('Numeric baseline required');
          value = rule.op === 'add' ? before + value : before * value;
        }
        const digits = rule.digits ?? 4;
        if (!Number.isInteger(digits) || digits < 0 || digits > 12) throw new Error('Invalid precision');
        value = Number(value.toFixed(digits));
      }
      if (!Number.isFinite(value)) throw new Error('Nonfinite randomized value');
    }
    return { owner, key, sample: { ...structuredClone(rule), before: structuredClone(before), value } };
  });
  for (const { owner, key, sample } of updates) owner[key] = sample.value;
  return {
    version: 1,
    algorithm: config.algorithm,
    seed: config.seed,
    operation: 'R_seed(p): randomize starting native parameters before G renders and before any algebra flow',
    samples: updates.map(update => update.sample),
  };
}
