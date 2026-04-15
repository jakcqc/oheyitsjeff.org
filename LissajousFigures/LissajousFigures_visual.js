import { registerVisual } from "../helper/visualHelp.js";

function clampNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, fallback, min, max) {
  const n = Math.floor(clampNum(value, fallback));
  return Math.max(min, Math.min(max, n));
}

registerVisual("lissajousFigures", {
  title: "Lissajous Figures",
  description: "Layered parametric curves that weave into flower-like loops.",
  params: [
    {
      key: "curveCount",
      type: "number",
      default: 6,
      min: 1,
      max: 20,
      step: 1,
      category: "Curves",
    },
    {
      key: "freqA",
      label: "frequency a",
      type: "number",
      default: 3,
      min: 1,
      max: 12,
      step: 1,
      category: "Curves",
    },
    {
      key: "freqB",
      label: "frequency b",
      type: "number",
      default: 2,
      min: 1,
      max: 12,
      step: 1,
      category: "Curves",
    },
    {
      key: "phase",
      type: "number",
      default: 0.6,
      min: 0,
      max: 6.283,
      step: 0.01,
      category: "Curves",
    },
    {
      key: "samples",
      type: "number",
      default: 800,
      min: 100,
      max: 2000,
      step: 50,
      category: "Curves",
    },
    {
      key: "amplitude",
      type: "number",
      default: 0.42,
      min: 0.1,
      max: 0.9,
      step: 0.01,
      category: "Layout",
    },
    {
      key: "strokeWidth",
      type: "number",
      default: 2,
      min: 0.2,
      max: 8,
      step: 0.1,
      category: "Styling",
    },
    {
      key: "animate",
      type: "boolean",
      default: true,
      category: "Animation",
    },
    {
      key: "speed",
      type: "number",
      default: 0.6,
      min: 0.05,
      max: 2.5,
      step: 0.05,
      category: "Animation",
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
    let rafId = null;

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      return { width, height };
    };

    const draw = (timeSec) => {
      const { width, height } = size();
      lastSize = { width, height };
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      gCells.innerHTML = "";
      gSites.innerHTML = "";

      const count = clampInt(state.curveCount, 6, 1, 40);
      const freqA = clampNum(state.freqA, 3);
      const freqB = clampNum(state.freqB, 2);
      const phaseBase = clampNum(state.phase, 0);
      const samples = clampInt(state.samples, 800, 100, 3000);
      const amplitude = clampNum(state.amplitude, 0.4);
      const strokeWidth = clampNum(state.strokeWidth, 2);
      const radius = Math.min(width, height) * amplitude;
      const cx = width / 2;
      const cy = height / 2;
      const timePhase = phaseBase + timeSec * clampNum(state.speed, 0.4);

      for (let i = 0; i < count; i++) {
        const offset = (i / Math.max(1, count - 1)) * Math.PI * 2;
        let d = "";
        for (let s = 0; s <= samples; s++) {
          const t = (s / samples) * Math.PI * 2;
          const x = cx + Math.sin(freqA * t + timePhase + offset) * radius;
          const y = cy + Math.sin(freqB * t + offset * 0.6) * radius;
          d += s === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
        }
        const path = document.createElementNS(svg.namespaceURI, "path");
        const hue = 200 + (i / Math.max(1, count - 1)) * 120;
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", `hsl(${hue.toFixed(1)}, 70%, 55%)`);
        path.setAttribute("stroke-width", strokeWidth.toFixed(2));
        path.setAttribute("stroke-opacity", "0.85");
        gCells.appendChild(path);
      }
    };

    const animateFrame = (timestamp) => {
      if (!state.animate) {
        rafId = null;
        return;
      }
      draw(timestamp / 1000);
      rafId = requestAnimationFrame(animateFrame);
    };

    const render = () => {
      if (state.animate) {
        if (rafId == null) rafId = requestAnimationFrame(animateFrame);
      } else {
        if (rafId != null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        draw(0);
      }
    };

    const ro = new ResizeObserver(() => render());
    ro.observe(mountEl);

    render();
    return {
      render,
      destroy() {
        if (rafId != null) cancelAnimationFrame(rafId);
        ro.disconnect();
      },
    };
  },
});
