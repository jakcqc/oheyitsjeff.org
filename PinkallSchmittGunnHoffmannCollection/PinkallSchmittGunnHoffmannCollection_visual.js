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

registerVisual("pinkallSchmittGunnHoffmannCollection", {
  title: "Pinkall, Schmitt, Gunn, Hoffmann Collection",
  description: "Mesh-based curvature and surface parametrization studies.",
  params: [
    {
      key: "grid",
      type: "number",
      default: 28,
      min: 8,
      max: 60,
      step: 2,
      category: "Surface",
    },
    {
      key: "frequency",
      type: "number",
      default: 2.6,
      min: 0.5,
      max: 5,
      step: 0.1,
      category: "Surface",
    },
    {
      key: "amplitude",
      type: "number",
      default: 0.35,
      min: 0.1,
      max: 0.8,
      step: 0.01,
      category: "Surface",
    },
    {
      key: "depth",
      type: "number",
      default: 120,
      min: 20,
      max: 200,
      step: 5,
      category: "Surface",
    },
    {
      key: "warp",
      type: "number",
      default: 0.2,
      min: 0,
      max: 0.8,
      step: 0.02,
      category: "Surface",
    },
    {
      key: "tilt",
      type: "number",
      default: 0.25,
      min: 0,
      max: 1,
      step: 0.05,
      category: "Surface",
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
      default: 1,
      min: 0.3,
      max: 3,
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

    const project = (x, y, z, cx, cy, tilt) => {
      const tiltX = 0.6 + tilt * 0.5;
      const tiltY = 0.3 + tilt * 0.35;
      const px = cx + (x - y) * tiltX;
      const py = cy + (x + y) * tiltY - z;
      return [px, py];
    };

    const render = () => {
      const { width, height } = size();
      lastSize = { width, height };
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      gCells.innerHTML = "";
      gSites.innerHTML = "";

      const grid = clampInt(state.grid, 28, 6, 80);
      const freq = clampNum(state.frequency, 2.6);
      const amplitude = clampNum(state.amplitude, 0.35);
      const depth = clampNum(state.depth, 120);
      const warp = clampNum(state.warp, 0.2);
      const tilt = clampNum(state.tilt, 0.25);
      const fitMode = String(state.fitMode || "contain");
      const padding = clampNum(state.padding, 32);
      const strokeWidth = clampNum(state.strokeWidth, 1);
      const fit = getFitBox(width, height, padding, fitMode);
      const cx = fit.cx;
      const cy = fit.cy + fit.scaleH * 0.05;
      const baseScale = Math.min(fit.scaleW, fit.scaleH);
      const scaleX = fit.scaleW / Math.max(1, baseScale);
      const scaleY = fit.scaleH / Math.max(1, baseScale);
      const scale = baseScale * 0.36;

      const points = [];
      for (let j = 0; j <= grid; j++) {
        const v = j / grid - 0.5;
        const row = [];
        for (let i = 0; i <= grid; i++) {
          const u = i / grid - 0.5;
          const x = u * scale * scaleX;
          const y = v * scale * scaleY;
          const baseZ = Math.sin(u * Math.PI * 2 * freq) *
            Math.cos(v * Math.PI * 2 * freq) * amplitude * depth;
          const warpZ = Math.sin((u * u + v * v) * Math.PI * 2 * freq) * warp * depth * 0.5;
          row.push(project(x, y, baseZ + warpZ, cx, cy, tilt));
        }
        points.push(row);
      }

      const drawLine = (pts, hue) => {
        let d = "";
        for (let i = 0; i < pts.length; i++) {
          d += i === 0
            ? `M ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`
            : ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
        }
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", `hsl(${hue.toFixed(1)}, 40%, 45%)`);
        path.setAttribute("stroke-width", strokeWidth.toFixed(2));
        path.setAttribute("stroke-opacity", "0.8");
        gCells.appendChild(path);
      };

      for (let j = 0; j <= grid; j++) {
        const hue = 190 + (j / grid) * 80;
        drawLine(points[j], hue);
      }
      for (let i = 0; i <= grid; i++) {
        const column = [];
        for (let j = 0; j <= grid; j++) {
          column.push(points[j][i]);
        }
        const hue = 240 - (i / grid) * 80;
        drawLine(column, hue);
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
