/* --------------------------- Transforms tab --------------------------- */
import { el, getByPath, setByPath, buildControl } from "./visualHelp.js";
import { registerTab } from "./visualHelp.js";
import { ensurePropOpsState, applyPropOpsToSubtree, ensureScriptOpsState, applyScriptOpsToSubtree } from "./svgEditor.js";
let isFirst = false;
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
      if (op.kind === "rotate") return `${i}: rotate(targets=${tgt}, deg=${op.deg})`;
      if (op.kind === "flipX") return `${i}: flipX(targets=${tgt})`;
      if (op.kind === "flipY") return `${i}: flipY(targets=${tgt})`;
      if (op.kind === "zoom") {
        const c = op.center;
        const cStr =
          c && (Number.isFinite(+c.x) || Number.isFinite(+c.y))
            ? `, center=(${fmtNum(+c.x)},${fmtNum(+c.y)})`
            : "";
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

function buildTransformPresetStack(presetName) {
  const name = String(presetName || "").trim();
  if (!name) return null;

  // Notes:
  // - This replaces the current stack when applied.
  // - Zoom ops intentionally omitted (per request).
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
  const markDirty = () => onStateChange?.();

  const root = document.createElement("div");
  root.className = "xf-panel";

  const buildVector2Control = ({
    key,
    label,
    description,
    blankIsNaN = false,
    step = 1,
  }) => {
    const wrap = el("div", { className: "vr-row" });
    wrap.appendChild(el("label", { className: "vr-label", textContent: label }));
    if (description) wrap.appendChild(el("div", { className: "vr-help", textContent: description }));

    const row = el("div", { className: "vr-rangeRow" });

    const makeBox = (axis) => {
      const input = el("input", { type: "number", step: String(step) });
      const v = getByPath(state, key)?.[axis];
      input.value = Number.isFinite(+v) ? String(+v) : "";

      input.addEventListener("change", () => {
        const raw = input.value.trim();
        const n =
          raw === ""
            ? (blankIsNaN ? NaN : 0)
            : Number(raw);

        const cur = ensureVector2(getByPath(state, key), { x: blankIsNaN ? NaN : 0, y: blankIsNaN ? NaN : 0 });
        const next = { ...cur, [axis]: Number.isFinite(n) ? n : (blankIsNaN ? NaN : 0) };
        setByPath(state, key, next);
        markDirty();
        render();
      });

      return input;
    };

    row.appendChild(el("div", { className: "vr-help", textContent: "x" }));
    row.appendChild(makeBox("x"));
    row.appendChild(el("div", { className: "vr-help", textContent: "y" }));
    row.appendChild(makeBox("y"));

    wrap.appendChild(row);
    return wrap;
  };

  const buildMatrixControl = () => {
    const wrap = el("div", { className: "vr-row" });
    wrap.appendChild(el("label", { className: "vr-label", textContent: "matrix (a b c d e f)" }));
    wrap.appendChild(el("div", { className: "vr-help", textContent: "SVG transform matrix; leave blank to keep defaults." }));

    const row = el("div", { className: "vr-rangeRow" });
    const keys = ["a", "b", "c", "d", "e", "f"];

    const syncVal = (axis, raw) => {
      const next = ensureMatrix6(getByPath(state, "__xf.ui.matrix"));
      const n = raw.trim() === "" ? DEFAULT_MATRIX[axis] : Number(raw);
      next[axis] = Number.isFinite(n) ? n : next[axis];
      setByPath(state, "__xf.ui.matrix", next);
    };

    for (const axis of keys) {
      const box = el("input", { type: "number", step: "0.01" });
      const cur = ensureMatrix6(getByPath(state, "__xf.ui.matrix"));
      box.value = Number.isFinite(cur[axis]) ? String(cur[axis]) : "";
      box.addEventListener("change", () => {
        syncVal(axis, box.value || "");
        markDirty();
        render();
      });

      const wrapAxis = el("div", { className: "vr-vecField" });
      wrapAxis.appendChild(el("div", { className: "vr-vecLabel", textContent: axis }));
      wrapAxis.appendChild(box);
      row.appendChild(wrapAxis);
    }

    wrap.appendChild(row);
    return wrap;
  };

  const render = () => {
    root.innerHTML = "";

    const effectiveSplit = getEffectiveSplitCount(state.__xf.stack);
    const uiSplit = clampInt(getByPath(state, "__xf.ui.splitCount") ?? 1, 1, 64);
    const tileCountForUI = Math.max(1, uiSplit, effectiveSplit);

    const tileOptions = ["all", ...Array.from({ length: tileCountForUI }, (_, i) => String(i))];

    const xfParams = [
      {
        key: "__xf.ui.preset",
        label: "preset",
        type: "select",
        default: "",
        category: "Presets",
        options: ["", "kaleidoscope4"],
        description: "Choose a transform preset, then press Apply preset.",
      },
      {
        key: "__xf.ui.splitMode",
        label: "split mode",
        type: "select",
        default: "screen",
        category: "Split",
        options: ["screen", "fit"],
        description: 'screen = uniform downscale; fit = fill viewport per tile (e.g. split(2) => half width, full height).',
      },
      {
        key: "__xf.ui.splitCount",
        label: "split copies",
        type: "number",
        default: 1,
        category: "Split",
        min: 1,
        max: 64,
        step: 1,
        description: "2=side-by-side, 4=2×2, 9=3×3 ...",
      },

      // {
      //   key: "__xf.ui.applyToAll",
      //   label: "apply transforms to all tiles",
      //   type: "boolean",
      //   default: false,
      // },

      // {
      //   key: "__xf.ui.activeTile",
      //   label: "quick pick tile",
      //   type: "select",
      //   default: "0",
      //   options: tileOptions,
      //   description: "Select a tile (or all) and it will populate tile targets.",
      // },

      {
        key: "__xf.ui.tileTargets",
        label: "tile targets",
        type: "text",
        default: "0",
        category: "Targets",
        description: "Examples: all | 0 | 0,2,5 | 1-4",
      },

      {
        key: "__xf.ui.rotateDeg",
        label: "rotate (deg)",
        type: "number",
        default: 90,
        category: "Rotate/Zoom",
        min: -180,
        max: 180,
        step: 1,
      },

      {
        key: "__xf.ui.zoomFactor",
        label: "zoom factor",
        type: "number",
        default: 1.25,
        category: "Rotate/Zoom",
        min: 0.1,
        max: 20,
        step: 0.05,
        description: "Zoom in uses this; zoom out uses 1 / this.",
      },
      {
        key: "__xf.ui.planeCount",
        label: "3D plane count",
        type: "number",
        default: 3,
        category: "3D Planes",
        min: 0,
        max: 32,
        step: 1,
        description: "0 disables planes; >1 stacks the SVG into multiple layers.",
      },
      {
        key: "__xf.ui.planeBaseScale",
        label: "plane base scale",
        type: "number",
        default: 1,
        category: "3D Planes",
        min: 0.01,
        max: 10,
        step: 0.01,
      },
      {
        key: "__xf.ui.planeScaleStep",
        label: "plane scale step",
        type: "number",
        default: -0.12,
        category: "3D Planes",
        min: -5,
        max: 5,
        step: 0.01,
        description: "Added per depth (negative shrinks deeper planes).",
      },
      {
        key: "__xf.ui.planeOpacity",
        label: "plane opacity",
        type: "number",
        default: 0.7,
        category: "3D Planes",
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        key: "__xf.ui.planeOpacityFalloff",
        label: "opacity falloff",
        type: "number",
        default: 0.12,
        category: "3D Planes",
        min: 0,
        max: 1,
        step: 0.02,
        description: "Opacity reduction per depth step (clamped to 0-1).",
      },
    ];

    const controls = document.createElement("div");
    const groups = new Map();
    const groupOpen = state.__xf.ui.groupOpen;
    const getGroup = (name) => {
      if (!groups.has(name)) {
        const storedOpen = groupOpen[name];
        const isOpen = typeof storedOpen === "boolean" ? storedOpen : false;
        const wrap = el("details", { className: "vr-paramGroup", open: isOpen });
        const summary = el("summary", { className: "vr-paramGroupTitle", textContent: name });
        const body = el("div", { className: "vr-paramGroupBody" });
        wrap.addEventListener("toggle", () => {
          groupOpen[name] = wrap.open;
          markDirty();
        });
        wrap.appendChild(summary);
        wrap.appendChild(body);
        groups.set(name, { wrap, body });
      }
      return groups.get(name);
    };

    for (const p of xfParams) {
      const node = buildControl({
        param: p,
        state,
        onChange: () => {
          markDirty();
          render();
        },
      });

      // If you re-enable activeTile, keep this sync behavior:
      if (p.key === "__xf.ui.activeTile") {
        const sel = node.querySelector("select");
        if (sel) {
          sel.addEventListener("change", () => {
            setByPath(state, "__xf.ui.tileTargets", sel.value);
            render();
          });
        }
      }

      const group = getGroup(p.category || "General");
      group.body.appendChild(node);
    }

    getGroup("Matrix").body.appendChild(buildMatrixControl());

    getGroup("Rotate/Zoom").body.appendChild(
      buildVector2Control({
        key: "__xf.ui.zoomCenter",
        label: "zoom center",
        description: "SVG coords. Leave blank for SVG center.",
        blankIsNaN: true,
        step: 1,
      })
    );

    getGroup("Translate").body.appendChild(
      buildVector2Control({
        key: "__xf.ui.translateVec",
        label: "translate (x,y)",
        description: "Moves targeted tiles by (x,y) in SVG coords.",
        blankIsNaN: false,
        step: 1,
      })
    );

    getGroup("3D Planes").body.appendChild(
      buildVector2Control({
        key: "__xf.ui.planeCenter",
        label: "plane center",
        description: "Scale planes about this point; blank = SVG center.",
        blankIsNaN: true,
        step: 1,
      })
    );

    getGroup("3D Planes").body.appendChild(
      buildVector2Control({
        key: "__xf.ui.planeOffset",
        label: "plane offset per depth",
        description: "Translate each plane by (dx,dy) * depth index.",
        blankIsNaN: false,
        step: 1,
      })
    );

    for (const { wrap } of groups.values()) controls.appendChild(wrap);
    root.appendChild(controls);

    const btnRow = document.createElement("div");
    btnRow.className = "xf-btnRow";
    root.appendChild(btnRow);

    const mkBtn = (label, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.onclick = onClick;
      return b;
    };

    const rotateDeg = Number(getByPath(state, "__xf.ui.rotateDeg") ?? 0);
    const zoomFactor = Number(getByPath(state, "__xf.ui.zoomFactor") ?? 1.25);
    const splitCount = clampInt(Number(getByPath(state, "__xf.ui.splitCount") ?? 1), 1, 64);
    const readPlaneUi = () => ({
      count: clampInt(Number(getByPath(state, "__xf.ui.planeCount") ?? 0), 0, 64),
      baseScale: toFiniteNumber(getByPath(state, "__xf.ui.planeBaseScale"), 1),
      scaleStep: toFiniteNumber(getByPath(state, "__xf.ui.planeScaleStep"), 0),
      opacity: clampNumber(toFiniteNumber(getByPath(state, "__xf.ui.planeOpacity"), 0.7), 0, 1),
      opacityFalloff: clampNumber(toFiniteNumber(getByPath(state, "__xf.ui.planeOpacityFalloff"), 0.12), 0, 1),
      offset: ensureVector2(getByPath(state, "__xf.ui.planeOffset"), { x: 0, y: 0 }),
      center: ensureVector2(getByPath(state, "__xf.ui.planeCenter"), { x: NaN, y: NaN }),
    });

    const targets = resolveUiTargets({
      applyToAll: !!getByPath(state, "__xf.ui.applyToAll"),
      tileTargetsText: String(getByPath(state, "__xf.ui.tileTargets") ?? ""),
      tileCount: tileCountForUI,
    }); // targets: null => all, or number[]

    btnRow.appendChild(
      mkBtn("apply split", () => {
        state.__xf.stack.push({ kind: "split", count: splitCount });
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("apply preset", () => {
        const preset = String(getByPath(state, "__xf.ui.preset") ?? "");
        const next = buildTransformPresetStack(preset);
        if (!next) return;
        state.__xf.stack = next;
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("rotate", () => {
        state.__xf.stack.push({ kind: "rotate", targets, deg: rotateDeg });
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("flip X", () => {
        state.__xf.stack.push({ kind: "flipX", targets });
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("flip Y", () => {
        state.__xf.stack.push({ kind: "flipY", targets });
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    // NEW: zoom (with center)
    btnRow.appendChild(
      mkBtn("zoom in", () => {
        const f = isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1.25;
        const c = ensureVector2(getByPath(state, "__xf.ui.zoomCenter"), { x: NaN, y: NaN });
        // copy so stack op doesn't mutate when UI changes
        state.__xf.stack.push({ kind: "zoom", targets, factor: f, center: { x: +c.x, y: +c.y } });
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("zoom out", () => {
        const f = isFinite(zoomFactor) && zoomFactor > 0 ? 1 / zoomFactor : 1 / 1.25;
        const c = ensureVector2(getByPath(state, "__xf.ui.zoomCenter"), { x: NaN, y: NaN });
        state.__xf.stack.push({ kind: "zoom", targets, factor: f, center: { x: +c.x, y: +c.y } });
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    // NEW: translate
    btnRow.appendChild(
      mkBtn("translate", () => {
        const v = ensureVector2(getByPath(state, "__xf.ui.translateVec"), { x: 0, y: 0 });
        state.__xf.stack.push({ kind: "translate", targets, v: { x: +v.x, y: +v.y } });
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("apply matrix", () => {
        const m = ensureMatrix6(getByPath(state, "__xf.ui.matrix"));
        state.__xf.stack.push({ kind: "matrix", targets, m: [m.a, m.b, m.c, m.d, m.e, m.f] });
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("undo", () => {
        state.__xf.stack.pop();
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("reset", () => {
        state.__xf.stack.length = 0;
        xfRuntime?.resetToInitial?.();
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("apply 3D planes", () => {
        const cfg = readPlaneUi();
        if (!cfg.count) return;
        state.__xf.stack.push({
          kind: "planes3d",
          targets,
          count: cfg.count,
          baseScale: cfg.baseScale,
          scaleStep: cfg.scaleStep,
          offset: { x: +cfg.offset.x, y: +cfg.offset.y },
          center: { x: +cfg.center.x, y: +cfg.center.y },
          opacity: cfg.opacity,
          opacityFalloff: cfg.opacityFalloff,
        });
        xfRuntime?.rebuildNow?.();
        render();
      })
    );

    const stackBox = document.createElement("pre");
    stackBox.className = "xf-stack";
    stackBox.textContent = formatXfStack(state.__xf.stack);
    root.appendChild(stackBox);

    const status = document.createElement("div");
    status.className = "xf-status";
    status.textContent =
      `effective split: ${effectiveSplit} | stack ops: ${state.__xf.stack.length} | ` +
      (targets == null ? "targets: all" : `targets: ${targets.join(",") || "(none)"}`);
    root.appendChild(status);
    markDirty();
  };

  render();
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

  let rafPending = false;
  const schedule = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      rebuildNow();
    });
  };

  // Keep up with visuals that redraw internally
  const mo = new MutationObserver(schedule);
  mo.observe(sourceG, { childList: true, subtree: true, attributes: true });

  function resetToInitial() {
    layerG.replaceChildren();
    sourceG.style.display = "";
    if (initialSourceTransform == null) sourceG.removeAttribute("transform");
    else sourceG.setAttribute("transform", initialSourceTransform);
  }

  function rebuildNow() {
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

    // Nothing to do at all? true reset.
    if ((!stack || stack.length === 0) && !hasProps && !hasScripts) {
      resetToInitial();
      return;
    }

    const needsCloneLayer = splitCount > 1 || planesApply;

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

    // split > 1 OR planes requested
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

    const kids = Array.from(sourceG.children);
    const N = kids.length || 1;
    const tiles = splitCount > 1 ? splitCount : 1;

    for (let tile = 0; tile < tiles; tile++) {
      const col = splitCount > 1 ? tile % cols : 0;
      const row = splitCount > 1 ? Math.floor(tile / cols) : 0;

      const gTile = document.createElementNS(svg.namespaceURI, "g");
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

      for (let plane = 0; plane < planeCount; plane++) {
        const gPlane = document.createElementNS(svg.namespaceURI, "g");
        const planeTransform = planeCfg
          ? planeTransformFromConfig({ cfg: planeCfg, idx: plane, x, y, w, h })
          : "";
        const combined = combineTransforms(planeTransform, baseTransform);
        if (combined) gPlane.setAttribute("transform", combined);
        if (planeCfg) gPlane.style.opacity = String(planeOpacityForIndex(planeCfg, plane));

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
    try { mo.disconnect(); } catch {}
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

  return { rebuildNow, resetToInitial, destroy };
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

      let next = v;
      for (const [oldId, newId] of idMap) {
        next = next
          .replaceAll(`url(#${oldId})`, `url(#${newId})`)
          .replaceAll(`"#${oldId}"`, `"#${newId}"`)
          .replaceAll(`#${oldId}`, `#${newId}`);
      }
      if (next !== v) el.setAttribute(a, next);
    }
  }
}
