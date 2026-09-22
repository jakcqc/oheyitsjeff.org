/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// helper/animateHelp.js
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

    // UI convenience
    progress01: 0,       // 0..1 scrubber
    autoFromCurrent: true,
    snapToEndOnStop: true,
    autoPlay: false,
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (state.__anim.ui[key] == null) state.__anim.ui[key] = value;
  }

  // --- migrate legacy single-param fields into paramTargets if needed ---
  const ui = state.__anim.ui;
  if (!Array.isArray(ui.paramTargets)) ui.paramTargets = [];
  if (ui.autoPlay == null) ui.autoPlay = false;
  if (!["edit", "flow", "json"].includes(ui.view)) ui.view = "edit";

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
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function cleanTargets(ui) {
  const arr = Array.isArray(ui.paramTargets) ? ui.paramTargets : [];
  const out = [];
  const seen = new Set();

  for (const t of arr) {
    const key = String(t?.key || "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    Object.assign(t, { key, from: clampNum(t.from, 0), to: clampNum(t.to, 0) });
    out.push(t);
  }

  ui.paramTargets = out;
  return out;
}

function getOrMakeRuntime({ mountEl, state, onChange }) {
  let rt = RUNTIMES.get(state);
  if (rt) {
    // keep latest closures
    rt.mountEl = mountEl;
    rt.onChange = onChange;
    return rt;
  }

  rt = {
    mountEl,
    onChange,
    playing: false,
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

    applyValues(v) {
      const ui = state.__anim?.ui || {};

      if (ui.targetType === "svg") {
        const sel = String(ui.selector || "").trim();
        if (!sel) return;

        // Rebuild first; then apply the numeric SVG value to the current nodes.
        rt.onChange?.("__anim.svg", v, state);
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
      rt.onChange?.("__anim.params", v, state);
    },

    stop({ snap } = {}) {
      if (rt.raf) cancelAnimationFrame(rt.raf);
      rt.raf = 0;
      rt.playing = false;
      rt.paused = false;
      rt.lastFrameAt = 0;

      const ui = state.__anim?.ui || {};
      const shouldSnap = (snap != null) ? !!snap : !!ui.snapToEndOnStop;

      if (shouldSnap) {
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
      const ui = state.__anim?.ui || {};
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

      if (!resume) {
        if (ui.targetType === "svg") {
          // resolve endpoints for svg
          const cur = rt.readCurrentValues();
          const startV = ui.autoFromCurrent ? clampNum(cur, clampNum(ui.from, 0)) : clampNum(ui.from, clampNum(cur, 0));
          const endV = clampNum(ui.to, startV);

          rt.from = startV;
          rt.to = endV;
        } else {
          // resolve endpoints for each param target
          const targets = cleanTargets(ui);
          const cur = rt.readCurrentValues(); // array
          const froms = [];
          const tos = [];

          for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            const curV = clampNum(cur?.[i], clampNum(t.from, 0));

            const startV = ui.autoFromCurrent ? curV : clampNum(t.from, curV);
            const endV = clampNum(t.to, startV);

            froms.push(startV);
            tos.push(endV);
          }

          rt.froms = froms;
          rt.tos = tos;
        }

      }

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
        if (t >= 1) t = 1;

        const e = ease(t, ui.easing);
        ui.progress01 = t;

        if (ui.targetType === "svg") {
          const v = rt.from + (rt.to - rt.from) * e;
          rt.applyValues(v);
        } else {
          const vals = [];
          for (let i = 0; i < rt.froms.length; i++) {
            vals.push(rt.froms[i] + (rt.tos[i] - rt.froms[i]) * e);
          }
          rt.applyValues(vals);
        }

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
            rt.raf = requestAnimationFrame(tick);
            return;
          } else {
            rt.stop({ snap: true });
            return;
          }
        }

        rt.raf = requestAnimationFrame(tick);
      };

      rt.raf = requestAnimationFrame(tick);
      rt.notify();
    },

    scrubTo(p01) {
      const ui = state.__anim?.ui || {};
      const p = Math.max(0, Math.min(1, clampNum(p01, 0)));
      ui.progress01 = p;
      rt.dir = 1;
      rt.paused = true;

      const e = ease(p, ui.easing);

      if (ui.targetType === "svg") {
        const from = clampNum(ui.from, 0);
        const to = clampNum(ui.to, 0);
        rt.from = from;
        rt.to = to;
        const v = from + (to - from) * e;
        rt.applyValues(v);
      } else {
        const targets = cleanTargets(ui);
        rt.froms = targets.map((target) => target.from);
        rt.tos = targets.map((target) => target.to);
        const vals = targets.map(t => {
          const from = clampNum(t.from, 0);
          const to = clampNum(t.to, 0);
          return from + (to - from) * e;
        });
        rt.applyValues(vals);
      }

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
  const editPanel = el("div", { className: "anim-edit" });
  const flowPanel = el("div", { className: "anim-flow" });
  const jsonPanel = el("div", { className: "anim-json" });
  const status = el("div", { className: "anim-status", role: "status" });
  const keys = numericParamKeys(spec);
  const dl = el("datalist", { id: `anim-keys-${Math.random().toString(16).slice(2)}` });
  keys.forEach((key) => dl.appendChild(el("option", { value: key })));
  const bindings = [];
  const editor = state.__anim.editor || (state.__anim.editor = {});

  const markDirty = () => onStateChange?.();
  const edited = () => {
    // End a paused tween's cached endpoints when its properties change.
    if (rt.playing || rt.paused) rt.stop({ snap: false });
    markDirty();
  };
  const row = (label, input) => el("label", { className: "anim-row" }, [
    el("span", { className: "anim-label", textContent: label }), input,
  ]);
  const button = (text, onclick, title) => el("button", { type: "button", textContent: text, onclick, title: title || text });
  const numericInput = (object, key, label, fallback = 0) => {
    const input = el("input", { type: "number", step: "any", value: String(object[key] ?? fallback), "aria-label": label });
    input.oninput = () => {
      if (input.value === "" || !Number.isFinite(input.valueAsNumber)) return;
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
  const textSetting = (key, label, fallback) => {
    if (ui[key] == null) ui[key] = fallback;
    const input = bind(key, el("input", { type: "text", "aria-label": label }));
    input.oninput = () => { ui[key] = input.value; edited(); };
    return input;
  };
  const selectSetting = (key, label, values) => {
    const input = el("select", { "aria-label": label });
    values.forEach((value) => input.appendChild(el("option", { value, textContent: value })));
    bind(key, input);
    input.onchange = () => { ui[key] = input.value; edited(); };
    return input;
  };
  const numericSetting = (key, label, fallback, min, step = "any") => {
    if (ui[key] == null) ui[key] = fallback;
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

  const paramsPanel = el("div");
  const svgPanel = el("div");
  const targetTabs = createSubTabs({
    label: "Animation target", value: ui.targetType,
    options: [
      { value: "params", label: "Parameters", panel: paramsPanel },
      { value: "svg", label: "SVG", panel: svgPanel },
    ],
    onChange: (value) => { ui.targetType = value; edited(); refreshEditors(); },
  });
  const addKey = el("input", { type: "text", placeholder: "Choose or type a parameter", list: dl.id, "aria-label": "Add animation parameter" });
  const addTarget = () => {
    const key = addKey.value.trim();
    if (!key || ui.paramTargets.some((target) => target.key === key)) return;
    const current = clampNum(getByPath(state, key), 0);
    ui.paramTargets.push({ key, from: current, to: current + 10 });
    addKey.value = "";
    edited();
    refreshEditors();
  };
  addKey.onkeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); addTarget(); } };
  const targetsList = el("div", { className: "anim-targets tool-flow-stage-list" });
  const captureAll = (key) => {
    ui.paramTargets.forEach((target) => { target[key] = clampNum(getByPath(state, target.key), target[key]); });
    edited();
    refreshEditors();
  };
  paramsPanel.append(
    row("Add parameter", el("div", { className: "tool-flow-actions" }, [addKey, button("Add", addTarget)])),
    el("div", { className: "tool-flow-actions" }, [
      button("Capture all starts", () => captureAll("from")),
      button("Capture all ends", () => captureAll("to")),
    ]), targetsList,
  );
  const selector = textSetting("selector", "SVG selector", "svg");
  selector.placeholder = "* or rect,circle,path,line";
  svgPanel.append(
    row("Selector", selector),
    row("Property kind", selectSetting("svgKind", "SVG property kind", ["attr", "style"])),
    row("Property", textSetting("svgName", "SVG property", "opacity")),
    row("Start", bind("from", numericInput(ui, "from", "SVG start"))),
    row("End", bind("to", numericInput(ui, "to", "SVG end", 1))),
    el("div", { className: "tool-flow-actions" }, [
      button("Capture start", () => { ui.from = rt.readCurrentValues(); edited(); refreshEditors(); }),
      button("Capture end", () => { ui.to = rt.readCurrentValues(); edited(); refreshEditors(); }),
    ]),
  );
  const timing = el("details", { className: "vr-paramGroup", open: ui.timingOpen !== false }, [
    el("summary", { className: "vr-paramGroupTitle", textContent: "Timing and playback settings" }),
    el("div", { className: "vr-paramGroupBody" }, [
      row("Duration (seconds)", numericSetting("durationSec", "Duration in seconds", 3, 0.01, "0.01")),
      row("Frames per second", numericSetting("fps", "Frames per second", 20, 1, "1")),
      row("Easing", selectSetting("easing", "Animation easing", ["linear", "easeInOutQuad", "easeInQuad", "easeOutQuad"])),
      el("div", { className: "anim-checks" }, [
        checkSetting("loop", "Loop"), checkSetting("yoyo", "Yoyo"),
        checkSetting("autoFromCurrent", "Start from current values"),
        checkSetting("snapToEndOnStop", "Snap to end on stop"),
        checkSetting("autoPlay", "Autoplay when loaded"),
      ]),
    ]),
  ]);
  timing.ontoggle = () => { ui.timingOpen = timing.open; markDirty(); };
  editPanel.append(targetTabs.root, paramsPanel, svgPanel, timing);

  const renderTargets = () => {
    targetsList.replaceChildren();
    flowPanel.replaceChildren(el("p", {
      className: "anim-help",
      textContent: "Start → end. All properties animate together. Edit values here; use Edit for targeting and timing settings.",
    }));
    const compactList = el("div", { className: "tool-flow-stage-list" });
    flowPanel.appendChild(compactList);
    const makeCard = (target, index, compact) => {
      const card = el("div", { className: compact ? "tool-flow-stage anim-flow-card" : "anim-target-card" });
      const keyInput = el("input", { type: "text", value: target.key, list: dl.id, "aria-label": `Parameter ${index + 1}` });
      keyInput.oninput = () => { target.key = keyInput.value.trim(); edited(); };
      const remove = button("×", () => { ui.paramTargets.splice(index, 1); edited(); refreshEditors(); }, "Remove animation property");
      const endpoints = el("div", { className: "anim-endpoints" }, [
        row("Start", numericInput(target, "from", `${target.key} start`)),
        el("span", { className: "anim-arrow", textContent: "→", "aria-hidden": "true" }),
        row("End", numericInput(target, "to", `${target.key} end`)),
      ]);
      if (compact) {
        card.append(keyInput, endpoints, remove);
      } else {
        const details = el("details", { open: target.expanded !== false, className: "vr-paramGroup" }, [
          el("summary", { className: "vr-paramGroupTitle", textContent: `${index + 1}. ${target.key || "Animation property"}` }),
          el("div", { className: "vr-paramGroupBody" }, [
            row("Parameter", keyInput), endpoints,
            el("div", { className: "tool-flow-actions" }, [
              button("Capture start", () => { target.from = clampNum(getByPath(state, target.key), target.from); edited(); refreshEditors(); }),
              button("Capture end", () => { target.to = clampNum(getByPath(state, target.key), target.to); edited(); refreshEditors(); }),
              button("Apply start", () => applyEndpoint(target, "from")),
              button("Apply end", () => applyEndpoint(target, "to")), remove,
            ]),
          ]),
        ]);
        details.ontoggle = () => { target.expanded = details.open; markDirty(); };
        card.appendChild(details);
      }
      return card;
    };
    ui.paramTargets.forEach((target, index) => {
      targetsList.appendChild(makeCard(target, index, false));
      if (ui.targetType === "params") compactList.appendChild(makeCard(target, index, true));
    });
    if (!ui.paramTargets.length) {
      targetsList.appendChild(el("p", { className: "anim-help", textContent: "Add numeric parameters to animate together. Dot-paths are supported." }));
      if (ui.targetType === "params") compactList.appendChild(button("Add properties in Edit", () => viewTabs.setValue("edit", true)));
    }
    if (ui.targetType === "svg") {
      compactList.appendChild(el("div", { className: "tool-flow-stage anim-flow-card anim-svg-card" }, [
        el("div", { className: "tool-flow-stage-title", textContent: `${ui.selector} · ${ui.svgKind}.${ui.svgName}` }),
        el("div", { className: "anim-endpoints" }, [
          row("Start", numericInput(ui, "from", "SVG start")),
          el("span", { className: "anim-arrow", textContent: "→", "aria-hidden": "true" }),
          row("End", numericInput(ui, "to", "SVG end", 1)),
        ]),
      ]));
    }
  };
  const applyEndpoint = (target, key) => {
    rt.stop({ snap: false });
    setByPath(state, target.key, target[key]);
    onChange?.(target.key, target[key], state);
    ui.progress01 = key === "from" ? 0 : 1;
    markDirty();
    refreshTransport();
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
        !target || typeof target.key !== "string" || !target.key.trim() || !Number.isFinite(target.from) || !Number.isFinite(target.to)
      ))) throw new Error("Each parameter needs a key and numeric from/to values.");
      for (const key of ["durationSec", "fps"]) {
        if (next[key] != null && (!Number.isFinite(next[key]) || next[key] <= 0)) throw new Error(`${key} must be greater than zero.`);
      }
      for (const key of ["from", "to", "progress01"]) {
        if (next[key] != null && !Number.isFinite(next[key])) throw new Error(`${key} must be numeric.`);
      }
      if (next.selector != null) mountEl.querySelector(next.selector);
      rt.stop({ snap: false });
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
      jsonMessage.textContent = `Invalid JSON: ${error.message || error}`;
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
      { value: "edit", label: "Edit", panel: editPanel },
      { value: "flow", label: "Flow", panel: flowPanel },
      { value: "json", label: "JSON", panel: jsonPanel },
    ],
    onChange: (value) => { ui.view = value; markDirty(); refreshEditors(); },
  });
  const play = button("Play", () => {
    try {
      if (ui.targetType === "svg") mountEl.querySelector(ui.selector);
      else if (!cleanTargets(ui).length) { status.textContent = "Add a parameter before playing."; return; }
      xfRuntime?.rebuildNow?.();
      rt.play();
      markDirty();
    } catch (error) { rt.stop({ snap: false }); status.textContent = `Cannot play: ${error.message || error}`; }
  });
  const pause = button("Pause", () => { rt.pause(); markDirty(); });
  const stop = button("Stop", () => { rt.stop({ snap: ui.snapToEndOnStop }); markDirty(); });
  const restart = button("To start", () => { scrub(0); });
  const progress = el("input", { type: "range", min: "0", max: "1", step: "0.001", "aria-label": "Animation progress" });
  const scrub = (value) => {
    try { rt.stop({ snap: false }); rt.scrubTo(value); markDirty(); }
    catch (error) { status.textContent = `Cannot scrub: ${error.message || error}`; }
  };
  progress.oninput = () => scrub(clampNum(progress.value, 0));
  const transport = el("div", { className: "anim-transport" }, [
    el("div", { className: "tool-flow-actions" }, [restart, play, pause, stop]),
    row("Progress", progress), status,
  ]);
  const refreshTransport = () => {
    progress.value = String(ui.progress01 ?? 0);
    play.textContent = rt.paused && ui.progress01 < 1 ? "Resume" : "Play";
    play.disabled = rt.playing;
    pause.disabled = !rt.playing;
    stop.disabled = !rt.playing && !rt.paused;
    status.textContent = `${rt.playing ? "Playing" : rt.paused ? "Paused" : "Stopped"} · ${(clampNum(ui.progress01, 0) * 100).toFixed(1)}%`;
  };
  function refreshEditors() {
    bindings.forEach((sync) => sync());
    targetTabs.setValue(ui.targetType);
    renderTargets();
    if (ui.view === "json" && editor.draft == null) syncJson();
    refreshTransport();
  }
  root.append(viewTabs.root, editPanel, flowPanel, jsonPanel, transport, dl);
  root._onShow = refreshTransport;
  root._destroy = rt.subscribe(refreshTransport);
  refreshEditors();
  return root;
}
