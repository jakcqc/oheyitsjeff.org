// helper/animateHelp.js
// Generic animation tab for oheyitsjeff.org visuals.
// - Animate numeric *state params* (dot-path allowed) for N targets simultaneously, OR a numeric SVG attr/style.
// - Uses requestAnimationFrame with FPS throttling.
// - Persists settings in state.__anim.ui (so Save Settings includes it).

import { el, getByPath, setByPath } from "./visualHelp.js";
import { registerTab } from "./visualHelp.js";

const RUNTIMES = new WeakMap();

function mergeInto(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
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
  if (!state.__anim.ui || typeof state.__anim.ui !== "object") {
    state.__anim.ui = {
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
  }

  // --- migrate legacy single-param fields into paramTargets if needed ---
  const ui = state.__anim.ui;
  if (!Array.isArray(ui.paramTargets)) ui.paramTargets = [];
  if (ui.autoPlay == null) ui.autoPlay = false;

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

    out.push({
      key,
      from: clampNum(t?.from, 0),
      to: clampNum(t?.to, 0),
    });
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
        // still call onChange so xf/propOps can rebuild if needed
        rt.onChange?.("__anim.svg", v, state);
        return;
      }

      // params mode
      const targets = cleanTargets(ui);
      if (!Array.isArray(v)) return;

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const val = v[i];
        setByPath(state, t.key, val);
        rt.onChange?.(t.key, val, state);
      }
    },

    stop({ snap } = {}) {
      if (rt.raf) cancelAnimationFrame(rt.raf);
      rt.raf = 0;
      rt.playing = false;
      rt.lastFrameAt = 0;

      const ui = state.__anim?.ui || {};
      const shouldSnap = (snap != null) ? !!snap : !!ui.snapToEndOnStop;

      if (shouldSnap) {
        if (ui.targetType === "svg") {
          const v = rt.dir >= 0 ? rt.to : rt.from;
          rt.applyValues(v);
          ui.progress01 = 1;
        } else {
          const targets = cleanTargets(ui);
          const endVals = targets.map((t, i) => (rt.dir >= 0 ? rt.tos[i] : rt.froms[i]));
          rt.applyValues(endVals);
          ui.progress01 = 1;
        }
      }

      rt.notify();
    },

    play() {
      const ui = state.__anim?.ui || {};
      const durMs = Math.max(1, clampNum(ui.durationSec, 1) * 1000);
      const fps = Math.max(1, clampNum(ui.fps, 60));
      const frameMs = 1000 / fps;

      rt.stop({ snap: false });

      rt.playing = true;
      rt.startAt = performance.now();
      rt.lastFrameAt = 0;
      rt.dir = 1;
      ui.progress01 = 0;

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

      const e = ease(p, ui.easing);

      if (ui.targetType === "svg") {
        const from = clampNum(ui.from, 0);
        const to = clampNum(ui.to, 0);
        const v = from + (to - from) * e;
        rt.applyValues(v);
      } else {
        const targets = cleanTargets(ui);
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
  const markDirty = () => onStateChange?.();

  // Normalize to "params" by default
  if (ui.targetType !== "svg") ui.targetType = "params";
  cleanTargets(ui);

  const rt = getOrMakeRuntime({ mountEl, state, onChange });

  const root = document.createElement("div");
  root.className = "anim-panel";

  const refresh = () => {
    // status
    const pct = (ui.progress01 * 100).toFixed(1);

    if (ui.targetType === "svg") {
      status.textContent = rt.playing
        ? `playing • progress=${pct}%`
        : `stopped • progress=${pct}%`;
    } else {
      const n = (ui.paramTargets || []).length;
      status.textContent = rt.playing
        ? `playing • ${n} param${n === 1 ? "" : "s"} • progress=${pct}%`
        : `stopped • ${n} param${n === 1 ? "" : "s"} • progress=${pct}%`;
    }

    playBtn.textContent = rt.playing ? "playing…" : "play";
    playBtn.disabled = rt.playing;
    stopBtn.disabled = !rt.playing;

    progress.value = String(ui.progress01 ?? 0);

    // show/hide target sections
    paramsBlock.style.display = ui.targetType === "params" ? "" : "none";
    svgBlock.style.display = ui.targetType === "svg" ? "" : "none";

    // Keep param editor rows in sync (simple rerender)
    renderTargetsList();
  };

  const setUi = (k, v) => {
    ui[k] = v;
    markDirty();
    refresh();
  };

  // --- Target type ---
  const targetType = el("select", { className: "anim-select" });
  ["params", "svg"].forEach(opt => {
    targetType.appendChild(el("option", { value: opt, textContent: opt }));
  });
  targetType.value = ui.targetType;
  targetType.onchange = () => setUi("targetType", targetType.value);

  // --- Param picker (number params) ---
  const keys = numericParamKeys(spec);

  const dl = el("datalist", { id: `anim-paramkeys-${Math.random().toString(16).slice(2)}` });
  keys.forEach(k => dl.appendChild(el("option", { value: k })));

  const addSel = el("select");
  addSel.appendChild(el("option", { value: "", textContent: "choose param…" }));
  keys.forEach(k => addSel.appendChild(el("option", { value: k, textContent: k })));
  addSel.value = "";

  const addBtn = el("button", { type: "button", textContent: "add" });
  addBtn.onclick = () => {
    const k = String(addSel.value || "").trim();
    if (!k) return;

    // avoid dupes
    const exists = (ui.paramTargets || []).some(t => String(t?.key || "").trim() === k);
    if (exists) return;

    // seed from/to defaults (or current)
    const cur = clampNum(getByPath(state, k), 0);
    ui.paramTargets = Array.isArray(ui.paramTargets) ? ui.paramTargets : [];
    ui.paramTargets.push({ key: k, from: ui.autoFromCurrent ? cur : 0, to: ui.autoFromCurrent ? cur : 10 });
    cleanTargets(ui);
    addSel.value = "";
    markDirty();
    refresh();
  };

  const targetsList = el("div", { className: "anim-targets" });

  const renderTargetsList = () => {
    targetsList.innerHTML = "";
    const targets = cleanTargets(ui);

    if (targets.length === 0) {
      targetsList.appendChild(el("div", { className: "anim-help", textContent: "Add one or more numeric params to animate simultaneously." }));
      return;
    }

    for (let idx = 0; idx < targets.length; idx++) {
      const t = targets[idx];

      if (idx > 0) {
        targetsList.appendChild(
          el("div", { style: "border-top:3px solid rgba(113, 112, 112, 1);margin:10px 0;" })
        );
      }

      const keyInput = el("input", {
        type: "text",
        value: t.key,
        placeholder: "state param key (dot-path ok)"
      });
      keyInput.setAttribute("list", dl.id);
      keyInput.oninput = () => {
        targets[idx].key = String(keyInput.value || "").trim();
        ui.paramTargets = targets;
        markDirty();
      };

      const fromInput = el("input", { type: "number", step: "any", value: String(t.from ?? 0) });
      const toInput = el("input", { type: "number", step: "any", value: String(t.to ?? 0) });
      fromInput.oninput = () => {
        targets[idx].from = clampNum(fromInput.value, targets[idx].from ?? 0);
        ui.paramTargets = targets;
        markDirty();
      };
      toInput.oninput = () => {
        targets[idx].to = clampNum(toInput.value, targets[idx].to ?? 0);
        ui.paramTargets = targets;
        markDirty();
      };

      const captureFromBtn = el("button", { type: "button", textContent: "capture → from" });
      captureFromBtn.onclick = () => {
        const k = String(keyInput.value || "").trim();
        if (!k) return;
        const cur = clampNum(getByPath(state, k), t.from ?? 0);
        fromInput.value = String(cur);
        targets[idx].from = cur;
        ui.paramTargets = targets;
        markDirty();
        refresh();
      };

      const captureToBtn = el("button", { type: "button", textContent: "capture → to" });
      captureToBtn.onclick = () => {
        const k = String(keyInput.value || "").trim();
        if (!k) return;
        const cur = clampNum(getByPath(state, k), t.to ?? 0);
        toInput.value = String(cur);
        targets[idx].to = cur;
        ui.paramTargets = targets;
        markDirty();
        refresh();
      };

      const applyFromBtn = el("button", { type: "button", textContent: "apply from" });
      applyFromBtn.onclick = () => {
        const k = String(keyInput.value || "").trim();
        if (!k) return;
        const v = clampNum(fromInput.value, targets[idx].from ?? 0);
        targets[idx].from = v;
        ui.paramTargets = targets;
        setByPath(state, k, v);
        rt.onChange?.(k, v, state);
        ui.progress01 = 0;
        refresh();
      };

      const applyToBtn = el("button", { type: "button", textContent: "apply to" });
      applyToBtn.onclick = () => {
        const k = String(keyInput.value || "").trim();
        if (!k) return;
        const v = clampNum(toInput.value, targets[idx].to ?? 0);
        targets[idx].to = v;
        ui.paramTargets = targets;
        setByPath(state, k, v);
        rt.onChange?.(k, v, state);
        ui.progress01 = 1;
        refresh();
      };

      const removeBtn = el("button", { type: "button", textContent: "remove" });
      removeBtn.onclick = () => {
        targets.splice(idx, 1);
        ui.paramTargets = targets;
        cleanTargets(ui);
        markDirty();
        refresh();
      };

      // Persist edits on blur
      keyInput.onblur = () => {
        targets[idx].key = String(keyInput.value || "").trim();
        ui.paramTargets = targets;
        cleanTargets(ui);
        markDirty();
        refresh();
      };
      fromInput.onblur = () => {
        targets[idx].from = clampNum(fromInput.value, targets[idx].from ?? 0);
        ui.paramTargets = targets;
        markDirty();
        refresh();
      };
      toInput.onblur = () => {
        targets[idx].to = clampNum(toInput.value, targets[idx].to ?? 0);
        ui.paramTargets = targets;
        markDirty();
        refresh();
      };

      const row = el("div", { className: "anim-target-row" }, [
        el("div", { className: "anim-target-col" }, [
          el("div", { className: "anim-label", textContent: "param" }),
          keyInput,
        ]),
        el("div", { className: "anim-target-col" }, [
          el("div", { className: "anim-label", textContent: "start (from)" }),
          fromInput,
        ]),
        el("div", { className: "anim-target-col" }, [
          el("div", { className: "anim-label", textContent: "end (to)" }),
          toInput,
        ]),
        el("div", { className: "anim-target-actions" }, [
          captureFromBtn,
          captureToBtn,
          applyFromBtn,
          applyToBtn,
          removeBtn,
        ])
      ]);

      targetsList.appendChild(row);
    }
  };

  // --- SVG targeting ---
  const selInput = el("input", { type: "text", value: ui.selector || "svg", placeholder: 'CSS selector (e.g. "circle", "g#layer rect")' });
  selInput.oninput = () => { ui.selector = selInput.value; markDirty(); };
  selInput.onblur = () => refresh();

  const svgKind = el("select");
  ["attr", "style"].forEach(opt => svgKind.appendChild(el("option", { value: opt, textContent: opt })));
  svgKind.value = ui.svgKind || "attr";
  svgKind.onchange = () => { ui.svgKind = svgKind.value; markDirty(); refresh(); };

  const svgName = el("input", { type: "text", value: ui.svgName || "opacity", placeholder: "attr/style name (e.g. opacity, r, x, strokeWidth)" });
  svgName.oninput = () => { ui.svgName = svgName.value; markDirty(); };
  svgName.onblur = () => refresh();

  // --- Shared timing controls ---
  const durInput = el("input", { type: "number", step: "0.01", min: "0.01", value: String(ui.durationSec ?? 3) });
  const fpsInput = el("input", { type: "number", step: "1", min: "1", value: String(ui.fps ?? 20) });
  durInput.oninput = () => {
    ui.durationSec = clampNum(durInput.value, ui.durationSec);
    markDirty();
  };
  fpsInput.oninput = () => {
    ui.fps = clampNum(fpsInput.value, ui.fps);
    markDirty();
  };

  const easingSel = el("select");
  ["linear", "easeInOutQuad", "easeInQuad", "easeOutQuad"].forEach(opt => {
    easingSel.appendChild(el("option", { value: opt, textContent: opt }));
  });
  easingSel.value = ui.easing || "linear";
  easingSel.onchange = () => {
    ui.easing = easingSel.value;
    markDirty();
  };

  const loopCb = el("input", { type: "checkbox" });
  loopCb.checked = !!ui.loop;
  loopCb.onchange = () => {
    ui.loop = !!loopCb.checked;
    markDirty();
  };

  const yoyoCb = el("input", { type: "checkbox" });
  yoyoCb.checked = !!ui.yoyo;
  yoyoCb.onchange = () => {
    ui.yoyo = !!yoyoCb.checked;
    markDirty();
  };

  const autoFromCb = el("input", { type: "checkbox" });
  autoFromCb.checked = !!ui.autoFromCurrent;
  autoFromCb.onchange = () => {
    ui.autoFromCurrent = !!autoFromCb.checked;
    markDirty();
  };

  const snapCb = el("input", { type: "checkbox" });
  snapCb.checked = !!ui.snapToEndOnStop;
  snapCb.onchange = () => {
    ui.snapToEndOnStop = !!snapCb.checked;
    markDirty();
  };

  const captureAllFromBtn = el("button", { type: "button", textContent: "capture all current → from" });
  captureAllFromBtn.onclick = () => {
    const targets = cleanTargets(ui);
    for (const t of targets) {
      const cur = clampNum(getByPath(state, t.key), t.from ?? 0);
      t.from = cur;
    }
    ui.paramTargets = targets;
    markDirty();
    refresh();
  };

  const captureAllToBtn = el("button", { type: "button", textContent: "capture all current → to" });
  captureAllToBtn.onclick = () => {
    const targets = cleanTargets(ui);
    for (const t of targets) {
      const cur = clampNum(getByPath(state, t.key), t.to ?? 0);
      t.to = cur;
    }
    ui.paramTargets = targets;
    markDirty();
    refresh();
  };

  const playBtn = el("button", { type: "button", textContent: "play" });
  playBtn.onclick = () => {
    // sync UI → state
    ui.selector = selInput.value;
    ui.svgKind = svgKind.value;
    ui.svgName = svgName.value;

    ui.durationSec = clampNum(durInput.value, ui.durationSec);
    ui.fps = clampNum(fpsInput.value, ui.fps);
    ui.easing = easingSel.value;
    ui.loop = !!loopCb.checked;
    ui.yoyo = !!yoyoCb.checked;
    ui.autoFromCurrent = !!autoFromCb.checked;
    ui.snapToEndOnStop = !!snapCb.checked;
    markDirty();

    // clean targets before play
    cleanTargets(ui);

    // (optional) force xf runtime rebuild loop to keep up with SVG redraws
    xfRuntime?.rebuildNow?.();

    rt.play();
    refresh();
  };

  const stopBtn = el("button", { type: "button", textContent: "stop" });
  stopBtn.onclick = () => { rt.stop({ snap: ui.snapToEndOnStop }); refresh(); };

  const progress = el("input", { type: "range", min: "0", max: "1", step: "0.001", value: String(ui.progress01 ?? 0) });
  progress.oninput = () => {
    // Stop while scrubbing, then set value
    rt.stop({ snap: false });
    const p = clampNum(progress.value, 0);
    rt.scrubTo(p);
    markDirty();
  };

  const status = el("div", { className: "anim-status", textContent: "" });

  const row = (label, node) => el("div", { className: "anim-row" }, [
    el("div", { className: "anim-label", textContent: label }),
    el("div", { className: "anim-input" }, [node]),
  ]);

  const paramsBlock = el("div", { className: "anim-block" }, [
    el("div", { className: "anim-subtitle", textContent: "Params target (N simultaneous)" }),
    row("add param", el("div", {}, [addSel, addBtn, dl])),
    el("div", { className: "anim-btnrow" }, [captureAllFromBtn, captureAllToBtn]),
    targetsList,
    el("div", { className: "anim-help", textContent: "Animates multiple numeric state params at the same time. Dot-paths work." }),
  ]);

  const svgBlock = el("div", { className: "anim-block" }, [
    el("div", { className: "anim-subtitle", textContent: "SVG target" }),
    row("selector", selInput),
    row("kind", svgKind),
    row("name", svgName),
    el("div", { className: "anim-help", textContent: "Animates numeric SVG attr/style. Examples: attr opacity, r, x, y, stroke-width; style opacity." }),
  ]);

  const controls = el("div", { className: "anim-controls" }, [
    row("target", targetType),

    paramsBlock,
    svgBlock,

    el("hr"),

    // --- JSON editor (paste/apply) ---
    (() => {
      const box = el("textarea", {
        rows: 10,
        style: "width:100%;font-family:monospace;",
      });

      const msg = el("div", { className: "anim-help", textContent: "" });

      const syncFromUi = () => {
        box.value = JSON.stringify(ui, null, 2);
        msg.textContent = "Paste a JSON object for __anim.ui, then Apply.";
      };

      const applyJson = () => {
        try {
          const parsed = JSON.parse(box.value);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("JSON must be an object.");
          }

          // Accept any of:
          // 1) The __anim.ui object itself
          // 2) { "__anim": { "ui": { ... } } }
          // 3) A full settings file that contains "__anim": { "ui": { ... } }
          let nextUi = parsed;
          if (parsed.__anim && typeof parsed.__anim === "object" && parsed.__anim.ui && typeof parsed.__anim.ui === "object") {
            nextUi = parsed.__anim.ui;
          }

          if (!nextUi || typeof nextUi !== "object" || Array.isArray(nextUi)) {
            throw new Error("Animation JSON must be an object (either __anim.ui or a wrapper containing it).");
          }

          mergeInto(ui, nextUi);
          ensureAnimateState(state);
          cleanTargets(ui);
          if (ui.targetType !== "svg") ui.targetType = "params";

          // reflect any structural changes in UI controls
          targetType.value = ui.targetType;
          selInput.value = ui.selector || "svg";
          svgKind.value = ui.svgKind || "attr";
          svgName.value = ui.svgName || "opacity";
          durInput.value = String(ui.durationSec ?? 3);
          fpsInput.value = String(ui.fps ?? 20);
          easingSel.value = ui.easing || "linear";
          loopCb.checked = !!ui.loop;
          yoyoCb.checked = !!ui.yoyo;
          autoFromCb.checked = !!ui.autoFromCurrent;
          snapCb.checked = !!ui.snapToEndOnStop;

          onChange?.("__anim.ui", ui, state);
          markDirty();
          box.value = JSON.stringify(ui, null, 2);
          msg.textContent = "Applied JSON.";
          refresh();
        } catch (err) {
          msg.textContent = `Invalid JSON: ${String(err?.message || err)}`;
        }
      };

      const copyJson = async () => {
        try {
          await navigator.clipboard.writeText(box.value);
          msg.textContent = "Copied JSON.";
        } catch {
          msg.textContent = "Copy failed (clipboard not available).";
        }
      };

      const btnRow = el("div", { className: "anim-btnrow" }, [
        el("button", { type: "button", textContent: "Apply JSON", onclick: applyJson }),
        el("button", { type: "button", textContent: "Copy JSON", onclick: copyJson }),
        el("button", { type: "button", textContent: "Reset editor", onclick: syncFromUi }),
      ]);

      syncFromUi();

      return el("div", { className: "anim-block" }, [
        el("div", { style: "margin-bottom:5px",className: "anim-subtitle", textContent: "Animation JSON (__anim.ui)" }),
        box,
        btnRow,
        msg,
      ]);
    })(),

    row("duration (s)", durInput),
    row("fps", fpsInput),
    row("easing", easingSel),

    el("div", { className: "anim-checks" }, [
      el("label", {}, [loopCb, el("span", { textContent: " loop" })]),
      el("label", {}, [yoyoCb, el("span", { textContent: " yoyo" })]),
      el("label", {}, [autoFromCb, el("span", { textContent: " auto-from current" })]),
      el("label", {}, [snapCb, el("span", { textContent: " snap to end on stop" })]),
    ]),

    el("div", { className: "anim-btnrow" }, [playBtn, stopBtn]),
    row("progress", progress),
    status,
  ]);

  root.appendChild(controls);
  // Keep UI synced while playing even if panel stays open
  const unsub = rt.subscribe(refresh);

  // If this panel gets garbage-collected, it’s fine; but if you want:
  // root._destroy = unsub;
  // (tabs don’t call destroy currently)
  refresh();

  return root;
}
