import { registerVisual } from "../helper/visualHelp.js";

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function generatePointsInCircle({ cx, cy, radius, count, minDist, seed }) {
  const rand = mulberry32(seed);
  const pts = [];
  const minD = Math.max(0, minDist);
  const minD2 = minD * minD;
  const maxAttempts = Math.max(200, count * 240);

  const tryAdd = (x, y) => {
    for (let i = 0; i < pts.length; i += 1) {
      const dx = x - pts[i][0];
      const dy = y - pts[i][1];
      if (dx * dx + dy * dy < minD2) return false;
    }
    pts.push([x, y]);
    return true;
  };

  for (let attempts = 0; attempts < maxAttempts && pts.length < count; attempts += 1) {
    const t = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;
    tryAdd(x, y);
  }

  return pts;
}

function polygonArea(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum * 0.5;
}

function buildCirclePolygon(cx, cy, radius, segments) {
  const count = Math.max(12, Math.floor(segments));
  const pts = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return pts;
}

function normalizePolygon(poly) {
  if (!poly || poly.length < 3) return null;
  const out = poly.slice();
  const first = out[0];
  const last = out[out.length - 1];
  if (Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-6) {
    out.pop();
  }
  return out.length >= 3 ? out : null;
}

function isInside(p, a, b, isCCW) {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  return isCCW ? cross >= -1e-9 : cross <= 1e-9;
}

function lineIntersection(p1, p2, p3, p4) {
  const x1 = p1[0];
  const y1 = p1[1];
  const x2 = p2[0];
  const y2 = p2[1];
  const x3 = p3[0];
  const y3 = p3[1];
  const x4 = p4[0];
  const y4 = p4[1];

  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return p2;

  const det1 = x1 * y2 - y1 * x2;
  const det2 = x3 * y4 - y3 * x4;
  const px = (det1 * (x3 - x4) - (x1 - x2) * det2) / den;
  const py = (det1 * (y3 - y4) - (y1 - y2) * det2) / den;
  return [px, py];
}

function clipPolygon(subject, clip) {
  if (!subject || subject.length < 3) return [];
  const isCCW = polygonArea(clip) >= 0;
  let output = subject.slice();

  for (let i = 0; i < clip.length; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output.slice();
    output = [];

    if (input.length === 0) break;

    let s = input[input.length - 1];
    for (const e of input) {
      const insideE = isInside(e, a, b, isCCW);
      const insideS = isInside(s, a, b, isCCW);
      if (insideE) {
        if (!insideS) {
          output.push(lineIntersection(s, e, a, b));
        }
        output.push(e);
      } else if (insideS) {
        output.push(lineIntersection(s, e, a, b));
      }
      s = e;
    }
  }

  return output;
}

function polygonToPath(poly) {
  if (!poly || poly.length < 2) return "";
  const parts = poly.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`);
  return `M ${parts.join(" L ")} Z`;
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function minDistanceToPolygon(point, poly) {
  let min = Infinity;
  const [px, py] = point;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = distancePointToSegment(px, py, a[0], a[1], b[0], b[1]);
    if (d < min) min = d;
  }
  return min;
}

function backgroundFor(name) {
  switch (String(name || "").toLowerCase()) {
    case "night":
      return "#111117";
    case "paper":
      return "#f7f1e6";
    case "none":
      return "transparent";
    default:
      return "#f7f1e6";
  }
}

registerVisual("plantCells", {
  title: "Plant Cells",
  description: "Voronoi cells packed in a circle with site circles and outer rectangle stacks.",
  params: [
    {
      key: "pointCount",
      label: "cell count",
      type: "number",
      default: 90,
      category: "Cells",
      min: 5,
      max: 400,
      step: 1,
    },
    {
      key: "minDist",
      label: "minimum spacing",
      type: "number",
      default: 10,
      category: "Cells",
      min: 0,
      max: 120,
      step: 1,
    },
    {
      key: "radiusScale",
      label: "circle scale",
      type: "number",
      default: 0.38,
      category: "Cells",
      min: 0.2,
      max: 0.48,
      step: 0.01,
    },
    {
      key: "cellCircleScale",
      label: "cell circle scale",
      type: "number",
      default: 0.96,
      category: "Cells",
      min: 0.5,
      max: 1,
      step: 0.01,
    },
    {
      key: "circleSegments",
      label: "circle segments",
      type: "number",
      default: 96,
      category: "Cells",
      min: 24,
      max: 240,
      step: 1,
    },
    {
      key: "seed",
      type: "number",
      default: 42,
      category: "Randomness",
      min: 0,
      max: 999999,
      step: 1,
    },
    {
      type: "button",
      key: "randomizeSeed",
      label: "Randomize Seed",
      category: "Randomness",
      onClick: ({ state }) => {
        state.seed = Math.floor(Math.random() * 1_000_000);
      },
    },
    {
      key: "rectSpacing",
      label: "rect spacing",
      type: "number",
      default: 26,
      category: "Rectangles",
      min: 6,
      max: 120,
      step: 1,
    },
    {
      key: "rectLevels",
      label: "rect levels",
      type: "number",
      default: 4,
      category: "Rectangles",
      min: 1,
      max: 10,
      step: 1,
    },
    {
      key: "rectWidth",
      label: "rect width",
      type: "number",
      default: 14,
      category: "Rectangles",
      min: 2,
      max: 80,
      step: 1,
    },
    {
      key: "rectHeight",
      label: "rect height",
      type: "number",
      default: 7,
      category: "Rectangles",
      min: 2,
      max: 60,
      step: 1,
    },
    {
      key: "rectGap",
      label: "rect gap",
      type: "number",
      default: 3,
      category: "Rectangles",
      min: 0,
      max: 30,
      step: 1,
    },
    {
      key: "rectOffset",
      label: "rect offset",
      type: "number",
      default: 10,
      category: "Rectangles",
      min: 0,
      max: 80,
      step: 1,
    },
    {
      key: "strokeColor",
      label: "stroke color",
      type: "text",
      default: "#1b1712",
      category: "Style",
    },
    {
      key: "strokeWidth",
      label: "stroke width",
      type: "number",
      default: 1.1,
      category: "Style",
      min: 0.2,
      max: 6,
      step: 0.1,
    },
    {
      key: "outerStrokeWidth",
      label: "outer stroke width",
      type: "number",
      default: 1.8,
      category: "Style",
      min: 0.2,
      max: 8,
      step: 0.1,
    },
    {
      key: "strokeOpacity",
      label: "stroke opacity",
      type: "number",
      default: 0.9,
      category: "Style",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "background",
      type: "select",
      default: "paper",
      category: "Style",
      options: ["paper", "night", "none"],
    },
  ],
  create({ mountEl }, state) {
    mountEl.innerHTML = "";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";

    const gRoot = document.createElementNS(svg.namespaceURI, "g");
    const gCells = document.createElementNS(svg.namespaceURI, "g");
    const gCircles = document.createElementNS(svg.namespaceURI, "g");
    const gRects = document.createElementNS(svg.namespaceURI, "g");
    const gOuter = document.createElementNS(svg.namespaceURI, "g");

    gRoot.appendChild(gCells);
    gRoot.appendChild(gCircles);
    gRoot.appendChild(gOuter);
    gRoot.appendChild(gRects);
    svg.appendChild(gRoot);
    mountEl.appendChild(svg);

    const getSize = () => {
      const rect = mountEl.getBoundingClientRect();
      return {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      };
    };

    const render = () => {
      const d3c = window.d3;
      if (!d3c?.Delaunay) return;

      const { width, height } = getSize();
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.style.background = backgroundFor(state.background);

      const cx = width / 2;
      const cy = height / 2;
      const strokeColor = String(state.strokeColor || "#1b1712");
      const strokeWidth = Math.max(0.2, clampNum(state.strokeWidth, 1));
      const outerStrokeWidth = Math.max(0.2, clampNum(state.outerStrokeWidth, strokeWidth * 1.6));
      const strokeOpacity = clamp01(state.strokeOpacity);

      const rectLevels = Math.max(1, Math.floor(clampNum(state.rectLevels, 4)));
      const rectWidth = Math.max(1, clampNum(state.rectWidth, 14));
      const rectHeight = Math.max(1, clampNum(state.rectHeight, 7));
      const rectGap = Math.max(0, clampNum(state.rectGap, 3));
      const rectOffset = Math.max(0, clampNum(state.rectOffset, 10));

      const rectDepth = rectLevels * rectHeight + (rectLevels - 1) * rectGap + rectOffset;
      const radiusBase = Math.max(10, Math.min(width, height) * clamp01(state.radiusScale));
      const safeMaxRadius = Math.max(30, Math.min(width, height) / 2 - rectDepth - outerStrokeWidth);
      const radius = Math.max(10, Math.min(radiusBase, safeMaxRadius));

      const pointCount = Math.max(3, Math.floor(clampNum(state.pointCount, 60)));
      const minDist = Math.max(0, Math.min(clampNum(state.minDist, 0), radius * 0.7));
      const seed = Math.floor(clampNum(state.seed, 1));

      const pts = generatePointsInCircle({
        cx,
        cy,
        radius,
        count: pointCount,
        minDist,
        seed,
      });

      gCells.innerHTML = "";
      gCircles.innerHTML = "";
      if (pts.length >= 2) {
        const clipPoly = buildCirclePolygon(cx, cy, radius, clampNum(state.circleSegments, 96));
        const delaunay = d3c.Delaunay.from(pts);
        const vor = delaunay.voronoi([cx - radius, cy - radius, cx + radius, cy + radius]);

        for (let i = 0; i < pts.length; i += 1) {
          const raw = normalizePolygon(vor.cellPolygon(i));
          if (!raw) continue;
          const clipped = clipPolygon(raw, clipPoly);
          if (!clipped || clipped.length < 3) continue;
          const pathStr = polygonToPath(clipped);
          if (pathStr) {
            const path = document.createElementNS(svg.namespaceURI, "path");
            path.setAttribute("d", pathStr);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", strokeColor);
            path.setAttribute("stroke-width", String(strokeWidth));
            path.setAttribute("stroke-opacity", String(strokeOpacity));
            path.setAttribute("stroke-linejoin", "round");
            gCells.appendChild(path);
          }

          const minEdge = minDistanceToPolygon(pts[i], clipped);
          const circleScale = clamp01(state.cellCircleScale);
          const siteRadius = minEdge * circleScale;
          if (siteRadius > 0.2) {
            const site = document.createElementNS(svg.namespaceURI, "circle");
            site.setAttribute("cx", String(pts[i][0]));
            site.setAttribute("cy", String(pts[i][1]));
            site.setAttribute("r", String(siteRadius.toFixed(2)));
            site.setAttribute("fill", "none");
            site.setAttribute("stroke", strokeColor);
            site.setAttribute("stroke-width", String(strokeWidth));
            site.setAttribute("stroke-opacity", String(strokeOpacity));
            gCircles.appendChild(site);
          }
        }
      }

      gOuter.innerHTML = "";
      const outer = document.createElementNS(svg.namespaceURI, "circle");
      outer.setAttribute("cx", String(cx));
      outer.setAttribute("cy", String(cy));
      outer.setAttribute("r", String(radius));
      outer.setAttribute("fill", "none");
      outer.setAttribute("stroke", strokeColor);
      outer.setAttribute("stroke-width", String(outerStrokeWidth));
      outer.setAttribute("stroke-opacity", String(strokeOpacity));
      gOuter.appendChild(outer);

      gRects.innerHTML = "";
      const rectSpacing = Math.max(4, clampNum(state.rectSpacing, 26));
      const rawCount = rectSpacing > 0 ? (Math.PI * 2 * radius) / rectSpacing : 0;
      const stackCount = Math.max(1, Math.min(420, Math.floor(rawCount)));
      for (let i = 0; i < stackCount; i += 1) {
        const angle = (i / stackCount) * Math.PI * 2;
        const group = document.createElementNS(svg.namespaceURI, "g");
        const deg = (angle * 180) / Math.PI - 90;
        group.setAttribute("transform", `translate(${cx}, ${cy}) rotate(${deg})`);

        for (let row = 0; row < rectLevels; row += 1) {
          const rowCount = rectLevels - row;
          const rowWidth = rowCount * rectWidth + (rowCount - 1) * rectGap;
          const startX = -rowWidth / 2;
          const y = radius + rectOffset + row * (rectHeight + rectGap);

          for (let col = 0; col < rowCount; col += 1) {
            const x = startX + col * (rectWidth + rectGap);
            const rect = document.createElementNS(svg.namespaceURI, "rect");
            rect.setAttribute("x", String(x));
            rect.setAttribute("y", String(y));
            rect.setAttribute("width", String(rectWidth));
            rect.setAttribute("height", String(rectHeight));
            rect.setAttribute("fill", "none");
            rect.setAttribute("stroke", strokeColor);
            rect.setAttribute("stroke-width", String(strokeWidth));
            rect.setAttribute("stroke-opacity", String(strokeOpacity));
            group.appendChild(rect);
          }
        }

        gRects.appendChild(group);
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
