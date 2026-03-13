const SHAPE_OPTIONS = [
  { value: "boxTall", label: "Tall Box" },
  { value: "slab", label: "Slab" },
  { value: "cylinder", label: "Cylinder" },
  { value: "pyramid", label: "Pyramid" },
  { value: "sphere", label: "Sphere" },
  { value: "cone", label: "Cone" },
  { value: "poly", label: "Polyhedron" },
];

const SHAPE_ALIAS = {
  shapeBoxTall: "boxTall",
  shapeSlab: "slab",
  shapeCylinder: "cylinder",
  shapePyramid: "pyramid",
  shapeSphere: "sphere",
  shapeCone: "cone",
  shapePoly: "poly",
};

const COLOR_OPTIONS = [
  { value: 0, label: "Ice Blue" },
  { value: 1, label: "Mint" },
  { value: 2, label: "Apricot" },
  { value: 3, label: "Rose" },
  { value: 4, label: "Lavender" },
  { value: 5, label: "Sand" },
];

const TEMPLATE_URL = new URL("./shapePlacementPanel.html", import.meta.url);

const DEFAULT_SHAPE_TOOL = Object.freeze({
  mode: "translate",
  shape: "boxTall",
  cursor: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: 1.2,
  stretch: { x: 1, y: 1.2, z: 1 },
  colorIndex: 0,
});

let templatePromise = null;

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cloneVec3(raw, fallback = { x: 0, y: 0, z: 0 }) {
  return {
    x: numOr(raw?.x, fallback.x),
    y: numOr(raw?.y, fallback.y),
    z: numOr(raw?.z, fallback.z),
  };
}

function normalizeShape(shape) {
  const next = String(shape ?? "").trim();
  const fromAlias = SHAPE_ALIAS[next] || next;
  if (SHAPE_OPTIONS.some((opt) => opt.value === fromAlias)) return fromAlias;
  return DEFAULT_SHAPE_TOOL.shape;
}

function sanitizeTool(raw) {
  const mode = raw?.mode === "rotate" ? "rotate" : "translate";
  const scale = clamp(numOr(raw?.scale, DEFAULT_SHAPE_TOOL.scale), 0.25, 4);
  const stretch = cloneVec3(raw?.stretch, DEFAULT_SHAPE_TOOL.stretch);
  const colorIndex = clamp(Math.round(numOr(raw?.colorIndex, 0)), 0, COLOR_OPTIONS.length - 1);
  return {
    mode,
    shape: normalizeShape(raw?.shape),
    cursor: {
      x: Math.round(numOr(raw?.cursor?.x, DEFAULT_SHAPE_TOOL.cursor.x)),
      y: Math.round(numOr(raw?.cursor?.y, DEFAULT_SHAPE_TOOL.cursor.y)),
      z: Math.round(numOr(raw?.cursor?.z, DEFAULT_SHAPE_TOOL.cursor.z)),
    },
    rotation: cloneVec3(raw?.rotation, DEFAULT_SHAPE_TOOL.rotation),
    scale,
    stretch: {
      x: clamp(stretch.x, 0.25, 3),
      y: clamp(stretch.y, 0.25, 3),
      z: clamp(stretch.z, 0.25, 3),
    },
    colorIndex,
  };
}

function sanitizeCollapsedFlag(value) {
  return value === true;
}

function sanitizeInstance(raw, fallbackTool) {
  const tool = sanitizeTool({ ...fallbackTool, ...raw });
  return {
    shape: tool.shape,
    position: cloneVec3(raw?.position || raw?.cursor, tool.cursor),
    rotation: cloneVec3(raw?.rotation, tool.rotation),
    scale: tool.scale,
    stretch: cloneVec3(raw?.stretch, tool.stretch),
    colorIndex: tool.colorIndex,
  };
}

function loadTemplateHtml() {
  if (!templatePromise) {
    templatePromise = fetch(TEMPLATE_URL)
      .then((resp) => {
        if (!resp.ok) throw new Error(`shape editor template load failed: ${resp.status}`);
        return resp.text();
      })
      .catch(() => {
        return `
<section class="vhs-shapeEditor" aria-label="Shape placement tool">
  <div class="vhs-shapeEditor__head">
    <div class="vhs-shapeEditor__headRow">
      <h3 class="vhs-shapeEditor__title">Shape Tool</h3>
      <button type="button" class="vhs-shapeEditor__collapseBtn" data-shape-collapse-toggle aria-expanded="true" aria-label="Collapse shape placement menu">Collapse</button>
    </div>
    <p class="vhs-shapeEditor__hint">Space toggles Point/Rotate gizmo mode</p>
  </div>
  <div class="vhs-shapeEditor__body" data-shape-collapsible>
  <div class="vhs-shapeEditor__field">
    <label for="vhs-shape-type">Shape</label>
    <select id="vhs-shape-type" data-shape-select></select>
  </div>
  <div class="vhs-shapeEditor__mode">
    <button type="button" data-shape-mode="translate">Point</button>
    <button type="button" data-shape-mode="rotate">Rotate</button>
  </div>
  <div class="vhs-shapeEditor__subhead">Point</div>
  <div class="vhs-shapeEditor__triple">
    <label>X</label>
    <input type="range" data-pos-x-range />
    <input type="number" step="1" data-pos-x-number />
  </div>
  <div class="vhs-shapeEditor__triple">
    <label>Y</label>
    <input type="range" data-pos-y-range />
    <input type="number" step="1" data-pos-y-number />
  </div>
  <div class="vhs-shapeEditor__triple">
    <label>Z</label>
    <input type="range" data-pos-z-range />
    <input type="number" step="1" data-pos-z-number />
  </div>
  <div class="vhs-shapeEditor__subhead">Rotation + Scale</div>
  <div class="vhs-shapeEditor__triple">
    <label>Yaw</label>
    <input type="range" min="-180" max="180" step="1" data-rot-y-range />
    <input type="number" min="-180" max="180" step="1" data-rot-y-number />
  </div>
  <div class="vhs-shapeEditor__triple">
    <label>Scale</label>
    <input type="range" min="0.25" max="4" step="0.01" data-scale-range />
    <input type="number" min="0.25" max="4" step="0.01" data-scale-number />
  </div>
  <div class="vhs-shapeEditor__triple">
    <label>Stretch X</label>
    <input type="range" min="0.25" max="3" step="0.01" data-stretch-x-range />
    <input type="number" min="0.25" max="3" step="0.01" data-stretch-x-number />
  </div>
  <div class="vhs-shapeEditor__triple">
    <label>Stretch Y</label>
    <input type="range" min="0.25" max="3" step="0.01" data-stretch-y-range />
    <input type="number" min="0.25" max="3" step="0.01" data-stretch-y-number />
  </div>
  <div class="vhs-shapeEditor__triple">
    <label>Stretch Z</label>
    <input type="range" min="0.25" max="3" step="0.01" data-stretch-z-range />
    <input type="number" min="0.25" max="3" step="0.01" data-stretch-z-number />
  </div>
  <div class="vhs-shapeEditor__field">
    <label for="vhs-shape-color">Color</label>
    <select id="vhs-shape-color" data-color-select></select>
  </div>
  <div class="vhs-shapeEditor__subhead">Shape Stack Transforms</div>
  <div class="vhs-shapeEditor__triple">
    <label>Erode</label>
    <input type="range" min="0" max="6" step="1" data-erosion-range />
    <input type="number" min="0" max="6" step="1" data-erosion-number />
  </div>
  <div class="vhs-shapeEditor__triple">
    <label>Dilate</label>
    <input type="range" min="0" max="6" step="1" data-dilation-range />
    <input type="number" min="0" max="6" step="1" data-dilation-number />
  </div>
  <div class="vhs-shapeEditor__actions">
    <button type="button" data-shape-action="place">Place Shape</button>
    <button type="button" data-shape-action="undo">Undo Last</button>
    <button type="button" data-shape-action="clear">Clear All</button>
  </div>
  <div class="vhs-shapeEditor__meta">
    <span data-shape-count>0</span> shapes in scene
  </div>
  </div>
</section>`;
      });
  }
  return templatePromise;
}

function setValuePair(rangeEl, numberEl, nextValue) {
  const value = String(nextValue);
  if (rangeEl) rangeEl.value = value;
  if (numberEl) numberEl.value = value;
}

export function ensureShapePlacementState(state) {
  if (!state || typeof state !== "object") return state;
  state.shapeTool = sanitizeTool(state.shapeTool);
  state.shapePanelCollapsed = sanitizeCollapsedFlag(state.shapePanelCollapsed);
  if (!Array.isArray(state.shapeInstances)) {
    state.shapeInstances = [];
  } else {
    state.shapeInstances = state.shapeInstances.map((entry) => sanitizeInstance(entry, state.shapeTool));
  }
  return state;
}

export function makeShapeInstanceFromTool(tool) {
  const clean = sanitizeTool(tool);
  return {
    shape: clean.shape,
    position: cloneVec3(clean.cursor),
    rotation: cloneVec3(clean.rotation),
    scale: clean.scale,
    stretch: cloneVec3(clean.stretch),
    colorIndex: clean.colorIndex,
  };
}

export function mountShapePlacementPanel({
  container,
  state,
  onToolChange,
  onTransformSettingsChange,
  onPlaceShape,
  onUndoShape,
  onClearShapes,
}) {
  ensureShapePlacementState(state);
  const host = document.createElement("div");
  host.className = "vhs-shapeEditorHost";

  const insertBefore = container.querySelector(".vr-autoUI");
  if (insertBefore) {
    container.insertBefore(host, insertBefore);
  } else {
    container.prepend(host);
  }

  let destroyed = false;
  let syncing = false;
  let els = null;

  const emitToolChange = () => onToolChange?.(state.shapeTool);
  const emitTransformChange = () => onTransformSettingsChange?.();
  const syncCollapsedUi = () => {
    if (!els) return;
    const collapsed = state.shapePanelCollapsed === true;
    host.classList.toggle("is-collapsed", collapsed);
    if (els.collapsibleBody) {
      els.collapsibleBody.hidden = collapsed;
    }
    if (els.collapseToggle) {
      els.collapseToggle.textContent = collapsed ? "Expand" : "Collapse";
      els.collapseToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      els.collapseToggle.setAttribute(
        "aria-label",
        collapsed ? "Expand shape placement menu" : "Collapse shape placement menu"
      );
    }
  };

  const setMode = (mode) => {
    ensureShapePlacementState(state);
    state.shapeTool.mode = mode === "rotate" ? "rotate" : "translate";
    emitToolChange();
    sync();
  };

  const updateShapeCount = () => {
    if (!els?.shapeCount) return;
    const count = Array.isArray(state.shapeInstances) ? state.shapeInstances.length : 0;
    els.shapeCount.textContent = String(count);
  };

  const clampCursorToGrid = () => {
    ensureShapePlacementState(state);
    const half = Math.max(1, Math.floor(Math.max(4, numOr(state.gridSize, 40)) / 2));
    const cursor = state.shapeTool.cursor;
    cursor.x = clamp(Math.round(numOr(cursor.x, 0)), -half, half);
    cursor.y = clamp(Math.round(numOr(cursor.y, 0)), -half, half);
    cursor.z = clamp(Math.round(numOr(cursor.z, 0)), -half, half);
    return half;
  };

  const sync = () => {
    ensureShapePlacementState(state);
    if (!els) return;
    syncing = true;

    const half = clampCursorToGrid();
    const tool = state.shapeTool;

    if (els.shapeSelect) els.shapeSelect.value = normalizeShape(tool.shape);
    if (els.colorSelect) els.colorSelect.value = String(clamp(Math.round(tool.colorIndex), 0, COLOR_OPTIONS.length - 1));

    setValuePair(els.posXRange, els.posXNumber, tool.cursor.x);
    setValuePair(els.posYRange, els.posYNumber, tool.cursor.y);
    setValuePair(els.posZRange, els.posZNumber, tool.cursor.z);

    [els.posXRange, els.posYRange, els.posZRange, els.posXNumber, els.posYNumber, els.posZNumber].forEach((input) => {
      if (!input) return;
      input.min = String(-half);
      input.max = String(half);
    });

    const yaw = clamp(numOr(tool.rotation?.y, 0), -180, 180);
    setValuePair(els.rotYRange, els.rotYNumber, Math.round(yaw));

    setValuePair(els.scaleRange, els.scaleNumber, tool.scale.toFixed(2));
    setValuePair(els.stretchXRange, els.stretchXNumber, tool.stretch.x.toFixed(2));
    setValuePair(els.stretchYRange, els.stretchYNumber, tool.stretch.y.toFixed(2));
    setValuePair(els.stretchZRange, els.stretchZNumber, tool.stretch.z.toFixed(2));
    setValuePair(els.erosionRange, els.erosionNumber, clamp(Math.round(numOr(state.erosionSteps, 0)), 0, 6));
    setValuePair(els.dilationRange, els.dilationNumber, clamp(Math.round(numOr(state.dilationSteps, 0)), 0, 6));

    if (els.modeTranslate) {
      els.modeTranslate.classList.toggle("active", tool.mode === "translate");
    }
    if (els.modeRotate) {
      els.modeRotate.classList.toggle("active", tool.mode === "rotate");
    }

    updateShapeCount();
    syncCollapsedUi();
    syncing = false;
  };

  function bindRangeNumber(rangeEl, numberEl, onValue, toNumber = Number) {
    const handle = (raw) => {
      if (syncing) return;
      onValue(toNumber(raw));
      sync();
    };
    rangeEl?.addEventListener("input", () => handle(rangeEl.value));
    numberEl?.addEventListener("input", () => handle(numberEl.value));
  }

  function bindEvents() {
    if (!els) return;

    els.shapeSelect?.addEventListener("change", () => {
      if (syncing) return;
      state.shapeTool.shape = normalizeShape(els.shapeSelect.value);
      emitToolChange();
      sync();
    });

    els.colorSelect?.addEventListener("change", () => {
      if (syncing) return;
      state.shapeTool.colorIndex = clamp(Math.round(numOr(els.colorSelect.value, 0)), 0, COLOR_OPTIONS.length - 1);
      emitToolChange();
      sync();
    });

    els.modeTranslate?.addEventListener("click", () => setMode("translate"));
    els.modeRotate?.addEventListener("click", () => setMode("rotate"));
    els.collapseToggle?.addEventListener("click", () => {
      state.shapePanelCollapsed = !state.shapePanelCollapsed;
      syncCollapsedUi();
    });

    bindRangeNumber(els.posXRange, els.posXNumber, (value) => {
      state.shapeTool.cursor.x = value;
      clampCursorToGrid();
      emitToolChange();
    }, (v) => Math.round(numOr(v, 0)));
    bindRangeNumber(els.posYRange, els.posYNumber, (value) => {
      state.shapeTool.cursor.y = value;
      clampCursorToGrid();
      emitToolChange();
    }, (v) => Math.round(numOr(v, 0)));
    bindRangeNumber(els.posZRange, els.posZNumber, (value) => {
      state.shapeTool.cursor.z = value;
      clampCursorToGrid();
      emitToolChange();
    }, (v) => Math.round(numOr(v, 0)));

    bindRangeNumber(els.rotYRange, els.rotYNumber, (value) => {
      state.shapeTool.rotation.y = clamp(numOr(value, 0), -180, 180);
      emitToolChange();
    }, (v) => numOr(v, 0));

    bindRangeNumber(els.scaleRange, els.scaleNumber, (value) => {
      state.shapeTool.scale = clamp(numOr(value, 1), 0.25, 4);
      emitToolChange();
    }, (v) => numOr(v, 1));
    bindRangeNumber(els.stretchXRange, els.stretchXNumber, (value) => {
      state.shapeTool.stretch.x = clamp(numOr(value, 1), 0.25, 3);
      emitToolChange();
    }, (v) => numOr(v, 1));
    bindRangeNumber(els.stretchYRange, els.stretchYNumber, (value) => {
      state.shapeTool.stretch.y = clamp(numOr(value, 1), 0.25, 3);
      emitToolChange();
    }, (v) => numOr(v, 1));
    bindRangeNumber(els.stretchZRange, els.stretchZNumber, (value) => {
      state.shapeTool.stretch.z = clamp(numOr(value, 1), 0.25, 3);
      emitToolChange();
    }, (v) => numOr(v, 1));

    bindRangeNumber(els.erosionRange, els.erosionNumber, (value) => {
      state.erosionSteps = clamp(Math.round(numOr(value, 0)), 0, 6);
      emitTransformChange();
    }, (v) => Math.round(numOr(v, 0)));
    bindRangeNumber(els.dilationRange, els.dilationNumber, (value) => {
      state.dilationSteps = clamp(Math.round(numOr(value, 0)), 0, 6);
      emitTransformChange();
    }, (v) => Math.round(numOr(v, 0)));

    els.placeButton?.addEventListener("click", () => {
      if (syncing) return;
      const instance = makeShapeInstanceFromTool(state.shapeTool);
      onPlaceShape?.(instance);
      updateShapeCount();
    });

    els.undoButton?.addEventListener("click", () => {
      if (syncing) return;
      onUndoShape?.();
      updateShapeCount();
    });

    els.clearButton?.addEventListener("click", () => {
      if (syncing) return;
      onClearShapes?.();
      updateShapeCount();
    });
  }

  loadTemplateHtml().then((html) => {
    if (destroyed) return;
    host.innerHTML = html;
    els = {
      shapeSelect: host.querySelector("[data-shape-select]"),
      colorSelect: host.querySelector("[data-color-select]"),
      modeTranslate: host.querySelector('[data-shape-mode="translate"]'),
      modeRotate: host.querySelector('[data-shape-mode="rotate"]'),
      posXRange: host.querySelector("[data-pos-x-range]"),
      posYRange: host.querySelector("[data-pos-y-range]"),
      posZRange: host.querySelector("[data-pos-z-range]"),
      posXNumber: host.querySelector("[data-pos-x-number]"),
      posYNumber: host.querySelector("[data-pos-y-number]"),
      posZNumber: host.querySelector("[data-pos-z-number]"),
      rotYRange: host.querySelector("[data-rot-y-range]"),
      rotYNumber: host.querySelector("[data-rot-y-number]"),
      scaleRange: host.querySelector("[data-scale-range]"),
      scaleNumber: host.querySelector("[data-scale-number]"),
      stretchXRange: host.querySelector("[data-stretch-x-range]"),
      stretchYRange: host.querySelector("[data-stretch-y-range]"),
      stretchZRange: host.querySelector("[data-stretch-z-range]"),
      stretchXNumber: host.querySelector("[data-stretch-x-number]"),
      stretchYNumber: host.querySelector("[data-stretch-y-number]"),
      stretchZNumber: host.querySelector("[data-stretch-z-number]"),
      erosionRange: host.querySelector("[data-erosion-range]"),
      erosionNumber: host.querySelector("[data-erosion-number]"),
      dilationRange: host.querySelector("[data-dilation-range]"),
      dilationNumber: host.querySelector("[data-dilation-number]"),
      placeButton: host.querySelector('[data-shape-action="place"]'),
      undoButton: host.querySelector('[data-shape-action="undo"]'),
      clearButton: host.querySelector('[data-shape-action="clear"]'),
      shapeCount: host.querySelector("[data-shape-count]"),
      collapseToggle: host.querySelector("[data-shape-collapse-toggle]"),
      collapsibleBody: host.querySelector("[data-shape-collapsible]"),
    };

    if (els.shapeSelect && els.shapeSelect.options.length === 0) {
      SHAPE_OPTIONS.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        els.shapeSelect.appendChild(option);
      });
    }

    if (els.colorSelect && els.colorSelect.options.length === 0) {
      COLOR_OPTIONS.forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt.value);
        option.textContent = opt.label;
        els.colorSelect.appendChild(option);
      });
    }

    bindEvents();
    sync();
  });

  return {
    sync,
    setMode,
    destroy() {
      destroyed = true;
      els = null;
      host.remove();
    },
  };
}
