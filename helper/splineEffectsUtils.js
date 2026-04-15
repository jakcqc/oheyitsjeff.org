const SHAPE_TAGS = ["path", "circle", "rect", "line", "polygon"];
const SHAPE_QUERY = SHAPE_TAGS.join(",");

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function normalizeVector(x, y, fallbackX = 1, fallbackY = 0) {
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len < 1e-6) return { x: fallbackX, y: fallbackY };
  return { x: x / len, y: y / len };
}

function catmullRomPoint(p0, p1, p2, p3, t, tension) {
  const s = (1 - clamp(tension, 0, 1)) * 0.5;
  const t2 = t * t;
  const t3 = t2 * t;
  const m1x = (p2.x - p0.x) * s;
  const m1y = (p2.y - p0.y) * s;
  const m2x = (p3.x - p1.x) * s;
  const m2y = (p3.y - p1.y) * s;

  return {
    x:
      (2 * t3 - 3 * t2 + 1) * p1.x +
      (t3 - 2 * t2 + t) * m1x +
      (-2 * t3 + 3 * t2) * p2.x +
      (t3 - t2) * m2x,
    y:
      (2 * t3 - 3 * t2 + 1) * p1.y +
      (t3 - 2 * t2 + t) * m1y +
      (-2 * t3 + 3 * t2) * p2.y +
      (t3 - t2) * m2y,
  };
}

function getWrapped(points, index, closed) {
  const count = points.length;
  if (closed) {
    const wrapped = ((index % count) + count) % count;
    return points[wrapped];
  }
  return points[clamp(index, 0, count - 1)];
}

export function sampleSpline(points, stepsPerSegment, tension, closed) {
  if (points.length < 2) return [];
  const segmentCount = closed ? points.length : points.length - 1;
  const safeSteps = Math.max(2, Math.floor(stepsPerSegment));
  const samples = [];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const p0 = getWrapped(points, segmentIndex - 1, closed);
    const p1 = getWrapped(points, segmentIndex, closed);
    const p2 = getWrapped(points, segmentIndex + 1, closed);
    const p3 = getWrapped(points, segmentIndex + 2, closed);

    for (let stepIndex = 0; stepIndex <= safeSteps; stepIndex += 1) {
      if (segmentIndex > 0 && stepIndex === 0) continue;
      const u = stepIndex / safeSteps;
      const point = catmullRomPoint(p0, p1, p2, p3, u, tension);
      samples.push({ x: point.x, y: point.y, segmentIndex, stepIndex, u });
    }
  }

  let totalLength = 0;
  for (let i = 1; i < samples.length; i += 1) totalLength += distance(samples[i], samples[i - 1]);

  let walked = 0;
  for (let i = 0; i < samples.length; i += 1) {
    let prev = samples[Math.max(0, i - 1)];
    let next = samples[Math.min(samples.length - 1, i + 1)];
    if (closed && samples.length > 2) {
      const lastUniqueIndex = samples.length - 2;
      prev = samples[i === 0 || i === samples.length - 1 ? lastUniqueIndex : i - 1];
      next = samples[i === samples.length - 1 ? 1 : (i + 1) % Math.max(1, samples.length - 1)];
    }
    if (i > 0) walked += distance(samples[i], samples[i - 1]);
    const tangent = normalizeVector(next.x - prev.x, next.y - prev.y, 1, 0);
    samples[i].tx = tangent.x;
    samples[i].ty = tangent.y;
    samples[i].nx = -tangent.y;
    samples[i].ny = tangent.x;
    samples[i].distance = walked;
    samples[i].curveLength = totalLength;
    samples[i].t = totalLength > 1e-6 ? walked / totalLength : 0;
  }

  return samples;
}

function parseNumberLike(v, fallback = 0) {
  const s = String(v ?? "").trim();
  const m = s.match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parsePoints(pointsStr) {
  const s = String(pointsStr || "").trim();
  if (!s) return [];
  const nums = s
    .replace(/,/g, " ")
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

function copyAttributes(fromEl, toEl, { skip = [] } = {}) {
  const skipSet = new Set(["id", ...skip]);
  for (const { name, value } of Array.from(fromEl.attributes)) {
    if (skipSet.has(name)) continue;
    if (name.startsWith("data-spline-lines-")) continue;
    toEl.setAttribute(name, value);
  }
}

function equalPoints(a, b, eps = 1e-6) {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

function normalizeSourcePoints(points, closed) {
  if (!closed || points.length < 2) return points.slice();
  const out = points.slice();
  if (equalPoints(out[0], out[out.length - 1])) out.pop();
  return out;
}

function resamplePolyline(points, count, closed) {
  const safeClosed = !!closed;
  const safeCount = Math.max(safeClosed ? 3 : 2, Math.floor(count));
  const basePoints = normalizeSourcePoints(points, safeClosed);
  if (basePoints.length < 2) return [];

  const segments = [];
  let total = 0;
  const limit = safeClosed ? basePoints.length : basePoints.length - 1;
  for (let i = 0; i < limit; i += 1) {
    const a = basePoints[i];
    const b = basePoints[(i + 1) % basePoints.length];
    const len = distance(a, b);
    if (len <= 1e-6) continue;
    segments.push({ a, b, len, start: total });
    total += len;
  }
  if (total <= 1e-6 || !segments.length) return [];

  const out = [];
  const denom = safeClosed ? safeCount : Math.max(1, safeCount - 1);
  for (let i = 0; i < safeCount; i += 1) {
    const t = safeClosed ? i / denom : (safeCount <= 1 ? 0 : i / denom);
    const target = total * t;
    let segment = segments[segments.length - 1];
    for (const candidate of segments) {
      if (target <= candidate.start + candidate.len || candidate === segments[segments.length - 1]) {
        segment = candidate;
        break;
      }
    }
    const localT = clamp((target - segment.start) / segment.len, 0, 1);
    out.push({
      x: lerp(segment.a.x, segment.b.x, localT),
      y: lerp(segment.a.y, segment.b.y, localT),
    });
  }
  return out;
}

function getTagName(el) {
  return String(el?.tagName || "").toLowerCase();
}

function isClosedPathElement(pathEl) {
  const d = String(pathEl?.getAttribute?.("d") || "");
  if (/[zZ]/.test(d)) return true;

  const fill = String(pathEl?.getAttribute?.("fill") || pathEl?.style?.fill || "").trim().toLowerCase();
  if (fill && fill !== "none") return true;

  try {
    const total = pathEl.getTotalLength();
    if (!Number.isFinite(total) || total <= 0) return false;
    const start = pathEl.getPointAtLength(0);
    const end = pathEl.getPointAtLength(total);
    return Math.hypot(end.x - start.x, end.y - start.y) <= 1.5;
  } catch {
    return false;
  }
}

function samplePathPoints(pathEl, count, closed) {
  const safeClosed = !!closed;
  const safeCount = Math.max(safeClosed ? 3 : 2, Math.floor(count));
  if (typeof pathEl?.getTotalLength !== "function" || typeof pathEl?.getPointAtLength !== "function") return [];
  const total = pathEl.getTotalLength();
  if (!Number.isFinite(total) || total <= 0) return [];

  const out = [];
  const denom = safeClosed ? safeCount : Math.max(1, safeCount - 1);
  for (let i = 0; i < safeCount; i += 1) {
    const t = safeClosed ? i / denom : (safeCount <= 1 ? 0 : i / denom);
    const point = pathEl.getPointAtLength(total * t);
    out.push({ x: point.x, y: point.y });
  }
  return out;
}

function sampleCirclePoints(circleEl, count) {
  const cx = parseNumberLike(circleEl.getAttribute("cx"), 0);
  const cy = parseNumberLike(circleEl.getAttribute("cy"), 0);
  const r = parseNumberLike(circleEl.getAttribute("r"), 0);
  const safeCount = Math.max(3, Math.floor(count));
  if (!(r > 0)) return [];
  const out = [];
  for (let i = 0; i < safeCount; i += 1) {
    const angle = (i / safeCount) * Math.PI * 2;
    out.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }
  return out;
}

function sampleRectPoints(rectEl, count) {
  const x = parseNumberLike(rectEl.getAttribute("x"), 0);
  const y = parseNumberLike(rectEl.getAttribute("y"), 0);
  const width = parseNumberLike(rectEl.getAttribute("width"), 0);
  const height = parseNumberLike(rectEl.getAttribute("height"), 0);
  if (!(width > 0 && height > 0)) return [];
  return resamplePolyline([
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ], count, true);
}

function sampleLinePoints(lineEl, count) {
  const x1 = parseNumberLike(lineEl.getAttribute("x1"), 0);
  const y1 = parseNumberLike(lineEl.getAttribute("y1"), 0);
  const x2 = parseNumberLike(lineEl.getAttribute("x2"), 0);
  const y2 = parseNumberLike(lineEl.getAttribute("y2"), 0);
  if (Math.hypot(x2 - x1, y2 - y1) <= 1e-6) return [];
  return resamplePolyline([{ x: x1, y: y1 }, { x: x2, y: y2 }], count, false);
}

function samplePolygonPoints(polygonEl, count) {
  const points = parsePoints(polygonEl.getAttribute("points"));
  if (points.length < 3) return [];
  return resamplePolyline(points, count, true);
}

function sampleShapeControlPoints(el, count) {
  const tag = getTagName(el);
  if (tag === "circle") return { points: sampleCirclePoints(el, count), closed: true };
  if (tag === "rect") return { points: sampleRectPoints(el, count), closed: true };
  if (tag === "line") return { points: sampleLinePoints(el, count), closed: false };
  if (tag === "polygon") return { points: samplePolygonPoints(el, count), closed: true };
  if (tag === "path") {
    const closed = isClosedPathElement(el);
    return { points: samplePathPoints(el, count, closed), closed };
  }
  return { points: [], closed: false };
}

function pickStrokeColor(el) {
  const values = [
    el.getAttribute("stroke"),
    el.style?.stroke,
    el.getAttribute("fill"),
    el.style?.fill,
  ];
  for (const raw of values) {
    const value = String(raw || "").trim();
    if (value && value.toLowerCase() !== "none") return value;
  }
  return "#000000";
}

function getSourceQuery(sourceTag, selector) {
  const explicitSelector = String(selector || "").trim();
  if (explicitSelector) return explicitSelector;
  return sourceTag === "all" ? SHAPE_QUERY : sourceTag;
}

function matchesSourceTag(el, sourceTag) {
  const tag = getTagName(el);
  return sourceTag === "all" ? SHAPE_TAGS.includes(tag) : tag === sourceTag;
}

function getLineDirection(sample, orientation) {
  if (orientation === "normal") return { x: sample.nx, y: sample.ny };
  if (orientation === "tangent") return { x: sample.tx, y: sample.ty };
  return { x: 0, y: 1 };
}

export function applySplineLinesInSubtree(ctx, opts = {}) {
  const {
    root = ctx?.root,
    create = ctx?.create,
    sourceTag = "all",
    selector = null,
    pointCount = 16,
    stepsPerSegment = 18,
    tension = 0.12,
    lineOrientation = "vertical",
    lineHeight = 18,
    lineScale = 1,
    strokeWidth = 2,
    debug = false,
    runId = null,
  } = opts;

  if (!root || root.nodeType !== 1) throw new Error("applySplineLinesInSubtree: missing ctx.root/root");
  if (typeof create !== "function") throw new Error("applySplineLinesInSubtree: missing ctx.create/create(tag)");

  const safeSourceTag = String(sourceTag || "all").toLowerCase();
  const query = getSourceQuery(safeSourceTag, selector);
  const safePointCount = Math.max(2, Math.trunc(Number(pointCount) || 0));
  const safeStepsPerSegment = Math.max(2, Math.trunc(Number(stepsPerSegment) || 0));
  const safeStrokeWidth = Math.max(0.1, Number(strokeWidth) || 0.1);
  const heightValue = Number(lineHeight);
  const scaleValue = Number(lineScale);
  const safeLineLength = Math.max(
    0,
    (Number.isFinite(heightValue) ? heightValue : 0) * (Number.isFinite(scaleValue) ? scaleValue : 1)
  );

  const elements = Array.from(root.querySelectorAll(query))
    .filter((el) => el instanceof Element)
    .filter((el) => matchesSourceTag(el, safeSourceTag))
    .filter((el) => !el.closest('g[data-spline-lines-group="1"]'))
    .filter((el) => !el.hasAttribute("data-spline-lines-clone"));

  const stats = {
    selector: query,
    sourceTag: safeSourceTag,
    matched: elements.length,
    converted: 0,
    skipped: 0,
    linesCreated: 0,
  };

  for (const el of elements) {
    const { points, closed } = sampleShapeControlPoints(el, safePointCount);
    if (points.length < 2) {
      stats.skipped += 1;
      continue;
    }

    const samples = sampleSpline(points, safeStepsPerSegment, Number(tension) || 0, closed);
    if (!samples.length || safeLineLength <= 0) {
      stats.skipped += 1;
      continue;
    }

    const group = create("g");
    group.setAttribute("data-spline-lines-group", "1");
    group.setAttribute("data-spline-lines-clone", "1");
    if (runId) group.setAttribute("data-spline-lines-run", String(runId));
    const strokeColor = pickStrokeColor(el);
    copyAttributes(el, group, {
      skip: ["d", "points", "cx", "cy", "r", "x", "y", "width", "height", "rx", "ry", "x1", "y1", "x2", "y2"],
    });
    group.setAttribute("fill", "none");
    group.setAttribute("stroke", strokeColor);
    group.style.fill = "none";
    group.style.stroke = strokeColor;

    let madeLines = 0;
    for (const sample of samples) {
      const direction = getLineDirection(sample, lineOrientation);
      const half = safeLineLength * 0.5;
      const line = create("line");
      line.setAttribute("x1", String(sample.x - direction.x * half));
      line.setAttribute("y1", String(sample.y - direction.y * half));
      line.setAttribute("x2", String(sample.x + direction.x * half));
      line.setAttribute("y2", String(sample.y + direction.y * half));
      line.setAttribute("stroke-width", String(safeStrokeWidth));
      line.setAttribute("stroke-linecap", "round");
      if (runId) line.setAttribute("data-spline-lines-run", String(runId));
      group.appendChild(line);
      madeLines += 1;
    }

    if (!madeLines) {
      stats.skipped += 1;
      continue;
    }

    el.replaceWith(group);
    stats.converted += 1;
    stats.linesCreated += madeLines;
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[splineEffects] applied:", stats);
  }

  return stats;
}
