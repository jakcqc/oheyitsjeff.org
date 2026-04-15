// Editable ScriptOps file: scale circles into multiple copies.
//
// Load this file via the `scriptOps` tab -> "load .js file".
// Edit only the config section, then re-run or re-load.

// ----------------------------- config -----------------------------
const selector = "circle";
const range = [0.5, 1.5, 10]; // [minScale, maxScale, count]
const spacing = "linear"; // "linear" | "easeInOut"
const spacingFn = null; // (t) => t; // optional custom spacing in [0,1]
const opacity = null; // null => auto, false => none, number => fixed, [min,max] => ramp
const debug = true;

// ------------------------------ run ------------------------------
// eslint-disable-next-line no-console
console.log("[scriptOps][scaleCircles.user] root:", ctx.root, "selector:", selector);

// Filter: only circles with stroke-width values 0..1 inclusive
// (supports attribute or inline style; accepts "1", "0.5", "1px", etc.)
const circles = Array.from(ctx.root.querySelectorAll(selector));
let eligible = 0;
const parseNumberLike = (v) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!m) return NaN;
  return Number(m[0]);
};
for (const c of circles) {
  c.removeAttribute("data-scale-skip"); // clear from previous runs
  const swAttr = c.getAttribute("stroke-width");
  const style = c.getAttribute("style") || "";
  const m = style.match(/(^|;)\s*stroke-width\s*:\s*([^;]+)/i);
  const sw = swAttr != null ? parseNumberLike(swAttr) : (m ? parseNumberLike(m[2]) : NaN);
  if (Number.isFinite(sw) && sw >= 0 && sw <= 1) eligible++;
  else c.setAttribute("data-scale-skip", "1");
}

// eslint-disable-next-line no-console
console.log("[scriptOps][scaleCircles.user] circles:", circles.length, "eligible (0<=stroke-width<=1):", eligible);

const stats = ctx.utils.scaleCirclesInSubtree({
  selector: `${selector}:not([data-scale-skip])`,
  range,
  spacing,
  spacingFn,
  opacity,
  debug,
});

// eslint-disable-next-line no-console
console.log("[scriptOps][scaleCircles.user] done:", stats);
