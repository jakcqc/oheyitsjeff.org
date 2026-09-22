/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

function normalize(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Edit distance with adjacent transpositions, so "bacteira" matches "bacteria".
function distance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  rows[0] = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + Number(left[i - 1] !== right[j - 1]),
      );
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[left.length][right.length];
}

function wordScore(term, word) {
  if (word === term) return 1;
  if (word.startsWith(term)) return 0.9 + 0.05 * term.length / word.length;
  if (term.length >= 3 && word.includes(term)) return 0.75;
  const tolerance = term.length < 4 ? 0 : term.length < 8 ? 1 : 2;
  if (!tolerance || word.length < term.length - tolerance) return 0;
  // Also compare the word's beginning to support incomplete, misspelled input.
  const edits = Math.min(
    Math.abs(term.length - word.length) <= tolerance ? distance(term, word) : Infinity,
    distance(term, word.slice(0, term.length)),
  );
  return edits <= tolerance ? 0.65 - edits * 0.1 : 0;
}

function bestWordScore(term, words) {
  let best = 0;
  for (const word of words) {
    best = Math.max(best, wordScore(term, word));
    if (best === 1) break;
  }
  return best;
}

export function createAppSearch(items) {
  const index = items.map((item, order) => {
    const title = normalize(item.title);
    const description = normalize(item.description);
    return {
      item, order, title, description,
      titleWords: title.split(' '),
      descriptionWords: [...new Set(description.split(' '))],
    };
  });
  return query => {
    const phrase = normalize(query.slice(0, 160));
    if (!phrase) return items.slice();
    const terms = [...new Set(phrase.split(' '))];
    return index.map(entry => {
      let matched = 0;
      let score = 0;
      for (const term of terms) {
        const titleScore = bestWordScore(term, entry.titleWords);
        const descriptionScore = bestWordScore(term, entry.descriptionWords);
        if (titleScore || descriptionScore) matched++;
        // Match quality takes priority; title hits break similarly strong matches.
        score += Math.max(titleScore * 1.2, descriptionScore);
      }
      if (entry.title === phrase) score += 1;
      else if (entry.title.includes(phrase)) score += 0.5;
      if (entry.description.includes(phrase)) score += 0.25;
      return { ...entry, matched, score };
    }).filter(entry => entry.matched > 0)
      // Complete coverage always wins over matching only some query terms.
      .sort((a, b) => b.matched - a.matched || b.score - a.score || a.order - b.order)
      .map(entry => entry.item);
  };
}
