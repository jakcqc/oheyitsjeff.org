import { runVisualApp } from "../helper/visualHelp.js";
import "./MarbledPatterns_visual.js";

let appHandle = null;
let mountElRef = null;
let uiElRef = null;
const BASE_PRESET = {
  bandCount: 261,
  bandWidth: 4,
  bandJitter: 80,
  amplitude: 9,
  frequency: 0.4,
  noise: 0,
  detail: 12,
  swirlCount: 4,
  swirlStrength: 1.8,
  swirlRadius: 360,
  strokeOpacity: 0.59,
  strokeMode: true,
  strokeColor: "#f2f2f2",
  seed: 603430,
  palette: "noir",
};

const PRESET_VARIANTS = {
  one: {
    ...BASE_PRESET
  },
  two: {
    ...BASE_PRESET,
    "bandCount": 412,
  "bandWidth": "4",
  "bandJitter": "0",
  "amplitude": "0",
  "frequency": "0.4",
  "noise": "0",
  "detail": "4",
  "swirlCount": "4",
  "swirlStrength": "1.8",
  "swirlRadius": "385",
  "strokeOpacity": "0.35",
  "strokeMode": false,
  "strokeColor": "#f7f7f7",
  "seed": 741905,
  "palette": "mono",
  },
  three: {
    ...BASE_PRESET,
      "bandCount": "1300",
  "bandWidth": "6",
  "bandJitter": "80",
  "amplitude": "0",
  "frequency": "0.4",
  "noise": "0",
  "detail": "4",
  "swirlCount": "5",
  "swirlStrength": "2.4",
  "swirlRadius": "520",
  "strokeOpacity": "0.2",
  "strokeMode": false,
  "strokeColor": "#d0d0d0",
  "seed": "486548",
  "palette": "rose",
  "shouldRender": true,
  },
};

function startApp() {
  const mountEl = mountElRef || document.getElementById("vis");
  const uiEl = uiElRef || document.getElementById("config");
  mountElRef = mountEl;
  uiElRef = uiEl;
  appHandle = runVisualApp({
    visualId: "marbledPatterns",
    mountEl,
    uiEl,
  });
}

function remountAppWithState(stateOverrides) {
  if (!mountElRef || !uiElRef) return;
  appHandle?.instance?.destroy?.();
  appHandle = runVisualApp({
    visualId: "marbledPatterns",
    mountEl: mountElRef,
    uiEl: uiElRef,
    state: stateOverrides,
  });
}

function applyPreset(config) {
  if (!appHandle?.state) return;
  const next = config || BASE_PRESET;
  Object.entries(next).forEach(([key, value]) => {
    appHandle.state[key] = value;
  });
  appHandle.state.usePreset = false;
  appHandle.state.presetSvg = "";
  remountAppWithState(appHandle.state);
}

function wirePresetButtons() {
  const presets = [
    { id: "preset-1", config: PRESET_VARIANTS.one },
    { id: "preset-2", config: PRESET_VARIANTS.two },
    { id: "preset-3", config: PRESET_VARIANTS.three },
  ];

  presets.forEach(({ id, config }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", () => applyPreset(config));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  startApp();
  wirePresetButtons();
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;
