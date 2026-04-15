import { registerVisual } from "../helper/visualHelp.js";
import { normalizeVector, sampleSpline } from "../helper/splineEffectsUtils.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const DEFAULT_VARIABLES = [
  { name: "amp", value: 18 },
  { name: "freq", value: 6 },
  { name: "bias", value: 4 },
];

const DEFAULT_ITEM_SETTINGS = {
  name: "Line",
  visible: true,
  renderMode: "line",
  closed: false,
  tension: 0.12,
  stepsPerSegment: 34,
  magnitudeMode: "function",
  magnitudeValue: 18,
  magnitudeExpr: "amp + 12 * abs(sin(freq * pi * t)) - bias * yn",
  negativeMode: "abs",
  moduloBase: 24,
  strokeColor: "#a7f3d0",
  accentColor: "#10b981",
  continuousStrokeWidth: 5,
  continuousOpacity: 0.95,
  dotMinRadius: 1,
  dotScale: 0.9,
  dotOpacity: 0.9,
  lineOrientation: "vertical",
  lineMinLength: 4,
  lineScale: 1.1,
  lineStrokeWidth: 2,
  lineOpacity: 0.92,
  points: [],
};

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function sanitizeVarName(name) {
  const raw = String(name || "").trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) ? raw : "";
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLineItem(state, overrides = {}) {
  const scene = state.scene;
  if (!Number.isFinite(scene.nextId)) scene.nextId = 1;
  const id = overrides.id ?? `line-${scene.nextId++}`;
  const name = overrides.name || `Line ${scene.items.length + 1}`;
  return {
    id,
    ...deepClone(DEFAULT_ITEM_SETTINGS),
    ...deepClone(overrides),
    name,
    points: Array.isArray(overrides.points) ? overrides.points.map(([x, y]) => [x, y]) : [],
  };
}

function ensureSceneState(state) {
  if (!state.scene || typeof state.scene !== "object") state.scene = {};
  const scene = state.scene;
  if (!Array.isArray(scene.items)) scene.items = [];
  if (!Array.isArray(scene.variables)) scene.variables = deepClone(DEFAULT_VARIABLES);
  if (!scene.generator || typeof scene.generator !== "object") scene.generator = {};
  const generator = scene.generator;
  if (!Number.isFinite(generator.minLines)) generator.minLines = 3;
  if (!Number.isFinite(generator.maxLines)) generator.maxLines = 8;
  if (!Number.isFinite(generator.minPointsPerLine)) generator.minPointsPerLine = 3;
  if (!Number.isFinite(generator.maxPointsPerLine)) generator.maxPointsPerLine = 8;
  if (!Number.isFinite(generator.seed)) generator.seed = 1803;
  if (!Number.isFinite(generator.edgePadding)) {
    const legacyRadius = Number(generator.radius);
    generator.edgePadding = Number.isFinite(legacyRadius)
      ? clamp(legacyRadius * 0.18, 0.02, 0.12)
      : 0.04;
  }
  if (!Number.isFinite(generator.jitter)) generator.jitter = 0.12;
  if (!Number.isFinite(generator.minPointStep)) generator.minPointStep = 0.05;
  if (!Number.isFinite(generator.maxPointStep)) generator.maxPointStep = 0.14;
  if (!Number.isFinite(generator.closedChance)) generator.closedChance = 0.45;
  if (!generator.pointSampler) generator.pointSampler = "mixed";
  if (typeof generator.allowLine !== "boolean") generator.allowLine = true;
  if (typeof generator.allowDot !== "boolean") generator.allowDot = true;
  if (typeof generator.allowContinuous !== "boolean") generator.allowContinuous = true;

  if (!Number.isFinite(state.controlPointRadius)) state.controlPointRadius = 7;
  if (typeof state.showGuides !== "boolean") state.showGuides = true;
  if (!state.backgroundColor) state.backgroundColor = "#081c15";
  if (typeof scene.editorPanelVisible !== "boolean") scene.editorPanelVisible = true;

  if (scene.items.length === 0 && state.points?.manual?.length) {
    scene.items.push(
      createLineItem(state, {
        name: "Migrated Line",
        renderMode: state.renderMode || DEFAULT_ITEM_SETTINGS.renderMode,
        closed: !!state.closed,
        tension: Number(state.tension ?? DEFAULT_ITEM_SETTINGS.tension),
        stepsPerSegment: Number(state.stepsPerSegment ?? DEFAULT_ITEM_SETTINGS.stepsPerSegment),
        magnitudeMode: state.magnitudeMode || DEFAULT_ITEM_SETTINGS.magnitudeMode,
        magnitudeValue: Number(state.magnitudeValue ?? DEFAULT_ITEM_SETTINGS.magnitudeValue),
        magnitudeExpr: state.magnitudeExpr || DEFAULT_ITEM_SETTINGS.magnitudeExpr,
        negativeMode: state.negativeMode || DEFAULT_ITEM_SETTINGS.negativeMode,
        moduloBase: Number(state.moduloBase ?? DEFAULT_ITEM_SETTINGS.moduloBase),
        strokeColor: state.strokeColor || DEFAULT_ITEM_SETTINGS.strokeColor,
        accentColor: state.accentColor || DEFAULT_ITEM_SETTINGS.accentColor,
        continuousStrokeWidth: Number(state.continuousStrokeWidth ?? DEFAULT_ITEM_SETTINGS.continuousStrokeWidth),
        continuousOpacity: Number(state.continuousOpacity ?? DEFAULT_ITEM_SETTINGS.continuousOpacity),
        dotMinRadius: Number(state.dotMinRadius ?? DEFAULT_ITEM_SETTINGS.dotMinRadius),
        dotScale: Number(state.dotScale ?? DEFAULT_ITEM_SETTINGS.dotScale),
        dotOpacity: Number(state.dotOpacity ?? DEFAULT_ITEM_SETTINGS.dotOpacity),
        lineOrientation: state.lineOrientation || DEFAULT_ITEM_SETTINGS.lineOrientation,
        lineMinLength: Number(state.lineMinLength ?? DEFAULT_ITEM_SETTINGS.lineMinLength),
        lineScale: Number(state.lineScale ?? DEFAULT_ITEM_SETTINGS.lineScale),
        lineStrokeWidth: Number(state.lineStrokeWidth ?? DEFAULT_ITEM_SETTINGS.lineStrokeWidth),
        lineOpacity: Number(state.lineOpacity ?? DEFAULT_ITEM_SETTINGS.lineOpacity),
        points: state.points.manual,
      })
    );
  }

  if (scene.items.length === 0) generateProceduralScene(state);
  if (!scene.activeItemId || !scene.items.some(item => item.id === scene.activeItemId)) {
    scene.activeItemId = scene.items[0]?.id ?? null;
  }
}

function getVariablesMap(state) {
  ensureSceneState(state);
  const out = {};
  for (const variable of state.scene.variables) {
    const name = sanitizeVarName(variable?.name);
    if (!name) continue;
    const value = Number(variable?.value);
    out[name] = Number.isFinite(value) ? value : 0;
  }
  return out;
}

function getActiveItem(state) {
  ensureSceneState(state);
  return state.scene.items.find(item => item.id === state.scene.activeItemId) || null;
}

function compileMagnitude(item) {
  if (item.magnitudeMode !== "function") {
    const value = Number(item.magnitudeValue);
    return {
      ok: true,
      error: "",
      evaluate: () => (Number.isFinite(value) ? value : 0),
    };
  }

  const expr = String(item.magnitudeExpr || "").trim() || "0";
  if (!window.math?.compile) {
    return { ok: false, error: "math.js unavailable.", evaluate: () => 0 };
  }

  try {
    const compiled = window.math.compile(expr);
    return {
      ok: true,
      error: "",
      evaluate: (scope) => {
        const result = compiled.evaluate(scope);
        const number = typeof result === "number" ? result : Number(result?.valueOf?.());
        return Number.isFinite(number) ? number : 0;
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Formula parse error.",
      evaluate: () => 0,
    };
  }
}

function resolveMagnitude(rawValue, negativeMode, moduloBase) {
  const value = Number.isFinite(rawValue) ? rawValue : 0;
  if (value >= 0) return value;
  if (negativeMode === "vanish") return 0;
  if (negativeMode === "modulo") {
    const base = Math.max(1e-6, Number(moduloBase) || 1);
    return ((value % base) + base) % base;
  }
  return Math.abs(value);
}

function pickPalette(index) {
  const palette = [
    ["#a7f3d0", "#10b981"],
    ["#f9a8d4", "#ec4899"],
    ["#93c5fd", "#3b82f6"],
    ["#fde68a", "#f59e0b"],
    ["#c4b5fd", "#8b5cf6"],
    ["#67e8f9", "#06b6d4"],
  ];
  return palette[index % palette.length];
}

const R2_PHI = 1.324717957244746;
const MIXED_POINT_SAMPLERS = ["halton", "r2", "curlicue"];
const CURLICUE_CONSTANTS = [
  (Math.sqrt(5) + 1) / 2,
  Math.LN2,
  Math.E,
  Math.SQRT2,
  Math.PI,
];

function wrapAngle(angle) {
  let next = angle;
  while (next <= -Math.PI) next += Math.PI * 2;
  while (next > Math.PI) next -= Math.PI * 2;
  return next;
}

function fract(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number - Math.floor(number);
}

function radicalInverse(index, base) {
  let value = Math.max(0, Math.floor(index));
  let inverse = 1 / base;
  let factor = inverse;
  let result = 0;
  while (value > 0) {
    result += (value % base) * factor;
    value = Math.floor(value / base);
    factor *= inverse;
  }
  return result;
}

function hash01(seed, salt = 0) {
  const seeded = ((Number(seed) || 0) ^ Math.imul((salt + 1) >>> 0, 0x9e3779b1)) >>> 0;
  return mulberry32(seeded)();
}

function reflectIntoRange(value, min, max) {
  if (!(max > min)) return min;
  let next = Number(value);
  if (!Number.isFinite(next)) next = min;
  while (next < min || next > max) {
    if (next < min) next = min + (min - next);
    if (next > max) next = max - (next - max);
  }
  return clamp(next, min, max);
}

function shortestToroidalDelta(from, to) {
  let delta = to - from;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

function scalePointToPadding(point, edgePadding) {
  const pad = clamp(edgePadding, 0, 0.2);
  const span = 1 - pad * 2;
  return {
    x: clamp(pad + clamp(point.x, 0, 1) * span, pad, 1 - pad),
    y: clamp(pad + clamp(point.y, 0, 1) * span, pad, 1 - pad),
  };
}

function makeFreshSeed() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return Number(values[0] % 1000000);
  }
  return Math.floor((Date.now() + Math.random() * 1000000) % 1000000);
}

function choosePointSampler(generatorMode, rand) {
  if (generatorMode === "mixed") {
    return MIXED_POINT_SAMPLERS[Math.floor(rand() * MIXED_POINT_SAMPLERS.length)];
  }
  return generatorMode || "random";
}

function createSequenceSampler(mode, { seed, lineIndex, jitter }) {
  const shiftX = hash01(seed, lineIndex * 17 + 11);
  const shiftY = hash01(seed, lineIndex * 17 + 12);
  const indexOffset = Math.floor(hash01(seed, lineIndex * 17 + 13) * 4096);

  if (mode === "curlicue") {
    const constantIndex = Math.floor(hash01(seed, lineIndex * 17 + 14) * CURLICUE_CONSTANTS.length) % CURLICUE_CONSTANTS.length;
    const s = fract(CURLICUE_CONSTANTS[constantIndex]);
    let theta = 0;
    let phi = hash01(seed, lineIndex * 17 + 15) * Math.PI * 2;
    let x = shiftX;
    let y = shiftY;

    return {
      nextTarget(pointIndex, desiredStep) {
        if (pointIndex === 0) return { x, y };
        theta = wrapAngle(theta + Math.PI * 2 * s);
        phi = wrapAngle(phi + theta);
        const stride = desiredStep * (2.6 + clamp(jitter, 0, 0.35) * 2.4);
        x = fract(x + Math.cos(phi) * stride);
        y = fract(y + Math.sin(phi) * stride);
        return { x, y };
      },
    };
  }

  return {
    nextTarget(pointIndex) {
      const sampleIndex = pointIndex + 1 + indexOffset;
      if (mode === "halton") {
        return {
          x: fract(shiftX + radicalInverse(sampleIndex, 2)),
          y: fract(shiftY + radicalInverse(sampleIndex, 3)),
        };
      }
      if (mode === "r2") {
        return {
          x: fract(shiftX + 0.5 + sampleIndex / R2_PHI),
          y: fract(shiftY + 0.5 + sampleIndex / (R2_PHI * R2_PHI)),
        };
      }
      return {
        x: hash01(seed, lineIndex * 65537 + sampleIndex * 2 + 21),
        y: hash01(seed, lineIndex * 65537 + sampleIndex * 2 + 22),
      };
    },
  };
}

function walkTowardTarget(prevPoint, targetPoint, desiredStep, rand, jitter, edgePadding) {
  const fallbackAngle = rand() * Math.PI * 2;
  const direction = normalizeVector(
    shortestToroidalDelta(prevPoint.x, targetPoint.x),
    shortestToroidalDelta(prevPoint.y, targetPoint.y),
    Math.cos(fallbackAngle),
    Math.sin(fallbackAngle)
  );
  const normal = { x: -direction.y, y: direction.x };
  const wobble = (rand() - 0.5) * clamp(jitter, 0, 0.35) * 0.8;
  const next = {
    x: prevPoint.x + direction.x * desiredStep + normal.x * desiredStep * wobble,
    y: prevPoint.y + direction.y * desiredStep + normal.y * desiredStep * wobble,
  };
  return {
    x: reflectIntoRange(next.x, edgePadding, 1 - edgePadding),
    y: reflectIntoRange(next.y, edgePadding, 1 - edgePadding),
  };
}

function generateProceduralPoints({
  rand,
  count,
  minStep,
  maxStep,
  closed,
  pointSampler,
  lineIndex,
  seed,
  jitter,
  edgePadding,
}) {
  const safeCount = Math.max(closed ? 3 : 2, Math.floor(count));
  const mode = choosePointSampler(pointSampler, rand);
  const sampler = createSequenceSampler(mode, { seed, lineIndex, jitter });
  const points = [];
  const start = scalePointToPadding(sampler.nextTarget(0, minStep), edgePadding);
  let current = start;
  points.push([current.x, current.y]);

  for (let pointIndex = 1; pointIndex < safeCount; pointIndex += 1) {
    const desiredStep = minStep + rand() * (maxStep - minStep);
    const target = closed && pointIndex === safeCount - 1
      ? start
      : scalePointToPadding(sampler.nextTarget(pointIndex, desiredStep), edgePadding);
    current = mode === "curlicue"
      ? target
      : walkTowardTarget(current, target, desiredStep, rand, jitter, edgePadding);
    points.push([current.x, current.y]);
  }

  return { points, pointSampler: mode };
}

function generateProceduralScene(state) {
  const {
    minLines,
    maxLines,
    minPointsPerLine,
    maxPointsPerLine,
    seed,
    edgePadding,
    jitter,
    minPointStep,
    maxPointStep,
    closedChance,
    pointSampler,
    allowLine,
    allowDot,
    allowContinuous,
  } = state.scene.generator;
  const rand = mulberry32(Number(seed) || 1);
  const lineMin = Math.max(1, Math.floor(Math.min(minLines || 1, maxLines || 1)));
  const lineMax = Math.max(lineMin, Math.floor(Math.max(minLines || 1, maxLines || 1)));
  const pointMin = Math.max(2, Math.floor(Math.min(minPointsPerLine || 2, maxPointsPerLine || 2)));
  const pointMax = Math.max(pointMin, Math.floor(Math.max(minPointsPerLine || 2, maxPointsPerLine || 2)));
  const count = lineMin + Math.floor(rand() * (lineMax - lineMin + 1));
  const wobble = clamp(jitter ?? 0.12, 0, 0.35);
  const stepMin = clamp(minPointStep ?? 0.05, 0.01, 0.45);
  const stepMax = clamp(maxPointStep ?? 0.14, stepMin, 0.55);
  const padding = clamp(edgePadding ?? 0.04, 0, 0.2);
  const closeRate = clamp(closedChance ?? 0.45, 0, 1);
  const allowedModes = [];
  if (allowLine) allowedModes.push("line");
  if (allowDot) allowedModes.push("dot");
  if (allowContinuous) allowedModes.push("continuous");
  if (!allowedModes.length) allowedModes.push("line");

  state.scene.items = [];
  for (let i = 0; i < count; i += 1) {
    const pointsCount = pointMin + Math.floor(rand() * (pointMax - pointMin + 1));
    const closed = pointsCount > 2 && rand() < closeRate;
    const lineSeed = Number(seed) + i * 7919;
    const generated = generateProceduralPoints({
      rand,
      count: pointsCount,
      minStep: stepMin,
      maxStep: stepMax,
      closed,
      pointSampler,
      lineIndex: i,
      seed: lineSeed,
      jitter: wobble,
      edgePadding: padding,
    });

    const [strokeColor, accentColor] = pickPalette(i);
    const renderMode = allowedModes[Math.floor(rand() * allowedModes.length)];
    state.scene.items.push(
      createLineItem(state, {
        name: `Generated ${i + 1} (${generated.pointSampler})`,
        points: generated.points,
        renderMode,
        closed,
        tension: 0.14 + rand() * 0.22,
        stepsPerSegment: 22 + Math.floor(rand() * 24),
        magnitudeMode: rand() > 0.35 ? "function" : "constant",
        magnitudeValue: 10 + Math.floor(rand() * 14),
        magnitudeExpr: `${6 + i} + amp * 0.4 + 10 * abs(sin((freq + ${i % 4}) * pi * t + ${i} * 0.35))`,
        //lineOrientation: i % 2 === 0 ? "normal" : "vertical",
        lineOrientation:"vertical",

        lineScale: 0.6 + rand() * 0.9,
        lineStrokeWidth: 1 + rand() * 2,
        dotScale: 0.45 + rand() * 0.75,
        continuousStrokeWidth: 3 + rand() * 6,
        strokeColor,
        accentColor,
      })
    );
  }

  state.scene.activeItemId = state.scene.items[0]?.id ?? null;
}

function regenerateScene(state) {
  if (!state.scene || typeof state.scene !== "object") state.scene = {};
  if (!state.scene.generator || typeof state.scene.generator !== "object") state.scene.generator = {};
  state.scene.generator.seed = makeFreshSeed();
  generateProceduralScene(state);
}

registerVisual("stepSplineLab", {
  title: "Step Spline Lab",
  description: "Edit a scene made of multiple splines. Click a rendered line to activate it, then tweak its own settings and shared variables.",
  params: [
    { key: "backgroundColor", label: "background", type: "text", default: "#ffeeee", category: "Scene" },
    { key: "showGuides", label: "show guides", type: "boolean", default: true, category: "Scene" },
    { key: "controlPointRadius", label: "handle size", type: "number", default: 7, min: 3, max: 24, step: 0.5, category: "Scene" },
    { key: "scene.generator.minLines", label: "min lines", type: "number", default: 3, min: 1, max: 24, step: 1, category: "Generator" },
    { key: "scene.generator.maxLines", label: "max lines", type: "number", default: 8, min: 1, max: 24, step: 1, category: "Generator" },
    { key: "scene.generator.minPointsPerLine", label: "min points per line", type: "number", default: 3, min: 2, max: 16, step: 1, category: "Generator" },
    { key: "scene.generator.maxPointsPerLine", label: "max points per line", type: "number", default: 8, min: 2, max: 16, step: 1, category: "Generator" },
    { key: "scene.generator.seed", label: "generator seed", type: "number", default: 1803, min: 0, max: 999999, step: 1, category: "Generator" },
    { key: "scene.generator.edgePadding", label: "edge padding", type: "number", default: 0.04, min: 0, max: 0.2, step: 0.01, category: "Generator" },
    { key: "scene.generator.jitter", label: "generator jitter", type: "number", default: 0.12, min: 0, max: 0.35, step: 0.01, category: "Generator" },
    { key: "scene.generator.minPointStep", label: "min next-point distance", type: "number", default: 0.05, min: 0.01, max: 0.45, step: 0.01, category: "Generator" },
    { key: "scene.generator.maxPointStep", label: "max next-point distance", type: "number", default: 0.14, min: 0.01, max: 0.55, step: 0.01, category: "Generator" },
    { key: "scene.generator.closedChance", label: "closed loop chance", type: "number", default: 0.45, min: 0, max: 1, step: 0.01, category: "Generator" },
    { key: "scene.generator.pointSampler", label: "point sampler", type: "select", default: "mixed", category: "Generator", options: ["mixed", "random", "halton", "r2", "curlicue"] },
    { key: "scene.generator.allowLine", label: "allow line mode", type: "boolean", default: true, category: "Generator" },
    { key: "scene.generator.allowDot", label: "allow dot mode", type: "boolean", default: true, category: "Generator" },
    { key: "scene.generator.allowContinuous", label: "allow continuous mode", type: "boolean", default: true, category: "Generator" },
    { type: "button", key: "generateScene", label: "Generate Fresh Scene", category: "Generator", onClick: ({ state }) => regenerateScene(state) },
  ],

  create({ mountEl }, state) {
    ensureSceneState(state);

    mountEl.innerHTML = "";
    mountEl.style.position = "relative";
    mountEl.style.overflow = "hidden";

    const svg = svgEl("svg", { width: "100%", height: "100%" });
    svg.style.display = "block";
    svg.style.touchAction = "none";

    const background = svgEl("rect");
    const gBackdrop = svgEl("g");
    const gMarks = svgEl("g");
    const gGuides = svgEl("g");
    const gControls = svgEl("g");
    svg.append(background, gBackdrop, gMarks, gGuides, gControls);

    const hud = document.createElement("div");
    const panel = document.createElement("div");
    mountEl.append(svg, hud, panel);

    Object.assign(hud.style, {
      position: "absolute",
      left: "14px",
      bottom: "14px",
      maxWidth: "min(560px, calc(100% - 28px))",
      padding: "10px 12px",
      borderRadius: "12px",
      fontFamily: "\"Kumbh Sans\", sans-serif",
      fontSize: "13px",
      lineHeight: "1.45",
      letterSpacing: "0.01em",
      color: "#f8fafc",
      background: "rgba(15, 23, 42, 0.72)",
      backdropFilter: "blur(12px)",
      pointerEvents: "none",
      display:"none"
    });

    Object.assign(panel.style, {
      position: "absolute",
      top: "56px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "calc(100% - 16px)",
      maxWidth: "400px",
      maxHeight: "calc(100% - 70px)",
      overflowY: "auto",
      overflowX: "hidden",
      boxSizing: "border-box",
      padding: "12px",
      borderRadius: "16px",
      background: "rgba(2, 6, 23, 0.82)",
      color: "#e2e8f0",
      fontFamily: "\"Kumbh Sans\", sans-serif",
      boxShadow: "0 18px 44px rgba(0,0,0,0.28)",
      backdropFilter: "blur(16px)",
      pointerEvents: "auto",
    });

    let dragIndex = -1;
    let resizeObserver = null;
    let renderCache = [];

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      return { width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) };
    };

    const applyPanelLayout = (bounds) => {
      const isMobile = bounds.width <= 700;
      if (isMobile) {
        Object.assign(panel.style, {
          top: "56px",
          bottom: "8px",
          left: "50%",
          right: "auto",
          transform: "translateX(-50%)",
          width: "calc(100% - 16px)",
          maxWidth: "calc(100% - 16px)",
          maxHeight: "calc(100% - 64px)",
        });
        return;
      }

      Object.assign(panel.style, {
        top: "56px",
        bottom: "14px",
        left: "auto",
        right: "14px",
        transform: "none",
        width: "min(calc(100% - 28px), 400px)",
        maxWidth: "400px",
        maxHeight: "calc(100% - 70px)",
      });
    };

    const toPixelPoint = ([x, y], bounds) => ({ x: clamp(x, 0, 1) * bounds.width, y: clamp(y, 0, 1) * bounds.height });
    const toNormalizedPoint = (x, y, bounds) => [clamp(x / Math.max(1, bounds.width), 0, 1), clamp(y / Math.max(1, bounds.height), 0, 1)];
    const getMousePoint = (event, bounds) => {
      const rect = svg.getBoundingClientRect();
      return { x: clamp(event.clientX - rect.left, 0, bounds.width), y: clamp(event.clientY - rect.top, 0, bounds.height) };
    };

    const findHandleIndex = (item, x, y, bounds) => {
      const radius = Number(state.controlPointRadius) || 7;
      const points = item.points.map(point => toPixelPoint(point, bounds));
      let hitIndex = -1;
      let bestDistance = radius + 10;
      for (let i = 0; i < points.length; i += 1) {
        const d = Math.hypot(points[i].x - x, points[i].y - y);
        if (d <= bestDistance) {
          bestDistance = d;
          hitIndex = i;
        }
      }
      return hitIndex;
    };

    const findItemNearPoint = (x, y) => {
      let best = null;
      for (const entry of renderCache) {
        for (const sample of entry.samples) {
          const d = Math.hypot(sample.x - x, sample.y - y);
          if (d > 18) continue;
          if (!best || d < best.distance) best = { itemId: entry.item.id, distance: d };
        }
      }
      return best;
    };

    const renderItem = (entry, bounds, vars, active) => {
      const { item, points, samples } = entry;
      const formula = compileMagnitude(item);
      const negativeMode = String(item.negativeMode || "abs");
      const moduloBase = Number(item.moduloBase) || 24;
      const strokeOpacityBoost = active ? 1 : 0.78;

      if (samples.length >= 2) {
        const curvePath = samples.map((sample, index) => `${index === 0 ? "M" : "L"} ${sample.x.toFixed(2)} ${sample.y.toFixed(2)}`).join(" ");
        if (item.renderMode === "continuous") {
          gMarks.appendChild(svgEl("path", {
            d: curvePath,
            fill: "none",
            stroke: item.accentColor || "#10b981",
            "stroke-width": Math.max(1, (Number(item.continuousStrokeWidth) || 4) + (active ? 6 : 4)),
            "stroke-opacity": active ? 0.28 : 0.12,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          }));
          gMarks.appendChild(svgEl("path", {
            d: curvePath,
            fill: "none",
            stroke: item.strokeColor || "#a7f3d0",
            "stroke-width": Math.max(1, Number(item.continuousStrokeWidth) || 4),
            "stroke-opacity": clamp((item.continuousOpacity ?? 0.95) * strokeOpacityBoost, 0.05, 1),
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          }));
        } else {
          for (const sample of samples) {
            const scope = {
              ...vars,
              x: sample.x,
              y: sample.y,
              xn: bounds.width > 0 ? sample.x / bounds.width * 2 - 1 : 0,
              yn: bounds.height > 0 ? sample.y / bounds.height * 2 - 1 : 0,
              t: sample.t,
              u: sample.u,
              nx: sample.nx,
              ny: sample.ny,
              tx: sample.tx,
              ty: sample.ty,
              distance: sample.distance,
              segmentIndex: sample.segmentIndex,
              stepIndex: sample.stepIndex,
              curveLength: sample.curveLength,
              pointCount: points.length,
              itemIndex: entry.itemIndex,
              lineIndex: entry.itemIndex,
              sceneCount: state.scene.items.length,
            };
            const raw = formula.evaluate(scope);
            if (negativeMode === "vanish" && Number.isFinite(raw) && raw < 0) continue;
            const value = resolveMagnitude(raw, negativeMode, moduloBase);

            if (item.renderMode === "dot") {
              const radius = Math.max(0, (Number(item.dotMinRadius) || 0) + value * (Number(item.dotScale) || 0));
              if (radius <= 0.01) continue;
              gMarks.appendChild(svgEl("circle", {
                cx: sample.x,
                cy: sample.y,
                r: radius,
                fill: item.strokeColor || "#a7f3d0",
                "fill-opacity": clamp((item.dotOpacity ?? 0.9) * strokeOpacityBoost, 0.05, 1),
              }));
              continue;
            }

            const lineLength = Math.max(0, (Number(item.lineMinLength) || 0) + value * (Number(item.lineScale) || 0));
            if (lineLength <= 0.01) continue;
            let direction = { x: 0, y: 1 };
            if (item.lineOrientation === "normal") direction = { x: sample.nx, y: sample.ny };
            if (item.lineOrientation === "tangent") direction = { x: sample.tx, y: sample.ty };
            const half = lineLength * 0.5;
            gMarks.appendChild(svgEl("line", {
              x1: sample.x - direction.x * half,
              y1: sample.y - direction.y * half,
              x2: sample.x + direction.x * half,
              y2: sample.y + direction.y * half,
              stroke: item.strokeColor || "#a7f3d0",
              "stroke-width": Math.max(0.1, Number(item.lineStrokeWidth) || 2),
              "stroke-opacity": clamp((item.lineOpacity ?? 0.92) * strokeOpacityBoost, 0.05, 1),
              "stroke-linecap": "round",
            }));
          }
        }
      }

      if (active && state.showGuides) {
        if (points.length) {
          const guidePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
          gGuides.appendChild(svgEl("path", {
            d: guidePath,
            fill: "none",
            stroke: item.accentColor || "#10b981",
            "stroke-width": 1.25,
            "stroke-opacity": 0.55,
            "stroke-dasharray": "8 8",
          }));
          if (item.closed && points.length > 2) {
            gGuides.appendChild(svgEl("line", {
              x1: points[points.length - 1].x,
              y1: points[points.length - 1].y,
              x2: points[0].x,
              y2: points[0].y,
              stroke: item.accentColor || "#10b981",
              "stroke-width": 1.25,
              "stroke-opacity": 0.45,
              "stroke-dasharray": "8 8",
            }));
          }
        }

        for (const point of points) {
          gControls.appendChild(svgEl("circle", {
            cx: point.x,
            cy: point.y,
            r: Math.max(2, Number(state.controlPointRadius) || 7),
            fill: item.accentColor || "#10b981",
            "fill-opacity": 0.9,
            stroke: "#ffffff",
            "stroke-width": 1.5,
          }));
        }
      }

      return formula;
    };

    const createField = (labelText, input) => {
      const wrap = document.createElement("label");
      wrap.style.display = "grid";
      wrap.style.gap = "4px";
      wrap.style.marginBottom = "8px";
      const label = document.createElement("span");
      label.textContent = labelText;
      label.style.fontSize = "11px";
      label.style.textTransform = "uppercase";
      label.style.letterSpacing = "0.08em";
      label.style.opacity = "0.72";
      wrap.append(label, input);
      return wrap;
    };

    const styleInput = (input) => {
      input.style.width = "100%";
      input.style.border = "1px solid rgba(148, 163, 184, 0.22)";
      input.style.background = "rgba(15, 23, 42, 0.7)";
      input.style.color = "#f8fafc";
      input.style.borderRadius = "10px";
      input.style.padding = "8px 10px";
      input.style.font = "inherit";
      return input;
    };

    const smallButton = (text, onClick, accent = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.onclick = onClick;
      button.style.border = "none";
      button.style.borderRadius = "10px";
      button.style.padding = "8px 10px";
      button.style.cursor = "pointer";
      button.style.font = "inherit";
      button.style.color = accent ? "#04111f" : "#e2e8f0";
      button.style.background = accent ? "#5eead4" : "rgba(30, 41, 59, 0.95)";
      return button;
    };

    const panelToggle = smallButton("Hide Editor", () => {
      state.scene.editorPanelVisible = !state.scene.editorPanelVisible;
      render();
    });
    Object.assign(panelToggle.style, {
      position: "absolute",
      top: "14px",
      right: "14px",
      zIndex: "3",
      padding: "8px 12px",
      boxShadow: "0 10px 24px rgba(0, 0, 0, 0.24)",
    });
    mountEl.appendChild(panelToggle);

    const buildPanel = (activeItem, lastFormula) => {
      panel.innerHTML = "";

      const heading = document.createElement("div");
      heading.textContent = "Scene Editor";
      heading.style.fontSize = "18px";
      heading.style.fontWeight = "600";
      heading.style.marginBottom = "6px";
      panel.appendChild(heading);

      const seedInfo = document.createElement("div");
      seedInfo.textContent = `Generator seed ${state.scene.generator.seed} • sampler ${state.scene.generator.pointSampler}`;
      seedInfo.style.fontSize = "12px";
      seedInfo.style.opacity = "0.76";
      seedInfo.style.marginBottom = "12px";
      panel.appendChild(seedInfo);

      const buttonRow = document.createElement("div");
      buttonRow.style.display = "grid";
      buttonRow.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
      buttonRow.style.gap = "8px";
      buttonRow.style.marginBottom = "14px";
      buttonRow.append(
        smallButton("Add Line", () => {
          const item = createLineItem(state, { name: `Line ${state.scene.items.length + 1}` });
          state.scene.items.push(item);
          state.scene.activeItemId = item.id;
          render();
        }, true),
        smallButton("Duplicate Active", () => {
          const item = getActiveItem(state);
          if (!item) return;
          const clone = createLineItem(state, { ...deepClone(item), id: undefined, name: `${item.name} Copy` });
          state.scene.items.push(clone);
          state.scene.activeItemId = clone.id;
          render();
        }),
        smallButton("Delete Active", () => {
          const active = getActiveItem(state);
          if (!active) return;
          state.scene.items = state.scene.items.filter(item => item.id !== active.id);
          if (!state.scene.items.length) state.scene.items.push(createLineItem(state));
          state.scene.activeItemId = state.scene.items[0].id;
          render();
        }),
        smallButton("Fresh Generate", () => {
          regenerateScene(state);
          render();
        })
      );
      panel.appendChild(buttonRow);

      const itemsTitle = document.createElement("div");
      itemsTitle.textContent = "Lines In Scene";
      itemsTitle.style.fontWeight = "600";
      itemsTitle.style.margin = "8px 0";
      panel.appendChild(itemsTitle);

      for (const item of state.scene.items) {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "24px 1fr";
        row.style.gap = "8px";
        row.style.alignItems = "start";
        row.style.padding = "8px";
        row.style.marginBottom = "6px";
        row.style.borderRadius = "12px";
        row.style.background = item.id === state.scene.activeItemId ? "rgba(16, 185, 129, 0.18)" : "rgba(15, 23, 42, 0.65)";
        row.style.border = item.id === state.scene.activeItemId ? "1px solid rgba(94, 234, 212, 0.35)" : "1px solid transparent";

        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = !!item.visible;
        toggle.onchange = () => {
          item.visible = !!toggle.checked;
          render();
        };

        const body = document.createElement("button");
        body.type = "button";
        body.style.textAlign = "left";
        body.style.background = "transparent";
        body.style.border = "none";
        body.style.color = "inherit";
        body.style.cursor = "pointer";
        body.onclick = () => {
          state.scene.activeItemId = item.id;
          render();
        };
        const summary = item.magnitudeMode === "function"
          ? item.magnitudeExpr
          : `constant ${item.magnitudeValue}`;
        body.innerHTML = `<div style="font-weight:600">${item.name}</div><div style="font-size:12px;opacity:.78">${item.renderMode}, ${item.points.length} pts</div><div style="font-size:11px;opacity:.62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${summary}</div>`;

        row.append(toggle, body);
        panel.appendChild(row);
      }

      const varsTitle = document.createElement("div");
      varsTitle.textContent = "Shared Variables";
      varsTitle.style.fontWeight = "600";
      varsTitle.style.margin = "14px 0 8px";
      panel.appendChild(varsTitle);

      for (let i = 0; i < state.scene.variables.length; i += 1) {
        const variable = state.scene.variables[i];
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "1fr 100px 34px";
        row.style.gap = "8px";
        row.style.marginBottom = "8px";

        const nameInput = styleInput(document.createElement("input"));
        nameInput.value = variable.name || "";
        nameInput.onchange = () => {
          variable.name = nameInput.value;
          render();
        };

        const valueInput = styleInput(document.createElement("input"));
        valueInput.type = "number";
        valueInput.step = "0.1";
        valueInput.value = String(variable.value ?? 0);
        valueInput.onchange = () => {
          variable.value = Number(valueInput.value);
          render();
        };

        const removeButton = smallButton("x", () => {
          state.scene.variables.splice(i, 1);
          render();
        });
        removeButton.style.padding = "8px 0";

        row.append(nameInput, valueInput, removeButton);
        panel.appendChild(row);
      }

      panel.appendChild(smallButton("Add Variable", () => {
        state.scene.variables.push({ name: `v${state.scene.variables.length + 1}`, value: 0 });
        render();
      }));

      if (!activeItem) return;

      const activeTitle = document.createElement("div");
      activeTitle.textContent = "Active Line";
      activeTitle.style.fontWeight = "600";
      activeTitle.style.margin = "16px 0 8px";
      panel.appendChild(activeTitle);

      const formulaBadge = document.createElement("div");
      formulaBadge.textContent = lastFormula?.ok ? "Formula ready" : `Formula error: ${lastFormula?.error || "unknown error"}`;
      formulaBadge.style.fontSize = "12px";
      formulaBadge.style.marginBottom = "8px";
      formulaBadge.style.color = lastFormula?.ok ? "#99f6e4" : "#fda4af";
      panel.appendChild(formulaBadge);

      const appendText = (label, value, onChange) => {
        const input = styleInput(document.createElement("input"));
        input.value = String(value ?? "");
        input.onchange = () => {
          onChange(input.value);
          render();
        };
        panel.appendChild(createField(label, input));
      };

      const appendNumber = (label, value, onChange, step = "0.1") => {
        const input = styleInput(document.createElement("input"));
        input.type = "number";
        input.step = step;
        input.value = String(value ?? 0);
        input.onchange = () => {
          onChange(Number(input.value));
          render();
        };
        panel.appendChild(createField(label, input));
      };

      const appendSelect = (label, value, options, onChange) => {
        const input = styleInput(document.createElement("select"));
        for (const option of options) {
          const node = document.createElement("option");
          node.value = option;
          node.textContent = option;
          input.appendChild(node);
        }
        input.value = String(value ?? options[0]);
        input.onchange = () => {
          onChange(input.value);
          render();
        };
        panel.appendChild(createField(label, input));
      };

      const appendCheckbox = (label, checked, onChange) => {
        const wrap = document.createElement("label");
        wrap.style.display = "flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "8px";
        wrap.style.marginBottom = "8px";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!checked;
        input.onchange = () => {
          onChange(!!input.checked);
          render();
        };
        const text = document.createElement("span");
        text.textContent = label;
        wrap.append(input, text);
        panel.appendChild(wrap);
      };

      appendText("name", activeItem.name, value => { activeItem.name = value || activeItem.name; });
      appendSelect("render mode", activeItem.renderMode, ["continuous", "dot", "line"], value => { activeItem.renderMode = value; });
      appendCheckbox("closed loop", activeItem.closed, value => { activeItem.closed = value; });
      appendSelect("magnitude mode", activeItem.magnitudeMode, ["constant", "function"], value => { activeItem.magnitudeMode = value; });
      if (activeItem.magnitudeMode === "function") appendText("formula", activeItem.magnitudeExpr, value => { activeItem.magnitudeExpr = value; });
      else appendNumber("constant magnitude", activeItem.magnitudeValue, value => { activeItem.magnitudeValue = value; });

      appendSelect("negative handling", activeItem.negativeMode, ["abs", "modulo", "vanish"], value => { activeItem.negativeMode = value; });
      appendText("stroke color", activeItem.strokeColor, value => { activeItem.strokeColor = value; });
      appendText("accent color", activeItem.accentColor, value => { activeItem.accentColor = value; });
      appendNumber("tension", activeItem.tension, value => { activeItem.tension = clamp(value, 0, 1); }, "0.01");
      appendNumber("steps per segment", activeItem.stepsPerSegment, value => { activeItem.stepsPerSegment = Math.max(4, Math.floor(value)); }, "1");

      if (activeItem.renderMode === "line") {
        appendSelect("line orientation", activeItem.lineOrientation, ["vertical", "normal", "tangent"], value => { activeItem.lineOrientation = value; });
        appendNumber("base length", activeItem.lineMinLength, value => { activeItem.lineMinLength = Math.max(0, value); });
        appendNumber("length scale", activeItem.lineScale, value => { activeItem.lineScale = Math.max(0, value); });
        appendNumber("stroke width", activeItem.lineStrokeWidth, value => { activeItem.lineStrokeWidth = Math.max(0.1, value); });
      } else if (activeItem.renderMode === "dot") {
        appendNumber("dot base radius", activeItem.dotMinRadius, value => { activeItem.dotMinRadius = Math.max(0, value); });
        appendNumber("dot scale", activeItem.dotScale, value => { activeItem.dotScale = Math.max(0, value); });
      } else {
        appendNumber("continuous width", activeItem.continuousStrokeWidth, value => { activeItem.continuousStrokeWidth = Math.max(1, value); });
      }
    };

    const render = () => {
      ensureSceneState(state);
      const bounds = size();
      const vars = getVariablesMap(state);
      const activeItem = getActiveItem(state);
      const editorVisible = state.scene.editorPanelVisible !== false;
      applyPanelLayout(bounds);

      svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
      background.setAttribute("width", bounds.width);
      background.setAttribute("height", bounds.height);
      background.setAttribute("fill", String(state.backgroundColor || "#081c15"));
      panel.style.display = editorVisible ? "block" : "none";
      panelToggle.textContent = editorVisible ? "Hide Editor" : "Show Editor";
      panelToggle.setAttribute("aria-expanded", editorVisible ? "true" : "false");

      gBackdrop.innerHTML = "";
      gMarks.innerHTML = "";
      gGuides.innerHTML = "";
      gControls.innerHTML = "";
      renderCache = [];

      for (let i = 0; i < 14; i += 1) {
        const x = (i / 13) * bounds.width;
        const y = ((13 - i) / 13) * bounds.height;
        gBackdrop.appendChild(svgEl("line", {
          x1: x,
          y1: 0,
          x2: bounds.width,
          y2: y,
          stroke: "#ffffff",
          "stroke-opacity": i % 2 === 0 ? 0.04 : 0.02,
          "stroke-width": 1,
        }));
      }

      for (let i = 0; i < state.scene.items.length; i += 1) {
        const item = state.scene.items[i];
        if (!item.visible) continue;
        const points = item.points.map(point => toPixelPoint(point, bounds));
        const samples = sampleSpline(points, Number(item.stepsPerSegment) || 24, Number(item.tension) || 0, !!item.closed);
        const entry = { item, itemIndex: i, points, samples };
        renderCache.push(entry);
      }

      let activeFormula = null;
      for (const entry of renderCache) {
        const isActive = entry.item.id === state.scene.activeItemId;
        const formula = renderItem(entry, bounds, vars, isActive);
        if (isActive) activeFormula = formula;
      }

      const active = getActiveItem(state);
      const activeSamples = renderCache.find(entry => entry.item.id === active?.id)?.samples || [];
      hud.textContent = active
        ? `${state.scene.items.length} lines in scene. Active: ${active.name}. Click a rendered line to activate it, click empty space to add points to the active line, drag handles to edit, right-click a handle to remove it. Shared vars: ${Object.keys(vars).join(", ") || "none"}.`
        : `${state.scene.items.length} lines in scene.`;

      buildPanel(active, activeFormula || { ok: true });
      void activeSamples;
    };

    const onPointerDown = (event) => {
      ensureSceneState(state);
      const bounds = size();
      const point = getMousePoint(event, bounds);
      const activeItem = getActiveItem(state);

      if (event.button === 2) return;

      if (activeItem) {
        const handleIndex = findHandleIndex(activeItem, point.x, point.y, bounds);
        if (handleIndex >= 0) {
          dragIndex = handleIndex;
          svg.setPointerCapture?.(event.pointerId);
          render();
          return;
        }
      }

      const hitItem = findItemNearPoint(point.x, point.y);
      if (hitItem) {
        state.scene.activeItemId = hitItem.itemId;
        render();
        return;
      }

      if (!activeItem) return;
      activeItem.points.push(toNormalizedPoint(point.x, point.y, bounds));
      render();
    };

    const onPointerMove = (event) => {
      if (dragIndex < 0) return;
      const activeItem = getActiveItem(state);
      if (!activeItem) return;
      const bounds = size();
      const point = getMousePoint(event, bounds);
      activeItem.points[dragIndex] = toNormalizedPoint(point.x, point.y, bounds);
      render();
    };

    const stopDrag = (event) => {
      if (dragIndex >= 0 && event?.pointerId != null) svg.releasePointerCapture?.(event.pointerId);
      dragIndex = -1;
    };

    const onContextMenu = (event) => {
      const activeItem = getActiveItem(state);
      if (!activeItem) return;
      const bounds = size();
      const point = getMousePoint(event, bounds);
      const handleIndex = findHandleIndex(activeItem, point.x, point.y, bounds);
      if (handleIndex < 0) return;
      event.preventDefault();
      activeItem.points.splice(handleIndex, 1);
      render();
    };

    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", stopDrag);
    svg.addEventListener("pointercancel", stopDrag);
    svg.addEventListener("contextmenu", onContextMenu);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => render());
      resizeObserver.observe(mountEl);
    } else {
      window.addEventListener("resize", render);
    }

    return {
      render,
      destroy() {
        svg.removeEventListener("pointerdown", onPointerDown);
        svg.removeEventListener("pointermove", onPointerMove);
        svg.removeEventListener("pointerup", stopDrag);
        svg.removeEventListener("pointercancel", stopDrag);
        svg.removeEventListener("contextmenu", onContextMenu);
        if (resizeObserver) resizeObserver.disconnect();
        else window.removeEventListener("resize", render);
      },
    };
  },
});
