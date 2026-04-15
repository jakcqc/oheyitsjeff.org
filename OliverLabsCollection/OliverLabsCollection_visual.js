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

registerVisual("oliverLabsCollection", {
  title: "Oliver Labs Collection",
  description: "Procedural flow fields and algorithmic structures.",
  params: [
    {
      key: "paths",
      type: "number",
      default: 120,
      min: 20,
      max: 300,
      step: 10,
      category: "Flow",
    },
    {
      key: "steps",
      type: "number",
      default: 160,
      min: 40,
      max: 400,
      step: 10,
      category: "Flow",
    },
    {
      key: "fieldScale",
      type: "number",
      default: 0.006,
      min: 0.002,
      max: 0.02,
      step: 0.001,
      category: "Flow",
    },
    {
      key: "stepSize",
      type: "number",
      default: 6,
      min: 2,
      max: 16,
      step: 1,
      category: "Flow",
    },
    {
      key: "passes",
      type: "number",
      default: 2,
      min: 1,
      max: 4,
      step: 1,
      category: "Flow",
    },
    {
      key: "curl",
      type: "number",
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.05,
      category: "Flow",
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
      default: 1.2,
      min: 0.4,
      max: 3,
      step: 0.1,
      category: "Styling",
    },
    {
      key: "seed",
      type: "number",
      default: 19321,
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

    const render = () => {
      const { width, height } = size();
      lastSize = { width, height };
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      gCells.innerHTML = "";
      gSites.innerHTML = "";

      const rand = mulberry32(Math.floor(clampNum(state.seed, 1)));
      const paths = clampInt(state.paths, 120, 10, 500);
      const steps = clampInt(state.steps, 160, 20, 800);
      const fieldScale = clampNum(state.fieldScale, 0.006);
      const stepSize = clampNum(state.stepSize, 6);
      const passes = clampInt(state.passes, 2, 1, 6);
      const curl = clampNum(state.curl, 0.6);
      const fitMode = String(state.fitMode || "contain");
      const padding = clampNum(state.padding, 36);
      const strokeWidth = clampNum(state.strokeWidth, 1.2);

      const fit = getFitBox(width, height, padding, fitMode);
      const w = fit.scaleW;
      const h = fit.scaleH;
      const ox = fit.offsetX;
      const oy = fit.offsetY;
      const passPaths = Math.max(1, Math.floor(paths / passes));

      for (let p = 0; p < passes; p++) {
        const passSeed = p * 0.9;
        for (let i = 0; i < passPaths; i++) {
          let x = ox + rand() * w;
          let y = oy + rand() * h;
          let d = `M ${x.toFixed(2)} ${y.toFixed(2)}`;
          for (let s = 0; s < steps; s++) {
            const angle = Math.sin(x * fieldScale + (i + passSeed) * 0.02) +
              Math.cos(y * fieldScale - (i + passSeed) * 0.015) +
              curl * Math.sin((x + y) * fieldScale * 1.5 + p);
            x += Math.cos(angle) * stepSize;
            y += Math.sin(angle) * stepSize;
            if (x < ox || x > ox + w || y < oy || y > oy + h) break;
            d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
          }
          const hue = 30 + ((i + p * passPaths) / Math.max(1, paths - 1)) * 220;
          const path = document.createElementNS(svg.namespaceURI, "path");
          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", `hsl(${hue.toFixed(1)}, 55%, 50%)`);
          path.setAttribute("stroke-width", strokeWidth.toFixed(2));
          path.setAttribute("stroke-opacity", "0.7");
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
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
