/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
import { runVisualApp } from "../helper/visualHelp.js";
import { preloadLinkedSettings } from "../helper/linkedSettings.js";
import "./PureAttractors_visual.js";

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("button-exit").onclick = () => { window.location.href = "/MathVisuals/"; };
  if (!window.d3) {
    document.getElementById("vis").textContent = "D3 could not load. Check your connection and reload Pure Attractors.";
    return;
  }
  if (!await preloadLinkedSettings("pureAttractors")) return;
  const app = runVisualApp({
    visualId: "pureAttractors",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
  });
  window.pureAttractorsApp = app;
  const settingsButton = document.getElementById("button-info");
  const config = document.getElementById("config");
  const syncExpanded = () => settingsButton.setAttribute("aria-expanded", String(config.classList.contains("open") || config.classList.contains("pinned")));
  const panelObserver = new MutationObserver(syncExpanded);
  panelObserver.observe(config, { attributes: true, attributeFilter: ["class"] });
  syncExpanded();
  window.addEventListener("pagehide", () => panelObserver.disconnect(), { once: true });
  window.addEventListener("pageshow", () => {
    panelObserver.observe(config, { attributes: true, attributeFilter: ["class"] });
    syncExpanded();
  });
  // Delegation also works on the shared transform tool's SVG copies.
  const activate = (event) => {
    if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
    const disk = event.target.closest?.("[data-pa-preset]");
    if (!disk || app.state.view !== "Bestiary") return;
    event.preventDefault();
    app.setParam("preset", disk.dataset.paPreset);
    app.setParam("view", "Single attractor");
  };
  document.getElementById("vis").addEventListener("click", activate);
  document.getElementById("vis").addEventListener("keydown", activate);
});
