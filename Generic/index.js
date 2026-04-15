// main.js
import { runVisualApp } from "../helper/visualHelp.js";
import "./mandel_visual.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "mandelTilingZoomable",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config")
  });
});
function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;