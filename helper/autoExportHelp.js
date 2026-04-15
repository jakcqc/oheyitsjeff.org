import { registerTab } from "./visualHelp.js";
import { selectElementsByPropSelector } from "./svgEditor.js";

const TEMP_ID_ATTR = "data-ae-id";

const AUTO_EXPORT_PRESETS = [
  {
    id: "shape",
    label: "Shapes (exact tags)",
    rule: {
      selector: { "*": {} },
      binBy: [{ kind: "tag", label: "shape" }],
      filePrefix: "by-shape",
    },
  },
  {
    id: "shapeGroup",
    label: "Shape Families",
    rule: {
      selector: { "*": {} },
      binBy: [{ kind: "shapeGroup", label: "shapeGroup" }],
      filePrefix: "by-shape-group",
    },
  },
  {
    id: "color",
    label: "Color Clusters (+/-5)",
    rule: {
      selector: { "*": {} },
      binBy: [{ kind: "colorCluster", key: "fill", label: "fillCluster", tolerance: 5 }],
      filePrefix: "by-color",
    },
  },
  {
    id: "colorShape",
    label: "Color + Shape",
    rule: {
      selector: { "*": {} },
      binBy: [
        { kind: "tag", label: "shape" },
        { kind: "colorCluster", key: "fill", label: "fillCluster", tolerance: 5 },
      ],
      filePrefix: "by-shape-color",
    },
  },
  {
    id: "size",
    label: "Size (% bins)",
    rule: {
      selector: { "*": {} },
      binBy: [
        {
          kind: "size",
          label: "size",
          metric: "bboxArea",
          ranges: [
            { label: "xs", minPct: 0, maxPct: 20 },
            { label: "s", minPct: 20, maxPct: 40 },
            { label: "m", minPct: 40, maxPct: 60 },
            { label: "l", minPct: 60, maxPct: 80 },
            { label: "xl", minPct: 80, maxPct: 100 },
          ],
        },
      ],
      filePrefix: "by-size",
    },
  },
];

const AUTO_EXPORT_DOCS_TEXT = `Auto Export Query Rules

Paste a JSON object and click "preview bins".

Preset options include:
- Shapes (exact tags)
- Shape families (grouped tags)
- Color clusters (+/- tolerance)
- Color + shape
- Size bins using percentage ranges

Rule shape:
{
  "selector": { "*": {} },
  "binBy": [
    { "kind": "tag", "label": "shape" },
    { "kind": "colorCluster", "key": "fill", "label": "fillCluster", "tolerance": 5 },
    {
      "kind": "size",
      "metric": "bboxArea",
      "label": "size",
      "ranges": [
        { "label": "small", "minPct": 0, "maxPct": 33 },
        { "label": "medium", "minPct": 33, "maxPct": 66 },
        { "label": "large", "minPct": 66, "maxPct": 100 }
      ]
    }
  ],
  "filePrefix": "auto-export"
}

Supported binBy kinds:
- { "kind": "tag" }                             -> exact tag name
- { "kind": "shapeGroup" }                      -> grouped shape family
- { "kind": "attr", "key": "fill" }         -> raw attr/style value
- { "kind": "color", "key": "fill" }        -> explicit color ranges/steps
- { "kind": "colorCluster", ... }               -> tolerance-based color clustering
- { "kind": "size", ... }                       -> size bins (supports % ranges)

Color clustering (kind=colorCluster):
- tolerance: numeric channel tolerance (e.g. 5 means +-5 per channel for seed merging)
- key: color property (default "fill")
- maxClusters: optional cap
- Clusters are seeded from most frequent colors, averaged, then every color is assigned to nearest cluster.

Size bins (kind=size):
- metric: "bboxArea" (default), "bboxMaxDim", "bboxMinDim", "bboxPerimeter"
- ranges supports absolute values:
  { "label":"s", "min":0, "max":100 }
- ranges supports percentage values:
  { "label":"s", "minPct":0, "maxPct":25 }
- If "percent": true, plain min/max are treated as percentages.

Selector follows PropOps selector syntax from PROP_OPS_RULES.md.`;

function ensureObject(v, fallback = {}) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
}

function parseStyleAttr(styleStr) {
  const out = {};
  String(styleStr || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const i = pair.indexOf(":");
      if (i < 0) return;
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (k) out[k] = v;
    });
  return out;
}

function readProp(el, key) {
  const k = String(key || "").trim();
  if (!k) return null;
  if (k.startsWith("style.")) {
    const sk = k.slice("style.".length);
    const map = parseStyleAttr(el.getAttribute("style"));
    return map[sk] ?? null;
  }
  return el.getAttribute(k);
}

function readColorLikeProp(el, key) {
  const k = String(key || "").trim();
  if (!k) return null;
  const propName = k.startsWith("style.") ? k.slice("style.".length) : k;

  const hasUseful = (v) => {
    if (v == null) return false;
    const s = String(v).trim();
    if (!s) return false;
    if (s.toLowerCase() === "inherit") return false;
    return true;
  };

  // 1) Exact key on element (supports style.fill and fill)
  const direct = readProp(el, k);
  if (hasUseful(direct)) return direct;

  // 2) Alternate form on element (fill <-> style.fill)
  if (!k.startsWith("style.")) {
    const styleVal = readProp(el, `style.${k}`);
    if (hasUseful(styleVal)) return styleVal;
  } else {
    const attrVal = readProp(el, propName);
    if (hasUseful(attrVal)) return attrVal;
  }

  // 3) Walk ancestors for inherited/pushed style (nested groups)
  let node = el.parentElement;
  while (node) {
    const inheritedAttr = readProp(node, propName);
    if (hasUseful(inheritedAttr)) return inheritedAttr;
    const inheritedStyle = readProp(node, `style.${propName}`);
    if (hasUseful(inheritedStyle)) return inheritedStyle;
    node = node.parentElement;
  }

  // 4) Last resort: computed style (handles class/css rules + inheritance)
  try {
    const cs = typeof window !== "undefined" && window.getComputedStyle
      ? window.getComputedStyle(el)
      : null;
    const computed = cs?.getPropertyValue?.(propName);
    if (hasUseful(computed)) return computed;
  } catch {
    // noop
  }

  return direct;
}

function toFiniteNumber(v, fallback = NaN) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp255(n) {
  const x = toFiniteNumber(n, 0);
  return Math.max(0, Math.min(255, Math.round(x)));
}

function parseHexColor(input) {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return null;
  let h = s.slice(1);
  if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseRgbFunc(input) {
  if (typeof input !== "string") return null;
  const m = input.trim().match(/^rgba?\(\s*([^)]+)\s*\)$/i);
  if (!m) return null;
  const parts = m[1].split(",").map((x) => x.trim());
  if (parts.length < 3) return null;
  const r = clamp255(parts[0]);
  const g = clamp255(parts[1]);
  const b = clamp255(parts[2]);
  return [r, g, b];
}

function parseColor(input) {
  if (Array.isArray(input) && input.length >= 3) {
    return [clamp255(input[0]), clamp255(input[1]), clamp255(input[2])];
  }
  return parseRgbFunc(input) || parseHexColor(input);
}

function normalizeVec3(v) {
  if (!Array.isArray(v) || v.length < 3) return null;
  return [clamp255(v[0]), clamp255(v[1]), clamp255(v[2])];
}

function inRange3(rgb, minV, maxV) {
  return (
    rgb[0] >= minV[0] && rgb[0] <= maxV[0] &&
    rgb[1] >= minV[1] && rgb[1] <= maxV[1] &&
    rgb[2] >= minV[2] && rgb[2] <= maxV[2]
  );
}

function resolveColorBin(rgb, conf) {
  const ranges = Array.isArray(conf.ranges) ? conf.ranges : null;
  if (ranges && ranges.length) {
    for (let i = 0; i < ranges.length; i++) {
      const entry = ranges[i];
      if (Array.isArray(entry) && entry.length >= 2) {
        const minV = normalizeVec3(entry[0]);
        const maxV = normalizeVec3(entry[1]);
        if (!minV || !maxV) continue;
        if (inRange3(rgb, minV, maxV)) return `range${i}`;
        continue;
      }

      if (entry && typeof entry === "object") {
        const minV = normalizeVec3(entry.min);
        const maxV = normalizeVec3(entry.max);
        if (!minV || !maxV) continue;
        if (inRange3(rgb, minV, maxV)) {
          return String(entry.label || `range${i}`);
        }
      }
    }
    return String(conf.fallback || "other");
  }

  const stepRaw = conf.step;
  if (stepRaw != null) {
    const step = Array.isArray(stepRaw) ? stepRaw : [stepRaw, stepRaw, stepRaw];
    const sx = Math.max(1, toFiniteNumber(step[0], 1));
    const sy = Math.max(1, toFiniteNumber(step[1], 1));
    const sz = Math.max(1, toFiniteNumber(step[2], 1));
    const bx = Math.floor(rgb[0] / sx) * sx;
    const by = Math.floor(rgb[1] / sy) * sy;
    const bz = Math.floor(rgb[2] / sz) * sz;
    return `${bx}-${Math.min(255, bx + sx - 1)}_${by}-${Math.min(255, by + sy - 1)}_${bz}-${Math.min(255, bz + sz - 1)}`;
  }

  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function colorDistSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function colorWithinTolerance(a, b, tol) {
  const t = Math.max(0, toFiniteNumber(tol, 5));
  return (
    Math.abs(a[0] - b[0]) <= t &&
    Math.abs(a[1] - b[1]) <= t &&
    Math.abs(a[2] - b[2]) <= t
  );
}

function nearestCentroidIdx(rgb, centroids) {
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const d = colorDistSq(rgb, centroids[i]);
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function clusterColorsByTolerance(colors, tolerance, maxClusters = null) {
  const freq = new Map();
  for (const rgb of colors) {
    const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  const palette = Array.from(freq.entries())
    .map(([key, count]) => ({ rgb: key.split(",").map((x) => Number(x)), count }))
    .sort((a, b) => b.count - a.count);

  if (!palette.length) return { centroids: [], assignment: new Map() };

  const centroids = [];
  for (const entry of palette) {
    if (maxClusters != null && centroids.length >= maxClusters) break;
    const exists = centroids.some((c) => colorWithinTolerance(entry.rgb, c, tolerance));
    if (!exists) centroids.push([...entry.rgb]);
  }
  if (!centroids.length) centroids.push([...palette[0].rgb]);

  const rounds = 2;
  let assignment = new Map();

  for (let round = 0; round < rounds; round++) {
    assignment = new Map();
    for (const entry of palette) {
      const idx = nearestCentroidIdx(entry.rgb, centroids);
      assignment.set(entry.rgb.join(","), idx);
    }

    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, w: 0 }));
    for (const entry of palette) {
      const idx = assignment.get(entry.rgb.join(",")) || 0;
      const s = sums[idx];
      s.r += entry.rgb[0] * entry.count;
      s.g += entry.rgb[1] * entry.count;
      s.b += entry.rgb[2] * entry.count;
      s.w += entry.count;
    }

    for (let i = 0; i < centroids.length; i++) {
      const s = sums[i];
      if (!s.w) continue;
      centroids[i] = [Math.round(s.r / s.w), Math.round(s.g / s.w), Math.round(s.b / s.w)];
    }
  }

  return { centroids, assignment };
}

function shapeGroupForTag(tag) {
  const t = String(tag || "").toLowerCase();
  if (["rect", "line", "polyline"].includes(t)) return "linear";
  if (["polygon"].includes(t)) return "polygon";
  if (["circle", "ellipse"].includes(t)) return "round";
  if (["path"].includes(t)) return "path";
  if (["text", "tspan", "textpath"].includes(t)) return "text";
  if (["image", "foreignobject"].includes(t)) return "embedded";
  if (["g", "use", "symbol"].includes(t)) return "group";
  return t || "other";
}

function getBBoxSafe(el) {
  try {
    const b = el.getBBox?.();
    if (!b) return null;
    if (![b.width, b.height, b.x, b.y].every((x) => Number.isFinite(x))) return null;
    return b;
  } catch {
    return null;
  }
}

function parsePointsBbox(pointsText) {
  const nums = String(pointsText || "")
    .trim()
    .split(/[\s,]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
  if (nums.length < 4) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (![minX, maxX, minY, maxY].every((x) => Number.isFinite(x))) return null;
  return { width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function getSizeMeasure(el, metricRaw) {
  const metric = String(metricRaw || "bboxArea").toLowerCase();
  const tag = String(el.tagName || "").toLowerCase();

  let width = NaN;
  let height = NaN;

  if (tag === "circle") {
    const r = Math.max(0, toFiniteNumber(el.getAttribute("r"), NaN));
    width = Number.isFinite(r) ? 2 * r : NaN;
    height = width;
  } else if (tag === "ellipse") {
    const rx = Math.max(0, toFiniteNumber(el.getAttribute("rx"), NaN));
    const ry = Math.max(0, toFiniteNumber(el.getAttribute("ry"), NaN));
    width = Number.isFinite(rx) ? 2 * rx : NaN;
    height = Number.isFinite(ry) ? 2 * ry : NaN;
  } else if (tag === "rect" || tag === "image" || tag === "foreignobject") {
    width = Math.max(0, toFiniteNumber(el.getAttribute("width"), NaN));
    height = Math.max(0, toFiniteNumber(el.getAttribute("height"), NaN));
  } else if (tag === "line") {
    const x1 = toFiniteNumber(el.getAttribute("x1"), NaN);
    const y1 = toFiniteNumber(el.getAttribute("y1"), NaN);
    const x2 = toFiniteNumber(el.getAttribute("x2"), NaN);
    const y2 = toFiniteNumber(el.getAttribute("y2"), NaN);
    if ([x1, y1, x2, y2].every((x) => Number.isFinite(x))) {
      width = Math.abs(x2 - x1);
      height = Math.abs(y2 - y1);
    }
  } else if (tag === "polygon" || tag === "polyline") {
    const bb = parsePointsBbox(el.getAttribute("points"));
    if (bb) {
      width = bb.width;
      height = bb.height;
    }
  }

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    const bb = getBBoxSafe(el);
    if (bb) {
      width = Math.max(0, bb.width);
      height = Math.max(0, bb.height);
    }
  }

  if (!Number.isFinite(width) || !Number.isFinite(height)) return NaN;

  if (metric === "bboxmaxdim" || metric === "maxdim") return Math.max(width, height);
  if (metric === "bboxmindim" || metric === "mindim") return Math.min(width, height);
  if (metric === "bboxperimeter" || metric === "perimeter") return 2 * (width + height);
  return width * height;
}

function sanitizeFilePart(s) {
  return String(s || "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "group";
}

function assignTempIds(svg) {
  const touched = [];
  let i = 0;
  const all = [svg, ...Array.from(svg.querySelectorAll("*"))];
  for (const el of all) {
    if (!(el instanceof Element)) continue;
    if (el.tagName.toLowerCase() === "svg") continue;
    touched.push(el);
    el.setAttribute(TEMP_ID_ATTR, String(i++));
  }
  return () => {
    for (const el of touched) el.removeAttribute(TEMP_ID_ATTR);
  };
}

function stripTempIds(svg) {
  const all = [svg, ...Array.from(svg.querySelectorAll("*"))];
  for (const el of all) {
    if (!(el instanceof Element)) continue;
    el.removeAttribute(TEMP_ID_ATTR);
  }
}

function getNodesForRule(svg, ruleObj) {
  const selector = ensureObject(ruleObj.selector, { "*": {} });
  return selectElementsByPropSelector(svg, selector)
    .filter((el) => el instanceof Element)
    .filter((el) => el.tagName.toLowerCase() !== "svg")
    .filter((el) => !el.closest("defs"));
}

function resolveNumericRangeBin(value, conf, stats) {
  const ranges = Array.isArray(conf.ranges) ? conf.ranges : null;
  if (!ranges?.length) {
    const step = toFiniteNumber(conf.step, NaN);
    if (Number.isFinite(step) && step > 0) {
      const lo = Math.floor(value / step) * step;
      const hi = lo + step;
      return `${lo.toFixed(2)}-${hi.toFixed(2)}`;
    }
    return String(value.toFixed(2));
  }

  const span = Math.max(0, stats.max - stats.min);

  for (let i = 0; i < ranges.length; i++) {
    const entry = ranges[i];
    let label = `range${i}`;
    let min = null;
    let max = null;

    if (Array.isArray(entry) && entry.length >= 2) {
      min = toFiniteNumber(entry[0], null);
      max = toFiniteNumber(entry[1], null);
    } else if (entry && typeof entry === "object") {
      label = String(entry.label || label);

      const usePct = !!conf.percent;
      const minPct = toFiniteNumber(entry.minPct, NaN);
      const maxPct = toFiniteNumber(entry.maxPct, NaN);

      if (Number.isFinite(minPct) || Number.isFinite(maxPct)) {
        const minP = Number.isFinite(minPct) ? Math.max(0, Math.min(100, minPct)) : 0;
        const maxP = Number.isFinite(maxPct) ? Math.max(0, Math.min(100, maxPct)) : 100;
        min = stats.min + (span * minP) / 100;
        max = stats.min + (span * maxP) / 100;
      } else {
        const minRaw = toFiniteNumber(entry.min, NaN);
        const maxRaw = toFiniteNumber(entry.max, NaN);
        if (usePct && (Number.isFinite(minRaw) || Number.isFinite(maxRaw))) {
          const minP = Number.isFinite(minRaw) ? Math.max(0, Math.min(100, minRaw)) : 0;
          const maxP = Number.isFinite(maxRaw) ? Math.max(0, Math.min(100, maxRaw)) : 100;
          min = stats.min + (span * minP) / 100;
          max = stats.min + (span * maxP) / 100;
        } else {
          min = Number.isFinite(minRaw) ? minRaw : null;
          max = Number.isFinite(maxRaw) ? maxRaw : null;
        }
      }
    }

    if (min == null && max == null) continue;
    if (min != null && value < min) continue;
    if (max != null && value > max) continue;
    return label;
  }

  return String(conf.fallback || "other");
}

function buildColorClusterContext(nodes, conf) {
  const key = String(conf.key || "fill").trim();
  const tolerance = Math.max(0, toFiniteNumber(conf.tolerance, 5));
  const maxClusters = Number.isFinite(toFiniteNumber(conf.maxClusters, NaN))
    ? Math.max(1, Math.floor(toFiniteNumber(conf.maxClusters, 1)))
    : null;

  const entries = [];
  for (const el of nodes) {
    const id = el.getAttribute(TEMP_ID_ATTR);
    if (id == null) continue;
    const raw = readColorLikeProp(el, key);
    const rgb = parseColor(raw);
    if (!rgb) continue;
    entries.push({ id, rgb });
  }

  const { centroids, assignment } = clusterColorsByTolerance(entries.map((e) => e.rgb), tolerance, maxClusters);
  const valueById = new Map();

  for (const entry of entries) {
    const colorKey = entry.rgb.join(",");
    const idx = assignment.get(colorKey) || 0;
    const c = centroids[idx] || entry.rgb;
    valueById.set(
      entry.id,
      `cluster${idx + 1}-rgb(${c[0]},${c[1]},${c[2]})`
    );
  }

  return {
    valueById,
    clusterCount: centroids.length,
  };
}

function buildSizeContext(nodes, conf) {
  const metric = conf.metric || "bboxArea";
  const valueById = new Map();

  let min = Infinity;
  let max = -Infinity;

  for (const el of nodes) {
    const id = el.getAttribute(TEMP_ID_ATTR);
    if (id == null) continue;
    const value = getSizeMeasure(el, metric);
    if (!Number.isFinite(value)) continue;
    valueById.set(id, value);
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 0;
  }

  return {
    valueById,
    stats: { min, max },
  };
}

function buildBinContexts(nodes, binBy) {
  const out = [];

  for (const raw of binBy) {
    const conf = ensureObject(raw, {});
    const kind = String(conf.kind || "").trim().toLowerCase();

    if (kind === "colorcluster") {
      out.push(buildColorClusterContext(nodes, conf));
      continue;
    }

    if (kind === "size") {
      out.push(buildSizeContext(nodes, conf));
      continue;
    }

    out.push(null);
  }

  return out;
}

function resolveBinValue(el, conf, ctx) {
  const kind = String(conf.kind || "").trim().toLowerCase();

  if (kind === "tag") {
    return (el.tagName || "").toLowerCase() || "unknown";
  }

  if (kind === "shapegroup") {
    return shapeGroupForTag(el.tagName);
  }

  if (kind === "attr") {
    const key = String(conf.key || "").trim();
    const v = readProp(el, key);
    return v == null || v === "" ? "(none)" : String(v);
  }

  if (kind === "color") {
    const key = String(conf.key || "fill").trim();
    const rawVal = readColorLikeProp(el, key);
    const rgb = parseColor(rawVal);
    if (!rgb) return "(no-color)";
    return resolveColorBin(rgb, conf);
  }

  if (kind === "colorcluster") {
    const id = el.getAttribute(TEMP_ID_ATTR);
    if (id == null) return "(no-color)";
    return ctx?.valueById?.get(id) || "(no-color)";
  }

  if (kind === "size") {
    const id = el.getAttribute(TEMP_ID_ATTR);
    if (id == null) return "(no-size)";
    const value = ctx?.valueById?.get(id);
    if (!Number.isFinite(value)) return "(no-size)";
    return resolveNumericRangeBin(value, conf, ctx?.stats || { min: value, max: value });
  }

  return "(unknown-kind)";
}

function collectGroups(svg, ruleObj) {
  const binBy = Array.isArray(ruleObj.binBy) ? ruleObj.binBy : [];
  const nodes = getNodesForRule(svg, ruleObj);
  const contexts = buildBinContexts(nodes, binBy);

  const groups = new Map();

  for (const el of nodes) {
    const id = el.getAttribute(TEMP_ID_ATTR);
    if (id == null) continue;

    const parts = [];
    for (let i = 0; i < binBy.length; i++) {
      const conf = ensureObject(binBy[i], {});
      const kind = String(conf.kind || "").trim().toLowerCase();
      const label = String(conf.label || kind || "bin");
      const value = resolveBinValue(el, conf, contexts[i]);
      parts.push({ name: label, value });
    }

    if (!parts.length) parts.push({ name: "all", value: "all" });

    const key = parts.map((p) => `${p.name}=${p.value}`).join("|");
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: parts.map((p) => `${p.name}:${p.value}`).join(" | "),
        ids: [],
      };
      groups.set(key, group);
    }
    group.ids.push(id);
  }

  return Array.from(groups.values()).sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label));
}

function cloneSvgRootAttrs(svg) {
  const ns = svg.namespaceURI || "http://www.w3.org/2000/svg";
  const out = document.createElementNS(ns, "svg");
  for (const { name, value } of Array.from(svg.attributes || [])) {
    out.setAttribute(name, value);
  }
  if (!out.getAttribute("xmlns")) out.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return out;
}

function pruneCloneToIds(cloneSvg, selectedIds) {
  const keepTags = new Set(["defs", "style", "metadata", "title", "desc"]);

  const walk = (node) => {
    const kids = Array.from(node.children || []);
    for (const child of kids) {
      if (!(child instanceof Element)) continue;
      const keep = walk(child);
      if (!keep) child.remove();
    }

    const tag = (node.tagName || "").toLowerCase();
    if (tag === "svg") return true;
    if (keepTags.has(tag)) return true;

    const id = node.getAttribute(TEMP_ID_ATTR);
    if (id != null && selectedIds.has(id)) return true;
    return node.children.length > 0;
  };

  walk(cloneSvg);
}

function downloadSvg(svg, filename) {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);
  if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
    source = source.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${source}`], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ensureAutoExportState(state) {
  if (!state.__autoExport || typeof state.__autoExport !== "object") state.__autoExport = {};
  if (!state.__autoExport.ui || typeof state.__autoExport.ui !== "object") {
    state.__autoExport.ui = {
      showDocs: false,
      selectedPreset: "colorShape",
      ruleText: JSON.stringify(
        AUTO_EXPORT_PRESETS.find((p) => p.id === "colorShape")?.rule || AUTO_EXPORT_PRESETS[0].rule,
        null,
        2
      ),
      selected: {},
      lastGroups: [],
      lastMsg: "",
    };
  }

  const ui = state.__autoExport.ui;
  if (ui.showDocs == null) ui.showDocs = false;
  if (!ui.selectedPreset) ui.selectedPreset = "";
  ui.selected = ensureObject(ui.selected, {});
  if (!Array.isArray(ui.lastGroups)) ui.lastGroups = [];
  if (ui.lastMsg == null) ui.lastMsg = "";
}

function parseRuleOrThrow(text) {
  const parsed = JSON.parse(String(text || "").trim() || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Rule JSON must be an object.");
  }
  if (parsed.selector != null && (typeof parsed.selector !== "object" || Array.isArray(parsed.selector))) {
    throw new Error("selector must be an object.");
  }
  if (parsed.binBy != null && !Array.isArray(parsed.binBy)) {
    throw new Error("binBy must be an array.");
  }
  return parsed;
}

export function buildAutoExportPanel({ mountEl, state, xfRuntime, onStateChange }) {
  ensureAutoExportState(state);
  const ui = state.__autoExport.ui;
  const markDirty = () => onStateChange?.();

  const root = document.createElement("div");
  root.className = "autoexport-panel";

  const render = () => {
    root.innerHTML = "";

    const docs = document.createElement("details");
    docs.open = !!ui.showDocs;
    docs.addEventListener("toggle", () => {
      ui.showDocs = !!docs.open;
      markDirty();
    });
    docs.appendChild(Object.assign(document.createElement("summary"), { textContent: "Auto Export rules (docs)" }));
    const docsBody = document.createElement("pre");
    docsBody.style.whiteSpace = "pre-wrap";
    docsBody.style.marginTop = "8px";
    docsBody.textContent = AUTO_EXPORT_DOCS_TEXT;
    docs.appendChild(docsBody);
    root.appendChild(docs);

    const presetRow = document.createElement("div");
    presetRow.style.display = "flex";
    presetRow.style.flexWrap = "wrap";
    presetRow.style.gap = "8px";
    presetRow.style.marginTop = "8px";

    const presetSelect = document.createElement("select");
    for (const p of AUTO_EXPORT_PRESETS) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      presetSelect.appendChild(opt);
    }
    presetSelect.value = AUTO_EXPORT_PRESETS.some((p) => p.id === ui.selectedPreset)
      ? ui.selectedPreset
      : AUTO_EXPORT_PRESETS[0].id;

    presetSelect.onchange = () => {
      ui.selectedPreset = presetSelect.value;
      markDirty();
    };

    const applyPresetBtn = document.createElement("button");
    applyPresetBtn.type = "button";
    applyPresetBtn.textContent = "apply preset";
    applyPresetBtn.onclick = () => {
      const preset = AUTO_EXPORT_PRESETS.find((p) => p.id === presetSelect.value);
      if (!preset) return;
      ui.ruleText = JSON.stringify(preset.rule, null, 2);
      ui.lastGroups = [];
      ui.selected = {};
      ui.lastMsg = `Applied preset: ${preset.label}`;
      markDirty();
      render();
    };

    presetRow.appendChild(presetSelect);
    presetRow.appendChild(applyPresetBtn);
    root.appendChild(presetRow);

    const taLab = document.createElement("div");
    taLab.textContent = "query JSON";
    taLab.style.margin = "8px 0 5px";
    root.appendChild(taLab);

    const ta = document.createElement("textarea");
    ta.rows = 12;
    ta.style.width = "100%";
    ta.value = String(ui.ruleText || "");
    ta.addEventListener("input", () => {
      ui.ruleText = ta.value;
      markDirty();
    });
    root.appendChild(ta);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.flexWrap = "wrap";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "8px";

    const mkBtn = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.onclick = fn;
      return b;
    };

    const runPreview = () => {
      try {
        xfRuntime?.rebuildNow?.();
        const svg = mountEl.firstElementChild;
        if (!(svg instanceof SVGSVGElement)) throw new Error("No SVG found in mount.");

        const rule = parseRuleOrThrow(ui.ruleText);
        const cleanup = assignTempIds(svg);
        try {
          const groups = collectGroups(svg, rule);
          const next = [];
          for (const g of groups) {
            if (!(g.key in ui.selected)) ui.selected[g.key] = true;
            next.push({ key: g.key, label: g.label, count: g.ids.length });
          }
          ui.lastGroups = next;
          ui.lastMsg = `Matched ${groups.reduce((acc, g) => acc + g.ids.length, 0)} elements into ${groups.length} bins.`;
        } finally {
          cleanup();
        }
        markDirty();
        render();
      } catch (err) {
        ui.lastMsg = `preview error: ${String(err?.message || err)}`;
        markDirty();
        render();
      }
    };

    btnRow.appendChild(mkBtn("preview bins", runPreview));
    btnRow.appendChild(mkBtn("select all", () => {
      for (const g of ui.lastGroups) ui.selected[g.key] = true;
      markDirty();
      render();
    }));
    btnRow.appendChild(mkBtn("select none", () => {
      for (const g of ui.lastGroups) ui.selected[g.key] = false;
      markDirty();
      render();
    }));
    btnRow.appendChild(mkBtn("export selected", () => {
      try {
        xfRuntime?.rebuildNow?.();
        const svg = mountEl.firstElementChild;
        if (!(svg instanceof SVGSVGElement)) throw new Error("No SVG found in mount.");

        const rule = parseRuleOrThrow(ui.ruleText);
        const filePrefix = sanitizeFilePart(String(rule.filePrefix || "auto-export"));

        const cleanup = assignTempIds(svg);
        let exported = 0;
        try {
          const groups = collectGroups(svg, rule);
          ui.lastGroups = groups.map((g) => ({ key: g.key, label: g.label, count: g.ids.length }));
          for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            if (!ui.selected[g.key]) continue;

            const clone = cloneSvgRootAttrs(svg);
            const deep = svg.cloneNode(true);
            while (deep.firstChild) clone.appendChild(deep.firstChild);
            pruneCloneToIds(clone, new Set(g.ids));
            stripTempIds(clone);

            const safe = sanitizeFilePart(g.label);
            const file = `${filePrefix}_${String(i + 1).padStart(3, "0")}_${safe}.svg`;
            downloadSvg(clone, file);
            exported += 1;
          }
        } finally {
          cleanup();
        }

        ui.lastMsg = exported
          ? `Exported ${exported} SVG file${exported === 1 ? "" : "s"}.`
          : "No bins selected to export.";
        markDirty();
        render();
      } catch (err) {
        ui.lastMsg = `export error: ${String(err?.message || err)}`;
        markDirty();
        render();
      }
    }));

    root.appendChild(btnRow);

    const grpWrap = document.createElement("div");
    grpWrap.style.marginTop = "10px";
    grpWrap.style.maxHeight = "260px";
    grpWrap.style.overflow = "auto";
    grpWrap.style.border = "1px solid rgba(255,255,255,0.2)";
    grpWrap.style.padding = "6px";

    if (!ui.lastGroups.length) {
      grpWrap.textContent = 'No bins yet. Click "preview bins".';
    } else {
      for (const g of ui.lastGroups) {
        const row = document.createElement("label");
        row.style.display = "flex";
        row.style.alignItems = "flex-start";
        row.style.gap = "8px";
        row.style.padding = "3px 0";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!ui.selected[g.key];
        cb.onchange = () => {
          ui.selected[g.key] = !!cb.checked;
          markDirty();
        };

        const txt = document.createElement("div");
        txt.textContent = `${g.label} (${g.count})`;

        row.appendChild(cb);
        row.appendChild(txt);
        grpWrap.appendChild(row);
      }
    }
    root.appendChild(grpWrap);

    const status = document.createElement("pre");
    status.style.marginTop = "8px";
    status.textContent = String(ui.lastMsg || "");
    root.appendChild(status);
  };

  render();
  return root;
}

export function registerAutoExportTab() {
  registerTab("autoExport", ({ mountEl, state, xfRuntime, onStateChange }) =>
    buildAutoExportPanel({ mountEl, state, xfRuntime, onStateChange })
  );
}
