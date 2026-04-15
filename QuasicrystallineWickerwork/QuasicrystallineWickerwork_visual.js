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

const PALETTE = ["#f4d35e", "#ee964b", "#0d3b66", "#faf0ca", "#4f6d7a"];

registerVisual("quasicrystallineWickerwork", {
  title: "Quasicrystalline Wickerwork",
  description: "Aperiodic lattice strands woven with golden-angle symmetry.",
  params: [
    {
      key: "strands",
      type: "number",
      default: 42,
      min: 8,
      max: 120,
      step: 2,
      category: "Structure",
    },
    {
      key: "rings",
      type: "number",
      default: 18,
      min: 6,
      max: 40,
      step: 1,
      category: "Structure",
    },
    {
      key: "twist",
      type: "number",
      default: 0.18,
      min: 0,
      max: 0.6,
      step: 0.01,
      category: "Structure",
    },
    {
      key: "radialWarp",
      type: "number",
      default: 0.25,
      min: 0,
      max: 0.8,
      step: 0.01,
      category: "Structure",
    },
    {
      key: "weftCount",
      type: "number",
      default: 6,
      min: 0,
      max: 24,
      step: 1,
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
      key: "strokeWidth",
      type: "number",
      default: 2.2,
      min: 0.6,
      max: 6,
      step: 0.1,
      category: "Styling",
    },
    {
      key: "seed",
      type: "number",
      default: 71139,
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

    const renderStrand = (points, color, width) => {
      const path = document.createElementNS(svg.namespaceURI, "path");
      let d = "";
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        d += i === 0
          ? `M ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
          : ` L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
      }
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", width.toFixed(2));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-opacity", "0.85");
      gCells.appendChild(path);
    };

    const render = () => {
      const { width, height } = size();
      lastSize = { width, height };
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      gCells.innerHTML = "";
      gSites.innerHTML = "";

      const rand = mulberry32(Math.floor(clampNum(state.seed, 1)));
      const strands = clampInt(state.strands, 42, 6, 160);
      const rings = clampInt(state.rings, 18, 4, 60);
      const twist = clampNum(state.twist, 0.18);
      const radialWarp = clampNum(state.radialWarp, 0.25);
      const weftCount = clampInt(state.weftCount, 6, 0, 40);
      const fitMode = String(state.fitMode || "contain");
      const padding = clampNum(state.padding, 36);
      const strokeWidth = clampNum(state.strokeWidth, 2.2);
      const golden = Math.PI * (3 - Math.sqrt(5));
      const fit = getFitBox(width, height, padding, fitMode);
      const cx = fit.cx;
      const cy = fit.cy;
      const baseScale = Math.min(fit.scaleW, fit.scaleH);
      const scaleX = fit.scaleW / Math.max(1, baseScale);
      const scaleY = fit.scaleH / Math.max(1, baseScale);
      const maxR = baseScale * 0.48;

      for (let i = 0; i < strands; i++) {
        const angle = i * golden;
        const points = [];
        for (let r = 0; r <= rings; r++) {
          const t = r / rings;
          const radius = t * maxR * (1 + radialWarp * Math.sin(t * Math.PI * 2 + i * 0.3));
          const jitter = (rand() - 0.5) * 0.04;
          const offset = Math.sin(t * Math.PI * 2 + i * 0.2) * twist + jitter;
          const a = angle + offset;
          points.push([
            cx + Math.cos(a) * radius * scaleX,
            cy + Math.sin(a) * radius * scaleY,
          ]);
        }
        const color = PALETTE[i % PALETTE.length];
        renderStrand(points, color, strokeWidth);
      }

      const crossCount = Math.max(weftCount, 0);
      for (let j = 0; j < crossCount; j++) {
        const angle = j * (Math.PI * 2 / Math.max(1, crossCount)) + Math.PI / 6;
        const points = [];
        for (let r = 0; r <= rings; r++) {
          const t = r / rings;
          const radius = t * maxR * (1 + radialWarp * Math.cos(t * Math.PI * 2 + j * 0.4));
          const offset = Math.cos(t * Math.PI * 3 + j) * twist * 0.6;
          const a = angle + offset;
          points.push([
            cx + Math.cos(a) * radius * scaleX,
            cy + Math.sin(a) * radius * scaleY,
          ]);
        }
        renderStrand(points, "#1f1f1f", strokeWidth * 0.5);
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
