// bacteriaVisualizer.js
// Multiple ring-only bacteria formations with stroke-only circles and outlines.
import { registerVisual, runVisualApp } from "../helper/visualHelp.js";

const DOT_R = 6;
const MERGE_CONTACT_RATIO = 0.97;

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex || "");
  if (!m) return null;
  const h = m[1];
  const nums = h.length === 3
    ? h.split("").map(c => parseInt(c + c, 16))
    : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return { r: nums[0], g: nums[1], b: nums[2] };
}

function mixColors(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a || b || "#000";
  const lerp = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${lerp(ca.r, cb.r)}, ${lerp(ca.g, cb.g)}, ${lerp(ca.b, cb.b)})`;
}

const TAU = Math.PI * 2;
const EPS = 1e-6;

function fmt(n) {
  // Stabilize path strings a bit to reduce tiny jitter-induced "flips".
  return Number.isFinite(n) ? Number(n.toFixed(3)) : n;
}

function arcFlagsForUnion(center, r, start, end, otherCenter, otherR) {
  // Pick the arc (between the two possible circle arcs) whose midpoint lies OUTSIDE the other circle.
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const a1 = Math.atan2(end.y - center.y, end.x - center.x);

  // In screen coords (y down), angles increase clockwise (SVG sweep=1).
  const deltaPos = ((a1 - a0) % TAU + TAU) % TAU; // clockwise (sweep=1)
  const deltaNeg = (TAU - deltaPos) % TAU;        // counter-clockwise (sweep=0)

  const midPos = a0 + deltaPos * 0.5;
  const midNeg = a0 - deltaNeg * 0.5;

  const mp = { x: center.x + r * Math.cos(midPos), y: center.y + r * Math.sin(midPos) };
  const mn = { x: center.x + r * Math.cos(midNeg), y: center.y + r * Math.sin(midNeg) };

  const inside = (p) => {
    const dx = p.x - otherCenter.x;
    const dy = p.y - otherCenter.y;
    return (dx * dx + dy * dy) <= (otherR * otherR - 1e-3);
  };

  const usePos = !inside(mp); // prefer the arc whose midpoint is outside the other circle
  if (usePos) {
    return { large: deltaPos > Math.PI ? 1 : 0, sweep: 1 };
  }
  return { large: deltaNeg > Math.PI ? 1 : 0, sweep: 0 };
}

function circleUnionPath(c1, r1, c2, r2, precomputedDist) {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = precomputedDist ?? Math.hypot(dx, dy);
  const rSum = r1 + r2;
  if (d >= rSum - EPS) return null;

  // Containment: use the larger circle.
  const diff = Math.abs(r1 - r2);
  if (d <= diff + EPS) {
    const big = r1 >= r2 ? { cx: c1.x, cy: c1.y, r: r1 } : { cx: c2.x, cy: c2.y, r: r2 };
    const { cx, cy, r } = big;
    return `M ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)} Z`;
  }

  // Intersection points
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const xm = c1.x + (a * dx) / d;
  const ym = c1.y + (a * dy) / d;
  const rxh = -dy * (h / d);
  const ryh = dx * (h / d);
  const i1 = { x: xm + rxh, y: ym + ryh };
  const i2 = { x: xm - rxh, y: ym - ryh };

  // Deterministic start/end ordering based on which side of c1->c2 the point lies.
  const crossZ = (p) => dx * (p.y - c1.y) - dy * (p.x - c1.x);
  let p1 = i1;
  let p2 = i2;
  if (crossZ(p1) < crossZ(p2)) {
    const t = p1; p1 = p2; p2 = t;
  }

  const f1 = arcFlagsForUnion(c1, r1, p1, p2, c2, r2);
  const f2 = arcFlagsForUnion(c2, r2, p2, p1, c1, r1);

  const arc1 = `A ${fmt(r1)} ${fmt(r1)} 0 ${f1.large} ${f1.sweep} ${fmt(p2.x)} ${fmt(p2.y)}`;
  const arc2 = `A ${fmt(r2)} ${fmt(r2)} 0 ${f2.large} ${f2.sweep} ${fmt(p1.x)} ${fmt(p1.y)}`;

  return [
    `M ${fmt(p1.x)} ${fmt(p1.y)}`,
    arc1,
    arc2,
    "Z"
  ].join(" ");
}

function buildMergedPath(circleA, circleB, dist, mergeRatio = MERGE_CONTACT_RATIO) {
  const d = dist ?? Math.hypot(circleB.x - circleA.x, circleB.y - circleA.y);
  const rSum = circleA.r + circleB.r;
  const ratio = Math.max(0.5, Math.min(1.2, mergeRatio));
  if (d > rSum * ratio) return null;
  return circleUnionPath(circleA, circleA.r, circleB, circleB.r, d);
}

function getMergeRatio(state) {
  const val = Number(state.mergeContactRatio);
  if (Number.isFinite(val)) return Math.max(0.5, Math.min(1.2, val));
  return MERGE_CONTACT_RATIO;
}

function getMergeSmoothing(state) {
  const v = Number(state.mergeSmoothing);
  if (Number.isFinite(v)) return Math.min(0.99, Math.max(0, v));
  return 0.06;
}

function getMergeFalloff(state) {
  const v = Number(state.mergeFalloff);
  if (Number.isFinite(v)) return Math.min(0.99, Math.max(0, v));
  return 0.28;
}

function buildUnionContourPath(circles, padding = 2, gridStep = 6) {
  if (!circles || circles.length < 2) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let minR = Infinity;
  for (const c of circles) {
    minX = Math.min(minX, c.x - c.r);
    minY = Math.min(minY, c.y - c.r);
    maxX = Math.max(maxX, c.x + c.r);
    maxY = Math.max(maxY, c.y + c.r);
    minR = Math.min(minR, c.r);
  }
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;

  // Keep the marching-squares grid bounded for performance.
  let step = Math.max(3, Math.min(12, Number(gridStep) || 6));
  const maxCells = 220;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  step = Math.max(step, Math.max(spanX / maxCells, spanY / maxCells));

  const cols = Math.max(3, Math.ceil(spanX / step) + 1);
  const rows = Math.max(3, Math.ceil(spanY / step) + 1);

  const insideAny = (x, y) => {
    for (const c of circles) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy <= c.r * c.r) return 1;
    }
    return 0;
  };

  // Sample grid
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
      top:    { x: x0 + h,     y: y0 },
      right:  { x: x0 + step,  y: y0 + h },
      bottom: { x: x0 + h,     y: y0 + step },
      left:   { x: x0,         y: y0 + h },
      center: { x: x0 + h,     y: y0 + h },
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

      // Asymptotic decider for ambiguous cases.
      const centerInside = insideAny(p.center.x, p.center.y) === 1;

      switch (code) {
        case 1:  addSeg(p.left, p.bottom); break;
        case 2:  addSeg(p.bottom, p.right); break;
        case 3:  addSeg(p.left, p.right); break;
        case 4:  addSeg(p.top, p.right); break;
        case 5:
          if (centerInside) { addSeg(p.top, p.right); addSeg(p.left, p.bottom); }
          else { addSeg(p.top, p.left); addSeg(p.bottom, p.right); }
          break;
        case 6:  addSeg(p.top, p.bottom); break;
        case 7:  addSeg(p.top, p.left); break;
        case 8:  addSeg(p.top, p.left); break;
        case 9:  addSeg(p.top, p.bottom); break;
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

  const keyOf = (pt) => `${fmt(pt.x)},${fmt(pt.y)}`;
  const ptOf = new Map();
  const adj = new Map();

  const addEdge = (a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    ptOf.set(ka, { x: fmt(a.x), y: fmt(a.y) });
    ptOf.set(kb, { x: fmt(b.x), y: fmt(b.y) });
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
    // Find any unvisited edge from this node
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

    if (loop.length >= 4 && loop[0] && loop[loop.length - 1] && (loop[0].x === loop[loop.length - 1].x && loop[0].y === loop[loop.length - 1].y)) {
      loop.pop(); // drop duplicate closing point for smoothing/path
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

  // Pick the largest loop by absolute area.
  loops.sort((A, B) => Math.abs(areaOf(B)) - Math.abs(areaOf(A)));
  let pts = loops[0];

  // Chaikin smoothing (1 pass) for nicer curves.
  if (pts.length >= 6) {
    const sm = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      sm.push({ x: fmt(0.75 * p0.x + 0.25 * p1.x), y: fmt(0.75 * p0.y + 0.25 * p1.y) });
      sm.push({ x: fmt(0.25 * p0.x + 0.75 * p1.x), y: fmt(0.25 * p0.y + 0.75 * p1.y) });
    }
    pts = sm;
  }

  const parts = [];
  parts.push(`M ${pts[0].x} ${pts[0].y}`);
  for (let i = 1; i < pts.length; i++) parts.push(`L ${pts[i].x} ${pts[i].y}`);
  parts.push("Z");
  return parts.join(" ");
}

function parsePalette(str) {
  if (!str) return [];
  return String(str)
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function getPalette(state) {
  const parsed = parsePalette(state.multiRingPalette);
  if (parsed.length) return parsed;
  return ["#aa0000", "#0088ff", "#00aa44", "#ffa500"];
}

function ensureCellRandomColor(cell, palette, fallback) {
  const pal = Array.isArray(palette) ? palette : [];
  if (!cell._randColor) {
    const pick = pal.length ? pal[Math.floor(Math.random() * pal.length)] : null;
    cell._randColor = pick || fallback;
  }
  return cell._randColor;
}

function colorFromRadius(radius, state) {
  const minR = Math.max(1, Number(state.ringMinRadius ?? 1));
  const maxR = Math.max(minR, Number(state.ringMaxRadius ?? minR + 1));
  const t = Math.min(1, Math.max(0, (radius - minR) / Math.max(1, maxR - minR)));
  // Rainbow sweep blended with user-provided start/end colors for responsiveness.
  const hueColor = `hsl(${Math.round(t * 360)}, 100%, 50%)`;
  const start = state.ringColorA || "#ffffff";
  const end = state.ringColorB || "#000000";
  const userGrad = mixColors(start, end, t);
  return mixColors(hueColor, userGrad, 0.5);
}

function getRingColorForCell(cell, state, radiusHint, palette) {
  const pal = palette || getPalette(state);
  const fallback = state.multiRingColor || state.lineColor || "#000";
  const mode = state.ringColorMode || "uniform";
  if (mode === "radius") {
    const r = Math.max(1, radiusHint ?? Math.max(cell?.formation?.bounds?.rx || 1, cell?.formation?.bounds?.ry || 1));
    return colorFromRadius(r, state);
  }
  if (mode === "random") return ensureCellRandomColor(cell, pal, fallback);
  return fallback;
}

function makeFormation(name, points, outlineType = "ellipse") {
  // Center points and compute bounds including dot radius.
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const centered = points.map(p => ({ x: p.x - cx, y: p.y - cy }));

  const boundMinX = minX - DOT_R;
  const boundMaxX = maxX + DOT_R;
  const boundMinY = minY - DOT_R;
  const boundMaxY = maxY + DOT_R;
  const width = boundMaxX - boundMinX;
  const height = boundMaxY - boundMinY;

  return {
    name,
    outlineType,
    dots: centered,
    bounds: {
      width,
      height,
      rx: width / 2,
      ry: height / 2,
    },
  };
}

function buildFormations(state, viewport = { width: 1, height: 1 }) {
  const rings = [];
  const requested = Math.max(1, Math.floor(state.ringCount || 4));
  const rawMin = Number(state.ringMinRadius ?? 20);
  const rawMax = Number(state.ringMaxRadius ?? 80);
  const minR = Math.max(1, Math.min(rawMin, rawMax));
  const maxR = Math.max(minR, Math.max(rawMin, rawMax));
  const dotCount = 10;
  let count = requested;

  if (state.fitCells) {
    const avgR = (minR + maxR) / 2;
    const cellArea = Math.PI * avgR * avgR;
    const screenArea = Math.max(1, viewport.width * viewport.height);
    const fill = Math.min(1, Math.max(0.01, Number(state.fitFillRatio ?? 0.35)));
    const maxCells = Math.max(1, Math.floor((screenArea * fill) / cellArea));
    count = Math.min(requested, maxCells);
  }

  for (let i = 0; i < count; i++) {
    const ringR = minR + Math.random() * (maxR - minR);
    const ringPts = [];
    for (let j = 0; j < dotCount; j++) {
      const a = (j / dotCount) * Math.PI * 2;
      ringPts.push({ x: Math.cos(a) * ringR, y: Math.sin(a) * ringR });
    }
    rings.push(makeFormation(`ring-${i}`, ringPts, "ellipse"));
  }

  return rings;
}

function multiRingComponent(cell, group) {
  let ringSel = group.selectAll("circle.multi-ring");
  return {
    update({ cx, cy, rx, ry }, state) {
      const count = Math.max(0, Math.floor(state.multiRingCount ?? 0));
      const start = state.multiRingStart ?? 1.1;
      const gap = state.multiRingGap ?? 0.25;
      const rings = Array.from({ length: count }, (_d, i) => i);

      ringSel = group.selectAll("circle.multi-ring").data(rings);
      ringSel.exit().remove();
      const merged = ringSel.enter()
        .append("circle")
        .attr("class", "multi-ring")
        .attr("fill", "none")
        .merge(ringSel);

      if (!state.showMultiRing || count === 0) {
        merged.attr("display", "none");
        return;
      }
      const base = Math.max(rx, ry);
      const strokeWidth = state.multiRingStrokeWidth ?? 1.2;
      const baseOpacity = state.multiRingOpacity ?? 0.22;
      const fade = state.multiRingFade ?? 0.09;
      const palette = getPalette(state);

      const cellRadiusValue = (base * start);
      const cellColor = getRingColorForCell(cell, state, cellRadiusValue, palette);

      merged
        .attr("display", "block")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", d => (base * start) + gap * d)
        .attr("stroke", cellColor)
        .attr("stroke-width", strokeWidth)
        .attr("opacity", (_d, idx) => Math.max(0, baseOpacity - idx * fade)); // fade outward
    }
  };
}

function circleRectComponent(cell, group) {
  const circle = group.append("circle")
    .attr("class", "comp-circle")
    .attr("fill", "none");
  return {
    update({ cx, cy, rx, ry, w, h }, state) {
      const show = state.showCircleRect;
      const color = state.circleRectColor || state.lineColor || "#000";
      const circleStroke = state.circleStrokeWidth ?? 1.4;
      const circleOpacity = 0.13;
      circle
        .attr("display", show ? "block" : "none")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", Math.max(rx, ry) * 1.15)
        .attr("stroke", color)
        .attr("stroke-width", circleStroke)
        .attr("opacity", circleOpacity);
    }
  };
}

function trailComponent(cell, _group, trailLayer) {
  cell._trailNodes = cell._trailNodes || [];
  cell._trailSkip = 0;
  let maxTrail = 18;
  return {
    update(_info, state) {
      if (!state.showTrail) {
        // clear existing trail if hiding
        while (cell._trailNodes.length) {
          const n = cell._trailNodes.pop();
          n.remove();
        }
        cell._trailSkip = 0;
        return;
      }
      const dropEvery = Math.max(1, Math.floor(state.trailEveryN || 1));
      cell._trailSkip = (cell._trailSkip + 1) % dropEvery;
      if (cell._trailSkip !== 0) return;

      maxTrail = Math.max(0, Math.floor(state.trailLength));
      const r = Math.max(1, state.trailRadius || 1);
      const color = state.trailColor || "#000";
      const strokeColor = state.trailStrokeColor || state.lineColor || color;
      const opacity = state.trailOpacity ?? 0.28;
      const strokeWidth = Math.max(0, state.trailStrokeWidth || 0);
      const node = trailLayer.append("circle")
        .attr("cx", cell.outlinePos.x)
        .attr("cy", cell.outlinePos.y)
        .attr("r", r)
        .attr("fill", color)
        .attr("stroke", strokeWidth > 0 ? strokeColor : "none")
        .attr("stroke-width", strokeWidth)
        .attr("opacity", opacity);
      cell._trailNodes.push(node);
      if (cell._trailNodes.length > maxTrail) {
        const old = cell._trailNodes.shift();
        old.remove();
      }
    }
  };
}

const CELL_COMPONENT_FACTORIES = [
  { key: "showMultiRing", factory: multiRingComponent },
  { key: "showCircleRect", factory: circleRectComponent },
  { key: "showTrail", factory: trailComponent },
];

registerVisual("bacteriaMinimal", {
  title: "Bacteria Outline",
  description: "Multiple ring-shaped bacteria with controllable outline halos, trails, and ring sizes.",
  params: [
    { key: "running", type: "boolean", default: true, category: "Simulation", description: "Start/pause animation." },
    { key: "tickMs", type: "number", default: 40, min: 16, max: 200, step: 1, category: "Simulation", description: "Frame interval (ms)." },
    { key: "speed", type: "number", default: 1.35, min: 0.5, max: 12, step: 0.1, category: "Simulation", description: "Movement speed of each cell." },
    { key: "outlinePad", type: "number", default: 0, min: 0, max: 40, step: 1, category: "Outline", description: "Padding between cluster and outline." },
    { key: "outlineLag", type: "number", default: 0.36, min: 0.01, max: 0.6, step: 0.01, category: "Outline", description: "How much the outline lags/smooths behind movement." },
    { key: "outlineScale", type: "number", default: 1.5, min: 0.2, max: 3, step: 0.05, category: "Outline", description: "Scale multiplier applied to base outline size." },
    { key: "outlineShape", type: "select", default: "ellipse", options: ["auto", "ellipse", "rect"], category: "Outline", description: "Force outline shape or let formation decide." },
    { key: "outlineStrokeWidth", type: "number", default: 0.05, min: 0.0, max: 8, step: 0.1, category: "Outline", description: "Stroke width applied to outlines." },
    { key: "lineColor", type: "text", default: "#000000", category: "Colors", description: "Stroke color for outlines, dots, and overlays." },
    { key: "backgroundColor", type: "text", default: "#ffffff", category: "Colors", description: "Canvas background color (CSS color)." },
    { key: "dotStrokeWidth", type: "number", default: 0.05, min: 0.0, max: 8, step: 0.1, category: "Dots", description: "Stroke width for cluster dots." },
    { key: "collisionPush", type: "number", default: 0, min: 0, max: 2, step: 0.05, category: "Collision", description: "Strength of collision separation between cells." },
    { key: "showMergePaths", type: "boolean", default: false, category: "Merge", description: "Draw merged contact paths where circles touch." },
    { key: "mergeContactRatio", type: "number", default: 0.97, min: 0.8, max: 1.1, step: 0.01, category: "Merge", description: "Contact tightness for merges (ratio of radii sum)." },
    { key: "mergeMaxPairs", type: "number", default: 72, min: 1, max: 500, step: 1, category: "Merge", description: "Maximum merge overlays to display simultaneously." },
    { key: "mergeSmoothing", type: "number", default: 0.99, min: 0, max: 0.99, step: 0.01, category: "Merge", description: "Smoothing factor for merge appearance/disappearance (higher = faster response)." },
    { key: "mergeFalloff", type: "number", default: 0, min: 0, max: 0.99, step: 0.01, category: "Merge", description: "Soft falloff band and decay rate for merges." },
    { key: "mergeEffectStyle", type: "select", default: "ring", options: ["ring", "blend", "solid"], category: "Merge", description: "Merge color style: match halo color, blend outline colors, or force a solid fill." },
    { key: "mergeEffectColor", type: "text", default: "#aa0000", category: "Merge", description: "Fill/stroke color when merge effect style is set to solid." },
    { key: "ringCount", type: "number", default: 40, min: 1, max: 50, step: 1, category: "Population", description: "How many ring bacteria to spawn." },
    { key: "fitCells", type: "boolean", default: true, category: "Population", description: "Clamp spawned cells to fit the viewport area." },
    { key: "fitFillRatio", type: "number", default: 0.35, min: 0.05, max: 1, step: 0.01, category: "Population", description: "Max fill ratio of viewport area when clamping cells." },
    { key: "ringMinRadius", type: "number", default: 10, min: 1, max: 500, step: 1, category: "Population", description: "Minimum radius for randomly sized rings." },
    { key: "ringMaxRadius", type: "number", default: 88, min: 1, max: 500, step: 1, category: "Population", description: "Maximum radius for randomly sized rings." },
    { key: "showMultiRing", type: "boolean", default: true, category: "Halo", description: "Render multi-ring halo component." },
    { key: "multiRingCount", type: "number", default: 20, min: 0, max: 50, step: 1, category: "Halo", description: "How many halo rings to draw." },
    { key: "multiRingStart", type: "number", default: 0.7, min: 0.4, max: 3, step: 0.05, category: "Halo", description: "Scale multiplier for the innermost halo ring." },
    { key: "multiRingGap", type: "number", default: 14.5, min: 0, max: 200, step: 0.5, category: "Halo", description: "Additional radius (px) added per successive halo ring." },
    { key: "multiRingStrokeWidth", type: "number", default: 7.75, min: 0.2, max: 10, step: 0.05, category: "Halo", description: "Stroke width for halo rings." },
    { key: "multiRingOpacity", type: "number", default: 0.26, min: 0, max: 1, step: 0.01, category: "Halo", description: "Opacity of the inner-most halo ring." },
    { key: "multiRingFade", type: "number", default: 0.01, min: 0, max: 0.5, step: 0.01, category: "Halo", description: "Opacity falloff per halo ring." },
    { key: "multiRingColor", type: "text", default: "#5a4feeff", category: "Halo", description: "Stroke color for halo rings." },
    { key: "ringColorMode", type: "select", default: "uniform", options: ["uniform", "radius", "random"], category: "Halo", description: "Halo color mode: uniform, size-based gradient, or random palette." },
    { key: "ringColorA", type: "text", default: "#ffffff", category: "Halo", description: "Gradient start color (used in radius mode)." },
    { key: "ringColorB", type: "text", default: "#000000", category: "Halo", description: "Gradient end color (used in radius mode)." },
    { key: "multiRingPalette", type: "text", default: "#aa0000,#0088ff,#00aa44,#ffa500", category: "Halo", description: "Comma-separated palette used when color mode is random." },
    { key: "showCircleRect", type: "boolean", default: false, category: "Circle Overlay", description: "Render circle overlay component." },
    { key: "circleStrokeWidth", type: "number", default: 0.2, min: 0.05, max: 5, step: 0.05, category: "Circle Overlay", description: "Stroke width for the circle overlay." },
    { key: "circleRectColor", type: "text", default: "#000000", category: "Circle Overlay", description: "Stroke color for circle overlays." },
    { key: "showTrail", type: "boolean", default: false, category: "Trail", description: "Render trailing filled circles." },
    { key: "trailEveryN", type: "number", default: 1, min: 1, max: 10, step: 1, category: "Trail", description: "Drop a trail dot every N frames." },
    { key: "trailLength", type: "number", default: 200, min: 0, max: 400, step: 1, category: "Trail", description: "How many trail nodes to keep." },
    { key: "trailOpacity", type: "number", default: 0.01, min: 0, max: 1, step: 0.01, category: "Trail", description: "Opacity of trail nodes." },
    { key: "trailRadius", type: "number", default: 100, min: 1, max: 200, step: 0.5, category: "Trail", description: "Radius of each trail dot." },
    { key: "trailColor", type: "text", default: "#aa0000", category: "Trail", description: "Fill color for trail dots (CSS color)." },
    { key: "trailStrokeColor", type: "text", default: "#000000", category: "Trail", description: "Stroke color for trail dots (CSS color)." },
    { key: "trailStrokeWidth", type: "number", default: 0, min: 0, max: 20, step: 0.5, category: "Trail", description: "Stroke width applied to trail dots (0 disables stroke)." },
  ],
  create({ mountEl }, state) {
    let formations = [];
    const root = d3.select(mountEl);
    const svg = root.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .style("display", "block")
        .attr("tabindex", 0)
        .style("background", state.backgroundColor || "white")
        .style("touch-action", "none");

    // Single scene group so transformHelp can clone/scale the entire visual.
    const sceneLayer = svg.append("g").attr("class", "scene");
    const trailLayer = sceneLayer.append("g").attr("class", "trails");
    const mergeLayer = sceneLayer.append("g").attr("class", "merges");
    const clusterLayer = sceneLayer.append("g").attr("class", "cells");
    mergeLayer.raise(); // Keep merge overlays above cells for visibility.

    let width = 0;
    let height = 0;
    let rafId = null;
    let lastTick = 0;
    let cells = [];
    let mergePaths = [];
    let mergeState = new Map();
    let mergedCellIds = new Set();
    let mergedCellStrength = new Map();
    let idCounter = 0;
    let formationSig = "";

    const directions = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
    ].map(d => {
      const len = Math.hypot(d.x, d.y) || 1;
      return { x: d.x / len, y: d.y / len };
    });

    function randDir() {
      return directions[Math.floor(Math.random() * directions.length)];
    }

    function createCell(formation) {
      const pos = { x: Math.random() * width, y: Math.random() * height };
      return {
        id: `c${idCounter++}`,
        formation,
        pos,
        outlinePos: { ...pos },
        dir: randDir(),
        dirTicks: 0,
      };
    }

    function formationSignature() {
      const count = Math.max(1, Math.floor(state.ringCount || 4));
      const rawMin = Number(state.ringMinRadius ?? 20);
      const rawMax = Number(state.ringMaxRadius ?? 80);
      const minR = Math.max(1, Math.min(rawMin, rawMax));
      const maxR = Math.max(minR, Math.max(rawMin, rawMax));
      const sizeKey = `${Math.round(width)}x${Math.round(height)}`;
      return `${count}|${minR}|${maxR}|${state.fitCells ? "fit" : "nofit"}|${state.fitFillRatio}|${sizeKey}`;
    }

    function rebuildCells(force = false) {
      const nextSig = formationSignature();
      if (!force && nextSig === formationSig && cells.length > 0) return;
      formationSig = nextSig;
      formations = buildFormations(state, { width, height });
      cells = formations.map(f => createCell(f));
      mergePaths = [];
      mergeState = new Map();
    }

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      return { width, height };
    };
    let lastSize = { width: 1, height: 1 };

    function resize() {
      const nextSize = size();
      lastSize = nextSize;
      width = lastSize.width;
      height = lastSize.height;
      svg.attr("viewBox", `0 0 ${width} ${height}`);
    }

    function stretchFactor(_cell) {
      // Keep cell outlines stable; disable directional stretching.
      return 1;
    }

    function getCollider(cell) {
      const f = cell.formation.bounds;
      const s = stretchFactor(cell) * (state.outlineScale || 1);
      const pad = state.outlinePad;
      const forceShape = state.outlineShape;
      const shape = forceShape === "auto" ? cell.formation.outlineType : forceShape;
      if (shape === "rect") {
        const w = f.width * s + pad * 2;
        const h = f.height * s + pad * 2;
        return { type: "rect", w, h };
      }
      const rx = f.rx * s + pad;
      const ry = f.ry * s + pad;
      const r = Math.max(rx, ry);
      return { type: "circle", r };
    }

    function step() {
      const allowMerges = !!state.showMergePaths;
      const mergeRatio = getMergeRatio(state);

      // Move
      for (const c of cells) {
        if (c.dirTicks <= 0) {
          c.dir = randDir();
          c.dirTicks = Math.floor(20 + Math.random() * 40);
        }
        c.dirTicks -= 1;

        c.pos.x += c.dir.x * state.speed;
        c.pos.y += c.dir.y * state.speed;

        // bounce on edges (no wrap)
        const margin = 40;
        if (c.pos.x > width - margin) { c.pos.x = width - margin; c.dir.x *= -1; }
        if (c.pos.x < margin) { c.pos.x = margin; c.dir.x *= -1; }
        if (c.pos.y > height - margin) { c.pos.y = height - margin; c.dir.y *= -1; }
        if (c.pos.y < margin) { c.pos.y = margin; c.dir.y *= -1; }

        c.outlinePos.x += (c.pos.x - c.outlinePos.x) * state.outlineLag;
        c.outlinePos.y += (c.pos.y - c.outlinePos.y) * state.outlineLag;
      }

      // Precompute colliders once per frame (also used for merge components).
      const colliders = new Map();
      const circleNodes = [];
      if (allowMerges) {
        for (const c of cells) {
          const col = getCollider(c);
          colliders.set(c.id, col);
          if (col.type === "circle") {
            circleNodes.push({
              cell: c,
              cx: c.outlinePos.x,
              cy: c.outlinePos.y,
              r: col.r,
            });
          }
        }
      } else {
        for (const c of cells) colliders.set(c.id, getCollider(c));
      }

      // Collision separation using outline shapes
      if (cells.length > 1) {
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const a = cells[i];
            const b = cells[j];
            const colA = colliders.get(a.id);
            const colB = colliders.get(b.id);

            // circle-circle (elliptical outlines approximated as circle)
            if (colA.type === "circle" && colB.type === "circle") {
              const dx = b.pos.x - a.pos.x;
              const dy = b.pos.y - a.pos.y;
              const dist2 = dx * dx + dy * dy;
              const minDist = colA.r + colB.r;
              const dist = Math.sqrt(dist2) || 1;

              if (state.collisionPush > 0 && dist2 < minDist * minDist) {
                const overlap = minDist - dist;
                const push = overlap * 0.5 * state.collisionPush;
                const nx = dx / dist;
                const ny = dy / dist;
                a.pos.x -= nx * push;
                a.pos.y -= ny * push;
                b.pos.x += nx * push;
                b.pos.y += ny * push;
              }
            }

            // rect-rect
            else if (colA.type === "rect" && colB.type === "rect") {
              const dx = b.pos.x - a.pos.x;
              const dy = b.pos.y - a.pos.y;
              const overlapX = (colA.w / 2 + colB.w / 2) - Math.abs(dx);
              const overlapY = (colA.h / 2 + colB.h / 2) - Math.abs(dy);
              if (state.collisionPush > 0 && overlapX > 0 && overlapY > 0) {
                if (overlapX < overlapY) {
                  const push = overlapX * 0.5 * state.collisionPush;
                  const dir = dx >= 0 ? 1 : -1;
                  a.pos.x -= dir * push;
                  b.pos.x += dir * push;
                } else {
                  const push = overlapY * 0.5 * state.collisionPush;
                  const dir = dy >= 0 ? 1 : -1;
                  a.pos.y -= dir * push;
                  b.pos.y += dir * push;
                }
              }
            }

            // circle-rect (ellipse approximated as circle)
            else {
              const circ = colA.type === "circle" ? a : b;
              const rect = colA.type === "rect" ? a : b;
              const circCol = colA.type === "circle" ? colA : colB;
              const rectCol = colA.type === "rect" ? colA : colB;

              const cx = circ.pos.x;
              const cy = circ.pos.y;
              const rx = rect.pos.x;
              const ry = rect.pos.y;

              const halfW = rectCol.w / 2;
              const halfH = rectCol.h / 2;

              const closestX = Math.max(rx - halfW, Math.min(cx, rx + halfW));
              const closestY = Math.max(ry - halfH, Math.min(cy, ry + halfH));

              const dx = cx - closestX;
              const dy = cy - closestY;
              const dist2 = dx * dx + dy * dy;
              const r = circCol.r;
              if (state.collisionPush > 0 && dist2 < r * r) {
                const dist = Math.sqrt(dist2) || 1;
                const overlap = r - dist;
                const push = overlap * state.collisionPush;
                const nx = dx / dist;
                const ny = dy / dist;
                // push circle away, rect opposite
                circ.pos.x += nx * push * 0.5;
                circ.pos.y += ny * push * 0.5;
                rect.pos.x -= nx * push * 0.5;
                rect.pos.y -= ny * push * 0.5;
              }
            }
          }
        }
      }

      // --- Merge overlays (multi-merge via connected components of overlapping circles) ---
      const prevStrength = mergedCellStrength;
      mergedCellIds = new Set();
      mergedCellStrength = new Map();

      const mergeSmooth = Math.max(0.01, getMergeSmoothing(state));
      const mergeDecay = Math.max(0.01, getMergeFalloff(state));
      const targetStrength = new Map();
      const nextMerges = [];

      if (allowMerges && circleNodes.length) {
        // Build soft edges for all circle pairs, so merges ease in/out instead of popping.
        const n = circleNodes.length;
        const parent = Array.from({ length: n }, (_d, i) => i);
        const rank = Array(n).fill(0);

        const find = (x) => {
          while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
          }
          return x;
        };
        const union = (aIdx, bIdx) => {
          let ra = find(aIdx);
          let rb = find(bIdx);
          if (ra === rb) return;
          if (rank[ra] < rank[rb]) { const t = ra; ra = rb; rb = t; }
          parent[rb] = ra;
          if (rank[ra] === rank[rb]) rank[ra] += 1;
        };

        // Soft contact value in [0,1] with a small falloff band beyond mergeContactRatio.
        const falloffBand = Math.max(0.02, Math.min(0.35, mergeDecay));
        const softThresholdRatio = mergeRatio * (1 + falloffBand);

        const bestStrength = new Map();

        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const A = circleNodes[i];
            const B = circleNodes[j];
            const dx = B.cx - A.cx;
            const dy = B.cy - A.cy;
            const d = Math.hypot(dx, dy);
            const rSum = A.r + B.r;

            const on = rSum * mergeRatio;
            const off = rSum * softThresholdRatio;

            // t = 1 at full overlap, 0 at 'off' distance.
            let t = 1 - (d - on) / Math.max(1e-6, (off - on));
            t = Math.max(0, Math.min(1, t));

            if (t > 0) {
              union(i, j);
              // Component strength = max pair strength within the component.
              // Store against both nodes (we'll reconcile after unions via find()).
              bestStrength.set(i, Math.max(bestStrength.get(i) || 0, t));
              bestStrength.set(j, Math.max(bestStrength.get(j) || 0, t));
            }
          }
        }

        // Build connected components
        const groups = new Map();
        for (let i = 0; i < n; i++) {
          const r = find(i);
          if (!groups.has(r)) groups.set(r, []);
          groups.get(r).push(i);
        }

        // Compute max t per component (re-find after union)
        const strength = new Map();
        for (let i = 0; i < n; i++) {
          const r = find(i);
          strength.set(r, Math.max(strength.get(r) || 0, bestStrength.get(i) || 0));
        }

        for (const [root, idxs] of groups.entries()) {
          if (idxs.length < 2) continue;

          const circles = idxs.map(i => ({
            x: circleNodes[i].cx,
            y: circleNodes[i].cy,
            r: circleNodes[i].r
          }));
          const d = buildUnionContourPath(circles, 2, 6);
          if (!d) continue;

          const ids = idxs.map(i => circleNodes[i].cell.id).sort();
          const key = ids.join("|");
          const t = strength.get(root) || 0;

          nextMerges.push({
            key,
            d,
            cells: idxs.map(i => circleNodes[i].cell),
            t
          });
        }
      }

      // Smoothly blend merge appearance/disappearance (no snapping)
      const nextByKey = new Map(nextMerges.map(m => [m.key, m]));

      // Update existing & new merges
      for (const [key, m] of nextByKey.entries()) {
        const prev = mergeState.get(key) || { key, alpha: 0, d: m.d, cells: m.cells, t: 0 };
        const target = m.t || 0;
        const alpha = prev.alpha + (target - prev.alpha) * mergeSmooth;
        mergeState.set(key, { key, alpha, d: m.d, cells: m.cells, t: target });
      }

      // Decay merges that no longer exist this frame
      for (const [key, prev] of Array.from(mergeState.entries())) {
        if (nextByKey.has(key)) continue;
        const alpha = prev.alpha + (0 - prev.alpha) * mergeSmooth;
        if (alpha <= 0.01) {
          mergeState.delete(key);
          continue;
        }
        mergeState.set(key, { ...prev, alpha, t: 0 });
      }

      const limit = Math.max(1, Math.floor(state.mergeMaxPairs || 1));
      mergePaths = Array.from(mergeState.values())
        .sort((a, b) => (b.alpha || 0) - (a.alpha || 0))
        .slice(0, limit);

      for (const m of mergePaths) {
        const strength = Math.max(0, Math.min(1, m.alpha ?? m.t ?? 0));
        for (const c of m.cells) {
          const prev = targetStrength.get(c.id) || 0;
          targetStrength.set(c.id, Math.max(prev, strength));
        }
      }

      // Smoothly fade base outlines/dots out/in per cell.
      const allIds = new Set([...targetStrength.keys(), ...prevStrength.keys()]);
      for (const id of allIds) {
        const prev = prevStrength.get(id) || 0;
        const target = targetStrength.get(id) || 0;
        let val;
        if (target > prev) {
          val = prev + (target - prev) * mergeSmooth;
        } else {
          val = prev + (target - prev) * mergeDecay;
        }
        if (val > 0.001) {
          mergedCellStrength.set(id, val);
          mergedCellIds.add(id);
        }
      }

      render();
    }

    function render() {
      const lineColor = state.lineColor || "#000";
      const outlineStrokeWidth = state.outlineStrokeWidth || 2;
      const dotStrokeWidth = state.dotStrokeWidth || 2;
      const palette = getPalette(state);
      const randomMode = state.ringColorMode === "random";
      const mergeStyle = state.mergeEffectStyle || "ring";
      const mergeSolidColor = state.mergeEffectColor || state.multiRingColor || lineColor;

      const cellColor = (cell) => {
        if (!randomMode) return lineColor;
        return ensureCellRandomColor(cell, palette, lineColor);
      };

      const ringRadiusHint = (cell) => {
        const b = cell?.formation?.bounds;
        const base = b ? Math.max(b.rx, b.ry) : 1;
        return base * (state.multiRingStart ?? 1.1);
      };
      const ringMergeColor = (cell) => getRingColorForCell(cell, state, ringRadiusHint(cell), palette);

      const mergeColor = (cellsList) => {
        if (!cellsList || !cellsList.length) return mergeSolidColor;
        if (mergeStyle === "solid") return mergeSolidColor;
        if (mergeStyle === "ring") {
          let c = ringMergeColor(cellsList[0]);
          for (let i = 1; i < cellsList.length; i++) c = mixColors(c, ringMergeColor(cellsList[i]), 0.5);
          return c;
        }
        let c = cellColor(cellsList[0]);
        for (let i = 1; i < cellsList.length; i++) c = mixColors(c, cellColor(cellsList[i]), 0.5);
        return c;
      };

      mergeLayer.raise();
      if (!state.showMergePaths) {
        mergeLayer.selectAll("path.merge").remove();
      } else {
        const mergeSel = mergeLayer.selectAll("path.merge").data(mergePaths, d => d.key);
        mergeSel.exit().remove();
        const mergeDraw = mergeSel.enter()
          .append("path")
          .attr("class", "merge")
          .attr("stroke-linejoin", "round")
          .attr("stroke-linecap", "round")
          .merge(mergeSel);

        mergeDraw
          .attr("d", d => d.d)
          .attr("stroke", d => mergeColor(d.cells))
          .attr("stroke-width", d => {
            const a = Math.max(0, Math.min(1, d.alpha ?? d.t ?? 0));
            return outlineStrokeWidth * (0.25 + 1.25 * a);
          })
          .attr("fill", d => mergeColor(d.cells))
          .attr("fill-opacity", d => {
            const a = Math.max(0, Math.min(1, d.alpha ?? d.t ?? 0));
            return 0.1 + 0.5 * a;
          })
          .attr("opacity", d => {
            const a = Math.max(0, Math.min(1, d.alpha ?? d.t ?? 0));
            return 0.15 + 0.85 * a;
          });
      }

      const cellSel = clusterLayer.selectAll("g.cell").data(cells, d => d.id);
      const enter = cellSel.enter().append("g").attr("class", "cell");
      enter.append("g").attr("class", "dots");
      enter.append("g").attr("class", "components");
      enter.append("ellipse").attr("class", "outline ellipse")
        .attr("fill", "none");
      enter.append("rect").attr("class", "outline rect")
        .attr("fill", "none");

      const merged = enter.merge(cellSel)
        .attr("transform", d => `translate(${d.pos.x}, ${d.pos.y})`);

      merged.each(function(cell) {
        const g = d3.select(this);
        const cellLineColor = cellColor(cell);
        const mergeLevel = state.showMergePaths ? (mergedCellStrength.get(cell.id) || 0) : 0;
        const fadeOut = Math.min(1, Math.pow(mergeLevel, 0.65));
        const baseOpacity = 1 - 0.85 * fadeOut;

        const dots = g.select("g.dots").selectAll("circle").data(cell.formation.dots);
        dots.enter().append("circle")
          .attr("r", DOT_R)
          .attr("fill", "none")
          .merge(dots)
          .attr("cx", d => d.x)
          .attr("cy", d => d.y)
          .attr("stroke", cellLineColor)
          .attr("stroke-width", dotStrokeWidth)
          .attr("r", DOT_R)
          .attr("opacity", baseOpacity);
        dots.exit().remove();

        const pad = state.outlinePad;
        const stretch = stretchFactor(cell) * (state.outlineScale || 1);
        const rx = cell.formation.bounds.rx * stretch + pad;
        const ry = cell.formation.bounds.ry * stretch + pad;
        const w = cell.formation.bounds.width * stretch + pad * 2;
        const h = cell.formation.bounds.height * stretch + pad * 2;

        const forceShape = state.outlineShape;
        const shape = forceShape === "auto" ? cell.formation.outlineType : forceShape;

        g.selectAll("ellipse.outline")
          .style("display", shape === "ellipse" ? "block" : "none")
          .attr("cx", cell.outlinePos.x - cell.pos.x)
          .attr("cy", cell.outlinePos.y - cell.pos.y)
          .attr("rx", rx)
          .attr("ry", ry)
          .attr("stroke", cellLineColor)
          .attr("stroke-width", outlineStrokeWidth)
          .attr("opacity", baseOpacity);

        g.selectAll("rect.outline")
          .style("display", shape === "rect" ? "block" : "none")
          .attr("x", (cell.outlinePos.x - cell.pos.x) - w / 2)
          .attr("y", (cell.outlinePos.y - cell.pos.y) - h / 2)
          .attr("width", w)
          .attr("height", h)
          .attr("stroke", cellLineColor)
          .attr("stroke-width", outlineStrokeWidth)
          .attr("opacity", baseOpacity);

        // Components: ensure created once
        if (!cell._components) {
          const compGroup = g.select("g.components");
          cell._components = CELL_COMPONENT_FACTORIES.map(cfg =>
            cfg.factory(cell, compGroup, trailLayer)
          );
        }
        const info = {
          cx: cell.outlinePos.x - cell.pos.x,
          cy: cell.outlinePos.y - cell.pos.y,
          rx, ry, w, h,
          cell,
        };
        for (const comp of cell._components) comp?.update?.(info, state);
      });

      cellSel.exit().remove();
    }

    function loop(now) {
      if (!state.running) {
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(loop);
      if (!lastTick) lastTick = now;
      const dt = now - lastTick;
      if (dt >= state.tickMs) {
        lastTick = now - (dt % state.tickMs);
        step();
      }
    }

    function start() {
      if (!rafId) rafId = requestAnimationFrame(loop);
    }
    function stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function applyChanges() {
      svg.style("background", state.backgroundColor || "white");
      resize();
      rebuildCells();
      render();
      if (state.running) start();
      else stop();
    }

    const ro = new ResizeObserver(() => applyChanges());
    ro.observe(mountEl);
    resize();
    applyChanges();
    start();

    return {
      render: () => applyChanges(),
      destroy: () => {
        stop();
        ro.disconnect();
        svg.remove();
      }
    };
  }
});

const INITIAL_STATE = {
  shouldRender: false,
  __xf: {
    ui: {
      preset: "kaleidoscope4",
      splitMode: "screen",
      splitCount: 1,
      activeTile: "0",
      applyToAll: false,
      tileTargets: "0-3",
      rotateDeg: 90,
      zoomFactor: 1.1,
      zoomCenter: { x: null, y: null },
      translateVec: { x: 0, y: 0 },
    },
    stack: [
      { kind: "split", count: 4 },
      { kind: "flipY", targets: [0] },
      { kind: "flipX", targets: [1] },
      { kind: "flipY", targets: [1] },
      { kind: "flipX", targets: [3] },
      { kind: "zoom", targets: [0, 1, 2, 3], factor: 1.1, center: { x: null, y: null } },
      { kind: "zoom", targets: [0, 1, 2, 3], factor: 1.1, center: { x: null, y: null } },
    ],
  },
};

let appHandle = null;

function cloneSettings(settings) {
  return settings ? JSON.parse(JSON.stringify(settings)) : undefined;
}

function startBacteriaApp(settings = INITIAL_STATE) {
  const mountEl = document.getElementById("vis");
  const uiEl = document.getElementById("config");

  if (appHandle?.instance?.destroy) {
    appHandle.instance.destroy();
  }

  uiEl.innerHTML = "";
  mountEl.innerHTML = "";

  appHandle = runVisualApp({
    visualId: "bacteriaMinimal",
    mountEl,
    uiEl,
    state: cloneSettings(settings ?? INITIAL_STATE),
  });
}

async function loadPresetSettings(fileName) {
  try {
    const res = await fetch(fileName, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const settings = await res.json();
    settings.shouldRender = true;
    startBacteriaApp(settings);
  } catch (err) {
    console.error(err);
    alert(`Failed to load preset "${fileName}": ${err?.message || err}`);
  }
}

function wirePresetButtons() {
  const presets = [
    { id: "preset-default", file: "bacteriaDefault.settings.json" },
    { id: "preset-cluster", file: "clusterColor.json" },
    { id: "preset-gradiant", file: "gradiant.json" },
    { id: "preset-shimmer", file: "shimmer.json" },
  ];

  presets.forEach(({ id, file }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", () => loadPresetSettings(file));
  });
  loadPresetSettings("bacteriaDefault.settings.json");
}

document.addEventListener("DOMContentLoaded", () => {
  startBacteriaApp();
  wirePresetButtons();
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
