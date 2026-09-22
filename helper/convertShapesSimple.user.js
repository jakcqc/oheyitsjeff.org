/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Editable ScriptOps file: convert shapes (simple frontend wrapper).
//
// Load via `scriptOps` tab -> "load .js file".

// ----------------------------- config -----------------------------
const fromTag = "path";     // "circle" | "rect" | "polygon" | "path"
const toTag = "circle";     // "circle" | "rect" | "polygon" | "path"
const selector = null;      // null => all `fromTag`, or any CSS selector
const pathSamplePoints = 64; // only used for path -> polygon
const debug = true;

// ------------------------------ run ------------------------------
const stats = ctx.utils.convertShapesInSubtree({
  fromTag,
  toTag,
  selector,
  pathSamplePoints,
  debug,
});

// eslint-disable-next-line no-console
console.log("[scriptOps][convertShapesSimple] done:", stats);

