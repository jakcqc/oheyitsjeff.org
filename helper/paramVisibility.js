/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

const isValue = value => typeof value === 'string' || typeof value === 'boolean'
  || (typeof value === 'number' && Number.isFinite(value));

/** AND between selector paths, OR between each path's allowed values. */
export function matchesParamVisibility(shouldShowWhen, state) {
  if (shouldShowWhen == null) return true;
  if (typeof shouldShowWhen !== 'object' || Array.isArray(shouldShowWhen)) return false;
  const prototype = Object.getPrototypeOf(shouldShowWhen);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(shouldShowWhen).every(([path, expected]) => {
    const parts = path.split('.');
    if (parts.some(part => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) return false;
    const values = Array.isArray(expected) ? expected : [expected];
    if (!values.length || !values.every(isValue)) return false;
    let actual = state;
    for (const part of parts) {
      if (actual == null || typeof actual !== 'object' || !Object.hasOwn(actual, part)) return false;
      actual = actual[part];
    }
    return values.some(value => value === actual);
  });
}
