import { runVisualApp } from "../helper/visualHelp.js";
import "./BoysSurfaceModel_visual.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "boysSurfaceModel",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
