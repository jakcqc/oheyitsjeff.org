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

const PALETTE = ["#f5f3ef", "#cdb4db", "#ffc8dd", "#ffafcc", "#9d4edd", "#4a4e69"];

registerVisual("herwigHauserClassicCollection", {
  title: "Herwig Hauser Classic Collection",
  description: "Algebraic curves with cusps, folds, and smooth manifolds.",
  params: [
    {
      key: "layers",
      type: "number",
      default: 5,
      min: 2,
      max: 10,
      step: 1,
      category: "Structure",
    },
    {
      key: "petals",
      type: "number",
      default: 6,
      min: 3,
      max: 12,
      step: 1,
      category: "Structure",
    },
    {
      key: "warp",
      type: "number",
      default: 0.35,
      min: 0.1,
      max: 0.9,
      step: 0.01,
      category: "Structure",
    },
    {
      key: "twist",
      type: "number",
      default: 0.35,
      min: 0,
      max: 1.5,
      step: 0.05,
      category: "Structure",
    },
    {
      key: "detail",
      type: "number",
      default: 360,
      min: 180,
      max: 900,
      step: 30,
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
      key: "fillOpacity",
      type: "number",
      default: 0.55,
      min: 0.1,
      max: 0.9,
      step: 0.01,
      category: "Styling",
    },
    {
      key: "strokeWidth",
      type: "number",
      default: 1.4,
      min: 0.2,
      max: 4,
      step: 0.1,
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

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      return { width, height };
    };

    const render = () => {
      const { width, height } = size();
      lastSize = { width, height };
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      gCells.innerHTML = "";
      gSites.innerHTML = "";

      const layers = clampInt(state.layers, 5, 2, 12);
      const petals = clampInt(state.petals, 6, 3, 16);
      const warp = clampNum(state.warp, 0.35);
      const twist = clampNum(state.twist, 0.35);
      const detail = clampInt(state.detail, 360, 120, 1200);
      const fitMode = String(state.fitMode || "contain");
      const padding = clampNum(state.padding, 36);
      const fillOpacity = clampNum(state.fillOpacity, 0.55);
      const strokeWidth = clampNum(state.strokeWidth, 1.4);
      const fit = getFitBox(width, height, padding, fitMode);
      const baseScale = Math.min(fit.scaleW, fit.scaleH);
      const scaleX = fit.scaleW / Math.max(1, baseScale);
      const scaleY = fit.scaleH / Math.max(1, baseScale);
      const radius = baseScale * 0.32;
      const cx = fit.cx;
      const cy = fit.cy;

      for (let l = 0; l < layers; l++) {
        const t = layers === 1 ? 0 : l / (layers - 1);
        const rScale = radius * (0.35 + t * 0.65);
        const phase = t * Math.PI * 2 * (0.3 + twist);
        const k = petals + l % 3;
        let d = "";
        for (let i = 0; i <= detail; i++) {
          const a = (i / detail) * Math.PI * 2 + twist * t * Math.PI * 2;
          const cusp = Math.cos(k * a + phase);
          const fold = Math.sin((k + 1) * a - phase);
          const r = rScale * (0.72 + warp * 0.4 * cusp + warp * 0.2 * fold);
          const x = cx + Math.cos(a) * r * scaleX;
          const y = cy + Math.sin(a) * r * scaleY;
          d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
        }
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", d + " Z");
        path.setAttribute("fill", PALETTE[(l + 1) % PALETTE.length]);
        path.setAttribute("fill-opacity", fillOpacity.toFixed(2));
        path.setAttribute("stroke", PALETTE[(l + 3) % PALETTE.length]);
        path.setAttribute("stroke-width", strokeWidth.toFixed(2));
        path.setAttribute("stroke-opacity", "0.5");
        gCells.appendChild(path);
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
