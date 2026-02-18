import { runVisualApp } from "../helper/visualHelp.js";
import "./plantCells.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "plantCells",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
