/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

/* --------------------------- Transforms tab --------------------------- */
import { el, getByPath, setByPath } from "./visualHelp.js";
import { registerTab } from "./visualHelp.js";
import { createSubTabs } from "./subTabs.js";
import { normalizeKaleidoscope, buildKaleidoscopeGeometry } from "./kaleidoscopeMath.js";
import { MATH_TRANSFORM_TYPES, normalizeMathTransform } from "./mathTransformMath.js";
import { applyMathTransforms } from "./mathTransformGeometry.js";
import { ensurePropOpsState, applyPropOpsToSubtree, ensureScriptOpsState, applyScriptOpsToSubtree } from "./svgEditor.js";
let isFirst = false;
let nextTransformRuntimeId = 0;
const ARRANGE_TOOLS = [
  { value: "split", label: "Tile layout" },
  { value: "rotate", label: "Rotate" },
  { value: "zoomIn", label: "Zoom in" },
  { value: "zoomOut", label: "Zoom out" },
  { value: "translate", label: "Translate" },
  { value: "preset", label: "Presets" },
];
const SYMMETRY_TOOLS = [
  { value: "kaleidoscope", label: "Kaleidoscope" },
  { value: "flipX", label: "Flip X" },
  { value: "flipY", label: "Flip Y" },
];
/* ------------------------ helpers ------------------------ */
function resolveCenterAxis(val, size, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;

  // If user enters a fractional value between 0 and 1, treat as percentage of svg size
  if (n >= 0 && n <= 1) return n * size;

  // Otherwise treat as absolute SVG coordinate
  return n;
}

function resolveCenterAxisWithOrigin(val, origin, size, fallback) {
  if (val == null || val === "") return fallback;
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  if (n >= 0 && n <= 1) return origin + n * size;
  return n;
}

function resolveUiTargets({ applyToAll, tileTargetsText, tileCount }) {
  const raw = String(tileTargetsText ?? "").trim().toLowerCase();
  if (applyToAll || raw === "all") return null; // null => all tiles

  const set = new Set();

  // tokens: split by commas or whitespace
  const tokens = raw.split(/[,\s]+/).map(t => t.trim()).filter(Boolean);

  for (const tok of tokens) {
    if (tok === "all") return null;

    // range like "2-5"
    const m = tok.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) {
        if (i >= 0 && i < tileCount) set.add(i);
      }
      continue;
    }

    // single int
    const n = parseInt(tok, 10);
    if (Number.isFinite(n) && n >= 0 && n < tileCount) set.add(n);
  }

  // If nothing parsed, default to tile 0
  if (set.size === 0) set.add(0);

  return Array.from(set).sort((a, b) => a - b);
}

function fmtNum(v) {
  return Number.isFinite(v) ? String(v) : "NaN";
}

const DEFAULT_MATRIX = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
/**
 * Matrix docs (UI + runtime):
 * - The six fields map directly to the SVG `matrix(a b c d e f)` transform.
 * - We apply it in the stack order, so it composes with rotate/zoom/translate like other ops.
 * - Typical shears: set `c` for x-shear (leans right when positive) or `b` for y-shear.
 * - Typical offsets: use `e` (x translate) and `f` (y translate) if you want the matrix itself to move content.
 * - Values are clamped only for finiteness; no normalization is done, so you can combine scale + shear freely.
 */

function toFiniteNumber(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function clampNumber(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function ensureMatrix6(obj) {
  const m = obj && typeof obj === "object" ? obj : {};
  return {
    a: toFiniteNumber(m.a, DEFAULT_MATRIX.a),
    b: toFiniteNumber(m.b, DEFAULT_MATRIX.b),
    c: toFiniteNumber(m.c, DEFAULT_MATRIX.c),
    d: toFiniteNumber(m.d, DEFAULT_MATRIX.d),
    e: toFiniteNumber(m.e, DEFAULT_MATRIX.e),
    f: toFiniteNumber(m.f, DEFAULT_MATRIX.f),
  };
}

function formatXfStack(stack) {
  if (!stack?.length) return "(no transforms applied)";
  return stack
    .map((op, i) => {
      if (op.kind === "split") return `${i}: split(${op.count})`;
      const tgt = op.targets == null ? "all" : `[${op.targets.join(",")}]`;
      if (op.kind === "warp") {
        const cfg = normalizeMathTransform(op);
        const values = {
          vortex: `strength=${cfg.strength}, radius=${cfg.radius}`,
          mobius: `a=${cfg.mobiusRe}+${cfg.mobiusIm}i`,
          power: `N=${cfg.power}`,
          root: `N=${cfg.power}, branch=${cfg.allBranches ? "all" : cfg.branch}`,
          wrap: `${cfg.topology}, offset=(${cfg.wrapX},${cfg.wrapY}), repeats=${cfg.wrapScale}`,
          annulus: `radii=(${cfg.innerRadius},${cfg.outerRadius}), turns=${cfg.turns}`,
          joukowski: `lambda=${cfg.lambda}`,
        };
        return `${i}: ${cfg.type}(targets=${tgt}, ${values[cfg.type]})`;
      }
      if (op.kind === "kaleidoscope") {
        const cfg = normalizeKaleidoscope(op);
        return `${i}: kaleidoscope(targets=${tgt}, N=${cfg.count}, ${cfg.mirror ? 2 * cfg.count + " mirrored" : cfg.count + " rotated"} wedges, angle=${cfg.rotationDeg})`;
      }
      if (op.kind === "rotate") return `${i}: rotate(targets=${tgt}, deg=${op.deg})`;
      if (op.kind === "flipX") return `${i}: flipX(targets=${tgt})`;
      if (op.kind === "flipY") return `${i}: flipY(targets=${tgt})`;
      if (op.kind === "zoom") {
        const c = op.center;
        const centerAxis = (value) => value == null || value === "" || !Number.isFinite(+value) ? "auto" : fmtNum(+value);
        const cStr = c ? `, center=(${centerAxis(c.x)},${centerAxis(c.y)})` : "";
        return `${i}: zoom(targets=${tgt}, factor=${op.factor}${cStr})`;
      }
      if (op.kind === "translate") {
        const v = op.v || { x: op.x, y: op.y };
        return `${i}: translate(targets=${tgt}, v=(${fmtNum(+v?.x)},${fmtNum(+v?.y)}))`;
      }
      if (op.kind === "matrix") {
        const m = Array.isArray(op.m) ? op.m : [op.a, op.b, op.c, op.d, op.e, op.f];
        return `${i}: matrix(targets=${tgt}, m=${(m || []).map(fmtNum).join(",")})`;
      }
      if (op.kind === "planes3d") {
        const offset = op.offset || { x: 0, y: 0 };
        return `${i}: planes3d(targets=${tgt}, count=${op.count}, baseScale=${fmtNum(+op.baseScale)}, step=${fmtNum(+op.scaleStep)}, offset=(${fmtNum(+offset.x)},${fmtNum(+offset.y)}), opacity=${fmtNum(+op.opacity)})`;
      }
      return `${i}: ${op.kind}`;
    })
    .join("\n");
}

function ensureVector2(obj, defaults) {
  if (!obj || typeof obj !== "object") return { ...defaults };
  return {
    x: "x" in obj ? obj.x : defaults.x,
    y: "y" in obj ? obj.y : defaults.y,
  };
}

export function ensureTransformState(state) {
  if (!state.__xf || typeof state.__xf !== "object") state.__xf = {};
  if (!state.__xf.ui || typeof state.__xf.ui !== "object") state.__xf.ui = {};

  const ui = state.__xf.ui;
  if (ui.activeTab == null) ui.activeTab = "arrange";
  if (!ARRANGE_TOOLS.some((tool) => tool.value === ui.arrangeAction)) ui.arrangeAction = "split";
  if (!SYMMETRY_TOOLS.some((tool) => tool.value === ui.symmetryAction)) ui.symmetryAction = "kaleidoscope";
  ui.kaleidoscope = normalizeKaleidoscope(ui.kaleidoscope);
  ui.math = normalizeMathTransform(ui.math);

  if (ui.preset == null) ui.preset = "";
  if (ui.splitMode == null) ui.splitMode = "screen";
  if (ui.splitCount == null) ui.splitCount = 1;
  if (ui.applyToAll == null) ui.applyToAll = false;
  if (ui.activeTile == null) ui.activeTile = "0";
  if (ui.tileTargets == null) ui.tileTargets = "0";
  if (ui.rotateDeg == null) ui.rotateDeg = 90;
  if (ui.zoomFactor == null) ui.zoomFactor = 1.25;
  ui.matrix = ensureMatrix6(ui.matrix);

  // NEW: zoom center + translate vector (UI)
  ui.zoomCenter = ensureVector2(ui.zoomCenter, { x: NaN, y: NaN }); // NaN => use svg center
  ui.translateVec = ensureVector2(ui.translateVec, { x: 0, y: 0 });

  // NEW: stacked "3D" planes (UI)
  if (ui.planeCount == null) ui.planeCount = 3;
  if (ui.planeBaseScale == null) ui.planeBaseScale = 1;
  if (ui.planeScaleStep == null) ui.planeScaleStep = -0.12;
  if (ui.planeOpacity == null) ui.planeOpacity = 0.7;
  if (ui.planeOpacityFalloff == null) ui.planeOpacityFalloff = 0.12;
  ui.planeOffset = ensureVector2(ui.planeOffset, { x: 0, y: 0 });
  ui.planeCenter = ensureVector2(ui.planeCenter, { x: NaN, y: NaN });
  if (!ui.groupOpen || typeof ui.groupOpen !== "object") ui.groupOpen = {};

  if (!Array.isArray(state.__xf.stack)) state.__xf.stack = [];
}

export function buildTransformPresetStack(presetName) {
  const name = String(presetName || "").trim();
  if (!name) return null;

  // Notes:
  // - This replaces the current stack when applied.
  // - Zoom ops intentionally omitted (per request).
  if (name === "split4") {
    return [{ kind: "split", count: 4 }];
  }

  if (name === "kaleidoscope4") {
    return [
      { kind: "split", count: 4 },
      // Tile 0: mirror vertically
      { kind: "flipY", targets: [0] },

      // Tile 1: mirror both
      { kind: "flipX", targets: [1] },
      { kind: "flipY", targets: [1] },

      // Tile 2: keep as-is
      { kind: "flipX", targets: [3] },

    ];
  }

  return null;
}

export function buildTransformPanel({ mountEl, state, xfRuntime, onStateChange }) {
  ensureTransformState(state);
  const root = el("div", { className: "xf-panel" });
  const markDirty = () => onStateChange?.();
  const bindings = [];
  const kaleidoscopeBindings = [];
  const uiPath = (key) => "__xf.ui." + key;
  const read = (key) => getByPath(state, uiPath(key));
  let refreshOverview = () => {};
  let historySignature = "";
  let kaleidoscopeEdit = null;

  // Keep the editors mounted: changes must not remove focused inputs or tabs.
  const field = (key, label, {
    type = "number", step = "any", min, max, fallback = 0,
    blankIsAuto = false, integer = false, options, description, onEdit,
  } = {}) => {
    const wrap = el("label", { className: "xf-field" });
    wrap.appendChild(el("span", { className: "xf-label", textContent: label }));
    const input = options ? el("select") : el("input", { type });
    const numeric = !options && (type === "number" || type === "range");
    const rangeValue = type === "range" ? el("output", { className: "xf-rangeValue" }) : null;
    if (rangeValue) rangeValue.setAttribute("data-xf-range-value", key);
    input.setAttribute("aria-label", label);
    input.setAttribute("data-xf-key", key);
    if (options) {
      for (const option of options) {
        input.appendChild(el("option", { value: option.value, textContent: option.label }));
      }
    } else if (numeric) {
      input.step = String(step);
      if (min != null) input.min = String(min);
      if (max != null) input.max = String(max);
      if (blankIsAuto) input.placeholder = "Auto";
    }
    const syncRangeValue = () => {
      if (!rangeValue) return;
      rangeValue.textContent = input.value + "\u00b0";
      input.setAttribute("aria-valuetext", input.value + " degrees");
    };
    const sync = () => {
      const value = read(key);
      if (type === "checkbox") input.checked = !!value;
      else if (numeric) {
        input.value = value == null || !Number.isFinite(Number(value)) ? "" : String(value);
      } else input.value = String(value ?? "");
      syncRangeValue();
    };
    const edit = (event) => {
      const final = event.type === "change";
      let value = options ? input.value : type === "checkbox" ? input.checked : input.value;
      if (numeric) {
        // Leave incomplete live number edits alone until they form a valid value.
        if (onEdit && !final && (input.validity.badInput ||
          (input.value.trim() === "" && !blankIsAuto))) return;
        value = input.value.trim() === "" && blankIsAuto ? null : Number(input.value);
        if (value !== null) {
          if (onEdit && !final && (!Number.isFinite(value) ||
            (min != null && value < min) || (max != null && value > max))) return;
          if (!Number.isFinite(value) || input.value.trim() === "") value = fallback;
          if (integer) value = Math.trunc(value);
          if (min != null) value = Math.max(min, value);
          if (max != null) value = Math.min(max, value);
        }
      }
      setByPath(state, uiPath(key), value);
      if (key === "math.power" || key === "math.branch") {
        state.__xf.ui.math.branch = normalizeMathTransform(read("math")).branch;
      }
      if (!onEdit || final) sync();
      else syncRangeValue();
      if (onEdit) onEdit({ key, final });
      else kaleidoscopeEdit = null;
      // Render live, but persist a single completed edit rather than every drag tick.
      if (!onEdit || final) markDirty();
      refreshOverview();
      if (key === "splitMode") xfRuntime?.rebuildNow?.();
    };
    input.addEventListener("change", edit);
    if (onEdit) {
      input.addEventListener("input", edit);
      input.addEventListener("blur", () => {
        if (kaleidoscopeEdit) markDirty();
        kaleidoscopeEdit = null;
      });
    }
    if (type === "checkbox") wrap.classList.add("xf-check");
    wrap.appendChild(input);
    if (rangeValue) wrap.appendChild(rangeValue);
    if (description) wrap.appendChild(el("span", { className: "xf-help", textContent: description }));
    bindings.push(sync);
    if (key.startsWith("kaleidoscope.")) kaleidoscopeBindings.push(sync);
    sync();
    return wrap;
  };
  const grid = (...children) => {
    const node = el("div", { className: "xf-fields" });
    node.append(...children);
    return node;
  };
  const vector = (key, label, blankIsAuto = false, onEdit) => grid(
    field(key + ".x", label + " X", { blankIsAuto, onEdit }),
    field(key + ".y", label + " Y", { blankIsAuto, onEdit })
  );
  const section = (panel, title, description) => {
    const node = el("section", { className: "xf-section" });
    node.appendChild(el("h3", { className: "xf-heading", textContent: title }));
    if (description) node.appendChild(el("p", { className: "xf-help", textContent: description }));
    panel.appendChild(node);
    return node;
  };
  const button = (label, onClick, primary = false) => {
    const node = el("button", {
      type: "button", className: primary ? "xf-action xf-primary" : "xf-action", textContent: label,
    });
    node.addEventListener("click", onClick);
    return node;
  };
  const actions = (container, ...buttons) => {
    const node = el("div", { className: "xf-actions" });
    node.append(...buttons);
    container.appendChild(node);
  };
  const tileCountForUI = () => Math.max(
    1, clampInt(read("splitCount"), 1, 64), getEffectiveSplitCount(state.__xf.stack)
  );
  const targets = () => resolveUiTargets({
    applyToAll: !!read("applyToAll"),
    tileTargetsText: String(read("tileTargets") ?? ""),
    tileCount: tileCountForUI(),
  });
  const commit = (op) => {
    kaleidoscopeEdit = null;
    state.__xf.stack.push(op);
    xfRuntime?.rebuildNow?.();
    markDirty();
    refreshOverview();
  };
  const copyVector = (key, auto = false) => {
    const value = ensureVector2(read(key), { x: auto ? null : 0, y: auto ? null : 0 });
    const axis = (v) => auto && (v == null || v === "" || !Number.isFinite(Number(v)))
      ? null : toFiniteNumber(v, 0);
    return { x: axis(value.x), y: axis(value.y) };
  };

  const options = [
    { value: "arrange", label: "Arrange" },
    { value: "symmetry", label: "Symmetry" },
    { value: "math", label: "Math" },
    { value: "matrix", label: "Matrix" },
    { value: "layers", label: "Layers" },
    { value: "history", label: "History" },
  ].map((option) => ({ ...option, panel: el("div", { className: "xf-tabPanel" }) }));
  const panels = Object.fromEntries(options.map((option) => [option.value, option.panel]));
  const tabs = createSubTabs({
    label: "Transform tools",
    options,
    value: read("activeTab"),
    onChange: (value) => {
      kaleidoscopeEdit = null;
      state.__xf.ui.activeTab = value;
      markDirty();
      refreshOverview();
    },
  });
  state.__xf.ui.activeTab = tabs.value;
  root.appendChild(tabs.root);

  const targetBar = el("div", { className: "xf-targets" });
  targetBar.appendChild(field("tileTargets", "Tile targets", {
    type: "text", description: "Use all, a tile number, a list (0,2), or a range (1-4).",
  }));
  targetBar.appendChild(field("applyToAll", "All tiles", { type: "checkbox" }));
  const targetHint = el("p", { className: "xf-help" });
  targetBar.appendChild(targetHint);
  root.appendChild(targetBar);
  for (const option of options) root.appendChild(option.panel);

  panels.arrange.appendChild(field("arrangeAction", "Arrange tool", { options: ARRANGE_TOOLS }));
  const presets = section(panels.arrange, "Presets", "Applying a preset replaces the current transform history.");
  presets.appendChild(field("preset", "Preset", {
    options: [
      { value: "", label: "Choose a preset" },
      { value: "split4", label: "Four tiles" },
      { value: "kaleidoscope4", label: "Four-tile mirror grid" },
    ],
  }));
  const applyPreset = () => {
    const next = buildTransformPresetStack(read("preset"));
    if (!next) return;
    kaleidoscopeEdit = null;
    state.__xf.stack = next;
    xfRuntime?.rebuildNow?.();
    markDirty();
    refreshOverview();
  };

  const split = section(panels.arrange, "Tile layout", "Create a grid of copies, then target individual tiles.");
  split.appendChild(grid(
    field("splitCount", "Split copies", { min: 1, max: 64, step: 1, integer: true, fallback: 1 }),
    field("splitMode", "Split mode", {
      options: [
        { value: "screen", label: "Preserve proportions" },
        { value: "fit", label: "Fill each tile" },
      ],
    })
  ));
  const applySplit = () => commit({
    kind: "split", count: clampInt(read("splitCount"), 1, 64),
  });

  const rotate = section(panels.arrange, "Rotate");
  rotate.appendChild(field("rotateDeg", "Rotation (degrees)", { step: 1, fallback: 90 }));
  const applyRotate = () => commit({
    kind: "rotate", targets: targets(), deg: toFiniteNumber(read("rotateDeg"), 90),
  });

  const zoom = section(panels.arrange, "Zoom", "Blank center uses the SVG center. Values from 0 to 1 are fractions of its size.");
  zoom.appendChild(field("zoomFactor", "Zoom factor", { min: 0.1, max: 20, step: 0.05, fallback: 1.25 }));
  zoom.appendChild(vector("zoomCenter", "Zoom center", true));
  const applyZoom = (out) => {
    const value = toFiniteNumber(read("zoomFactor"), 1.25);
    const factor = value > 0 ? value : 1.25;
    commit({
      kind: "zoom", targets: targets(), factor: out ? 1 / factor : factor,
      center: copyVector("zoomCenter", true),
    });
  };

  const translate = section(panels.arrange, "Translate", "Move the selected tiles in SVG coordinates.");
  translate.appendChild(vector("translateVec", "Translate"));
  const applyTranslate = () => commit({
    kind: "translate", targets: targets(), v: copyVector("translateVec"),
  });

  panels.symmetry.appendChild(field("symmetryAction", "Symmetry tool", { options: SYMMETRY_TOOLS }));
  const updateKaleidoscope = ({ key, final }) => {
    const config = normalizeKaleidoscope(read("kaleidoscope"));
    const op = { kind: "kaleidoscope", targets: targets(), ...config };
    const stack = state.__xf.stack;
    const previous = stack.at(-1);
    if (JSON.stringify(previous) !== JSON.stringify(op)) {
      // One drag or typed edit is one undo step; completed history stays intact.
      if (kaleidoscopeEdit?.key === key && kaleidoscopeEdit.stack === stack &&
        kaleidoscopeEdit.op === previous &&
        JSON.stringify(previous.targets) === JSON.stringify(op.targets)) {
        stack[stack.length - 1] = op;
      } else stack.push(op);
      kaleidoscopeEdit = { key, stack, op };
      xfRuntime?.rebuildNow?.();
    }
    if (final) kaleidoscopeEdit = null;
  };
  const kaleidoscope = section(panels.symmetry, "Kaleidoscope", "Changes apply automatically. Repeat one sector around a center; undo restores the previous setting. Arrange tools transform the source inside the wedges.");
  kaleidoscope.appendChild(field("kaleidoscope.count", "Kaleidoscope repeats (N)", {
    min: 2, max: 64, step: 1, integer: true, fallback: 6, onEdit: updateKaleidoscope,
  }));
  kaleidoscope.appendChild(field("kaleidoscope.rotationDeg", "Sector angle (degrees)", {
    type: "range", min: 0, max: 360, step: 1, onEdit: updateKaleidoscope,
  }));
  kaleidoscope.appendChild(field("kaleidoscope.mirror", "Mirror alternating wedges", {
    type: "checkbox", onEdit: updateKaleidoscope,
  }));
  kaleidoscope.appendChild(vector("kaleidoscope.center", "Kaleidoscope center", true, updateKaleidoscope));
  kaleidoscope.appendChild(el("p", {
    className: "xf-help", textContent: "Blank center uses the SVG center. Values from 0 to 1 are fractions of its size.",
  }));
  const symmetryMath = el("p", { className: "xf-formula" });
  kaleidoscope.appendChild(symmetryMath);
  const mirrors = section(panels.symmetry, "Flip", "Reflect the selected tiles about their center.");

  const mathDescriptions = {
    vortex: {
      label: "Hamiltonian vortex",
      description: "Rotate each point by a radius-dependent angle. The continuous map preserves area and curls trajectories around the center.",
      formula: "r′ = r · θ′ = θ − strength × exp(−r² / radius²)",
    },
    mobius: {
      label: "Möbius lens",
      description: "Bend the complex plane with a conformal lens. Local angles are preserved away from the pole; paths break at singularities.",
      formula: "w = (z − a) / (1 − conjugate(a) × z)",
    },
    power: {
      label: "Complex power",
      description: "Multiply each point’s angle by N and raise its radius to N, folding the drawing around the center.",
      formula: "w = zᴺ · |w| = |z|ᴺ · arg(w) = N × arg(z)",
    },
    root: {
      label: "Cyclic root cover",
      description: "Unfold the plane into N root branches. Select one branch or display every sheet; paths break at the branch cut.",
      formula: "wₖ = |z|¹⁄ᴺ exp(i × (arg(z) + 2πk) / N)",
    },
    wrap: {
      label: "Topological wrap",
      description: "Display a rectangle with identified edges. Torus wraps preserve orientation; twisted charts reflect coordinates at the seam. This changes the displayed chart, not the simulation’s topology.",
      formula: "Torus: opposite edges repeat · Möbius: one twisted seam · Klein: one twisted and one periodic seam",
    },
    annulus: {
      label: "Logarithmic annulus",
      description: "Map the viewport into a ring with a central hole. Horizontal position controls logarithmic radius; vertical position winds around the ring.",
      formula: "r = inner × (outer / inner)ᵘ · θ = 2π × turns × v",
    },
    joukowski: {
      label: "Joukowski map",
      description: "Combine the complex plane with its reciprocal to create lenses and lobes. Paths break at the pole at the center.",
      formula: "w = z + λ / z",
    },
  };
  const math = section(panels.math, "Mathematical transforms", "Warp the displayed SVG geometry while the original visual keeps running. Math transforms stack in history order, before Arrange and Symmetry. Undo removes the last operation.");
  math.appendChild(field("math.type", "Math transform", {
    options: MATH_TRANSFORM_TYPES.map((type) => ({ value: type, label: mathDescriptions[type].label })),
  }));
  const mathDescription = el("p", { className: "xf-help" });
  const mathFormula = el("p", { className: "xf-formula" });
  math.append(mathDescription, mathFormula);

  const mathModeGroups = [];
  const mathGroup = (types, ...children) => {
    const node = el("div", { className: "xf-tabPanel" });
    node.setAttribute("data-xf-math-modes", types.join(" "));
    node.append(...children);
    mathModeGroups.push({ node, types });
    math.appendChild(node);
    return node;
  };
  const mathNumber = (key, label, min, max, step, fallback, integer = false) =>
    field("math." + key, label, { min, max, step, fallback, integer });
  mathGroup(["vortex"], grid(
    mathNumber("strength", "Vortex strength (radians)", -20, 20, 0.1, 1),
    mathNumber("radius", "Vortex radius", 0.05, 4, 0.05, 0.8)
  ));
  mathGroup(["mobius"], grid(
    mathNumber("mobiusRe", "Lens a · real", -0.9, 0.9, 0.05, 0.35),
    mathNumber("mobiusIm", "Lens a · imaginary", -0.9, 0.9, 0.05, 0)
  ), el("p", { className: "xf-help", textContent: "The lens coefficient’s magnitude is limited to 0.9. Zero gives the identity map." }));
  mathGroup(["power", "root"], mathNumber("power", "Power / root degree (N)", 2, 12, 1, 2, true));
  const branchField = mathNumber("branch", "Root branch (k)", 0, 11, 1, 0, true);
  const branchInput = branchField.querySelector("input");
  mathGroup(["root"], branchField,
    field("math.allBranches", "Show all N root branches", { type: "checkbox" })
  );
  mathGroup(["wrap"], field("math.topology", "Edge identification", {
    options: [
      { value: "torus", label: "Torus · periodic X and Y" },
      { value: "mobius", label: "Möbius strip · twisted X" },
      { value: "klein", label: "Klein bottle · twisted X, periodic Y" },
    ],
  }), grid(
    mathNumber("wrapX", "Wrap offset X (viewports)", -10, 10, 0.05, 0.25),
    mathNumber("wrapY", "Wrap offset Y (viewports)", -10, 10, 0.05, 0)
  ), mathNumber("wrapScale", "Wrap scale", 0.25, 4, 0.05, 1),
  el("p", { className: "xf-help", textContent: "Paths split at identified edges so separate chart boundaries are not joined by diagonal lines." }));
  mathGroup(["annulus"], grid(
    mathNumber("innerRadius", "Inner radius (hole)", 0.02, 2, 0.01, 0.2),
    mathNumber("outerRadius", "Outer radius", 0.03, 4, 0.01, 0.95)
  ), mathNumber("turns", "Turns around the ring", 1, 8, 1, 1, true));
  mathGroup(["joukowski"], mathNumber("lambda", "Reciprocal weight (λ)", -2, 2, 0.05, 0.3));
  mathGroup(MATH_TRANSFORM_TYPES.filter((type) => type !== "wrap"),
    vector("math.center", "Map center", true),
    mathNumber("scale", "Map scale", 0.1, 4, 0.05, 1),
    el("p", {
      className: "xf-help",
      textContent: "Blank center uses the SVG center; 0–1 are fractions of its size. One map unit is half the shorter SVG dimension, multiplied by map scale.",
    })
  );
  const applyMath = () => {
    const config = normalizeMathTransform(read("math"));
    state.__xf.ui.math = config;
    bindings.forEach((sync) => sync());
    commit({ kind: "warp", targets: targets(), ...config });
  };
  const mathStatus = el("p", { className: "xf-help", role: "status" });
  mathStatus.setAttribute("aria-live", "polite");
  math.appendChild(mathStatus);
  const refreshMath = () => {
    const config = normalizeMathTransform(read("math"));
    const info = mathDescriptions[config.type];
    mathDescription.textContent = info.description;
    mathFormula.textContent = info.formula;
    for (const { node, types } of mathModeGroups) node.hidden = !types.includes(config.type);
    branchInput.max = String(config.power - 1);
    branchInput.value = String(config.branch);
    branchInput.disabled = config.allBranches;
    const report = xfRuntime?.getMathStatus?.();
    const messages = [];
    if (report?.transformed) messages.push(report.transformed + " SVG shapes mapped.");
    if (report?.skipped && !report.limited) messages.push(report.skipped + " shapes kept at their previous geometry.");
    if (report?.limited) messages.push("The last complete result is shown. Lower the visual detail or use fewer stacked transforms.");
    if (Array.isArray(report?.warnings)) messages.push(...report.warnings);
    mathStatus.textContent = messages.join(" ");
    mathStatus.hidden = messages.length === 0;
  };

  const matrix = section(panels.matrix, "Affine matrix", "Combine scale, shear, reflection, and translation.");
  matrix.appendChild(el("p", {
    className: "xf-formula", textContent: "x\u2032 = ax + cy + e   \u00b7   y\u2032 = bx + dy + f",
  }));
  matrix.appendChild(grid(...["a", "b", "c", "d", "e", "f"].map((key) => field(
    "matrix." + key, "Matrix " + key, { step: 0.01, fallback: DEFAULT_MATRIX[key] }
  ))));
  matrix.appendChild(el("p", {
    className: "xf-help", textContent: "a and d scale; b and c shear; e and f translate. Identity is 1, 0, 0, 1, 0, 0.",
  }));
  const applyMatrix = () => {
    const m = ensureMatrix6(read("matrix"));
    commit({ kind: "matrix", targets: targets(), m: [m.a, m.b, m.c, m.d, m.e, m.f] });
  };

  const planes = section(panels.layers, "Stacked planes", "Add depth with scaled, offset copies. A count of 0 disables planes on the selected tiles.");
  planes.appendChild(grid(
    field("planeCount", "Plane count", { min: 0, max: 32, step: 1, integer: true, fallback: 3 }),
    field("planeBaseScale", "Base scale", { min: 0.01, max: 10, step: 0.01, fallback: 1 }),
    field("planeScaleStep", "Scale per depth", { min: -5, max: 5, step: 0.01, fallback: -0.12 }),
    field("planeOpacity", "Opacity", { min: 0, max: 1, step: 0.05, fallback: 0.7 }),
    field("planeOpacityFalloff", "Opacity falloff", { min: 0, max: 1, step: 0.02, fallback: 0.12 })
  ));
  planes.appendChild(vector("planeOffset", "Offset per depth"));
  planes.appendChild(vector("planeCenter", "Plane center", true));
  planes.appendChild(el("p", {
    className: "xf-help", textContent: "Blank center uses the SVG center. A negative scale step shrinks each deeper layer.",
  }));
  const applyPlanes = () => commit({
    kind: "planes3d", targets: targets(),
    count: clampInt(read("planeCount"), 0, 32),
    baseScale: toFiniteNumber(read("planeBaseScale"), 1),
    scaleStep: toFiniteNumber(read("planeScaleStep"), -0.12),
    offset: copyVector("planeOffset"),
    center: copyVector("planeCenter", true),
    opacity: clampNumber(read("planeOpacity"), 0, 1),
    opacityFalloff: clampNumber(read("planeOpacityFalloff"), 0, 1),
  });

  const history = section(panels.history, "Transform history", "Operations are stored in order. Undo removes the most recent operation.");
  const emptyHistory = el("p", {
    className: "xf-help", textContent: "No transforms applied yet. Choose a tool to get started.",
  });
  const stackBox = el("ol", { className: "xf-stack", "aria-label": "Applied transforms" });
  history.append(emptyHistory, stackBox);

  const footer = el("div", { className: "xf-footer" });
  const status = el("p", { className: "xf-status" });
  status.setAttribute("role", "status");
  const applyHint = el("p", { className: "xf-help xf-applyHint" });
  applyHint.setAttribute("aria-live", "polite");
  const arrangeActions = {
    preset: { panel: presets, run: applyPreset },
    split: { panel: split, run: applySplit },
    rotate: { panel: rotate, run: applyRotate },
    zoomIn: { panel: zoom, run: () => applyZoom(false) },
    zoomOut: { panel: zoom, run: () => applyZoom(true) },
    translate: { panel: translate, run: applyTranslate },
  };
  const symmetryActions = {
    kaleidoscope: { panel: kaleidoscope, automatic: true },
    flipX: { panel: mirrors, run: () => commit({ kind: "flipX", targets: targets() }) },
    flipY: { panel: mirrors, run: () => commit({ kind: "flipY", targets: targets() }) },
  };
  const activeAction = () => {
    if (tabs.value === "arrange") {
      const tool = ARRANGE_TOOLS.find((item) => item.value === read("arrangeAction"));
      if (!tool) return null;
      return {
        ...arrangeActions[tool.value], label: tool.label,
        disabled: tool.value === "preset" && !buildTransformPresetStack(read("preset")),
      };
    }
    if (tabs.value === "symmetry") {
      const tool = SYMMETRY_TOOLS.find((item) => item.value === read("symmetryAction"));
      return tool ? { ...symmetryActions[tool.value], label: tool.label } : null;
    }
    if (tabs.value === "math") return {
      label: mathDescriptions[normalizeMathTransform(read("math")).type].label, run: applyMath,
    };
    if (tabs.value === "matrix") return { label: "Affine matrix", run: applyMatrix };
    if (tabs.value === "layers") return { label: "Stacked planes", run: applyPlanes };
    return null;
  };
  const apply = button("apply", () => {
    // Resolve at click time so tab/tool changes cannot leave a stale action.
    const action = activeAction();
    if (action && !action.disabled && !action.automatic) action.run();
  }, true);
  apply.setAttribute("data-xf-action", "apply");
  const restoreKaleidoscopeControls = () => {
    const stack = state.__xf.stack;
    const selectedTiles = targets() ?? Array.from({ length: getEffectiveSplitCount(stack) }, (_, i) => i);
    let restored;
    for (const tile of selectedTiles) {
      const op = stack.findLast((item) => item?.kind === "kaleidoscope" && opAppliesToTile(item, tile));
      // Mixed settings across tiles cannot be represented by one set of controls.
      if (!op) return;
      const config = normalizeKaleidoscope(op);
      if (restored && JSON.stringify(restored) !== JSON.stringify(config)) return;
      restored = config;
    }
    if (restored) {
      state.__xf.ui.kaleidoscope = restored;
      kaleidoscopeBindings.forEach((sync) => sync());
    }
  };
  const undo = button("undo", () => {
    kaleidoscopeEdit = null;
    if (!state.__xf.stack.length) return;
    const removed = state.__xf.stack.pop();
    if (removed?.kind === "kaleidoscope") restoreKaleidoscopeControls();
    xfRuntime?.rebuildNow?.();
    markDirty();
    refreshOverview();
  });
  const reset = button("reset", () => {
    kaleidoscopeEdit = null;
    if (!state.__xf.stack.length) return;
    state.__xf.stack.length = 0;
    xfRuntime?.resetToInitial?.();
    markDirty();
    refreshOverview();
  });
  footer.append(status, applyHint);
  actions(footer, apply, undo, reset);
  root.appendChild(footer);

  refreshOverview = () => {
    refreshMath();
    for (const { panel } of Object.values(arrangeActions)) {
      panel.hidden = panel !== arrangeActions[read("arrangeAction")]?.panel;
    }
    for (const { panel } of Object.values(symmetryActions)) {
      panel.hidden = panel !== symmetryActions[read("symmetryAction")]?.panel;
    }
    const action = activeAction();
    apply.disabled = !action || !!action.disabled || !!action.automatic;
    applyHint.textContent = !action ? "Choose a transform tab to apply a tool."
      : action.automatic ? "Changes apply automatically."
      : action.disabled ? "Choose a preset to apply." : "Apply: " + action.label;
    apply.title = applyHint.textContent;
    const stack = state.__xf.stack;
    const targetList = targets();
    const effectiveSplit = getEffectiveSplitCount(stack);
    const lastTile = tileCountForUI() - 1;
    targetHint.textContent = lastTile
      ? "Tile indices: 0\u2013" + lastTile + ". Current layout: " + effectiveSplit + " tiles."
      : "Tile 0 is the full view. Split the layout to target more tiles.";
    const cfg = normalizeKaleidoscope(read("kaleidoscope"));
    const wedgeCount = cfg.count * (cfg.mirror ? 2 : 1);
    symmetryMath.textContent = cfg.count + " rotational repeats \u00b7 " + wedgeCount +
      (cfg.mirror ? " mirrored wedges" : " wedges") + " \u00b7 " +
      Number((360 / wedgeCount).toFixed(2)) + "\u00b0 per wedge";
    status.textContent = stack.length + (stack.length === 1 ? " operation" : " operations") +
      " \u00b7 " + effectiveSplit + (effectiveSplit === 1 ? " tile" : " tiles") +
      " \u00b7 targets: " + (targetList == null ? "all" : targetList.join(", "));
    undo.disabled = reset.disabled = stack.length === 0;
    const targetInput = targetBar.querySelector('[data-xf-key="tileTargets"]');
    targetInput.disabled = !!read("applyToAll");
    const signature = JSON.stringify(stack);
    if (signature !== historySignature) {
      historySignature = signature;
      stackBox.replaceChildren();
      const names = {
        split: "Tile layout", rotate: "Rotate", flipX: "Flip X", flipY: "Flip Y",
        zoom: "Zoom", translate: "Translate", matrix: "Affine matrix",
        planes3d: "Stacked planes", kaleidoscope: "Kaleidoscope",
      };
      stack.forEach((op) => {
        const item = el("li", { className: "xf-historyItem" });
        item.appendChild(el("strong", {
          textContent: op.kind === "warp" ? mathDescriptions[normalizeMathTransform(op).type].label : names[op.kind] || op.kind || "Transform",
        }));
        item.appendChild(el("span", {
          className: "xf-help", textContent: formatXfStack([op]).replace(/^\d+:\s*/, ""),
        }));
        stackBox.appendChild(item);
      });
      emptyHistory.hidden = stack.length > 0;
      stackBox.hidden = stack.length === 0;
    }
  };
  const syncFromState = () => {
    kaleidoscopeEdit = null;
    ensureTransformState(state);
    bindings.forEach((sync) => sync());
    tabs.setValue(state.__xf.ui.activeTab);
    state.__xf.ui.activeTab = tabs.value;
    refreshOverview();
  };
  syncFromState();
  let lastState = JSON.stringify(state.__xf);
  root._onHide = () => {
    if (kaleidoscopeEdit) markDirty();
    kaleidoscopeEdit = null;
    lastState = JSON.stringify(state.__xf);
  };
  root._onShow = () => {
    if (JSON.stringify(state.__xf) !== lastState) syncFromState();
    else refreshOverview();
    lastState = JSON.stringify(state.__xf);
  };
  return root;
}

export function registerTransformTab() {
  registerTab("transforms", ({ mountEl, state, xfRuntime, onStateChange }) =>
    buildTransformPanel({ mountEl, state, xfRuntime, onStateChange })
  );
  
}
export function getEffectiveSplitCount(stack) {
  let s = 1;
  for (const op of stack || []) if (op?.kind === "split") s = clampInt(op.count, 1, 64);
  return s;
}

export function clampInt(v, lo, hi) {
  const n = Number.isFinite(v) ? Math.trunc(v) : Math.trunc(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

function combineTransforms(...parts) {
  return parts
    .map(p => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
}

/* ------------------------ Transform runtime (SVG) ------------------------ */
/**
 * Non-destructive:
 * - When split=1, we transform the source <g> directly.
 * - When split>1, we keep the source <g> as the live render target (hidden),
 *   and render transformed/tiling clones into a separate layer, with a mutation
 *   observer to stay in sync with visuals that redraw (like mandel).
 */
export function initTransformRuntime({ mountEl, state }) {
  ensureTransformState(state);
  ensurePropOpsState(state);
  ensureScriptOpsState(state);

  const svg = mountEl?.querySelector?.("svg");
  if (!(svg instanceof SVGSVGElement)) {
    return { rebuildNow() {}, resetToInitial() {}, destroy() {} };
  }

  // Pick a source group (avoid defs + avoid our own layer)
  const sourceG =
    Array.from(svg.querySelectorAll("g")).find(
      g => !g.closest("defs") && !g.hasAttribute("data-xf-layer")
    ) ||
    (() => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      svg.appendChild(g);
      return g;
    })();

  sourceG.setAttribute("data-xf-source", "1");
  const runtimeId = ++nextTransformRuntimeId;

  // Remember initial source transform so reset is “true reset”
  const initialSourceTransform = sourceG.getAttribute("transform");

  // Display layer where we put split/tiling clones
  let layerG = svg.querySelector('g[data-xf-layer="1"]');
  if (!layerG) {
    layerG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    layerG.setAttribute("data-xf-layer", "1");
    layerG.style.pointerEvents = "none";
    svg.appendChild(layerG);
  }

  let pendingFrame = null;
  let suspended = 0;
  let destroyed = false;
  let sourceChangeHandler = null;
  let mathStatus = { transformed: 0, skipped: 0, limited: false, warnings: [] };
  const getMathStatus = () => ({ ...mathStatus, warnings: [...mathStatus.warnings] });
  const hiddenSceneNodes = new Map();
  const restoreSceneNodes = () => {
    for (const [node, display] of hiddenSceneNodes) {
      if (node.style.display === "none") {
        if (display.value) node.style.setProperty("display", display.value, display.priority);
        else node.style.removeProperty("display");
      }
    }
    hiddenSceneNodes.clear();
  };
  const observerOptions = { childList: true, subtree: true, attributes: true };
  const isGeneratedLayer = (node) => node === layerG || layerG.contains(node);
  const hasSourceChanges = (records) => records.some((record) => {
    if (isGeneratedLayer(record.target)) return false;
    if (record.type !== "childList") return true;
    return [...record.addedNodes, ...record.removedNodes].some((node) => !isGeneratedLayer(node));
  });
  const cancelPendingFrame = () => {
    if (pendingFrame == null) return;
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  };
  const mo = new MutationObserver((records) => {
    if (destroyed || suspended || pendingFrame != null || !hasSourceChanges(records)) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null;
      if (destroyed) return;
      // A native ResizeObserver, simulation, or asynchronous renderer has drawn
      // a fresh source. Process that drawing without calling its render again.
      withSourceUpdatesSuspended(() => {
        if (sourceChangeHandler) sourceChangeHandler();
        else rebuildNow();
      });
    });
  });
  // Some apps use sibling groups for background and geometry. Observe the SVG,
  // rather than only its first group; generated transform clones are excluded.
  mo.observe(svg, observerOptions);

  function withSourceUpdatesSuspended(callback) {
    const outermost = suspended === 0;
    if (outermost) {
      cancelPendingFrame();
      // disconnect also discards queued records from the explicit tool action.
      // A boolean guard alone is insufficient: observers run after it resets.
      mo.disconnect();
    }
    suspended += 1;
    try { return callback(); }
    finally {
      suspended -= 1;
      if (outermost && !destroyed) mo.observe(svg, observerOptions);
    }
  }

  function setSourceChangeHandler(handler) {
    sourceChangeHandler = typeof handler === "function" ? handler : null;
  }

  function resetToInitial() {
    return withSourceUpdatesSuspended(() => {
      mathStatus = { transformed: 0, skipped: 0, limited: false, warnings: [] };
      layerG.replaceChildren();
      restoreSceneNodes();
      sourceG.style.display = "";
      if (initialSourceTransform == null) sourceG.removeAttribute("transform");
      else sourceG.setAttribute("transform", initialSourceTransform);
    });
  }

  function rebuildNow() {
    return withSourceUpdatesSuspended(rebuildTransforms);
  }

  function rebuildTransforms() {
    restoreSceneNodes();
    mathStatus = { transformed: 0, skipped: 0, limited: false, warnings: [] };
    const stack = state.__xf.stack || [];
    const propStack = state.__propOps?.stack || [];
    const hasProps = Array.isArray(propStack) && propStack.length > 0;
    const scriptStack = state.__scriptOps?.stack || [];
    const hasScripts = Array.isArray(scriptStack) && scriptStack.length > 0;

    const splitCount = getEffectiveSplitCount(stack);
    const { x, y, w, h } = getSvgViewBox(svg);
    const splitMode = String(state.__xf?.ui?.splitMode || "screen");
    const planeOps = (stack || []).filter(op => op?.kind === "planes3d");
    const totalTiles = Math.max(1, splitCount);
    const planesApply = planeOps.some(op => {
      if (!op) return false;
      const count = clampInt(op.count ?? 0, 0, 64);
      if (count <= 0) return false;
      if (op.targets == null) return true;
      if (typeof op.tile === "number") return op.tile >= 0 && op.tile < totalTiles;
      return Array.isArray(op.targets) && op.targets.some(t => Number.isInteger(t) && t >= 0 && t < totalTiles);
    });
    const kaleidoscopes = Array.from({ length: totalTiles }, (_, tile) => {
      for (let i = stack.length - 1; i >= 0; i--) {
        const op = stack[i];
        if (op?.kind === "kaleidoscope" && opAppliesToTile(op, tile)) return normalizeKaleidoscope(op);
      }
      return null;
    });

    // Nothing to do at all? true reset.
    if ((!stack || stack.length === 0) && !hasProps && !hasScripts) {
      resetToInitial();
      return;
    }

    const hasKaleidoscope = kaleidoscopes.some(Boolean);
    const mathOps = Array.from({ length: totalTiles }, (_, tile) =>
      stack.filter(op => op?.kind === "warp" && opAppliesToTile(op, tile)));
    const hasMath = mathOps.some(ops => ops.length > 0);
    const mathPointBudget = Math.max(4000, Math.floor(1600000 / Math.max(1, mathOps.filter(ops => ops.length).length)));
    const wholeScene = hasKaleidoscope || hasMath;
    const needsCloneLayer = splitCount > 1 || planesApply || wholeScene;

    if (!needsCloneLayer) {
      layerG.replaceChildren();
      sourceG.style.display = "";

      const t = tileTransformFromStack({ stack, tile: 0, x, y, w, h });
      if (t) sourceG.setAttribute("transform", t);
      else {
        // important: don't lose propOps when stack is empty
        if (initialSourceTransform == null) sourceG.removeAttribute("transform");
        else sourceG.setAttribute("transform", initialSourceTransform);
      }

      if (hasProps) applyPropOpsToSubtree(sourceG, propStack);
      if (hasScripts) applyScriptOpsToSubtree(sourceG, scriptStack, { svg, state, mountEl });
      return;
    }

    // Math transforms include the full artwork, including sibling point/contour
    // groups and direct SVG shapes. Do not reparent live nodes: D3 retains them.
    let sceneTemplate = null;
    if (wholeScene) {
      sceneTemplate = document.createElementNS(svg.namespaceURI, "g");
      sourceG.style.display = "";
      for (const node of Array.from(svg.children)) {
        if (node === layerG || /^(defs|metadata|title|desc|style|script)$/i.test(node.localName)) continue;
        const cloned = node.cloneNode(true);
        const sourceClone = node === sourceG ? cloned : cloned.querySelector('[data-xf-source="1"]');
        if (sourceClone) {
          sourceClone.removeAttribute("data-xf-source");
          sourceClone.style.display = "";
          if (initialSourceTransform == null) sourceClone.removeAttribute("transform");
          else sourceClone.setAttribute("transform", initialSourceTransform);
        }
        sceneTemplate.appendChild(cloned);
        hiddenSceneNodes.set(node, {
          value: node.style.getPropertyValue("display"), priority: node.style.getPropertyPriority("display"),
        });
        node.style.setProperty("display", "none");
      }
    }

    // split > 1, planes, or kaleidoscope requested
    sourceG.style.display = "none";
    layerG.replaceChildren();

    let cols = 1;
    let rows = 1;

    let sx = 1;
    let sy = 1;
    if (splitCount > 1) {
      cols = Math.ceil(Math.sqrt(splitCount));
      rows = Math.ceil(splitCount / cols);

      // "screen" keeps current behavior (uniform scale based on a square grid).
      // "fit" fills the available area (non-uniform scale if rows !== cols).
      if (splitMode === "screen") {
        const grid = Math.ceil(Math.sqrt(splitCount));
        cols = grid;
        rows = grid;
        sx = 1 / grid;
        sy = 1 / grid;
      } else {
        sx = 1 / cols;
        sy = 1 / rows;
      }
    }

    const kids = Array.from((sceneTemplate || sourceG).children);
    const N = kids.length || 1;
    const tiles = splitCount > 1 ? splitCount : 1;

    for (let tile = 0; tile < tiles; tile++) {
      const col = splitCount > 1 ? tile % cols : 0;
      const row = splitCount > 1 ? Math.floor(tile / cols) : 0;

      const gTile = document.createElementNS(svg.namespaceURI, "g");
      if (wholeScene) {
        // A rotated wide scene can reach beyond its original height. Clip in
        // tile-local coordinates, before grid placement, to avoid neighbor bleed.
        const tileClipId = `xf-viewport-${runtimeId}-${tile}`;
        const defs = document.createElementNS(svg.namespaceURI, "defs");
        const clip = document.createElementNS(svg.namespaceURI, "clipPath");
        clip.id = tileClipId;
        clip.setAttribute("clipPathUnits", "userSpaceOnUse");
        const rect = document.createElementNS(svg.namespaceURI, "rect");
        for (const [attr, value] of Object.entries({ x, y, width: w, height: h })) rect.setAttribute(attr, value);
        clip.appendChild(rect);
        defs.appendChild(clip);
        gTile.appendChild(defs);
        gTile.setAttribute("clip-path", `url(#${tileClipId})`);
      }
      if (splitCount > 1) {
        gTile.setAttribute(
          "transform",
          // Important: scale about the SVG viewBox origin (x,y), not about (0,0).
          // This keeps centered viewBoxes (e.g. x=-w/2,y=-h/2) from "drifting" into the top-left when split.
          `translate(${x + col * w * sx},${y + row * h * sy}) scale(${sx} ${sy}) translate(${-x} ${-y})`
        );
      }

      const baseTransform = tileTransformFromStack({ stack, tile, x, y, w, h });
      const planeCfg = planesApply ? getPlaneConfigForTile(stack, tile) : null;
      const planeCount = planeCfg ? planeCfg.count : 1;
      const totalPerTile = planeCount * N;
      const kaleidoscope = kaleidoscopes[tile];
      // Warp original geometry once per tile. Plane layers and kaleidoscope
      // instances reuse that result; the application's live geometry stays intact.
      let tileScene = sceneTemplate;
      if (mathOps[tile].length) {
        tileScene = sceneTemplate.cloneNode(true);
        const report = applyMathTransforms(tileScene, {
          operations: mathOps[tile], viewBox: { x, y, w, h }, svg, maxPoints: mathPointBudget,
        });
        mathStatus.transformed += report.transformed;
        mathStatus.skipped += report.skipped;
        mathStatus.limited ||= report.limited;
        mathStatus.warnings = [...new Set([...mathStatus.warnings, ...report.warnings])];
      }

      for (let plane = 0; plane < planeCount; plane++) {
        const gPlane = document.createElementNS(svg.namespaceURI, "g");
        const planeTransform = planeCfg
          ? planeTransformFromConfig({ cfg: planeCfg, idx: plane, x, y, w, h })
          : "";
        const combined = kaleidoscope ? planeTransform : combineTransforms(planeTransform, baseTransform);
        if (combined) gPlane.setAttribute("transform", combined);
        if (planeCfg) gPlane.style.opacity = String(planeOpacityForIndex(planeCfg, plane));

        if (kaleidoscope) {
          const geometry = buildKaleidoscopeGeometry(kaleidoscope, { x, y, w, h });
          const prefix = `xf-kaleidoscope-${runtimeId}-${tile}-${plane}`;
          const makeSvg = (tag, attrs = {}) => {
            const node = document.createElementNS(svg.namespaceURI, tag);
            for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
            return node;
          };
          // One source copy per plane, instanced with <use>. N changes the small
          // instance list, not the number of cloned attractor points/paths.
          const defs = makeSvg("defs");
          const clip = makeSvg("clipPath", { id: `${prefix}-clip`, clipPathUnits: "userSpaceOnUse" });
          clip.appendChild(makeSvg("path", { d: geometry.clipPath }));
          const template = makeSvg("g", { id: `${prefix}-wedge`, "clip-path": `url(#${prefix}-clip)` });
          const content = makeSvg("g");
          if (baseTransform) content.setAttribute("transform", baseTransform);
          const cloned = tileScene.cloneNode(true);
          // Rename as one subtree so references between sibling definitions and
          // shapes remain connected after export and across tiles.
          dedupeIdsInSubtree(cloned, `__${prefix}`);
          Array.from(cloned.children).forEach((node, index) => {
            tagCloneForMode(node, tile, index, N, plane, planeCount, tile * totalPerTile + plane * N + index);
          });
          content.appendChild(cloned);
          template.appendChild(content);
          defs.append(clip, template);
          gPlane.appendChild(defs);
          if (hasProps) applyPropOpsToSubtree(cloned, propStack);
          if (hasScripts) applyScriptOpsToSubtree(cloned, scriptStack, { svg, state, mountEl });
          for (const sector of geometry.sectors) {
            gPlane.appendChild(makeSvg("use", {
              href: `#${prefix}-wedge`, transform: sector.transform,
              "data-xf-sector": sector.index, "data-xf-mode": tile, "data-xf-plane": plane,
            }));
          }
          gTile.appendChild(gPlane);
          continue;
        }

        if (wholeScene) {
          const cloned = tileScene.cloneNode(true);
          dedupeIdsInSubtree(cloned, `__xf_scene_${runtimeId}_${tile}_${plane}`);
          Array.from(cloned.children).forEach((node, index) => {
            tagCloneForMode(node, tile, index, N, plane, planeCount, tile * totalPerTile + plane * N + index);
          });
          if (hasProps) applyPropOpsToSubtree(cloned, propStack);
          if (hasScripts) applyScriptOpsToSubtree(cloned, scriptStack, { svg, state, mountEl });
          gPlane.appendChild(cloned);
          gTile.appendChild(gPlane);
          continue;
        }

        let localIdx = 0;
        for (const n of kids) {
          const cloned = n.cloneNode(true);
          const globalIdx = tile * totalPerTile + plane * N + localIdx;
          tagCloneForMode(cloned, tile, localIdx, N, plane, planeCount, globalIdx);
          dedupeIdsInSubtree(cloned, `__xf_${tile}_${plane}_${localIdx}`);
          if (hasProps) applyPropOpsToSubtree(cloned, propStack);
          if (hasScripts) applyScriptOpsToSubtree(cloned, scriptStack, { svg, state, mountEl });
          gPlane.appendChild(cloned);
          localIdx++;
        }

        gTile.appendChild(gPlane);
      }

      layerG.appendChild(gTile);
    }
  }

  function destroy() {
    destroyed = true;
    cancelPendingFrame();
    sourceChangeHandler = null;
    mo.disconnect();
    resetToInitial();
  }
  if (!isFirst) {
    const preset = String(getByPath(state, "__xf.ui.preset") ?? "");
    const next = buildTransformPresetStack(preset);
    if (next) {
      const hasStack = Array.isArray(state.__xf?.stack) && state.__xf.stack.length > 0;
      if (!hasStack) {
        state.__xf.stack = next;
      }
      isFirst = true;
    }
  }
        //xfRuntime?.rebuildNow?.();

  return { rebuildNow, resetToInitial, withSourceUpdatesSuspended, setSourceChangeHandler, getMathStatus, destroy };
}

export function getSvgViewBox(svg) {
  const vb = svg.viewBox && svg.viewBox.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return { x: vb.x, y: vb.y, w: vb.width, h: vb.height };

  const aw = parseFloat(svg.getAttribute("width") || "");
  const ah = parseFloat(svg.getAttribute("height") || "");
  if (Number.isFinite(aw) && aw > 0 && Number.isFinite(ah) && ah > 0) return { x: 0, y: 0, w: aw, h: ah };

  const r = svg.getBoundingClientRect();
  return { x: 0, y: 0, w: r.width || 1, h: r.height || 1 };
}

function opAppliesToTile(op, tile) {
  // Back-compat: old ops might have op.tile
  if (typeof op.tile === "number") return op.tile === tile;

  // New: targets === null => all
  if (op.targets == null) return true;

  // New: targets array
  return Array.isArray(op.targets) && op.targets.includes(tile);
}

//function tileTransformFromStack({ stack, tile, w, h }) {
function tileTransformFromStack({ stack, tile, x, y, w, h }) {
  const cx = x + w / 2;
  const cy = y + h / 2;

  const parts = [];
  for (const op of stack || []) {
    if (!op || op.kind === "split") continue;
    if (!opAppliesToTile(op, tile)) continue;

    if (op.kind === "rotate") {
      const deg = Number(op.deg || 0);
      parts.push(`rotate(${deg} ${cx} ${cy})`);
    } else if (op.kind === "flipX") {
      // Mirror about vertical center line x = cx
      parts.push(`translate(${2 * cx} 0) scale(-1 1)`);
    } else if (op.kind === "flipY") {
      // Mirror about horizontal center line y = cy
      parts.push(`translate(0 ${2 * cy}) scale(1 -1)`);
    } else if (op.kind === "zoom") {
      const f = Number(op.factor || 1);
      if (Number.isFinite(f) && f !== 1 && f > 0) {
        // NEW: center vector2D; fallback to svg center
        const c = op.center;

        const zx = resolveCenterAxisWithOrigin(c?.x, x, w, cx);
        const zy = resolveCenterAxisWithOrigin(c?.y, y, h, cy);

        // backward compat (if old ops exist): op.cx/op.cy may also be fractional percentages
        const cxOld = Number.isFinite(+op.cx) ? resolveCenterAxisWithOrigin(op.cx, x, w, zx) : zx;
        const cyOld = Number.isFinite(+op.cy) ? resolveCenterAxisWithOrigin(op.cy, y, h, zy) : zy;

        parts.push(
          `translate(${cxOld} ${cyOld}) scale(${f}) translate(${-cxOld} ${-cyOld})`
        );
      }
    } else if (op.kind === "translate") {
      // NEW: vector2D translate
      const v = op.v || { x: op.x, y: op.y }; // backward compat
      const tx = Number.isFinite(+v?.x) ? +v.x : 0;
      const ty = Number.isFinite(+v?.y) ? +v.y : 0;
      if (tx || ty) parts.push(`translate(${tx} ${ty})`);
    } else if (op.kind === "matrix") {
      const m = Array.isArray(op.m) ? op.m : [op.a, op.b, op.c, op.d, op.e, op.f];
      const safe = Array.isArray(m) && m.length === 6 && m.every(n => Number.isFinite(+n));
      if (safe) parts.push(`matrix(${m.map(n => +n).join(" ")})`);
    } else if (op.kind === "planes3d") {
      // handled during clone-building (needs additional layers)
      continue;
    }
  }

  return parts.join(" ");
}

function getPlaneConfigForTile(stack, tile) {
  if (!Array.isArray(stack)) return null;

  for (let i = stack.length - 1; i >= 0; i--) {
    const op = stack[i];
    if (!op || op.kind !== "planes3d") continue;
    if (!opAppliesToTile(op, tile)) continue;

    const count = clampInt(op.count ?? 0, 0, 64);
    if (count <= 0) return null;

    return {
      count,
      baseScale: toFiniteNumber(op.baseScale ?? 1, 1),
      scaleStep: toFiniteNumber(op.scaleStep ?? 0, 0),
      offset: ensureVector2(op.offset, { x: 0, y: 0 }),
      center: ensureVector2(op.center, { x: NaN, y: NaN }),
      opacity: clampNumber(toFiniteNumber(op.opacity ?? op.baseOpacity ?? 1, 1), 0, 1),
      opacityFalloff: clampNumber(toFiniteNumber(op.opacityFalloff ?? 0, 0), 0, 1),
    };
  }

  return null;
}

function planeTransformFromConfig({ cfg, idx, x, y, w, h }) {
  if (!cfg) return "";

  const cx = resolveCenterAxisWithOrigin(cfg.center?.x, x, w, x + w / 2);
  const cy = resolveCenterAxisWithOrigin(cfg.center?.y, y, h, y + h / 2);
  const scale = Math.max(0.001, cfg.baseScale + cfg.scaleStep * idx);
  const dx = toFiniteNumber(cfg.offset?.x, 0) * idx;
  const dy = toFiniteNumber(cfg.offset?.y, 0) * idx;

  const parts = [];
  if (scale !== 1) parts.push(`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`);
  if (dx || dy) parts.push(`translate(${dx} ${dy})`);
  return parts.join(" ");
}

function planeOpacityForIndex(cfg, idx) {
  const base = clampNumber(toFiniteNumber(cfg?.opacity, 1), 0, 1);
  const falloff = clampNumber(toFiniteNumber(cfg?.opacityFalloff, 0), 0, 1);
  return clampNumber(base - falloff * idx, 0, 1);
}

export function tagCloneForMode(node, tile, localIdx, N, plane = 0, planeCount = 1, globalIdxOverride) {
  if (!(node instanceof Element)) return;
  const totalPerTile = N * Math.max(1, planeCount);
  const globalIdx = globalIdxOverride ?? tile * totalPerTile + plane * N + localIdx;
  node.setAttribute("data-xf-mode", String(tile));
  node.setAttribute("data-xf-source-index", String(localIdx));
  node.setAttribute("data-xf-global-index", String(globalIdx));
  node.setAttribute("data-xf-plane", String(plane));

  for (const el of node.querySelectorAll("*")) {
    el.setAttribute("data-xf-mode", String(tile));
    el.setAttribute("data-xf-source-index", String(localIdx));
    el.setAttribute("data-xf-global-index", String(globalIdx));
    el.setAttribute("data-xf-plane", String(plane));
  }
}

export function dedupeIdsInSubtree(root, suffix) {
  if (!(root instanceof Element)) return;

  const idMap = new Map();

  // 1) rename all ids
  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const el of all) {
    const id = el.getAttribute("id");
    if (id) {
      const next = `${id}${suffix}`;
      idMap.set(id, next);
      el.setAttribute("id", next);
    }
  }

  if (!idMap.size) return;

  // 2) rewrite common ref-bearing attributes
  const refAttrs = [
    "href", "xlink:href",
    "fill", "stroke", "filter", "clip-path", "mask",
    "marker-start", "marker-mid", "marker-end",
    "style",
  ];

  for (const el of all) {
    for (const a of refAttrs) {
      const v = el.getAttribute(a);
      if (!v) continue;

      // Rewrite complete references once. Replacing bare ID prefixes after a
      // url() replacement duplicated suffixes and broke gradients and clips.
      let next = v.replace(/url\(\s*(['"]?)#([^'"\s)]+)\1\s*\)/g,
        (match, quote, id) => idMap.has(id) ? `url(#${idMap.get(id)})` : match);
      if ((a === "href" || a === "xlink:href") && v.startsWith("#") && idMap.has(v.slice(1))) {
        next = `#${idMap.get(v.slice(1))}`;
      }
      if (next !== v) el.setAttribute(a, next);
    }
  }
}
