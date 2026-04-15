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

registerVisual("boysSurfaceModel", {
  title: "Boys Surface Model",
  description: "Twisted ribbon immersions inspired by the projective plane.",
  params: [
    {
      key: "lobes",
      type: "number",
      default: 3,
      min: 1,
      max: 6,
      step: 1,
      category: "Shape",
    },
    {
      key: "twist",
      type: "number",
      default: 1.4,
      min: 0,
      max: 4,
      step: 0.05,
      category: "Shape",
    },
    {
      key: "ribbonWidth",
      type: "number",
      default: 10,
      min: 2,
      max: 30,
      step: 1,
      category: "Styling",
    },
    {
      key: "detail",
      type: "number",
      default: 1200,
      min: 300,
      max: 2400,
      step: 100,
      category: "Styling",
    },
    {
      key: "layers",
      type: "number",
      default: 2,
      min: 1,
      max: 4,
      step: 1,
      category: "Shape",
    },
    {
      key: "layerSpread",
      type: "number",
      default: 0.4,
      min: 0,
      max: 1,
      step: 0.05,
      category: "Shape",
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

      const lobes = clampInt(state.lobes, 3, 1, 8);
      const twist = clampNum(state.twist, 1.4);
      const ribbonWidth = clampNum(state.ribbonWidth, 10);
      const detail = clampInt(state.detail, 1200, 300, 3000);
      const layers = clampInt(state.layers, 2, 1, 6);
      const layerSpread = clampNum(state.layerSpread, 0.4);
      const fitMode = String(state.fitMode || "contain");
      const padding = clampNum(state.padding, 36);
      const fit = getFitBox(width, height, padding, fitMode);
      const baseScale = Math.min(fit.scaleW, fit.scaleH);
      const scaleX = fit.scaleW / Math.max(1, baseScale);
      const scaleY = fit.scaleH / Math.max(1, baseScale);
      const radius = baseScale * 0.26;
      const cx = fit.cx;
      const cy = fit.cy;

      const maxT = Math.PI * 2 * lobes;
      const chunk = 60;

      for (let l = 0; l < layers; l++) {
        const lt = layers === 1 ? 0 : l / (layers - 1);
        const layerPhase = lt * Math.PI * 2 * layerSpread;
        const layerTwist = twist + (lt - 0.5) * layerSpread * 2;

        const points = [];
        for (let i = 0; i <= detail; i++) {
          const t = (i / detail) * maxT;
          const wave = 0.35 * Math.cos(2 * t + layerTwist + layerPhase);
          const x = Math.cos(t + layerPhase) * (1 + 0.2 * Math.cos(lobes * t)) + wave;
          const y = Math.sin(t - layerPhase) * (1 + 0.2 * Math.sin(lobes * t)) - wave * 0.5;
          const z = 0.6 * Math.sin(t + layerTwist) + 0.3 * Math.cos(2 * t + layerPhase);
          points.push({
            x: cx + x * radius * scaleX,
            y: cy + y * radius * scaleY,
            z,
          });
        }

        for (let i = 0; i < points.length - 1; i += chunk) {
          const slice = points.slice(i, i + chunk + 1);
          let d = "";
          for (let s = 0; s < slice.length; s++) {
            const p = slice[s];
            d += s === 0
              ? `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
              : ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
          }
          const avgZ = slice.reduce((acc, p) => acc + p.z, 0) / slice.length;
          const hue = 330 - avgZ * 40 + lt * 40;
          const path = document.createElementNS(svg.namespaceURI, "path");
          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", `hsl(${hue.toFixed(1)}, 60%, 55%)`);
          path.setAttribute("stroke-width", (ribbonWidth + avgZ * 2).toFixed(2));
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          path.setAttribute("stroke-opacity", "0.8");
          gCells.appendChild(path);
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
