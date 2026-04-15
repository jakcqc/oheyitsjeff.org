import { runVisualApp } from "../helper/visualHelp.js";
import "./StepSplineLab_visual.js";

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "stepSplineLab",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
    state: {
      backgroundColor: "#ffeeee",
      showGuides: false,
      controlPointRadius: 7,
      scene: {
        variables: [
          { name: "amp", value: 18 },
          { name: "freq", value: 6 },
          { name: "bias", value: 4 },
        ],
        generator: {
          minLines: 2,
          maxLines: 20,
          minPointsPerLine: 5,
          maxPointsPerLine: 80,
          seed: 1803,
          edgePadding: 0.04,
          jitter: 0.12,
          minPointStep: 0.05,
          maxPointStep: 0.40,
          closedChance: 0.05,
          pointSampler: "mixed",
          allowLine: true,
          allowDot: false,
          allowContinuous: false,
        },
        items: [],
      },
    },
  });
});

function goTo(page) {
  window.location.href = page;
}

window.goTo = goTo;
