/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Palette mapping used by the Color effect and saved effect flows.

import { el } from "./visualHelp.js";
import { createSubTabs } from "./subTabs.js";

const COLOR_MODES = [
  { value: "byExisting", label: "by existing color" },
  { value: "byLuminance", label: "by luminance" },
  { value: "bySize", label: "by size/attr" },
  { value: "byIndex", label: "by index" },
];

const COLOR_SORTS = [
  { value: "appearance", label: "appearance order" },
  { value: "luminance", label: "luminance order" },
];

const TARGET_PROPS = [
  { value: "fill", label: "fill" },
  { value: "stroke", label: "stroke" },
  { value: "both", label: "fill + stroke" },
];

const SIZE_SOURCES = [
  { value: "attr", label: "attr/style value" },
  { value: "bboxArea", label: "bbox area" },
  { value: "bboxWidth", label: "bbox width" },
  { value: "bboxHeight", label: "bbox height" },
  { value: "pathLength", label: "path length" },
];

const COLOR_PARSER = typeof document !== "undefined"
  ? document.createElement("span")
  : null;

const COLOR_CACHE = new Map();
const RGB_CACHE = new Map();
let colorCanvas;


function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampInt(v, lo, hi) {
  const n = Number.isFinite(+v) ? Math.trunc(+v) : lo;
  return Math.max(lo, Math.min(hi, n));
}

function parseNumberLike(v, fallback = NaN) {
  const s = String(v ?? "").trim();
  const m = s.match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function normalizeColor(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  if (lowered === "none" || lowered === "transparent") return lowered;
  if (!COLOR_PARSER) return raw;
  if (COLOR_CACHE.has(raw)) return COLOR_CACHE.get(raw);
  COLOR_PARSER.style.color = "";
  COLOR_PARSER.style.color = raw;
  const normalized = COLOR_PARSER.style.color || "";
  COLOR_CACHE.set(raw, normalized);
  return normalized;
}

function parseRgb(value) {
  const normalized = normalizeColor(value);
  if (!normalized) return null;
  if (normalized === "none" || normalized === "transparent") return null;
  if (RGB_CACHE.has(normalized)) return RGB_CACHE.get(normalized);

  let out = null;
  const s = normalized.trim().toLowerCase();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const toByte = (h) => parseInt(h, 16);
    if (hex.length === 3 || hex.length === 4) {
      const r = toByte(hex[0] + hex[0]);
      const g = toByte(hex[1] + hex[1]);
      const b = toByte(hex[2] + hex[2]);
      out = [r, g, b];
    } else if (hex.length >= 6) {
      const r = toByte(hex.slice(0, 2));
      const g = toByte(hex.slice(2, 4));
      const b = toByte(hex.slice(4, 6));
      out = [r, g, b];
    }
  } else {
    const m = s.match(/^rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].trim().split(/[\s,/]+/);
      const toByte = (p) => {
        if (p.endsWith("%")) return Math.round(parseNumberLike(p, 0) * 2.55);
        return Math.round(parseNumberLike(p, 0));
      };
      const r = toByte(parts[0]);
      const g = toByte(parts[1]);
      const b = toByte(parts[2]);
      out = [r, g, b];
    }
  }

  if (!out && typeof document !== "undefined") {
    // Resolve named colors and modern CSS color functions through the browser.
    colorCanvas ||= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    colorCanvas.clearRect(0, 0, 1, 1);
    colorCanvas.fillStyle = normalized;
    colorCanvas.fillRect(0, 0, 1, 1);
    out = Array.from(colorCanvas.getImageData(0, 0, 1, 1).data).slice(0, 3);
  }
  if (!out || out.some((n) => !Number.isFinite(n))) out = null;
  RGB_CACHE.set(normalized, out);
  return out;
}

function rgbToCss(rgb) {
  if (!rgb) return "";
  const [r, g, b] = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))));
  return `rgb(${r}, ${g}, ${b})`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(a, b, t) {
  if (!a || !b) return null;
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function expandPalette(palette, steps) {
  if (!palette.length) return [];
  if (steps <= 0 || steps === palette.length) return palette.slice();
  if (steps === 1) return [palette[0]];

  const rgbStops = palette.map((c) => parseRgb(c));
  if (rgbStops.some((c) => !c)) {
    const out = [];
    for (let i = 0; i < steps; i++) out.push(palette[i % palette.length]);
    return out;
  }

  const out = [];
  const maxIdx = palette.length - 1;
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const idx = t * maxIdx;
    const a = Math.floor(idx);
    const b = Math.min(maxIdx, a + 1);
    const localT = idx - a;
    const mixed = lerpColor(rgbStops[a], rgbStops[b], localT);
    out.push(rgbToCss(mixed));
  }
  return out;
}

function parsePalette(text) {
  const raw = String(text ?? "")
    .split(/,(?![^()]*\))|\n/g)
    .map((c) => c.trim())
    .filter(Boolean);
  const out = [];
  for (const color of raw) {
    const normalized = normalizeColor(color);
    if (normalized) out.push(normalized);
  }
  return out;
}

export const COLOR_PRESETS = [
  { value: "greyscale", label: "Greyscale", paletteText: "#000000, #ffffff", paletteSteps: 256, mode: "byLuminance" },
  { value: "blackWhite", label: "Black and white", paletteText: "#000000, #ffffff", paletteSteps: 2, mode: "byLuminance" },
  { value: "sepia", label: "Sepia", paletteText: "#24160c, #a67c52, #fff1d2", paletteSteps: 32, mode: "byLuminance" },
  { value: "warm", label: "Warm", paletteText: "#111111, #f97316, #facc15, #f8fafc", paletteSteps: 0, mode: "byExisting" },
  { value: "cool", label: "Cool", paletteText: "#0f172a, #2563eb, #22d3ee, #f0fdfa", paletteSteps: 0, mode: "byExisting" },
];

export function ensureColorEffect(ui) {
  if (!ui.color || typeof ui.color !== "object" || Array.isArray(ui.color)) ui.color = {};
  const defaults = {
    selector: "*", sourceProp: "each", targetProp: "both", mode: "byExisting",
    colorSort: "appearance", paletteText: "#111111, #f97316, #facc15, #f8fafc",
    paletteSteps: 0, reversePalette: false, useComputed: true, skipNone: true,
    sizeSource: "attr", sizeAttr: "r", sizeMin: "", sizeMax: "", preset: ui.color.paletteText ? "custom" : "warm",
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (ui.color[key] == null) ui.color[key] = value;
  }
  if (!ui.color.groupsOpen || typeof ui.color.groupsOpen !== "object") ui.color.groupsOpen = {};
  return ui.color;
}

function readElementColor(el, prop, useComputed) {
  let val = el.style?.[prop] || el.getAttribute?.(prop);
  if (useComputed && typeof getComputedStyle === "function") {
    val = getComputedStyle(el)?.[prop];
  }
  return String(val ?? "").trim();
}

function setElementColor(el, prop, color) {
  if (!color) return;
  if (prop === "fill" || prop === "stroke") {
    el.setAttribute(prop, color);
    if (el.style) el.style[prop] = color;
  }
}

function isSkippableColor(key) {
  return !key || key === "none" || key === "transparent";
}

function getSizeValue(el, ui) {
  const source = ui.sizeSource || "attr";
  if (source === "bboxArea" || source === "bboxWidth" || source === "bboxHeight") {
    try {
      const bb = el.getBBox?.();
      if (!bb) return NaN;
      if (source === "bboxWidth") return bb.width;
      if (source === "bboxHeight") return bb.height;
      return bb.width * bb.height;
    } catch {
      return NaN;
    }
  }
  if (source === "pathLength") {
    if (typeof el.getTotalLength === "function") return el.getTotalLength();
    return NaN;
  }
  const key = String(ui.sizeAttr || "").trim();
  if (!key) return NaN;
  const raw = el.getAttribute?.(key) ?? el.style?.[key];
  return parseNumberLike(raw, NaN);
}

function buildPalette(ui) {
  let palette = parsePalette(ui.paletteText);
  if (!palette.length) return [];
  const steps = clampInt(ui.paletteSteps, 0, 256);
  if (steps > 0) palette = expandPalette(palette, steps);
  if (ui.reversePalette) palette = palette.slice().reverse();
  return palette;
}

function buildColorMap(elements, palette, ui) {
  const sourceProp = ui.sourceProp || "fill";
  const order = [];
  const seen = new Map();
  for (const el of elements) {
    const raw = readElementColor(el, sourceProp, ui.useComputed);
    const key = normalizeColor(raw);
    if (ui.skipNone && isSkippableColor(key)) continue;
    if (!seen.has(key)) {
      seen.set(key, { key, luma: colorLuminance(key) });
      order.push(key);
    }
  }

  if (ui.colorSort === "luminance") {
    order.sort((a, b) => colorLuminance(a) - colorLuminance(b));
  }

  const map = new Map();
  order.forEach((key, i) => {
    map.set(key, palette[i % palette.length]);
  });
  return map;
}

function colorLuminance(color) {
  const rgb = parseRgb(color);
  if (!rgb) return 0;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

function applyPaletteToElements(elements, palette, ui) {
  if (ui.sourceProp === "each") {
    const props = ui.targetProp === "both" ? ["fill", "stroke"] : [ui.targetProp || "fill"];
    const changed = new Set();
    let mapped = 0;
    let error;
    for (const prop of props) {
      const painted = elements.filter((node) => !ui.skipNone || !isSkippableColor(normalizeColor(readElementColor(node, prop, ui.useComputed))));
      const stats = applyPaletteToElements(painted, palette, { ...ui, sourceProp: prop, targetProp: prop });
      if (stats.touched) painted.forEach((node) => changed.add(node));
      mapped = Math.max(mapped, stats.mapped);
      error ||= stats.error;
    }
    return { touched: changed.size, mapped, error };
  }
  const sourceProp = ui.sourceProp || "fill";
  const targetProp = ui.targetProp || "fill";
  let touched = 0;

  if (ui.mode === "byExisting") {
    const map = buildColorMap(elements, palette, ui);
    for (const el of elements) {
      const raw = readElementColor(el, sourceProp, ui.useComputed);
      const key = normalizeColor(raw);
      if (ui.skipNone && isSkippableColor(key)) continue;
      const next = map.get(key);
      if (!next) continue;
      if (targetProp === "both") {
        setElementColor(el, "fill", next);
        setElementColor(el, "stroke", next);
      } else {
        setElementColor(el, targetProp, next);
      }
      touched += 1;
    }
    return { touched, mapped: map.size };
  }

  if (ui.mode === "byLuminance") {
    for (const el of elements) {
      const raw = readElementColor(el, sourceProp, ui.useComputed);
      const key = normalizeColor(raw);
      if (ui.skipNone && isSkippableColor(key)) continue;
      const luma = clamp01(colorLuminance(key));
      const idx = Math.round(luma * (palette.length - 1));
      const next = palette[idx] ?? palette[0];
      if (targetProp === "both") {
        setElementColor(el, "fill", next);
        setElementColor(el, "stroke", next);
      } else {
        setElementColor(el, targetProp, next);
      }
      touched += 1;
    }
    return { touched, mapped: palette.length };
  }

  if (ui.mode === "bySize") {
    const values = [];
    for (const el of elements) {
      const v = getSizeValue(el, ui);
      if (Number.isFinite(v)) values.push(v);
    }
    if (!values.length) {
      return { touched: 0, mapped: 0, error: "No numeric size values found." };
    }
    const minRaw = parseNumberLike(ui.sizeMin, NaN);
    const maxRaw = parseNumberLike(ui.sizeMax, NaN);
    const min = Number.isFinite(minRaw) ? minRaw : Math.min(...values);
    const max = Number.isFinite(maxRaw) ? maxRaw : Math.max(...values);
    const span = max - min || 1;

    for (const el of elements) {
      const v = getSizeValue(el, ui);
      if (!Number.isFinite(v)) continue;
      const t = clamp01((v - min) / span);
      const idx = Math.round(t * (palette.length - 1));
      const next = palette[idx] ?? palette[0];
      if (targetProp === "both") {
        setElementColor(el, "fill", next);
        setElementColor(el, "stroke", next);
      } else {
        setElementColor(el, targetProp, next);
      }
      touched += 1;
    }
    return { touched, mapped: palette.length };
  }

  for (let i = 0; i < elements.length; i++) {
    const next = palette[i % palette.length];
    const el = elements[i];
    if (targetProp === "both") {
      setElementColor(el, "fill", next);
      setElementColor(el, "stroke", next);
    } else {
      setElementColor(el, targetProp, next);
    }
    touched += 1;
  }
  return { touched, mapped: palette.length };
}

function getSvgRoots(mountEl) {
  if (mountEl?.matches?.("svg")) return [mountEl];
  return Array.from(mountEl?.querySelectorAll?.("svg") || []).filter((svg) => !svg.parentElement?.closest("svg"));
}

export function runColorEffect({ mountEl, ui, statusEl } = {}) {
  const palette = buildPalette(ui);
  if (!palette.length) {
    if (statusEl) {
      statusEl.textContent = "Palette is empty or invalid.";
      statusEl.classList.add("error");
    }
    return { ok: false };
  }

  const selector = String(ui.selector || "").trim() || "*";
  try { document.createDocumentFragment().querySelector(selector); }
  catch {
    if (statusEl) {
      statusEl.textContent = "Invalid selector. Use * or comma-separated selectors such as rect,circle,path,line.";
      statusEl.classList.add("error");
    }
    return { ok: false };
  }
  const roots = getSvgRoots(mountEl);
  if (!roots.length) {
    if (statusEl) {
      statusEl.textContent = "No SVG found in this visual.";
      statusEl.classList.add("error");
    }
    return { ok: false };
  }

  if (statusEl) statusEl.classList.remove("error");

  let totalTouched = 0;
  let totalMapped = 0;
  let errorText = "";
  for (const svg of roots) {
    const nodes = Array.from(svg.querySelectorAll(selector))
      .filter((el) => !el.closest("defs, clipPath, mask, symbol") && !["svg", "g", "title", "desc", "metadata", "style", "script"].includes(el.localName));
    const stats = applyPaletteToElements(nodes, palette, ui);
    if (stats.error && !errorText) errorText = stats.error;
    totalTouched += stats.touched;
    totalMapped = Math.max(totalMapped, stats.mapped);
  }

  if (statusEl) {
    statusEl.textContent = errorText
      ? `color warning: ${errorText}`
      : `color applied: ${totalTouched} elements, ${totalMapped} mapped colors.`;
    statusEl.classList.toggle("error", !!errorText);
  }
  return { ok: true };
}

export function buildColorEffectPanel({ ui, onStateChange }) {
  const markDirty = () => onStateChange?.();

  const root = el("div", { className: "fx-panel" });

  const row = (label, node, help) => {
    const wrap = el("div", { className: "vr-row" });
    wrap.appendChild(el("div", { className: "vr-label", textContent: label }));
    if (help) wrap.appendChild(el("div", { className: "vr-help", textContent: help }));
    wrap.appendChild(el("div", { className: "vr-input" }, [node]));
    return wrap;
  };

  const group = (title, nodes) => {
    const storedOpen = ui.groupsOpen?.[title];
    const isOpen = typeof storedOpen === "boolean" ? storedOpen : true;
    const wrap = el("details", { className: "vr-paramGroup", open: isOpen });
    wrap.appendChild(el("summary", { className: "vr-paramGroupTitle", textContent: title }));
    wrap.appendChild(el("div", { className: "vr-paramGroupBody" }, nodes));
    wrap.addEventListener("toggle", () => {
      ui.groupsOpen[title] = wrap.open;
      markDirty();
    });
    return wrap;
  };

  const mappingTabs = createSubTabs({
    label: "Color mapping", options: COLOR_MODES, value: ui.mode,
    onChange: (mode) => { ui.mode = mode; markDirty(); refresh(); },
  });
  const presetSelect = el("select", { "aria-label": "Color preset" });
  presetSelect.appendChild(el("option", { value: "custom", textContent: "Custom" }));
  COLOR_PRESETS.forEach((preset) => presetSelect.appendChild(el("option", { value: preset.value, textContent: preset.label })));
  presetSelect.value = ui.preset || "custom";
  presetSelect.onchange = () => {
    const preset = COLOR_PRESETS.find((item) => item.value === presetSelect.value);
    ui.preset = presetSelect.value;
    if (preset) {
      Object.assign(ui, { paletteText: preset.paletteText, paletteSteps: preset.paletteSteps, mode: preset.mode, reversePalette: false, sourceProp: "each", targetProp: "both", useComputed: true, skipNone: true });
      paletteInput.value = ui.paletteText;
      paletteSteps.value = String(ui.paletteSteps);
      reverseCb.checked = false;
      mappingTabs.setValue(ui.mode);
      sourcePropSel.value = ui.sourceProp;
      targetPropSel.value = ui.targetProp;
      useComputedCb.checked = true;
      skipNoneCb.checked = true;
    }
    markDirty();
    refresh();
  };

  const selectorInput = el("input", { type: "text", value: ui.selector || "*", placeholder: "* or rect,circle,path,line", "aria-label": "Color selector" });
  selectorInput.oninput = () => {
    ui.selector = selectorInput.value;
    markDirty();
  };

  const sourcePropSel = el("select");
  sourcePropSel.appendChild(el("option", { value: "each", textContent: "each painted color" }));
  ["fill", "stroke"].forEach((t) => sourcePropSel.appendChild(el("option", { value: t, textContent: t })));
  sourcePropSel.value = ui.sourceProp || "fill";
  sourcePropSel.onchange = () => {
    ui.sourceProp = sourcePropSel.value;
    markDirty();
  };

  const targetPropSel = el("select");
  TARGET_PROPS.forEach((opt) => targetPropSel.appendChild(el("option", { value: opt.value, textContent: opt.label })));
  targetPropSel.value = ui.targetProp || "fill";
  targetPropSel.onchange = () => {
    ui.targetProp = targetPropSel.value;
    markDirty();
  };

  const colorSortSel = el("select");
  COLOR_SORTS.forEach((opt) => colorSortSel.appendChild(el("option", { value: opt.value, textContent: opt.label })));
  colorSortSel.value = ui.colorSort || "appearance";
  colorSortSel.onchange = () => {
    ui.colorSort = colorSortSel.value;
    markDirty();
  };

  const paletteInput = el("textarea", {
    rows: "3",
    value: ui.paletteText || "",
    placeholder: "#111111, #f97316, #facc15, #f8fafc",
  });
  paletteInput.oninput = () => {
    ui.preset = presetSelect.value = "custom";
    ui.paletteText = paletteInput.value;
    markDirty();
  };

  const paletteSteps = el("input", {
    type: "number",
    min: "0",
    step: "1",
    value: String(ui.paletteSteps ?? 0),
  });
  paletteSteps.oninput = () => {
    ui.preset = presetSelect.value = "custom";
    ui.paletteSteps = clampInt(paletteSteps.value, 0, 256);
    markDirty();
  };

  const reverseCb = el("input", { type: "checkbox" });
  reverseCb.checked = !!ui.reversePalette;
  reverseCb.onchange = () => {
    ui.reversePalette = !!reverseCb.checked;
    markDirty();
  };

  const useComputedCb = el("input", { type: "checkbox" });
  useComputedCb.checked = !!ui.useComputed;
  useComputedCb.onchange = () => {
    ui.useComputed = !!useComputedCb.checked;
    markDirty();
  };

  const skipNoneCb = el("input", { type: "checkbox" });
  skipNoneCb.checked = ui.skipNone !== false;
  skipNoneCb.onchange = () => {
    ui.skipNone = !!skipNoneCb.checked;
    markDirty();
  };

  const sizeSourceSel = el("select");
  SIZE_SOURCES.forEach((opt) => sizeSourceSel.appendChild(el("option", { value: opt.value, textContent: opt.label })));
  sizeSourceSel.value = ui.sizeSource || "attr";
  sizeSourceSel.onchange = () => {
    ui.sizeSource = sizeSourceSel.value;
    markDirty();
    refresh();
  };

  const sizeAttrInput = el("input", {
    type: "text",
    value: ui.sizeAttr || "",
    placeholder: "r, stroke-width, opacity",
  });
  sizeAttrInput.oninput = () => {
    ui.sizeAttr = sizeAttrInput.value;
    markDirty();
  };

  const sizeMinInput = el("input", {
    type: "text",
    value: String(ui.sizeMin ?? ""),
    placeholder: "auto",
  });
  sizeMinInput.oninput = () => {
    ui.sizeMin = sizeMinInput.value;
    markDirty();
  };

  const sizeMaxInput = el("input", {
    type: "text",
    value: String(ui.sizeMax ?? ""),
    placeholder: "auto",
  });
  sizeMaxInput.oninput = () => {
    ui.sizeMax = sizeMaxInput.value;
    markDirty();
  };

  const targetGroup = group("Target", [
    row("selector", selectorInput, "Use * for all elements, or comma-separated selectors: rect,circle,path,line."),
    row("source prop", sourcePropSel, "Color to sample for mapping."),
    row("apply to", targetPropSel, "Where mapped colors are applied."),
  ]);

  const paletteGroup = group("Palette", [
    row("preset", presetSelect, "Choose a common color treatment, or edit a custom palette."),
    row("palette", paletteInput, "Comma or newline separated colors."),
    row("steps", paletteSteps, "0 keeps palette length; >0 interpolates."),
    row("reverse", reverseCb, "Flip the palette order."),
  ]);

  const mapGroup = group("Mapping", [
    mappingTabs.root,
    row("sort", colorSortSel, "Only used for existing-color mapping."),
    row("use computed", useComputedCb, "Sample visible colors, including inherited styles."),
    row("skip none", skipNoneCb, "Ignore none/transparent colors."),
  ]);

  const sizeGroup = group("Size Mapper", [
    row("size source", sizeSourceSel, "attr/style value or geometry-based."),
    row("size attr", sizeAttrInput, "Attribute or style name for attr mode."),
    row("min", sizeMinInput, "Optional override for min."),
    row("max", sizeMaxInput, "Optional override for max."),
  ]);

  const refresh = () => {
    const isSize = ui.mode === "bySize";
    sizeGroup.style.display = isSize ? "" : "none";
    colorSortSel.disabled = ui.mode !== "byExisting";
  };

  root.appendChild(targetGroup);
  root.appendChild(paletteGroup);
  root.appendChild(mapGroup);
  root.appendChild(sizeGroup);
  refresh();
  return root;
}
