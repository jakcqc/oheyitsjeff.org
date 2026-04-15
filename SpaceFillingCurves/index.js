import { runVisualApp } from "../helper/visualHelp.js";
import "./SpaceFillingCurves_visual.js";

document.addEventListener("DOMContentLoaded", () => {
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
