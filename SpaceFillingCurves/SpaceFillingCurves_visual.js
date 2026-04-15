import { registerVisual } from "../helper/visualHelp.js";

const CURVE_OPTIONS = ["hilbert", "peano"];
const SCALE_MODES = ["stretch", "globalClip"];
const DEFAULTS = Object.freeze({
  curveMode: "hilbert",
  curveScalingMode: "stretch",
  hilbertOrder: 5,
  peanoOrder: 3,
  detailStepPx: 6,
  lineInsetPx: 2,
  lineWidth: 1.25,
  lineOpacity: 0.9,
  outlineWidth: 1,
  seed: 307271,
});
const LIMITS = Object.freeze({
  hilbertOrder: 12,
  peanoOrder: 8,
});
const CURVE_CACHE = {
  hilbert: new Map(),
  peano: new Map(),
};

const PALETTES = {
  blueprint: {
    background: "#071722",
    rectFill: "#123044",
    line: ["#9de1ff", "#d7f2ff", "#75b6ff", "#c0fff2"],
    outline: "#f2fbff",
  },
  paperInk: {
    background: "#efe8d8",
    rectFill: "#f7f2e7",
    line: ["#0d2235", "#2e4f6a", "#355e3b", "#7f3b22"],
    outline: "#2f2a22",
  },
  monoBright: {
    background: "#f4f4f4",
    rectFill: "#fcfcfc",
    line: ["#111111", "#333333", "#666666", "#222222"],
    outline: "#101010",
  },
};

function clampNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, fallback = 0, min = -Infinity, max = Infinity) {
  const n = Math.floor(clampNum(value, fallback));
  return Math.max(min, Math.min(max, n));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, clampNum(value, 0)));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rotateHilbert(size, x, y, rx, ry) {
  if (ry === 0) {
    if (rx === 1) {
      x = size - 1 - x;
      y = size - 1 - y;
    }
    return [y, x];
  }
  return [x, y];
}

function hilbertD2xy(order, d) {
  const n = 1 << order;
  let x = 0;
  let y = 0;
  let t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & Math.floor(t / 2);
    const ry = 1 & (t ^ rx);
    [x, y] = rotateHilbert(s, x, y, rx, ry);
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

function makeHilbert(order) {
  const safeOrder = clampInt(order, DEFAULTS.hilbertOrder, 1, LIMITS.hilbertOrder);
  const cached = CURVE_CACHE.hilbert.get(safeOrder);
  if (cached) return cached;
  const n = 1 << safeOrder;
  const maxIndex = Math.max(1, n - 1);
  const total = n * n;
  const out = [];
  for (let d = 0; d < total; d++) {
    const [x, y] = hilbertD2xy(safeOrder, d);
    out.push([x / maxIndex, y / maxIndex]);
  }
  CURVE_CACHE.hilbert.set(safeOrder, out);
  return out;
}

function makePeano(order) {
  const safeOrder = clampInt(order, DEFAULTS.peanoOrder, 1, LIMITS.peanoOrder);
  const cached = CURVE_CACHE.peano.get(safeOrder);
  if (cached) return cached;
  const rec = (depth) => {
    if (depth <= 0) return [[0, 0]];
    const childSize = 3 ** (depth - 1);
    const childMax = childSize - 1;
    const child = rec(depth - 1);
    const out = [];

    for (let row = 0; row < 3; row++) {
      const cols = row % 2 === 0 ? [0, 1, 2] : [2, 1, 0];
      for (const col of cols) {
        const flipX = row % 2 === 1;
        const flipY = col % 2 === 1;
        for (const [x, y] of child) {
          out.push([
            col * childSize + (flipX ? childMax - x : x),
            row * childSize + (flipY ? childMax - y : y),
          ]);
        }
      }
    }
    return out;
  };

  const raw = rec(safeOrder);
  const maxCoord = Math.max(1, 3 ** safeOrder - 1);
  const normalized = raw.map(([x, y]) => [x / maxCoord, y / maxCoord]);
  CURVE_CACHE.peano.set(safeOrder, normalized);
  return normalized;
}

function getCurveOrder(mode, state) {
  return mode === "peano"
    ? clampInt(state.peanoOrder, DEFAULTS.peanoOrder, 1, LIMITS.peanoOrder)
    : clampInt(state.hilbertOrder, DEFAULTS.hilbertOrder, 1, LIMITS.hilbertOrder);
}

function getEffectiveCurveOrder(mode, requestedOrder, width, height, detailStepPx) {
  const safeRequested = clampInt(
    requestedOrder,
    mode === "peano" ? DEFAULTS.peanoOrder : DEFAULTS.hilbertOrder,
    1,
    mode === "peano" ? LIMITS.peanoOrder : LIMITS.hilbertOrder
  );
  const minSpan = Math.max(1, Math.min(clampNum(width, 1), clampNum(height, 1)));
  const minSegmentPx = Math.max(1, clampNum(detailStepPx, DEFAULTS.detailStepPx) * 0.5);
  const maxCells = Math.max(1, Math.floor(minSpan / minSegmentPx) + 1);
  const base = mode === "peano" ? 3 : 2;
  const maxUseful = Math.max(1, Math.floor(Math.log(maxCells) / Math.log(base)));
  return Math.min(safeRequested, maxUseful);
}

function mapCurveToRect(unitPoints, rect) {
  return unitPoints.map(([u, v]) => [rect.x + u * rect.w, rect.y + v * rect.h]);
}

function curvePathToRect(unitPoints, rect, stepPx) {
  const step = Math.max(0.5, clampNum(stepPx, 6));
  if (!Array.isArray(unitPoints) || unitPoints.length === 0) return "";
  if (unitPoints.length === 1) {
    return `M ${(rect.x + unitPoints[0][0] * rect.w).toFixed(3)} ${(rect.y + unitPoints[0][1] * rect.h).toFixed(3)}`;
  }

  const parts = [];
  const startX = rect.x + unitPoints[0][0] * rect.w;
  const startY = rect.y + unitPoints[0][1] * rect.h;
  parts.push(`M ${startX.toFixed(3)} ${startY.toFixed(3)}`);

  let anchorX = startX;
  let anchorY = startY;
  let carry = 0;
  let ax = startX;
  let ay = startY;

  for (let i = 1; i < unitPoints.length; i++) {
    const b = unitPoints[i];
    const bx = rect.x + b[0] * rect.w;
    const by = rect.y + b[1] * rect.h;
    const dx = bx - ax;
    const dy = by - ay;
    const segLen = dx === 0 ? Math.abs(dy) : Math.abs(dx);
    if (segLen < 1e-6) continue;

    const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
    let distAlong = step - carry;
    while (distAlong <= segLen + 1e-6) {
      const px = ax + stepX * distAlong;
      const py = ay + stepY * distAlong;
      parts.push(` L ${px.toFixed(3)} ${py.toFixed(3)}`);
      anchorX = px;
      anchorY = py;
      distAlong += step;
      carry = 0;
    }
    carry = Math.hypot(bx - anchorX, by - anchorY);
    ax = bx;
    ay = by;
  }

  const end = unitPoints[unitPoints.length - 1];
  const endX = rect.x + end[0] * rect.w;
  const endY = rect.y + end[1] * rect.h;
  if (Math.hypot(endX - anchorX, endY - anchorY) > 0.35) {
    parts.push(` L ${endX.toFixed(3)} ${endY.toFixed(3)}`);
  }
  return parts.join("");
}

function resamplePolyline(points, stepPx) {
  const step = Math.max(0.5, clampNum(stepPx, 6));
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const out = [points[0]];
  let anchor = points[0];
  let carry = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;
    const ux = dx / segLen;
    const uy = dy / segLen;
    let distAlong = step - carry;
    while (distAlong <= segLen + 1e-6) {
      const px = a[0] + ux * distAlong;
      const py = a[1] + uy * distAlong;
      out.push([px, py]);
      anchor = [px, py];
      distAlong += step;
      carry = 0;
    }
    carry = Math.hypot(b[0] - anchor[0], b[1] - anchor[1]);
  }

  const end = points[points.length - 1];
  const last = out[out.length - 1];
  if (Math.hypot(end[0] - last[0], end[1] - last[1]) > 0.35) out.push(end);
  return out;
}

function toPath(points) {
  if (!Array.isArray(points) || points.length === 0) return "";
  let d = `M ${points[0][0].toFixed(3)} ${points[0][1].toFixed(3)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0].toFixed(3)} ${points[i][1].toFixed(3)}`;
  }
  return d;
}

function pointsNearlyEqual(a, b, eps = 1e-6) {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
}

function clipSegmentToRect(a, b, rect) {
  const xmin = rect.x;
  const xmax = rect.x + rect.w;
  const ymin = rect.y;
  const ymax = rect.y + rect.h;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];

  let t0 = 0;
  let t1 = 1;
  const tests = [
    [-dx, a[0] - xmin],
    [dx, xmax - a[0]],
    [-dy, a[1] - ymin],
    [dy, ymax - a[1]],
  ];

  for (const [p, q] of tests) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }

  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ];
}

function clipPolylineToRect(points, rect) {
  const segments = [];
  let current = null;

  for (let i = 1; i < points.length; i++) {
    const clipped = clipSegmentToRect(points[i - 1], points[i], rect);
    if (!clipped) {
      if (current && current.length > 1) segments.push(current);
      current = null;
      continue;
    }

    const [start, end] = clipped;
    if (current && pointsNearlyEqual(current[current.length - 1], start)) {
      current.push(end);
    } else {
      if (current && current.length > 1) segments.push(current);
      current = [start, end];
    }
  }

  if (current && current.length > 1) segments.push(current);
  return segments;
}

function segmentsToPath(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return "";
  let d = "";
  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length < 2) continue;
    d += `M ${segment[0][0].toFixed(3)} ${segment[0][1].toFixed(3)}`;
    for (let i = 1; i < segment.length; i++) {
      d += ` L ${segment[i][0].toFixed(3)} ${segment[i][1].toFixed(3)}`;
    }
  }
  return d;
}

function addSpace(spaces, x, y, w, h, minSide) {
  if (w < minSide || h < minSide) return;
  spaces.push({ x, y, w, h });
}

function chooseSpaceIndex(spaces, rand) {
  if (!spaces.length) return -1;
  const totalArea = spaces.reduce((sum, s) => sum + s.w * s.h, 0);
  if (totalArea <= 0) return 0;
  let ticket = rand() * totalArea;
  for (let i = 0; i < spaces.length; i++) {
    ticket -= spaces[i].w * spaces[i].h;
    if (ticket <= 0) return i;
  }
  return spaces.length - 1;
}

function pruneContainedSpaces(spaces) {
  const eps = 1e-6;
  const out = [];
  for (let i = 0; i < spaces.length; i++) {
    const a = spaces[i];
    const areaA = a.w * a.h;
    let contained = false;
    for (let j = 0; j < spaces.length; j++) {
      if (i === j) continue;
      const b = spaces[j];
      const areaB = b.w * b.h;
      const sameBounds =
        Math.abs(a.x - b.x) <= eps &&
        Math.abs(a.y - b.y) <= eps &&
        Math.abs(a.w - b.w) <= eps &&
        Math.abs(a.h - b.h) <= eps;
      const strictOrEarlierDuplicate = areaB > areaA + eps || (sameBounds && j < i);
      if (
        strictOrEarlierDuplicate &&
        a.x + eps >= b.x &&
        a.y + eps >= b.y &&
        a.x + a.w <= b.x + b.w + eps &&
        a.y + a.h <= b.y + b.h + eps
      ) {
        contained = true;
        break;
      }
    }
    if (!contained) out.push(a);
  }
  return out;
}

function makeRectInSpace(space, rand, minSize, maxSize, minAspect, maxAspect) {
  const minW = Math.min(minSize, space.w);
  const minH = Math.min(minSize, space.h);
  const maxW = Math.min(maxSize, space.w);
  const maxH = Math.min(maxSize, space.h);
  if (maxW < 1 || maxH < 1) return null;

  let w = minW + (maxW - minW) * Math.pow(rand(), 0.5);
  let h = minH + (maxH - minH) * Math.pow(rand(), 0.5);
  const aspect = Math.max(0.05, minAspect + rand() * (maxAspect - minAspect));
  const current = w / Math.max(1e-6, h);
  if (current < aspect) w = Math.min(maxW, h * aspect);
  if (current > aspect) h = Math.min(maxH, w / aspect);
  w = Math.max(1, Math.min(maxW, w));
  h = Math.max(1, Math.min(maxH, h));

  const xSlack = space.w - w;
  const ySlack = space.h - h;
  const x = space.x + (xSlack > 0 ? rand() * xSlack : 0);
  const y = space.y + (ySlack > 0 ? rand() * ySlack : 0);
  return { x, y, w, h };
}

function splitSpaceAroundRect(space, rect, minSide) {
  const x0 = space.x;
  const y0 = space.y;
  const x1 = x0 + space.w;
  const y1 = y0 + space.h;
  const rx0 = rect.x;
  const ry0 = rect.y;
  const rx1 = rx0 + rect.w;
  const ry1 = ry0 + rect.h;

  const next = [];
  addSpace(next, x0, y0, rx0 - x0, space.h, minSide);
  addSpace(next, rx1, y0, x1 - rx1, space.h, minSide);
  const cx0 = Math.max(x0, rx0);
  const cx1 = Math.min(x1, rx1);
  addSpace(next, cx0, y0, cx1 - cx0, ry0 - y0, minSide);
  addSpace(next, cx0, ry1, cx1 - cx0, y1 - ry1, minSide);
  return next;
}

function packRectangles(width, height, state, rand) {
  const minSize = Math.max(8, clampNum(state.minRectSize, 80));
  const maxSize = Math.max(minSize, clampNum(state.maxRectSize, 280));
  const minAspect = Math.max(0.2, clampNum(state.minRectAspect, 0.5));
  const maxAspect = Math.max(minAspect, clampNum(state.maxRectAspect, 2.2));
  const maxRectangles = clampInt(state.maxRectangles, 220, 1, 2400);
  const minSpace = 1;

  const rects = [];
  let spaces = [{ x: 0, y: 0, w: width, h: height }];
  let guard = 0;
  const maxGuard = maxRectangles * 12 + 500;

  while (spaces.length > 0 && rects.length < maxRectangles && guard < maxGuard) {
    guard += 1;
    const spaceIndex = chooseSpaceIndex(spaces, rand);
    if (spaceIndex < 0) break;
    const [space] = spaces.splice(spaceIndex, 1);
    const rect = makeRectInSpace(space, rand, minSize, maxSize, minAspect, maxAspect);
    if (!rect) continue;
    rects.push(rect);
    spaces.push(...splitSpaceAroundRect(space, rect, minSpace));
    spaces = pruneContainedSpaces(spaces);
  }

  // Consume every remaining gap so rectangle coverage reaches the full scene.
  for (const s of spaces) {
    if (s.w >= 1 && s.h >= 1) rects.push({ x: s.x, y: s.y, w: s.w, h: s.h });
  }

  return rects;
}

function makeRectElement(rect, ns, fill, stroke, strokeWidth, opacity) {
  const el = document.createElementNS(ns, "rect");
  el.setAttribute("x", rect.x.toFixed(3));
  el.setAttribute("y", rect.y.toFixed(3));
  el.setAttribute("width", rect.w.toFixed(3));
  el.setAttribute("height", rect.h.toFixed(3));
  if (fill != null) el.setAttribute("fill", fill);
  if (stroke != null) el.setAttribute("stroke", stroke);
  if (strokeWidth != null) el.setAttribute("stroke-width", String(strokeWidth));
  if (opacity != null) el.setAttribute("opacity", String(opacity));
  return el;
}

registerVisual("spaceFillingCurves", {
  title: "Space Filling Curves",
  description: "Randomly pack rectangles until full coverage, then fill each with Hilbert or Peano curves at one shared detail scale.",
  params: [
    {
      key: "curveMode",
      label: "curve mode",
      type: "select",
      default: "peano",
      options: CURVE_OPTIONS,
      category: "Curve",
    },
    {
      key: "curveScalingMode",
      label: "curve scaling",
      type: "select",
      default: "stretch",
      options: SCALE_MODES,
      category: "Curve",
      description: "Stretch maps one curve to each rectangle. Global clip draws one scene-wide curve and clips it per rectangle.",
    },
    {
      key: "hilbertOrder",
      label: "hilbert order",
      type: "number",
      default: 5,
      min: 1,
      max: 12,
      step: 1,
      category: "Curve",
    },
    {
      key: "peanoOrder",
      label: "peano order",
      type: "number",
      default: 3,
      min: 1,
      max: 8,
      step: 1,
      category: "Curve",
    },
    {
      key: "detailStepPx",
      label: "detail step px",
      type: "number",
      default: 6,
      min: 1,
      max: 30,
      step: 0.5,
      category: "Curve",
      description: "Global spacing for sampled curve points, shared by every rectangle.",
    },
    {
      key: "curveCellPx",
      label: "curve cell px",
      type: "number",
      default: 96,
      min: 8,
      max: 800,
      step: 1,
      category: "Curve",
      description: "Used by the invariant-scale mode elsewhere; retained here for compatibility.",
    },
    {
      key: "lineInsetPx",
      label: "line inset px",
      type: "number",
      default: 2,
      min: 0,
      max: 40,
      step: 0.5,
      category: "Curve",
      description: "Inset from rectangle edges before drawing curves.",
    },
    {
      key: "minRectSize",
      label: "min rect size",
      type: "number",
      default: 80,
      min: 8,
      max: 1200,
      step: 1,
      category: "Rectangles",
    },
    {
      key: "maxRectSize",
      label: "max rect size",
      type: "number",
      default: 280,
      min: 8,
      max: 1600,
      step: 1,
      category: "Rectangles",
    },
    {
      key: "minRectAspect",
      label: "min rect aspect",
      type: "number",
      default: 0.5,
      min: 0.2,
      max: 8,
      step: 0.05,
      category: "Rectangles",
    },
    {
      key: "maxRectAspect",
      label: "max rect aspect",
      type: "number",
      default: 2.2,
      min: 0.2,
      max: 8,
      step: 0.05,
      category: "Rectangles",
    },
    {
      key: "maxRectangles",
      label: "max rectangles",
      type: "number",
      default: 10,
      min: 1,
      max: 2400,
      step: 1,
      category: "Rectangles",
    },
    {
      key: "palette",
      type: "select",
      default: "blueprint",
      options: Object.keys(PALETTES),
      category: "Style",
    },
    {
      key: "lineWidth",
      label: "line width",
      type: "number",
      default: 1.25,
      min: 0.1,
      max: 10,
      step: 0.1,
      category: "Style",
    },
    {
      key: "lineOpacity",
      label: "line opacity",
      type: "number",
      default: 0.9,
      min: 0.05,
      max: 1,
      step: 0.01,
      category: "Style",
    },
    {
      key: "showRectFill",
      label: "show rect fill",
      type: "boolean",
      default: false,
      category: "Style",
    },
    {
      key: "rectFillOpacity",
      label: "rect fill opacity",
      type: "number",
      default: 0.28,
      min: 0,
      max: 1,
      step: 0.01,
      category: "Style",
    },
    {
      key: "showOutlines",
      label: "show outlines",
      type: "boolean",
      default: false,
      category: "Style",
    },
    {
      key: "outlineWidth",
      label: "outline width",
      type: "number",
      default: 1,
      min: 0,
      max: 10,
      step: 0.1,
      category: "Style",
    },
    {
      key: "seed",
      type: "number",
      default: 307271,
      min: 0,
      max: 999999,
      step: 1,
      category: "System",
    },
    {
      type: "button",
      key: "newSeed",
      label: "New Seed",
      category: "System",
      onClick: ({ state }) => {
        state.seed = Math.floor(Math.random() * 1_000_000);
      },
    },
  ],

  create({ mountEl }, state) {
    mountEl.innerHTML = "";
    let cachedGlobalCurveKey = "";
    let cachedGlobalCurvePoints = null;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";
    mountEl.appendChild(svg);

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      return {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      };
    };

    const render = () => {
      const { width, height } = size();
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.innerHTML = "";

      const seed = clampInt(state.seed, DEFAULTS.seed, 0, 999999);
      const rand = mulberry32(seed);
      const palette = PALETTES[String(state.palette)] || PALETTES.blueprint;
      const lineWidth = Math.max(0.1, clampNum(state.lineWidth, DEFAULTS.lineWidth));
      const lineOpacity = clamp01(state.lineOpacity ?? DEFAULTS.lineOpacity);
      const showRectFill = state.showRectFill === true;
      const showOutlines = state.showOutlines === true;
      const rectFillOpacity = clamp01(state.rectFillOpacity);
      const outlineWidth = Math.max(0, clampNum(state.outlineWidth, DEFAULTS.outlineWidth));
      const lineInsetPx = Math.max(0, clampNum(state.lineInsetPx, DEFAULTS.lineInsetPx));
      const detailStepPx = Math.max(1, clampNum(state.detailStepPx, DEFAULTS.detailStepPx));

      const rects = packRectangles(width, height, state, rand);

      const ns = svg.namespaceURI;
      const gBg = document.createElementNS(ns, "g");
      const gFill = document.createElementNS(ns, "g");
      const gLines = document.createElementNS(ns, "g");
      const gOutlines = document.createElementNS(ns, "g");

      const bg = document.createElementNS(ns, "rect");
      bg.setAttribute("x", "0");
      bg.setAttribute("y", "0");
      bg.setAttribute("width", String(width));
      bg.setAttribute("height", String(height));
      bg.setAttribute("fill", palette.background);
      gBg.appendChild(bg);

      const mode = String(state.curveMode || DEFAULTS.curveMode);
      const scalingMode = String(state.curveScalingMode || DEFAULTS.curveScalingMode);
      const requestedOrder = getCurveOrder(mode, state);
      const sceneOrder = getEffectiveCurveOrder(mode, requestedOrder, width, height, detailStepPx);
      const unitCurve = mode === "peano" ? makePeano(sceneOrder) : makeHilbert(sceneOrder);
      let globalCurvePoints = null;

      if (scalingMode === "globalClip" && unitCurve.length > 1) {
        const globalCurveKey = `${mode}:${sceneOrder}:${width}:${height}:${detailStepPx}`;
        if (cachedGlobalCurveKey !== globalCurveKey) {
          cachedGlobalCurvePoints = resamplePolyline(
            mapCurveToRect(unitCurve, { x: 0, y: 0, w: width, h: height }),
            detailStepPx
          );
          cachedGlobalCurveKey = globalCurveKey;
        }
        globalCurvePoints = cachedGlobalCurvePoints;
      }

      rects.forEach((rect, idx) => {
        if (showRectFill) {
          gFill.appendChild(
            makeRectElement(rect, ns, palette.rectFill, "none", null, rectFillOpacity)
          );
        }

        const insetRect = {
          x: rect.x + lineInsetPx,
          y: rect.y + lineInsetPx,
          w: Math.max(0, rect.w - lineInsetPx * 2),
          h: Math.max(0, rect.h - lineInsetPx * 2),
        };
        if (insetRect.w < 1 || insetRect.h < 1) return;

        const rectOrder =
          scalingMode === "globalClip"
            ? sceneOrder
            : getEffectiveCurveOrder(
                mode,
                requestedOrder,
                insetRect.w,
                insetRect.h,
                detailStepPx
              );
        const rectCurve = rectOrder === sceneOrder ? unitCurve : mode === "peano" ? makePeano(rectOrder) : makeHilbert(rectOrder);
        const curvePath =
          scalingMode === "globalClip"
            ? segmentsToPath(clipPolylineToRect(globalCurvePoints || [], insetRect))
            : curvePathToRect(rectCurve, insetRect, detailStepPx);
        if (!curvePath) return;

        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", curvePath);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", palette.line[idx % palette.line.length]);
        path.setAttribute("stroke-width", lineWidth.toFixed(2));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-opacity", lineOpacity.toFixed(3));
        gLines.appendChild(path);

        if (showOutlines && outlineWidth > 0) {
          gOutlines.appendChild(
            makeRectElement(rect, ns, "none", palette.outline, outlineWidth.toFixed(2), 1)
          );
        }
      });

      svg.appendChild(gBg);
      svg.appendChild(gFill);
      svg.appendChild(gLines);
      svg.appendChild(gOutlines);
    };

    let ro = null;
    let onWindowResize = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => render());
      ro.observe(mountEl);
    } else {
      onWindowResize = () => render();
      window.addEventListener("resize", onWindowResize);
    }

    render();
    return {
      render,
      destroy() {
        if (ro) ro.disconnect();
        if (onWindowResize) window.removeEventListener("resize", onWindowResize);
      },
    };
  },
});
