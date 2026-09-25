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
import "./SpaceFillingCurves_visual.js";

document.addEventListener("DOMContentLoaded", async () => {
  if (!await preloadLinkedSettings("spaceFillingCurves")) return;
  runVisualApp({
    visualId: "spaceFillingCurves",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
    state: {
      __ui: {
        tabsOpen: true,
        activeTab: "params",
        configPinned: true,
        collapseParamsByDefault: true,
      },
    },
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
