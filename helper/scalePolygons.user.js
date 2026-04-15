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

