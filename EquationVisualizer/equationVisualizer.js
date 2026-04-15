import { registerVisual } from "../helper/visualHelp.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hsl(h, s, l) {
  return `hsl(${h} ${s}% ${l}%)`;
}

function createSvgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * Starter function #1: create an empty grid of SVG cells.
 * Returns `{ g, cells }` where `cells` is a flat array of cell records.
 */
export function createCellGrid(svg, { cols, rows, cellSize, gap = 0, showGridLines = true }) {
  const safeCols = Math.max(1, Math.floor(Number(cols) || 1));
  const safeRows = Math.max(1, Math.floor(Number(rows) || 1));
  const safeCellSize = Math.max(2, Math.floor(Number(cellSize) || 16));
  const safeGap = Math.max(0, Math.floor(Number(gap) || 0));

  const g = createSvgEl("g", { class: "eqv-gridRoot" });
  svg.appendChild(g);

  const cells = [];
  const stroke = showGridLines ? "var(--ui-border, rgba(128,128,128,0.4))" : "none";

  for (let row = 0; row < safeRows; row++) {
    for (let col = 0; col < safeCols; col++) {
      const x = col * (safeCellSize + safeGap);
      const y = row * (safeCellSize + safeGap);

      const rect = createSvgEl("rect", {
        x,
        y,
        width: safeCellSize,
        height: safeCellSize,
        fill: "transparent",
        stroke,
        "stroke-width": 1,
        class: "eqv-cell",
      });
      g.appendChild(rect);

      cells.push({
        col,
        row,
        x,
        y,
        size: safeCellSize,
        value: 0,
        el: rect,
      });
    }
  }

  return { g, cells, cols: safeCols, rows: safeRows, cellSize: safeCellSize, gap: safeGap };
}

function cellIndexOf(grid, col, row) {
  return row * grid.cols + col;
}

function getCellAt(grid, col, row) {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
  return grid.cells[cellIndexOf(grid, col, row)] ?? null;
}

function getNeighborCells(grid, col, row, radius, wrap = false) {
  const r = Math.max(0, Math.floor(Number(radius) || 0));
  if (r === 0) return [];

  const out = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      let nc = col + dx;
      let nr = row + dy;

      if (wrap) {
        nc = ((nc % grid.cols) + grid.cols) % grid.cols;
        nr = ((nr % grid.rows) + grid.rows) % grid.rows;
      }

      const n = getCellAt(grid, nc, nr);
      if (n) out.push(n);
    }
  }
  return out;
}

const EQUATION_FNS = {
  sineRipple: ({ xn, yn, t }) => {
    const d = Math.hypot(xn - 0.5, yn - 0.5);
    return 0.5 + 0.5 * Math.sin(10 * d - t);
  },
  checker: ({ col, row }) => ((col + row) % 2 ? 0.2 : 0.8),
  ring: ({ xn, yn, t }) => {
    const d = Math.hypot(xn - 0.5, yn - 0.5);
    return 0.5 + 0.5 * Math.cos(18 * d + t * 0.8);
  },
};

/**
 * Starter function #2: apply a per-cell function (equation) and update SVG.
 * This is the main hook you’ll replace/expand to render equation-derived SVG.
 */
export function applyCellFunction(grid, { equationId, t = 0, cellRenderer }) {
  const eq = EQUATION_FNS[equationId] || EQUATION_FNS.sineRipple;
  const renderCell =
    typeof cellRenderer === "function"
      ? cellRenderer
      : (cell, v) => {
          const hue = Math.round(lerp(210, 20, v));
          cell.el.setAttribute("fill", hsl(hue, 85, 55));
          cell.el.setAttribute("fill-opacity", String(lerp(0.15, 0.95, v)));
        };

  for (const cell of grid.cells) {
    const xn = grid.cols <= 1 ? 0 : cell.col / (grid.cols - 1);
    const yn = grid.rows <= 1 ? 0 : cell.row / (grid.rows - 1);
    const v = clamp01(eq({ col: cell.col, row: cell.row, xn, yn, t }));
    cell.value = v;
    renderCell(cell, v);
  }
}

/**
 * Starter function #3: a neighborhood-based update pass.
 * Computes a derived value per cell based on nearby cells, and writes it back.
 */
export function applyNeighborhoodPass(grid, { radius = 1, wrap = false, mode = "avg", strength = 0.6 }) {
  const next = new Float32Array(grid.cells.length);
  const s = clamp01(Number(strength));

  for (const cell of grid.cells) {
    const neighbors = getNeighborCells(grid, cell.col, cell.row, radius, wrap);
    let acc = 0;
    for (const n of neighbors) acc += n.value;

    const neighborMetric =
      neighbors.length === 0
        ? 0
        : mode === "sum"
          ? acc
          : acc / neighbors.length;

    const idx = cellIndexOf(grid, cell.col, cell.row);
    next[idx] = clamp01(lerp(cell.value, neighborMetric, s));
  }

  for (const cell of grid.cells) {
    const idx = cellIndexOf(grid, cell.col, cell.row);
    cell.value = next[idx];
    const hue = Math.round(lerp(280, 60, cell.value));
    cell.el.setAttribute("fill", hsl(hue, 85, 55));
    cell.el.setAttribute("fill-opacity", String(lerp(0.15, 0.95, cell.value)));
  }
}

function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

registerVisual("equationVisualizerGrid", {
  title: "Equation Visualizer (Starter)",
  description:
    "Starter SVG grid visual to build equation-driven rendering + neighborhood transforms.",

  params: [
    { key: "grid.cols", type: "number", default: 48, min: 1, max: 240, step: 1, category: "Grid" },
    { key: "grid.rows", type: "number", default: 30, min: 1, max: 160, step: 1, category: "Grid" },
    { key: "grid.cellSize", type: "number", default: 18, min: 4, max: 80, step: 1, category: "Grid" },
    { key: "grid.gap", type: "number", default: 1, min: 0, max: 10, step: 1, category: "Grid" },
    { key: "grid.showGridLines", type: "boolean", default: true, category: "Grid" },

    {
      key: "equationId",
      type: "select",
      default: "sineRipple",
      options: Object.keys(EQUATION_FNS),
      description: "Pick a starter equation function (replace with your own set).",
      category: "Equation",
    },
    { key: "time", type: "number", default: 0, min: 0, max: 1000, step: 0.01, category: "Animation" },

    { key: "neighborhood.enabled", type: "boolean", default: true, category: "Neighborhood" },
    { key: "neighborhood.radius", type: "number", default: 1, min: 0, max: 6, step: 1, category: "Neighborhood" },
    { key: "neighborhood.wrap", type: "boolean", default: false, category: "Neighborhood" },
    {
      key: "neighborhood.mode",
      type: "select",
      default: "avg",
      options: ["avg", "sum"],
      category: "Neighborhood",
    },
    { key: "neighborhood.strength", type: "number", default: 0.65, min: 0, max: 1, step: 0.01, category: "Neighborhood" },
  ],

  create: ({ mountEl }, state) => {
    const rebuild = () => {
      clearEl(mountEl);

      const cols = Math.max(1, Math.floor(Number(state.grid?.cols) || 1));
      const rows = Math.max(1, Math.floor(Number(state.grid?.rows) || 1));
      const cellSize = Math.max(2, Math.floor(Number(state.grid?.cellSize) || 16));
      const gap = Math.max(0, Math.floor(Number(state.grid?.gap) || 0));

      const width = cols * cellSize + (cols - 1) * gap;
      const height = rows * cellSize + (rows - 1) * gap;

      const svg = createSvgEl("svg", {
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        style: "display:block; max-width:100%; max-height:100%; margin:0 auto;",
        class: "eqv-svgRoot",
      });
      mountEl.appendChild(svg);

      const grid = createCellGrid(svg, {
        cols,
        rows,
        cellSize,
        gap,
        showGridLines: Boolean(state.grid?.showGridLines),
      });

      applyCellFunction(grid, {
        equationId: state.equationId,
        t: Number(state.time) || 0,
      });

      if (state.neighborhood?.enabled) {
        applyNeighborhoodPass(grid, {
          radius: state.neighborhood?.radius,
          wrap: Boolean(state.neighborhood?.wrap),
          mode: state.neighborhood?.mode,
          strength: state.neighborhood?.strength,
        });
      }
    };

    rebuild();

    return {
      render: rebuild,
      destroy: () => clearEl(mountEl),
    };
  },
});
