import { runVisualApp } from "../helper/visualHelp.js";
import "./equationVisualizer.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "equationVisualizerGrid",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
    state: {
      __xf: {
        ui: {
          preset: "kaleidoscope4",
        },
      },
    },
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;

