// life_visual.js
import { registerVisual,runVisualApp } from "../helper/visualHelp.js";

registerVisual("gameOfLifeSVG", {
  title: "Game of Life (SVG)",
  description: "Clickable SVG grid + 3 rule modes: classic, dense neighborhood, color replication.",

  params: [
  {
    key: "cellPx",
    type: "number",
    default: 8,
    category: "Grid",
    min: 1,
    max: 30,
    step: 1,
    description: "Size of each cell in pixels. Larger values make the grid coarser and easier to see."
  },
  {
    key: "tickMs",
    type: "number",
    default: 120,
    category: "Simulation",
    min: 16,
    max: 1000,
    step: 1,
    description: "Time between simulation steps in milliseconds. Lower values run faster."
  },
  {
    key: "running",
    type: "boolean",
    default: true,
    category: "Simulation",
    description: "Start or pause the simulation."
  },
  {
    key: "wrapEdges",
    type: "boolean",
    default: false,
    category: "Grid",
    description: "If enabled, the grid wraps around at the edges (toroidal space)."
  },
  {
    key: "randomFill",
    type: "number",
    default: 0.00,
    category: "Simulation",
    min: 0,
    max: 1,
    step: 0.01,
    description: "Initial probability that a cell starts alive when the grid is randomized. Alt/option + click to trigger."
  },

  {
    key: "mode",
    type: "select",
    default: "dense",
    category: "Rules",
    options: ["classic", "dense", "protofield", "color"],
    description: "Rule set to use: classic Life, dense high-neighbor rules, protofield operator, or color-based behavior."
  },

  // Dense mode tuning
  {
    key: "denseRadius",
    type: "number",
    default: 2,
    category: "Dense Rules",
    min: 1,
    max: 3,
    step: 1,
    description: "Neighborhood radius for dense mode. Radius 2 includes 24 neighbors."
  },
  {
    key: "denseBirth",
    type: "number",
    default: 0,
    category: "Dense Rules",
    min: 0,
    max: 48,
    step: 1,
    description: "Exact neighbor count required for a dead cell to become alive in dense mode."
  },
  {
    key: "denseSurviveMin",
    type: "number",
    default: 18,
    category: "Dense Rules",
    min: 0,
    max: 48,
    step: 1,
    description: "Minimum neighbors required for a live cell to survive in dense mode."
  },
  {
    key: "denseSurviveMax",
    type: "number",
    default: 24,
    category: "Dense Rules",
    min: 0,
    max: 48,
    step: 1,
    description: "Maximum neighbors allowed for a live cell to survive in dense mode."
  },

  // Protofield mode
  {
    key: "protoAlpha",
    type: "number",
    default: 0.7,
    category: "Protofield",
    min: -2,
    max: 2,
    step: 0.05,
    description: "Self-influence factor for the protofield update."
  },
  {
    key: "protoBeta",
    type: "number",
    default: 0.05,
    category: "Protofield",
    min: -2,
    max: 2,
    step: 0.05,
    description: "Neighbor influence factor for the protofield update."
  },
  {
    key: "protoThreshMin",
    type: "number",
    default: 1.0,
    category: "Protofield",
    min: -10,
    max: 10,
    step: 0.1,
    description: "Lower threshold for projecting protofield values to alive."
  },
  {
    key: "protoThreshMax",
    type: "number",
    default: 2.6,
    category: "Protofield",
    min: -10,
    max: 10,
    step: 0.1,
    description: "Upper threshold for projecting protofield values to alive."
  },
  {
    key: "protoNoise",
    type: "number",
    default: 1.3,
    category: "Protofield",
    min: 0,
    max: 5,
    step: 0.1,
    description: "Random jitter added when seeding the protofield."
  },

  // Color mode
  {
    key: "paintColor",
    type: "color",
    default: "#00c2ff",
    category: "Color",
    description: "Base color used when painting or spawning cells in color mode."
  },
  {
    key: "shiftColorOnSurvive",
    type: "boolean",
    default: false,
    category: "Color",
    description: "If enabled, surviving cells gradually shift hue over time."
  },
  {
    key: "strokeColor",
    type: "color",
    default: "#000010",
    category: "Color",
    description: "What color for the stroke of the squares"
  }
],

  create({ mountEl }, state) {
    const root = d3.select(mountEl);

    const svg = root.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("display", "block")
      .style("background", "white")
      .style("touch-action", "none");

    const g = svg.append("g");

    let cols = 0, rows = 0, n = 0;
    let alive = null;         // Uint8Array
    let color = null;         // Uint32Array (0xRRGGBB)
    let proto = null;         // Float32Array
    let rects = null;         // d3 selection
    let rafId = null;
    let lastTick = 0;

    let prev = {};

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function hexToRgbInt(hex) {
      const h = (hex || "#000000").replace("#", "").trim();
      const s = h.length === 3 ? h.split("").map(c => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
      return parseInt(s, 16) >>> 0;
    }

    function rgbIntToHex(v) {
      return "#" + (v >>> 0).toString(16).padStart(6, "0");
    }

    function idx(x, y) { return y * cols + x; }

    function wrap(v, m) {
      v %= m;
      return v < 0 ? v + m : v;
    }

    function inBounds(x, y) { return x >= 0 && x < cols && y >= 0 && y < rows; }

    function getAlive(x, y) {
      if (state.wrapEdges) return alive[idx(wrap(x, cols), wrap(y, rows))] === 1;
      if (!inBounds(x, y)) return false;
      return alive[idx(x, y)] === 1;
    }

    function getColor(x, y) {
      if (state.wrapEdges) return color[idx(wrap(x, cols), wrap(y, rows))] >>> 0;
      if (!inBounds(x, y)) return 0;
      return color[idx(x, y)] >>> 0;
    }

    function getProto(x, y) {
      if (state.wrapEdges) return proto[idx(wrap(x, cols), wrap(y, rows))] || 0;
      if (!inBounds(x, y)) return 0;
      return proto[idx(x, y)] || 0;
    }

    function countNeighborsMoore(x, y) {
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (getAlive(x + dx, y + dy)) c++;
        }
      }
      return c;
    }

    function countNeighborsRadius(x, y, r) {
      let c = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (getAlive(x + dx, y + dy)) c++;
        }
      }
      return c;
    }

    function sumNeighborsRadius(x, y, r) {
      let s = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dy === 0) continue;
          s += getProto(x + dx, y + dy);
        }
      }
      return s;
    }

    function protoThresholds() {
      const lo = Math.min(state.protoThreshMin, state.protoThreshMax);
      const hi = Math.max(state.protoThreshMin, state.protoThreshMax);
      return { lo, hi };
    }

    function protoDeadValue() {
      const { lo } = protoThresholds();
      return lo - 1;
    }

    function protoAliveValue() {
      const { lo, hi } = protoThresholds();
      return (lo + hi) * 0.5;
    }

    function setProtoAt(i, isAlive) {
      proto[i] = isAlive ? protoAliveValue() : protoDeadValue();
    }

    function seedProtoFromAlive(noiseScale) {
      const noise = Math.max(0, noiseScale || 0);
      const aliveValue = protoAliveValue();
      const deadValue = protoDeadValue();
      for (let i = 0; i < n; i++) {
        const base = alive[i] ? aliveValue : deadValue;
        const jitter = noise ? (Math.random() * 2 - 1) * noise : 0;
        proto[i] = base + jitter;
      }
    }

    function projectAliveFromProto() {
      const { lo, hi } = protoThresholds();
      for (let i = 0; i < n; i++) {
        const v = proto[i] || 0;
        alive[i] = (v >= lo && v <= hi) ? 1 : 0;
      }
    }

    function majorityNeighborColor(x, y) {
      // Small neighborhood, keep it fast: up to 8 colors.
      const keys = [];
      const counts = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx, yy = y + dy;
          if (!getAlive(xx, yy)) continue;
          const col = getColor(xx, yy);
          let k = -1;
          for (let i = 0; i < keys.length; i++) if (keys[i] === col) { k = i; break; }
          if (k === -1) { keys.push(col); counts.push(1); }
          else counts[k]++;
        }
      }
      if (keys.length === 0) return hexToRgbInt(state.paintColor);
      let best = 0;
      for (let i = 1; i < keys.length; i++) if (counts[i] > counts[best]) best = i;
      return keys[best] >>> 0;
    }

    function randomize() {
      const p = clamp(state.randomFill, 0, 1);
      const paint = hexToRgbInt(state.paintColor);
      for (let i = 0; i < n; i++) {
        alive[i] = Math.random() < p ? 1 : 0;
        color[i] = paint;
      }
      if (proto) {
        const noise = state.mode === "protofield" ? state.protoNoise : 0;
        seedProtoFromAlive(noise);
        if (state.mode === "protofield") projectAliveFromProto();
      }
    }

    function clearAll() {
      alive.fill(0);
      color.fill(hexToRgbInt(state.paintColor));
      if (proto) {
        const deadValue = protoDeadValue();
        for (let i = 0; i < n; i++) proto[i] = deadValue;
      }
    }

    let lastSize = { width: 1, height: 1 };
    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      return { width, height };
    };

    function rebuildGrid() {
      const nextSize = size();
      lastSize = nextSize;
      const w = lastSize.width;
      const h = lastSize.height;

      cols = Math.max(10, Math.floor(w / state.cellPx));
      rows = Math.max(10, Math.floor(h / state.cellPx));
      n = cols * rows;

      svg.attr("viewBox", `0 0 ${w} ${h}`);

      alive = new Uint8Array(n);
      color = new Uint32Array(n);
      proto = new Float32Array(n);

      g.selectAll("*").remove();

      const data = d3.range(n).map(i => ({
        i,
        x: (i % cols),
        y: Math.floor(i / cols),
      }));

      rects = g.selectAll("rect")
        .data(data, d => d.i)
        .join("rect")
        .attr("x", d => d.x * state.cellPx)
        .attr("y", d => d.y * state.cellPx)
        .attr("width", state.cellPx)
        .attr("height", state.cellPx)
        .attr("stroke", state.strokeColor)
        .attr("shape-rendering", "crispEdges");

      if (state.mode === "protofield") {
        seedProtoFromAlive(state.protoNoise);
        projectAliveFromProto();
      }
      draw();
    }

    function draw() {
      const isColor = state.mode === "color";
      rects
        .attr("fill", d => {
          if (!alive[d.i]) return "#ffffff";
          return isColor ? rgbIntToHex(color[d.i]) : "#111111";
        });
    }

    function step() {
      const nextAlive = new Uint8Array(n);
      const nextColor = new Uint32Array(n);

      const paint = hexToRgbInt(state.paintColor);

      if (state.mode === "classic") {
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const i = idx(x, y);
            const nn = countNeighborsMoore(x, y);
            const a = alive[i] === 1;

            const born = (!a && nn === 3);
            const surv = (a && (nn === 2 || nn === 3));

            nextAlive[i] = (born || surv) ? 1 : 0;
            nextColor[i] = paint;
          }
        }
      } else if (state.mode === "dense") {
        const r = clamp(state.denseRadius, 1, 3);
        const b = clamp(state.denseBirth, 0, 48);
        const sMin = clamp(state.denseSurviveMin, 0, 48);
        const sMax = clamp(state.denseSurviveMax, 0, 48);

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const i = idx(x, y);
            const nn = countNeighborsRadius(x, y, r);
            const a = alive[i] === 1;

            const born = (!a && nn === b);
            const surv = (a && nn >= Math.min(sMin, sMax) && nn <= Math.max(sMin, sMax));

            nextAlive[i] = (born || surv) ? 1 : 0;
            nextColor[i] = paint;
          }
        }
      } else if (state.mode === "protofield") {
        const r = clamp(state.denseRadius, 1, 3);
        const alpha = state.protoAlpha;
        const beta = state.protoBeta;
        const { lo, hi } = protoThresholds();
        const nextProto = new Float32Array(n);

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const i = idx(x, y);
            const sum = sumNeighborsRadius(x, y, r);
            const v = (alpha * (proto[i] || 0)) + (beta * sum);
            nextProto[i] = v;
            nextAlive[i] = (v >= lo && v <= hi) ? 1 : 0;
            nextColor[i] = paint;
          }
        }

        proto = nextProto;
      } else { // color
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const i = idx(x, y);
            const nn = countNeighborsMoore(x, y);
            const a = alive[i] === 1;

            if (!a && nn === 3) {
              nextAlive[i] = 1;
              nextColor[i] = majorityNeighborColor(x, y);
            } else if (a && (nn === 2 || nn === 3)) {
              nextAlive[i] = 1;
              nextColor[i] = state.shiftColorOnSurvive && nn === 3
                ? majorityNeighborColor(x, y)
                : (color[i] >>> 0);
            } else {
              nextAlive[i] = 0;
              nextColor[i] = paint;
            }
          }
        }
      }

      alive = nextAlive;
      color = nextColor;
      draw();
    }

    function loop(now) {
      if (!state.running) {
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(loop);
      if (!state.running) return;

      if (!lastTick) lastTick = now;
      const dt = now - lastTick;
      if (dt >= state.tickMs) {
        lastTick = now - (dt % state.tickMs);
        step();
      }
    }

    function stopLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      //lastTick = 0;
    }

    function startLoop() {
      if (rafId) return;
      //lastTick = 0;
      rafId = requestAnimationFrame(loop);
    }

    // Click / drag painting
    let isDown = false;

    function paintAtEvent(event) {
      const [mx, my] = d3.pointer(event, svg.node());
      const x = Math.floor(mx / state.cellPx);
      const y = Math.floor(my / state.cellPx);
      if (!inBounds(x, y)) return;
      const i = idx(x, y);

      if (state.mode === "color") {
        if (event.shiftKey) {
          alive[i] = 0;
        } else {
          alive[i] = 1;
          color[i] = hexToRgbInt(state.paintColor);
        }
      } else if (state.mode === "protofield") {
        const nextAlive = alive[i] ? 0 : 1;
        alive[i] = nextAlive;
        setProtoAt(i, nextAlive === 1);
      } else {
        alive[i] = alive[i] ? 0 : 1;
      }
      draw();
    }

    svg.on("pointerdown", (event) => {
      isDown = true;
      svg.node().setPointerCapture?.(event.pointerId);
      paintAtEvent(event);
    });

    svg.on("pointermove", (event) => {
      if (!isDown) return;
      // In non-color modes toggling while dragging feels glitchy; only "paint on" while dragging.
      const [mx, my] = d3.pointer(event, svg.node());
      const x = Math.floor(mx / state.cellPx);
      const y = Math.floor(my / state.cellPx);
      if (!inBounds(x, y)) return;
      const i = idx(x, y);

      if (state.mode === "color") {
        if (event.shiftKey) alive[i] = 0;
        else { alive[i] = 1; color[i] = hexToRgbInt(state.paintColor); }
      } else if (state.mode === "protofield") {
        alive[i] = 1;
        setProtoAt(i, true);
      } else {
        alive[i] = 1;
      }
      draw();
    });

    svg.on("pointerup pointercancel", () => { isDown = false; });

    // Convenience: double-click to clear, Alt+click to randomize
    svg.on("dblclick", () => { clearAll(); draw(); });
    svg.on("click", (event) => { if (event.altKey) { randomize(); draw(); } });

    function applyParamChanges() {
      const needsRebuild =
        prev.cellPx !== state.cellPx ||
        prev.wrapEdges !== state.wrapEdges ||
        prev.mode !== state.mode ||
        prev.strokeColor !== state.strokeColor;


      //if (needsRebuild || !alive) rebuildGrid();
      if (needsRebuild) rebuildGrid();

      // If user changes paintColor while paused, keep dead-cell “default” color aligned.
      if (prev.paintColor !== state.paintColor && state.mode !== "color") {
        color.fill(hexToRgbInt(state.paintColor));
        draw();
      }

      if (state.running) startLoop();
      else stopLoop();

      if (state.mode === "protofield") {
        const thresholdsChanged =
          prev.protoThreshMin !== state.protoThreshMin ||
          prev.protoThreshMax !== state.protoThreshMax;
        if (prev.mode !== "protofield") {
          seedProtoFromAlive(state.protoNoise);
          projectAliveFromProto();
          draw();
        } else if (thresholdsChanged) {
          projectAliveFromProto();
          draw();
        }
      }

      prev = {
        cellPx: state.cellPx,
        wrapEdges: state.wrapEdges,
        mode: state.mode,
        paintColor: state.paintColor,
        strokeColor: state.strokeColor,
        protoThreshMin: state.protoThreshMin,
        protoThreshMax: state.protoThreshMax
      };
    }

    const ro = new ResizeObserver(() => rebuildGrid());
    ro.observe(mountEl);

    applyParamChanges();
    startLoop();

    return {
      render: () => applyParamChanges(),
      destroy: () => {
        stopLoop();
        ro.disconnect();
        svg.remove();
      }
    };
  }
});
document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "gameOfLifeSVG",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config")
  });
});
function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
