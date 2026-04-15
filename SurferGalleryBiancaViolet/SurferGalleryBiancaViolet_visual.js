import { registerVisual } from "../helper/visualHelp.js";

function clampNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, fallback, min, max) {
  const n = Math.floor(clampNum(value, fallback));
  return Math.max(min, Math.min(max, n));
}

function getFitBox(width, height, padding, fitMode) {
  const pad = Math.max(0, clampNum(padding, 0));
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  let scaleW = innerW;
  let scaleH = innerH;
  const mode = String(fitMode || "contain");
  if (mode === "contain") {
    const s = Math.min(innerW, innerH);
    scaleW = s;
    scaleH = s;
  } else if (mode === "cover") {
    const s = Math.max(innerW, innerH);
    scaleW = s;
    scaleH = s;
  }
  return {
    pad,
    innerW,
    innerH,
    scaleW,
    scaleH,
    offsetX: (width - scaleW) / 2,
    offsetY: (height - scaleH) / 2,
    cx: width / 2,
    cy: height / 2,
  };
}

const CASES = {
  0: [],
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  5: [[3, 0], [1, 2]],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]],
  9: [[0, 2]],
  10: [[0, 1], [2, 3]],
  11: [[1, 2]],
  12: [[1, 3]],
  13: [[0, 1]],
  14: [[3, 0]],
  15: [],
};

function interp(pA, pB, vA, vB, level) {
  const t = (level - vA) / (vB - vA || 1e-6);
  return [
    pA[0] + (pB[0] - pA[0]) * t,
    pA[1] + (pB[1] - pA[1]) * t,
  ];
}

function parseIsoSelection(raw, count) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text || text === "all" || count <= 0) return null;

  const set = new Set();
  const tokens = text.split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    if (tok === "all") return null;
    const m = tok.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const lo = Math.max(0, Math.min(a, b));
      const hi = Math.min(count - 1, Math.max(a, b));
      for (let i = lo; i <= hi; i++) set.add(i);
      continue;
    }
    const n = parseInt(tok, 10);
    if (!Number.isFinite(n) || n < 0 || n >= count) continue;
    set.add(n);
  }

  return set.size ? set : null;
}

function buildPolylinesFromSegments(segments, precision = 2) {
  const keyFor = (p) => `${p[0].toFixed(precision)},${p[1].toFixed(precision)}`;
  const adjacency = new Map();

  const pushAdj = (key, entry) => {
    if (!adjacency.has(key)) adjacency.set(key, []);
    adjacency.get(key).push(entry);
  };

  segments.forEach((seg, i) => {
    pushAdj(keyFor(seg.a), { i, end: "a" });
    pushAdj(keyFor(seg.b), { i, end: "b" });
  });

  const used = new Set();
  const polylines = [];

  const nextUnusedAt = (key) => {
    const list = adjacency.get(key);
    if (!list) return null;
    for (const entry of list) {
      if (!used.has(entry.i)) return entry;
    }
    return null;
  };

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    used.add(i);

    const seg = segments[i];
    const points = [seg.a, seg.b];

    const extend = (atStart) => {
      while (true) {
        const endPt = atStart ? points[0] : points[points.length - 1];
        const entry = nextUnusedAt(keyFor(endPt));
        if (!entry) break;
        used.add(entry.i);
        const nextSeg = segments[entry.i];
        const other = entry.end === "a" ? nextSeg.b : nextSeg.a;
        if (atStart) points.unshift(other);
        else points.push(other);
      }
    };

    extend(false);
    extend(true);
    polylines.push(points);
  }

  return polylines;
}

function pointsToPath(points, precision = 2) {
  if (!points || points.length < 2) return "";
  const keyFor = (p) => `${p[0].toFixed(precision)},${p[1].toFixed(precision)}`;
  const closed = points.length > 2 && keyFor(points[0]) === keyFor(points[points.length - 1]);
  const pts = closed ? points.slice(0, -1) : points;
  const fmt = (p) => `${p[0].toFixed(precision)} ${p[1].toFixed(precision)}`;
  let d = `M ${fmt(pts[0])}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${fmt(pts[i])}`;
  if (closed) d += " Z";
  return d;
}

const toggleContinuousPathsParam = {
  key: "toggleContinuousPaths",
  type: "button",
  label: "Toggle Continuous Paths",
  category: "Styling",
  description: "Switch between line segments and joined paths.",
  onClick: ({ state }) => {
    state.joinPaths = !state.joinPaths;
  },
};

registerVisual("surferGalleryBiancaViolet", {
  title: "SURFER Gallery (Bianca Violet)",
  description: "Implicit algebraic surfaces traced as contour slices.",
  params: [
    {
      key: "equation",
      type: "select",
      default: "violet",
      options: ["violet", "whorl", "lemniscate", "orchid"],
      category: "Surface",
    },
    {
      key: "gridSize",
      type: "number",
      default: 90,
      min: 30,
      max: 160,
      step: 5,
      category: "Surface",
    },
    {
      key: "isoCount",
      type: "number",
      default: 6,
      min: 2,
      max: 12,
      step: 1,
      category: "Surface",
    },
    {
      key: "isoSelection",
      type: "text",
      default: "",
      category: "Surface",
      description: 'ISO indices (comma or range, e.g. "0,2,4" or "0-5"). Blank = all.',
    },
    {
      key: "isoSpan",
      type: "number",
      default: 1,
      min: 0.2,
      max: 2.2,
      step: 0.05,
      category: "Surface",
    },
    {
      key: "isoCenter",
      type: "number",
      default: 0,
      min: -1,
      max: 1,
      step: 0.05,
      category: "Surface",
    },
    {
      key: "warp",
      type: "number",
      default: 1,
      min: -3,
      max: 3,
      step: 0.05,
      category: "Surface",
    },
    {
      key: "rotation",
      type: "number",
      default: -0.4,
      min: -1.5,
      max: 1.5,
      step: 0.05,
      category: "Surface",
    },
    {
      key: "fitMode",
      type: "select",
      default: "stretch",
      options: ["contain", "cover", "stretch"],
      category: "Layout",
    },
    {
      key: "padding",
      type: "number",
      default: 36,
      min: 0,
      max: 200,
      step: 2,
      category: "Layout",
    },
    {
      key: "strokeWidth",
      type: "number",
      default: 1.2,
      min: 0.4,
      max: 4,
      step: 0.1,
      category: "Styling",
    },
    toggleContinuousPathsParam,
  ],
  defaultState: {
    equation: "violet",
    gridSize: 90,
    isoCount: 6,
    isoSelection: "",
    isoSpan: "1",
    isoCenter: 0,
    warp: 0.35,
    rotation: "-0.4",
    fitMode: "stretch",
    padding: 36,
    strokeWidth: 1.2,
    shouldRender: true,
    joinPaths: false,
    __xf: {
      ui: {
        splitCount: 1,
        activeTile: "0",
        rotateDeg: 90,
        preset: "kaleidoscope4",
        splitMode: "screen",
        applyToAll: false,
        tileTargets: "2-3",
        zoomFactor: "1.03",
        matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        zoomCenter: { x: null, y: null },
        translateVec: { x: 0, y: -1 },
        planeCount: 3,
        planeBaseScale: 1,
        planeScaleStep: -0.12,
        planeOpacity: 0.7,
        planeOpacityFalloff: 0.12,
        planeOffset: { x: 0, y: 0 },
        planeCenter: { x: null, y: null },
        groupOpen: {
          Presets: true,
          Targets: true,
          Translate: true,
          "Rotate/Zoom": true,
          "3D Planes": false,
        },
      },
      stack: [
        { kind: "split", count: 4 },
        { kind: "flipY", targets: [0] },
        { kind: "flipX", targets: [1] },
        { kind: "flipY", targets: [1] },
        { kind: "flipX", targets: [3] },
        { kind: "zoom", targets: [0, 1, 2, 3], factor: 1.03, center: { x: 0, y: 0 } },
        { kind: "zoom", targets: [0, 1, 2, 3], factor: 1.03, center: { x: 0, y: 0 } },
        { kind: "zoom", targets: [0, 1, 2, 3], factor: 1.03, center: { x: 0, y: 0 } },
        { kind: "zoom", targets: [0, 1, 2, 3], factor: 0.970873786407767, center: { x: 0, y: 0 } },
        { kind: "zoom", targets: [0, 1, 2, 3], factor: 0.970873786407767, center: { x: 0, y: 0 } },
        { kind: "zoom", targets: [0, 1, 2, 3], factor: 1.03, center: { x: 0, y: 0 } },
        { kind: "zoom", targets: [0, 1, 2, 3], factor: 0.970873786407767, center: { x: 0, y: 0 } },
        { kind: "translate", targets: [0, 1], v: { x: 0, y: 10 } },
        { kind: "translate", targets: [0, 1], v: { x: 0, y: -10 } },
        { kind: "translate", targets: [0, 1], v: { x: 0, y: -10 } },
        { kind: "translate", targets: [0, 1], v: { x: 0, y: -10 } },
        { kind: "translate", targets: [0, 1], v: { x: 0, y: -10 } },
        { kind: "translate", targets: [0, 1], v: { x: 0, y: -10 } },
        { kind: "translate", targets: [2, 3], v: { x: 0, y: 10 } },
        { kind: "translate", targets: [2, 3], v: { x: 0, y: -10 } },
        { kind: "translate", targets: [2, 3], v: { x: 0, y: -10 } },
        { kind: "translate", targets: [2, 3], v: { x: 0, y: -10 } },
        { kind: "translate", targets: [2, 3], v: { x: 0, y: -10 } },
        { kind: "translate", targets: [2, 3], v: { x: 0, y: -1 } },
        { kind: "translate", targets: [2, 3], v: { x: 0, y: -1 } },
      ],
    },
    __ui: {
      tabsOpen: true,
      activeTab: "transforms",
      paramGroups: {
        Surface: true,
        Layout: true,
        Styling: true,
      },
      ioOpen: true,
      collapseParamsByDefault: true,
    },
    __propOps: {
      ui: {
        ruleText:
          "{\n        \"selector\": {\"circle\":{\"r\":{\"range\":[20,100]}}},\n        \"apply\": {\"stroke\": null}\n        }",
        lastPreview: "",
        showDocs: false,
      },
      stack: [],
    },
    __scriptOps: {
      ui: {
        codeText:
          "// ctx.root is the <g> subtree being processed\n// ctx.svg is the owning <svg>\n// ctx.create(tag) creates an SVG element\n//\n// Example: circle -> 6-gon (polygon)\n// for (const c of ctx.root.querySelectorAll(\"circle\")) {\n//   const cx = Number(c.getAttribute(\"cx\") || 0);\n//   const cy = Number(c.getAttribute(\"cy\") || 0);\n//   const r = Number(c.getAttribute(\"r\") || 0);\n//   const n = 6;\n//   const pts = Array.from({length:n}, (_,i) => {\n//     const a = (Math.PI*2*i)/n;\n//     return [cx + r*Math.cos(a), cy + r*Math.sin(a)].join(\",\");\n//   }).join(\" \");\n//   const p = ctx.create(\"polygon\");\n//   p.setAttribute(\"points\", pts);\n//   for (const {name,value} of Array.from(c.attributes)) {\n//     if (name === \"cx\" || name === \"cy\" || name === \"r\") continue;\n//     p.setAttribute(name, value);\n//   }\n//   c.replaceWith(p);\n// }",
        fileName: "",
        selectedCacheKey: "",
        autoRunSelected: false,
        lastPreview: "",
        showDocs: false,
      },
      stack: [],
      cache: {},
    },
    __anim: {
      ui: {
        targetType: "params",
        paramTargets: [],
        paramKey: "",
        selector: "svg",
        svgKind: "attr",
        svgName: "opacity",
        durationSec: 3,
        fps: 20,
        easing: "linear",
        loop: false,
        yoyo: false,
        progress01: 0,
        autoFromCurrent: true,
        snapToEndOnStop: true,
        autoPlay: false,
      },
    },
  },

  create({ mountEl }, state) {
    mountEl.innerHTML = "";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";
    svg.style.touchAction = "none";

    const gCells = document.createElementNS(svg.namespaceURI, "g");
    const gSites = document.createElementNS(svg.namespaceURI, "g");
    svg.appendChild(gCells);
    svg.appendChild(gSites);
    mountEl.appendChild(svg);

    let lastSize = { width: 1, height: 1 };

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      return { width, height };
    };

    const field = (x, y) => {
      const eq = String(state.equation || "violet");
      switch (eq) {
        case "whorl":
          return Math.sin(2.2 * x) + Math.cos(2.4 * y) + 0.35 * Math.sin(3 * x * y);
        case "lemniscate":
          return (x * x + y * y) * (x * x + y * y) - 0.35 * (x * x - y * y);
        case "orchid":
          return x * x * x - 3 * x * y * y + 0.4 * Math.sin(2 * y);
        case "violet":
        default:
          return x * x * y - y * y * y + 0.4 * x;
      }
    };

    const render = () => {
      const { width, height } = size();
      lastSize = { width, height };
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      gCells.innerHTML = "";
      gSites.innerHTML = "";

      const gridSize = clampInt(state.gridSize, 90, 20, 200);
      const isoCount = clampInt(state.isoCount, 6, 2, 14);
      const isoSelection = parseIsoSelection(state.isoSelection, isoCount);
      const isoSpan = clampNum(state.isoSpan, 1.1);
      const isoCenter = clampNum(state.isoCenter, 0);
      const warp = clampNum(state.warp, 0.35);
      const rotation = clampNum(state.rotation, 0.2);
      const fitMode = String(state.fitMode || "contain");
      const padding = clampNum(state.padding, 36);
      const strokeWidth = clampNum(state.strokeWidth, 1.2);
      const joinPaths = !!state.joinPaths;

      const fit = getFitBox(width, height, padding, fitMode);
      const w = fit.scaleW;
      const h = fit.scaleH;
      const ox = fit.offsetX;
      const oy = fit.offsetY;
      const aspect = w / Math.max(1, h);

      const levels = [];
      for (let i = 0; i < isoCount; i++) {
        const t = isoCount === 1 ? 0.5 : i / (isoCount - 1);
        levels.push(isoCenter + (t - 0.5) * isoSpan);
      }

      for (let li = 0; li < levels.length; li++) {
        if (isoSelection && !isoSelection.has(li)) continue;
        const level = levels[li];
        const hue = 270 + li * 18;
        const color = `hsl(${hue}, 60%, 55%)`;
        const pathSegments = joinPaths ? [] : null;

        for (let gy = 0; gy < gridSize; gy++) {
          for (let gx = 0; gx < gridSize; gx++) {
            const x0 = ox + (gx / gridSize) * w;
            const y0 = oy + (gy / gridSize) * h;
            const x1 = ox + ((gx + 1) / gridSize) * w;
            const y1 = oy + ((gy + 1) / gridSize) * h;

            const nx0 = ((gx / gridSize) * 2 - 1) * aspect;
            const ny0 = (gy / gridSize) * 2 - 1;
            const nx1 = (((gx + 1) / gridSize) * 2 - 1) * aspect;
            const ny1 = ((gy + 1) / gridSize) * 2 - 1;

            const cosR = Math.cos(rotation);
            const sinR = Math.sin(rotation);
            const rx0 = nx0 * cosR - ny0 * sinR;
            const ry0 = nx0 * sinR + ny0 * cosR;
            const rx1 = nx1 * cosR - ny0 * sinR;
            const ry1 = nx1 * sinR + ny0 * cosR;
            const rx2 = nx1 * cosR - ny1 * sinR;
            const ry2 = nx1 * sinR + ny1 * cosR;
            const rx3 = nx0 * cosR - ny1 * sinR;
            const ry3 = nx0 * sinR + ny1 * cosR;

            const v0 = field(rx0 + warp * Math.sin(ry0 * Math.PI * 2), ry0 + warp * Math.cos(rx0 * Math.PI * 2));
            const v1 = field(rx1 + warp * Math.sin(ry1 * Math.PI * 2), ry1 + warp * Math.cos(rx1 * Math.PI * 2));
            const v2 = field(rx2 + warp * Math.sin(ry2 * Math.PI * 2), ry2 + warp * Math.cos(rx2 * Math.PI * 2));
            const v3 = field(rx3 + warp * Math.sin(ry3 * Math.PI * 2), ry3 + warp * Math.cos(rx3 * Math.PI * 2));

            const idx = (v0 > level ? 1 : 0) |
              (v1 > level ? 2 : 0) |
              (v2 > level ? 4 : 0) |
              (v3 > level ? 8 : 0);

            const cellSegments = CASES[idx];
            if (!cellSegments || cellSegments.length === 0) continue;

            const p0 = [x0, y0];
            const p1 = [x1, y0];
            const p2 = [x1, y1];
            const p3 = [x0, y1];

            const edgePoints = [
              interp(p0, p1, v0, v1, level),
              interp(p1, p2, v1, v2, level),
              interp(p2, p3, v2, v3, level),
              interp(p3, p0, v3, v0, level),
            ];

            for (const [a, b] of cellSegments) {
              const aPt = edgePoints[a];
              const bPt = edgePoints[b];
              if (joinPaths) {
                pathSegments.push({ a: aPt, b: bPt });
                continue;
              }
              const line = document.createElementNS(svg.namespaceURI, "line");
              line.setAttribute("x1", aPt[0].toFixed(2));
              line.setAttribute("y1", aPt[1].toFixed(2));
              line.setAttribute("x2", bPt[0].toFixed(2));
              line.setAttribute("y2", bPt[1].toFixed(2));
              line.setAttribute("stroke", color);
              line.setAttribute("stroke-width", strokeWidth.toFixed(2));
              line.setAttribute("stroke-opacity", "0.75");
              gCells.appendChild(line);
            }
          }
        }

        if (joinPaths && pathSegments.length) {
          const polylines = buildPolylinesFromSegments(pathSegments, 2);
          for (const points of polylines) {
            const d = pointsToPath(points, 2);
            if (!d) continue;
            const path = document.createElementNS(svg.namespaceURI, "path");
            path.setAttribute("d", d);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", color);
            path.setAttribute("stroke-width", strokeWidth.toFixed(2));
            path.setAttribute("stroke-opacity", "0.75");
            gCells.appendChild(path);
          }
        }
      }
    };

    const ro = new ResizeObserver(() => render());
    ro.observe(mountEl);

    render();
    return {
      render,
      destroy() {
        ro.disconnect();
      },
    };
  },
});
