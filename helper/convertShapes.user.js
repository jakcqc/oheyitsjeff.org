// Editable ScriptOps file: convert one SVG shape type to another.
//
// Load via `scriptOps` tab -> "load .js file".
//
// Supported conversions:
// - circle -> rect (uses r => width/height = 2r)
// - rect -> circle (uses min(width,height)/2)
// - polygon -> path (builds `d` from points)
// - path -> circle/rect (uses getBBox() for sizing)
// - rect/circle/path/polygon -> path (path uses either real geometry or bbox fallback)

// ----------------------------- config -----------------------------
const fromTag = "path";      // "circle" | "rect" | "polygon" | "path"
const toTag = "circle";     // "circle" | "rect" | "polygon" | "path"
const selector = null;      // null => all `fromTag`, or any CSS selector
const debug = true;

// When converting path -> polygon, how many points to sample along length.
// (Only used if toTag === "polygon".)
const pathSamplePoints = 64;

// ------------------------------ helpers ------------------------------
const svgNS = "http://www.w3.org/2000/svg";
const create = (tag) => ctx.create ? ctx.create(tag) : document.createElementNS(svgNS, tag);

const parseNumberLike = (v, fallback = 0) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const copyAttrs = (fromEl, toEl, { skip = [] } = {}) => {
  const skipSet = new Set(["id", ...skip]);
  for (const { name, value } of Array.from(fromEl.attributes)) {
    if (skipSet.has(name)) continue;
    if (name.startsWith("data-convert-")) continue;
    toEl.setAttribute(name, value);
  }
};

const parsePoints = (pointsStr) => {
  const s = String(pointsStr || "").trim();
  if (!s) return [];
  const nums = s.replace(/,/g, " ").split(/\s+/).map(Number).filter(Number.isFinite);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
};

const formatPoints = (pts) => pts.map(([x, y]) => `${x},${y}`).join(" ");

const dFromPolygonPoints = (pts) => {
  if (!pts.length) return "";
  const [x0, y0] = pts[0];
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    d += ` L ${x} ${y}`;
  }
  return d + " Z";
};

const dFromRect = (x, y, w, h) => `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;

const dFromCircle = (cx, cy, r) => {
  // Two-arc circle
  const x0 = cx + r;
  const x1 = cx - r;
  return `M ${x0} ${cy} A ${r} ${r} 0 1 0 ${x1} ${cy} A ${r} ${r} 0 1 0 ${x0} ${cy} Z`;
};

const bboxOf = (el) => {
  try { return el.getBBox(); } catch { return null; }
};

// Convert by treating the element as a box (good for path->rect/circle)
const centerFromBBox = (bb) => ({ cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 });

// ------------------------------ convert ------------------------------
const root = ctx.root;
const from = String(fromTag).toLowerCase();
const to = String(toTag).toLowerCase();

const query = selector ? selector : from;
const els = Array.from(root.querySelectorAll(query))
  .filter(el => String(el.tagName || "").toLowerCase() === from)
  .filter(el => !el.closest('g[data-convert-stack="1"]'))
  .filter(el => !el.hasAttribute("data-convert-clone"));

const stats = { from, to, matched: els.length, converted: 0, skipped: 0 };

if (debug) {
  // eslint-disable-next-line no-console
  console.log("[scriptOps][convertShapes] from:", from, "to:", to, "matched:", els.length, "selector:", query);
}

for (const el of els) {
  let out = null;

  if (from === "circle" && to === "rect") {
    const cx = parseNumberLike(el.getAttribute("cx"), 0);
    const cy = parseNumberLike(el.getAttribute("cy"), 0);
    const r = parseNumberLike(el.getAttribute("r"), 0);
    if (!(r > 0)) { stats.skipped++; continue; }
    const rect = create("rect");
    rect.setAttribute("x", String(cx - r));
    rect.setAttribute("y", String(cy - r));
    rect.setAttribute("width", String(r * 2));
    rect.setAttribute("height", String(r * 2));
    copyAttrs(el, rect, { skip: ["cx", "cy", "r"] });
    out = rect;
  } else if (from === "rect" && to === "circle") {
    const x = parseNumberLike(el.getAttribute("x"), 0);
    const y = parseNumberLike(el.getAttribute("y"), 0);
    const w = parseNumberLike(el.getAttribute("width"), 0);
    const h = parseNumberLike(el.getAttribute("height"), 0);
    if (!(w > 0 && h > 0)) { stats.skipped++; continue; }
    const r = Math.min(w, h) / 2;
    const circle = create("circle");
    circle.setAttribute("cx", String(x + w / 2));
    circle.setAttribute("cy", String(y + h / 2));
    circle.setAttribute("r", String(r));
    copyAttrs(el, circle, { skip: ["x", "y", "width", "height", "rx", "ry"] });
    out = circle;
  } else if (to === "path") {
    const path = create("path");
    let d = "";

    if (from === "polygon") {
      const pts = parsePoints(el.getAttribute("points"));
      d = dFromPolygonPoints(pts);
      copyAttrs(el, path, { skip: ["points"] });
    } else if (from === "rect") {
      const x = parseNumberLike(el.getAttribute("x"), 0);
      const y = parseNumberLike(el.getAttribute("y"), 0);
      const w = parseNumberLike(el.getAttribute("width"), 0);
      const h = parseNumberLike(el.getAttribute("height"), 0);
      if (!(w > 0 && h > 0)) { stats.skipped++; continue; }
      d = dFromRect(x, y, w, h);
      copyAttrs(el, path, { skip: ["x", "y", "width", "height", "rx", "ry"] });
    } else if (from === "circle") {
      const cx = parseNumberLike(el.getAttribute("cx"), 0);
      const cy = parseNumberLike(el.getAttribute("cy"), 0);
      const r = parseNumberLike(el.getAttribute("r"), 0);
      if (!(r > 0)) { stats.skipped++; continue; }
      d = dFromCircle(cx, cy, r);
      copyAttrs(el, path, { skip: ["cx", "cy", "r"] });
    } else if (from === "path") {
      // identity (but still allows rewrite if you want to normalize later)
      d = String(el.getAttribute("d") || "");
      copyAttrs(el, path, { skip: [] });
    } else {
      stats.skipped++;
      continue;
    }

    if (!d.trim()) { stats.skipped++; continue; }
    path.setAttribute("d", d);
    out = path;
  } else if (from === "path" && (to === "rect" || to === "circle")) {
    const bb = bboxOf(el);
    if (!bb || !(bb.width > 0 && bb.height > 0)) { stats.skipped++; continue; }
    const { cx, cy } = centerFromBBox(bb);

    if (to === "rect") {
      const r = create("rect");
      r.setAttribute("x", String(bb.x));
      r.setAttribute("y", String(bb.y));
      r.setAttribute("width", String(bb.width));
      r.setAttribute("height", String(bb.height));
      copyAttrs(el, r, { skip: ["d"] });
      out = r;
    } else {
      const c = create("circle");
      const rr = Math.min(bb.width, bb.height) / 2;
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", String(rr));
      copyAttrs(el, c, { skip: ["d"] });
      out = c;
    }
  } else if (from === "path" && to === "polygon") {
    // Optional: sample points along path length.
    // Note: this assumes the element is an SVGPathElement in the live DOM.
    const pathEl = /** @type {any} */ (el);
    if (typeof pathEl.getTotalLength !== "function" || typeof pathEl.getPointAtLength !== "function") {
      stats.skipped++;
      continue;
    }
    const total = pathEl.getTotalLength();
    if (!Number.isFinite(total) || total <= 0) { stats.skipped++; continue; }
    const n = Math.max(3, Math.trunc(pathSamplePoints));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0 : i / (n - 1);
      const p = pathEl.getPointAtLength(total * t);
      pts.push([p.x, p.y]);
    }
    const poly = create("polygon");
    poly.setAttribute("points", formatPoints(pts));
    copyAttrs(el, poly, { skip: ["d"] });
    out = poly;
  } else {
    stats.skipped++;
    continue;
  }

  out.setAttribute("data-convert-clone", "1");
  el.replaceWith(out);
  stats.converted++;
}

if (debug) {
  // eslint-disable-next-line no-console
  console.log("[scriptOps][convertShapes] done:", stats);
}

