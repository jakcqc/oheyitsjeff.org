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
import { preloadLinkedSettings } from "../helper/linkedSettings.js";
import "./voronoi_visual.js";

document.addEventListener("DOMContentLoaded", async () => {
  if (!await preloadLinkedSettings("voronoiFluid")) return;
  runVisualApp({
    visualId: "voronoiFluid",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
    state: {
      __xf: {
        ui: {
          preset: "kaleidoscope4"
        },
      },
      __anim: {
        ui: {
          targetType: "params",
          paramTargets: [{ key: "pointCount", from: 1, to: 600 }],
          durationSec: 60,
          fps: 24,
          easing: "linear",
          loop: true,
          autoPlay: true,
        },
      },
    },
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
