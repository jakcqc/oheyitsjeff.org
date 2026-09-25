/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// helper/animationHelp.js
// Generic animation tab for oheyitsjeff.org visuals.
// - Animate numeric *state params* (dot-path allowed) for N targets simultaneously, OR a numeric SVG attr/style.
// - Uses requestAnimationFrame with FPS throttling.
// - Persists settings in state.__anim.ui (so Save Settings includes it).

import { el, getByPath, setByPath } from "./visualHelp.js";
import { registerTab } from "./visualHelp.js";
import { createSubTabs } from "./subTabs.js";

const RUNTIMES = new WeakMap();

function mergeInto(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (["__proto__", "prototype", "constructor"].includes(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
        target[key] = {};
      }
      mergeInto(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

export function ensureAnimateState(state) {
  if (!state.__anim || typeof state.__anim !== "object") state.__anim = {};
  if (!state.__anim.ui || typeof state.__anim.ui !== "object" || Array.isArray(state.__anim.ui)) state.__anim.ui = {};
  const defaults = {
    targetType: "params", // "params" | "svg"

    // params mode (N targets)
    paramTargets: [
      // { key: "zoom", from: 0, to: 10 }
    ],

    // (legacy single-param fields; kept for backward compat + migration)
    paramKey: "",

    // svg mode
    selector: "svg",     // CSS selector relative to mountEl
    svgKind: "attr",     // "attr" | "style"
    svgName: "opacity",  // attr or style property name

    // shared timing + easing
    durationSec: 3,
    fps: 20,
    easing: "linear",   // "linear" | "easeInOutQuad" | "easeInQuad" | "easeOutQuad"
    loop: false,
    yoyo: false,

    // Playback state and legacy JSON/API fields. Flow only exposes Loop/Yoyo.
    progress01: 0,       // 0..1 scrubber
    autoFromCurrent: false,
    snapToEndOnStop: false,
    autoPlay: false,
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (state.__anim.ui[key] == null) state.__anim.ui[key] = value;
  }

  // --- migrate legacy single-param fields into paramTargets if needed ---
  const ui = state.__anim.ui;
  if (!Array.isArray(ui.paramTargets)) ui.paramTargets = [];
  if (ui.autoPlay == null) ui.autoPlay = false;
  if (!["flow", "json"].includes(ui.view)) ui.view = "flow";

  const legacyKey = String(ui.paramKey || "").trim();
  const hasLegacy = legacyKey.length > 0;

  // If targetType was "param" historically, normalize to "params"
  if (ui.targetType === "param") ui.targetType = "params";

  // If we have legacy fields but no targets, seed targets
  if (hasLegacy && ui.paramTargets.length === 0) {
    // Legacy also used ui.from/ui.to; those fields might exist in saved state.
    const legacyFrom = ("from" in ui) ? ui.from : 0;
    const legacyTo = ("to" in ui) ? ui.to : 10;
    ui.paramTargets.push({ key: legacyKey, from: legacyFrom, to: legacyTo });
  }

  if (ui.from == null) ui.from = 0;
  if (ui.to == null) ui.to = 1;

  // Clean up stray legacy numeric fields (safe to leave, but keeps state tidy)
  // We won't delete to avoid surprising older saves; but we also won't rely on them.
}

export function maybeAutoplayAnimation({ mountEl, state, onChange }) {
  ensureAnimateState(state);
  const ui = state.__anim?.ui || {};
  if (!ui.autoPlay) return;

  const rt = getOrMakeRuntime({ mountEl, state, onChange });
  if (rt.playing) return;
  rt.play();
}

// Public controls for the assistant and other shared panels. Configuration is
// validated by the caller; this uses the same runtime as the animation editor.
export function controlAnimation(ctx, command) {
  if (!["play", "pause", "stop", "toggle", "restart"].includes(command)) throw new Error("Unknown animation command.");
  ensureAnimateState(ctx.state);
  const rt = getOrMakeRuntime(ctx);
  if (command === "stop") {
    rt.stop({ snap: false });
    rt.initialized = false;
    rt.dir = 1;
  }
  else if (command === "toggle") rt.playing ? rt.pause() : rt.play();
  else if (command === "restart") rt.restart();
  else rt[command]();
  return { playing: rt.playing, paused: rt.paused, progress01: ctx.state.__anim.ui.progress01 };
}

export function registerAnimateTab() {
  registerTab("animate", ({ mountEl, state, spec, xfRuntime, onChange, onStateChange }) =>
    buildAnimatePanel({ mountEl, state, spec, xfRuntime, onChange, onStateChange })
  );
}

function ease(t, kind) {
  t = Math.max(0, Math.min(1, t));
  switch (kind) {
    case "easeInQuad": return t * t;
    case "easeOutQuad": return t * (2 - t);
    case "easeInOutQuad":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "linear":
    default:
      return t;
  }
}

function clampNum(x, fallback = 0) {
  if (x == null || x === "") return fallback;
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function safeParamKey(key) {
  return key.split(".").every((part) => part && !["__proto__", "prototype", "constructor"].includes(part));
}

function cleanTargets(ui) {
  const arr = Array.isArray(ui.paramTargets) ? ui.paramTargets : [];
  const out = [];
  const seen = new Set();

  for (const t of arr) {
    if (!t || typeof t !== "object" || Array.isArray(t)) continue;
    const key = String(t?.key || "").trim();
    if (!key || !safeParamKey(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    t.key = key;
    // Missing starts are resolved when playback starts, not while reading a save.
    if (t.from != null && t.from !== "") t.from = clampNum(t.from, 0);
    if (t.to != null && t.to !== "") t.to = clampNum(t.to, 0);
    out.push(t);
  }

  ui.paramTargets = out;
  return out;
}

function getOrMakeRuntime({ mountEl, state, onChange }) {
  let rt = RUNTIMES.get(state);
  if (rt) {
    // keep latest closures
    if (mountEl != null) rt.mountEl = mountEl;
    if (onChange != null) rt.onChange = onChange;
    return rt;
  }

  rt = {
    mountEl,
    onChange,
    playing: false,
    paused: false,
    initialized: false,
    raf: 0,
    lastFrameAt: 0,
    startAt: 0,

    // multi-target tween state
    froms: [],
    tos: [],
    dir: 1,

    // svg tween state
    from: 0,
    to: 1,

    subs: new Set(),

    notify() {
      for (const fn of rt.subs) {
        try { fn(); } catch {}
      }
    },

    readCurrentValues() {
      const ui = state.__anim?.ui || {};

      if (ui.targetType === "svg") {
        const els = rt.mountEl?.querySelectorAll?.(ui.selector || "") || [];
        const first = els[0];
        if (!first) return clampNum(ui.from, 0);

        if (ui.svgKind === "style") {
          const v = first.style?.[ui.svgName];
          return clampNum(v, clampNum(ui.from, 0));
        } else {
          const v = first.getAttribute(ui.svgName);
          return clampNum(v, clampNum(ui.from, 0));
        }
      }

      // params: return array matching ui.paramTargets
      const targets = cleanTargets(ui);
      const vals = [];
      for (const t of targets) {
        vals.push(clampNum(getByPath(state, t.key), t.from));
      }
      return vals;
    },

    resolveEndpoints() {
      const ui = state.__anim.ui;
      const current = rt.readCurrentValues();
      if (ui.targetType === "svg") {
        rt.from = clampNum(ui.from, clampNum(current, 0));
        rt.to = clampNum(ui.to, rt.from);
      } else {
        const targets = cleanTargets(ui);
        rt.froms = targets.map((target, index) => clampNum(target.from, clampNum(current[index], 0)));
        rt.tos = targets.map((target, index) => clampNum(target.to, rt.froms[index]));
      }
      rt.initialized = true;
    },

    applyProgress(progress) {
      const ui = state.__anim.ui;
      const eased = ease(progress, ui.easing);
      ui.progress01 = progress;
      if (ui.targetType === "svg") rt.applyValues(rt.from + (rt.to - rt.from) * eased);
      else rt.applyValues(rt.froms.map((from, index) => from + (rt.tos[index] - from) * eased));
    },

    applyValues(v) {
      const ui = state.__anim?.ui || {};

      if (ui.targetType === "svg") {
        const sel = String(ui.selector || "").trim();
        if (!sel) return;

        // Rebuild first; then apply the numeric SVG value to the current nodes.
        rt.onChange?.("__anim.progress01", v, state);
        const nodes = rt.mountEl?.querySelectorAll?.(sel);
        if (!nodes || nodes.length === 0) return;

        for (const node of nodes) {
          if (!(node instanceof Element)) continue;
          if (ui.svgKind === "style") {
            node.style[ui.svgName] = String(v);
          } else {
            node.setAttribute(ui.svgName, String(v));
          }
        }
        return;
      }

      // params mode
      const targets = cleanTargets(ui);
      if (!Array.isArray(v)) return;

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const val = v[i];
        setByPath(state, t.key, val);
      }
      rt.onChange?.("__anim.progress01", v, state);
    },

    stop({ snap = false } = {}) {
      if (rt.raf) cancelAnimationFrame(rt.raf);
      rt.raf = 0;
      rt.playing = false;
      rt.paused = false;
      rt.lastFrameAt = 0;

      const ui = state.__anim?.ui || {};
      if (snap) {
        if (ui.targetType === "svg") {
          const v = clampNum(rt.to, clampNum(ui.to, 1));
          rt.applyValues(v);
          ui.progress01 = 1;
        } else {
          const targets = cleanTargets(ui);
          const endVals = targets.map((t, i) => clampNum(rt.tos[i], t.to));
          rt.applyValues(endVals);
          ui.progress01 = 1;
        }
      }

      rt.notify();
    },

    pause() {
      if (!rt.playing) return;
      const progress = state.__anim.ui.progress01;
      rt.stop({ snap: false });
      rt.paused = true;
      state.__anim.ui.progress01 = progress;
      rt.notify();
    },

    play() {
      if (rt.playing) return;
      const ui = state.__anim?.ui || {};
      if (ui.targetType !== "svg" && !cleanTargets(ui).length) { rt.notify(); return; }
      const durMs = Math.max(1, clampNum(ui.durationSec, 1) * 1000);
      const fps = Math.max(1, clampNum(ui.fps, 60));
      const frameMs = 1000 / fps;

      const resume = !!rt.paused && ui.progress01 < 1;
      const startProgress = resume ? clampNum(ui.progress01, 0) : 0;
      rt.stop({ snap: false });

      rt.playing = true;
      rt.startAt = performance.now() - startProgress * durMs;
      rt.lastFrameAt = 0;
      if (!resume) rt.dir = 1;
      ui.progress01 = startProgress;

      if (!resume) rt.resolveEndpoints();
      // Starting/restarting applies only listed properties, immediately.
      rt.applyProgress(startProgress);

      const tick = (now) => {
        if (!rt.playing) return;

        // FPS throttle
        if (rt.lastFrameAt && (now - rt.lastFrameAt) < frameMs) {
          rt.raf = requestAnimationFrame(tick);
          return;
        }
        rt.lastFrameAt = now;

        let t = (now - rt.startAt) / durMs;
        if (!Number.isFinite(t)) t = 0;
        // RAF timestamps can precede performance.now() sampled during resume.
        // Preserve the scrubbed/paused position until the frame clock catches up.
        t = Math.max(clampNum(ui.progress01, 0), Math.max(0, Math.min(1, t)));

        rt.applyProgress(t);

        rt.notify();

        if (t >= 1) {
          if (ui.loop) {
            if (ui.yoyo) {
              // swap direction
              if (ui.targetType === "svg") {
                const tmp = rt.from;
                rt.from = rt.to;
                rt.to = tmp;
                rt.dir *= -1;
              } else {
                const tmpFroms = rt.froms;
                rt.froms = rt.tos;
                rt.tos = tmpFroms;
                rt.dir *= -1;
              }
            }
            rt.startAt = now;
            ui.progress01 = 0;
            rt.notify();
            rt.raf = requestAnimationFrame(tick);
            return;
          } else {
            rt.stop({ snap: false });
            return;
          }
        }

        rt.raf = requestAnimationFrame(tick);
      };

      rt.raf = requestAnimationFrame(tick);
      rt.notify();
    },

    restart() {
      rt.stop({ snap: false });
      rt.initialized = false;
      state.__anim.ui.progress01 = 0;
      rt.play();
    },

    scrubTo(p01) {
      const ui = state.__anim?.ui || {};
      const p = Math.max(0, Math.min(1, clampNum(p01, 0)));
      rt.stop({ snap: false });
      // Resolve omitted starts once so repeated scrub input does not drift.
      if (!rt.initialized || rt.dir !== 1) rt.resolveEndpoints();
      rt.dir = 1;
      rt.paused = true;
      rt.applyProgress(p);

      rt.notify();
    },

    subscribe(fn) {
      rt.subs.add(fn);
      return () => rt.subs.delete(fn);
    }
  };

  RUNTIMES.set(state, rt);
  return rt;
}

function numericParamKeys(spec) {
  const out = [];
  for (const p of (spec?.params || [])) {
    if (p?.type === "number" && p?.key) out.push(p.key);
    if ((p?.type === "vector2D" || p?.type === "vector3D") && p?.key) {
      for (const axis of p.type === "vector3D" ? ["x", "y", "z"] : ["x", "y"]) out.push(`${p.key}.${axis}`);
    }
  }
  return out;
}

export function buildAnimatePanel({ mountEl, state, spec, onChange, onStateChange, xfRuntime }) {
  ensureAnimateState(state);
  const ui = state.__anim.ui;
  if (ui.targetType !== "svg") ui.targetType = "params";
  cleanTargets(ui);
  const rt = getOrMakeRuntime({ mountEl, state, onChange });
  const root = el("div", { className: "anim-panel" });
  const flowPanel = el("div", { className: "anim-flow" });
  const jsonPanel = el("div", { className: "anim-json" });
  const status = el("div", { className: "anim-status", role: "status" });
  const keys = numericParamKeys(spec);
  const dl = el("datalist", { id: "anim-keys-" + Math.random().toString(16).slice(2) });
  keys.forEach((key) => dl.appendChild(el("option", { value: key })));
  const bindings = [];
  const editor = state.__anim.editor || (state.__anim.editor = {});

  const markDirty = () => onStateChange?.();
  const edited = () => {
    // Configuration changes end paused/running tweens and their endpoint cache.
    rt.stop({ snap: false });
    rt.initialized = false;
    markDirty();
  };
  const row = (label, input) => el("label", { className: "anim-row" }, [
    el("span", { className: "anim-label", textContent: label }), input,
  ]);
  const button = (text, onclick, title) => el("button", { type: "button", textContent: text, onclick, title: title || text });
  const numericInput = (object, key, label, fallback = 0) => {
    const input = el("input", { type: "number", step: "any", value: String(object[key] ?? fallback), "aria-label": label });
    input.oninput = () => {
      if (input.value === "" && key === "from") { delete object[key]; edited(); return; }
      if (input.value === "" || !Number.isFinite(input.valueAsNumber)) return;
      if (input.min !== "" && input.valueAsNumber < Number(input.min)) return;
      object[key] = input.valueAsNumber;
      edited();
    };
    return input;
  };
  const bind = (key, input) => {
    const sync = () => {
      if (input.type === "checkbox") input.checked = !!ui[key];
      else input.value = String(ui[key] ?? "");
    };
    bindings.push(sync);
    sync();
    return input;
  };
  const numericSetting = (key, label, fallback, min, step = "any") => {
    const input = numericInput(ui, key, label, fallback);
    input.min = String(min);
    input.step = step;
    bind(key, input);
    return input;
  };
  const checkSetting = (key, label) => {
    const input = bind(key, el("input", { type: "checkbox" }));
    input.onchange = () => { ui[key] = input.checked; edited(); };
    return el("label", { className: "anim-check" }, [input, el("span", { textContent: label })]);
  };

  const addKey = el("input", { type: "text", placeholder: "Choose or type a numeric property", list: dl.id, "aria-label": "Add animation parameter" });
  const addMessage = el("div", { className: "anim-help", role: "status" });
  const addTarget = () => {
    const key = addKey.value.trim();
    if (!key) return;
    if (ui.paramTargets.some((target) => target.key === key)) {
      addMessage.textContent = "That property is already in the flow.";
      return;
    }
    const current = getByPath(state, key);
    if (!safeParamKey(key) || typeof current !== "number" || !Number.isFinite(current)) {
      addMessage.textContent = "Choose a numeric property or a vector component such as position.x.";
      return;
    }
    ui.targetType = "params";
    ui.paramTargets.push({ key, from: current, to: current + 10 });
    addKey.value = "";
    addMessage.textContent = "";
    edited();
    refreshEditors();
  };
  addKey.onkeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); addTarget(); } };
  const targetsList = el("div", { className: "anim-targets tool-flow-stage-list" });
  flowPanel.append(
    el("p", { className: "anim-help", textContent: "Animate these properties together. Other parameters keep their current values." }),
    row("Duration (seconds)", numericSetting("durationSec", "Duration in seconds", 3, 0.01, "0.01")),
    row("Frames per second", numericSetting("fps", "Frames per second", 20, 1, "1")),
    el("div", { className: "anim-checks" }, [checkSetting("loop", "Loop"), checkSetting("yoyo", "Yoyo")]),
    row("Add property", el("div", { className: "tool-flow-actions" }, [addKey, button("Add", addTarget)])),
    addMessage,
    targetsList,
  );

  const endpoints = (target, name) => {
    const current = clampNum(getByPath(state, target.key), 0);
    const start = numericInput(target, "from", name + " start", "");
    if (target.from == null || target.from === "") start.placeholder = String(current);
    return el("div", { className: "anim-endpoints" }, [
      row("Start", start),
      el("span", { className: "anim-arrow", textContent: "\u2192", "aria-hidden": "true" }),
      row("End", numericInput(target, "to", name + " end", current)),
    ]);
  };
  const renderTargets = () => {
    targetsList.replaceChildren();
    if (ui.targetType === "svg") {
      // Older SVG saves remain playable and editable through JSON.
      targetsList.appendChild(el("div", { className: "tool-flow-stage anim-flow-card anim-svg-card" }, [
        el("div", { className: "tool-flow-stage-title", textContent: ui.selector + " \u00b7 " + ui.svgKind + "." + ui.svgName }),
        endpoints(ui, "SVG"),
      ]));
      return;
    }
    ui.paramTargets.forEach((target, index) => {
      const name = el("div", { className: "tool-flow-stage-title", textContent: target.key, title: target.key });
      const remove = button("\u00d7", () => {
        ui.paramTargets.splice(index, 1);
        edited();
        refreshEditors();
      }, "Remove animation property");
      remove.setAttribute("aria-label", "Remove " + target.key);
      targetsList.appendChild(el("div", { className: "tool-flow-stage anim-flow-card" }, [
        name, endpoints(target, target.key), remove,
      ]));
    });
    if (!ui.paramTargets.length) targetsList.appendChild(el("p", {
      className: "anim-help", textContent: "Add a numeric property to set its Start and End values. Vector x, y, and z components are supported.",
    }));
  };

  const jsonBox = el("textarea", { rows: 16, className: "anim-json-editor", "aria-label": "Animation JSON" });
  const jsonMessage = el("div", { className: "anim-help", role: "status" });
  jsonBox.value = editor.draft ?? JSON.stringify(ui, null, 2);
  jsonBox.oninput = () => { editor.draft = jsonBox.value; markDirty(); };
  const syncJson = () => {
    delete editor.draft;
    jsonBox.value = JSON.stringify(ui, null, 2);
    jsonMessage.textContent = "Edit the animation settings object, then Apply JSON.";
  };
  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonBox.value);
      const next = parsed?.__anim?.ui ?? parsed;
      if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error("Expected an animation settings object.");
      if (next.targetType != null && !["param", "params", "svg"].includes(next.targetType)) throw new Error("targetType must be params or svg.");
      if (next.paramTargets != null && (!Array.isArray(next.paramTargets) || next.paramTargets.some((target) =>
        !target || typeof target.key !== "string" || !target.key.trim() || !safeParamKey(target.key.trim())
        || (target.from != null && !Number.isFinite(target.from)) || !Number.isFinite(target.to)
      ))) throw new Error("Each property needs a key and numeric to value; from may be omitted to use its current value.");
      for (const key of ["durationSec", "fps"]) {
        if (next[key] != null && (!Number.isFinite(next[key]) || next[key] <= 0)) throw new Error(key + " must be greater than zero.");
      }
      for (const key of ["from", "to", "progress01"]) {
        if (next[key] != null && !Number.isFinite(next[key])) throw new Error(key + " must be numeric.");
      }
      if (next.selector != null) mountEl.querySelector(next.selector);
      rt.stop({ snap: false });
      rt.initialized = false;
      const view = ui.view;
      // Keep panel references and the current editor view stable.
      mergeInto(ui, next);
      ui.view = view;
      ensureAnimateState(state);
      cleanTargets(ui);
      syncJson();
      markDirty();
      refreshEditors();
      jsonMessage.textContent = "Applied JSON.";
    } catch (error) {
      jsonMessage.textContent = "Invalid JSON: " + (error.message || error);
    }
  };
  jsonPanel.append(jsonBox, el("div", { className: "tool-flow-actions" }, [
    button("Apply JSON", applyJson),
    button("Reset editor", () => { syncJson(); markDirty(); }),
    button("Copy JSON", async () => {
      try { await navigator.clipboard.writeText(jsonBox.value); jsonMessage.textContent = "Copied JSON."; }
      catch { jsonMessage.textContent = "Copy unavailable. Select and copy the JSON text."; }
    }),
  ]), jsonMessage);

  const viewTabs = createSubTabs({
    label: "Animation view", value: ui.view,
    options: [
      { value: "flow", label: "Flow", panel: flowPanel },
      { value: "json", label: "JSON", panel: jsonPanel },
    ],
    onChange: (value) => { ui.view = value; markDirty(); refreshEditors(); },
  });
  const run = (restart = false) => {
    try {
      if (ui.targetType === "svg") mountEl.querySelector(ui.selector);
      else if (!cleanTargets(ui).length) { status.textContent = "Add a property before playing."; return; }
      xfRuntime?.rebuildNow?.();
      restart ? rt.restart() : rt.play();
      markDirty();
    } catch (error) { rt.stop({ snap: false }); status.textContent = "Cannot play: " + (error.message || error); }
  };
  const play = button("Play", () => run(), "Play or resume animation (P)");
  const pause = button("Pause", () => { rt.pause(); markDirty(); }, "Pause animation (P)");
  const stop = button("Stop", () => { rt.stop({ snap: false }); markDirty(); }, "Stop and keep current values");
  const restart = button("Restart", () => run(true), "Restart animation from its configured Start values (R)");
  const progress = el("input", { type: "range", min: "0", max: "1", step: "0.001", "aria-label": "Animation progress" });
  const scrub = (value) => {
    try { rt.scrubTo(value); markDirty(); }
    catch (error) { status.textContent = "Cannot scrub: " + (error.message || error); }
  };
  progress.oninput = () => scrub(clampNum(progress.value, 0));
  const transport = el("div", { className: "anim-transport" }, [
    el("div", { className: "tool-flow-actions" }, [play, pause, restart, stop]),
    row("Progress", progress), status,
    el("p", { className: "anim-help", textContent: "P: play/pause animation \u00b7 R: restart animation \u00b7 Space: pause/resume simulation" }),
  ]);
  const refreshTransport = () => {
    progress.value = String(ui.progress01 ?? 0);
    play.textContent = rt.paused && ui.progress01 < 1 ? "Resume" : "Play";
    play.disabled = rt.playing;
    pause.disabled = !rt.playing;
    stop.disabled = !rt.playing && !rt.paused;
    status.textContent = (rt.playing ? "Playing" : rt.paused ? "Paused" : "Stopped") + " \u00b7 " + (clampNum(ui.progress01, 0) * 100).toFixed(1) + "%";
  };
  function refreshEditors() {
    bindings.forEach((sync) => sync());
    renderTargets();
    if (ui.view === "json" && editor.draft == null) syncJson();
    refreshTransport();
  }
  root.append(viewTabs.root, flowPanel, jsonPanel, transport, dl);
  root._onShow = refreshTransport;
  root._destroy = rt.subscribe(refreshTransport);
  refreshEditors();
  return root;
}
