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

registerVisual("lorenzAttractor", {
  title: "Lorenz Attractor",
  description: "Chaotic butterfly trajectories traced through phase space.",
  params: [
    {
      key: "sigma",
      type: "number",
      default: 10,
      min: 4,
      max: 20,
      step: 0.5,
      category: "System",
    },
    {
      key: "rho",
      type: "number",
      default: 28,
      min: 10,
      max: 40,
      step: 0.5,
      category: "System",
    },
    {
      key: "beta",
      type: "number",
      default: 2.666,
      min: 1,
      max: 4,
      step: 0.05,
      category: "System",
    },
    {
      key: "steps",
      type: "number",
      default: 4000,
      min: 500,
      max: 12000,
      step: 500,
      category: "System",
    },
    {
      key: "dt",
      type: "number",
      default: 0.008,
      min: 0.002,
      max: 0.02,
      step: 0.001,
      category: "System",
    },
    {
      key: "trailCount",
      type: "number",
      default: 3,
      min: 1,
      max: 8,
      step: 1,
      category: "System",
    },
    {
      key: "trailSpread",
      type: "number",
      default: 0.08,
      min: 0,
      max: 0.4,
      step: 0.01,
      category: "System",
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
      default: 32,
      min: 0,
      max: 200,
      step: 2,
      category: "Layout",
    },
    {
      key: "strokeWidth",
      type: "number",
      default: 1.4,
      min: 0.4,
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

      const sigma = clampNum(state.sigma, 10);
      const rho = clampNum(state.rho, 28);
      const beta = clampNum(state.beta, 2.666);
      const steps = clampInt(state.steps, 4000, 200, 20000);
      const dt = clampNum(state.dt, 0.008);
      const trailCount = clampInt(state.trailCount, 3, 1, 10);
      const trailSpread = clampNum(state.trailSpread, 0.08);
      const fitMode = String(state.fitMode || "contain");
      const padding = clampNum(state.padding, 32);
      const strokeWidth = clampNum(state.strokeWidth, 1.4);

      const trails = [];
      for (let t = 0; t < trailCount; t++) {
        let x = 0.1 + (t - (trailCount - 1) / 2) * trailSpread;
        let y = 0;
        let z = 0.02 * t;
        const points = [];
        for (let i = 0; i < steps; i++) {
          const dx = sigma * (y - x);
          const dy = x * (rho - z) - y;
          const dz = x * y - beta * z;
          x += dx * dt;
          y += dy * dt;
          z += dz * dt;
          points.push([x, z, y]);
        }
        trails.push(points);
      }

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (const trail of trails) {
        for (const p of trail) {
          minX = Math.min(minX, p[0]);
          maxX = Math.max(maxX, p[0]);
          minY = Math.min(minY, p[1]);
          maxY = Math.max(maxY, p[1]);
        }
      }

      const fit = getFitBox(width, height, padding, fitMode);
      let scaleX = fit.scaleW / (maxX - minX || 1);
      let scaleY = fit.scaleH / (maxY - minY || 1);
      if (fitMode === "contain") {
        const s = Math.min(scaleX, scaleY);
        scaleX = s;
        scaleY = s;
      } else if (fitMode === "cover") {
        const s = Math.max(scaleX, scaleY);
        scaleX = s;
        scaleY = s;
      }

      const segments = 8;
      for (let t = 0; t < trails.length; t++) {
        const points = trails[t];
        const segLen = Math.floor(points.length / segments);
        for (let s = 0; s < segments; s++) {
          const start = s * segLen;
          const end = s === segments - 1 ? points.length : (s + 1) * segLen;
          let d = "";
          for (let i = start; i < end; i++) {
            const p = points[i];
            const px = fit.offsetX + (p[0] - minX) * scaleX;
            const py = fit.offsetY + (p[1] - minY) * scaleY;
            d += i === start
              ? `M ${px.toFixed(2)} ${py.toFixed(2)}`
              : ` L ${px.toFixed(2)} ${py.toFixed(2)}`;
          }
          const hue = 180 + ((s + t) / Math.max(1, segments + trails.length - 2)) * 140;
          const path = document.createElementNS(svg.namespaceURI, "path");
          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", `hsl(${hue.toFixed(1)}, 60%, 55%)`);
          path.setAttribute("stroke-width", strokeWidth.toFixed(2));
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          path.setAttribute("stroke-opacity", "0.85");
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
