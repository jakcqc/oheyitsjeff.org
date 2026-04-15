import { runVisualApp } from "../helper/visualHelp.js";
import "./LorenzAttractor_visual.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "lorenzAttractor",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
