/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */

/**
 * Generalized Field–Golubitsky map, with real coefficients and integer n, p.
 * f(z) = [a0 + a1|z|² + a2 Re(z^n) + a3|z|cos(np arg z)]z
 *        + a4 conjugate(z)^(n-1).
 *
 * Source: Field & Golubitsky, “Symmetric Chaos”, Computers in Physics (1990),
 * equations (1a), (1d). The fivefold classic and sixfold presets appear there;
 * other presets are numerical explorations of the same family.
 * https://www.asc.ohio-state.edu/golubitsky.4/reprintweb-0.5/output/papers/symmetric_chaos.pdf
 *
 * Equivariance of a map does not guarantee that every individual attractor has
 * the full symmetry. Points here always come from one orbit, without copying
 * or reflecting points to manufacture symmetry. “Bounded” describes a finite
 * numerical observation, not a proof of chaos or indefinite boundedness.
 */

const makePreset = (id, name, n, p, a, note) => Object.freeze({
  id, name, n, p, a: Object.freeze(a),
  // Neither coordinate is zero, and this seed avoids the reflection axes.
  seed: Object.freeze([0.13, 0.17]), note,
});

export const PRESETS = Object.freeze([
  makePreset('fivefold-bloom', 'Fivefold bloom', 5, 1, [-2.4, 3.8, 0.85, 0, 1],
    'A fivefold orbit with fast coverage of its reflection sectors.'),
  makePreset('fivefold-classic', 'Fivefold classic', 5, 1, [-1.806, 1.806, 0, 0, 1],
    'Field and Golubitsky’s published fivefold example; its sectors fill slowly.'),
  makePreset('triad', 'Triad', 3, 1, [-2.38, 1, 0, 0, 0.1],
    'A triangular example from the symmetry creation sequence in the original paper.'),
  makePreset('quadrature', 'Quadrature', 4, 1, [2.5, -2.5, 0, 0, 0.9],
    'Fourfold dynamics from a numerically explored polynomial map.'),
  makePreset('hexalace', 'Hexalace', 6, 1, [-2.7, 5, 2, 0, 1],
    'Field and Golubitsky’s published sixfold example.'),
  makePreset('sevenfold-crown', 'Sevenfold crown', 7, 3, [-2.4, 3.8, 0.85, -0.35, 1],
    'The generalized angular term adds structure within seven sectors.'),
  makePreset('octave', 'Octave', 8, 1, [-2.7, 5, 2, 0, 1],
    'Eightfold dynamics from a numerically explored polynomial map.'),
  makePreset('ninefold-filament', 'Ninefold filament', 9, 3, [-2.4, 3.8, 0.85, -0.35, 1],
    'The published ninefold generalized example, with angular harmonic p = 3.'),
  makePreset('fivefold-echo', 'Fivefold echo', 5, 3, [-2.4, 3.8, 0.85, -0.15, 1],
    'A fivefold variation with the extra angular harmonic switched on.'),
]);

const boundedNumber = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** Return a fresh, finite map definition; never mutate controls or presets. */
export function normalizeMap(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  const base = PRESETS[0];
  const a = base.a.map((fallback, i) => boundedNumber(
    input.a?.[i] ?? input[`a${i}`] ?? fallback, fallback, -8, 8,
  ));
  const seed = base.seed.map((fallback, i) => {
    const coordinate = Number(input.seed?.[i] ?? fallback);
    return Number.isFinite(coordinate) ? coordinate : fallback;
  });
  return {
    n: Math.round(boundedNumber(input.n ?? base.n, base.n, 3, 12)),
    p: Math.round(boundedNumber(input.p ?? base.p, base.p, 1, 6)),
    a, seed,
  };
}

/**
 * Evaluate one step using normalized parameters (or a PRESETS entry).
 * Complex integer powers avoid trigonometric work for polynomial presets.
 * At zero the angular factor has a continuous extension in the complete map:
 * its contribution has magnitude at most |a3| |z|², so f(0) = 0.
 */
export function step(x, y, params, out = [0, 0]) {
  const radiusSquared = x * x + y * y;
  if (radiusSquared === 0) {
    out[0] = 0;
    out[1] = 0;
    return out;
  }
  const { n, p, a } = params;
  let real = x;
  let imaginary = y;
  for (let power = 1; power < n - 1; power += 1) {
    const nextReal = real * x - imaginary * y;
    imaginary = real * y + imaginary * x;
    real = nextReal;
  }
  const realNthPower = real * x - imaginary * y;
  let factor = a[0] + a[1] * radiusSquared + a[2] * realNthPower;
  if (a[3] !== 0) {
    factor += a[3] * Math.sqrt(radiusSquared) * Math.cos(n * p * Math.atan2(y, x));
  }
  out[0] = factor * x + a[4] * real;
  out[1] = factor * y - a[4] * imaginary;
  return out;
}

// Require four complete repetitions, with up to 128 comparisons. A single
// close return in a chaotic orbit must not be mistaken for a periodic orbit.
function shortPeriod(points, count, radius) {
  const windowSize = Math.min(count, 128);
  const tolerance = 1e-11 * Math.max(1, radius);
  for (let period = 1; period <= Math.min(32, Math.floor(windowSize / 4)); period += 1) {
    let matches = true;
    for (let i = count - windowSize + period; i < count; i += 1) {
      const previous = (i - period) * 2;
      const current = i * 2;
      if (Math.abs(points[current] - points[previous]) > tolerance
        || Math.abs(points[current + 1] - points[previous + 1]) > tolerance) {
        matches = false;
        break;
      }
    }
    if (matches) return period;
  }
  return 0;
}

/**
 * Sample one deterministic orbit after discarding its transient.
 * Returns {points: Float64Array, count, maxRadius, status, message, iterations}.
 * points contains x0,y0,x1,y1,…; collapsed/periodic results contain one cycle.
 * An escaped result contains no points, so transient escape paths are not
 * displayed as an attractor. Sampling is capped at 300,000 retained iterates.
 */
export function sampleOrbit(params, options = {}) {
  const map = normalizeMap(params);
  const requestedCount = Math.round(boundedNumber(options.count ?? 80000, 80000, 1, 300000));
  const burnIn = Math.round(boundedNumber(options.burnIn ?? 3000, 3000, 0, 50000));
  const seed = options.seed ?? map.seed;
  let x = Number(seed?.[0]);
  let y = Number(seed?.[1]);
  if (!Number.isFinite(x)) x = map.seed[0];
  if (!Number.isFinite(y)) y = map.seed[1];
  const points = new Float64Array(requestedCount * 2);
  const next = new Float64Array(2);
  let count = 0;
  let iterations = 0;
  let maxRadius = 0;

  const result = (status, message, period = 0) => {
    let output = points;
    if (status === 'escaped') {
      output = new Float64Array(0);
    } else if (period > 0) {
      output = points.slice((count - period) * 2, count * 2);
    } else if (count < requestedCount) {
      output = points.slice(0, count * 2);
    }
    return { points: output, count: output.length / 2, maxRadius, status, message, iterations };
  };

  if (Math.hypot(x, y) > 1000) {
    return result('escaped', 'The starting point is outside the escape radius.');
  }

  for (let i = 0; i < burnIn + requestedCount; i += 1) {
    step(x, y, map, next);
    x = next[0];
    y = next[1];
    iterations += 1;
    const radius = Math.hypot(x, y);
    if (!Number.isFinite(radius) || radius > 1000) {
      return result('escaped', 'This orbit escaped. Try a preset or adjust the coefficients.');
    }
    if (i < burnIn) continue;
    points[count * 2] = x;
    points[count * 2 + 1] = y;
    count += 1;
    maxRadius = Math.max(maxRadius, radius);
    if (count === 128 || count === 512 || count % 4096 === 0 || count === requestedCount) {
      const period = shortPeriod(points, count, maxRadius);
      if (period === 1) return result('collapsed', 'This orbit settled to a fixed point.', 1);
      if (period > 1) return result('periodic', `This orbit settled to a short cycle (period ${period}).`, period);
    }
  }
  return result('bounded', 'A bounded orbit over the sampled iterations.');
}
