import { runVisualApp } from "../helper/visualHelp.js";
import "./QuasicrystallineWickerwork_visual.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "quasicrystallineWickerwork",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
