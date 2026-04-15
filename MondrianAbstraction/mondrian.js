import { registerVisual, runVisualApp } from "../helper/visualHelp.js";

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function getViewportSize() {
  // Use the real viewport (like GameOfLife), not container bounds (which can collapse).
  const infoBar = document.getElementById("infoBar");
  const infoH = infoBar ? infoBar.getBoundingClientRect().height : 0;
  const width = Math.max(1, Math.floor(window.innerWidth));
  const height = Math.max(1, Math.floor(window.innerHeight - infoH));
  return { width, height };
}

function defaultCellSize(width, height) {
  return Math.floor((Math.sqrt((width * height) / 860) / 5) * 5) + 10;
}

function randInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function hueColor(hue, sat, light) {
  // d3.hsl accepts hue 0..360, sat/light 0..1
  return window.d3.hsl(hue, sat, light).formatHex();
}

function buildMondrianSpec() {
  return {
    title: "Mondrian Abstraction",
    description: "Pointer over tiles to animate color + transform; parameters are editable in the UI.",
    params: [
      { key: "grid.cellSize", type: "number", default: 60, min: 10, max: 220, step: 5, category: "Grid", description: "Square size in px." },
      { key: "grid.snapTo5", type: "boolean", default: true, category: "Grid", description: "Snap cellSize to 5px." },
      { key: "grid.strokeWidth", type: "number", default: 1, min: 0, max: 8, step: 0.25, category: "Grid", description: "Tile outline width." },
      { key: "grid.strokeOpacity", type: "number", default: 1, min: 0, max: 1, step: 0.05, category: "Grid", description: "Tile outline opacity." },

      { key: "color.startHue", type: "number", default: 0, min: 0, max: 360, step: 1, category: "Color", description: "Starting hue." },
      { key: "color.hueStep", type: "number", default: 9, min: 0, max: 60, step: 1, category: "Color", description: "Hue increment per interaction." },
      { key: "color.saturation", type: "number", default: 1, min: 0, max: 1, step: 0.05, category: "Color", description: "0 = gray, 1 = vivid." },
      { key: "color.lightness", type: "number", default: 0.6, min: 0, max: 1, step: 0.05, category: "Color", description: "Perceived brightness." },
      { key: "color.fillOpacity", type: "number", default: 0.45, min: 0, max: 1, step: 0.05, category: "Color", description: "Opacity after settle." },
      { key: "color.burstFillOpacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.05, category: "Color", description: "Opacity during burst." },

      { key: "motion.enabled", type: "boolean", default: true, category: "Motion", description: "Enable pointer interactions." },
      { key: "motion.running", type: "boolean", default: true, category: "Motion", description: "Run the auto-simulation loop." },
      { key: "motion.tickMs", type: "number", default: 220, min: 16, max: 4000, step: 1, category: "Motion", description: "Time between automatic tile triggers." },
      { key: "motion.triggersPerTick", type: "number", default: 1, min: 1, max: 12, step: 1, category: "Motion", description: "How many tiles trigger per tick." },
      { key: "motion.hoverCooldownMs", type: "number", default: 80, min: 0, max: 1000, step: 5, category: "Motion", description: "Minimum time between hover-triggered animations." },
      { key: "motion.durationMs", type: "number", default: 600, min: 0, max: 4000, step: 25, category: "Motion", description: "Burst transition duration." },
      { key: "motion.delayMs", type: "number", default: 1200, min: 0, max: 8000, step: 25, category: "Motion", description: "Delay before settling." },
      { key: "motion.rotateDeg", type: "number", default: 180, min: -720, max: 720, step: 5, category: "Motion", description: "Rotation during burst." },
      { key: "motion.scaleBurst", type: "number", default: 1, min: 0.1, max: 6, step: 0.05, category: "Motion", description: "Scale during burst." },
      { key: "motion.scaleMin", type: "number", default: 1, min: 0.1, max: 6, step: 0.05, category: "Motion", description: "Min settle scale." },
      { key: "motion.scaleMax", type: "number", default: 3.6, min: 0.1, max: 8, step: 0.05, category: "Motion", description: "Max settle scale." },
    ],
    create({ mountEl }, state) {
      const d3 = window.d3;
      if (!d3) throw new Error("d3 (v7) must be loaded before mondrian.js");

      mountEl.innerHTML = "";
      const svg = d3.select(mountEl).append("svg")
        .attr("touch-action", "none")
        .attr("preserveAspectRatio", "xMinYMin meet")
        .style("-webkit-tap-highlight-color", "transparent");
      const g = svg.append("g");
      svg.on("pointermove", onSvgPointerMove);

      let currentHue = 0;
      let lastSize = { width: 0, height: 0 };
      let gridCount = 0;
      let rafId = null;
      let lastTick = 0;
      let prev = {};
      let layout = { cols: 0, rows: 0, cellSize: 0, svgW: 0, svgH: 0 };
      let lastHoverAt = 0;

      function stopLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      }

      function startLoop() {
        if (rafId) return;
        rafId = requestAnimationFrame(loop);
      }

      function loop(now) {
        if (!state.motion?.running) {
          rafId = null;
          return;
        }
        rafId = requestAnimationFrame(loop);
        if (!lastTick) lastTick = now;
        const tickMs = clamp(state.motion?.tickMs, 1, 20000);
        const dt = now - lastTick;
        if (dt < tickMs) return;
        lastTick = now - (dt % tickMs);

        const triggers = clamp(state.motion?.triggersPerTick, 1, 50);
        const count = Math.max(0, gridCount);
        if (!count) return;
        for (let k = 0; k < triggers; k++) {
          const i = randInt(0, count - 1);
          animateByIndex(i);
        }
      }

      function animateByIndex(i) {
        const svgNode = svg.node();
        if (!svgNode) return;
        const nodes = svgNode.querySelectorAll(`rect[data-idx="${i}"]`);
        if (!nodes.length) return;
        const plan = computeAnimationPlan();
        for (const node of nodes) applyAnimationPlan(node, plan);
      }

      function computeAnimationPlan() {
        const { width, height } = lastSize;
        const durationMs = clamp(state.motion?.durationMs, 0, 10000);
        const delayMs = clamp(state.motion?.delayMs, 0, 20000);
        const rotateDeg = clamp(state.motion?.rotateDeg, -1440, 1440);

        const scaleBurst = clamp(state.motion?.scaleBurst, 0.01, 20);
        const scaleMin = clamp(state.motion?.scaleMin, 0.01, 20);
        const scaleMax = Math.max(scaleMin, clamp(state.motion?.scaleMax, 0.01, 20));
        const settleScale = scaleMin + Math.random() * (scaleMax - scaleMin);

        const cellSize = clamp(state.grid?.cellSize, 1, 10000);
        const margin = Math.max(0, 2 * cellSize);
        const tx = randInt(0, Math.max(0, Math.floor(width - margin)));
        const ty = randInt(0, Math.max(0, Math.floor(height - margin)));

        currentHue = (currentHue + clamp(state.color?.hueStep, 0, 360)) % 360;
        const sat = clamp(state.color?.saturation, 0, 1);
        const light = clamp(state.color?.lightness, 0, 1);
        const fill = hueColor(currentHue, sat, light);

        return {
          width,
          height,
          durationMs,
          delayMs,
          rotateDeg,
          scaleBurst,
          settleScale,
          tx,
          ty,
          fill,
        };
      }

      function animateTileOnce(node) {
        if (!state.motion?.enabled) return;

        const plan = computeAnimationPlan();
        applyAnimationPlan(node, plan);
      }

      function applyAnimationPlan(node, plan) {
        if (!state.motion?.enabled) return;

        const { width, height } = plan;
        node.parentNode?.appendChild?.(node);

        d3.select(node)
          .interrupt()
          .transition()
          .duration(plan.durationMs)
          .attr("x", 0)
          .attr("y", 0)
          .attr("transform", `translate(${width * 0.5},${height * 0.5})scale(${plan.scaleBurst})rotate(${plan.rotateDeg})`)
          .style("fill-opacity", clamp(state.color?.burstFillOpacity, 0, 1))
          .style("stroke", "black")
          .style("stroke-width", "1px")
          .transition()
          .delay(plan.delayMs)
          .attr("x", 0)
          .attr("y", 0)
          .attr("transform", `translate(${plan.tx},${plan.ty})scale(${plan.settleScale})`)
          .style("stroke-width", `${clamp(state.grid?.strokeWidth, 0, 50)}px`)
          .style("stroke", "black")
          .style("stroke-opacity", clamp(state.grid?.strokeOpacity, 0, 1))
          .style("fill-opacity", clamp(state.color?.fillOpacity, 0, 1))
          .style("fill", plan.fill);
      }

      function onSvgPointerMove(event) {
        if (!state.motion?.enabled) return;
        const cooldown = clamp(state.motion?.hoverCooldownMs, 0, 10000);
        const now = performance.now();
        if (cooldown > 0 && now - lastHoverAt < cooldown) return;
        lastHoverAt = now;

        const svgEl = svg.node();
        if (!svgEl) return;
        const [mx, my] = d3.pointer(event, svgEl);
        const cs = Number(layout.cellSize) || 0;
        if (cs <= 0) return;

        const col = Math.floor(mx / cs);
        const row = Math.floor(my / cs);
        if (col < 0 || row < 0 || col >= layout.cols || row >= layout.rows) return;
        const i = row * layout.cols + col;
        if (i < 0 || i >= gridCount) return;
        animateByIndex(i);
      }

      function render() {
        const { width, height } = getViewportSize();

        const rawCell = clamp(state.grid?.cellSize ?? defaultCellSize(width, height), 10, 400);
        const cellSize = state.grid?.snapTo5 ? Math.round(rawCell / 5) * 5 : rawCell;
        state.grid.cellSize = cellSize;

        const cols = Math.max(1, Math.floor(width / cellSize));
        const rows = Math.max(1, Math.floor(height / cellSize));
        const svgW = cols * cellSize;
        const svgH = rows * cellSize;
        lastSize = { width: svgW, height: svgH };

        const layoutChanged =
          layout.cols !== cols ||
          layout.rows !== rows ||
          layout.cellSize !== cellSize ||
          layout.svgW !== svgW ||
          layout.svgH !== svgH;

        svg
          .attr("width", svgW)
          .attr("height", svgH)
          .attr("viewBox", `0 0 ${svgW} ${svgH}`);
        const count = cols * rows;
        gridCount = count;

        if (!Number.isFinite(currentHue) || currentHue === 0) {
          currentHue = clamp(state.color?.startHue, 0, 360);
        }

        const sel = g.selectAll("rect").data(d3.range(count), (d) => d);
        // Only remove/rebuild tiles when the layout changes; otherwise keep in-flight tiles stable.
        if (layoutChanged) sel.exit().remove();

        const strokeWidth = clamp(state.grid?.strokeWidth, 0, 50);
        const strokeOpacity = clamp(state.grid?.strokeOpacity, 0, 1);

        const enter = sel.enter().append("rect")
          .attr("fill", "white")
          .attr("stroke", "black")
          .attr("class", "mondrian-tile")
          .attr("data-idx", (i) => String(i));

        const all = enter.merge(sel);

        // Always allow style updates (safe during flight).
        all
          .style("stroke-width", `${strokeWidth}px`)
          .style("stroke-opacity", strokeOpacity);

        // Only touch layout-critical attrs when the layout changes.
        // If we rewrite x/y while a tile is mid-transition (using transform), it can jump offscreen.
        if (layoutChanged) {
          all
            .interrupt()
            .attr("transform", null)
            .attr("x", (i) => Math.floor((i % cols) * cellSize))
            .attr("y", (i) => Math.floor(Math.floor(i / cols) * cellSize))
            .attr("width", cellSize)
            .attr("height", cellSize);
          layout = { cols, rows, cellSize, svgW, svgH };
        }

        // Keep loop state in sync with UI changes (GameOfLife-style).
        const needsRestart =
          prev.running !== !!state.motion?.running ||
          prev.tickMs !== state.motion?.tickMs ||
          prev.triggers !== state.motion?.triggersPerTick;

        if (needsRestart) {
          stopLoop();
          lastTick = 0;
          if (state.motion?.running) startLoop();
        }

        prev = {
          running: !!state.motion?.running,
          tickMs: state.motion?.tickMs,
          triggers: state.motion?.triggersPerTick,
        };
      }

      const onResize = () => render();
      window.addEventListener("resize", onResize);

      // Start loop immediately; runVisualApp will call render() on param changes.
      if (state.motion?.running) startLoop();

      return {
        render,
        destroy() {
          stopLoop();
          window.removeEventListener("resize", onResize);
          svg.remove();
        },
      };
    },
  };
}

registerVisual("mondrianAbstraction", buildMondrianSpec());

let appHandle = null;

function startMondrianApp() {
  const mountEl = document.getElementById("vis");
  const uiEl = document.getElementById("config");
  if (!mountEl || !uiEl) return;

  uiEl.innerHTML = "";
  mountEl.innerHTML = "";

  appHandle = runVisualApp({
    visualId: "mondrianAbstraction",
    mountEl,
    uiEl,
  });

  appHandle?.instance?.render?.();
}

document.addEventListener("DOMContentLoaded", () => startMondrianApp());

window.goTo = function goTo(page) {
  window.location.href = page;
};
