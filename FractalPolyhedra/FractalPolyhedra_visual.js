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

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = {
  crystal: ["#dfe7fd", "#a3cef1", "#6096ba", "#274c77"],
  ember: ["#fde2e4", "#f9c6c9", "#f28482", "#6d6875"],
  mineral: ["#eef4f3", "#bcd4de", "#84a9ac", "#3b6978"],
};

registerVisual("fractalPolyhedra", {
  title: "Fractal Polyhedra",
  description: "Recursive polyhedral forms with crystalline self-similarity.",
  params: [
    {
      key: "depth",
      type: "number",
      default: 3,
      min: 1,
      max: 5,
      step: 1,
      category: "Structure",
    },
    {
      key: "size",
      type: "number",
      default: 0.22,
      min: 0.1,
      max: 0.4,
      step: 0.01,
      category: "Structure",
    },
    {
      key: "spread",
      type: "number",
      default: 0.72,
      min: 0.4,
      max: 1.2,
      step: 0.01,
      category: "Structure",
    },
    {
      key: "branchCount",
      type: "number",
      default: 3,
      min: 2,
      max: 6,
      step: 1,
      category: "Structure",
    },
    {
      key: "spin",
      type: "number",
      default: 0.4,
      min: 0,
      max: 2,
      step: 0.05,
      category: "Structure",
    },
    {
      key: "fitMode",
      type: "select",
      default: "contain",
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
      key: "palette",
      type: "select",
      default: "crystal",
      options: ["crystal", "ember", "mineral"],
      category: "Styling",
    },
    {
      key: "seed",
      type: "number",
      default: 55133,
      min: 0,
      max: 999999,
      step: 1,
      category: "Styling",
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

    if (state.seed == null) {
      state.seed = Math.floor(Math.random() * 1000000);
    }

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      return { width, height };
    };

    const drawPoly = (points, fill, opacity) => {
      const poly = document.createElementNS(svg.namespaceURI, "polygon");
      poly.setAttribute("points", points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" "));
      poly.setAttribute("fill", fill);
      poly.setAttribute("opacity", opacity.toFixed(2));
      gCells.appendChild(poly);
    };

    const render = () => {
      const { width, height } = size();
      lastSize = { width, height };
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      gCells.innerHTML = "";
      gSites.innerHTML = "";

      const rand = mulberry32(Math.floor(clampNum(state.seed, 1)));
      const depth = clampInt(state.depth, 3, 1, 6);
      const palette = PALETTES[state.palette] || PALETTES.crystal;
      const spread = clampNum(state.spread, 0.72);
      const branchCount = clampInt(state.branchCount, 3, 2, 7);
      const spin = clampNum(state.spin, 0.4);
      const fitMode = String(state.fitMode || "contain");
      const padding = clampNum(state.padding, 36);
      const fit = getFitBox(width, height, padding, fitMode);
      const baseScale = Math.min(fit.scaleW, fit.scaleH);
      const scaleX = fit.scaleW / Math.max(1, baseScale);
      const scaleY = fit.scaleH / Math.max(1, baseScale);
      const baseSize = baseScale * clampNum(state.size, 0.22);
      const sx = scaleX;
      const sy = scaleY;

      const drawCube = (cx, cy, size, level) => {
        const s = size;
        const pt = (dx, dy) => [cx + dx * sx, cy + dy * sy];
        const top = [
          pt(0, -s),
          pt(s, -s * 0.5),
          pt(0, 0),
          pt(-s, -s * 0.5),
        ];
        const left = [
          pt(-s, -s * 0.5),
          pt(0, 0),
          pt(0, s),
          pt(-s, s * 0.5),
        ];
        const right = [
          pt(s, -s * 0.5),
          pt(s, s * 0.5),
          pt(0, s),
          pt(0, 0),
        ];

        const shade = (idx) => palette[idx % palette.length];
        const opacity = 0.85 - level * 0.08;
        drawPoly(top, shade(0), opacity);
        drawPoly(left, shade(2), opacity * 0.95);
        drawPoly(right, shade(3), opacity * 0.9);

        if (level <= 0) return;
        const nextSize = s * 0.55;
        const jitter = s * 0.12;
        const ring = s * spread;
        for (let i = 0; i < branchCount; i++) {
          const angle = (i / branchCount) * Math.PI * 2 + spin * (depth - level + 1);
          const nx = cx + Math.cos(angle) * ring * sx;
          const ny = cy + Math.sin(angle) * ring * 0.6 * sy;
          const jx = nx + (rand() - 0.5) * jitter * sx;
          const jy = ny + (rand() - 0.5) * jitter * sy;
          drawCube(jx, jy, nextSize, level - 1);
        }
      };

      drawCube(fit.cx, fit.cy, baseSize, depth);
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
