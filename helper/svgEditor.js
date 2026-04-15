/* --------------------------- Property Ops tab --------------------------- */
import { getByPath, setByPath } from "./visualHelp.js"; // you already use setByPath in transforms :contentReference[oaicite:1]{index=1}
import { registerTab } from "./visualHelp.js";
import { scalePolygonsInSubtree, scaleCirclesInSubtree, scaleRectsInSubtree, scalePathsInSubtree, convertShapesInSubtree } from "./scriptOpsUtils.js";

export function ensurePropOpsState(state) {
  if (!state.__propOps || typeof state.__propOps !== "object") state.__propOps = {};
  if (!state.__propOps.ui || typeof state.__propOps.ui !== "object") {
    state.__propOps.ui = {
        ruleText: `{
        "selector": {"circle":{"r":{"range":[20,100]}}},
        "apply": {"stroke": null}
        }`,
        lastPreview: "",
        showDocs: false,
        };

  }
  if (state.__propOps.ui.showDocs == null) state.__propOps.ui.showDocs = false;
  if (!Array.isArray(state.__propOps.stack)) state.__propOps.stack = [];
}

/* ---------------------------- Script Ops tab ---------------------------- */
export function ensureScriptOpsState(state) {
  if (!state.__scriptOps || typeof state.__scriptOps !== "object") state.__scriptOps = {};
  if (!state.__scriptOps.ui || typeof state.__scriptOps.ui !== "object") {
    state.__scriptOps.ui = {
      codeText: `// ctx.root is the <g> subtree being processed
// ctx.svg is the owning <svg>
// ctx.create(tag) creates an SVG element
//
// Example: circle -> 6-gon (polygon)
// for (const c of ctx.root.querySelectorAll("circle")) {
//   const cx = Number(c.getAttribute("cx") || 0);
//   const cy = Number(c.getAttribute("cy") || 0);
//   const r = Number(c.getAttribute("r") || 0);
//   const n = 6;
//   const pts = Array.from({length:n}, (_,i) => {
//     const a = (Math.PI*2*i)/n;
//     return [cx + r*Math.cos(a), cy + r*Math.sin(a)].join(",");
//   }).join(" ");
//   const p = ctx.create("polygon");
//   p.setAttribute("points", pts);
//   for (const {name,value} of Array.from(c.attributes)) {
//     if (name === "cx" || name === "cy" || name === "r") continue;
//     p.setAttribute(name, value);
//   }
//   c.replaceWith(p);
// }`,
      fileName: "",
      selectedCacheKey: "",
      autoRunSelected: false,
      lastPreview: "",
      showDocs: false,
    };
  }
  if (state.__scriptOps.ui.showDocs == null) state.__scriptOps.ui.showDocs = false;
  if (state.__scriptOps.ui.autoRunSelected == null) state.__scriptOps.ui.autoRunSelected = false;
  if (state.__scriptOps.ui.selectedCacheKey == null) state.__scriptOps.ui.selectedCacheKey = "";
  if (!Array.isArray(state.__scriptOps.stack)) state.__scriptOps.stack = [];
  if (!state.__scriptOps.cache || typeof state.__scriptOps.cache !== "object") {
    state.__scriptOps.cache = {}; // name -> { code, updatedAt }
  }
}

const PROP_OPS_DOCS_TEXT = `Property Ops Rules

Rules live at: state.__propOps.stack
UI text lives at: state.__propOps.ui.ruleText

Rule shape:
{
  "selector": { "circle": { "r": { "range": [20, 100] } } },
  "apply": { "stroke": null }
}

Selector keys:
- Tag name ("circle", "path", ...) or "*" for any tag.
- Each attribute/style key maps to a match condition.

Attribute keys:
- "attrName" (e.g. "r", "fill", "opacity")
- "style.someProp" (reads/writes inline style="..." e.g. "style.opacity")

Condition types:
1) Exact match:
  { "fill": "#ff00aa" }
  { "style.opacity": 0.5 }

2) Explicit exact match:
  { "fill": { "eq": [255, 0, 0] } }
  { "fill": { "eq": "rgb(255,0,0)" } }

3) Numeric range:
  { "opacity": { "range": [0.2, 0.9] } }
  { "r": { "min": 20, "max": 100 } }

4) RGB/vector3 range (per channel):
  { "fill": { "range": [[0,0,0],[64,64,64]] } }
  { "fill": { "min": [0,0,0], "max": [64,64,64] } }
  Singular range means exact:
  { "fill": { "range": [[255,0,0]] } }

Apply patches:
- null removes an attribute:
  { "stroke": null }
- "style.someProp" patches inline style:
  { "style.opacity": 0.5 }
- "style": { ... } patches multiple style keys:
  { "style": { "opacity": "0.5", "stroke": null } }
- "$delete": true removes the element:
  { "$delete": true }`;

const SCRIPT_OPS_DOCS_TEXT = `Script Ops (JS)

Lets you run custom JavaScript against the live SVG DOM.

Rules live at: state.__scriptOps.stack
UI text lives at: state.__scriptOps.ui.codeText

Each saved script is run during rebuild, after transforms + PropOps, on each cloned subtree.

Script entry shape:
{
  "kind": "script",
  "code": "...javascript..."
}

Script context object (ctx):
- ctx.root: the SVG subtree root element being processed (usually a <g>)
- ctx.svg: the owning <svg> element
- ctx.state: the visual state object (shared with other tabs)
- ctx.mountEl: the mount element used by the editor
- ctx.create(tagName): creates an SVG element in the correct namespace

Notes:
- This runs with full page privileges (it is your code).
- To change element types (circle->polygon, rect->path, etc), create a new element and replaceWith(...).`;

function isHexColor(s) {
  return typeof s === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s.trim());
}
function clamp255(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(255, Math.round(x)));
}
function parseRgbFunc(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^rgba?\(\s*([^)]+)\s*\)$/i);
  if (!m) return null;

  const parts = m[1].split(",").map(x => x.trim());
  if (parts.length < 3) return null;

  const r = clamp255(parts[0]);
  const g = clamp255(parts[1]);
  const b = clamp255(parts[2]);
  if (r == null || g == null || b == null) return null;

  return [r, g, b];
}
function hexToRgb(s) {
  if (!isHexColor(s)) return null;
  let h = s.trim().slice(1);
  if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
  const int = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(int)) return null;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return [r, g, b];
}
function isRgbVector(v) {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every(x => typeof x === "number" && Number.isFinite(x))
  );
}
function hexToInt(s) {
  let h = s.trim().slice(1);
  if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
  return parseInt(h.slice(0, 6), 16); // ignore alpha if present
}
function parseStyleAttr(styleStr) {
  const out = {};
  String(styleStr || "")
    .split(";")
    .map(x => x.trim())
    .filter(Boolean)
    .forEach(pair => {
      const i = pair.indexOf(":");
      if (i < 0) return;
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (k) out[k] = v;
    });
  return out;
}
function writeStyleAttr(styleObj) {
  return Object.entries(styleObj)
    .filter(([k, v]) => k && v != null && String(v).length)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
function getProp(el, key) {
  if (key.startsWith("style.")) {
    const styleKey = key.slice("style.".length);
    const map = parseStyleAttr(el.getAttribute("style"));
    return map[styleKey];
  }
  return el.getAttribute(key);
}

function coerceComparable(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.trim();
    const rgb = parseRgbFunc(s) || hexToRgb(s);
    if (rgb) return rgb;
    if (isHexColor(s)) return hexToInt(s);
    // numeric-ish
    const n = Number(s);
    if (Number.isFinite(n) && s !== "") return n;
    return s;
  }
  if (isRgbVector(v)) return v;
  return v;
}

function matchesCond(el, attrKey, cond) {
  const raw = getProp(el, attrKey);
  if (raw == null) return false;

  // allowed set
  if (Array.isArray(cond)) {
    const v = coerceComparable(raw);
    return cond.some(x => coerceComparable(x) === v);
  }

  // range / min-max
  if (cond && typeof cond === "object") {
    // explicit exact (supports rgb vectors or strings like "rgb(1,2,3)")
    if ("eq" in cond) {
      const a = coerceComparable(raw);
      const b = coerceComparable(cond.eq);
      if (isRgbVector(a) && isRgbVector(b)) {
        return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
      }
      return a === b;
    }

    const r = Array.isArray(cond.range) ? cond.range : null;
    const min = r ? r[0] : cond.min;
    const max = r ? r[1] : cond.max;

    if (min == null && max == null) return false;

    const v = coerceComparable(raw);
    const a = min == null ? null : coerceComparable(min);
    const b = max == null ? null : coerceComparable(max);

    // Vector3/rgb range: compare per-channel.
    // Accepted formats:
    // - { range: [[rMin,gMin,bMin], [rMax,gMax,bMax]] }
    // - { min: [rMin,gMin,bMin], max: [rMax,gMax,bMax] }
    // - { range: [[r,g,b]] } (singular => exact match)
    if (isRgbVector(v) && (isRgbVector(a) || isRgbVector(b))) {
      const minVec = isRgbVector(a) ? a : null;
      const maxVec = isRgbVector(b) ? b : null;

      if (minVec && maxVec) {
        return (
          v[0] >= minVec[0] && v[0] <= maxVec[0] &&
          v[1] >= minVec[1] && v[1] <= maxVec[1] &&
          v[2] >= minVec[2] && v[2] <= maxVec[2]
        );
      }

      // If only one side is provided (rare), treat it as exact.
      const only = minVec || maxVec;
      return !!only && v[0] === only[0] && v[1] === only[1] && v[2] === only[2];
    }

    // Scalar range
    if (typeof v !== "number") return false;
    if (a != null && typeof a === "number" && v < a) return false;
    if (b != null && typeof b === "number" && v > b) return false;
    return true;
  }

  // exact
  const left = coerceComparable(raw);
  const right = coerceComparable(cond);
  if (isRgbVector(left) && isRgbVector(right)) {
    return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
  }
  return left === right;
}

function selectorMatches(el, selectorObj) {
  const tag = (el.tagName || "").toLowerCase();

  // selectorObj: { tagNameOrStar: { attr: cond, ... }, ... }
  for (const [tagKey, constraints] of Object.entries(selectorObj || {})) {
    const tk = String(tagKey).toLowerCase();
    if (tk !== "*" && tk !== tag) continue;

    if (!constraints || typeof constraints !== "object") return true;

    for (const [attrKey, cond] of Object.entries(constraints)) {
      if (!matchesCond(el, attrKey, cond)) return false;
    }
    return true; // matched this tag group
  }
  return false;
}

export function selectElementsByPropSelector(rootEl, selectorObj) {
  if (!rootEl || rootEl.nodeType !== 1) return [];
  const all = [rootEl, ...Array.from(rootEl.querySelectorAll("*"))];
  return all.filter(el => selectorMatches(el, selectorObj));
}


function applyPatch(el, patchObj) {
    if (patchObj?.$delete) {
        el.remove();
        return;
    }
  for (const [k, v] of Object.entries(patchObj || {})) {
    if (k.startsWith("style.") && typeof v !== "object") {
      const styleKey = k.slice("style.".length);
      const map = parseStyleAttr(el.getAttribute("style"));
      if (v == null) delete map[styleKey];
      else map[styleKey] = String(v);
      const next = writeStyleAttr(map);
      if (next) el.setAttribute("style", next);
      else el.removeAttribute("style");
      continue;
    }

    if (k === "style" && v && typeof v === "object" && !Array.isArray(v)) {
      const map = parseStyleAttr(el.getAttribute("style"));
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null) delete map[sk];
        else map[sk] = String(sv);
      }
      const next = writeStyleAttr(map);
      if (next) el.setAttribute("style", next);
      else el.removeAttribute("style");
      continue;
    }

    if (v == null) el.removeAttribute(k);
    else el.setAttribute(k, String(v));
  }
}

// This is the hook you’ll call from the clone loop:
export function applyPropOpsToSubtree(rootEl, propStack) {
  // realm-safe: works for SVG elements coming from iframes/other documents
  if (!rootEl || rootEl.nodeType !== 1) return;

  const stack = Array.isArray(propStack) ? propStack : [];
  if (!stack.length) return;

  const all = [rootEl, ...Array.from(rootEl.querySelectorAll("*"))];
  for (const el of all) {
    for (const op of stack) {
      if (!op || op.kind !== "propRule") continue;
      if (selectorMatches(el, op.selector)) applyPatch(el, op.apply);
    }
  }
}

export function applyScriptOpsToSubtree(rootEl, scriptStack, { svg, state, mountEl } = {}) {
  if (!rootEl || rootEl.nodeType !== 1) return;

  const stack = Array.isArray(scriptStack) ? scriptStack : [];
  const ui = state?.__scriptOps?.ui || {};
  const cache = state?.__scriptOps?.cache || {};

  /** @type {Array<{kind:string, code:string}>} */
  const extra = [];
  if (ui.autoRunSelected && ui.selectedCacheKey && cache[ui.selectedCacheKey]?.code) {
    extra.push({ kind: "script", code: String(cache[ui.selectedCacheKey].code) });
  }

  const effective = extra.length ? [...stack, ...extra] : stack;
  if (!effective.length) return;

  const svgEl =
    svg ||
    (rootEl.tagName && rootEl.tagName.toLowerCase() === "svg" ? rootEl : rootEl.closest?.("svg")) ||
    null;

  const create = (tagName) => {
    const ns = svgEl?.namespaceURI || "http://www.w3.org/2000/svg";
    return document.createElementNS(ns, String(tagName));
  };

  const ctx = {
    root: rootEl,
    svg: svgEl,
    state,
    mountEl,
    create,
    utils: {
      scalePolygonsInSubtree: (opts = {}) => scalePolygonsInSubtree({ root: rootEl, svg: svgEl, state, mountEl, create }, opts),
      scaleCirclesInSubtree: (opts = {}) => scaleCirclesInSubtree({ root: rootEl, svg: svgEl, state, mountEl, create }, opts),
      scaleRectsInSubtree: (opts = {}) => scaleRectsInSubtree({ root: rootEl, svg: svgEl, state, mountEl, create }, opts),
      scalePathsInSubtree: (opts = {}) => scalePathsInSubtree({ root: rootEl, svg: svgEl, state, mountEl, create }, opts),
      convertShapesInSubtree: (opts = {}) => convertShapesInSubtree({ root: rootEl, svg: svgEl, state, mountEl, create }, opts),
    },
  };

  for (const op of effective) {
    if (!op || op.kind !== "script") continue;
    const code = String(op.code || "");
    if (!code.trim()) continue;
    // eslint-disable-next-line no-new-func
    const fn = new Function("ctx", code);
    fn(ctx);
  }
}



export function buildPropOpsPanel({ mountEl, state, xfRuntime, onStateChange }) {
  ensurePropOpsState(state);
  const markDirty = () => onStateChange?.();
  const setUi = (path, value) => {
    setByPath(state, path, value);
    markDirty();
  };

  const root = document.createElement("div");
  root.className = "propops-panel";

  const render = () => {
    root.innerHTML = "";

    const mkDocs = () => {
      const wrap = document.createElement("details");
      wrap.open = !!getByPath(state, "__propOps.ui.showDocs");

      const summary = document.createElement("summary");
      summary.textContent = "Prop Ops rules (docs)";
      wrap.appendChild(summary);

      wrap.addEventListener("toggle", () => {
        setUi("__propOps.ui.showDocs", !!wrap.open);
      });

      const body = document.createElement("pre");
      body.textContent = PROP_OPS_DOCS_TEXT;
      body.style.whiteSpace = "pre-wrap";
      body.style.marginTop = "8px";
      wrap.appendChild(body);

      return wrap;
    };

   const mkRuleArea = () => {
  const wrap = document.createElement("div");
  const lab = document.createElement("div");
  lab.textContent = "rule JSON";
    lab.style.marginBottom = "5px";
  const divider = document.createElement("div");
  divider.style.borderTop = "3px solid rgba(139, 139, 139, 1)";
  divider.style.margin = "6px 0 8px";

  const ta = document.createElement("textarea");
  ta.value = String(getByPath(state, "__propOps.ui.ruleText") ?? "");
  ta.rows = 10;
  ta.style.width = "100%";

  ta.addEventListener("input", () => {
    setUi("__propOps.ui.ruleText", ta.value);
  });

  wrap.appendChild(divider);
  wrap.appendChild(lab);

  wrap.appendChild(ta);
  return wrap;
};

    root.appendChild(mkDocs());
    //root.appendChild(mkArea("selector JSON", "__propOps.ui.selectorText"));
    //root.appendChild(mkArea("apply JSON", "__propOps.ui.applyText"));
    root.appendChild(mkRuleArea());

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.flexWrap = "wrap";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "8px";
    btnRow.style.maxWidth = "100%";

    const mkBtn = (label, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.flex = "1 1 auto";
      b.style.maxWidth = "100%";
      b.onclick = onClick;
      return b;
    };

    const parseJson = (txt) => {
      const s = String(txt || "").trim();
      if (!s) return null;
      return JSON.parse(s);
    };

    btnRow.appendChild(
  mkBtn("add rule", () => {
    let rule;
    try {
      rule = parseJson(getByPath(state, "__propOps.ui.ruleText"));
      if (!rule || typeof rule !== "object") {
        throw new Error("rule must be a JSON object");
      }
      if (!rule.selector || typeof rule.selector !== "object") {
        throw new Error("missing or invalid selector");
      }
      if (!rule.apply || typeof rule.apply !== "object") {
        throw new Error("missing or invalid apply");
      }
    } catch (e) {
      setUi("__propOps.ui.lastPreview", `parse error: ${e?.message || e}`);
      render();
      return;
    }

    state.__propOps.stack.push({
      kind: "propRule",
      selector: rule.selector,
      apply: rule.apply,
    });
    markDirty();

    xfRuntime?.rebuildNow?.();

    const svg = mountEl.firstElementChild;
    if (svg) {
      applyPropOpsToSubtree(svg, state.__propOps.stack);
    }

    render();
  })
);

    btnRow.appendChild(
      mkBtn("undo", () => {
        state.__propOps.stack.pop();
        markDirty();
        xfRuntime?.rebuildNow?.();

const svg = mountEl.firstElementChild;
if (svg) {
  applyPropOpsToSubtree(svg, state.__propOps.stack);
}

        render();
      })
    );

    btnRow.appendChild(
      mkBtn("reset", () => {
        state.__propOps.stack.length = 0;
        markDirty();
        xfRuntime?.rebuildNow?.();

const svg = mountEl.firstElementChild;
if (svg) {
  applyPropOpsToSubtree(svg, state.__propOps.stack);
}

        render();
      })
    );

    root.appendChild(btnRow);

    const pre = document.createElement("pre");
    pre.style.marginTop = "8px";
    pre.textContent =
      `rules: ${state.__propOps.stack.length}\n` +
      String(getByPath(state, "__propOps.ui.lastPreview") ?? "");
    root.appendChild(pre);
  };

  render();
  return root;
}
export function registerPropOpsTab() {
  registerTab("propOps", ({ mountEl, state, xfRuntime, onStateChange }) =>
    buildPropOpsPanel({ mountEl, state, xfRuntime, onStateChange })
  );
}

export function buildScriptOpsPanel({ mountEl, state, xfRuntime, onStateChange }) {
  ensureScriptOpsState(state);
  const markDirty = () => onStateChange?.();
  const setUi = (path, value) => {
    setByPath(state, path, value);
    markDirty();
  };

  const root = document.createElement("div");
  root.className = "scriptops-panel";
  const EXAMPLE_SCRIPTS = [
    "scaleCircles.user.js",
    "scaleRects.user.js",
    "scalePolygons.user.js",
    "scalePaths.user.js",
    "convertShapesSimple.user.js",
    "convertShapes.user.js",
  ];
  let examplesLoading = false;

  const render = () => {
    root.innerHTML = "";

    const mkDocs = () => {
      const wrap = document.createElement("details");
      wrap.open = !!getByPath(state, "__scriptOps.ui.showDocs");

      const summary = document.createElement("summary");
      summary.textContent = "Script Ops (docs)";
      wrap.appendChild(summary);

      wrap.addEventListener("toggle", () => {
        setUi("__scriptOps.ui.showDocs", !!wrap.open);
      });

      const body = document.createElement("pre");
      body.textContent = SCRIPT_OPS_DOCS_TEXT;
      body.style.whiteSpace = "pre-wrap";
      body.style.marginTop = "8px";
      wrap.appendChild(body);

      return wrap;
    };

    root.appendChild(mkDocs());

    if (!state.__scriptOps.ui.examplesLoaded && !examplesLoading) {
      examplesLoading = true;
      const loadExamples = async () => {
        const entries = await Promise.all(
          EXAMPLE_SCRIPTS.map(async (name) => {
            const url = new URL(`./${name}`, import.meta.url);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`failed to load ${name}`);
            return [name, await res.text()];
          })
        );

        for (const [name, code] of entries) {
          if (!state.__scriptOps.cache[name]) {
            state.__scriptOps.cache[name] = { code, updatedAt: Date.now() };
          }
        }
        if (!getByPath(state, "__scriptOps.ui.selectedCacheKey")) {
          const first = entries[0]?.[0];
          if (first) {
            setUi("__scriptOps.ui.selectedCacheKey", first);
            setUi("__scriptOps.ui.fileName", first);
            setUi("__scriptOps.ui.codeText", state.__scriptOps.cache[first].code);
          }
        }
        setUi("__scriptOps.ui.examplesLoaded", true);
      };

      loadExamples()
        .catch((e) => {
          setUi("__scriptOps.ui.lastPreview", `example load error: ${e?.message || e}`);
        })
        .finally(() => {
          examplesLoading = false;
          render();
        });
    }

    const cacheKeys = Object.keys(state.__scriptOps.cache || {}).sort((a, b) => a.localeCompare(b));
    const selectedKey = String(getByPath(state, "__scriptOps.ui.selectedCacheKey") || "");

    const cacheRow = document.createElement("div");
    cacheRow.style.display = "flex";
    cacheRow.style.gap = "8px";
    cacheRow.style.alignItems = "center";
    cacheRow.style.marginTop = "8px";

    const sel = document.createElement("select");
    sel.style.maxWidth = "420px";
    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = cacheKeys.length ? "(select cached script)" : "(no cached scripts)";
    sel.appendChild(optEmpty);
    for (const k of cacheKeys) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      sel.appendChild(o);
    }
    sel.value = cacheKeys.includes(selectedKey) ? selectedKey : "";
    sel.onchange = () => {
      setUi("__scriptOps.ui.selectedCacheKey", sel.value);
      render();
    };

    const autoLab = document.createElement("label");
    autoLab.style.display = "flex";
    autoLab.style.alignItems = "center";
    autoLab.style.gap = "6px";
    const autoCb = document.createElement("input");
    autoCb.type = "checkbox";
    autoCb.checked = !!getByPath(state, "__scriptOps.ui.autoRunSelected");
    autoCb.onchange = () => {
      setUi("__scriptOps.ui.autoRunSelected", !!autoCb.checked);
      xfRuntime?.rebuildNow?.();
      render();
    };
    const autoTxt = document.createElement("span");
    autoTxt.textContent = "auto-run selected";
    autoLab.appendChild(autoCb);
    autoLab.appendChild(autoTxt);

    cacheRow.appendChild(sel);
    cacheRow.appendChild(autoLab);
    root.appendChild(cacheRow);

    const fileRow = document.createElement("div");
    fileRow.style.display = "flex";
    fileRow.style.gap = "8px";
    fileRow.style.alignItems = "center";
    fileRow.style.marginTop = "8px";

    const pickBtn = document.createElement("button");
    pickBtn.type = "button";
    pickBtn.textContent = "load .js file";

    const fileLab = document.createElement("div");
    fileLab.style.opacity = "0.85";
    fileLab.textContent = String(getByPath(state, "__scriptOps.ui.fileName") || "");

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".js,text/javascript,application/javascript";
    input.style.display = "none";

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      setUi("__scriptOps.ui.codeText", text);
      setUi("__scriptOps.ui.fileName", file.name);

      // Cache by filename (overwrite).
      state.__scriptOps.cache[file.name] = { code: text, updatedAt: Date.now() };
      setUi("__scriptOps.ui.selectedCacheKey", file.name);
      render();
    };

    pickBtn.onclick = () => input.click();
    fileRow.appendChild(pickBtn);
    fileRow.appendChild(fileLab);
    fileRow.appendChild(input);
    root.appendChild(fileRow);

    const divider = document.createElement("div");
    divider.style.borderTop = "3px solid rgba(139, 139, 139, 1)";
    divider.style.margin = "10px 0 8px";
    root.appendChild(divider);

    const ta = document.createElement("textarea");
    ta.value = String(getByPath(state, "__scriptOps.ui.codeText") ?? "");
    ta.rows = 14;
    ta.style.width = "100%";
    ta.addEventListener("input", () => {
      setUi("__scriptOps.ui.codeText", ta.value);
    });
    root.appendChild(ta);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.flexWrap = "wrap";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "8px";
    btnRow.style.maxWidth = "100%";

    const mkBtn = (label, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.flex = "1 1 auto";
      b.style.maxWidth = "100%";
      b.onclick = onClick;
      return b;
    };

    const runCodeOnce = (code) => {
      const svg = mountEl.firstElementChild;
      if (!svg) throw new Error("no SVG mounted");
      applyScriptOpsToSubtree(svg, [{ kind: "script", code }], { svg, state, mountEl });
    };

    btnRow.appendChild(
      mkBtn("load selected", () => {
        const key = String(getByPath(state, "__scriptOps.ui.selectedCacheKey") || "");
        const entry = key ? state.__scriptOps.cache?.[key] : null;
        if (!entry?.code) {
          setUi("__scriptOps.ui.lastPreview", "no cached script selected");
          render();
          return;
        }
        setUi("__scriptOps.ui.codeText", String(entry.code));
        setUi("__scriptOps.ui.fileName", key);
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("run selected", () => {
        try {
          const key = String(getByPath(state, "__scriptOps.ui.selectedCacheKey") || "");
          const entry = key ? state.__scriptOps.cache?.[key] : null;
          if (!entry?.code) throw new Error("no cached script selected");
          runCodeOnce(String(entry.code));
          setUi("__scriptOps.ui.lastPreview", "ok");
        } catch (e) {
          setUi("__scriptOps.ui.lastPreview", `error: ${e?.message || e}`);
        }
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("save to cache", () => {
        const code = String(getByPath(state, "__scriptOps.ui.codeText") ?? "");
        if (!code.trim()) {
          setUi("__scriptOps.ui.lastPreview", "script is empty");
          render();
          return;
        }
        const defName = String(getByPath(state, "__scriptOps.ui.fileName") || "").trim() || "script.js";
        const name = window.prompt("Cache name", defName);
        if (!name) return;
        state.__scriptOps.cache[name] = { code, updatedAt: Date.now() };
        setUi("__scriptOps.ui.selectedCacheKey", name);
        setUi("__scriptOps.ui.fileName", name);
        setUi("__scriptOps.ui.lastPreview", "cached");
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("delete selected", () => {
        const key = String(getByPath(state, "__scriptOps.ui.selectedCacheKey") || "");
        if (!key) return;
        const ok = window.confirm(`Delete cached script "${key}"?`);
        if (!ok) return;
        delete state.__scriptOps.cache[key];
        if (String(getByPath(state, "__scriptOps.ui.fileName") || "") === key) {
          setUi("__scriptOps.ui.fileName", "");
        }
        setUi("__scriptOps.ui.selectedCacheKey", "");
        setUi("__scriptOps.ui.lastPreview", "deleted");
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("run once", () => {
        try {
          const code = String(getByPath(state, "__scriptOps.ui.codeText") ?? "");
          runCodeOnce(code);
          setUi("__scriptOps.ui.lastPreview", "ok");
        } catch (e) {
          setUi("__scriptOps.ui.lastPreview", `error: ${e?.message || e}`);
        }
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("save as rule", () => {
        try {
          const code = String(getByPath(state, "__scriptOps.ui.codeText") ?? "");
          if (!code.trim()) throw new Error("script is empty");
          state.__scriptOps.stack.push({ kind: "script", code });
          markDirty();
          xfRuntime?.rebuildNow?.();
          const svg = mountEl.firstElementChild;
          if (svg) applyScriptOpsToSubtree(svg, state.__scriptOps.stack, { svg, state, mountEl });
          setUi("__scriptOps.ui.lastPreview", "saved");
        } catch (e) {
          setUi("__scriptOps.ui.lastPreview", `error: ${e?.message || e}`);
        }
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("undo", () => {
        state.__scriptOps.stack.pop();
        markDirty();
        xfRuntime?.rebuildNow?.();
        const svg = mountEl.firstElementChild;
        if (svg) applyScriptOpsToSubtree(svg, state.__scriptOps.stack, { svg, state, mountEl });
        render();
      })
    );

    btnRow.appendChild(
      mkBtn("reset", () => {
        state.__scriptOps.stack.length = 0;
        markDirty();
        xfRuntime?.rebuildNow?.();
        const svg = mountEl.firstElementChild;
        if (svg) applyScriptOpsToSubtree(svg, state.__scriptOps.stack, { svg, state, mountEl });
        render();
      })
    );

    root.appendChild(btnRow);

    const pre = document.createElement("pre");
    pre.style.marginTop = "8px";
    pre.textContent =
      `rules: ${state.__scriptOps.stack.length}\n` +
      String(getByPath(state, "__scriptOps.ui.lastPreview") ?? "");
    root.appendChild(pre);
  };

  render();
  return root;
}

export function registerScriptOpsTab() {
  registerTab("scriptOps", ({ mountEl, state, xfRuntime, onStateChange }) =>
    buildScriptOpsPanel({ mountEl, state, xfRuntime, onStateChange })
  );
}
