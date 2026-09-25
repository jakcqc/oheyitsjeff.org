/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

const finite = (value) => typeof value === "number" && Number.isFinite(value);

// Keep learned ranges in saved visual state, never in the shared parameter schema.
export function getParamRange(state, param, axis) {
  const path = axis ? `${param.key}.${axis}` : param.key;
  const bound = (value) => axis && typeof value === "object" && value ? value[axis] : value;
  const declaredMin = bound(param.min);
  const declaredMax = bound(param.max);
  let min = finite(declaredMin) ? declaredMin : undefined;
  let max = finite(declaredMax) ? declaredMax : undefined;
  const learned = state.overrideMinMax !== false ? state.__paramRanges?.[path] : null;
  if (finite(learned?.min)) min = min == null ? learned.min : Math.min(min, learned.min);
  if (finite(learned?.max)) max = max == null ? learned.max : Math.max(max, learned.max);
  return { min, max };
}

export function acceptTypedNumber(state, param, axis, value) {
  if (!finite(value)) return undefined;
  if (state.overrideMinMax === false) {
    const { min, max } = getParamRange(state, param, axis);
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
  }
  const path = axis ? `${param.key}.${axis}` : param.key;
  const ranges = state.__paramRanges || (state.__paramRanges = {});
  const prior = Object.hasOwn(ranges, path) ? ranges[path] : null;
  ranges[path] = {
    min: finite(prior?.min) ? Math.min(prior.min, value) : value,
    max: finite(prior?.max) ? Math.max(prior.max, value) : value,
  };
  return value;
}
