/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Editable ScriptOps file: scale polygons into multiple copies.
//
// Load this file via the `scriptOps` tab -> "load .js file".
// Edit only the config section, then re-run or re-load.

// ----------------------------- config -----------------------------
const selector = "polygon";
const range = [0.5, 1.5, 10]; // [minScale, maxScale, count]
const spacing = "linear"; // "linear" | "easeInOut"
const spacingFn = null; // (t) => t; // optional custom spacing in [0,1]
const opacity = null; // null => auto, false => none, number => fixed, [min,max] => ramp

// ------------------------------ run ------------------------------
ctx.utils.scalePolygonsInSubtree({
  selector,
  range,
  spacing,
  spacingFn,
  opacity,
});

