import { runVisualApp } from "../helper/visualHelp.js";
import "./voronoi_visual.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "voronoiFluid",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
    state: {
      __xf: {
        ui: {
          preset: "kaleidoscope4"
        },
      },
      __anim: {
        ui: {
          targetType: "params",
          paramTargets: [{ key: "pointCount", from: 1, to: 600 }],
          durationSec: 60,
          fps: 24,
          easing: "linear",
          loop: true,
          autoPlay: true,
        },
      },
    },
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
