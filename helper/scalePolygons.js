// ScriptOps: scale polygons into multiple copies.
//
// Configure:
// - range: [minScale, maxScale, count]
// - spacing: "linear" (default) | "easeInOut"
//   (If you want custom spacing, set `spacingFn`.)
// - targetSelector: which elements to scale (default: "polygon")
//
// This script is designed to run in the ScriptOps tab context:
//   new Function("ctx", code)(ctx)
//
// ctx.root: subtree element being processed (usually a <g>)
// ctx.create(tagName): creates SVG element in correct namespace

const range = [0.5, 1.5, 10];
const spacing = "linear";
const spacingFn = null; // (t) => t; // t in [0,1]
const targetSelector = "polygon";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  // smoothstep
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function parsePoints(pointsStr) {
  const s = String(pointsStr || "").trim();
  if (!s) return [];
  const nums = s
    .replace(/,/g, " ")
    .split(/\s+/)
    .map(Number)
    .filter(n => Number.isFinite(n));
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function formatPoints(pts) {
  return pts.map(([x, y]) => `${x},${y}`).join(" ");
}

function centroid(pts) {
  if (!pts.length) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / pts.length, sy / pts.length];
}

function scaleAbout(pts, cx, cy, s) {
  return pts.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]);
}

function getScaleAtIndex(i, count, minS, maxS) {
  if (count <= 1) return minS;
  let t = i / (count - 1);
  if (typeof spacingFn === "function") t = clamp(Number(spacingFn(t)), 0, 1);
  else if (spacing === "easeInOut") t = easeInOut(t);
  return lerp(minS, maxS, t);
}

function copyAttributes(fromEl, toEl) {
  for (const { name, value } of Array.from(fromEl.attributes)) {
    if (name === "points") continue;
    if (name === "id") continue;
    if (name.startsWith("data-scale-")) continue;
    toEl.setAttribute(name, value);
  }
}

// ---- main ----
const [minScaleRaw, maxScaleRaw, countRaw] = range;
const minScale = Number(minScaleRaw);
const maxScale = Number(maxScaleRaw);
const count = Math.max(1, Math.trunc(Number(countRaw)));
if (!Number.isFinite(minScale) || !Number.isFinite(maxScale) || !Number.isFinite(count)) {
  throw new Error(`invalid range: ${JSON.stringify(range)}`);
}

const polys = Array.from(ctx.root.querySelectorAll(targetSelector))
  .filter(p => !p.closest('g[data-scale-stack="1"]'))
  .filter(p => !p.hasAttribute("data-scale-clone"));

for (const poly of polys) {
  if (String(poly.tagName || "").toLowerCase() !== "polygon") {
    throw new Error(`targetSelector must match <polygon> elements in this script (got: ${targetSelector})`);
  }
  const pts = parsePoints(poly.getAttribute("points"));
  if (pts.length < 3) continue;

  const [cx, cy] = centroid(pts);

  const g = ctx.create("g");
  g.setAttribute("data-scale-stack", "1");

  for (let i = 0; i < count; i++) {
    const s = getScaleAtIndex(i, count, minScale, maxScale);
    const nextPts = scaleAbout(pts, cx, cy, s);

    const p = ctx.create("polygon");
    p.setAttribute("data-scale-clone", "1");
    p.setAttribute("points", formatPoints(nextPts));
    copyAttributes(poly, p);
    p.setAttribute("data-scale-factor", String(s));

    // Optional subtle depth cue; comment out if undesired.
    const style = p.getAttribute("style") || "";
    const hasOpacityStyle = /(^|;)\s*opacity\s*:/.test(style);
    const hasOpacityAttr = p.hasAttribute("opacity");
    if (!hasOpacityStyle && !hasOpacityAttr) {
      const alpha = lerp(0.25, 1, count <= 1 ? 1 : i / (count - 1));
      p.setAttribute("style", (style ? style + ";" : "") + `opacity:${alpha.toFixed(3)}`);
    }

    g.appendChild(p);
  }

  poly.replaceWith(g);
}
