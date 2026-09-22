/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// helper/toolFlowHelp.js
// Ordered, reusable pipelines for the shared SVG tools.

import { el, registerTab } from "./visualHelp.js";
import { runEffectsFromUI } from "./effectsHelp.js";

const STORAGE_KEY = "visualHelp.toolFlows.v1";
const FLOW_SCHEMA_VERSION = 1;

const GRAYSCALE_COLOR = {
  selector: "circle, rect, polygon, path, line, ellipse",
  sourceProp: "fill",
  targetProp: "both",
  mode: "byLuminance",
  colorSort: "luminance",
  paletteText: "#080808, #454545, #9b9b9b, #f4f4f2",
  paletteSteps: 9,
  reversePalette: false,
  useComputed: false,
  skipNone: true,
  sizeSource: "attr",
  sizeAttr: "r",
  sizeMin: "",
  sizeMax: "",
  autoRun: false,
};

const BUILTIN_FLOWS = [
  {
    id: "builtin-grayscale",
    name: "Grayscale",
    builtin: true,
    stages: [{ kind: "effect", label: "grayscale palette", config: { effectType: "color", color: GRAYSCALE_COLOR } }],
  },
  {
    id: "builtin-mirrored-noir",
    name: "Mirrored Noir",
    builtin: true,
    stages: [
      {
        kind: "transform",
        label: "four-way mirror",
        config: {
          stack: [
            { kind: "split", count: 4 },
            { kind: "flipX", targets: [1, 3] },
            { kind: "flipY", targets: [2, 3] },
          ],
        },
      },
      { kind: "effect", label: "grayscale palette", config: { effectType: "color", color: GRAYSCALE_COLOR } },
    ],
  },
  {
    id: "builtin-echo-ink",
    name: "Echo Ink",
    builtin: true,
    stages: [
      {
        kind: "effect",
        label: "three-step path echo",
        config: {
          effectType: "scale",
          selector: "path:nth-of-type(9n)",
          elementType: "path",
          rangeMin: 0.72,
          rangeMax: 1.18,
          count: 3,
          spacing: "linear",
          opacityMode: "ramp",
          opacityMin: 0.22,
          opacityMax: 0.72,
          equation: "",
          autoRun: false,
          debug: false,
        },
      },
      { kind: "effect", label: "grayscale palette", config: { effectType: "color", color: GRAYSCALE_COLOR } },
    ],
  },
];

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = "flow") {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function normalizeStage(stage) {
  if (!stage || !["transform", "effect", "color"].includes(stage.kind)) return null;
  return {
    id: String(stage.id || makeId("stage")),
    kind: stage.kind === "color" ? "effect" : stage.kind,
    label: String(stage.label || stage.kind),
    enabled: stage.enabled !== false,
    config: stage.kind === "color" ? { effectType: "color", color: clone(stage.config || {}) } : clone(stage.config || {}),
  };
}

function normalizeFlow(flow) {
  if (!flow || typeof flow !== "object") return null;
  const stages = Array.isArray(flow.stages)
    ? flow.stages.map(normalizeStage).filter(Boolean)
    : [];
  return {
    id: String(flow.id || makeId()),
    name: String(flow.name || "Untitled flow"),
    builtin: !!flow.builtin,
    stages,
  };
}

function readSavedFlows() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.flows;
    return Array.isArray(list) ? list.map(normalizeFlow).filter(Boolean) : [];
  } catch (err) {
    console.warn("tool flows: saved library could not be read", err);
    return [];
  }
}

function writeSavedFlows(flows) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: FLOW_SCHEMA_VERSION, flows }, null, 0)
    );
    return true;
  } catch (err) {
    console.warn("tool flows: saved library could not be written", err);
    return false;
  }
}

function getFlowLibrary() {
  return [...BUILTIN_FLOWS.map(normalizeFlow), ...readSavedFlows()];
}

export function ensureToolFlowState(state) {
  if (!state.__toolFlows || typeof state.__toolFlows !== "object") {
    state.__toolFlows = {};
  }
  if (!state.__toolFlows.ui || typeof state.__toolFlows.ui !== "object") {
    state.__toolFlows.ui = {
      flowName: "My tool flow",
      selectedId: "builtin-grayscale",
      autoRun: false,
      groupsOpen: {},
    };
  }
  if (!state.__toolFlows.ui.groupsOpen || typeof state.__toolFlows.ui.groupsOpen !== "object") {
    state.__toolFlows.ui.groupsOpen = {};
  }
  if (!Array.isArray(state.__toolFlows.stages)) state.__toolFlows.stages = [];
  if (state.__toolFlows.stages.some((stage) => !stage?.id || !["transform", "effect"].includes(stage.kind))) {
    state.__toolFlows.stages = state.__toolFlows.stages.map(normalizeStage).filter(Boolean);
  }
  return state.__toolFlows;
}

export function exportToolFlowToJSON(state, pretty = true) {
  const flowState = ensureToolFlowState(state);
  return JSON.stringify(
    {
      schemaVersion: FLOW_SCHEMA_VERSION,
      name: String(flowState.ui.flowName || "Untitled flow"),
      stages: flowState.stages,
    },
    null,
    pretty ? 2 : 0
  );
}

export function importToolFlowFromJSON(text, state) {
  const parsed = typeof text === "string" ? JSON.parse(text) : text;
  const source = parsed?.flow && typeof parsed.flow === "object" ? parsed.flow : parsed;
  const flow = normalizeFlow(source);
  if (!flow) throw new Error("Invalid tool flow JSON.");
  const flowState = ensureToolFlowState(state);
  flowState.ui.flowName = flow.name;
  flowState.stages = flow.stages;
  return flow;
}

export function setToolFlowStages(state, stages) {
  const flowState = ensureToolFlowState(state);
  flowState.stages = Array.isArray(stages)
    ? stages.map(normalizeStage).filter(Boolean)
    : [];
  return flowState.stages;
}

function snapshotCurrentTransform(state) {
  return {
    stack: clone(state.__xf?.stack || []),
    ui: clone(state.__xf?.ui || {}),
  };
}

function snapshotCurrentEffect(state) {
  return clone(state.__effects?.ui || { effectType: "scale", autoRun: false });
}

function stageDescription(stage) {
  if (stage.kind === "transform") {
    const count = Array.isArray(stage.config?.stack) ? stage.config.stack.length : 0;
    return `${count} transform op${count === 1 ? "" : "s"}`;
  }
  if (stage.kind === "effect") return String(stage.config?.effectType || "effect");
  return "effect";
}

export function applyToolFlow({ mountEl, state, xfRuntime, statusEl, stages } = {}) {
  const flowState = ensureToolFlowState(state);
  const pipeline = (Array.isArray(stages) ? stages : flowState.stages)
    .map(normalizeStage)
    .filter((stage) => stage && stage.enabled !== false);

  if (!pipeline.length) {
    if (statusEl) statusEl.textContent = "This flow has no enabled stages.";
    return { ok: false, applied: 0 };
  }

  let applied = 0;
  for (const stage of pipeline) {
    if (stage.kind === "transform") {
      if (!state.__xf || typeof state.__xf !== "object") state.__xf = { ui: {}, stack: [] };
      state.__xf.stack = clone(stage.config?.stack || []);
      if (stage.config?.ui && typeof stage.config.ui === "object") {
        Object.assign(state.__xf.ui || (state.__xf.ui = {}), clone(stage.config.ui));
      }
      xfRuntime?.rebuildNow?.();
    } else if (stage.kind === "effect") {
      // Run snapshots in isolated tool state so cached editors retain their live objects.
      const effectState = { ...state, __effects: { ui: { ...clone(stage.config || {}), autoRun: false } } };
      const result = runEffectsFromUI({ mountEl, state: effectState, xfRuntime, statusEl });
      if (result?.ok === false) return { ok: false, applied };
    }
    applied += 1;
  }

  if (statusEl) statusEl.textContent = `flow applied: ${applied} stage${applied === 1 ? "" : "s"}.`;
  return { ok: true, applied };
}

export function applyToolFlowToSubtree({ mountEl, state, xfRuntime } = {}) {
  if (!state?.__toolFlows?.ui?.autoRun) return;
  applyToolFlow({ mountEl, state, xfRuntime });
}

function downloadText(text, fileName) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function buildToolFlowPanel({ mountEl, state, xfRuntime, onStateChange }) {
  const flowState = ensureToolFlowState(state);
  const ui = flowState.ui;
  const root = el("div", { className: "fx-panel tool-flow-panel" });
  const status = el("div", { className: "fx-msg", textContent: "" });
  const markDirty = () => onStateChange?.();

  const group = (title, nodes, openByDefault = false) => {
    const stored = ui.groupsOpen[title];
    const wrap = el("details", {
      className: "vr-paramGroup",
      open: typeof stored === "boolean" ? stored : openByDefault,
    });
    wrap.appendChild(el("summary", { className: "vr-paramGroupTitle", textContent: title }));
    wrap.appendChild(el("div", { className: "vr-paramGroupBody" }, nodes));
    wrap.addEventListener("toggle", () => {
      ui.groupsOpen[title] = wrap.open;
      markDirty();
    });
    return wrap;
  };

  const row = (label, node, help = "") => {
    const wrap = el("div", { className: "vr-row" });
    wrap.appendChild(el("div", { className: "vr-label", textContent: label }));
    if (help) wrap.appendChild(el("div", { className: "vr-help", textContent: help }));
    wrap.appendChild(el("div", { className: "vr-input" }, [node]));
    return wrap;
  };

  const renderPanel = () => {
    root.replaceChildren();

    const autoRun = el("input", { type: "checkbox" });
    autoRun.checked = !!ui.autoRun;
    autoRun.onchange = () => {
      ui.autoRun = autoRun.checked;
      markDirty();
    };

    const addRow = el("div", { className: "tool-flow-actions" });
    const addStage = (kind, label, config) => {
      flowState.stages.push(normalizeStage({ kind, label, config }));
      markDirty();
      renderPanel();
    };

    const addTransform = el("button", { type: "button", textContent: "+ transforms" });
    addTransform.onclick = () => addStage("transform", "transform snapshot", snapshotCurrentTransform(state));
    const addEffect = el("button", { type: "button", textContent: "+ current effect" });
    addEffect.onclick = () => {
      const config = snapshotCurrentEffect(state);
      addStage("effect", `${config.effectType || "effect"} snapshot`, config);
    };
    addRow.append(addTransform, addEffect);

    const stageList = el("div", { className: "tool-flow-stage-list" });
    if (!flowState.stages.length) {
      stageList.appendChild(el("div", {
        className: "vr-help",
        textContent: "Build a chain from the current Transforms and Effects tabs, including the Color effect.",
      }));
    }
    flowState.stages.forEach((stage, index) => {
      const card = el("div", { className: "tool-flow-stage" });
      const enabled = el("input", { type: "checkbox" });
      enabled.checked = stage.enabled !== false;
      enabled.onchange = () => {
        stage.enabled = enabled.checked;
        markDirty();
      };
      const title = el("div", {
        className: "tool-flow-stage-title",
        textContent: `${index + 1}. ${stage.label}`,
      });
      const meta = el("div", {
        className: "tool-flow-stage-meta",
        textContent: `${stage.kind} · ${stageDescription(stage)}`,
      });
      const copy = el("div", { className: "tool-flow-stage-copy" }, [title, meta]);
      const buttons = el("div", { className: "tool-flow-stage-buttons" });
      const up = el("button", { type: "button", textContent: "↑", disabled: index === 0 });
      up.onclick = () => {
        if (index <= 0) return;
        [flowState.stages[index - 1], flowState.stages[index]] = [flowState.stages[index], flowState.stages[index - 1]];
        markDirty();
        renderPanel();
      };
      const down = el("button", {
        type: "button",
        textContent: "↓",
        disabled: index === flowState.stages.length - 1,
      });
      down.onclick = () => {
        if (index >= flowState.stages.length - 1) return;
        [flowState.stages[index + 1], flowState.stages[index]] = [flowState.stages[index], flowState.stages[index + 1]];
        markDirty();
        renderPanel();
      };
      const remove = el("button", { type: "button", textContent: "×", title: "Remove stage" });
      remove.onclick = () => {
        flowState.stages.splice(index, 1);
        markDirty();
        renderPanel();
      };
      buttons.append(up, down, remove);
      card.append(enabled, copy, buttons);
      stageList.appendChild(card);
    });

    const applyRow = el("div", { className: "tool-flow-actions" });
    const applyBtn = el("button", { type: "button", textContent: "apply chain" });
    applyBtn.onclick = () => applyToolFlow({ mountEl, state, xfRuntime, statusEl: status });
    const clearBtn = el("button", { type: "button", textContent: "clear chain" });
    clearBtn.onclick = () => {
      flowState.stages = [];
      markDirty();
      renderPanel();
    };
    applyRow.append(applyBtn, clearBtn);

    const nameInput = el("input", { type: "text", value: ui.flowName || "My tool flow" });
    nameInput.oninput = () => {
      ui.flowName = nameInput.value;
      markDirty();
    };

    const library = getFlowLibrary();
    const select = el("select");
    library.forEach((flow) => {
      select.appendChild(el("option", {
        value: flow.id,
        textContent: flow.builtin ? `${flow.name} · built in` : flow.name,
      }));
    });
    if (library.some((flow) => flow.id === ui.selectedId)) select.value = ui.selectedId;
    else if (library[0]) select.value = library[0].id;
    select.onchange = () => {
      ui.selectedId = select.value;
      markDirty();
    };

    const libraryButtons = el("div", { className: "tool-flow-actions" });
    const loadBtn = el("button", { type: "button", textContent: "load" });
    loadBtn.onclick = () => {
      const selected = getFlowLibrary().find((flow) => flow.id === select.value);
      if (!selected) return;
      flowState.stages = clone(selected.stages).map(normalizeStage).filter(Boolean);
      ui.flowName = selected.name;
      ui.selectedId = selected.id;
      markDirty();
      renderPanel();
    };
    const loadApplyBtn = el("button", { type: "button", textContent: "load + apply" });
    loadApplyBtn.onclick = () => {
      const selected = getFlowLibrary().find((flow) => flow.id === select.value);
      if (!selected) return;
      flowState.stages = clone(selected.stages).map(normalizeStage).filter(Boolean);
      ui.flowName = selected.name;
      ui.selectedId = selected.id;
      markDirty();
      applyToolFlow({ mountEl, state, xfRuntime, statusEl: status });
      renderPanel();
    };
    libraryButtons.append(loadBtn, loadApplyBtn);

    const saveButtons = el("div", { className: "tool-flow-actions" });
    const saveBtn = el("button", { type: "button", textContent: "save to library" });
    saveBtn.onclick = () => {
      const name = String(nameInput.value || "Untitled flow").trim() || "Untitled flow";
      const saved = readSavedFlows();
      const currentSelected = saved.find((flow) => flow.id === ui.selectedId);
      const id = currentSelected?.id || makeId();
      const next = normalizeFlow({ id, name, stages: flowState.stages });
      const index = saved.findIndex((flow) => flow.id === id);
      if (index >= 0) saved[index] = next;
      else saved.push(next);
      writeSavedFlows(saved);
      ui.flowName = name;
      ui.selectedId = id;
      status.textContent = `saved “${name}” to this browser.`;
      markDirty();
      renderPanel();
    };
    const deleteBtn = el("button", { type: "button", textContent: "delete saved" });
    deleteBtn.onclick = () => {
      const saved = readSavedFlows();
      const selected = saved.find((flow) => flow.id === select.value);
      if (!selected) {
        status.textContent = "Built-in flows cannot be deleted.";
        return;
      }
      writeSavedFlows(saved.filter((flow) => flow.id !== selected.id));
      ui.selectedId = BUILTIN_FLOWS[0].id;
      status.textContent = `deleted “${selected.name}”.`;
      markDirty();
      renderPanel();
    };
    saveButtons.append(saveBtn, deleteBtn);

    const ioButtons = el("div", { className: "tool-flow-actions" });
    const exportBtn = el("button", { type: "button", textContent: "export flow JSON" });
    exportBtn.onclick = () => {
      const slug = String(ui.flowName || "tool-flow").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      downloadText(exportToolFlowToJSON(state), `${slug || "tool-flow"}.flow.json`);
    };
    const importInput = el("input", { type: "file", accept: "application/json,.json" });
    importInput.style.display = "none";
    importInput.onchange = async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        importToolFlowFromJSON(await file.text(), state);
        status.textContent = `loaded ${flowState.stages.length} stages from ${file.name}.`;
        markDirty();
        renderPanel();
      } catch (err) {
        status.textContent = `flow import failed: ${err?.message || err}`;
        status.classList.add("error");
      }
    };
    const importBtn = el("button", { type: "button", textContent: "import flow JSON" });
    importBtn.onclick = () => importInput.click();
    ioButtons.append(exportBtn, importBtn, importInput);

    root.append(
      status,
      row("auto run", autoRun, "Reapply this ordered chain after the visual renders."),
      group("Chain", [addRow, stageList, applyRow], true),
      group("Saved flows", [
        row("flow name", nameInput),
        row("library", select, "Built-ins plus flows saved in local storage."),
        libraryButtons,
        saveButtons,
      ], true),
      group("Portable JSON", [ioButtons], false)
    );
  };

  renderPanel();
  return root;
}

export function registerToolFlowTab() {
  registerTab("flows", ({ mountEl, state, xfRuntime, onStateChange }) =>
    buildToolFlowPanel({ mountEl, state, xfRuntime, onStateChange })
  );
}
