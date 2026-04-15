// ScriptOps utilities intended to be used from user scripts via `ctx.utils`.

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t); // smoothstep
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

function copyAttributes(fromEl, toEl, { skip = [] } = {}) {
  const skipSet = new Set(["id", ...skip]);
  for (const { name, value } of Array.from(fromEl.attributes)) {
    if (skipSet.has(name)) continue;
    if (name.startsWith("data-scale-")) continue;
    toEl.setAttribute(name, value);
  }
}

function fmtNum(n) {
  return Number.isFinite(n) ? Number(n.toFixed(3)) : n;
}

function rectsOverlap(a, b, pad) {
  const ax0 = a.x - pad;
  const ay0 = a.y - pad;
  const ax1 = a.x + a.w + pad;
  const ay1 = a.y + a.h + pad;
  const bx0 = b.x - pad;
  const by0 = b.y - pad;
  const bx1 = b.x + b.w + pad;
  const by1 = b.y + b.h + pad;
  return !(ax1 < bx0 || ax0 > bx1 || ay1 < by0 || ay0 > by1);
}

function rectContained(outer, inner, pad) {
  const ox0 = outer.x - pad;
  const oy0 = outer.y - pad;
  const ox1 = outer.x + outer.w + pad;
  const oy1 = outer.y + outer.h + pad;
  const ix0 = inner.x;
  const iy0 = inner.y;
  const ix1 = inner.x + inner.w;
  const iy1 = inner.y + inner.h;
  return ix0 > ox0 && iy0 > oy0 && ix1 < ox1 && iy1 < oy1;
}

function circlesContain(a, b, pad) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  return dist + b.r <= a.r - pad;
}

function buildUnionContourPath(shapes, opts = {}) {
  const padding = Number(opts.padding) || 0;
  const gridStep = Number(opts.gridStep) || 6;
  const smoothPasses = Math.max(0, Math.trunc(Number(opts.smoothPasses) || 0));
  if (!Array.isArray(shapes) || shapes.length < 2) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minSize = Infinity;
  for (const s of shapes) {
    if (s.kind === "circle") {
      minX = Math.min(minX, s.x - (s.r + padding));
      minY = Math.min(minY, s.y - (s.r + padding));
      maxX = Math.max(maxX, s.x + (s.r + padding));
      maxY = Math.max(maxY, s.y + (s.r + padding));
      minSize = Math.min(minSize, s.r);
    } else {
      minX = Math.min(minX, s.x - padding);
      minY = Math.min(minY, s.y - padding);
      maxX = Math.max(maxX, s.x + s.w + padding);
      maxY = Math.max(maxY, s.y + s.h + padding);
      minSize = Math.min(minSize, Math.min(s.w, s.h));
    }
  }
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  let step = Math.max(2, Math.min(12, gridStep));
  if (Number.isFinite(minSize) && minSize > 0) {
    step = Math.min(step, Math.max(1, minSize * 0.8));
  }
  const maxCells = 220;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  step = Math.max(step, Math.max(spanX / maxCells, spanY / maxCells));

  const cols = Math.max(3, Math.ceil(spanX / step) + 1);
  const rows = Math.max(3, Math.ceil(spanY / step) + 1);

  const insideAny = (x, y) => {
    for (const s of shapes) {
      if (s.kind === "circle") {
        const dx = x - s.x;
        const dy = y - s.y;
        const r = s.r + padding;
        if (dx * dx + dy * dy <= r * r) return 1;
      } else {
        if (x >= s.x - padding && x <= s.x + s.w + padding &&
            y >= s.y - padding && y <= s.y + s.h + padding) {
          return 1;
        }
      }
    }
    return 0;
  };

  const grid = Array.from({ length: rows }, (_r, j) => {
    const y = minY + j * step;
    const row = new Uint8Array(cols);
    for (let i = 0; i < cols; i++) {
      const x = minX + i * step;
      row[i] = insideAny(x, y);
    }
    return row;
  });

  const segs = [];
  const addSeg = (p, q) => segs.push([p, q]);
  const edgePts = (x0, y0) => {
    const h = step * 0.5;
    return {
      top: { x: x0 + h, y: y0 },
      right: { x: x0 + step, y: y0 + h },
      bottom: { x: x0 + h, y: y0 + step },
      left: { x: x0, y: y0 + h },
      center: { x: x0 + h, y: y0 + h },
    };
  };

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const tl = grid[j][i];
      const tr = grid[j][i + 1];
      const br = grid[j + 1][i + 1];
      const bl = grid[j + 1][i];
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (code === 0 || code === 15) continue;

      const x0 = minX + i * step;
      const y0 = minY + j * step;
      const p = edgePts(x0, y0);
      const centerInside = insideAny(p.center.x, p.center.y) === 1;

      switch (code) {
        case 1: addSeg(p.left, p.bottom); break;
        case 2: addSeg(p.bottom, p.right); break;
        case 3: addSeg(p.left, p.right); break;
        case 4: addSeg(p.top, p.right); break;
        case 5:
          if (centerInside) { addSeg(p.top, p.right); addSeg(p.left, p.bottom); }
          else { addSeg(p.top, p.left); addSeg(p.bottom, p.right); }
          break;
        case 6: addSeg(p.top, p.bottom); break;
        case 7: addSeg(p.top, p.left); break;
        case 8: addSeg(p.top, p.left); break;
        case 9: addSeg(p.top, p.bottom); break;
        case 10:
          if (centerInside) { addSeg(p.top, p.left); addSeg(p.bottom, p.right); }
          else { addSeg(p.top, p.right); addSeg(p.left, p.bottom); }
          break;
        case 11: addSeg(p.top, p.right); break;
        case 12: addSeg(p.left, p.right); break;
        case 13: addSeg(p.bottom, p.right); break;
        case 14: addSeg(p.left, p.bottom); break;
        default: break;
      }
    }
  }

  if (!segs.length) return null;

  const keyOf = (pt) => `${fmtNum(pt.x)},${fmtNum(pt.y)}`;
  const ptOf = new Map();
  const adj = new Map();

  const addEdge = (a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    ptOf.set(ka, { x: fmtNum(a.x), y: fmtNum(a.y) });
    ptOf.set(kb, { x: fmtNum(b.x), y: fmtNum(b.y) });
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push(kb);
    adj.get(kb).push(ka);
  };

  for (const [a, b] of segs) addEdge(a, b);

  const visitedEdge = new Set();
  const edgeKey = (ka, kb) => (ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`);
  const loops = [];

  for (const start of adj.keys()) {
    const ns = adj.get(start) || [];
    let next = ns.find(n => !visitedEdge.has(edgeKey(start, n)));
    if (!next) continue;

    const loop = [];
    let prev = null;
    let cur = start;

    while (true) {
      loop.push(ptOf.get(cur));
      const neigh = adj.get(cur) || [];
      let cand = null;
      for (const n of neigh) {
        const ek = edgeKey(cur, n);
        if (visitedEdge.has(ek)) continue;
        if (prev !== null && n === prev && neigh.length > 1) continue;
        cand = n;
        break;
      }
      if (!cand) break;

      visitedEdge.add(edgeKey(cur, cand));
      prev = cur;
      cur = cand;
      if (cur === start) {
        loop.push(ptOf.get(cur));
        break;
      }
      if (loop.length > 20000) break;
    }

    if (loop.length >= 4 &&
        loop[0] &&
        loop[loop.length - 1] &&
        loop[0].x === loop[loop.length - 1].x &&
        loop[0].y === loop[loop.length - 1].y) {
      loop.pop();
      loops.push(loop);
    }
  }

  if (!loops.length) return null;

  const areaOf = (pts) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      a += p0.x * p1.y - p1.x * p0.y;
    }
    return a * 0.5;
  };

  loops.sort((A, B) => Math.abs(areaOf(B)) - Math.abs(areaOf(A)));

  const pathParts = [];
  for (let li = 0; li < loops.length; li++) {
    let pts = loops[li];
    for (let pass = 0; pass < smoothPasses; pass++) {
      if (pts.length < 6) break;
      const sm = [];
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        sm.push({ x: fmtNum(0.75 * p0.x + 0.25 * p1.x), y: fmtNum(0.75 * p0.y + 0.25 * p1.y) });
        sm.push({ x: fmtNum(0.25 * p0.x + 0.75 * p1.x), y: fmtNum(0.25 * p0.y + 0.75 * p1.y) });
      }
      pts = sm;
    }
    pathParts.push(`M ${pts[0].x} ${pts[0].y}`);
    for (let i = 1; i < pts.length; i++) pathParts.push(`L ${pts[i].x} ${pts[i].y}`);
    pathParts.push("Z");
  }
  return pathParts.join(" ");
}

export function mergeCirclesToPathsInSubtree(ctx, opts = {}) {
  const {
    root = ctx?.root,
    create = ctx?.create,
    selector = "circle",
    elements = null,
    mergeRatio = 1.02,
    padding = 0,
    gridStep = 6,
    smoothPasses = 1,
    stroke = "#000000",
    strokeWidth = 1,
    runId = null,
    debug = false,
  } = opts;

  if (!root || root.nodeType !== 1) throw new Error("mergeCirclesToPathsInSubtree: missing ctx.root/root");
  if (typeof create !== "function") throw new Error("mergeCirclesToPathsInSubtree: missing ctx.create/create(tag)");

  const circles = (Array.isArray(elements) ? elements : Array.from(root.querySelectorAll(selector)))
    .filter(c => String(c.tagName || "").toLowerCase() === "circle");

  const parsed = circles.map((c) => {
    const cx = Number(c.getAttribute("cx") || 0);
    const cy = Number(c.getAttribute("cy") || 0);
    const r = Number(c.getAttribute("r") || 0);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) return null;
    return { el: c, x: cx, y: cy, r, kind: "circle" };
  }).filter(Boolean);

  const stats = { selector, matched: parsed.length, merged: 0, paths: 0 };
  if (!parsed.length) return stats;

  const components = [];
  const visited = new Array(parsed.length).fill(false);
  const ratio = Math.max(0.5, Number(mergeRatio) || 1);
  const pad = Math.max(0, Number(padding) || 0);

  for (let i = 0; i < parsed.length; i++) {
    if (visited[i]) continue;
    const stack = [i];
    const comp = [];
    visited[i] = true;
    while (stack.length) {
      const idx = stack.pop();
      const a = parsed[idx];
      comp.push(a);
      for (let j = 0; j < parsed.length; j++) {
        if (visited[j]) continue;
        const b = parsed[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const thresh = (a.r + b.r + pad * 2) * ratio;
        const contains =
          circlesContain(a, b, pad) ||
          circlesContain(b, a, pad);
        if (dist <= thresh && !contains) {
          visited[j] = true;
          stack.push(j);
        }
      }
    }
    if (comp.length >= 2) components.push(comp);
  }

  for (const comp of components) {
    const shapes = comp.map(c => ({ kind: "circle", x: c.x, y: c.y, r: c.r }));
    const pathD = buildUnionContourPath(shapes, { padding: pad, gridStep, smoothPasses });
    if (!pathD) continue;
    const path = create("path");
    path.setAttribute("d", pathD);
    if (runId) path.setAttribute("data-merge-run", String(runId));
    copyAttributes(comp[0].el, path, { skip: ["cx", "cy", "r"] });
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    const parent = comp[0].el.parentNode;
    if (parent) parent.insertBefore(path, comp[0].el);
    for (const item of comp) item.el.remove();
    stats.paths += 1;
    stats.merged += comp.length;
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][mergeCirclesToPaths] matched:", stats.matched, "merged:", stats.merged, "paths:", stats.paths);
  }

  return stats;
}

export function mergeRectsToPathsInSubtree(ctx, opts = {}) {
  const {
    root = ctx?.root,
    create = ctx?.create,
    selector = "rect",
    elements = null,
    padding = 0,
    gridStep = 6,
    smoothPasses = 1,
    stroke = "#000000",
    strokeWidth = 1,
    runId = null,
    debug = false,
  } = opts;

  if (!root || root.nodeType !== 1) throw new Error("mergeRectsToPathsInSubtree: missing ctx.root/root");
  if (typeof create !== "function") throw new Error("mergeRectsToPathsInSubtree: missing ctx.create/create(tag)");

  const rects = (Array.isArray(elements) ? elements : Array.from(root.querySelectorAll(selector)))
    .filter(r => String(r.tagName || "").toLowerCase() === "rect");

  const parsed = rects.map((r) => {
    const x = Number(r.getAttribute("x") || 0);
    const y = Number(r.getAttribute("y") || 0);
    const w = Number(r.getAttribute("width") || 0);
    const h = Number(r.getAttribute("height") || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { el: r, x, y, w, h, kind: "rect" };
  }).filter(Boolean);

  const stats = { selector, matched: parsed.length, merged: 0, paths: 0 };
  if (!parsed.length) return stats;

  const components = [];
  const visited = new Array(parsed.length).fill(false);
  const pad = Math.max(0, Number(padding) || 0);

  for (let i = 0; i < parsed.length; i++) {
    if (visited[i]) continue;
    const stack = [i];
    const comp = [];
    visited[i] = true;
    while (stack.length) {
      const idx = stack.pop();
      const a = parsed[idx];
      comp.push(a);
      for (let j = 0; j < parsed.length; j++) {
        if (visited[j]) continue;
        const b = parsed[j];
        const contains =
          rectContained(a, b, pad) ||
          rectContained(b, a, pad);
        if (rectsOverlap(a, b, pad) && !contains) {
          visited[j] = true;
          stack.push(j);
        }
      }
    }
    if (comp.length >= 2) components.push(comp);
  }

  for (const comp of components) {
    const shapes = comp.map(r => ({ kind: "rect", x: r.x, y: r.y, w: r.w, h: r.h }));
    const pathD = buildUnionContourPath(shapes, { padding: pad, gridStep, smoothPasses });
    if (!pathD) continue;
    const path = create("path");
    path.setAttribute("d", pathD);
    if (runId) path.setAttribute("data-merge-run", String(runId));
    copyAttributes(comp[0].el, path, { skip: ["x", "y", "width", "height", "rx", "ry"] });
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    const parent = comp[0].el.parentNode;
    if (parent) parent.insertBefore(path, comp[0].el);
    for (const item of comp) item.el.remove();
    stats.paths += 1;
    stats.merged += comp.length;
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][mergeRectsToPaths] matched:", stats.matched, "merged:", stats.merged, "paths:", stats.paths);
  }

  return stats;
}

function getScaleAtIndex(i, count, minS, maxS, { spacing = "linear", spacingFn = null } = {}) {
  if (count <= 1) return minS;
  let t = i / (count - 1);
  if (typeof spacingFn === "function") t = clamp(Number(spacingFn(t)), 0, 1);
  else if (spacing === "easeInOut") t = easeInOut(t);
  return lerp(minS, maxS, t);
}

export function scalePolygonsInSubtree(ctx, opts = {}) {
  const {
    root = ctx?.root,
    create = ctx?.create,
    selector = "polygon",
    range = [0.5, 1.5, 10],
    spacing = "linear",
    spacingFn = null,
    opacity = null, // null => auto, false => no opacity change, number|[min,max] => explicit
    runId = null,
  } = opts;

  if (!root || root.nodeType !== 1) throw new Error("scalePolygonsInSubtree: missing ctx.root/root");
  if (typeof create !== "function") throw new Error("scalePolygonsInSubtree: missing ctx.create/create(tag)");

  const [minScaleRaw, maxScaleRaw, countRaw] = range;
  const minScale = Number(minScaleRaw);
  const maxScale = Number(maxScaleRaw);
  const count = Math.max(1, Math.trunc(Number(countRaw)));
  if (!Number.isFinite(minScale) || !Number.isFinite(maxScale) || !Number.isFinite(count)) {
    throw new Error(`scalePolygonsInSubtree: invalid range: ${JSON.stringify(range)}`);
  }

  const polys = Array.from(root.querySelectorAll(selector))
    .filter(p => !p.closest('g[data-scale-stack="1"]'))
    .filter(p => !p.hasAttribute("data-scale-clone"));

  const stats = { selector, matched: polys.length, replaced: 0, skippedBadTag: 0, skippedBadGeom: 0, clonesMade: 0 };

  for (const poly of polys) {
    if (String(poly.tagName || "").toLowerCase() !== "polygon") {
      stats.skippedBadTag++;
      continue;
    }

    const pts = parsePoints(poly.getAttribute("points"));
    if (pts.length < 3) {
      stats.skippedBadGeom++;
      continue;
    }
    const [cx, cy] = centroid(pts);

    const g = create("g");
    g.setAttribute("data-scale-stack", "1");
    if (runId) g.setAttribute("data-scale-run", String(runId));

    for (let i = 0; i < count; i++) {
      const s = getScaleAtIndex(i, count, minScale, maxScale, { spacing, spacingFn });
      const nextPts = scaleAbout(pts, cx, cy, s);

      const p = create("polygon");
      p.setAttribute("data-scale-clone", "1");
      p.setAttribute("data-scale-factor", String(s));
      if (runId) p.setAttribute("data-scale-run", String(runId));
      p.setAttribute("points", formatPoints(nextPts));
      copyAttributes(poly, p, { skip: ["points"] });

      const style = p.getAttribute("style") || "";
      const hasOpacityStyle = /(^|;)\s*opacity\s*:/.test(style);
      const hasOpacityAttr = p.hasAttribute("opacity");
      const canSetOpacity = !hasOpacityStyle && !hasOpacityAttr;

      if (opacity === false) {
        // no-op
      } else if (opacity != null && canSetOpacity) {
        const alpha = Array.isArray(opacity)
          ? lerp(Number(opacity[0]), Number(opacity[1]), count <= 1 ? 1 : i / (count - 1))
          : Number(opacity);
        if (Number.isFinite(alpha)) {
          p.setAttribute("style", (style ? style + ";" : "") + `opacity:${clamp(alpha, 0, 1)}`);
        }
      } else if (opacity == null && canSetOpacity) {
        const alpha = lerp(0.25, 1, count <= 1 ? 1 : i / (count - 1));
        p.setAttribute("style", (style ? style + ";" : "") + `opacity:${alpha.toFixed(3)}`);
      }

      g.appendChild(p);
      stats.clonesMade++;
    }

    poly.replaceWith(g);
    stats.replaced++;
  }

  return stats;
}

export function scaleCirclesInSubtree(ctx, opts = {}) {
  const {
    root = ctx?.root,
    create = ctx?.create,
    selector = "circle",
    range = [0.5, 1.5, 10],
    spacing = "linear",
    spacingFn = null,
    opacity = null, // null => auto, false => no opacity change, number|[min,max] => explicit
    debug = false,
    runId = null,
  } = opts;

  if (!root || root.nodeType !== 1) throw new Error("scaleCirclesInSubtree: missing ctx.root/root");
  if (typeof create !== "function") throw new Error("scaleCirclesInSubtree: missing ctx.create/create(tag)");

  const [minScaleRaw, maxScaleRaw, countRaw] = range;
  const minScale = Number(minScaleRaw);
  const maxScale = Number(maxScaleRaw);
  const count = Math.max(1, Math.trunc(Number(countRaw)));
  if (!Number.isFinite(minScale) || !Number.isFinite(maxScale) || !Number.isFinite(count)) {
    throw new Error(`scaleCirclesInSubtree: invalid range: ${JSON.stringify(range)}`);
  }

  const circles = Array.from(root.querySelectorAll(selector))
    .filter(c => !c.closest('g[data-scale-stack="1"]'))
    .filter(c => !c.hasAttribute("data-scale-clone"));

  const stats = {
    selector,
    matched: circles.length,
    replaced: 0,
    skippedBadTag: 0,
    skippedBadGeom: 0,
    clonesMade: 0,
  };

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][scaleCirclesInSubtree] matched:", stats.matched, "selector:", selector, "range:", range);
  }

  for (const circle of circles) {
    if (String(circle.tagName || "").toLowerCase() !== "circle") {
      stats.skippedBadTag++;
      continue;
    }

    const cx = Number(circle.getAttribute("cx") || 0);
    const cy = Number(circle.getAttribute("cy") || 0);
    const r0 = Number(circle.getAttribute("r") || 0);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r0) || r0 <= 0) {
      stats.skippedBadGeom++;
      continue;
    }

    const g = create("g");
    g.setAttribute("data-scale-stack", "1");
    if (runId) g.setAttribute("data-scale-run", String(runId));

    for (let i = 0; i < count; i++) {
      const s = getScaleAtIndex(i, count, minScale, maxScale, { spacing, spacingFn });
      const r = r0 * s;
      if (!Number.isFinite(r) || r <= 0) continue;

      const c = create("circle");
      c.setAttribute("data-scale-clone", "1");
      c.setAttribute("data-scale-factor", String(s));
      if (runId) c.setAttribute("data-scale-run", String(runId));
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", String(r));
      copyAttributes(circle, c, { skip: ["cx", "cy", "r"] });

      const style = c.getAttribute("style") || "";
      const hasOpacityStyle = /(^|;)\s*opacity\s*:/.test(style);
      const hasOpacityAttr = c.hasAttribute("opacity");
      const canSetOpacity = !hasOpacityStyle && !hasOpacityAttr;

      if (opacity === false) {
        // no-op
      } else if (opacity != null && canSetOpacity) {
        const alpha = Array.isArray(opacity)
          ? lerp(Number(opacity[0]), Number(opacity[1]), count <= 1 ? 1 : i / (count - 1))
          : Number(opacity);
        if (Number.isFinite(alpha)) {
          c.setAttribute("style", (style ? style + ";" : "") + `opacity:${clamp(alpha, 0, 1)}`);
        }
      } else if (opacity == null && canSetOpacity) {
        const alpha = lerp(0.25, 1, count <= 1 ? 1 : i / (count - 1));
        c.setAttribute("style", (style ? style + ";" : "") + `opacity:${alpha.toFixed(3)}`);
      }

      g.appendChild(c);
      stats.clonesMade++;
    }

    circle.replaceWith(g);
    stats.replaced++;
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][scaleCirclesInSubtree] replaced:", stats.replaced, "clonesMade:", stats.clonesMade, "skippedBadGeom:", stats.skippedBadGeom);
  }

  return stats;
}

export function scaleRectsInSubtree(ctx, opts = {}) {
  const {
    root = ctx?.root,
    create = ctx?.create,
    selector = "rect",
    range = [0.5, 1.5, 10],
    spacing = "linear",
    spacingFn = null,
    opacity = null,
    debug = false,
    runId = null,
  } = opts;

  if (!root || root.nodeType !== 1) throw new Error("scaleRectsInSubtree: missing ctx.root/root");
  if (typeof create !== "function") throw new Error("scaleRectsInSubtree: missing ctx.create/create(tag)");

  const [minScaleRaw, maxScaleRaw, countRaw] = range;
  const minScale = Number(minScaleRaw);
  const maxScale = Number(maxScaleRaw);
  const count = Math.max(1, Math.trunc(Number(countRaw)));
  if (!Number.isFinite(minScale) || !Number.isFinite(maxScale) || !Number.isFinite(count)) {
    throw new Error(`scaleRectsInSubtree: invalid range: ${JSON.stringify(range)}`);
  }

  const rects = Array.from(root.querySelectorAll(selector))
    .filter(r => !r.closest('g[data-scale-stack="1"]'))
    .filter(r => !r.hasAttribute("data-scale-clone"));

  const stats = { selector, matched: rects.length, replaced: 0, skippedBadTag: 0, skippedBadGeom: 0, clonesMade: 0 };
  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][scaleRectsInSubtree] matched:", stats.matched, "selector:", selector, "range:", range);
  }

  for (const rect of rects) {
    if (String(rect.tagName || "").toLowerCase() !== "rect") {
      stats.skippedBadTag++;
      continue;
    }

    const x0 = Number(rect.getAttribute("x") || 0);
    const y0 = Number(rect.getAttribute("y") || 0);
    const w0 = Number(rect.getAttribute("width") || 0);
    const h0 = Number(rect.getAttribute("height") || 0);
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(w0) || !Number.isFinite(h0) || w0 <= 0 || h0 <= 0) {
      stats.skippedBadGeom++;
      continue;
    }

    const cx = x0 + w0 / 2;
    const cy = y0 + h0 / 2;
    const rx0 = rect.hasAttribute("rx") ? Number(rect.getAttribute("rx")) : null;
    const ry0 = rect.hasAttribute("ry") ? Number(rect.getAttribute("ry")) : null;

    const g = create("g");
    g.setAttribute("data-scale-stack", "1");
    if (runId) g.setAttribute("data-scale-run", String(runId));

    for (let i = 0; i < count; i++) {
      const s = getScaleAtIndex(i, count, minScale, maxScale, { spacing, spacingFn });
      const w = w0 * s;
      const h = h0 * s;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;

      const x = cx - w / 2;
      const y = cy - h / 2;

      const r = create("rect");
      r.setAttribute("data-scale-clone", "1");
      r.setAttribute("data-scale-factor", String(s));
      if (runId) r.setAttribute("data-scale-run", String(runId));
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(y));
      r.setAttribute("width", String(w));
      r.setAttribute("height", String(h));

      if (rx0 != null && Number.isFinite(rx0)) r.setAttribute("rx", String(rx0 * s));
      if (ry0 != null && Number.isFinite(ry0)) r.setAttribute("ry", String(ry0 * s));

      copyAttributes(rect, r, { skip: ["x", "y", "width", "height", "rx", "ry"] });

      const style = r.getAttribute("style") || "";
      const hasOpacityStyle = /(^|;)\s*opacity\s*:/.test(style);
      const hasOpacityAttr = r.hasAttribute("opacity");
      const canSetOpacity = !hasOpacityStyle && !hasOpacityAttr;

      if (opacity === false) {
        // no-op
      } else if (opacity != null && canSetOpacity) {
        const alpha = Array.isArray(opacity)
          ? lerp(Number(opacity[0]), Number(opacity[1]), count <= 1 ? 1 : i / (count - 1))
          : Number(opacity);
        if (Number.isFinite(alpha)) r.setAttribute("style", (style ? style + ";" : "") + `opacity:${clamp(alpha, 0, 1)}`);
      } else if (opacity == null && canSetOpacity) {
        const alpha = lerp(0.25, 1, count <= 1 ? 1 : i / (count - 1));
        r.setAttribute("style", (style ? style + ";" : "") + `opacity:${alpha.toFixed(3)}`);
      }

      g.appendChild(r);
      stats.clonesMade++;
    }

    rect.replaceWith(g);
    stats.replaced++;
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][scaleRectsInSubtree] replaced:", stats.replaced, "clonesMade:", stats.clonesMade, "skippedBadGeom:", stats.skippedBadGeom);
  }
  return stats;
}

function combineTransform(existing, next) {
  const a = String(existing || "").trim();
  const b = String(next || "").trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

export function scalePathsInSubtree(ctx, opts = {}) {
  const {
    root = ctx?.root,
    create = ctx?.create,
    selector = "path",
    range = [0.5, 1.5, 10],
    spacing = "linear",
    spacingFn = null,
    opacity = null,
    debug = false,
    runId = null,
  } = opts;

  if (!root || root.nodeType !== 1) throw new Error("scalePathsInSubtree: missing ctx.root/root");
  if (typeof create !== "function") throw new Error("scalePathsInSubtree: missing ctx.create/create(tag)");

  const [minScaleRaw, maxScaleRaw, countRaw] = range;
  const minScale = Number(minScaleRaw);
  const maxScale = Number(maxScaleRaw);
  const count = Math.max(1, Math.trunc(Number(countRaw)));
  if (!Number.isFinite(minScale) || !Number.isFinite(maxScale) || !Number.isFinite(count)) {
    throw new Error(`scalePathsInSubtree: invalid range: ${JSON.stringify(range)}`);
  }

  const paths = Array.from(root.querySelectorAll(selector))
    .filter(p => !p.closest('g[data-scale-stack="1"]'))
    .filter(p => !p.hasAttribute("data-scale-clone"));

  const stats = { selector, matched: paths.length, replaced: 0, skippedBadTag: 0, skippedNoBBox: 0, clonesMade: 0 };
  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][scalePathsInSubtree] matched:", stats.matched, "selector:", selector, "range:", range);
  }

  for (const path of paths) {
    if (String(path.tagName || "").toLowerCase() !== "path") {
      stats.skippedBadTag++;
      continue;
    }

    let bbox;
    try {
      bbox = path.getBBox();
    } catch {
      stats.skippedNoBBox++;
      continue;
    }
    if (!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) {
      stats.skippedNoBBox++;
      continue;
    }

    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    const g = create("g");
    g.setAttribute("data-scale-stack", "1");
    if (runId) g.setAttribute("data-scale-run", String(runId));

    for (let i = 0; i < count; i++) {
      const s = getScaleAtIndex(i, count, minScale, maxScale, { spacing, spacingFn });
      const clone = create("path");
      clone.setAttribute("data-scale-clone", "1");
      clone.setAttribute("data-scale-factor", String(s));
      if (runId) clone.setAttribute("data-scale-run", String(runId));

      copyAttributes(path, clone, { skip: ["transform", "id"] });

      const scaleT = `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;
      const existingT = path.getAttribute("transform");
      const combined = combineTransform(existingT, scaleT);
      if (combined) clone.setAttribute("transform", combined);

      const style = clone.getAttribute("style") || "";
      const hasOpacityStyle = /(^|;)\s*opacity\s*:/.test(style);
      const hasOpacityAttr = clone.hasAttribute("opacity");
      const canSetOpacity = !hasOpacityStyle && !hasOpacityAttr;

      if (opacity === false) {
        // no-op
      } else if (opacity != null && canSetOpacity) {
        const alpha = Array.isArray(opacity)
          ? lerp(Number(opacity[0]), Number(opacity[1]), count <= 1 ? 1 : i / (count - 1))
          : Number(opacity);
        if (Number.isFinite(alpha)) clone.setAttribute("style", (style ? style + ";" : "") + `opacity:${clamp(alpha, 0, 1)}`);
      } else if (opacity == null && canSetOpacity) {
        const alpha = lerp(0.25, 1, count <= 1 ? 1 : i / (count - 1));
        clone.setAttribute("style", (style ? style + ";" : "") + `opacity:${alpha.toFixed(3)}`);
      }

      g.appendChild(clone);
      stats.clonesMade++;
    }

    path.replaceWith(g);
    stats.replaced++;
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][scalePathsInSubtree] replaced:", stats.replaced, "clonesMade:", stats.clonesMade, "skippedNoBBox:", stats.skippedNoBBox);
  }
  return stats;
}

function parseNumberLike(v, fallback = 0) {
  const s = String(v ?? "").trim();
  const m = s.match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function copyAttrs(fromEl, toEl, { skip = [] } = {}) {
  const skipSet = new Set(["id", ...skip]);
  for (const { name, value } of Array.from(fromEl.attributes)) {
    if (skipSet.has(name)) continue;
    if (name.startsWith("data-convert-")) continue;
    toEl.setAttribute(name, value);
  }
}

function dFromPolygonPoints(pts) {
  if (!pts.length) return "";
  const [x0, y0] = pts[0];
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    d += ` L ${x} ${y}`;
  }
  return d + " Z";
}

function dFromRect(x, y, w, h) {
  return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}

function dFromCircle(cx, cy, r) {
  const x0 = cx + r;
  const x1 = cx - r;
  return `M ${x0} ${cy} A ${r} ${r} 0 1 0 ${x1} ${cy} A ${r} ${r} 0 1 0 ${x0} ${cy} Z`;
}

function bboxOf(el) {
  try {
    return el.getBBox();
  } catch {
    return null;
  }
}

function centerFromBBox(bb) {
  return { cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 };
}

export function convertShapesInSubtree(ctx, opts = {}) {
  const {
    root = ctx?.root,
    create = ctx?.create,
    fromTag = "path",
    toTag = "circle",
    selector = null,
    pathSamplePoints = 64,
    debug = false,
    runId = null,
  } = opts;

  if (!root || root.nodeType !== 1) throw new Error("convertShapesInSubtree: missing ctx.root/root");
  if (typeof create !== "function") throw new Error("convertShapesInSubtree: missing ctx.create/create(tag)");

  const from = String(fromTag).toLowerCase();
  const to = String(toTag).toLowerCase();
  const query = selector ? String(selector) : from;

  const els = Array.from(root.querySelectorAll(query))
    .filter(el => String(el.tagName || "").toLowerCase() === from)
    .filter(el => !el.closest('g[data-convert-stack="1"]'))
    .filter(el => !el.hasAttribute("data-convert-clone"));

  const stats = { from, to, selector: query, matched: els.length, converted: 0, skipped: 0 };

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][convertShapesInSubtree] from:", from, "to:", to, "matched:", stats.matched, "selector:", query);
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
    if (runId) out.setAttribute("data-convert-run", String(runId));
    el.replaceWith(out);
    stats.converted++;
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[scriptOps][convertShapesInSubtree] done:", stats);
  }
  return stats;
}
