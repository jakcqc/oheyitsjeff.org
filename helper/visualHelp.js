/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// visual_registry.js
// A tiny framework for:
// - registering visuals in a record
// - describing editable params (with optional min/max/step + cssClass)
// - auto-building a UI to edit them
import { ensureTransformState,initTransformRuntime,buildTransformPanel} from "../helper/transformHelp.js";
import { registerTransformTab } from "../helper/transformHelp.js";
import { applyPropOpsToSubtree, applyScriptOpsToSubtree } from "../helper/svgEditor.js";
import { registerPropOpsTab, registerScriptOpsTab } from "../helper/svgEditor.js";
import { registerAnimateTab, maybeAutoplayAnimation, controlAnimation } from "../helper/animationHelp.js";
import { registerLLMTab } from "../helper/llmTab.js";
import { registerEffectsTab, applyEffectsToSubtree } from "../helper/effectsHelp.js";
import { registerAutoExportTab } from "../helper/autoExportHelp.js";
import { registerToolFlowTab, applyToolFlowToSubtree } from "../helper/toolFlowHelp.js";
import { createSubTabs } from "./subTabs.js";
import { mountDockTabs } from "./tabDock.js";
import { activateDockTab, normalizeDockLayout } from "./tabDockModel.js";
import { acceptTypedNumber, getParamRange } from "./paramRanges.js";
import { matchesParamVisibility } from "./paramVisibility.js";
import { consumeLinkedSettings } from "./linkedSettings.js";

const TAB_BUILDERS = new Map();
let ACTIVE_UNDO_CONTEXT = null;
let undoListenerAttached = false;

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return !!target.closest?.("[contenteditable=\"true\"]");
}

function handleUndoKeydown(event) {
  if (!ACTIVE_UNDO_CONTEXT) return;
  if (event.defaultPrevented) return;
  if (event.shiftKey) return;
  if (!(event.ctrlKey || event.metaKey)) return;
  if (String(event.key).toLowerCase() !== "z") return;
  if (isEditableTarget(event.target)) return;
  const didUndo = ACTIVE_UNDO_CONTEXT.undo?.();
  if (didUndo) event.preventDefault();
}

function setActiveUndoContext(ctx) {
  ACTIVE_UNDO_CONTEXT = ctx;
  if (!undoListenerAttached && typeof window !== "undefined") {
    window.addEventListener("keydown", handleUndoKeydown);
    window.addEventListener("keydown", handlePlaybackKeydown);
    undoListenerAttached = true;
  }
}

/**
 * Register a tab builder that will appear alongside the built-in "params" tab.
 * @param {string} tabName
 * @param {(ctx: { mountEl: HTMLElement, spec: any, state: any, xfRuntime: any, onChange?: Function, onStateChange?: Function }) => HTMLElement} build
 */
export function registerTab(tabName, build) {
  if (!tabName) throw new Error("registerTab: tabName is required");
  if (typeof build !== "function") throw new Error("registerTab: build must be a function");
  if (TAB_BUILDERS.has(tabName)) throw new Error(`registerTab: duplicate tab "${tabName}"`);
  TAB_BUILDERS.set(tabName, build);
}

function buildRegisteredTabs(ctx) {
  /** @type {Record<string, () => HTMLElement>} */
  const extraTabs = {};
  const developerTabs = {};
  for (const [tabName, build] of TAB_BUILDERS.entries()) {
    const target = tabName === "propOps" || tabName === "autoExport" ? developerTabs : extraTabs;
    target[tabName] = () => build(ctx);
  }
  // Preserve the selected editor when opening settings saved before Developer existed.
  if (ctx.state?.__ui && developerTabs[ctx.state.__ui.activeTab]) {
    ctx.state.__ui.developerTab = ctx.state.__ui.activeTab;
    ctx.state.__ui.activeTab = "developer";
    if (ctx.state.__ui.dockLayout) {
      ctx.state.__ui.dockLayout = activateDockTab(
        normalizeDockLayout(ctx.state.__ui.dockLayout, ["params", ...Object.keys(extraTabs), "developer"]),
        "developer"
      );
    }
  }
  extraTabs.developer = () => buildDeveloperPanel(ctx, developerTabs);
  return extraTabs;
}

function handlePlaybackKeydown(event) {
  if (!ACTIVE_UNDO_CONTEXT || event.defaultPrevented || event.repeat ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || isEditableTarget(event.target)) return;
  const key = String(event.key).toLowerCase();
  if (key === "p" || key === "r") {
    ACTIVE_UNDO_CONTEXT.animate?.(key === "p" ? "toggle" : "restart");
    event.preventDefault();
  } else if (event.code === "Space" || key === " ") {
    // Space retains native activation when a button or link has focus.
    if (event.target?.closest?.('button, a, [role="button"], [role="tab"]')) return;
    if (ACTIVE_UNDO_CONTEXT.toggleSimulation?.()) event.preventDefault();
  }
}

function buildDeveloperPanel({ state, developerControls, onUiChange }, builders) {
  const root = el("div", { className: "vr-developerPanel" });
  const uiState = state.__ui || (state.__ui = {});
  const sections = { settings: () => developerControls || el("div"), ...builders };
  const panels = new Map();
  const wrappers = new Map();
  let active = Object.hasOwn(sections, uiState.developerTab) ? uiState.developerTab : "settings";
  uiState.developerTab = active;
  const show = (name) => {
    if (name !== active) panels.get(active)?._onHide?.();
    active = name;
    uiState.developerTab = name;
    if (!panels.has(name)) {
      const panel = sections[name]();
      panels.set(name, panel);
      wrappers.get(name).appendChild(panel);
    }
    panels.get(name)?._onShow?.();
  };
  const options = Object.keys(sections).map((name) => {
    const panel = el("div", { className: "vr-developerSection" });
    panel.dataset.developerSection = name;
    wrappers.set(name, panel);
    return { value: name, label: name === "settings" ? "Settings" : name, panel };
  });
  const tabs = createSubTabs({
    label: "Developer tools",
    options,
    value: active,
    onChange: (name) => { show(name); onUiChange?.(); },
  });
  root.append(tabs.root, ...wrappers.values());
  show(active);
  root._onShow = () => panels.get(active)?._onShow?.();
  root._onHide = () => panels.get(active)?._onHide?.();
  root._destroy = () => {
    for (const panel of panels.values()) panel._destroy?.();
    panels.clear();
  };
  return root;
}

registerTransformTab();
registerPropOpsTab();
//registerScriptOpsTab();
registerAnimateTab();
registerLLMTab();
registerEffectsTab();
registerToolFlowTab();
registerAutoExportTab();

export function exportStateToJSON(state) {
  return stringifyState(state, true);
}

const SETTINGS_CACHE_PREFIX = "visualHelp.settings.v1:";
const UI_CACHE_PREFIX = "visualHelp.ui.v1:";
const PERSIST_CACHE_PREFIX = "visualHelp.persist.v1:";

function readCache(key) {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn("visualHelp: cache read failed", err);
    return null;
  }
}

function writeCache(key, value) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn("visualHelp: cache write failed", err);
    return false;
  }
}

function removeCache(key) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    console.warn("visualHelp: cache remove failed", err);
    return false;
  }
}

function getSettingsCacheKey(visualId) {
  return `${SETTINGS_CACHE_PREFIX}${visualId}`;
}

function getUiCacheKey(visualId) {
  return `${UI_CACHE_PREFIX}${visualId}`;
}

function getPersistCacheKey(visualId) {
  return `${PERSIST_CACHE_PREFIX}${visualId}`;
}

function loadSettingsCache(visualId) {
  if (!visualId) return null;
  const raw = readCache(getSettingsCacheKey(visualId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    console.warn("visualHelp: cache parse failed", err);
    return null;
  }
}

function saveSettingsCache(visualId, state) {
  if (!visualId) return false;
  return writeCache(getSettingsCacheKey(visualId), stringifyState(state));
}

function clearSettingsCache(visualId) {
  if (!visualId) return false;
  return removeCache(getSettingsCacheKey(visualId));
}

function loadUiCache(visualId) {
  if (!visualId) return null;
  const raw = readCache(getUiCacheKey(visualId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    console.warn("visualHelp: ui cache parse failed", err);
    return null;
  }
}

function saveUiCache(visualId, uiState) {
  if (!visualId || !uiState) return false;
  return writeCache(getUiCacheKey(visualId), JSON.stringify(uiState));
}

function clearUiCache(visualId) {
  if (!visualId) return false;
  return removeCache(getUiCacheKey(visualId));
}

function loadPersistFlag(visualId) {
  if (!visualId) return true;
  const raw = readCache(getPersistCacheKey(visualId));
  if (raw == null) return true;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return !!raw;
}

function savePersistFlag(visualId, allowed) {
  if (!visualId) return false;
  return writeCache(getPersistCacheKey(visualId), allowed ? "1" : "0");
}

const HISTORY_STACK_LIMIT = 100;

function stringifyState(state, pretty = false) {
  return JSON.stringify(
    state,
    (key, value) => (key === "__history" ? undefined : value),
    pretty ? 2 : 0
  );
}

function ensureStateHistory(state) {
  if (!state.__history || typeof state.__history !== "object") {
    state.__history = {
      past: [],
      future: [],
      last: null,
      limit: HISTORY_STACK_LIMIT,
      suspend: 0,
    };
  }
  const history = state.__history;
  if (!Array.isArray(history.past)) history.past = [];
  if (!Array.isArray(history.future)) history.future = [];
  if (!Number.isFinite(history.limit)) history.limit = HISTORY_STACK_LIMIT;
  if (!Number.isFinite(history.suspend)) history.suspend = 0;
  return history;
}

function getHistorySnapshot(state) {
  try {
    return stringifyState(state, false);
  } catch (err) {
    console.warn("visualHelp: history snapshot failed", err);
    return null;
  }
}

function recordHistory(state, history) {
  if (!history || history.suspend > 0) return;
  const next = getHistorySnapshot(state);
  if (!next) return;
  if (history.last == null) {
    history.last = next;
    return;
  }
  if (next === history.last) return;
  history.past.push(history.last);
  if (history.past.length > history.limit) history.past.shift();
  history.future.length = 0;
  history.last = next;
}

function applyHistorySnapshot(state, history, snapshot) {
  if (!snapshot) return false;
  let nextState = null;
  try {
    nextState = JSON.parse(snapshot);
  } catch (err) {
    console.warn("visualHelp: history restore failed", err);
    return false;
  }
  const preservedHistory = history;
  replaceStateContents(state, nextState);
  if (preservedHistory) state.__history = preservedHistory;
  if (history) history.last = snapshot;
  return true;
}

function withHistorySuspended(history, fn) {
  if (!history) return fn();
  history.suspend += 1;
  try {
    return fn();
  } finally {
    history.suspend = Math.max(0, history.suspend - 1);
  }
}
export function getVisualParamsTree(spec, state) {
  const out = {};

  for (const p of spec.params || []) {
    setByPath(out, p.key, getByPath(state, p.key));
  }

  return out;
}

function coerceBooleanLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(raw)) return true;
    if (["0", "false", "no", "off"].includes(raw)) return false;
  }
  return !!value;
}

function coerceImportedParamValue(param, value) {
  if (!param) return value;
  switch (param.type) {
    case "number":
      return toNumber(value, toNumber(param.default, 0));
    case "boolean":
      return coerceBooleanLike(value);
    case "text":
    case "select":
      return value == null ? "" : String(value);
    case "vector2D":
      return normalizeVector(value, normalizeVector(param.default, { x: 0, y: 0 }, 2), 2);
    case "vector3D":
      return normalizeVector(value, normalizeVector(param.default, { x: 0, y: 0, z: 0 }, 3), 3);
    default:
      return value;
  }
}

function specHasParamKey(spec, key) {
  return !!(spec?.params || []).find((p) => p?.key === key);
}

function applyStateKeyAliasesBySpec(nextState, spec) {
  if (!nextState || typeof nextState !== "object" || !spec) return;
  const aliasPairs = [
    ["presetCount", "proceduralShapeCount"],
    ["presetScale", "proceduralScale"],
    ["spawnSpread", "proceduralSpread"],
    ["spawnBaseRatio", "proceduralBaseRatio"],
    ["shapeYawSteps", "proceduralYawSteps"],
  ];

  for (const [a, b] of aliasPairs) {
    const hasA = specHasParamKey(spec, a);
    const hasB = specHasParamKey(spec, b);
    if (!hasA && !hasB) continue;

    const aVal = getByPath(nextState, a);
    const bVal = getByPath(nextState, b);

    if (hasA && aVal === undefined && bVal !== undefined) {
      setByPath(nextState, a, bVal);
    }
    if (hasB && bVal === undefined && aVal !== undefined) {
      setByPath(nextState, b, aVal);
    }
  }
}

function coerceImportedStateBySpec(nextState, spec) {
  if (!nextState || typeof nextState !== "object") return;
  if (!spec || !Array.isArray(spec.params)) return;
  applyStateKeyAliasesBySpec(nextState, spec);
  for (const param of spec.params) {
    const current = getByPath(nextState, param.key);
    if (current === undefined) continue;
    setByPath(nextState, param.key, coerceImportedParamValue(param, current));
  }
}

export function importStateFromJSON(json, state, spec = null) {
  const parsed = JSON.parse(json);
  coerceImportedStateBySpec(parsed, spec);
  if (state.__anim) controlAnimation({ state }, "stop");
  // A saved range map describes the complete set of overrides in that save.
  if (Object.hasOwn(parsed, "__paramRanges")) state.__paramRanges = {};
  mergeInto(state, parsed);
  return parsed;
}

function mergeInto(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      if (
        !target[key] ||
        typeof target[key] !== "object" ||
        Array.isArray(target[key])
      ) {
        target[key] = {};
      }
      mergeInto(target[key], value);
    } else {
      // primitives + arrays replace directly
      target[key] = value;
    }
  }
}

function replaceStateContents(target, nextState) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, nextState);
}

export function makeSaveSettingsButton(state, visualId) {
  const btn = document.createElement("button");
  btn.textContent = "Save Settings";
  btn.type = "button";
  btn.classList.add("btn-inline");

  btn.onclick = () => {
    const blob = new Blob(
      [exportStateToJSON(state)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${visualId}.settings.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return btn;
}
export function makeLoadSettingsButton(state, onChange, spec = null) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.style.display = "none";

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    const text = await file.text();
    importStateFromJSON(text, state, spec);
    onChange?.(); // force rerender + UI sync
  };

  const btn = document.createElement("button");
  btn.textContent = "Load Settings";
  btn.type = "button";
  btn.classList.add("btn-inline");

  btn.onclick = () => input.click();
  
  return el("", {}, [btn, input]);
}

export function mountUserTabs(options) {
  return mountDockTabs(options);
}

/** Mount auto-UI for a spec. Returns { state, rerenderUI }. */
export function mountAutoUI({
  container,
  spec,
  state,
  onChange,
  onStateChange,
  onUiChange,
  mountEl,
  xfRuntime,
  onUndo,
  visualId,
  transaction,
  developerControls,
}) {
  container._destroyTabs?.();
  container.innerHTML = "";

  mountUserTabs({
    container,
    spec,
    state,
    onChange,
    buildParamsPanel: () => buildParamsPanel({ spec, state, onChange, onUiChange }),
    extraTabs: buildRegisteredTabs({
      mountEl, spec, state, xfRuntime, onChange, onStateChange, visualId, onUiChange, developerControls,
      refreshPanels: () => container._refreshPanels?.("assistant"),
      undo: onUndo,
      transaction,
    }),
    onUiChange,
  });

  return {
    state,
    rerenderUI: () =>
      mountAutoUI({ container, spec, state, onChange, onStateChange, onUiChange, mountEl, xfRuntime, onUndo, visualId, transaction, developerControls }),
  };
}

function buildParamsPanel({ spec, state, onChange, onUiChange }) {
  const panel = document.createElement("div");
  const groups = new Map();
  const uiState = state?.__ui || {};
  if (state && !state.__ui) state.__ui = uiState;
  if (!uiState.paramGroups || typeof uiState.paramGroups !== "object") {
    uiState.paramGroups = {};
  }
  if (uiState.collapseParamsByDefault == null) uiState.collapseParamsByDefault = true;
  const collapseByDefault = !!uiState.collapseParamsByDefault;

  for (const param of spec.params || []) {
    const rawCategory = typeof param.category === "string" ? param.category.trim() : "";
    const category = rawCategory || "General";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(param);
  }

  for (const [category, params] of groups.entries()) {
    const storedOpen = uiState.paramGroups[category];
    const isOpen = typeof storedOpen === "boolean" ? storedOpen : !collapseByDefault;
    const group = el("details", { className: "vr-paramGroup", open: isOpen });
    const summary = el("summary", { className: "vr-paramGroupTitle", textContent: category });
    const body = el("div", { className: "vr-paramGroupBody" });

    group.addEventListener("toggle", () => {
      uiState.paramGroups[category] = group.open;
      onUiChange?.();
    });

    for (const param of params) {
      body.appendChild(buildControl({ param, state, onChange }));
    }

    group.appendChild(summary);
    group.appendChild(body);
    group._controlState = state;
    group._syncVisibility = () => { group.hidden = [...body.children].every(row => row.hidden); };
    group._syncVisibility();
    panel.appendChild(group);
  }

  panel._onShow = () => {
    for (const control of panel.querySelectorAll(".vr-row")) control._sync?.();
  };
  return panel;
}

/**
 * @typedef {"number"|"boolean"|"select"|"text"|"vector2D"|"vector3D"|"button"} ParamType
 */

/**
 * @typedef {Object} ParamSpec
 * @property {string} key                  - Param key (supports dot paths like "view.centerRe")
 * @property {string} [label]              - UI label (defaults to key)
 * @property {ParamType} type
 * @property {any} default
 * @property {string} [description]        - Small helper text under control
 * @property {string} [cssClass]           - Optional CSS class added to wrapper + input
 * @property {string} [category]           - Optional UI grouping label
 * @property {number|{x:number,y:number,z?:number}} [min] - Slider bounds; vectors may declare bounds per axis
 * @property {number|{x:number,y:number,z?:number}} [max]
 * @property {number} [step]
 * @property {string[]} [options]          - For type="select"
 * @property {Object<string, string|number|boolean|Array<string|number|boolean>>} [shouldShowWhen] - Selector paths mapped to allowed values (AND across paths, OR within arrays)
 */

/**
 * @typedef {Object} VisualSpec
 * @property {string} title
 * @property {string} description
 * @property {ParamSpec[]} params
 * @property {{param:string,runningValue?:boolean}} [simulation] - Native simulation run flag toggled by Space
 * @property {(ctx: { mountEl: HTMLElement }, state: any) => VisualInstance} create
 * @property {any} [defaultState]          - Optional default state overrides (merged after param defaults)
 * @property {any} [data]                  - Whatever “data object” you want to store alongside params
 */

/**
 * @typedef {Object} VisualInstance
 * @property {() => void} [destroy]
 * @property {() => void} [render]         - Called after param changes (if provided)
 */

export const VISUALS = /** @type {Record<string, VisualSpec>} */ ({});

export function exportVisualUIJsonSpec(visualId) {
  const spec = VISUALS[visualId];
  if (!spec) throw new Error(`exportVisualUIJsonSpec: unknown visualId "${visualId}"`);

  return {
    visualId,
    title: spec.title,
    description: spec.description,
    params: (spec.params || []).map((p) => ({
      key: p.key,
      label: p.label ?? null,
      type: p.type,
      default: p.default,
      description: p.description ?? null,
      cssClass: p.cssClass ?? null,
      category: typeof p.category === "string" ? p.category : null,
      min: typeof p.min === "number" ? p.min : null,
      max: typeof p.max === "number" ? p.max : null,
      step: typeof p.step === "number" ? p.step : null,
      options: Array.isArray(p.options) ? p.options : null,
      shouldShowWhen: p.shouldShowWhen ?? null,
    })),
  };
}

export function downloadVisualUIJson(visualId) {
  const specJson = exportVisualUIJsonSpec(visualId);
  const blob = new Blob([JSON.stringify(specJson, null, 2) + "\n"], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${visualId}.ui.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Register a visual into the record.
 * @param {string} id
 * @param {VisualSpec} spec
 * @param {{ exportUIJson?: false | "download" }} [options]
 */
export function registerVisual(id, spec, options) {
  if (!id) throw new Error("registerVisual: id is required");
  if (VISUALS[id]) throw new Error(`registerVisual: duplicate id "${id}"`);
  VISUALS[id] = spec;
  console.table(spec.params);
  if (options?.exportUIJson === "download") {
    try {
      downloadVisualUIJson(id);
    } catch (err) {
      console.warn(`registerVisual: failed to download UI json for "${id}"`, err);
    }
  }
}

/** Create a fresh state object from a spec’s defaults. */
export function makeDefaultState(spec) {
  const state = {};
  for (const p of spec.params || []) setByPath(state, p.key, clone(p.default));
  // attach arbitrary spec.data under a stable place if you want:
  if (spec.data !== undefined) state.__data = spec.data;
  state.shouldRender = true;
  state.overrideMinMax = true;
  state.__paramRanges = {};
    // --- transforms state (UI + stack) ---
  state.__xf = {
    ui: {
      splitCount: 1,     // 2 => side-by-side, 4 => 2x2 grid, etc
      activeTile: "0",   // select stores strings
      rotateDeg: 90,
    },
    stack: [],           // [{ kind, ...payload }]
  };
  if (spec.defaultState && typeof spec.defaultState === "object") {
    mergeInto(state, spec.defaultState);
  }

  return state;
}
/* --------------------------- UI building --------------------------- */
export function mountVisualUI({
  uiEl,
  spec,
  state,
  mountEl,
  xfRuntime,
  instance,
  runtimeRef,
  ensureRuntime,
  visualId,
  startPaused = false,
}) {
  uiEl.querySelector(".vr-autoUI")?._destroyTabs?.();
  uiEl.innerHTML = "";

  const autoUiEl = el("div", { className: "vr-autoUI" });
  const ioWrap = el("div", { className: "vr-settingsWrap" });
  const ioEl = el("div", { className: "vr-settingsIO" });
  const developerControls = el("div", { className: "vr-developerSettings" });
  if (!state.__ui) state.__ui = {};
  if (state.overrideMinMax == null) state.overrideMinMax = true;
  const history = ensureStateHistory(state);
  history.suspend += 1;
  let collapseDefaultsToggle = null;
  let persistSettingsToggle = null;
  let renderControl = null;
  let rangeControl = null;
  let syncPinLabel = () => {};
  let syncNavLabel = () => {};
  let resizeHandle = null;
  let isResizingConfig = false;
  let persistEnabled = loadPersistFlag(visualId);
  const persistUiNow = () => {
    if (!persistEnabled) return;
    if (!state?.__ui) return;
    saveUiCache(visualId, state.__ui);
  };
  const persistSettings = (() => {
    let timer = null;
    const delayMs = 250;
    return () => {
      if (!persistEnabled) return;
      if (!visualId) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (persistEnabled) saveSettingsCache(visualId, state);
      }, delayMs);
    };
  })();
  const record = () => recordHistory(state, history);
  const handleUiChange = () => {
    record();
    persistUiNow();
  };
  const configEl = document.getElementById("config");
  const infoBar = document.getElementById("infoBar");
  if (infoBar?.parentNode) {
    const existing = document.getElementById("nav-hotspot");
    if (!existing) {
      const navHotspot = document.createElement("div");
      navHotspot.id = "nav-hotspot";
      navHotspot.setAttribute("aria-hidden", "true");
      infoBar.parentNode.insertBefore(navHotspot, infoBar);
    }
  }
  const isSmallScreen = () => {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 699px)").matches
    );
  };
  const ensureUiDefaults = () => {
    if (!state.__ui) state.__ui = {};
    if (state.__ui.collapseParamsByDefault == null) state.__ui.collapseParamsByDefault = true;
    if (state.__ui.configWidth != null && !Number.isFinite(Number(state.__ui.configWidth))) {
      state.__ui.configWidth = null;
    }
    if (isSmallScreen()) {
      state.__ui.configPinned = false;
    } else if (state.__ui.configPinned == null) {
      const isDesktop =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(min-width: 900px)").matches;
      state.__ui.configPinned = isDesktop ? true : !!configEl?.classList.contains("pinned");
    }
    if (state.__ui.navHidden == null) {
      state.__ui.navHidden = !!infoBar?.classList.contains("hidden");
    }
  };
  const getConfigMinWidth = () => 240;
  const getConfigMaxWidth = () => {
    const viewport = Math.max(320, window.innerWidth || 0);
    return Math.max(getConfigMinWidth() + 20, Math.min(900, Math.floor(viewport * 0.9)));
  };
  const clampConfigWidth = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(getConfigMinWidth(), Math.min(getConfigMaxWidth(), n));
  };
  const applyConfigWidthFromUi = () => {
    if (!configEl || !state?.__ui) return;
    if (!configEl.classList.contains("pinned")) {
      configEl.style.removeProperty("width");
      return;
    }
    const width = clampConfigWidth(state.__ui.configWidth);
    if (width == null) {
      configEl.style.removeProperty("width");
      return;
    }
    configEl.style.width = `${width}px`;
  };
  const syncPersistentUi = () => {
    ensureUiDefaults();
    if (collapseDefaultsToggle) {
      collapseDefaultsToggle.checked = !!state.__ui.collapseParamsByDefault;
    }
    if (persistSettingsToggle) {
      persistSettingsToggle.checked = !!persistEnabled;
    }
    renderControl?._sync?.();
    rangeControl?._sync?.();
    syncPinLabel();
    syncNavLabel();
  };
  developerControls._onShow = syncPersistentUi;

  uiEl.append(autoUiEl, ioWrap);

  function ensureRuntimeNow() {
    if (typeof ensureRuntime !== "function") return { instance, xfRuntime };
    const before = runtimeRef && !!runtimeRef.xfRuntime;
    const out = ensureRuntime() || {};
    const after = runtimeRef && !!runtimeRef.xfRuntime;
    if (!before && after) rebuildAutoUI();
    return out;
  }

  function rerender() {
    if (!state.shouldRender) {
      if (runtimeRef?.instance?.destroy) runtimeRef.instance.destroy();
      if (runtimeRef?.xfRuntime?.destroy) runtimeRef.xfRuntime.destroy();
      if (runtimeRef) {
        runtimeRef.instance = null;
        runtimeRef.xfRuntime = null;
      }
      mountEl.innerHTML = "";
      return;
    }

    const rt = ensureRuntimeNow();
    const activeInstance = runtimeRef?.instance ?? rt.instance ?? instance;
    const activeRuntime = runtimeRef?.xfRuntime ?? rt.xfRuntime ?? xfRuntime;

    activeRuntime?.setSourceChangeHandler?.(() => applyRenderedTools(activeRuntime));
    const renderPass = () => {
      activeInstance?.render?.();
      applyRenderedTools(activeRuntime);
    };
    if (activeRuntime?.withSourceUpdatesSuspended) activeRuntime.withSourceUpdatesSuspended(renderPass);
    else renderPass();
  }

  function applyRenderedTools(activeRuntime) {
    const apply = () => {
      activeRuntime?.rebuildNow?.();
      const svg = mountEl.querySelector("svg");
      if (!svg) return;
      applyPropOpsToSubtree(svg, state.__propOps?.stack);
      applyScriptOpsToSubtree(svg, state.__scriptOps?.stack, { svg, state, mountEl });
      applyEffectsToSubtree({ mountEl, state, xfRuntime: activeRuntime });
      applyToolFlowToSubtree({ mountEl, state, xfRuntime: activeRuntime });
    };
    if (activeRuntime?.withSourceUpdatesSuspended) activeRuntime.withSourceUpdatesSuspended(apply);
    else apply();
  }



  const handleStateChange = (key) => {
    // Playback changes the picture every frame; the editable configuration is
    // the undo step, rather than hundreds of intermediate animation frames.
    if (!String(key || "").startsWith("__anim.")) record();
    rerender();
    // Keyboard/animation updates share this path even when Params is visible.
    // Leave a field alone while the user is actively editing its value.
    for (const row of autoUiEl.querySelectorAll(".vr-row")) {
      row._syncVisibility?.();
      if (!row.contains(document.activeElement)) row._sync?.();
    }
    persistSettings();
  };
  const handleStateMutation = () => {
    record();
    persistSettings();
  };

  function rebuildAutoUI() {
    const params = (spec.params || []).filter((param) => param.key !== "shouldRender" && param.key !== "overrideMinMax");
    mountAutoUI({
      container: autoUiEl,
      spec: { ...spec, params },
      state,
      mountEl,
      xfRuntime: runtimeRef?.xfRuntime ?? xfRuntime,
      onChange: handleStateChange,
      onUiChange: handleUiChange,
      onStateChange: handleStateMutation,
      onUndo: () => undoLastChange(true),
      visualId,
      developerControls,
      transaction: (apply) => {
        const result = withHistorySuspended(history, apply);
        record();
        persistSettings();
        return result;
      },
    });
  }

  // initial mount
  rebuildAutoUI();
  if (state.shouldRender) rerender();

  function resetToDefaults() {
    controlAnimation({ mountEl, state }, "stop");
    const preservedUi = state.__ui;
    const preservedHistory = state.__history;
    const nextState = makeDefaultState(spec);
    if (preservedUi) nextState.__ui = preservedUi;
    replaceStateContents(state, nextState);
    if (preservedHistory) state.__history = preservedHistory;
  }

  const resetDefaultsBtn = document.createElement("button");
  resetDefaultsBtn.textContent = "Reset Defaults";
  resetDefaultsBtn.type = "button";
  resetDefaultsBtn.classList.add("btn-inline");
  resetDefaultsBtn.onclick = () => {
    resetToDefaults();
    clearSettingsCache(visualId);
    syncPersistentUi();
    applyLayoutFromUi();
    persistUiNow();
    rerender();
    rebuildAutoUI();
    record();
    persistSettings();
  };

  const collapseDefaultsWrap = document.createElement("label");
  collapseDefaultsWrap.style.display = "flex";
  collapseDefaultsWrap.style.alignItems = "center";
  collapseDefaultsWrap.style.gap = "6px";
  collapseDefaultsWrap.style.margin = "4px 2px";

  collapseDefaultsToggle = document.createElement("input");
  collapseDefaultsToggle.type = "checkbox";
  collapseDefaultsToggle.checked = !!state.__ui?.collapseParamsByDefault;
  collapseDefaultsToggle.onchange = () => {
    if (!state.__ui) state.__ui = {};
    state.__ui.collapseParamsByDefault = collapseDefaultsToggle.checked;
    state.__ui.paramGroups = {};
    handleUiChange();
    rebuildAutoUI();
  };
  collapseDefaultsWrap.appendChild(collapseDefaultsToggle);
  collapseDefaultsWrap.appendChild(
    document.createTextNode("Start categories collapsed")
  );

  const persistSettingsWrap = document.createElement("label");
  persistSettingsWrap.style.display = "flex";
  persistSettingsWrap.style.alignItems = "center";
  persistSettingsWrap.style.gap = "6px";
  persistSettingsWrap.style.margin = "4px 2px";

  persistSettingsToggle = document.createElement("input");
  persistSettingsToggle.type = "checkbox";
  persistSettingsToggle.checked = !!persistEnabled;
  persistSettingsToggle.onchange = () => {
    persistEnabled = !!persistSettingsToggle.checked;
    savePersistFlag(visualId, persistEnabled);
    if (persistEnabled) {
      persistUiNow();
      persistSettings();
    }
  };
  persistSettingsWrap.appendChild(persistSettingsToggle);
  persistSettingsWrap.appendChild(
    document.createTextNode("Remember settings for this visual")
  );

  // persistent controls
  const applyImportedStateAndRefresh = () => {
    syncPersistentUi();
    applyLayoutFromUi();
    persistUiNow();
    rerender();
    rebuildAutoUI();
    record();
    persistSettings();
  };
  renderControl = buildControl({
    param: { key: "shouldRender", type: "boolean", description: "Enable the visual renderer. Use Space to pause or resume the simulation." },
    state,
    onChange: handleStateChange,
  });
  rangeControl = buildControl({
    param: { key: "overrideMinMax", type: "boolean", description: "Typed numbers expand slider limits, including each vector coordinate. Save Settings remembers these ranges; Reset Defaults clears them." },
    state,
    onChange: (key) => {
      handleStateChange(key);
      for (const row of autoUiEl.querySelectorAll(".vr-row")) row._sync?.();
    },
  });
  developerControls.append(
    renderControl,
    rangeControl,
    makeSaveSettingsButton(state, visualId),
    makeLoadSettingsButton(state, applyImportedStateAndRefresh, spec),
    resetDefaultsBtn,
    collapseDefaultsWrap,
    persistSettingsWrap
  );

  makeSaveSVG(ioEl, mountEl, visualId, state);
  makeLoadSVG(ioEl, mountEl, {
    state,
    spec,
    onApplySettings: applyImportedStateAndRefresh,
    onLoaded: (svgEl, rawText, { appliedSettings }) => {
      if (appliedSettings) return;
    // Optional: keep your SVG textarea/editor in sync
    // svgTa.value = rawText;
    // runUserCode();
    },
  });
  makeLoadSettingsFromSVG(developerControls, state, applyImportedStateAndRefresh, spec);
  for (const button of ioEl.querySelectorAll("button")) {
    button.title = button.textContent;
    button.setAttribute("aria-label", button.textContent);
    button.textContent = button.textContent === "Save SVG" ? "Save" : "Load";
    button.style.removeProperty("margin-top");
  }
  const syncPinnedLayout = () => {
    const root = document.documentElement;
    const body = document.body;
    const infoBarHeight =
      infoBar && !infoBar.classList.contains("hidden")
        ? infoBar.getBoundingClientRect().height
        : 0;
    const pinned = !!configEl?.classList.contains("pinned");
    const configWidth = pinned ? (configEl?.getBoundingClientRect().width || 0) : 0;
    root.style.setProperty("--ui-right-width", `${Math.max(0, configWidth)}px`);
    root.style.setProperty("--ui-top-offset", `${Math.max(0, infoBarHeight)}px`);
    body.classList.toggle("ui-pinned", pinned);
  };
  const applyLayoutFromUi = () => {
    ensureUiDefaults();
    if (configEl) {
      const pinned = !!state.__ui.configPinned;
      configEl.classList.toggle("pinned", pinned);
      if (pinned) configEl.classList.add("open");
      applyConfigWidthFromUi();
    }
    if (infoBar) {
      infoBar.classList.toggle("hidden", !!state.__ui.navHidden);
    }
    document.body?.classList?.toggle("nav-hidden", !!state.__ui.navHidden);
    syncPinnedLayout();
  };
  applyLayoutFromUi();
  if (configEl && !isSmallScreen()) {
    const priorHandle = configEl.querySelector("#config-resize-handle");
    if (priorHandle) priorHandle.remove();
    resizeHandle = document.createElement("button");
    resizeHandle.type = "button";
    resizeHandle.id = "config-resize-handle";
    resizeHandle.setAttribute("aria-label", "Resize pinned panel");
    resizeHandle.innerHTML = '<span class="line"></span><span class="line"></span>';
    configEl.appendChild(resizeHandle);

    const onPointerMove = (event) => {
      if (!isResizingConfig) return;
      const nextWidth = clampConfigWidth((window.innerWidth || 0) - event.clientX);
      if (nextWidth == null) return;
      state.__ui.configWidth = nextWidth;
      applyConfigWidthFromUi();
      syncPinnedLayout();
    };
    const endResize = () => {
      if (!isResizingConfig) return;
      isResizingConfig = false;
      document.body?.classList?.remove("ui-resizing-config");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
      handleUiChange();
    };

    resizeHandle.addEventListener("pointerdown", (event) => {
      if (!configEl.classList.contains("pinned")) return;
      if (isSmallScreen()) return;
      event.preventDefault();
      isResizingConfig = true;
      document.body?.classList?.add("ui-resizing-config");
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endResize);
      window.addEventListener("pointercancel", endResize);
    });
  }
  if (configEl && !isSmallScreen()) {
    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.classList.add("btn-inline");
    syncPinLabel = () => {
      pinBtn.textContent = configEl.classList.contains("pinned") ? "Unpin UI" : "Pin UI";
    };
    pinBtn.onclick = () => {
      state.__ui.configPinned = !state.__ui.configPinned;
      applyLayoutFromUi();
      syncPinLabel();
      handleUiChange();
    };
    syncPinLabel();
    developerControls.appendChild(pinBtn);
  }

  syncPersistentUi();
  ioWrap.appendChild(ioEl);

  if (infoBar) {
    const navBtn = document.createElement("button");
    navBtn.type = "button";
    navBtn.classList.add("btn-inline");
    syncNavLabel = () => {
      navBtn.textContent = infoBar.classList.contains("hidden") ? "Show Nav" : "Hide Nav";
    };
    navBtn.onclick = () => {
      state.__ui.navHidden = !state.__ui.navHidden;
      applyLayoutFromUi();
      syncNavLabel();
      handleUiChange();
    };
    syncNavLabel();
    developerControls.appendChild(navBtn);
  }
  if (configEl) {
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => syncPinnedLayout());
      ro.observe(configEl);
    }
    window.addEventListener("resize", syncPinnedLayout);
    syncPinnedLayout();
  }

  // A linked study stays at its saved parameters, including visuals whose factory
  // seeds animation defaults. Keep its tracks available for an explicit Play.
  if (startPaused) {
    pauseLinkedStudyPlayback(state, spec);
    controlAnimation({ mountEl, state, onChange: rerender }, "pause");
  } else {
    // Ordinary app launches retain the visual's autoplay preference.
    maybeAutoplayAnimation({ mountEl, state, onChange: rerender });
  }
  const baseline = getHistorySnapshot(state);
  if (baseline) history.last = baseline;
  history.suspend = Math.max(0, history.suspend - 1);
  function undoLastChange(preserveAssistant = false) {
    if (!history?.past?.length) return false;
    controlAnimation({ mountEl, state, onChange: rerender }, "stop");
    const snapshot = history.past.pop();
    if (history.last) history.future.push(history.last);
    const applied = withHistorySuspended(history, () => {
      const ok = applyHistorySnapshot(state, history, snapshot);
      if (!ok) return false;
      syncPersistentUi();
      applyLayoutFromUi();
      rerender();
      if (preserveAssistant) autoUiEl._refreshPanels?.("assistant");
      else rebuildAutoUI();
      return true;
    });
    if (!applied) return false;
    persistUiNow();
    persistSettings();
    return true;
  }
  function setParam(key, value) {
    if (key !== "shouldRender" && key !== "overrideMinMax" && !spec.params?.some((param) => param.key === key)) {
      throw new Error(`Unknown visual parameter "${key}"`);
    }
    setByPath(state, key, value);
    handleStateChange(key);
    syncPersistentUi();
    for (const row of autoUiEl.querySelectorAll(".vr-row")) row._sync?.();
  }
  function toggleSimulation() {
    const key = spec.simulation?.param;
    if (!key || !spec.params?.some((param) => param.key === key && param.type === "boolean")) return false;
    const runningValue = spec.simulation.runningValue ?? true;
    setParam(key, getByPath(state, key) === runningValue ? !runningValue : runningValue);
    return true;
  }
  setActiveUndoContext({
    state,
    undo: () => undoLastChange(),
    animate: (command) => controlAnimation({ mountEl, state, onChange: handleStateChange }, command),
    toggleSimulation,
  });
  return {
    rebuildAutoUI,
    refresh: rerender,
    // App shortcuts use the same history, persistence and render path as controls,
    // including when their parameter panel has not been mounted yet.
    setParam,
    toggleSimulation,
  };
}

// Pause only declared native playback controls: booleans such as trails,
// effects, or shape visibility are part of the saved picture, not playback.
function pauseLinkedStudyPlayback(state, spec) {
  if (!state.__anim || typeof state.__anim !== "object" || Array.isArray(state.__anim)) state.__anim = {};
  if (!state.__anim.ui || typeof state.__anim.ui !== "object" || Array.isArray(state.__anim.ui)) state.__anim.ui = {};
  state.__anim.ui.autoPlay = false;
  const key = spec.simulation?.param;
  if (key && spec.params?.some((param) => param.key === key && param.type === "boolean")) {
    setByPath(state, key, !(spec.simulation.runningValue ?? true));
  }
}

/** Run a visual by id; wires UI->state->render(). */
export function runVisualApp({
  visualId,
  mountEl,
  uiEl,
  state: providedState,
}) {
  const spec = VISUALS[visualId];
  if (!spec) throw new Error(`Unknown visualId "${visualId}"`);

  const state = makeDefaultState(spec);
  const linkedJSON = consumeLinkedSettings(visualId);
  if (linkedJSON !== null) {
    // A study is a complete save: stale cache/preset flows must not leak into it.
    importStateFromJSON(linkedJSON, state, spec);
  } else {
    const persistEnabled = loadPersistFlag(visualId);
    if (persistEnabled) {
      const cachedSettings = loadSettingsCache(visualId);
      if (cachedSettings) mergeInto(state, cachedSettings);
      const cachedUi = loadUiCache(visualId);
      if (cachedUi) {
        if (!state.__ui) state.__ui = {};
        mergeInto(state.__ui, cachedUi);
      }
    }
    if (providedState && typeof providedState === "object") {
      mergeInto(state, providedState);
    }
  }

  let linkedStartup = linkedJSON !== null;
  if (linkedStartup) pauseLinkedStudyPlayback(state, spec);
  const runtimeRef = { instance: null, xfRuntime: null };

  const ensureRuntime = () => {
    if (!state.shouldRender) return runtimeRef;
    if (!runtimeRef.instance) {
      runtimeRef.instance = spec.create({ mountEl }, state);
      if (linkedStartup) pauseLinkedStudyPlayback(state, spec);
    }
    if (!runtimeRef.xfRuntime) {
      ensureTransformState(state);
      runtimeRef.xfRuntime = initTransformRuntime({ mountEl, state });
    }
    return runtimeRef;
  };

  const { setParam, refresh, toggleSimulation } = mountVisualUI({
    uiEl,
    spec,
    state,
    mountEl,
    xfRuntime: runtimeRef.xfRuntime,
    instance: runtimeRef.instance,
    runtimeRef,
    ensureRuntime,
    visualId,
    startPaused: linkedStartup,
  });
  linkedStartup = false;

  const infoButton = document.getElementById("button-info");
  if (infoButton) infoButton.onclick = () => {
    const configEl = document.getElementById("config");
    const infoBar = document.getElementById("infoBar");
    const syncPinnedLayout = () => {
      const root = document.documentElement;
      const body = document.body;
      const infoBarHeight =
        infoBar && !infoBar.classList.contains("hidden")
          ? infoBar.getBoundingClientRect().height
          : 0;
      const pinned = !!configEl?.classList.contains("pinned");
      const configWidth = pinned ? (configEl?.getBoundingClientRect().width || 0) : 0;
      root.style.setProperty("--ui-right-width", `${Math.max(0, configWidth)}px`);
      root.style.setProperty("--ui-top-offset", `${Math.max(0, infoBarHeight)}px`);
      body.classList.toggle("ui-pinned", pinned);
    };
    if (!configEl) return;
    if (configEl.classList.contains("pinned")) {
      configEl.classList.add("open");
      syncPinnedLayout();
      return;
    }
    configEl.classList.toggle("open");
    syncPinnedLayout();
  };

  return {
    spec,
    state,
    setParam,
    refresh,
    toggleSimulation,
    get instance() {
      return runtimeRef.instance;
    },
    getParamsJSON: () => getVisualParamsTree(spec, state),
    setVisual(nextId) {
      uiEl.querySelector(".vr-autoUI")?._destroyTabs?.();
      controlAnimation({ mountEl, state, onChange: () => {} }, "stop");
      runtimeRef.instance?.destroy?.();
      runtimeRef.xfRuntime?.destroy?.();
      uiEl.innerHTML = "";
      mountEl.innerHTML = "";
      return runVisualApp({ visualId: nextId, mountEl, uiEl });
    },
  };
}

/** Update conditional rows without rebuilding editors or changing their values. */
export function syncControlVisibility(root, state) {
  if (!root?.querySelectorAll) return;
  const rows = [...root.querySelectorAll('.vr-row')];
  if (root.matches?.('.vr-row')) rows.unshift(root);
  for (const row of rows) {
    if (state === undefined || row._controlState === state) row._syncVisibility?.();
  }
  for (const group of root.querySelectorAll('.vr-paramGroup')) {
    if (state === undefined || group._controlState === state) group._syncVisibility?.();
  }
}

export function buildControl({ param, state, onChange }) {
  const labelText = param.label ?? param.key;
  const wrap = el("div", { className: ["vr-row", param.cssClass].filter(Boolean).join(" ") });
  wrap._controlState = state;
  wrap._syncVisibility = () => {
    if (param.shouldShowWhen == null) return;
    const hidden = !matchesParamVisibility(param.shouldShowWhen, state);
    const focused = document.activeElement;
    wrap.hidden = hidden;
    if (hidden && wrap.contains(focused)) focused.blur?.();
    wrap.closest('.vr-paramGroup')?._syncVisibility?.();
  };
  wrap.appendChild(el("label", { className: "vr-label", textContent: labelText }));

  if (param.description) {
    wrap.appendChild(el("div", { className: "vr-help", textContent: param.description }));
  }

  const value = getByPath(state, param.key);
  const builder = CONTROL_BUILDERS[param.type] || buildTextControl;
  const notifyChange = (...args) => {
    const root = wrap.closest('.vr-autoUI') || wrap.getRootNode();
    syncControlVisibility(root, state);
    try { onChange?.(...args); }
    finally { syncControlVisibility(root, state); }
  };
  const input = builder({ param, state, value, onChange: notifyChange });
  if (input.matches("input, select, textarea") && !input.hasAttribute("aria-label")) input.setAttribute("aria-label", labelText);

  if (param.cssClass && input instanceof HTMLElement) input.classList.add(param.cssClass);

  const inputWrap = el("div", { className: "vr-input" });
  inputWrap.appendChild(input);
  wrap.appendChild(inputWrap);
  let lastValue = JSON.stringify(value);
  const rememberValue = () => { lastValue = JSON.stringify(getByPath(state, param.key)); };
  input.addEventListener("input", rememberValue);
  input.addEventListener("change", rememberValue);
  wrap._sync = () => {
    wrap._syncVisibility();
    const next = getByPath(state, param.key);
    if (input._sync) {
      input._sync();
      lastValue = JSON.stringify(next);
      return;
    }
    if (JSON.stringify(next) === lastValue) return;
    lastValue = JSON.stringify(next);
    const fields = input.matches("input, select, textarea") ? [input] : [...input.querySelectorAll("input")];
    fields.forEach((field, index) => {
      if (field.type === "checkbox") field.checked = !!next;
      else if (param.type?.startsWith("vector")) field.value = String(next?.[["x", "y", "z"][index]] ?? 0);
      else field.value = String(next ?? param.default ?? "");
    });
  };

  wrap._syncVisibility();
  return wrap;
}

const CONTROL_BUILDERS = {
  boolean: buildBooleanControl,
  select: buildSelectControl,
  button: buildButtonControl,
  number: buildNumberControl,
  vector2D: (ctx) => buildVectorControl({ ...ctx, dims: 2 }),
  vector3D: (ctx) => buildVectorControl({ ...ctx, dims: 3 }),
  text: buildTextControl,
};

function buildBooleanControl({ param, state, onChange, value }) {
  const input = el("input", { type: "checkbox" });
  input.checked = !!value;
  input.addEventListener("change", () => {
    setByPath(state, param.key, !!input.checked);
    onChange?.(param.key, getByPath(state, param.key), state);
  });
  return input;
}

function buildSelectControl({ param, state, onChange, value }) {
  const input = el("select");
  for (const opt of param.options || []) {
    input.appendChild(el("option", { value: opt, textContent: opt }));
  }
  input.value = value ?? (param.options?.[0] ?? "");
  input.addEventListener("change", () => {
    setByPath(state, param.key, input.value);
    onChange?.(param.key, getByPath(state, param.key), state);
  });
  return input;
}

function buildButtonControl({ param, state, onChange }) {
  const input = el("button", {
    type: "button",
    textContent: param.label ?? param.key,
  });
  if (param.class) input.className = param.class;

  input.addEventListener("click", () => {
    param.onClick?.({ key: param.key, state, setByPath, getByPath });
    onChange?.(param.key, undefined, state);
  });
  return input;
}

function buildNumberControl({ param, state, onChange, value }) {
  return buildNumericField({
    param, state,
    read: () => getByPath(state, param.key) ?? param.default ?? value ?? 0,
    write: (next) => {
      setByPath(state, param.key, next);
      onChange?.(param.key, next, state);
    },
  });
}

function buildNumericField({ param, state, axis, read, write }) {
  const row = el("div", { className: "vr-rangeRow" });
  const label = `${param.label ?? param.key}${axis ? ` ${axis}` : ""}`;
  const slider = el("input", {
    type: "range",
    step: String(param.step ?? 1),
  });
  const box = el("input", {
    type: "number",
    step: String(param.step ?? 1),
  });
  slider.setAttribute("aria-label", `${label} slider`);
  box.setAttribute("aria-label", label);
  const sync = () => {
    const { min, max } = getParamRange(state, param, axis);
    slider.hidden = !(Number.isFinite(min) && Number.isFinite(max) && min < max);
    for (const field of [box, slider]) {
      if (min != null) field.min = String(min); else field.removeAttribute("min");
      if (max != null) field.max = String(max); else field.removeAttribute("max");
      field.value = String(read());
    }
  };
  const commit = () => {
    const parsed = box.value.trim() ? Number(box.value) : NaN;
    if (!Number.isFinite(parsed)) { sync(); return; }
    const before = JSON.stringify(state.__paramRanges);
    const next = acceptTypedNumber(state, param, axis, parsed);
    if (next !== read() || before !== JSON.stringify(state.__paramRanges)) write(next);
    sync();
  };
  slider.addEventListener("input", () => { write(Number(slider.value)); sync(); });
  box.addEventListener("change", commit);
  box.addEventListener("blur", commit);
  row.append(slider, box);
  row._sync = sync;
  sync();
  return row;
}

function buildVectorControl({ param, state, onChange, value, dims }) {
  const def = param.default ?? (dims === 3 ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0 });
  const read = () => normalizeVector(getByPath(state, param.key) ?? value ?? def, def, dims);
  const row = el("div", { className: "vr-vectorFields" });
  const fields = [];
  const axes = dims === 3 ? ["x", "y", "z"] : ["x", "y"];
  for (const axis of axes) {
    const field = buildNumericField({
      param, state, axis,
      read: () => read()[axis],
      write: (next) => {
        const vector = { ...read(), [axis]: next };
        setByPath(state, param.key, vector);
        onChange?.(param.key, vector, state);
      },
    });
    fields.push(field);
    const wrap = el("div", { className: "vr-vecField" });
    wrap.appendChild(el("div", { className: "vr-vecLabel", textContent: axis }));
    wrap.appendChild(field);
    row.appendChild(wrap);
  }

  row._sync = () => fields.forEach((field) => field._sync());
  return row;
}

function buildTextControl({ param, state, onChange, value }) {
  const input = el("input", { type: "text" });
  input.value = String(value ?? param.default ?? "");
  const commit = () => {
    setByPath(state, param.key, input.value);
    onChange?.(param.key, getByPath(state, param.key), state);
  };
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  return input;
}
export function makeSaveSVG(uiEl, mountEl, visualId, state) {
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save SVG";
  saveBtn.type = "button";
  saveBtn.style.marginTop = "5px";
  saveBtn.classList.add("btn-inline");

  saveBtn.onclick = () => {
    const svg = mountEl.firstElementChild;
    if (!(svg instanceof SVGSVGElement)) return;

    const serializer = new XMLSerializer();
    const clone = svg.cloneNode(true);
    const settingsJson = state ? exportStateToJSON(state) : "";
    if (settingsJson) {
      const ns = clone.namespaceURI || "http://www.w3.org/2000/svg";
      let meta = clone.querySelector('metadata#ohey-settings');
      if (!meta) {
        meta = document.createElementNS(ns, "metadata");
        meta.setAttribute("id", "ohey-settings");
        meta.setAttribute("data-format", "json");
        meta.setAttribute("data-owner", "ohey-settings");
        clone.insertBefore(meta, clone.firstChild);
      }
      if (!meta.getAttribute("data-owner")) {
        meta.setAttribute("data-owner", "ohey-settings");
      }
      meta.textContent = settingsJson;
    }

    let source = serializer.serializeToString(clone);

    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
      source = source.replace(
        "<svg",
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
    }

    const blob = new Blob(
      [`<?xml version="1.0" encoding="UTF-8"?>\n${source}`],
      { type: "image/svg+xml;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${visualId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };
  uiEl.appendChild(saveBtn);
}

function parseSvgDocumentFromText(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) {
    throw new Error("SVG parse error: " + parseErr.textContent);
  }
  const svg = doc.documentElement;
  const rootName = String(svg?.localName || svg?.tagName || "").toLowerCase();
  if (!svg || rootName !== "svg") {
    throw new Error("Selected file does not contain a single <svg> root.");
  }
  return svg;
}

function decodeXmlEntities(raw) {
  const text = String(raw ?? "");
  if (!text) return "";
  if (
    !text.includes("&quot;") &&
    !text.includes("&apos;") &&
    !text.includes("&lt;") &&
    !text.includes("&gt;") &&
    !text.includes("&amp;")
  ) {
    return text;
  }
  const ta = document.createElement("textarea");
  ta.innerHTML = text;
  return ta.value;
}

function trimJsonEnvelope(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  let next = text;
  if (next.startsWith("<![CDATA[")) {
    next = next.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  }
  const start = next.indexOf("{");
  const end = next.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return next.slice(start, end + 1).trim();
  }
  return next;
}

function normalizeEmbeddedSettingsJson(raw) {
  const candidates = [];
  const pushCandidate = (value) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    if (!candidates.includes(text)) candidates.push(text);
  };

  pushCandidate(raw);
  pushCandidate(decodeXmlEntities(raw));

  const snapshot = candidates.slice();
  for (const value of snapshot) {
    pushCandidate(trimJsonEnvelope(value));
    pushCandidate(decodeXmlEntities(trimJsonEnvelope(value)));
  }

  let lastErr = null;
  for (const candidate of candidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("Embedded settings JSON is empty.");
}

function findSettingsMetadataNode(svg) {
  if (!svg) return null;
  const byId = svg.querySelector('metadata#ohey-settings');
  if (byId) return byId;
  const byOwner = svg.querySelector('metadata[data-owner="ohey-settings"]');
  if (byOwner) return byOwner;
  const byFormat = svg.querySelector('metadata[data-format="json"]');
  if (byFormat) return byFormat;
  return null;
}

function readEmbeddedSettingsFromSvg(svg, required = false) {
  const meta = findSettingsMetadataNode(svg);
  if (!meta) {
    if (required) throw new Error("No embedded settings found in SVG metadata.");
    return null;
  }
  const raw = String(meta.textContent || meta.innerHTML || "").trim();
  if (!raw) {
    if (required) throw new Error("Embedded settings are empty.");
    return null;
  }
  try {
    return normalizeEmbeddedSettingsJson(raw);
  } catch (err) {
    if (required) {
      throw new Error(`Embedded settings are not valid JSON: ${String(err?.message || err)}`);
    }
    return null;
  }
}

export function makeLoadSVG(uiEl, mountEl, options = {}) {
  const normalizedOptions =
    typeof options === "function" ? { onLoaded: options } : (options || {});
  const onLoaded = normalizedOptions.onLoaded;
  const onApplySettings = normalizedOptions.onApplySettings;
  const state = normalizedOptions.state;
  const spec = normalizedOptions.spec;
  // onLoaded(svgEl, rawText, { appliedSettings }) is optional.
  // onApplySettings() is called after metadata settings are imported.

  const loadBtn = document.createElement("button");
  loadBtn.textContent = "Load SVG";
  loadBtn.type = "button";
  loadBtn.style.marginTop = "5px";
  loadBtn.classList.add("btn-inline");

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".svg,image/svg+xml";
  input.style.display = "none";

  function replaceMountWithSvg(svgEl) {
    mountEl.innerHTML = "";
    mountEl.appendChild(svgEl);
  }

  loadBtn.onclick = () => input.click();

  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = ""; // allow picking same file again
    if (!file) return;

    try {
      const text = await file.text();
      const svg = parseSvgDocumentFromText(text);

      // Ensure xmlns
      if (!svg.getAttribute("xmlns")) {
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }

      // Import into current document before using.
      const imported = document.importNode(svg, true);
      const embeddedSettings = readEmbeddedSettingsFromSvg(imported, false);
      let appliedSettings = false;

      if (embeddedSettings && state && typeof state === "object") {
        importStateFromJSON(embeddedSettings, state, spec);
        onApplySettings?.();
        appliedSettings = true;
      }

      if (!appliedSettings) {
        replaceMountWithSvg(imported);
      }

      if (typeof onLoaded === "function") {
        onLoaded(imported, text, { appliedSettings });
      }
    } catch (e) {
      console.error(e);
      alert(String(e?.message || e));
    }
  };

  uiEl.appendChild(loadBtn);
  uiEl.appendChild(input);

  return { loadBtn, input };
}

export function makeLoadSettingsFromSVG(uiEl, state, onChange, spec = null) {
  const loadBtn = document.createElement("button");
  loadBtn.textContent = "Load Settings from SVG";
  loadBtn.type = "button";
  loadBtn.style.marginTop = "5px";
  loadBtn.classList.add("btn-inline");

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".svg,image/svg+xml";
  input.style.display = "none";

  loadBtn.onclick = () => input.click();

  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const svg = parseSvgDocumentFromText(text);
      const raw = readEmbeddedSettingsFromSvg(svg, true);
      importStateFromJSON(raw, state, spec);
      onChange?.();
    } catch (e) {
      console.error(e);
      alert(String(e?.message || e));
    }
  };

  uiEl.appendChild(loadBtn);
  uiEl.appendChild(input);
  return { loadBtn, input };
}
// export function el(tag, props = {}, children = []) {
//   const node = document.createElement(tag);
//   for (const [k, v] of Object.entries(props)) {
//     if (k === "className") node.className = v;
//     else if (k === "textContent") node.textContent = v;
//     else node.setAttribute(k, String(v));
//   }
//   for (const c of children) node.appendChild(c);
//   return node;
// }
// export function el(tag, props = {}, children = []) {
//   // no tag → just return children
//   if (!tag) {
//     const frag = document.createDocumentFragment();
//     for (const c of children) frag.appendChild(c);
//     return frag;
//   }

//   const node = document.createElement(tag);

//   for (const [k, v] of Object.entries(props)) {
//     if (k === "className") node.className = v;
//     else if (k === "textContent") node.textContent = v;
//     else node.setAttribute(k, String(v));
//   }

//   for (const c of children) node.appendChild(c);
//   return node;
// }
export function el(tag, props = {}, children = []) {
  // fragment support
  if (!tag) {
    const frag = document.createDocumentFragment();
    [].concat(children).forEach(c => c && frag.appendChild(c));
    return frag;
  }

  const node = document.createElement(tag);

  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;

    // class / text
    if (k === "className") {
      node.className = v;
    } else if (k === "textContent") {
      node.textContent = v;

    // style object or string
    } else if (k === "style") {
      if (typeof v === "object") Object.assign(node.style, v);
      else node.style.cssText = v;

    // event handlers: onclick, oninput, etc
    } else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);

    // boolean props
    } else if (typeof v === "boolean") {
      if (v) node.setAttribute(k, "");
      else node.removeAttribute(k);

    // dataset shorthand
    } else if (k === "dataset" && typeof v === "object") {
      Object.assign(node.dataset, v);

    // everything else
    } else {
      node.setAttribute(k, String(v));
    }
  }

  // normalize children
  [].concat(children).forEach(c => {
    if (c == null) return;
    node.appendChild(
      typeof c === "string" ? document.createTextNode(c) : c
    );
  });

  return node;
}

/* --------------------------- path helpers --------------------------- */

export function getByPath(obj, path) {
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function setByPath(obj, path, value) {
  const parts = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function clone(v) {
  // good enough for numbers/strings/booleans/plain objects you’ll use for params
  if (v == null || typeof v !== "object") return v;
  return JSON.parse(JSON.stringify(v));
}

function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNumber(value, min = -Infinity, max = Infinity, fallback = 0) {
  const n = toNumber(value, fallback);
  return Math.min(max, Math.max(min, n));
}

function normalizeVector(value, fallback, dims = 2) {
  const use3 = dims === 3;
  const base = fallback && typeof fallback === "object"
    ? fallback
    : (use3 ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0 });
  const raw = value && typeof value === "object" ? value : {};
  const out = {
    x: toNumber(raw.x, toNumber(base.x, 0)),
    y: toNumber(raw.y, toNumber(base.y, 0)),
  };
  if (use3) out.z = toNumber(raw.z, toNumber(base.z, 0));
  return out;
}
