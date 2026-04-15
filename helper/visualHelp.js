// visual_registry.js
// A tiny framework for:
// - registering visuals in a record
// - describing editable params (with optional min/max/step + cssClass)
// - auto-building a UI to edit them
import { ensureTransformState,initTransformRuntime,buildTransformPanel} from "../helper/transformHelp.js";
import { registerTransformTab } from "../helper/transformHelp.js";
import { applyPropOpsToSubtree, applyScriptOpsToSubtree } from "../helper/svgEditor.js";
import { registerPropOpsTab, registerScriptOpsTab } from "../helper/svgEditor.js";
import { registerAnimateTab, maybeAutoplayAnimation } from "../helper/animationHelp.js";
//import { registerLLMTab } from "../helper/llmTab.js";
import { registerEffectsTab, applyEffectsToSubtree } from "../helper/effectsHelp.js";
import { registerColorTab, applyColorToSubtree } from "../helper/colorHelp.js";
import { registerAutoExportTab } from "../helper/autoExportHelp.js";

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
  for (const [tabName, build] of TAB_BUILDERS.entries()) {
    extraTabs[tabName] = () => build(ctx);
  }
  return extraTabs;
}

registerTransformTab();
registerPropOpsTab();
//registerScriptOpsTab();
registerAnimateTab();
//registerLLMTab();
registerEffectsTab();
registerColorTab();
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
  if (!visualId) return false;
  const raw = readCache(getPersistCacheKey(visualId));
  if (raw == null) return false;
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

export function mountUserTabs({
  container,
  spec,
  state,
  onChange,
  buildParamsPanel,   // () => HTMLElement
  extraTabs = {},     // { tabName: () => HTMLElement }
  onUiChange,
}) {
  const tabs = ["params", ...Object.keys(extraTabs)];
  const uiState = state?.__ui || {};
  if (state && !state.__ui) state.__ui = uiState;
  if (uiState.tabsOpen === undefined) uiState.tabsOpen = false;
  if (uiState.activeTab == null) uiState.activeTab = "params";
  let activeTab = tabs.includes(uiState.activeTab) ? uiState.activeTab : "params";

  const tabBar = el("div", { className: "vr-tabs" });
  const body = el("div", { className: "vr-tabBody" });
  const layout = el("div", { className: "vr-tabLayout" });
  const tabCol = el("div", { className: "vr-tabCol" });

  const tabToggle = el("button", {
    className: "vr-tabsToggle",
    type: "button",
    textContent: uiState.tabsOpen ? "-" : "+",
  });
  tabToggle.onclick = () => {
    uiState.tabsOpen = !uiState.tabsOpen;
    tabToggle.textContent = uiState.tabsOpen ? "-" : "+";
    tabBar.classList.toggle("hidden", !uiState.tabsOpen);
    onUiChange?.();
  };

  const render = () => {
    tabBar.innerHTML = "";
    body.innerHTML = "";

    if (!tabs.includes(activeTab)) {
      activeTab = "params";
      uiState.activeTab = activeTab;
      onUiChange?.();
    }

    for (const name of tabs) {
      const btn = el("button", {
        className: `vr-tab ${name === activeTab ? "active" : ""}`,
        textContent: name,
      });
      btn.onclick = () => {
        activeTab = name;
        uiState.activeTab = name;
        onUiChange?.();
        render();
      };
      tabBar.appendChild(btn);
    }

    if (activeTab === "params") {
      body.appendChild(buildParamsPanel());
    } else {
      body.appendChild(extraTabs[activeTab]());
    }
  };

  tabBar.classList.toggle("hidden", !uiState.tabsOpen);
  tabCol.appendChild(tabToggle);
  tabCol.appendChild(tabBar);
  layout.appendChild(tabCol);
  layout.appendChild(body);
  container.appendChild(layout);
  render();
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
}) {
  container.innerHTML = "";

  const header = el("div", { className: "vr-header" }, [
    el("div", { className: "vr-title", textContent: spec.title }),
    el("div", { className: "vr-desc", textContent: spec.description }),
  ]);
  container.appendChild(header);

  const form = el("div", { className: "vr-form" });
  container.appendChild(form);

  mountUserTabs({
    container,
    spec,
    state,
    onChange,
    buildParamsPanel: () => buildParamsPanel({ spec, state, onChange, onUiChange }),
    extraTabs: buildRegisteredTabs({ mountEl, spec, state, xfRuntime, onChange, onStateChange }),
    onUiChange,
  });

  return {
    state,
    rerenderUI: () =>
      mountAutoUI({ container, spec, state, onChange, onStateChange, onUiChange, mountEl, xfRuntime }),
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
    panel.appendChild(group);
  }

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
 * @property {number} [min]                - Optional range constraints (number)
 * @property {number} [max]
 * @property {number} [step]
 * @property {string[]} [options]          - For type="select"
 */

/**
 * @typedef {Object} VisualSpec
 * @property {string} title
 * @property {string} description
 * @property {ParamSpec[]} params
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
}) {
  uiEl.innerHTML = "";

  const autoUiEl = el("div", { className: "vr-autoUI" });
  const ioWrap = el("div", { className: "vr-settingsWrap" });
  const ioEl = el("div", { className: "vr-settingsIO" });
  if (!state.__ui) state.__ui = {};
  const history = ensureStateHistory(state);
  history.suspend += 1;
  let ioToggle = null;
  let collapseDefaultsToggle = null;
  let persistSettingsToggle = null;
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
        saveSettingsCache(visualId, state);
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
    if (state.__ui.ioOpen === undefined) state.__ui.ioOpen = true;
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
    ioEl.classList.toggle("hidden", !state.__ui.ioOpen);
    if (ioToggle) ioToggle.textContent = state.__ui.ioOpen ? "-" : "+";
    if (collapseDefaultsToggle) {
      collapseDefaultsToggle.checked = !!state.__ui.collapseParamsByDefault;
    }
    if (persistSettingsToggle) {
      persistSettingsToggle.checked = !!persistEnabled;
    }
  };

  uiEl.append(autoUiEl, ioWrap);

  const GLOBAL_PARAMS = [
    {
      key: "shouldRender",
      type: "boolean",
      default: true,
      category: "System",
      description: "Master render toggle (disables rendering when off).",
    },
  ];

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

    activeInstance?.render?.();
    activeRuntime?.rebuildNow?.();
    const svg = mountEl.firstElementChild;
    if (svg) {
      applyPropOpsToSubtree(svg, state.__propOps?.stack);
      applyScriptOpsToSubtree(svg, state.__scriptOps?.stack, { svg, state, mountEl });
      applyEffectsToSubtree({ mountEl, state, xfRuntime: activeRuntime });
      applyColorToSubtree({ mountEl, state });
    }
  }


  const handleStateChange = () => {
    record();
    rerender();
    persistSettings();
  };
  const handleStateMutation = () => {
    record();
    persistSettings();
  };

  function rebuildAutoUI() {
    const params = [...GLOBAL_PARAMS, ...(spec.params || [])];
    mountAutoUI({
      container: autoUiEl,
      spec: { ...spec, params },
      state,
      mountEl,
      xfRuntime: runtimeRef?.xfRuntime ?? xfRuntime,
      onChange: handleStateChange,
      onUiChange: handleUiChange,
      onStateChange: handleStateMutation,
    });
  }

  // initial mount
  rebuildAutoUI();
  if (state.shouldRender) rerender();

  function resetToDefaults() {
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
  ioEl.append(
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
  makeLoadSettingsFromSVG(ioEl, state, applyImportedStateAndRefresh, spec);
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
    const syncPinLabel = () => {
      pinBtn.textContent = configEl.classList.contains("pinned") ? "Unpin UI" : "Pin UI";
    };
    pinBtn.onclick = () => {
      state.__ui.configPinned = !state.__ui.configPinned;
      applyLayoutFromUi();
      syncPinLabel();
      handleUiChange();
    };
    syncPinLabel();
    ioEl.appendChild(pinBtn);
  }

  if (state) {
    ensureUiDefaults();

    ioToggle = document.createElement("button");
    ioToggle.type = "button";
    ioToggle.classList.add("vr-ioToggle");
    ioToggle.onclick = () => {
      state.__ui.ioOpen = !state.__ui.ioOpen;
      syncPersistentUi();
      handleUiChange();
    };
    syncPersistentUi();
    ioWrap.appendChild(ioToggle);
    ioWrap.appendChild(ioEl);

  }

  if (infoBar) {
    const navBtn = document.createElement("button");
    navBtn.type = "button";
    navBtn.classList.add("btn-inline");
    const syncNavLabel = () => {
      navBtn.textContent = infoBar.classList.contains("hidden") ? "Show Nav" : "Hide Nav";
    };
    navBtn.onclick = () => {
      state.__ui.navHidden = !state.__ui.navHidden;
      applyLayoutFromUi();
      syncNavLabel();
      handleUiChange();
    };
    syncNavLabel();
    ioEl.appendChild(navBtn);
  }
  if (configEl) {
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => syncPinnedLayout());
      ro.observe(configEl);
    }
    window.addEventListener("resize", syncPinnedLayout);
    syncPinnedLayout();
  }

  // If a visual sets `state.__anim.ui.autoPlay = true`, start playing immediately (even if tab never opened).
  maybeAutoplayAnimation({ mountEl, state, onChange: rerender });
  const baseline = getHistorySnapshot(state);
  if (baseline) history.last = baseline;
  history.suspend = Math.max(0, history.suspend - 1);
  setActiveUndoContext({
    state,
    undo: () => {
      if (!history?.past?.length) return false;
      const snapshot = history.past.pop();
      if (history.last) history.future.push(history.last);
      const applied = withHistorySuspended(history, () => {
        const ok = applyHistorySnapshot(state, history, snapshot);
        if (!ok) return false;
        syncPersistentUi();
        applyLayoutFromUi();
        rerender();
        rebuildAutoUI();
        return true;
      });
      if (!applied) return false;
      persistUiNow();
      persistSettings();
      return true;
    },
  });
  return { rebuildAutoUI };
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

  //const state = providedState || makeDefaultState(spec);
  const state = makeDefaultState(spec);
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

  const runtimeRef = { instance: null, xfRuntime: null };

  const ensureRuntime = () => {
    if (!state.shouldRender) return runtimeRef;
    if (!runtimeRef.instance) {
      runtimeRef.instance = spec.create({ mountEl }, state);
    }
    if (!runtimeRef.xfRuntime) {
      ensureTransformState(state);
      runtimeRef.xfRuntime = initTransformRuntime({ mountEl, state });
    }
    return runtimeRef;
  };

  const { rebuildAutoUI } = mountVisualUI({
    uiEl,
    spec,
    state,
    mountEl,
    xfRuntime: runtimeRef.xfRuntime,
    instance: runtimeRef.instance,
    runtimeRef,
    ensureRuntime,
    visualId,
  });

  document.getElementById("button-info").onclick = () => {
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
    get instance() {
      return runtimeRef.instance;
    },
    getParamsJSON: () => getVisualParamsTree(spec, state),
    setVisual(nextId) {
      runtimeRef.instance?.destroy?.();
      uiEl.innerHTML = "";
      mountEl.innerHTML = "";
      return runVisualApp({ visualId: nextId, mountEl, uiEl });
    },
  };
}

export function buildControl({ param, state, onChange }) {
  const labelText = param.label ?? param.key;
  const wrap = el("div", { className: ["vr-row", param.cssClass].filter(Boolean).join(" ") });
  wrap.appendChild(el("label", { className: "vr-label", textContent: labelText }));

  if (param.description) {
    wrap.appendChild(el("div", { className: "vr-help", textContent: param.description }));
  }

  const value = getByPath(state, param.key);
  const builder = CONTROL_BUILDERS[param.type] || buildTextControl;
  const input = builder({ param, state, value, onChange });

  if (param.cssClass && input instanceof HTMLElement) input.classList.add(param.cssClass);

  const inputWrap = el("div", { className: "vr-input" });
  inputWrap.appendChild(input);
  wrap.appendChild(inputWrap);

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
  const hasRange = isFiniteNumber(param.min) && isFiniteNumber(param.max);
  const startingValue = value ?? param.default ?? 0;

  if (!hasRange) {
    const input = el("input", { type: "number", step: String(param.step ?? 1) });
    input.value = String(startingValue);
    const commit = () => {
      setByPath(state, param.key, toNumber(input.value));
      onChange?.(param.key, getByPath(state, param.key), state);
    };
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    return input;
  }

  const row = el("div", { className: "vr-rangeRow" });
  const slider = el("input", {
    type: "range",
    min: String(param.min),
    max: String(param.max),
    step: String(param.step ?? 1),
    value: String(startingValue),
  });
  const box = el("input", {
    type: "number",
    min: String(param.min),
    max: String(param.max),
    step: String(param.step ?? 1),
    value: String(startingValue),
  });

  const sync = (next) => {
    const val = toNumber(next, toNumber(startingValue, 0));
    setByPath(state, param.key, val);
    slider.value = String(val);
    box.value = String(val);
    onChange?.(param.key, val, state);
  };

  slider.addEventListener("input", () => sync(slider.value));
  box.addEventListener("change", () => sync(box.value));
  box.addEventListener("blur", () => sync(box.value));

  row.appendChild(slider);
  row.appendChild(box);
  return row;
}

function buildVectorControl({ param, state, onChange, value, dims }) {
  const def = param.default ?? (dims === 3 ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0 });
  let vec = normalizeVector(value ?? def, def, dims);
  const row = el("div", { className: "vr-rangeRow" });

  const axes = dims === 3 ? ["x", "y", "z"] : ["x", "y"];
  for (const axis of axes) {
    const box = el("input", {
      type: "number",
      step: String(param.step ?? 1),
      value: String(vec[axis] ?? 0),
    });

    const sync = () => {
      const nextVal = clampNumber(
        toNumber(box.value),
        typeof param.min === "number" ? param.min : -Infinity,
        typeof param.max === "number" ? param.max : Infinity
      );
      vec = { ...vec, [axis]: nextVal };
      setByPath(state, param.key, vec);
      onChange?.(param.key, vec, state);
    };

    box.addEventListener("change", sync);
    box.addEventListener("blur", sync);

    const wrap = el("div", { className: "vr-vecField" });
    wrap.appendChild(el("div", { className: "vr-vecLabel", textContent: axis }));
    wrap.appendChild(box);
    row.appendChild(wrap);
  }

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
