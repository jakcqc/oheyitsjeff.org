// helper/effectsHelp.js
// Effects tab: UI-driven SVG scale/convert utilities + equation ops.

import { el, registerTab } from "./visualHelp.js";
import { selectElementsByPropSelector } from "./svgEditor.js";
import {
  scaleCirclesInSubtree,
  scaleRectsInSubtree,
  scalePolygonsInSubtree,
  scalePathsInSubtree,
  convertShapesInSubtree,
  mergeCirclesToPathsInSubtree,
  mergeRectsToPathsInSubtree,
} from "./scriptOpsUtils.js";
import { applySplineLinesInSubtree } from "./splineEffectsUtils.js";

const EFFECT_TYPES = ["scale", "convert", "splineLines", "paint", "merge", "functionRects"];
const SHAPE_TYPES = ["circle", "rect", "polygon", "path"];
const SPLINE_SOURCE_TYPES = ["all", "path", "circle", "rect", "line", "polygon"];

const ATTR_KEYWORDS = [
  { key: "opacity", desc: "Overall element opacity (0..1)" },
  { key: "fill-opacity", desc: "Fill opacity (0..1)" },
  { key: "stroke-opacity", desc: "Stroke opacity (0..1)" },
  { key: "stroke-width", desc: "Stroke width" },
  { key: "stroke-miterlimit", desc: "Stroke miter limit" },
  { key: "stroke-dashoffset", desc: "Stroke dash offset" },
  { key: "r", desc: "Circle radius" },
  { key: "cx", desc: "Circle center x" },
  { key: "cy", desc: "Circle center y" },
  { key: "x", desc: "Rect x" },
  { key: "y", desc: "Rect y" },
  { key: "width", desc: "Rect width" },
  { key: "height", desc: "Rect height" },
  { key: "rx", desc: "Rect corner radius x" },
  { key: "ry", desc: "Rect corner radius y" },
];

const ATTR_KEY_SET = new Set(ATTR_KEYWORDS.map((k) => k.key));

const RECT_FUNCTION_PRESETS = [
  {
    id: "circle",
    label: "Circle orbit",
    code: "({ t, bounds }) => ({\n  x: bounds.cx + Math.cos(t * Math.PI * 2) * bounds.r,\n  y: bounds.cy + Math.sin(t * Math.PI * 2) * bounds.r\n})",
  },
  {
    id: "sine",
    label: "Sine wave",
    code: "({ t, bounds }) => ({\n  x: bounds.x + bounds.w * t,\n  y: bounds.cy + Math.sin(t * Math.PI * 2) * bounds.h * 0.25\n})",
  },
  {
    id: "spiral",
    label: "Spiral",
    code: "({ t, bounds }) => {\n  const a = t * Math.PI * 6;\n  const r = bounds.r * t;\n  return {\n    x: bounds.cx + Math.cos(a) * r,\n    y: bounds.cy + Math.sin(a) * r,\n  };\n}",
  },
  {
    id: "line",
    label: "Horizontal line",
    code: "({ t, bounds }) => ({\n  x: bounds.x + bounds.w * t,\n  y: bounds.cy\n})",
  },
];

function ensureEffectsState(state) {
  if (!state.__effects || typeof state.__effects !== "object") state.__effects = {};
  if (!state.__effects.ui || typeof state.__effects.ui !== "object") {
    state.__effects.ui = {
      effectType: "scale",
      selector: "",
      elementType: "circle",
      rangeMin: 0.5,
      rangeMax: 1.5,
      count: 10,
      spacing: "linear",
      opacityMode: "auto",
      opacityFixed: 1,
      opacityMin: 0.25,
      opacityMax: 1,
      equation: "",
      convertFrom: "path",
      convertTo: "circle",
      pathSamplePoints: 64,
      convertScaleMode: "none",
      convertScaleFactor: 1,
      splineSource: "all",
      splineSelector: "",
      splinePointCount: 16,
      splineStepsPerSegment: 18,
      splineTension: 0.12,
      splineLineOrientation: "vertical",
      splineLineHeight: 18,
      splineLineScale: 1,
      splineStrokeWidth: 2,
      splineScaleMode: "none",
      splineScaleFactor: 1,
      paintFill: "none",
      paintStroke: "#000000",
      mergeShape: "circle",
      mergeSelector: "",
      mergeSelectorRuleText: "",
      mergeRatio: 1.15,
      mergePadding: 2,
      mergeGridStep: 4,
      mergeSmoothPasses: 1,
      mergeStroke: "#000000",
      mergeStrokeWidth: 1.5,
      fnPreset: RECT_FUNCTION_PRESETS[0]?.id || "circle",
      fnCode: RECT_FUNCTION_PRESETS[0]?.code || "",
      fnSampleCount: 80,
      fnSampleEvery: 1,
      fnSampleOffset: 0,
      fnRectLimit: 0,
      fnOrientMode: "tangent",
      fnTangentStep: 1,
      fnFixedAngle: 0,
      fnRectWidth: 18,
      fnRectHeight: 10,
      fnRectRx: 0,
      fnRectRy: 0,
      fnRectFill: "none",
      fnRectStroke: "#000000",
      fnRectStrokeWidth: 1,
      fnRectOpacity: 1,
      autoRun: false,
      debug: false,
    };
  }
  if (!state.__effects.ui.groupsOpen || typeof state.__effects.ui.groupsOpen !== "object") {
    state.__effects.ui.groupsOpen = {};
  }
}

function clampNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function parseNumberLike(v, fallback = 0) {
  const s = String(v ?? "").trim();
  const m = s.match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseEquation(raw) {
  const text = String(raw || "").trim();
  if (!text) return { ok: true, empty: true, rule: null };

  const m = text.match(
    /^(foreach|sum(?:\((forward|backward)\))?)\s*:\s*([a-zA-Z][\w.-]*)\s*([+\-*/])\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*$/
  );
  if (!m) {
    return {
      ok: false,
      error: 'Syntax: foreach:opacity *1.2 OR sum(forward):opacity +0.1',
    };
  }

  const modeRaw = m[1];
  const mode = modeRaw.startsWith("sum") ? "sum" : "foreach";
  const direction = m[2] || "forward";
  const prop = m[3];
  const op = m[4];
  const value = Number(m[5]);
  if (!Number.isFinite(value)) return { ok: false, error: "Equation value must be numeric." };

  return { ok: true, rule: { mode, direction, prop, op, value } };
}

function resolvePropTarget(el, prop) {
  if (prop.startsWith("style.")) return { kind: "style", name: prop.slice(6) };
  if (el.hasAttribute(prop)) return { kind: "attr", name: prop };
  if (prop in el.style) return { kind: "style", name: prop };
  return { kind: "attr", name: prop };
}

function readNumericProp(el, prop) {
  const target = resolvePropTarget(el, prop);
  if (target.kind === "style") {
    const v = el.style?.[target.name];
    return parseNumberLike(v, NaN);
  }
  const v = el.getAttribute(target.name);
  return parseNumberLike(v, NaN);
}

function writeNumericProp(el, prop, value) {
  const target = resolvePropTarget(el, prop);
  const v = Number.isFinite(value) ? value : 0;
  if (target.kind === "style") {
    el.style[target.name] = String(v);
  } else {
    el.setAttribute(target.name, String(v));
  }
}

function applyOp(base, op, rhs) {
  switch (op) {
    case "+": return base + rhs;
    case "-": return base - rhs;
    case "*": return base * rhs;
    case "/": return rhs === 0 ? base : base / rhs;
    default: return base;
  }
}

function applyEquationToList(els, rule) {
  if (!rule || !els.length) return;
  const ordered = rule.direction === "backward" ? [...els].reverse() : els;

  if (rule.mode === "foreach") {
    for (const el of ordered) {
      const base = readNumericProp(el, rule.prop);
      const b = Number.isFinite(base) ? base : 0;
      const next = applyOp(b, rule.op, rule.value);
      writeNumericProp(el, rule.prop, next);
    }
    return;
  }

  let current = readNumericProp(ordered[0], rule.prop);
  if (!Number.isFinite(current)) current = 0;

  for (let i = 0; i < ordered.length; i++) {
    if (i === 0) {
      writeNumericProp(ordered[i], rule.prop, current);
    } else {
      current = applyOp(current, rule.op, rule.value);
      writeNumericProp(ordered[i], rule.prop, current);
    }
  }
}

function combineTransform(existing, next) {
  const a = String(existing || "").trim();
  const b = String(next || "").trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

function applyScaleTransform(el, scaleFactor, mode) {
  const s = Number(scaleFactor);
  if (!Number.isFinite(s) || s === 1) return;

  let transform = "";
  if (mode === "center") {
    let bb = null;
    try { bb = el.getBBox(); } catch {}
    if (bb && Number.isFinite(bb.width) && Number.isFinite(bb.height)) {
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      transform = `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;
    }
  }

  if (!transform) transform = `scale(${s})`;
  const existing = el.getAttribute("transform");
  const combined = combineTransform(existing, transform);
  if (combined) el.setAttribute("transform", combined);
}

function getSvgBounds(svgEl) {
  const vb = svgEl?.viewBox?.baseVal;
  let x = 0;
  let y = 0;
  let w = 0;
  let h = 0;
  if (vb && Number.isFinite(vb.width) && vb.width > 0 && Number.isFinite(vb.height) && vb.height > 0) {
    x = vb.x;
    y = vb.y;
    w = vb.width;
    h = vb.height;
  } else {
    const wAttr = parseNumberLike(svgEl?.getAttribute?.("width"), NaN);
    const hAttr = parseNumberLike(svgEl?.getAttribute?.("height"), NaN);
    if (Number.isFinite(wAttr) && Number.isFinite(hAttr)) {
      w = wAttr;
      h = hAttr;
    } else {
      const rect = svgEl?.getBoundingClientRect?.();
      w = Number.isFinite(rect?.width) ? rect.width : 1000;
      h = Number.isFinite(rect?.height) ? rect.height : 1000;
    }
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;
  return { x, y, w, h, cx, cy, r };
}

function parseRectFunctionResult(value) {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 2) {
    return { x: Number(value[0]), y: Number(value[1]) };
  }
  if (typeof value === "object") {
    return {
      x: Number(value.x),
      y: Number(value.y),
      angle: Number(value.angle),
      width: Number(value.width),
      height: Number(value.height),
      rx: Number(value.rx),
      ry: Number(value.ry),
      fill: value.fill,
      stroke: value.stroke,
      strokeWidth: Number(value.strokeWidth),
      opacity: Number(value.opacity),
    };
  }
  return null;
}

function makeRectFunction(code) {
  const src = String(code || "").trim();
  if (!src) return null;
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${src});`)();
  return typeof fn === "function" ? fn : null;
}

function angleFromSamples(samples, idx, step) {
  const s = Math.max(1, Math.trunc(step) || 1);
  const a = samples[idx];
  if (!a) return 0;
  let j = idx + s;
  if (j >= samples.length) j = idx - s;
  const b = samples[j];
  if (!b) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export function registerEffectsTab() {
  registerTab("effects", ({ mountEl, state, xfRuntime, onStateChange }) =>
    buildEffectsPanel({ mountEl, state, xfRuntime, onStateChange })
  );
}

export function buildEffectsPanel({ mountEl, state, xfRuntime, onStateChange }) {
  ensureEffectsState(state);
  const ui = state.__effects.ui;
  const markDirty = () => onStateChange?.();

  const root = el("div", { className: "fx-panel" });

  const status = el("div", { className: "fx-msg", textContent: "" });
  const eqStatus = el("div", { className: "fx-msg", textContent: "" });

  const row = (label, node, help) => {
    const wrap = el("div", { className: "vr-row" });
    wrap.appendChild(el("div", { className: "vr-label", textContent: label }));
    if (help) wrap.appendChild(el("div", { className: "vr-help", textContent: help }));
    wrap.appendChild(el("div", { className: "vr-input" }, [node]));
    return wrap;
  };

  const group = (title, nodes) => {
    const storedOpen = ui.groupsOpen?.[title];
    const isOpen = typeof storedOpen === "boolean" ? storedOpen : false;
    const wrap = el("details", { className: "vr-paramGroup", open: isOpen });
    wrap.appendChild(el("summary", { className: "vr-paramGroupTitle", textContent: title }));
    wrap.appendChild(el("div", { className: "vr-paramGroupBody" }, nodes));
    wrap.addEventListener("toggle", () => {
      ui.groupsOpen[title] = wrap.open;
      markDirty();
    });
    return wrap;
  };

  const effectSel = el("select");
  EFFECT_TYPES.forEach((t) => {
    const label = t === "splineLines" ? "spline lines" : t;
    effectSel.appendChild(el("option", { value: t, textContent: label }));
  });
  effectSel.value = ui.effectType || "scale";
  effectSel.onchange = () => {
    ui.effectType = effectSel.value;
    markDirty();
    refresh();
  };

  const buildElementSelect = () => {
    const sel = el("select");
    SHAPE_TYPES.forEach((t) => sel.appendChild(el("option", { value: t, textContent: t })));
    sel.value = ui.elementType || "circle";
    return sel;
  };
  const elementSelScale = buildElementSelect();
  const elementSelPaint = buildElementSelect();
  elementSelScale.onchange = () => {
    ui.elementType = elementSelScale.value;
    elementSelPaint.value = elementSelScale.value;
    markDirty();
  };
  elementSelPaint.onchange = () => {
    ui.elementType = elementSelPaint.value;
    elementSelScale.value = elementSelPaint.value;
    markDirty();
  };

  const selectorScaleInput = el("input", {
    type: "text",
    value: ui.selector || "",
    placeholder: 'CSS selector override (blank = use element type)'
  });
  selectorScaleInput.oninput = () => {
    if (ui.effectType === "scale" || ui.effectType === "paint") {
      ui.selector = selectorScaleInput.value;
      markDirty();
    }
  };
  const selectorPaintInput = el("input", {
    type: "text",
    value: ui.selector || "",
    placeholder: 'CSS selector override (blank = use element type)'
  });
  selectorPaintInput.oninput = () => {
    if (ui.effectType === "paint") {
      ui.selector = selectorPaintInput.value;
      markDirty();
    }
  };
  const selectorConvertInput = el("input", {
    type: "text",
    value: ui.selector || "",
    placeholder: 'CSS selector override (blank = use "from shape")'
  });
  selectorConvertInput.oninput = () => {
    if (ui.effectType === "convert") {
      ui.selector = selectorConvertInput.value;
      markDirty();
    }
  };
  const selectorSplineInput = el("input", {
    type: "text",
    value: ui.splineSelector || "",
    placeholder: 'CSS selector override (blank = use source shape)'
  });
  selectorSplineInput.oninput = () => {
    ui.splineSelector = selectorSplineInput.value;
    markDirty();
  };

  const minInput = el("input", { type: "number", step: "0.01", value: String(ui.rangeMin ?? 0.5) });
  const maxInput = el("input", { type: "number", step: "0.01", value: String(ui.rangeMax ?? 1.5) });
  const countInput = el("input", { type: "number", step: "1", min: "1", value: String(ui.count ?? 10) });
  minInput.oninput = () => {
    ui.rangeMin = clampNum(minInput.value, ui.rangeMin);
    markDirty();
  };
  maxInput.oninput = () => {
    ui.rangeMax = clampNum(maxInput.value, ui.rangeMax);
    markDirty();
  };
  countInput.oninput = () => {
    ui.count = Math.max(1, Math.trunc(clampNum(countInput.value, ui.count)));
    markDirty();
  };

  const spacingSel = el("select");
  ["linear", "easeInOut"].forEach((t) => spacingSel.appendChild(el("option", { value: t, textContent: t })));
  spacingSel.value = ui.spacing || "linear";
  spacingSel.onchange = () => {
    ui.spacing = spacingSel.value;
    markDirty();
  };

  const opacityMode = el("select");
  ["auto", "none", "fixed", "ramp"].forEach((t) => opacityMode.appendChild(el("option", { value: t, textContent: t })));
  opacityMode.value = ui.opacityMode || "auto";
  opacityMode.onchange = () => {
    ui.opacityMode = opacityMode.value;
    markDirty();
  };

  const opacityFixed = el("input", { type: "number", step: "0.01", min: "0", max: "1", value: String(ui.opacityFixed ?? 1) });
  const opacityMin = el("input", { type: "number", step: "0.01", min: "0", max: "1", value: String(ui.opacityMin ?? 0.25) });
  const opacityMax = el("input", { type: "number", step: "0.01", min: "0", max: "1", value: String(ui.opacityMax ?? 1) });
  opacityFixed.oninput = () => {
    ui.opacityFixed = clampNum(opacityFixed.value, ui.opacityFixed);
    markDirty();
  };
  opacityMin.oninput = () => {
    ui.opacityMin = clampNum(opacityMin.value, ui.opacityMin);
    markDirty();
  };
  opacityMax.oninput = () => {
    ui.opacityMax = clampNum(opacityMax.value, ui.opacityMax);
    markDirty();
  };

  const eqInput = el("input", {
    type: "text",
    value: ui.equation || "",
    placeholder: "foreach:opacity *1.2  OR  sum(forward):opacity +0.1",
  });

  const eqList = el("datalist", { id: `fx-eq-keys-${Math.random().toString(16).slice(2)}` });
  ATTR_KEYWORDS.forEach((k) => eqList.appendChild(el("option", { value: k.key })));
  eqInput.setAttribute("list", eqList.id);

  const debugCb = el("input", { type: "checkbox" });
  debugCb.checked = !!ui.debug;
  debugCb.onchange = () => {
    ui.debug = !!debugCb.checked;
    markDirty();
  };
  const autoRunCb = el("input", { type: "checkbox" });
  autoRunCb.checked = !!ui.autoRun;
  autoRunCb.onchange = () => {
    ui.autoRun = !!autoRunCb.checked;
    markDirty();
  };

  const convertFrom = el("select");
  SHAPE_TYPES.forEach((t) => convertFrom.appendChild(el("option", { value: t, textContent: t })));
  convertFrom.value = ui.convertFrom || "path";
  convertFrom.onchange = () => {
    ui.convertFrom = convertFrom.value;
    markDirty();
  };

  const convertTo = el("select");
  SHAPE_TYPES.forEach((t) => convertTo.appendChild(el("option", { value: t, textContent: t })));
  convertTo.value = ui.convertTo || "circle";
  convertTo.onchange = () => {
    ui.convertTo = convertTo.value;
    markDirty();
  };

  const samplePoints = el("input", {
    type: "number",
    min: "3",
    step: "1",
    value: String(ui.pathSamplePoints ?? 64),
  });
  samplePoints.oninput = () => {
    ui.pathSamplePoints = Math.max(3, Math.trunc(clampNum(samplePoints.value, ui.pathSamplePoints)));
    markDirty();
  };

  const convertScaleMode = el("select");
  ["none", "center", "origin"].forEach((t) => convertScaleMode.appendChild(el("option", { value: t, textContent: t })));
  convertScaleMode.value = ui.convertScaleMode || "none";
  convertScaleMode.onchange = () => {
    ui.convertScaleMode = convertScaleMode.value;
    markDirty();
  };

  const convertScaleFactor = el("input", {
    type: "number",
    step: "0.01",
    value: String(ui.convertScaleFactor ?? 1),
  });
  convertScaleFactor.oninput = () => {
    ui.convertScaleFactor = clampNum(convertScaleFactor.value, ui.convertScaleFactor);
    markDirty();
  };

  const splineSource = el("select");
  SPLINE_SOURCE_TYPES.forEach((t) => splineSource.appendChild(el("option", { value: t, textContent: t })));
  splineSource.value = ui.splineSource || "all";
  splineSource.onchange = () => {
    ui.splineSource = splineSource.value;
    markDirty();
  };

  const splinePointCount = el("input", {
    type: "number",
    min: "2",
    step: "1",
    value: String(ui.splinePointCount ?? 16),
  });
  splinePointCount.oninput = () => {
    ui.splinePointCount = Math.max(2, Math.trunc(clampNum(splinePointCount.value, ui.splinePointCount)));
    markDirty();
  };

  const splineStepsPerSegment = el("input", {
    type: "number",
    min: "2",
    step: "1",
    value: String(ui.splineStepsPerSegment ?? 18),
  });
  splineStepsPerSegment.oninput = () => {
    ui.splineStepsPerSegment = Math.max(2, Math.trunc(clampNum(splineStepsPerSegment.value, ui.splineStepsPerSegment)));
    markDirty();
  };

  const splineTension = el("input", {
    type: "number",
    min: "0",
    max: "1",
    step: "0.01",
    value: String(ui.splineTension ?? 0.12),
  });
  splineTension.oninput = () => {
    ui.splineTension = clampNum(splineTension.value, ui.splineTension);
    markDirty();
  };

  const splineLineOrientation = el("select");
  ["vertical", "normal", "tangent"].forEach((t) => splineLineOrientation.appendChild(el("option", { value: t, textContent: t })));
  splineLineOrientation.value = ui.splineLineOrientation || "vertical";
  splineLineOrientation.onchange = () => {
    ui.splineLineOrientation = splineLineOrientation.value;
    markDirty();
  };

  const splineLineHeight = el("input", {
    type: "number",
    min: "0",
    step: "0.1",
    value: String(ui.splineLineHeight ?? 18),
  });
  splineLineHeight.oninput = () => {
    ui.splineLineHeight = clampNum(splineLineHeight.value, ui.splineLineHeight);
    markDirty();
  };

  const splineLineScale = el("input", {
    type: "number",
    min: "0",
    step: "0.01",
    value: String(ui.splineLineScale ?? 1),
  });
  splineLineScale.oninput = () => {
    ui.splineLineScale = clampNum(splineLineScale.value, ui.splineLineScale);
    markDirty();
  };

  const splineStrokeWidth = el("input", {
    type: "number",
    min: "0.1",
    step: "0.1",
    value: String(ui.splineStrokeWidth ?? 2),
  });
  splineStrokeWidth.oninput = () => {
    ui.splineStrokeWidth = clampNum(splineStrokeWidth.value, ui.splineStrokeWidth);
    markDirty();
  };

  const splineScaleMode = el("select");
  ["none", "center", "origin"].forEach((t) => splineScaleMode.appendChild(el("option", { value: t, textContent: t })));
  splineScaleMode.value = ui.splineScaleMode || "none";
  splineScaleMode.onchange = () => {
    ui.splineScaleMode = splineScaleMode.value;
    markDirty();
  };

  const splineScaleFactor = el("input", {
    type: "number",
    step: "0.01",
    value: String(ui.splineScaleFactor ?? 1),
  });
  splineScaleFactor.oninput = () => {
    ui.splineScaleFactor = clampNum(splineScaleFactor.value, ui.splineScaleFactor);
    markDirty();
  };

  const paintFill = el("input", { type: "text", value: ui.paintFill || "#ffffff", placeholder: "#ffffff or none" });
  const paintStroke = el("input", { type: "text", value: ui.paintStroke || "#000000", placeholder: "#000000 or none" });
  paintFill.oninput = () => {
    ui.paintFill = paintFill.value;
    markDirty();
  };
  paintStroke.oninput = () => {
    ui.paintStroke = paintStroke.value;
    markDirty();
  };
  const paintList = el("datalist", { id: `fx-paint-${Math.random().toString(16).slice(2)}` });
  ["#000000", "#ffffff", "none"].forEach((v) => paintList.appendChild(el("option", { value: v })));
  paintFill.setAttribute("list", paintList.id);
  paintStroke.setAttribute("list", paintList.id);

  const mergeShapeSel = el("select");
  ["circle", "rect"].forEach((t) => mergeShapeSel.appendChild(el("option", { value: t, textContent: t })));
  mergeShapeSel.value = ui.mergeShape || "circle";
  mergeShapeSel.onchange = () => {
    ui.mergeShape = mergeShapeSel.value;
    markDirty();
  };

  const mergeSelectorInput = el("input", {
    type: "text",
    value: ui.mergeSelector || "",
    placeholder: 'CSS selector override (blank = use merge shape)'
  });
  mergeSelectorInput.oninput = () => {
    ui.mergeSelector = mergeSelectorInput.value;
    markDirty();
  };
  const mergeRuleInput = el("textarea", {
    rows: "4",
    value: ui.mergeSelectorRuleText || "",
    placeholder: 'Prop selector JSON (see PROP_OPS_RULES.md)'
  });
  mergeRuleInput.oninput = () => {
    ui.mergeSelectorRuleText = mergeRuleInput.value;
    markDirty();
  };

  const mergeRatioInput = el("input", { type: "number", step: "0.01", value: String(ui.mergeRatio ?? 1.02) });
  const mergePaddingInput = el("input", { type: "number", step: "0.1", value: String(ui.mergePadding ?? 1) });
  const mergeGridStepInput = el("input", { type: "number", step: "1", value: String(ui.mergeGridStep ?? 6) });
  const mergeSmoothInput = el("input", { type: "number", step: "1", min: "0", value: String(ui.mergeSmoothPasses ?? 1) });
  const mergeStrokeInput = el("input", { type: "text", value: ui.mergeStroke || "#000000", placeholder: "#000000" });
  const mergeStrokeWidthInput = el("input", { type: "number", step: "0.1", min: "0", value: String(ui.mergeStrokeWidth ?? 1.5) });
  mergeRatioInput.oninput = () => {
    ui.mergeRatio = clampNum(mergeRatioInput.value, ui.mergeRatio);
    markDirty();
  };
  mergePaddingInput.oninput = () => {
    ui.mergePadding = clampNum(mergePaddingInput.value, ui.mergePadding);
    markDirty();
  };
  mergeGridStepInput.oninput = () => {
    ui.mergeGridStep = clampNum(mergeGridStepInput.value, ui.mergeGridStep);
    markDirty();
  };
  mergeSmoothInput.oninput = () => {
    ui.mergeSmoothPasses = Math.max(0, Math.trunc(clampNum(mergeSmoothInput.value, ui.mergeSmoothPasses)));
    markDirty();
  };
  mergeStrokeInput.oninput = () => {
    ui.mergeStroke = mergeStrokeInput.value;
    markDirty();
  };
  mergeStrokeWidthInput.oninput = () => {
    ui.mergeStrokeWidth = clampNum(mergeStrokeWidthInput.value, ui.mergeStrokeWidth);
    markDirty();
  };

  const keywordsHelp = el("div", { className: "fx-keywords" },
    ATTR_KEYWORDS.map((k) =>
      el("div", { className: "fx-keyword" }, [
        el("span", { className: "fx-key", textContent: k.key }),
        el("span", { className: "fx-desc", textContent: ` - ${k.desc}` }),
      ])
    )
  );

  const keywordGroup = group("Keyword Cheatsheet", [
    el("div", { className: "vr-help", textContent: "Numeric SVG attributes you can target in equations." }),
    keywordsHelp,
  ]);

  const runBtn = el("button", { type: "button", textContent: "apply effect" });
  runBtn.onclick = () => {
    ui.effectType = effectSel.value;
    ui.elementType = elementSelScale.value;
    if (ui.effectType === "scale") ui.selector = selectorScaleInput.value;
    else if (ui.effectType === "paint") ui.selector = selectorPaintInput.value;
    else if (ui.effectType === "convert") ui.selector = selectorConvertInput.value;
    else if (ui.effectType === "splineLines") ui.splineSelector = selectorSplineInput.value;
    ui.rangeMin = clampNum(minInput.value, ui.rangeMin);
    ui.rangeMax = clampNum(maxInput.value, ui.rangeMax);
    ui.count = Math.max(1, Math.trunc(clampNum(countInput.value, ui.count)));
    ui.spacing = spacingSel.value;
    ui.opacityMode = opacityMode.value;
    ui.opacityFixed = clampNum(opacityFixed.value, ui.opacityFixed);
    ui.opacityMin = clampNum(opacityMin.value, ui.opacityMin);
    ui.opacityMax = clampNum(opacityMax.value, ui.opacityMax);
    ui.equation = eqInput.value;
    ui.debug = !!debugCb.checked;
    ui.convertFrom = convertFrom.value;
    ui.convertTo = convertTo.value;
    ui.pathSamplePoints = Math.max(3, Math.trunc(clampNum(samplePoints.value, ui.pathSamplePoints)));
    ui.convertScaleMode = convertScaleMode.value;
    ui.convertScaleFactor = clampNum(convertScaleFactor.value, ui.convertScaleFactor);
    ui.splineSource = splineSource.value;
    ui.splinePointCount = Math.max(2, Math.trunc(clampNum(splinePointCount.value, ui.splinePointCount)));
    ui.splineStepsPerSegment = Math.max(2, Math.trunc(clampNum(splineStepsPerSegment.value, ui.splineStepsPerSegment)));
    ui.splineTension = clampNum(splineTension.value, ui.splineTension);
    ui.splineLineOrientation = splineLineOrientation.value;
    ui.splineLineHeight = clampNum(splineLineHeight.value, ui.splineLineHeight);
    ui.splineLineScale = clampNum(splineLineScale.value, ui.splineLineScale);
    ui.splineStrokeWidth = clampNum(splineStrokeWidth.value, ui.splineStrokeWidth);
    ui.splineScaleMode = splineScaleMode.value;
    ui.splineScaleFactor = clampNum(splineScaleFactor.value, ui.splineScaleFactor);
    ui.paintFill = paintFill.value;
    ui.paintStroke = paintStroke.value;
    ui.mergeShape = mergeShapeSel.value;
    ui.mergeSelector = mergeSelectorInput.value;
    ui.mergeSelectorRuleText = mergeRuleInput.value;
    ui.mergeRatio = clampNum(mergeRatioInput.value, ui.mergeRatio);
    ui.mergePadding = clampNum(mergePaddingInput.value, ui.mergePadding);
    ui.mergeGridStep = clampNum(mergeGridStepInput.value, ui.mergeGridStep);
    ui.mergeSmoothPasses = Math.max(0, Math.trunc(clampNum(mergeSmoothInput.value, ui.mergeSmoothPasses)));
    ui.mergeStroke = mergeStrokeInput.value;
    ui.mergeStrokeWidth = clampNum(mergeStrokeWidthInput.value, ui.mergeStrokeWidth);
    ui.fnPreset = fnPresetSel.value;
    ui.fnCode = fnCode.value;
    ui.fnSampleCount = Math.max(2, Math.trunc(clampNum(fnSampleCount.value, ui.fnSampleCount)));
    ui.fnSampleEvery = Math.max(1, Math.trunc(clampNum(fnSampleEvery.value, ui.fnSampleEvery)));
    ui.fnSampleOffset = Math.max(0, Math.trunc(clampNum(fnSampleOffset.value, ui.fnSampleOffset)));
    ui.fnRectLimit = Math.max(0, Math.trunc(clampNum(fnRectLimit.value, ui.fnRectLimit)));
    ui.fnOrientMode = fnOrientMode.value;
    ui.fnTangentStep = Math.max(1, Math.trunc(clampNum(fnTangentStep.value, ui.fnTangentStep)));
    ui.fnFixedAngle = clampNum(fnFixedAngle.value, ui.fnFixedAngle);
    ui.fnRectWidth = clampNum(fnRectWidth.value, ui.fnRectWidth);
    ui.fnRectHeight = clampNum(fnRectHeight.value, ui.fnRectHeight);
    ui.fnRectRx = clampNum(fnRectRx.value, ui.fnRectRx);
    ui.fnRectRy = clampNum(fnRectRy.value, ui.fnRectRy);
    ui.fnRectFill = fnRectFill.value;
    ui.fnRectStroke = fnRectStroke.value;
    ui.fnRectStrokeWidth = clampNum(fnRectStrokeWidth.value, ui.fnRectStrokeWidth);
    ui.fnRectOpacity = clampNum(fnRectOpacity.value, ui.fnRectOpacity);
    markDirty();

    status.classList.remove("error");

    runEffectsFromUI({ mountEl, state, xfRuntime, statusEl: status });
  };

  eqInput.oninput = () => {
    ui.equation = eqInput.value;
    markDirty();
    const parsed = parseEquation(eqInput.value);
    if (parsed.ok) {
      eqStatus.classList.remove("error");
      if (parsed.empty) {
        eqStatus.textContent = "Equation optional. Leave blank to skip.";
      } else if (ATTR_KEY_SET.has(parsed.rule.prop)) {
        eqStatus.textContent = `OK: ${parsed.rule.mode} ${parsed.rule.direction}, ${parsed.rule.prop} ${parsed.rule.op} ${parsed.rule.value}`;
      } else {
        eqStatus.textContent = `OK: ${parsed.rule.prop} is custom (not in cheatsheet).`;
      }
    } else {
      eqStatus.textContent = parsed.error;
      eqStatus.classList.add("error");
    }
  };
  eqInput.oninput();

  const scaleBlock = el("div", { className: "fx-block" }, [
    row("element type", elementSelScale, "Choose circle, rect, polygon, or path."),
    row("selector", selectorScaleInput, "Optional CSS selector override."),
    row("scale min", minInput, "Minimum scale factor."),
    row("scale max", maxInput, "Maximum scale factor."),
    row("count", countInput, "Number of scaled copies."),
    row("spacing", spacingSel, "Scale spacing: linear or smooth."),
    row("opacity mode", opacityMode, "Auto ramps opacity unless disabled."),
    row("opacity fixed", opacityFixed, "Used when opacity mode = fixed."),
    row("opacity min", opacityMin, "Used when opacity mode = ramp."),
    row("opacity max", opacityMax, "Used when opacity mode = ramp."),
    row("equation", el("div", {}, [eqInput, eqList]), "Applies to each scaled clone."),
    eqStatus,
  ]);

  const convertBlock = el("div", { className: "fx-block" }, [
    row("from shape", convertFrom, "Input SVG element type."),
    row("to shape", convertTo, "Output SVG element type."),
    row("selector", selectorConvertInput, "Optional CSS selector override."),
    row("path samples", samplePoints, "Used when converting path -> polygon."),
    row("scale mode", convertScaleMode, "Scale converted output around center or origin."),
    row("scale factor", convertScaleFactor, "Scale applied to converted output."),
  ]);

  const splineBlock = el("div", { className: "fx-block" }, [
    row("source shape", splineSource, "Choose one SVG shape type or scan all supported shapes."),
    row("selector", selectorSplineInput, "Optional CSS selector override."),
    row("control points", splinePointCount, "How many shape points become spline control points."),
    row("steps per segment", splineStepsPerSegment, "Spline sample density; higher = more output lines."),
    row("tension", splineTension, "Catmull-Rom tension used for the spline interpolation."),
    row("line orientation", splineLineOrientation, "Vertical, spline normal, or spline tangent."),
    row("line height", splineLineHeight, "Base height for each generated line."),
    row("line scale", splineLineScale, "Multiplies the line height."),
    row("stroke width", splineStrokeWidth, "Stroke width for generated lines."),
    row("scale mode", splineScaleMode, "Scale the generated spline-line group around center or origin."),
    row("scale factor", splineScaleFactor, "Scale applied after generating the spline lines."),
  ]);

  const fnPresetSel = el("select");
  RECT_FUNCTION_PRESETS.forEach((preset) => {
    fnPresetSel.appendChild(el("option", { value: preset.id, textContent: preset.label }));
  });
  fnPresetSel.value = ui.fnPreset || RECT_FUNCTION_PRESETS[0]?.id || "circle";
  fnPresetSel.onchange = () => {
    ui.fnPreset = fnPresetSel.value;
    const preset = RECT_FUNCTION_PRESETS.find((p) => p.id === fnPresetSel.value);
    if (preset) {
      fnCode.value = preset.code;
      ui.fnCode = preset.code;
    }
    markDirty();
  };

  const fnCode = el("textarea", {
    rows: "6",
    value: ui.fnCode || RECT_FUNCTION_PRESETS[0]?.code || "",
    placeholder: "({ t, i, count, bounds }) => ({ x, y, angle, width, height, ... })",
  });
  fnCode.oninput = () => {
    ui.fnCode = fnCode.value;
    markDirty();
  };

  const fnSampleCount = el("input", { type: "number", min: "2", step: "1", value: String(ui.fnSampleCount ?? 80) });
  const fnSampleEvery = el("input", { type: "number", min: "1", step: "1", value: String(ui.fnSampleEvery ?? 1) });
  const fnSampleOffset = el("input", { type: "number", min: "0", step: "1", value: String(ui.fnSampleOffset ?? 0) });
  const fnRectLimit = el("input", { type: "number", min: "0", step: "1", value: String(ui.fnRectLimit ?? 0) });
  fnSampleCount.oninput = () => {
    ui.fnSampleCount = Math.max(2, Math.trunc(clampNum(fnSampleCount.value, ui.fnSampleCount)));
    markDirty();
  };
  fnSampleEvery.oninput = () => {
    ui.fnSampleEvery = Math.max(1, Math.trunc(clampNum(fnSampleEvery.value, ui.fnSampleEvery)));
    markDirty();
  };
  fnSampleOffset.oninput = () => {
    ui.fnSampleOffset = Math.max(0, Math.trunc(clampNum(fnSampleOffset.value, ui.fnSampleOffset)));
    markDirty();
  };
  fnRectLimit.oninput = () => {
    ui.fnRectLimit = Math.max(0, Math.trunc(clampNum(fnRectLimit.value, ui.fnRectLimit)));
    markDirty();
  };

  const fnOrientMode = el("select");
  ["tangent", "fixed", "function"].forEach((t) => fnOrientMode.appendChild(el("option", { value: t, textContent: t })));
  fnOrientMode.value = ui.fnOrientMode || "tangent";
  fnOrientMode.onchange = () => {
    ui.fnOrientMode = fnOrientMode.value;
    markDirty();
  };

  const fnTangentStep = el("input", { type: "number", min: "1", step: "1", value: String(ui.fnTangentStep ?? 1) });
  const fnFixedAngle = el("input", { type: "number", step: "1", value: String(ui.fnFixedAngle ?? 0) });
  fnTangentStep.oninput = () => {
    ui.fnTangentStep = Math.max(1, Math.trunc(clampNum(fnTangentStep.value, ui.fnTangentStep)));
    markDirty();
  };
  fnFixedAngle.oninput = () => {
    ui.fnFixedAngle = clampNum(fnFixedAngle.value, ui.fnFixedAngle);
    markDirty();
  };

  const fnRectWidth = el("input", { type: "number", step: "1", value: String(ui.fnRectWidth ?? 18) });
  const fnRectHeight = el("input", { type: "number", step: "1", value: String(ui.fnRectHeight ?? 10) });
  const fnRectRx = el("input", { type: "number", step: "0.1", value: String(ui.fnRectRx ?? 0) });
  const fnRectRy = el("input", { type: "number", step: "0.1", value: String(ui.fnRectRy ?? 0) });
  const fnRectFill = el("input", { type: "text", value: ui.fnRectFill || "none", placeholder: "none or #ffffff" });
  const fnRectStroke = el("input", { type: "text", value: ui.fnRectStroke || "#000000", placeholder: "#000000 or none" });
  const fnRectStrokeWidth = el("input", { type: "number", step: "0.1", value: String(ui.fnRectStrokeWidth ?? 1) });
  const fnRectOpacity = el("input", { type: "number", step: "0.05", min: "0", max: "1", value: String(ui.fnRectOpacity ?? 1) });
  fnRectWidth.oninput = () => {
    ui.fnRectWidth = clampNum(fnRectWidth.value, ui.fnRectWidth);
    markDirty();
  };
  fnRectHeight.oninput = () => {
    ui.fnRectHeight = clampNum(fnRectHeight.value, ui.fnRectHeight);
    markDirty();
  };
  fnRectRx.oninput = () => {
    ui.fnRectRx = clampNum(fnRectRx.value, ui.fnRectRx);
    markDirty();
  };
  fnRectRy.oninput = () => {
    ui.fnRectRy = clampNum(fnRectRy.value, ui.fnRectRy);
    markDirty();
  };
  fnRectFill.oninput = () => {
    ui.fnRectFill = fnRectFill.value;
    markDirty();
  };
  fnRectStroke.oninput = () => {
    ui.fnRectStroke = fnRectStroke.value;
    markDirty();
  };
  fnRectStrokeWidth.oninput = () => {
    ui.fnRectStrokeWidth = clampNum(fnRectStrokeWidth.value, ui.fnRectStrokeWidth);
    markDirty();
  };
  fnRectOpacity.oninput = () => {
    ui.fnRectOpacity = clampNum(fnRectOpacity.value, ui.fnRectOpacity);
    markDirty();
  };

  const functionBlock = el("div", { className: "fx-block" }, [
    row("preset", fnPresetSel, "Choose a built-in function template."),
    row("function", fnCode, "Function returns {x, y, angle?, width?, height?, rx?, ry?, fill?, stroke?, strokeWidth?, opacity?}."),
    row("sample count", fnSampleCount, "Total samples along t = 0..1."),
    row("sample every", fnSampleEvery, "Place a rect every N samples."),
    row("sample offset", fnSampleOffset, "Skip the first N samples."),
    row("max rects", fnRectLimit, "0 = no limit."),
    row("orientation", fnOrientMode, "tangent uses neighboring samples."),
    row("tangent step", fnTangentStep, "Sample spacing for tangent angle."),
    row("fixed angle", fnFixedAngle, "Used when orientation = fixed."),
    row("rect width", fnRectWidth, "Default width if not from function."),
    row("rect height", fnRectHeight, "Default height if not from function."),
    row("rect rx", fnRectRx, "Default corner radius x."),
    row("rect ry", fnRectRy, "Default corner radius y."),
    row("fill", fnRectFill, "Default fill."),
    row("stroke", fnRectStroke, "Default stroke."),
    row("stroke width", fnRectStrokeWidth, "Default stroke width."),
    row("opacity", fnRectOpacity, "Default opacity."),
  ]);

  const paintBlock = el("div", { className: "fx-block" }, [
    row("element type", elementSelPaint, "Choose circle, rect, polygon, or path."),
    row("selector", selectorPaintInput, "Optional CSS selector override."),
    row("fill", el("div", {}, [paintFill, paintList]), "Fill color or 'none'."),
    row("stroke", el("div", {}, [paintStroke]), "Stroke color or 'none'."),
  ]);

  const mergeBlock = el("div", { className: "fx-block" }, [
    row("shape", mergeShapeSel, "Choose circle or rect for merging."),
    row("selector", mergeSelectorInput, "Optional CSS selector override."),
    row("selector rule", mergeRuleInput, "Prop-ops selector JSON to match elements."),
    row("merge ratio", mergeRatioInput, "Connectivity threshold for circles."),
    row("merge padding", mergePaddingInput, "Grow shapes slightly before merging."),
    row("grid step", mergeGridStepInput, "Contour sampling step (px)."),
    row("smooth passes", mergeSmoothInput, "Chaikin smoothing iterations."),
    row("stroke", mergeStrokeInput, "Stroke color for merged paths."),
    row("stroke width", mergeStrokeWidthInput, "Stroke width for merged paths."),
  ]);

  const topGroup = group("Effect", [
    row("type", effectSel, "Choose scale, convert, spline lines, paint, merge, or function rects."),
  ]);

  const scaleGroup = group("Scale Effect", [scaleBlock]);
  const convertGroup = group("Convert Effect", [convertBlock]);
  const splineGroup = group("Spline Lines", [splineBlock]);
  const functionGroup = group("Function Rects", [functionBlock]);
  const paintGroup = group("Paint Effect", [paintBlock]);
  const mergeGroup = group("Merge Effect", [mergeBlock]);
  const applyGroup = group("Apply", [
    row("debug", debugCb, "Enable console logging in effect helpers."),
    row("auto run", autoRunCb, "Run effect after every render call."),
    el("div", { className: "vr-input" }, [runBtn]),
    status,
  ]);

  const refresh = () => {
    const isScale = ui.effectType === "scale";
    const isConvert = ui.effectType === "convert";
    const isSplineLines = ui.effectType === "splineLines";
    const isFunctionRects = ui.effectType === "functionRects";
    const isPaint = ui.effectType === "paint";
    const isMerge = ui.effectType === "merge";
    scaleGroup.style.display = isScale ? "" : "none";
    convertGroup.style.display = isConvert ? "" : "none";
    splineGroup.style.display = isSplineLines ? "" : "none";
    functionGroup.style.display = isFunctionRects ? "" : "none";
    paintGroup.style.display = isPaint ? "" : "none";
    mergeGroup.style.display = isMerge ? "" : "none";
    const selVal = String(ui.selector || "");
    selectorScaleInput.value = selVal;
    selectorPaintInput.value = selVal;
    selectorConvertInput.value = selVal;
    selectorSplineInput.value = String(ui.splineSelector || "");
    mergeSelectorInput.value = String(ui.mergeSelector || "");
    mergeRuleInput.value = String(ui.mergeSelectorRuleText || "");
    mergeShapeSel.value = ui.mergeShape || "circle";
    autoRunCb.checked = !!ui.autoRun;
    elementSelScale.value = ui.elementType || "circle";
    elementSelPaint.value = ui.elementType || "circle";
    splineSource.value = ui.splineSource || "all";
    splinePointCount.value = String(ui.splinePointCount ?? 16);
    splineStepsPerSegment.value = String(ui.splineStepsPerSegment ?? 18);
    splineTension.value = String(ui.splineTension ?? 0.12);
    splineLineOrientation.value = ui.splineLineOrientation || "vertical";
    splineLineHeight.value = String(ui.splineLineHeight ?? 18);
    splineLineScale.value = String(ui.splineLineScale ?? 1);
    splineStrokeWidth.value = String(ui.splineStrokeWidth ?? 2);
    splineScaleMode.value = ui.splineScaleMode || "none";
    splineScaleFactor.value = String(ui.splineScaleFactor ?? 1);
    fnPresetSel.value = ui.fnPreset || RECT_FUNCTION_PRESETS[0]?.id || "circle";
    fnCode.value = String(ui.fnCode || "");
    fnSampleCount.value = String(ui.fnSampleCount ?? 80);
    fnSampleEvery.value = String(ui.fnSampleEvery ?? 1);
    fnSampleOffset.value = String(ui.fnSampleOffset ?? 0);
    fnRectLimit.value = String(ui.fnRectLimit ?? 0);
    fnOrientMode.value = ui.fnOrientMode || "tangent";
    fnTangentStep.value = String(ui.fnTangentStep ?? 1);
    fnFixedAngle.value = String(ui.fnFixedAngle ?? 0);
    fnRectWidth.value = String(ui.fnRectWidth ?? 18);
    fnRectHeight.value = String(ui.fnRectHeight ?? 10);
    fnRectRx.value = String(ui.fnRectRx ?? 0);
    fnRectRy.value = String(ui.fnRectRy ?? 0);
    fnRectFill.value = ui.fnRectFill || "none";
    fnRectStroke.value = ui.fnRectStroke || "#000000";
    fnRectStrokeWidth.value = String(ui.fnRectStrokeWidth ?? 1);
    fnRectOpacity.value = String(ui.fnRectOpacity ?? 1);
  };

  root.appendChild(topGroup);
  root.appendChild(scaleGroup);
  root.appendChild(convertGroup);
  root.appendChild(splineGroup);
  root.appendChild(functionGroup);
  root.appendChild(paintGroup);
  root.appendChild(mergeGroup);
  root.appendChild(applyGroup);
  root.appendChild(keywordGroup);
  refresh();
  return root;
}

function getSvgContexts(mountEl) {
  const svgs = Array.from(mountEl?.querySelectorAll?.("svg") || []);
  return svgs.map((svg) => {
    const rootEl = svg;
    const create = (tag) => document.createElementNS(svg.namespaceURI, String(tag));
    return { svg, rootEl, create };
  });
}

export function runEffectsFromUI({ mountEl, state, xfRuntime, statusEl } = {}) {
  ensureEffectsState(state);
  const ui = state.__effects.ui;
  const contexts = getSvgContexts(mountEl);
  if (!contexts.length) {
    if (statusEl) {
      statusEl.textContent = "No SVG found in this visual.";
      statusEl.classList.add("error");
    }
    return { ok: false };
  }

  const runId = `fx-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (statusEl) statusEl.classList.remove("error");

  if (ui.effectType === "scale") {
    const parsedEq = parseEquation(ui.equation);
    if (!parsedEq.ok) {
      if (statusEl) {
        statusEl.textContent = parsedEq.error;
        statusEl.classList.add("error");
      }
      return { ok: false };
    }

    const range = [ui.rangeMin, ui.rangeMax, ui.count];
    const selector = String(ui.selector || "").trim() || ui.elementType;

    let opacity = null;
    if (ui.opacityMode === "none") opacity = false;
    else if (ui.opacityMode === "fixed") opacity = ui.opacityFixed;
    else if (ui.opacityMode === "ramp") opacity = [ui.opacityMin, ui.opacityMax];

    let totalReplaced = 0;
    let totalClones = 0;
    const opts = { selector, range, spacing: ui.spacing, opacity, runId, debug: ui.debug };
    for (const { rootEl, create } of contexts) {
      let stats = null;
      const ctxObj = { root: rootEl, create };

      if (ui.elementType === "circle") stats = scaleCirclesInSubtree(ctxObj, opts);
      else if (ui.elementType === "rect") stats = scaleRectsInSubtree(ctxObj, opts);
      else if (ui.elementType === "polygon") stats = scalePolygonsInSubtree(ctxObj, opts);
      else stats = scalePathsInSubtree(ctxObj, opts);

      totalReplaced += stats?.replaced ?? 0;
      totalClones += stats?.clonesMade ?? 0;

      if (parsedEq.rule) {
        const groups = Array.from(rootEl.querySelectorAll(`g[data-scale-run="${runId}"]`));
        for (const g of groups) {
          const clones = Array.from(g.querySelectorAll('[data-scale-clone="1"]'));
          applyEquationToList(clones, parsedEq.rule);
        }
      }
    }

    if (statusEl) {
      statusEl.textContent = `scale applied: ${totalReplaced} groups, ${totalClones} clones.`;
    }
  } else if (ui.effectType === "convert") {
    let totalConverted = 0;
    let totalSkipped = 0;
    for (const { rootEl, create } of contexts) {
      const stats = convertShapesInSubtree(
        { root: rootEl, create },
        {
          fromTag: ui.convertFrom,
          toTag: ui.convertTo,
          selector: String(ui.selector || "").trim() || null,
          pathSamplePoints: ui.pathSamplePoints,
          runId,
          debug: ui.debug,
        }
      );

      totalConverted += stats?.converted ?? 0;
      totalSkipped += stats?.skipped ?? 0;

      if (ui.convertScaleMode !== "none" && ui.convertScaleFactor !== 1) {
        const converted = Array.from(rootEl.querySelectorAll(`[data-convert-run="${runId}"]`));
        for (const el of converted) {
          applyScaleTransform(el, ui.convertScaleFactor, ui.convertScaleMode);
        }
      }
    }

    if (statusEl) {
      statusEl.textContent = `convert applied: ${totalConverted} converted, ${totalSkipped} skipped.`;
    }
  } else if (ui.effectType === "splineLines") {
    let totalConverted = 0;
    let totalSkipped = 0;
    let totalLines = 0;
    for (const { rootEl, create } of contexts) {
      const stats = applySplineLinesInSubtree(
        { root: rootEl, create },
        {
          sourceTag: ui.splineSource,
          selector: String(ui.splineSelector || "").trim() || null,
          pointCount: ui.splinePointCount,
          stepsPerSegment: ui.splineStepsPerSegment,
          tension: ui.splineTension,
          lineOrientation: ui.splineLineOrientation,
          lineHeight: ui.splineLineHeight,
          lineScale: ui.splineLineScale,
          strokeWidth: ui.splineStrokeWidth,
          runId,
          debug: ui.debug,
        }
      );

      totalConverted += stats?.converted ?? 0;
      totalSkipped += stats?.skipped ?? 0;
      totalLines += stats?.linesCreated ?? 0;

      if (ui.splineScaleMode !== "none" && ui.splineScaleFactor !== 1) {
        const converted = Array.from(rootEl.querySelectorAll(`[data-spline-lines-run="${runId}"][data-spline-lines-group="1"]`));
        for (const el of converted) {
          applyScaleTransform(el, ui.splineScaleFactor, ui.splineScaleMode);
        }
      }
    }

    if (statusEl) {
      statusEl.textContent = `spline lines applied: ${totalConverted} shapes, ${totalLines} lines, ${totalSkipped} skipped.`;
    }
  } else if (ui.effectType === "functionRects") {
    const preset = RECT_FUNCTION_PRESETS.find((p) => p.id === ui.fnPreset);
    const code = String(ui.fnCode || "").trim() || preset?.code || "";
    const fn = makeRectFunction(code);
    if (!fn) {
      if (statusEl) {
        statusEl.textContent = "Function missing or invalid. Provide a function that returns {x, y}.";
        statusEl.classList.add("error");
      }
      return { ok: false };
    }

    const sampleCount = Math.max(2, Math.trunc(ui.fnSampleCount || 2));
    const sampleEvery = Math.max(1, Math.trunc(ui.fnSampleEvery || 1));
    const sampleOffset = Math.max(0, Math.trunc(ui.fnSampleOffset || 0));
    const rectLimit = Math.max(0, Math.trunc(ui.fnRectLimit || 0));
    const orientMode = ui.fnOrientMode || "tangent";
    const tangentStep = Math.max(1, Math.trunc(ui.fnTangentStep || 1));
    const fixedAngle = Number(ui.fnFixedAngle) || 0;

    let totalRects = 0;

    for (const { svg, rootEl, create } of contexts) {
      const bounds = getSvgBounds(svg);
      const samples = [];
      for (let i = 0; i < sampleCount; i += 1) {
        const t = sampleCount > 1 ? i / (sampleCount - 1) : 0;
        let result = null;
        try {
          result = fn({ t, i, count: sampleCount, bounds });
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = `Function error: ${err?.message || err}`;
            statusEl.classList.add("error");
          }
          return { ok: false };
        }
        const parsed = parseRectFunctionResult(result);
        if (!parsed || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
          samples.push(null);
        } else {
          samples.push(parsed);
        }
      }

      const existing = Array.from(rootEl.querySelectorAll('g[data-fx-rects="1"]'));
      for (const node of existing) node.remove();

      const group = create("g");
      group.setAttribute("data-fx-rects", "1");
      group.setAttribute("data-fx-run", runId);

      let made = 0;
      for (let i = sampleOffset; i < sampleCount; i += sampleEvery) {
        if (rectLimit > 0 && made >= rectLimit) break;
        const sample = samples[i];
        if (!sample) continue;

        const width = Number.isFinite(sample.width) ? sample.width : Number(ui.fnRectWidth) || 0;
        const height = Number.isFinite(sample.height) ? sample.height : Number(ui.fnRectHeight) || 0;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;

        const rect = create("rect");
        const x = sample.x - width / 2;
        const y = sample.y - height / 2;
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(width));
        rect.setAttribute("height", String(height));

        const rx = Number.isFinite(sample.rx) ? sample.rx : Number(ui.fnRectRx) || 0;
        const ry = Number.isFinite(sample.ry) ? sample.ry : Number(ui.fnRectRy) || 0;
        if (rx > 0) rect.setAttribute("rx", String(rx));
        if (ry > 0) rect.setAttribute("ry", String(ry));

        const fill = sample.fill ?? ui.fnRectFill;
        const stroke = sample.stroke ?? ui.fnRectStroke;
        const strokeWidth = Number.isFinite(sample.strokeWidth) ? sample.strokeWidth : Number(ui.fnRectStrokeWidth);
        const opacity = Number.isFinite(sample.opacity) ? sample.opacity : Number(ui.fnRectOpacity);
        if (fill !== undefined && fill !== null && String(fill).trim() !== "") rect.setAttribute("fill", String(fill));
        if (stroke !== undefined && stroke !== null && String(stroke).trim() !== "") rect.setAttribute("stroke", String(stroke));
        if (Number.isFinite(strokeWidth)) rect.setAttribute("stroke-width", String(strokeWidth));
        if (Number.isFinite(opacity)) rect.setAttribute("opacity", String(opacity));

        let angle = 0;
        if (orientMode === "function" && Number.isFinite(sample.angle)) angle = sample.angle;
        else if (orientMode === "fixed") angle = fixedAngle;
        else angle = angleFromSamples(samples, i, tangentStep);
        if (Number.isFinite(angle) && angle !== 0) {
          rect.setAttribute("transform", `rotate(${angle} ${sample.x} ${sample.y})`);
        }

        group.appendChild(rect);
        made += 1;
      }

      if (group.childNodes.length) rootEl.appendChild(group);
      totalRects += made;
    }

    if (statusEl) {
      statusEl.textContent = `function rects applied: ${totalRects} rects.`;
    }
  } else if (ui.effectType === "merge") {
    let totalMerged = 0;
    let totalPaths = 0;
    for (const { rootEl, create } of contexts) {
      const selector = String(ui.mergeSelector || "").trim() || ui.mergeShape;
      let elements = null;
      const ruleText = String(ui.mergeSelectorRuleText || "").trim();
      if (ruleText) {
        try {
          const rule = JSON.parse(ruleText);
          elements = selectElementsByPropSelector(rootEl, rule);
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = `merge selector JSON error: ${err?.message || err}`;
            statusEl.classList.add("error");
          } else {
            // eslint-disable-next-line no-console
            console.warn("merge selector JSON error:", err);
          }
          return { ok: false };
        }
      }
      const opts = {
        selector,
        elements,
        padding: ui.mergePadding,
        gridStep: ui.mergeGridStep,
        smoothPasses: ui.mergeSmoothPasses,
        stroke: ui.mergeStroke || "#000000",
        strokeWidth: ui.mergeStrokeWidth,
        runId,
        debug: ui.debug,
      };
      let stats = null;
      if (ui.mergeShape === "circle") {
        stats = mergeCirclesToPathsInSubtree({ root: rootEl, create }, { ...opts, mergeRatio: ui.mergeRatio });
      } else {
        stats = mergeRectsToPathsInSubtree({ root: rootEl, create }, opts);
      }
      totalMerged += stats?.merged ?? 0;
      totalPaths += stats?.paths ?? 0;
    }
    if (statusEl) {
      statusEl.textContent = `merge applied: ${totalMerged} merged into ${totalPaths} paths.`;
    }
  } else {
    const selector = String(ui.selector || "").trim() || ui.elementType;
    const fillVal = String(ui.paintFill || "").trim();
    const strokeVal = String(ui.paintStroke || "").trim();
    let touched = 0;

    for (const { rootEl } of contexts) {
      const nodes = Array.from(rootEl.querySelectorAll(selector));
      for (const elNode of nodes) {
        if (!(elNode instanceof Element)) continue;
        if (fillVal) {
          elNode.setAttribute("fill", fillVal);
          elNode.style.fill = fillVal;
        }
        if (strokeVal) {
          elNode.setAttribute("stroke", strokeVal);
          elNode.style.stroke = strokeVal;
        }
        touched += 1;
      }
    }

    if (statusEl) {
      statusEl.textContent = `paint applied: ${touched} elements.`;
    }
  }

  xfRuntime?.rebuildNow?.();
  return { ok: true };
}

export function applyEffectsToSubtree({ mountEl, state, xfRuntime } = {}) {
  if (!state?.__effects?.ui?.autoRun) return;
  runEffectsFromUI({ mountEl, state, xfRuntime });
}
