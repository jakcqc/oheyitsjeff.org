import { registerVisual } from "../helper/visualHelp.js";

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2i(xi, yi, seed) {
  let x = (xi | 0) * 374761393 + (yi | 0) * 668265263 + (seed | 0) * 1442695041;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, y, seed, scale) {
  const s = Math.max(1e-6, scale);
  const fx = x / s;
  const fy = y / s;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smoothstep(fx - x0);
  const ty = smoothstep(fy - y0);

  const a = hash2i(x0, y0, seed);
  const b = hash2i(x0 + 1, y0, seed);
  const c = hash2i(x0, y0 + 1, seed);
  const d = hash2i(x0 + 1, y0 + 1, seed);

  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}

function dist2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function generatePoints({
  width,
  height,
  count,
  minDist,
  density,
  seed,
  noiseScale,
  manualPoints = [],
}) {
  const rand = mulberry32(seed);
  const pts = manualPoints
    .map(p => [clampNum(p?.[0], NaN), clampNum(p?.[1], NaN)])
    .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));

  const minD = Math.max(0, minDist);
  const minD2 = minD * minD;
  const maxAttempts = Math.max(200, count * 200);

  const acceptWeight = (x, y) => {
    const d = clamp01(density);
    if (d <= 0) return 1;
    const n = valueNoise2D(x, y, seed, Math.max(8, noiseScale));
    const w = (0.15 + 0.85 * n);
    return (1 - d) * 1 + d * w;
  };

  const tryAdd = (x, y) => {
    if (x < 0 || x > width || y < 0 || y > height) return false;
    const p = [x, y];
    for (let i = 0; i < pts.length; i++) {
      if (dist2(p, pts[i]) < minD2) return false;
    }
    pts.push(p);
    return true;
  };

  // Ensure manual points respect minDist by only adding those that fit.
  if (pts.length) {
    const kept = [];
    for (const p of pts) {
      let ok = true;
      for (const q of kept) {
        if (dist2(p, q) < minD2) {
          ok = false;
          break;
        }
      }
      if (ok) kept.push(p);
    }
    pts.length = 0;
    pts.push(...kept);
  }

  for (let attempts = 0; attempts < maxAttempts && pts.length < count; attempts++) {
    const x = rand() * width;
    const y = rand() * height;
    if (rand() > acceptWeight(x, y)) continue;
    tryAdd(x, y);
  }

  return pts.slice(0, count);
}

registerVisual("voronoiFluid", {
  title: "Voronoi (Fluid)",
  description: "Interactive Voronoi diagram. Click to add points; tweak density + min spacing.",
  params: [
    {
      key: "pointCount",
      label: "number of points",
      type: "number",
      default: 60,
      category: "Points",
      min: 2,
      max: 500,
      step: 1,
    },
    {
      key: "density",
      label: "randomness density",
      type: "number",
      default: 0.55,
      category: "Points",
      min: 0,
      max: 1,
      step: 0.01,
      description: "0 = uniform; 1 = strongly noise-biased clustering.",
    },
    {
      key: "minDist",
      label: "minimum width between points",
      type: "number",
      default: 14,
      category: "Points",
      min: 0,
      max: 200,
      step: 1,
    },
    {
      key: "seed",
      type: "number",
      default: (() => {
        // static default: random integer in [0, 999999]
        return Math.floor(Math.random() * 1_000_000);
      })(),
      category: "Points",
      min: 0,
      max: 999999,
      step: 1,
      description: "Deterministic seed for random generation.",
    },
    {
      key: "noiseScale",
      label: "density noise scale",
      type: "number",
      default: 120,
      category: "Points",
      min: 8,
      max: 600,
      step: 1,
    },
    {
      key: "strokeWidth",
      type: "number",
      default: 0,
      category: "Styling",
      min: 0,
      max: 6,
      step: 0.1,
    },
    {
      key: "strokeOpacity",
      type: "number",
      default: 0.8,
      category: "Styling",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "fillOpacity",
      type: "number",
      default: 0.7,
      category: "Styling",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "palette",
      type: "select",
      default: "turbo",
      category: "Styling",
      options: ["turbo", "viridis", "plasma", "magma", "cividis", "spectral", "greys"],
    },
    {
      key: "showSites",
      type: "boolean",
      default: true,
      category: "Styling",
      description: "Render the point sites as dots.",
    },
    {
      type: "button",
      key: "regenerate",
      label: "Regenerate (clear manual points)",
      category: "Actions",
      onClick: ({ state }) => {
        state.points = state.points && typeof state.points === "object" ? state.points : {};
        state.points.manual = [];
      },
    },
  ],

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

    const ensureState = () => {
      if (!state.points || typeof state.points !== "object") state.points = {};
      if (!Array.isArray(state.points.manual)) state.points.manual = [];
    };

    if (state.seed == null) {
      const min = 0;
      const max = 999999;
      state.seed = Math.floor(min + Math.random() * (max - min + 1));
    }

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      return { width, height };
    };

    const paletteFn = (name) => {
      const d3c = window.d3;
      if (!d3c) return null;
      switch (String(name || "").toLowerCase()) {
        case "viridis": return d3c.interpolateViridis;
        case "plasma": return d3c.interpolatePlasma;
        case "magma": return d3c.interpolateMagma;
        case "cividis": return d3c.interpolateCividis;
        case "spectral": return d3c.interpolateSpectral;
        case "greys": return d3c.interpolateGreys;
        case "turbo":
        default:
          return d3c.interpolateTurbo;
      }
    };

    const render = () => {
      ensureState();
      const d3c = window.d3;
      if (!d3c?.Delaunay) return;

      const { width, height } = size();
      lastSize = { width, height };
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      const count = Math.max(2, Math.floor(clampNum(state.pointCount, 60)));
      const pts = generatePoints({
        width,
        height,
        count,
        minDist: clampNum(state.minDist, 0),
        density: clamp01(state.density),
        seed: Math.floor(clampNum(state.seed, 1)),
        noiseScale: clampNum(state.noiseScale, 120),
        manualPoints: state.points.manual,
      });

      const delaunay = d3c.Delaunay.from(pts);
      const vor = delaunay.voronoi([0, 0, width, height]);

      const strokeWidth = clampNum(state.strokeWidth, 1);
      const strokeOpacity = clamp01(state.strokeOpacity);
      const fillOpacity = clamp01(state.fillOpacity);
      const interp = paletteFn(state.palette);

      gCells.innerHTML = "";
      for (let i = 0; i < pts.length; i++) {
        const pathStr = vor.renderCell(i);
        if (!pathStr) continue;

        const p = document.createElementNS(svg.namespaceURI, "path");
        p.setAttribute("d", pathStr);
        p.setAttribute("fill", interp ? interp(i / Math.max(1, pts.length - 1)) : "rgba(255,255,255,0.15)");
        p.setAttribute("fill-opacity", String(fillOpacity));
        p.setAttribute("stroke", "currentColor");
        p.setAttribute("stroke-opacity", String(strokeOpacity));
        p.setAttribute("stroke-width", String(strokeWidth));
        gCells.appendChild(p);
      }

      gSites.innerHTML = "";
      if (state.showSites) {
        for (const [x, y] of pts) {
          const c = document.createElementNS(svg.namespaceURI, "circle");
          c.setAttribute("cx", String(x));
          c.setAttribute("cy", String(y));
          c.setAttribute("r", "2");
          c.setAttribute("fill", "currentColor");
          c.setAttribute("opacity", "0.8");
          gSites.appendChild(c);
        }
      }
    };

    const toSvgPoint = (evt) => {
      const rect = svg.getBoundingClientRect();
      const x01 = (evt.clientX - rect.left) / Math.max(1, rect.width);
      const y01 = (evt.clientY - rect.top) / Math.max(1, rect.height);
      return [x01 * lastSize.width, y01 * lastSize.height];
    };

    svg.addEventListener("pointerdown", (evt) => {
      ensureState();
      const [x, y] = toSvgPoint(evt);
      state.points.manual.push([x, y]);
      render();
    });

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
