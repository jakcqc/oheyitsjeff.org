import { runVisualApp } from "../helper/visualHelp.js";
import "./svgGallery.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "svgGallery",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
