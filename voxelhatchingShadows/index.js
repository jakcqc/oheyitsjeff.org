import { runVisualApp } from "../helper/visualHelp.js";
import "./voxelHatchingShadows_visual.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "voxelHatchingShadows",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
