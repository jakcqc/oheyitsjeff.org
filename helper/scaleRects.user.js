/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Editable ScriptOps file: scale rects into multiple copies.
//
// Load this file via the `scriptOps` tab -> "load .js file".

// ----------------------------- config -----------------------------
const selector = "rect";
const range = [0.5, 1.5, 10]; // [minScale, maxScale, count]
const spacing = "linear"; // "linear" | "easeInOut"
const spacingFn = null; // (t) => t;
const opacity = null; // null => auto, false => none, number => fixed, [min,max] => ramp
const debug = true;

// ------------------------------ run ------------------------------
// eslint-disable-next-line no-console
console.log("[scriptOps][scaleRects.user] root:", ctx.root, "selector:", selector);

const stats = ctx.utils.scaleRectsInSubtree({
  selector,
  range,
  spacing,
  spacingFn,
  opacity,
  debug,
});

// eslint-disable-next-line no-console
console.log("[scriptOps][scaleRects.user] done:", stats);

