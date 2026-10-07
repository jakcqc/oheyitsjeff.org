/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

const TAU = Math.PI * 2;
const MAX_COORDINATE = 1e12;
const MAX_NORMALIZED = 1e4;
const POLE_RADIUS = 1e-5;

export const MATH_TRANSFORM_TYPES = Object.freeze([
  'vortex', 'mobius', 'power', 'root', 'wrap', 'annulus', 'joukowski',
]);

function number(value, fallback) {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  if (typeof value === 'string' && !value.trim()) return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function clamp(value, fallback, min, max) {
  return Math.max(min, Math.min(max, number(value, fallback)));
}

function coordinate(value) {
  const result = number(value, null);
  return result === null ? null : Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, result));
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

/** Normalize serialized settings without changing the supplied object. */
export function normalizeMathTransform(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const power = Math.round(clamp(source.power, 2, 2, 12));
  let mobiusRe = clamp(source.mobiusRe, 0.35, -0.9, 0.9);
  let mobiusIm = clamp(source.mobiusIm, 0, -0.9, 0.9);
  const modulus = Math.hypot(mobiusRe, mobiusIm);
  if (modulus > 0.9) {
    mobiusRe *= 0.9 / modulus;
    mobiusIm *= 0.9 / modulus;
  }
  const innerRadius = clamp(source.innerRadius, 0.2, 0.02, 2);
  return {
    type: MATH_TRANSFORM_TYPES.includes(source.type) ? source.type : 'vortex',
    center: { x: coordinate(source.center?.x), y: coordinate(source.center?.y) },
    scale: clamp(source.scale, 1, 0.1, 4),
    strength: clamp(source.strength, 1, -20, 20),
    radius: clamp(source.radius, 0.8, 0.05, 4),
    mobiusRe,
    mobiusIm,
    power,
    branch: modulo(Math.round(clamp(source.branch, 0, -MAX_COORDINATE, MAX_COORDINATE)), power),
    allBranches: source.allBranches === true || source.allBranches === 'true' || source.allBranches === 1,
    wrapX: clamp(source.wrapX, 0.25, -10, 10),
    wrapY: clamp(source.wrapY, 0, -10, 10),
    wrapScale: clamp(source.wrapScale, 1, 0.25, 4),
    topology: ['torus', 'mobius', 'klein'].includes(source.topology) ? source.topology : 'torus',
    innerRadius,
    outerRadius: clamp(source.outerRadius, 0.95, innerRadius + 0.01, 4),
    turns: Math.round(clamp(source.turns, 1, 1, 8)),
    lambda: clamp(source.lambda, 0.3, -2, 2),
  };
}

function resolveCenter(value, origin, size) {
  if (value === null) return origin + size / 2;
  return value >= 0 && value <= 1 ? origin + value * size : value;
}

function distanceToSegmentSquared(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared,
  )) : 0;
  return (a[0] + t * dx - point[0]) ** 2 + (a[1] + t * dy - point[1]) ** 2;
}

/**
 * A view-space nonlinear map. Complex coordinates retain the SVG y direction;
 * positive angles therefore turn clockwise on screen. Uniform normalization
 * preserves aspect ratio even when the SVG viewBox is rectangular.
 *
 * Sources: Möbius maps and complex powers/exponentials:
 * https://people.maths.ox.ac.uk/hewitt/publications/C5_6_notes.pdf
 * Root sheets and cyclic monodromy (the z^n covering, not arbitrary Galois groups):
 * https://terrytao.wordpress.com/2018/08/28/trying-to-understand-the-galois-correspondence/
 * Rectangular quotient charts:
 * https://virtualmath1.stanford.edu/~conrad/diffgeomPage/handouts/qtmanifold.pdf
 *
 * Regions distinguish rectangular charts. crossesSeam must also be checked
 * between consecutive SOURCE points: a complex root's branch cut cannot be
 * represented by region labels without spuriously cutting the positive axis.
 * Null samples exclude poles, points outside bounded strips, and excessive
 * output coordinates. The renderer must split paths rather than join across
 * these excluded regions. The Möbius strip / Klein bottle are quotient charts,
 * not claims of faithful embeddings of these surfaces into the SVG plane.
 */
export function createMathMapper(input = {}, viewBox = {}, branchOverride) {
  const config = normalizeMathTransform(input);
  const bounds = viewBox && typeof viewBox === 'object' ? viewBox : {};
  const x = clamp(bounds.x, 0, -MAX_COORDINATE, MAX_COORDINATE);
  const y = clamp(bounds.y, 0, -MAX_COORDINATE, MAX_COORDINATE);
  const w = clamp(bounds.w, 1, 1e-6, MAX_COORDINATE);
  const h = clamp(bounds.h, 1, 1e-6, MAX_COORDINATE);
  const center = [resolveCenter(config.center.x, x, w), resolveCenter(config.center.y, y, h)];
  const size = Math.min(w, h) / 2 * config.scale;
  const branch = branchOverride === undefined ? config.branch
    : modulo(Math.round(number(branchOverride, config.branch)), config.power);
  const branches = config.type === 'root' && config.allBranches
    ? Array.from({ length: config.power }, (_, index) => index) : [config.type === 'root' ? branch : 0];
  const normalize = (px, py) => [(px - center[0]) / size, (py - center[1]) / size];
  const nullSample = region => ({ point: null, region });
  const finish = (re, im, region = config.type) => {
    if (!Number.isFinite(re) || !Number.isFinite(im) || Math.hypot(re, im) > MAX_NORMALIZED) return nullSample(region);
    const point = [center[0] + size * re, center[1] + size * im];
    return point.every(value => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE * 10)
      ? { point, region } : nullSample(region);
  };
  const wrapCoordinates = (px, py) => {
    const u = (px - x) / w * config.wrapScale + config.wrapX;
    const rawV = (py - y) / h * config.wrapScale + config.wrapY;
    const q = Math.floor(u);
    const v = config.topology !== 'torus' && modulo(q, 2) === 1 ? 1 - rawV : rawV;
    return { u, v, q, row: Math.floor(v) };
  };

  const sample = (px, py) => {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return nullSample('invalid');
    if (config.type === 'wrap') {
      const { u, v, q, row } = wrapCoordinates(px, py);
      const region = config.topology === 'mobius' ? `wrap:${q}` : `wrap:${q}:${row}`;
      if (!Number.isFinite(u) || !Number.isFinite(v) || (config.topology === 'mobius' && (v < 0 || v > 1))) return nullSample(region);
      return { point: [x + (u - q) * w, y + (config.topology === 'mobius' ? v : v - row) * h], region };
    }
    if (config.type === 'annulus') {
      const u = (px - x) / w;
      if (u < 0 || u > 1) return nullSample('annulus');
      const v = (py - y) / h;
      const radius = config.innerRadius * (config.outerRadius / config.innerRadius) ** u;
      const angle = TAU * modulo(v * config.turns, 1);
      return finish(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    const [re, im] = normalize(px, py);
    if (!Number.isFinite(re) || !Number.isFinite(im)) return nullSample('invalid');
    const radiusSquared = re * re + im * im;
    switch (config.type) {
      case 'vortex': {
        // Exact time-strength Hamiltonian flow for H=-(R²/2)exp(-r²/R²),
        // using xdot=dH/dy and ydot=-dH/dx:
        // r is constant and theta' = theta - strength*exp(-r²/R²).
        const angle = -config.strength * Math.exp(-radiusSquared / config.radius ** 2);
        return finish(re * Math.cos(angle) - im * Math.sin(angle), re * Math.sin(angle) + im * Math.cos(angle));
      }
      case 'mobius': {
        // (z-a)/(1-conjugate(a)*z), |a|<1, is a disk automorphism.
        const dr = 1 - config.mobiusRe * re - config.mobiusIm * im;
        const di = config.mobiusIm * re - config.mobiusRe * im;
        const denominator = dr * dr + di * di;
        if (denominator < POLE_RADIUS ** 2) return nullSample('mobius');
        const nr = re - config.mobiusRe;
        const ni = im - config.mobiusIm;
        return finish((nr * dr + ni * di) / denominator, (ni * dr - nr * di) / denominator);
      }
      case 'power':
      case 'root': {
        const theta = im === 0 && re < 0 ? Math.PI : Math.atan2(im, re);
        const root = config.type === 'root';
        const radius = Math.hypot(re, im) ** (root ? 1 / config.power : config.power);
        const angle = root ? (theta + TAU * branch) / config.power : theta * config.power;
        return finish(radius * Math.cos(angle), radius * Math.sin(angle));
      }
      case 'joukowski': {
        if (config.lambda === 0) return finish(re, im);
        if (radiusSquared < POLE_RADIUS ** 2) return nullSample('joukowski');
        return finish(re + config.lambda * re / radiusSquared, im - config.lambda * im / radiusSquared);
      }
      default:
        return finish(re, im);
    }
  };

  const crossesSeam = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || ![...a, ...b].every(Number.isFinite)) return true;
    const first = sample(a[0], a[1]);
    const last = sample(b[0], b[1]);
    if (!first.point || !last.point || first.region !== last.region) return true;
    const na = normalize(a[0], a[1]);
    const nb = normalize(b[0], b[1]);
    if (config.type === 'root' && (na[1] < 0) !== (nb[1] < 0)) {
      const t = -na[1] / (nb[1] - na[1]);
      return na[0] + t * (nb[0] - na[0]) < 0;
    }
    if (config.type === 'joukowski' && config.lambda !== 0) {
      return distanceToSegmentSquared([0, 0], na, nb) < POLE_RADIUS ** 2;
    }
    if (config.type === 'mobius') {
      const norm = config.mobiusRe ** 2 + config.mobiusIm ** 2;
      if (norm > 0) {
        const pole = [config.mobiusRe / norm, config.mobiusIm / norm];
        return distanceToSegmentSquared(pole, na, nb) < POLE_RADIUS ** 2 / norm;
      }
    }
    return false;
  };

  return { config, sample, crossesSeam, branches, center, size };
}
