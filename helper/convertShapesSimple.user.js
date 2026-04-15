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

