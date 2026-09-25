/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */

// The catalog counts SVG vector elements, not file bytes or perceived detail.
// Stable ties preserve the current search relevance / catalog order.
export function sortStudies(records, order = 'relevance') {
  if (!['complexity-asc', 'complexity-desc'].includes(order)) return records;
  const direction = order === 'complexity-asc' ? 1 : -1;
  const count = record => Number.isFinite(record.elements) && record.elements >= 0 ? record.elements : null;
  return [...records].sort((a, b) => {
    const left = count(a), right = count(b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return direction * (left - right);
  });
}
