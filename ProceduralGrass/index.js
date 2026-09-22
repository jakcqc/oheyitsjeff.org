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
import "./ProceduralGrass_visual.js";

const PRESETS = {
  emeraldNadir: {
    growth: 0.88,
    density: 1450,
    bladeHeight: 52,
    heightVariation: 0.52,
    bladeWidth: 4.2,
    bend: 0.52,
    clumping: 0.58,
    clumpCount: 19,
    clumpRadius: 0.1,
    barePatches: 0.08,
    distribution: "clumps",
    windStrength: 0.26,
    windDirection: 38,
    viewTilt: 8,
    viewYaw: 12,
    perspective: 0.12,
    palette: "emerald",
    groundTexture: 0.38,
    seedHeads: 0.04,
    seed: 621734,
  },
  windAtlas: {
    growth: 1,
    density: 1750,
    bladeHeight: 70,
    heightVariation: 0.35,
    bladeWidth: 3.2,
    bend: 0.82,
    bendVariation: 0.55,
    clumping: 0.36,
    barePatches: 0.16,
    distribution: "uniform",
    windStrength: 0.92,
    windDirection: 112,
    gustScale: 0.2,
    turbulence: 0.38,
    windPhase: 0.42,
    viewTilt: 34,
    viewYaw: 24,
    perspective: 0.34,
    palette: "bluegrass",
    shadowStrength: 0.2,
    seed: 908231,
  },
  zenCut: {
    growth: 0.48,
    density: 720,
    bladeHeight: 34,
    heightVariation: 0.12,
    bladeWidth: 2.2,
    widthVariation: 0.08,
    bend: 0.16,
    bendVariation: 0.1,
    distribution: "rows",
    rowSpacing: 0.052,
    rowJitter: 0.1,
    clumping: 0,
    barePatches: 0,
    windStrength: 0.08,
    viewTilt: 2,
    viewYaw: 45,
    perspective: 0,
    palette: "noir",
    outlineWidth: 0.34,
    groundTexture: 0.08,
    seedHeads: 0,
    seed: 44012,
  },
  goldenHour: {
    growth: 1,
    density: 1120,
    bladeHeight: 86,
    heightVariation: 0.4,
    bladeWidth: 4.8,
    bend: 0.62,
    clumping: 0.7,
    clumpCount: 13,
    clumpRadius: 0.14,
    barePatches: 0.22,
    distribution: "clumps",
    windStrength: 0.48,
    windDirection: 276,
    gustScale: 0.36,
    viewTilt: 49,
    viewYaw: 348,
    perspective: 0.58,
    palette: "straw",
    lightAngle: 308,
    shadowStrength: 0.42,
    seedHeads: 0.42,
    seed: 733105,
  },
  mossMicro: {
    growth: 0.3,
    density: 2400,
    bladeHeight: 18,
    heightVariation: 0.7,
    bladeWidth: 5.6,
    widthVariation: 0.62,
    bend: 0.74,
    bendVariation: 0.8,
    clumping: 0.86,
    clumpCount: 34,
    clumpRadius: 0.055,
    barePatches: 0.28,
    patchScale: 0.08,
    distribution: "clumps",
    windStrength: 0.12,
    viewTilt: 0,
    perspective: 0,
    palette: "moss",
    groundTexture: 0.7,
    groundTextureScale: 0.06,
    seedHeads: 0,
    seed: 304998,
  },
  stormLines: {
    growth: 0.78,
    density: 950,
    bladeHeight: 104,
    heightVariation: 0.24,
    bladeWidth: 2.1,
    bend: 1.18,
    bendVariation: 0.3,
    distribution: "radial",
    clumping: 0.18,
    barePatches: 0.12,
    windStrength: 1.18,
    windDirection: 214,
    gustScale: 0.16,
    turbulence: 0.72,
    viewTilt: 58,
    viewYaw: 18,
    perspective: 0.72,
    palette: "storm",
    outlineWidth: 0.48,
    bladeOpacity: 0.8,
    shadowStrength: 0.28,
    seedHeads: 0.02,
    seed: 193774,
  },
};

let app = null;
const mountEl = document.getElementById("vis");
const uiEl = document.getElementById("config");

function start(state) {
  app?.instance?.destroy?.();
  app = runVisualApp({ visualId: "proceduralGrassField", mountEl, uiEl, state });
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  const sharedToolState = {
    __toolFlows: app?.state?.__toolFlows,
    __effects: app?.state?.__effects,
  };
  start({ ...preset, ...sharedToolState });
}

document.addEventListener("DOMContentLoaded", () => {
  start(PRESETS.emeraldNadir);
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
