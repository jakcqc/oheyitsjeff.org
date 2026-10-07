/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
import { createMathMapper } from "./mathTransformMath.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const IDENTITY = [1, 0, 0, 1, 0, 0];
const GEOMETRY = new Set(["path", "circle", "ellipse", "rect", "line", "polygon", "polyline"]);
const DEFINITIONS = new Set(["defs", "clipPath", "mask", "marker", "pattern", "symbol", "linearGradient", "radialGradient"]);
const COORDINATE_LIMIT = 1e12;
const MAX_OUTPUT_NODES = 200000;
const point = (x, y) => [x, y];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const finitePoint = p => p && p.every(v => Number.isFinite(v) && Math.abs(v) <= COORDINATE_LIMIT);
const format = value => String(Math.round(value * 1e5) / 1e5);
const pair = p => `${format(p[0])} ${format(p[1])}`;

export function multiplySvgMatrices(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

export function applySvgMatrix(matrix, p) {
  return [matrix[0] * p[0] + matrix[2] * p[1] + matrix[4], matrix[1] * p[0] + matrix[3] * p[1] + matrix[5]];
}

function inverse(matrix) {
  const [a, b, c, d, e, f] = matrix, determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-15) return null;
  return [d / determinant, -b / determinant, -c / determinant, a / determinant,
    (c * f - d * e) / determinant, (b * e - a * f) / determinant];
}

/** SVG transform-list order, independent of a mounted DOM or screen CTM. */
export function parseSvgTransform(value = "") {
  let matrix = IDENTITY;
  const regex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match, end = 0;
  while ((match = regex.exec(value))) {
    if (value.slice(end, match.index).trim().replace(/,/g, "")) throw new Error("Unsupported SVG transform");
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (!args.every(Number.isFinite)) throw new Error("Non-finite SVG transform");
    const [a, b, c] = args;
    let next;
    switch (match[1]) {
      case "matrix": if (args.length === 6) next = args; break;
      case "translate": if (args.length >= 1 && args.length <= 2) next = [1, 0, 0, 1, a, b ?? 0]; break;
      case "scale": if (args.length >= 1 && args.length <= 2) next = [a, 0, 0, b ?? a, 0, 0]; break;
      case "rotate": {
        if (args.length !== 1 && args.length !== 3) break;
        const angle = a * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
        next = [cos, sin, -sin, cos, 0, 0];
        if (args.length === 3) next = multiplySvgMatrices(multiplySvgMatrices([1, 0, 0, 1, b, c], next), [1, 0, 0, 1, -b, -c]);
        break;
      }
      case "skewX": if (args.length === 1) next = [1, 0, Math.tan(a * Math.PI / 180), 1, 0, 0]; break;
      case "skewY": if (args.length === 1) next = [1, Math.tan(a * Math.PI / 180), 0, 1, 0, 0]; break;
    }
    if (!next || !next.every(Number.isFinite)) throw new Error("Unsupported SVG transform");
    matrix = multiplySvgMatrices(matrix, next);
    end = regex.lastIndex;
  }
  if (value.slice(end).trim()) throw new Error("Unsupported SVG transform");
  return matrix;
}

function arcSegment(start, values, end) {
  let [rx, ry, angle, largeArc, sweep] = values;
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry || same(start, end)) return { kind: "L", start, end };
  const phi = (angle % 360) * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (start[0] - end[0]) / 2, dy = (start[1] - end[1]) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const ratio = (xp / rx) ** 2 + (yp / ry) ** 2;
  if (ratio > 1) { const scale = Math.sqrt(ratio); rx *= scale; ry *= scale; }
  const numerator = rx ** 2 * ry ** 2 - rx ** 2 * yp ** 2 - ry ** 2 * xp ** 2;
  const denominator = rx ** 2 * yp ** 2 + ry ** 2 * xp ** 2;
  const k = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = k * rx * yp / ry, cyp = -k * ry * xp / rx;
  const center = [cos * cxp - sin * cyp + (start[0] + end[0]) / 2,
    sin * cxp + cos * cyp + (start[1] + end[1]) / 2];
  const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry;
  const vx = (-xp - cxp) / rx, vy = (-yp - cyp) / ry;
  const theta = Math.atan2(uy, ux);
  let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  return { kind: "A", start, end, rx, ry, cos, sin, center, theta, delta };
}

export function pointOnSvgSegment(segment, t) {
  if (t === 0) return segment.start;
  if (t === 1) return segment.end;
  const a = segment.start, b = segment.end, u = 1 - t;
  if (segment.kind === "C") {
    const c = segment.c1, d = segment.c2;
    return [u ** 3 * a[0] + 3 * u * u * t * c[0] + 3 * u * t * t * d[0] + t ** 3 * b[0],
      u ** 3 * a[1] + 3 * u * u * t * c[1] + 3 * u * t * t * d[1] + t ** 3 * b[1]];
  }
  if (segment.kind === "Q") {
    const c = segment.c1;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  }
  if (segment.kind === "A") {
    const angle = segment.theta + segment.delta * t;
    const x = segment.rx * Math.cos(angle), y = segment.ry * Math.sin(angle);
    return [segment.center[0] + segment.cos * x - segment.sin * y, segment.center[1] + segment.sin * x + segment.cos * y];
  }
  return lerp(a, b, t);
}

class SamplingLimit extends Error {}
class OutputLimit extends SamplingLimit {}

/**
 * Preserve moveto and closepath boundaries (including compound D3 dot paths).
 * A scanner instead of token splitting also accepts adjacent SVG arc flags.
 */
export function parseSvgPath(data, maxSegments = 1000000) {
  const text = String(data ?? ""), paths = [];
  const numberPattern = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y;
  let pos = 0, current = [0, 0], path = null, command = null, previous = null, cubic = null, quadratic = null, count = 0;
  const skip = () => { while (pos < text.length && /[\s,]/.test(text[pos])) pos++; };
  const number = flag => {
    skip();
    if (flag) { const ch = text[pos++]; if (ch !== "0" && ch !== "1") throw new Error("Invalid SVG arc flag"); return Number(ch); }
    numberPattern.lastIndex = pos;
    const match = numberPattern.exec(text);
    if (!match) throw new Error("Incomplete SVG path");
    pos = numberPattern.lastIndex;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new Error("Non-finite SVG path");
    return value;
  };
  const append = segment => {
    if (++count > maxSegments) throw new SamplingLimit("Geometry is larger than the sample budget");
    if (!path) { path = { start: current, segments: [], closed: false }; paths.push(path); }
    path.segments.push(segment); current = segment.end;
  };
  while (true) {
    skip(); if (pos >= text.length) break;
    if (/[a-zA-Z]/.test(text[pos])) command = text[pos++];
    else if (!command) throw new Error("SVG path needs a command");
    const kind = command.toUpperCase(), relative = kind !== command;
    const base = current;
    const readPoint = () => { const x = number(), y = number(); return relative ? [base[0] + x, base[1] + y] : [x, y]; };
    if (kind === "Z") {
      if (path) { if (!same(current, path.start)) append({ kind: "L", start: current, end: path.start }); path.closed = true; current = path.start; path = null; }
      command = null; previous = "Z"; cubic = quadratic = null; continue;
    }
    if (kind === "M") {
      current = readPoint(); path = { start: current, segments: [], closed: false }; paths.push(path);
      if (++count > maxSegments) throw new SamplingLimit("Geometry is larger than the sample budget");
      command = relative ? "l" : "L";
    } else if (kind === "L") append({ kind: "L", start: current, end: readPoint() });
    else if (kind === "H") { const x = number(); append({ kind: "L", start: current, end: [relative ? current[0] + x : x, current[1]] }); }
    else if (kind === "V") { const y = number(); append({ kind: "L", start: current, end: [current[0], relative ? current[1] + y : y] }); }
    else if (kind === "C" || kind === "S") {
      const c1 = kind === "C" ? readPoint() : previous === "C" || previous === "S" ? [2 * current[0] - cubic[0], 2 * current[1] - cubic[1]] : current;
      const c2 = readPoint(), end = readPoint();
      append({ kind: "C", start: current, c1, c2, end }); cubic = c2;
    } else if (kind === "Q" || kind === "T") {
      const c1 = kind === "Q" ? readPoint() : previous === "Q" || previous === "T" ? [2 * current[0] - quadratic[0], 2 * current[1] - quadratic[1]] : current;
      const end = readPoint(); append({ kind: "Q", start: current, c1, end }); quadratic = c1;
    } else if (kind === "A") {
      const values = [number(), number(), number(), number(true), number(true)];
      append(arcSegment(current, values, readPoint()));
    } else throw new Error("Unsupported SVG path command");
    if (kind !== "C" && kind !== "S") cubic = null;
    if (kind !== "Q" && kind !== "T") quadratic = null;
    previous = kind;
  }
  return paths;
}

function distanceToChord(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], denominator = dx * dx + dy * dy;
  if (!denominator) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Approximate a path in root user coordinates, then return to its local space.
 * Broken fills are separate from intact compound subpaths, avoiding wrap chords
 * without disabling the fill of every other dot in a large attractor path.
 */
export function mapSvgPath(paths, mapper, options = {}) {
  const matrix = options.matrix || IDENTITY, undo = inverse(matrix);
  if (!undo) throw new Error("Singular SVG transform");
  const budget = options.budget || { used: 0, max: 800000 };
  const tolerance = Math.max(1e-5, options.tolerance ?? 0.45);
  const maxStep = Math.max(tolerance, options.maxStep ?? 20);
  const maxDepth = options.maxDepth ?? 9;
  const intact = [], broken = [];
  let seamCount = 0;
  const evaluate = (segment, t) => {
    if (++budget.used > budget.max) throw new SamplingLimit("SVG sample limit reached");
    const source = applySvgMatrix(matrix, pointOnSvgSegment(segment, t));
    if (!finitePoint(source)) return { source, point: null, local: null, region: "" };
    const sampled = mapper.sample(source[0], source[1]);
    const mapped = finitePoint(sampled?.point) ? sampled.point : null;
    const local = mapped ? applySvgMatrix(undo, mapped) : null;
    return { source, point: mapped, local: finitePoint(local) ? local : null, region: sampled?.region ?? "" };
  };
  const crosses = (a, b) => !a.local || !b.local || a.region !== b.region || !!mapper.crossesSeam?.(a.source, b.source);
  for (const path of paths) {
    const first = evaluate({ kind: "L", start: path.start, end: path.start }, 0);
    let previous = first, fragments = [], run = [], didBreak = !first.local;
    const push = (sample, disconnected = false) => {
      if (disconnected || !sample.local) {
        if (run.length) fragments.push(run); run = [];
        didBreak = true;
      }
      if (sample.local && (!run.length || !same(run.at(-1), sample.local))) run.push(sample.local);
    };
    push(first);
    const subdivide = (segment, t0, a, t1, b, depth) => {
      const midT = (t0 + t1) / 2, middle = evaluate(segment, midT);
      const seam = crosses(a, middle) || crosses(middle, b);
      // Cubic inflections can put the midpoint on the chord. The source control
      // polygon bounds prevent silently flattening a full S curve at depth zero.
      let controlError = 0;
      if (depth === 0 && (segment.kind === "C" || segment.kind === "Q")) {
        controlError = distanceToChord(applySvgMatrix(matrix, segment.c1), a.source, b.source);
        if (segment.c2) controlError = Math.max(controlError, distanceToChord(applySvgMatrix(matrix, segment.c2), a.source, b.source));
      }
      const chordLength = Math.hypot(b.source[0] - a.source[0], b.source[1] - a.source[1]);
      const sourceError = distanceToChord(middle.source, a.source, b.source);
      const mappedError = a.point && middle.point && b.point ? distanceToChord(middle.point, a.point, b.point) : 0;
      // Regions that are entirely outside an annulus/pole domain need no deep
      // recursion unless their source segment is long enough to cross back in.
      const allOutside = !a.local && !middle.local && !b.local;
      const needsMore = chordLength > maxStep || sourceError > tolerance || controlError > tolerance || mappedError > tolerance || (seam && !allOutside);
      if (depth < maxDepth && needsMore) {
        subdivide(segment, t0, a, midT, middle, depth + 1);
        subdivide(segment, midT, middle, t1, b, depth + 1);
      } else if (seam) {
        if (crosses(a, middle)) push(middle, true); else push(middle);
        if (crosses(middle, b)) push(b, true); else push(b);
      } else push(b);
    };
    for (const segment of path.segments) {
      const end = evaluate(segment, 1);
      subdivide(segment, 0, previous, 1, end, 0); previous = end;
    }
    if (run.length) fragments.push(run);
    if (!didBreak && path.closed && first.local && previous.local && crosses(previous, first)) didBreak = true;
    const build = fragment => `M ${pair(fragment[0])}${fragment.slice(1).map(p => ` L ${pair(p)}`).join("")}`;
    if (didBreak) {
      seamCount++;
      for (const fragment of fragments) if (fragment.length > 1) broken.push(build(fragment));
    } else if (fragments.length) intact.push(build(fragments[0]) + (path.closed ? " Z" : ""));
  }
  return { intact: intact.join(" "), broken: broken.join(" "), seamCount, samples: budget.used };
}

function svgLength(node, name, fallback, axis, bounds) {
  const raw = node.getAttribute(name);
  if (raw == null || raw.trim() === "") return fallback;
  if (raw.trim().endsWith("%")) {
    const size = axis === "x" ? bounds.w : axis === "y" ? bounds.h : Math.hypot(bounds.w, bounds.h) / Math.SQRT2;
    return Number.parseFloat(raw) * size / 100;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error("Unsupported SVG geometry units");
  return value;
}

function shapePath(node, bounds) {
  const type = node.localName;
  const n = (name, fallback = 0, axis = "x") => svgLength(node, name, fallback, axis, bounds);
  if (type === "path") return node.getAttribute("d") || "";
  if (type === "line") return `M ${n("x1")} ${n("y1", 0, "y")} L ${n("x2")} ${n("y2", 0, "y")}`;
  if (type === "polyline" || type === "polygon") {
    const points = node.getAttribute("points")?.trim() || "";
    return points ? `M ${points}${type === "polygon" ? " Z" : ""}` : "";
  }
  if (type === "circle" || type === "ellipse") {
    const cx = n("cx"), cy = n("cy", 0, "y"), rx = type === "circle" ? n("r", 0, "radius") : n("rx"), ry = type === "circle" ? rx : n("ry", 0, "y");
    if (rx <= 0 || ry <= 0) return "";
    return `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} Z`;
  }
  const x = n("x"), y = n("y", 0, "y"), w = n("width"), h = n("height", 0, "y");
  if (w <= 0 || h <= 0) return "";
  let rx = node.hasAttribute("rx") ? n("rx") : n("ry", 0, "y"), ry = node.hasAttribute("ry") ? n("ry", 0, "y") : n("rx");
  rx = Math.min(w / 2, Math.max(0, rx)); ry = Math.min(h / 2, Math.max(0, ry));
  if (!rx || !ry) return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  return `M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
}

const GEOMETRY_ATTRIBUTES = new Set(["d", "points", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "x1", "y1", "x2", "y2"]);
function pathLike(node, data, keepId) {
  const path = node.ownerDocument.createElementNS(SVG_NS, "path");
  for (const attr of node.attributes) {
    if (GEOMETRY_ATTRIBUTES.has(attr.name) || (!keepId && attr.name === "id")) continue;
    if (attr.namespaceURI) path.setAttributeNS(attr.namespaceURI, attr.name, attr.value); else path.setAttribute(attr.name, attr.value);
  }
  // Retain explicit geometry styling but do not let CSS d/shape declarations
  // silently override the generated path data.
  for (const property of GEOMETRY_ATTRIBUTES) path.style.removeProperty(property);
  path.setAttribute("d", data);
  path.setAttribute("data-xf-math", "1");
  return path;
}

function subtreeNodes(root) { return [root, ...root.querySelectorAll("*")]; }

function remapCloneIds(clone, suffix) {
  const map = new Map();
  for (const node of subtreeNodes(clone)) if (node.id) { const id = node.id + suffix; map.set(node.id, id); node.id = id; }
  for (const node of subtreeNodes(clone)) for (const attr of [...node.attributes]) {
    let value = attr.value.replace(/url\(\s*(["']?)#([^\s)'";]+)\1\s*\)/g, (match, quote, id) => map.has(id) ? `url(#${map.get(id)})` : match);
    if ((attr.localName === "href") && value.startsWith("#") && map.has(value.slice(1))) value = `#${map.get(value.slice(1))}`;
    if (value !== attr.value) node.setAttributeNS(attr.namespaceURI, attr.name, value);
  }
}

/**
 * Mutates only the caller's detached display clone. Source D3 bindings, paths,
 * orbit coordinates and definitions are untouched. Operations compose in order.
 */
export function applyMathTransforms(root, { operations = [], viewBox = {}, svg = null, maxPoints = 800000 } = {}) {
  const stats = { transformed: 0, skipped: 0, limited: false, sampled: 0, warnings: [] };
  const warnings = new Set(), warn = text => warnings.add(text);
  if (!root || !operations.length) return stats;
  const bounds = { x: Number(viewBox.x) || 0, y: Number(viewBox.y) || 0,
    w: Math.max(1e-6, Number(viewBox.w ?? viewBox.width) || 800), h: Math.max(1e-6, Number(viewBox.h ?? viewBox.height) || 800) };
  const size = Math.max(bounds.w, bounds.h);
  const budget = { used: 0, max: Math.max(100, Math.min(2000000, Number(maxPoints) || 800000)) };
  let limitWarning = "The geometry sample limit was reached; this and later math operations were not applied.";
  let expansion = 0;
  const definitionAncestor = node => {
    for (let parent = node; parent && parent !== root.parentNode; parent = parent.parentNode) if (DEFINITIONS.has(parent.localName)) return true;
    return false;
  };
  const localDefinitions = new Map(subtreeNodes(root).filter(node => node.id).map(node => [node.id, node]));
  const resolve = id => localDefinitions.get(id) || (svg && [...svg.querySelectorAll("[id]")].find(node => node.id === id));
  // Expand SVG-native local use instances. Their x/y translation precedes the
  // referenced element's transform and inherits the use element's paint styles.
  const expandUses = (scope, depth = 0, active = new Set()) => {
    for (const node of [...scope.querySelectorAll("use")]) {
      if (definitionAncestor(node)) continue;
      const href = node.getAttribute("href") || node.getAttributeNS(XLINK_NS, "href") || "";
      const ref = href.startsWith("#") ? resolve(href.slice(1)) : null;
      if (!ref || active.has(ref) || depth > 8 || ++expansion > 10000 || ref.localName === "symbol" || ref.localName === "svg") {
        stats.skipped++; warn("Some SVG use instances could not be expanded and remain unchanged."); continue;
      }
      try {
        const group = node.ownerDocument.createElementNS(SVG_NS, "g");
        for (const attr of node.attributes) if (!["href", "xlink:href", "x", "y", "width", "height"].includes(attr.name)) group.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
        const x = svgLength(node, "x", 0, "x", bounds), y = svgLength(node, "y", 0, "y", bounds);
        group.setAttribute("transform", `${node.getAttribute("transform") || ""} translate(${x} ${y})`.trim());
        const clone = ref.cloneNode(true); remapCloneIds(clone, `__warp_use_${expansion}`);
        group.appendChild(clone); node.replaceWith(group);
        const next = new Set(active); next.add(ref); expandUses(group, depth + 1, next);
      } catch { stats.skipped++; warn("Some SVG use instances could not be expanded and remain unchanged."); }
    }
  };
  expandUses(root);
  if (root.querySelector("clipPath, mask, marker, pattern") || subtreeNodes(root).some(node => ["clip-path", "mask", "filter", "marker-start", "marker-mid", "marker-end"].some(attr => node.hasAttribute(attr) || node.style?.getPropertyValue(attr)))) {
    warn("Clips, masks, markers and paint effects retain their original SVG geometry.");
  }
  const matrixCache = new Map();
  const matrixFor = node => {
    if (matrixCache.has(node)) return matrixCache.get(node);
    const parent = node.parentNode;
    const base = node === root || !parent || parent.nodeType !== 1 ? IDENTITY : matrixFor(parent);
    if (node.style?.transform && node.style.transform !== "none") throw new Error("CSS transforms are not SVG attribute transforms");
    let own = parseSvgTransform(node.getAttribute("transform") || "");
    if (node !== root && node.localName === "svg") throw new Error("Nested SVG viewport");
    const matrix = multiplySvgMatrices(base, own); matrixCache.set(node, matrix); return matrix;
  };
  for (const operation of operations) {
    if (operation?.kind && operation.kind !== "warp") continue;
    const mapper = createMathMapper(operation, bounds);
    const branches = mapper.branches?.length ? mapper.branches : [0];
    // Every root sheet is an exact rotation of the first. Sampling just once
    // makes all N branches practical for compound paths with thousands of dots.
    const firstMapper = createMathMapper(operation, bounds, branches[0]);
    const nodes = subtreeNodes(root).filter(node => !definitionAncestor(node));
    const pending = [];
    const previousWarnings = new Set(warnings), previousSkipped = stats.skipped;
    const geometryCount = nodes.filter(node => GEOMETRY.has(node.localName)).length;
    if (geometryCount * branches.length > MAX_OUTPUT_NODES) {
      stats.limited = true; stats.skipped += geometryCount;
      limitWarning = "The geometry copy limit was reached; this and later math operations were not applied.";
      break;
    }
    let outputNodes = 0;
    let operationLimited = false;
    for (const node of nodes) {
      if (!GEOMETRY.has(node.localName)) {
        if (["text", "image", "foreignObject"].includes(node.localName)) {
          stats.skipped++; warn("Text, images and embedded HTML retain their original geometry.");
        }
        continue;
      }
      if (budget.used >= budget.max) { stats.limited = true; operationLimited = true; break; }
      try {
        const matrix = matrixFor(node);
        if (!inverse(matrix)) throw new Error("Singular SVG transform");
        const data = shapePath(node, bounds);
        if (!data.trim()) continue;
        const paths = parseSvgPath(data, budget.max - budget.used);
        const output = [];
        const result = mapSvgPath(paths, firstMapper, { matrix, budget, tolerance: size / 1600, maxStep: size / 40 });
        for (const branch of branches) {
          let branchTransform = null;
          if (branch !== branches[0]) {
            const angle = (branch - branches[0]) * Math.PI * 2 / mapper.config.power;
            const [cx, cy] = mapper.center, cos = Math.cos(angle), sin = Math.sin(angle);
            const rotation = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
            const localRotation = multiplySvgMatrices(multiplySvgMatrices(inverse(matrix), rotation), matrix);
            const own = parseSvgTransform(node.getAttribute("transform") || "");
            branchTransform = multiplySvgMatrices(own, localRotation);
          }
          if (result.intact) output.push({ data: result.intact, broken: false, branch, branchTransform });
          if (result.broken) output.push({ data: result.broken, broken: true, branch, branchTransform });
        }
        if (result.seamCount) warn("Fills crossing seams or poles are omitted per subpath; existing outlines are retained.");
        if (!node.parentNode) { stats.skipped++; warn("A detached shape needs a container for math transforms."); continue; }
        const fragment = node.ownerDocument.createDocumentFragment();
        // A fully excluded shape becomes an empty path so future references and
        // subsequent stack operations retain the original element identity.
        if (!output.length) output.push({ data: "", broken: false, branch: 0 });
        outputNodes += output.length;
        if (outputNodes > MAX_OUTPUT_NODES) throw new OutputLimit("SVG geometry copy limit reached");
        output.forEach((result, index) => {
          const replacement = pathLike(node, result.data, index === 0);
          replacement.setAttribute("data-xf-math-branch", String(result.branch));
          if (result.branchTransform) replacement.setAttribute("transform", `matrix(${result.branchTransform.join(" ")})`);
          if (result.broken) replacement.style.setProperty("fill", "none", "important");
          fragment.appendChild(replacement);
        });
        pending.push({ node, fragment });
      } catch (error) {
        stats.skipped++;
        if (error instanceof SamplingLimit) {
          stats.limited = true; operationLimited = true;
          if (error instanceof OutputLimit) limitWarning = "The geometry copy limit was reached; this and later math operations were not applied.";
          else budget.used = budget.max;
          break;
        }
        else warn("Some unsupported SVG geometry or transforms remain unchanged.");
      }
    }
    // An expensive operation is atomic. Mixing warped and original attractor
    // bands would give a misleading result; keep the last complete scene.
    if (operationLimited) {
      stats.skipped = previousSkipped + geometryCount;
      warnings.clear(); for (const warning of previousWarnings) warnings.add(warning);
      break;
    }
    for (const { node, fragment } of pending) { node.replaceWith(fragment); stats.transformed++; }
    matrixCache.clear();
  }
  if (stats.limited) warn(limitWarning);
  stats.sampled = Math.min(budget.used, budget.max);
  stats.warnings = [...warnings];
  return stats;
}
