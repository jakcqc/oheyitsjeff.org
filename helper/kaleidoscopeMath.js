/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Keep imported settings within useful SVG coordinate bounds, including when
// their finite numeric values would otherwise overflow during matrix arithmetic.
const MAX_COORDINATE = 1e12;
const DEG_TO_RAD = Math.PI / 180;

function finiteNumber(value, fallback) {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedCoordinate(value, fallback) {
  const number = finiteNumber(value, fallback);
  return number === null ? null : Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, number));
}

function cleanTrig(value) {
  return Math.abs(value) < 1e-14 ? 0 : value;
}

/**
 * N is the rotational order: mirrored mode has 2N sectors (the dihedral group
 * D_N); rotation-only mode has N sectors (the cyclic group C_N).
 * Null centers mean automatic, and survive JSON save/load without becoming 0.
 * Finite center coordinates in [0, 1] are fractions of the viewBox dimensions.
 */
export function normalizeKaleidoscope(input = {}) {
  const config = input && typeof input === "object" ? input : {};
  const rotation = finiteNumber(config.rotationDeg, 0);
  return {
    count: Math.max(2, Math.min(64, Math.round(finiteNumber(config.count, 6)))),
    mirror: config.mirror !== false && config.mirror !== "false" && config.mirror !== 0,
    rotationDeg: ((rotation % 360) + 360) % 360,
    center: {
      x: boundedCoordinate(config.center?.x, null),
      y: boundedCoordinate(config.center?.y, null),
    },
  };
}

function resolveCenter(value, origin, size) {
  if (value === null) return origin + size / 2;
  return value >= 0 && value <= 1 ? origin + value * size : value;
}

/**
 * Build the source clip and transforms without touching the DOM.
 *
 * clipPath is an SVG path `d` in user coordinates. Clip the source first, then
 * transform that clipped group once for each sectors[i].transform. Transforming
 * the source and clip together is necessary for adjacent reflected sectors.
 * The enclosing SVG supplies the final rectangular viewport clip.
 *
 * Each sector also reports its unwrapped angular interval, which makes full
 * coverage explicit even when rotationDeg crosses the 360-degree boundary.
 */
export function buildKaleidoscopeGeometry(input = {}, viewBox = {}) {
  const config = normalizeKaleidoscope(input);
  const bounds = viewBox && typeof viewBox === "object" ? viewBox : {};
  const x = boundedCoordinate(bounds.x, 0);
  const y = boundedCoordinate(bounds.y, 0);
  const rawWidth = finiteNumber(bounds.w, 1);
  const rawHeight = finiteNumber(bounds.h, 1);
  const w = rawWidth > 0 ? Math.min(MAX_COORDINATE, rawWidth) : 1;
  const h = rawHeight > 0 ? Math.min(MAX_COORDINATE, rawHeight) : 1;
  const center = {
    x: resolveCenter(config.center.x, x, w),
    y: resolveCenter(config.center.y, y, h),
  };
  const { x: cx, y: cy } = center;
  const radius = Math.max(
    1,
    Math.hypot(x - cx, y - cy),
    Math.hypot(x + w - cx, y - cy),
    Math.hypot(x - cx, y + h - cy),
    Math.hypot(x + w - cx, y + h - cy),
  ) * (1 + 1e-9);
  const sectorCount = config.count * (config.mirror ? 2 : 1);
  const sectorAngleDeg = 360 / sectorCount;
  const sourceStart = config.rotationDeg * DEG_TO_RAD;
  const sourceEnd = (config.rotationDeg + sectorAngleDeg) * DEG_TO_RAD;
  const startX = cx + radius * cleanTrig(Math.cos(sourceStart));
  const startY = cy + radius * cleanTrig(Math.sin(sourceStart));
  const endX = cx + radius * cleanTrig(Math.cos(sourceEnd));
  const endY = cy + radius * cleanTrig(Math.sin(sourceEnd));
  // An arc, rather than a triangle, covers the full wedge even for N=2's
  // half-circle in rotation-only mode. Every supported wedge is <= 180 degrees.
  const clipPath = `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY} Z`;
  const sectors = Array.from({ length: sectorCount }, (_, index) => {
    const mirrored = config.mirror && index % 2 === 1;
    // A reflection takes theta to 2*rotation + (index+1)*alpha - theta.
    // Thus source [rotation, rotation+alpha] maps exactly onto sector `index`.
    const angle = (mirrored
      ? 2 * config.rotationDeg + (index + 1) * sectorAngleDeg
      : index * sectorAngleDeg) * DEG_TO_RAD;
    const a = cleanTrig(Math.cos(angle));
    const b = cleanTrig(Math.sin(angle));
    const c = mirrored ? b : -b;
    const d = mirrored ? -a : a;
    const e = cx - a * cx - c * cy;
    const f = cy - b * cx - d * cy;
    return {
      index,
      transform: `matrix(${a} ${b} ${c} ${d} ${e} ${f})`,
      mirrored,
      startDeg: config.rotationDeg + index * sectorAngleDeg,
      endDeg: config.rotationDeg + (index + 1) * sectorAngleDeg,
    };
  });
  return { ...config, center, radius, sectorAngleDeg, clipPath, sectors };
}
