/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

import { registerVisual, runVisualApp } from "../helper/visualHelp.js";
import { preloadLinkedSettings } from "../helper/linkedSettings.js";
import { createInnerLight } from "./InnerLight.js";

const instances = new WeakMap();
const paramClass = (key) => `innerlight-${key.replaceAll(".", "-")}`;
const params = [
  ...[
    ["circle", "Circles", true],
    ["square", "Diamonds", false],
    ["rect", "Rectangles", true],
    ["prism", "Packed circles", false],
    ["user", "Custom shapes", false],
  ].map(([key, label, value]) => ({
    key: `shapes.${key}`, label, type: "boolean", default: value, category: "Shapes",
  })),
  {
    key: "motionEnabled", label: "Enable motion", type: "boolean", default: true,
    category: "Interaction",
    description: "Move your pointer or drag across the drawing to add color. Press Space to pause or resume motion.",
  },
  ...[["forwardWave", "Forward wave", "forward"], ["reverseWave", "Reverse wave", "reverse"]].map(([key, label, direction]) => ({
    key, label, type: "button", category: "Interaction",
    onClick: ({ state }) => instances.get(state)?.animate(direction),
  })),
  {
    key: "custom.shapeType", label: "Shape type", type: "select", default: "circle",
    options: ["circle", "rect", "polygon"], category: "Custom shape",
    description: "Custom shape settings update live when Custom shapes is enabled.",
  },
  ...[
    ["numElements", "Number of elements", 50, 1, 500, 1],
    ["numSides", "Polygon sides", 6, 3, 32, 1],
    ["radius", "Radius", 50, 1, 1000, 1],
    ["incrementSize", "Size increment", 10, 0, 100, 1],
    ["dynamicSize", "Hover width / grid variation", 10, 0, 100, 1],
  ].map(([key, label, value, min, max, step]) => ({
    key: `custom.${key}`, label, type: "number", default: value, min, max, step, category: "Custom shape",
  })),
  ...[
    ["strokeWidth", "Stroke width", "2px", "Use an SVG width such as 2px or 0.5vh."],
    ["strokeColor", "Stroke color", "#ffffff", "Use a color name or hex value."],
    ["fillColor", "Fill color", "none", "Use a color name, hex value, or none for outlines."],
  ].map(([key, label, value, description]) => ({
    key: `custom.${key}`, label, type: "text", default: value, category: "Custom style", description,
  })),
  {
    key: "custom.fillOpacity", label: "Fill opacity", type: "number", default: 1,
    min: 0, max: 1, step: 0.1, category: "Custom style",
  },
  ...[["xDivisions", "Columns"], ["yDivisions", "Rows"]].map(([key, label]) => ({
    key: `custom.${key}`, label, type: "number", default: 10,
    min: 1, max: 100, step: 1, category: "Rectangle grid",
  })),
  {
    key: "updateShape", label: "Update shape", type: "button", category: "Custom shape",
    description: "Apply these settings and enable Custom shapes.",
    onClick: ({ state }) => { state.shapes.user = true; },
  },
].map((param) => ({ ...param, cssClass: paramClass(param.key) }));

registerVisual("innerLight", {
  title: "Inner Light",
  description: "Paint with light by moving across layered shapes, or send a color wave through them.",
  simulation: { param: "motionEnabled" },
  params,
  create(ctx, state) {
    const instance = createInnerLight({ ...ctx, onResize: () => app.refresh() }, state);
    instances.set(state, instance);
    return {
      ...instance,
      destroy() {
        instances.delete(state);
        instance.destroy();
      },
    };
  },
});

const linkedSettingsReady = await preloadLinkedSettings("innerLight");
export const app = linkedSettingsReady ? runVisualApp({
  visualId: "innerLight",
  mountEl: document.getElementById("vis"),
  uiEl: document.getElementById("config"),
}) : null;

document.getElementById("button-exit").addEventListener("click", () => {
  window.location.href = "../";
});

// Give generated controls stable accessible names without a second set of UI.
const config = document.getElementById("config");
function syncControls() {
  for (const param of params) {
    const row = config.querySelector(`.vr-row.${param.cssClass}`);
    if (!row) continue;
    row._sync?.();
    const fields = row.querySelectorAll("input, select");
    fields.forEach((field, index) => {
      field.id = `${param.cssClass}-${index}`;
      field.setAttribute("aria-label", `${param.label}${field.type === "range" ? " slider" : ""}`);
    });
    const label = row.querySelector("label");
    if (label && fields.length) label.htmlFor = fields[fields.length - 1].id;
  }
  document.getElementById("button-info").setAttribute("aria-expanded", String(config.classList.contains("open")));
}
new MutationObserver(syncControls).observe(config, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
config.addEventListener("change", syncControls);
config.addEventListener("click", syncControls);
syncControls();
