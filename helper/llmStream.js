/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Preview only. Partial JSON must never be used to validate or execute actions.
function readString(source, start) {
  let end = start + 1;
  while (end < source.length) {
    if (source[end] === '"') {
      try { return { value: JSON.parse(source.slice(start, end + 1)), end, closed: true }; }
      catch { return null; }
    }
    if (source[end] === "\\") {
      const width = source[end + 1] === "u" ? 6 : 2;
      if (end + width > source.length) break;
      end += width;
    } else end++;
  }
  try {
    // Wait for a split escape sequence instead of displaying its JSON encoding.
    const value = JSON.parse(source.slice(start, end) + '"');
    return { value: value.replace(/[\uD800-\uDBFF]$/, ""), end, closed: false };
  } catch { return null; }
}

export function streamedAssistantMessage(source) {
  if (typeof source !== "string" || !source.trimStart().startsWith("{")) return "";
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      const key = readString(source, i);
      if (!key?.closed) return "";
      i = key.end;
      if (depth !== 1 || key.value !== "message") continue;
      let next = i + 1;
      while (/\s/.test(source[next] || "X")) next++;
      if (source[next++] !== ":") continue;
      while (/\s/.test(source[next] || "X")) next++;
      return source[next] === '"' ? readString(source, next)?.value || "" : "";
    }
    if (char === "{" || char === "[") depth++;
    if (char === "}" || char === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  return "";
}
