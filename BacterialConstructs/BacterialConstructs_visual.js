/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import { registerVisual } from "../helper/visualHelp.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PALETTES = {
  agar: ["#10241d", "#1d5138", "#3d8a58", "#8aca75", "#e4ed9e"],
  fluorescent: ["#08070d", "#37105c", "#8f2da8", "#ff5db1", "#ffe37c"],
  petri: ["#10171d", "#23465a", "#3f8490", "#84c7aa", "#e7efbc"],
  violet: ["#0d0a18", "#302153", "#684b9c", "#ba85d4", "#ffe0df"],
  monochrome: ["#080b0a", "#313b37", "#687871", "#b5c3b9", "#f3f5ed"],
};

// Model references:
// Gray-Scott: Pearson, "Complex Patterns in a Simple System" (Science, 1993).
// Keller-Segel: chemotaxis-driven aggregation of cells toward a chemical signal.
// Fisher-KPP: diffusing population density with logistic growth and traveling fronts.
const EQUATION_LABELS = {
  "Gray-Scott": "Gray-Scott: U + 2V -> 3V",
  "Keller-Segel": "Keller-Segel: chemotactic aggregation",
  "Fisher-KPP": "Fisher-KPP: diffusion + logistic growth",
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function laplacian(field, x, y, cols, rows) {
  const xm = (x + cols - 1) % cols;
  const xp = (x + 1) % cols;
  const ym = (y + rows - 1) % rows;
  const yp = (y + 1) % rows;
  return field[y * cols + xm] + field[y * cols + xp]
    + field[ym * cols + x] + field[yp * cols + x]
    - 4 * field[y * cols + x];
}

function seedFields(cols, rows, state) {
  const count = cols * rows;
  const a = new Float32Array(count).fill(state.model === "Gray-Scott" ? 1 : 0);
  const b = new Float32Array(count);
  const rand = mulberry32(Math.floor(Number(state.seed) || 1));
  const seeds = Math.max(1, Math.floor(Number(state.seedCount) || 1));

  for (let s = 0; s < seeds; s++) {
    const cx = Math.floor((0.12 + rand() * 0.76) * cols);
    const cy = Math.floor((0.12 + rand() * 0.76) * rows);
    const radius = Math.max(2, Math.floor((0.025 + rand() * 0.045) * cols));
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const xx = (x + cols) % cols;
        const yy = (y + rows) % rows;
        const d = Math.hypot(x - cx, y - cy) / radius;
        if (d > 1) continue;
        const i = yy * cols + xx;
        if (state.model === "Gray-Scott") {
          a[i] = 0.48 + rand() * 0.08;
          b[i] = 0.22 + rand() * 0.12;
        } else {
          a[i] = Math.max(a[i], (1 - d) * (0.65 + rand() * 0.3));
          b[i] = Math.max(b[i], (1 - d) * 0.5);
        }
      }
    }
  }
  return { a, b };
}

function simulate(state, cols, rows) {
  let { a, b } = seedFields(cols, rows, state);
  let nextA = new Float32Array(a.length);
  let nextB = new Float32Array(b.length);
  const steps = Math.max(1, Math.floor(Number(state.steps) || 1));
  const da = Number(state.diffusionA) || 0.16;
  const db = Number(state.diffusionB) || 0.08;
  const feed = Number(state.feed) || 0;
  const kill = Number(state.kill) || 0;
  const growth = Number(state.growth) || 0;
  const chi = Number(state.chemotaxis) || 0;

  for (let step = 0; step < steps; step++) {
    for (let y = 0; y < rows; y++) {
      const ym = (y + rows - 1) % rows;
      const yp = (y + 1) % rows;
      for (let x = 0; x < cols; x++) {
        const xm = (x + cols - 1) % cols;
        const xp = (x + 1) % cols;
        const i = y * cols + x;
        const av = a[i];
        const bv = b[i];
        const lapA = laplacian(a, x, y, cols, rows);
        const lapB = laplacian(b, x, y, cols, rows);

        if (state.model === "Gray-Scott") {
          const reaction = av * bv * bv;
          nextA[i] = clamp(av + da * lapA - reaction + feed * (1 - av));
          nextB[i] = clamp(bv + db * lapB + reaction - (feed + kill) * bv);
        } else if (state.model === "Keller-Segel") {
          const gradAx = (a[y * cols + xp] - a[y * cols + xm]) * 0.5;
          const gradAy = (a[yp * cols + x] - a[ym * cols + x]) * 0.5;
          const gradBx = (b[y * cols + xp] - b[y * cols + xm]) * 0.5;
          const gradBy = (b[yp * cols + x] - b[ym * cols + x]) * 0.5;
          const chemotaxis = gradAx * gradBx + gradAy * gradBy + av * lapB;
          nextA[i] = clamp(av + 0.12 * (da * lapA - chi * chemotaxis + growth * av * (1 - av)));
          nextB[i] = clamp(bv + 0.12 * (db * lapB + 0.3 * av - 0.12 * bv));
        } else {
          nextA[i] = clamp(av + 0.18 * (da * lapA + growth * av * (1 - av)));
          nextB[i] = nextA[i];
        }
      }
    }
    [a, nextA] = [nextA, a];
    [b, nextB] = [nextB, b];
  }
  return state.model === "Gray-Scott" ? b : a;
}

function addSvg(parent, tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  parent.appendChild(el);
  return el;
}

registerVisual("bacterialConstructs", {
  title: "Bacterial Constructs",
  description: "Layered SVG colonies generated from Gray-Scott, Keller-Segel, and Fisher-KPP equations.",
  params: [
    { key: "model", type: "select", default: "Gray-Scott", category: "Equation", options: ["Gray-Scott", "Keller-Segel", "Fisher-KPP"] },
    { key: "feed", label: "feed F", type: "number", default: 0.0545, category: "Equation", min: 0.01, max: 0.09, step: 0.0001, description: "Gray-Scott replenishment rate.", shouldShowWhen: { model: "Gray-Scott" } },
    { key: "kill", label: "kill k", type: "number", default: 0.062, category: "Equation", min: 0.03, max: 0.08, step: 0.0001, description: "Gray-Scott removal rate.", shouldShowWhen: { model: "Gray-Scott" } },
    { key: "diffusionA", label: "cell / U diffusion", type: "number", default: 0.16, category: "Equation", min: 0.01, max: 1, step: 0.01 },
    { key: "diffusionB", label: "signal / V diffusion", type: "number", default: 0.08, category: "Equation", min: 0.01, max: 1, step: 0.01, shouldShowWhen: { model: ["Gray-Scott", "Keller-Segel"] } },
    { key: "chemotaxis", label: "chemotactic pull", type: "number", default: 0.62, category: "Equation", min: 0, max: 1.5, step: 0.01, shouldShowWhen: { model: "Keller-Segel" } },
    { key: "growth", label: "logistic growth", type: "number", default: 0.19, category: "Equation", min: 0, max: 0.5, step: 0.005, shouldShowWhen: { model: ["Keller-Segel", "Fisher-KPP"] } },
    { key: "steps", type: "number", default: 520, category: "Simulation", min: 20, max: 1200, step: 10 },
    { key: "resolution", type: "number", default: 105, category: "Simulation", min: 45, max: 180, step: 5 },
    { key: "seedCount", label: "inoculation sites", type: "number", default: 7, category: "Simulation", min: 1, max: 40, step: 1 },
    { key: "seed", type: "number", default: 42817, category: "Simulation", min: 0, max: 999999, step: 1 },
    {
      key: "newSeed", type: "button", label: "New inoculation", category: "Simulation",
      onClick: ({ state }) => { state.seed = Math.floor(Math.random() * 1000000); },
    },
    { key: "contourLevels", label: "SVG contour layers", type: "number", default: 8, category: "SVG Styling", min: 2, max: 16, step: 1 },
    { key: "cellMarks", label: "show individual cells", type: "boolean", default: true, category: "SVG Styling" },
    { key: "markDensity", label: "cell mark density", type: "number", default: 0.15, category: "SVG Styling", min: 0.01, max: 0.5, step: 0.01, shouldShowWhen: { cellMarks: true } },
    { key: "palette", type: "select", default: "agar", category: "SVG Styling", options: Object.keys(PALETTES) },
    { key: "backgroundColor", type: "text", default: "#07100e", category: "SVG Styling" },
  ],

  create({ mountEl }, state) {
    mountEl.innerHTML = "";
    const svg = addSvg(mountEl, "svg", { width: "100%", height: "100%", role: "img", "aria-label": "Equation-generated bacterial colony" });
    svg.style.display = "block";
    // Keep one stable source group for the shared transform runtime. Replacing the
    // SVG children on every render detached that runtime, so presets appeared to
    // do nothing (and were lost again after any parameter change).
    const source = addSvg(svg, "g", { "data-colony-source": "1" });
    const background = addSvg(source, "rect");
    const colony = addSvg(source, "g", { "data-colony-contours": "1" });
    const cells = addSvg(source, "g", { "data-colony-cells": "1" });

    const render = () => {
      const d3 = window.d3;
      if (!d3?.contours) return;
      const equationLabel = document.getElementById("equation-label");
      if (equationLabel) equationLabel.textContent = EQUATION_LABELS[state.model] || state.model;
      const rect = mountEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const cols = Math.max(20, Math.floor(Number(state.resolution) || 105));
      const rows = Math.max(20, Math.floor(cols * height / width));
      const values = simulate(state, cols, rows);
      const levels = Math.max(2, Math.floor(Number(state.contourLevels) || 8));
      const palette = PALETTES[state.palette] || PALETTES.agar;
      const thresholds = Array.from({ length: levels }, (_, i) => 0.08 + i * 0.82 / levels);
      const contours = d3.contours().size([cols, rows]).smooth(true).thresholds(thresholds)(values);
      const path = d3.geoPath(d3.geoIdentity());

      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      background.setAttribute("width", String(width));
      background.setAttribute("height", String(height));
      background.setAttribute("fill", state.backgroundColor || "#07100e");
      colony.replaceChildren();
      colony.setAttribute("transform", `scale(${width / cols} ${height / rows})`);
      cells.replaceChildren();
      cells.setAttribute("fill", palette[palette.length - 1]);
      cells.setAttribute("fill-opacity", "0.62");

      contours.forEach((contour, i) => {
        addSvg(colony, "path", {
          d: path(contour),
          fill: palette[Math.min(palette.length - 1, Math.floor(i * palette.length / contours.length))],
          "fill-opacity": 0.82,
          stroke: palette[Math.min(palette.length - 1, Math.floor((i + 1) * palette.length / contours.length))],
          "stroke-width": Math.max(0.12, cols / width),
          "stroke-opacity": 0.7,
          "vector-effect": "non-scaling-stroke",
        });
      });

      if (state.cellMarks) {
        const rand = mulberry32((Number(state.seed) || 1) + 991);
        const stride = Math.max(1, Math.floor(1 / clamp(state.markDensity, 0.01, 0.5)));
        for (let i = 0; i < values.length; i += stride) {
          if (values[i] < 0.22 || rand() > values[i]) continue;
          const x = ((i % cols) + rand()) * width / cols;
          const y = (Math.floor(i / cols) + rand()) * height / rows;
          const r = Math.max(0.45, Math.min(width, height) / 850);
          addSvg(cells, "ellipse", {
            cx: x, cy: y, rx: r * 2.1, ry: r,
            transform: `rotate(${Math.floor(rand() * 180)} ${x} ${y})`,
          });
        }
      }
    };

    const ro = new ResizeObserver(render);
    ro.observe(mountEl);
    render();
    return { render, destroy: () => ro.disconnect() };
  },
});
