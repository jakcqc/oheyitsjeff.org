/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import { runVisualApp } from "../helper/visualHelp.js";
import "./BacterialConstructs_visual.js";

let appHandle = null;

const COMMON = {
  steps: 520,
  resolution: 105,
  seedCount: 7,
  seed: 42817,
  contourLevels: 8,
  cellMarks: true,
  markDensity: 0.15,
  palette: "agar",
  backgroundColor: "#07100e",
};

const PRESETS = {
  coral: {
    ...COMMON,
    model: "Gray-Scott",
    feed: 0.0545,
    kill: 0.062,
    diffusionA: 0.16,
    diffusionB: 0.08,
    seedCount: 11,
    seed: 98341,
    palette: "agar",
  },
  mitosis: {
    ...COMMON,
    model: "Gray-Scott",
    feed: 0.0367,
    kill: 0.0649,
    diffusionA: 0.16,
    diffusionB: 0.08,
    steps: 680,
    seedCount: 5,
    seed: 61003,
    palette: "fluorescent",
  },
  chemotaxis: {
    ...COMMON,
    model: "Keller-Segel",
    diffusionA: 0.11,
    diffusionB: 0.72,
    chemotaxis: 0.62,
    growth: 0.028,
    steps: 420,
    seedCount: 18,
    seed: 72019,
    palette: "petri",
  },
  front: {
    ...COMMON,
    model: "Fisher-KPP",
    diffusionA: 0.34,
    growth: 0.19,
    steps: 310,
    seedCount: 4,
    seed: 31337,
    palette: "violet",
  },
};

const EQUATIONS = {
  "Gray-Scott": "Gray-Scott: U + 2V -> 3V",
  "Keller-Segel": "Keller-Segel: chemotactic aggregation",
  "Fisher-KPP": "Fisher-KPP: diffusion + logistic growth",
};

function startApp(state = PRESETS.coral) {
  appHandle?.instance?.destroy?.();
  appHandle = runVisualApp({
    visualId: "bacterialConstructs",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
    state,
  });
  document.getElementById("equation-label").textContent = EQUATIONS[state.model] || state.model;
}

document.addEventListener("DOMContentLoaded", () => {
  startApp();
  Object.entries(PRESETS).forEach(([name, state]) => {
    document.getElementById(`preset-${name}`)?.addEventListener("click", () => startApp({ ...state }));
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
