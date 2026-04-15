import { registerVisual } from "../helper/visualHelp.js";

const PRESETS = {
  "Classic Tree": {
    axiom: "F",
    rules: { F: "F[+F]F[-F]F" },
    iterations: 4,
    angle: 25,
    step: 12,
    lengthDecay: 0.72,
    startAngle: -90,
  },
  "Fractal Plant": {
    axiom: "X",
    rules: { X: "F-[[X]+X]+F[+FX]-X", F: "FF" },
    iterations: 5,
    angle: 25,
    step: 8,
    lengthDecay: 0.7,
    startAngle: -90,
  },
  "Fern": {
    axiom: "X",
    rules: { X: "F+[[X]-X]-F[-FX]+X", F: "FF" },
    iterations: 5,
    angle: 25,
    step: 7,
    lengthDecay: 0.68,
    startAngle: -90,
  },
  "Symmetric Bush": {
    axiom: "X",
    rules: { X: "F[+X][-X]FX", F: "FF" },
    iterations: 5,
    angle: 20,
    step: 8,
    lengthDecay: 0.74,
    startAngle: -90,
  },
  "Seaweed": {
    axiom: "F",
    rules: { F: "FF-[-F+F+F]+[+F-F-F]" },
    iterations: 4,
    angle: 22,
    step: 10,
    lengthDecay: 0.7,
    startAngle: -90,
  },
};

const DEFAULT_PRESET = "Fractal Plant";

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hsl(h, s, l, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function normalizeRule(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function buildRules(state) {
  const rules = {};
  const ruleF = normalizeRule(state.ruleF);
  const ruleX = normalizeRule(state.ruleX);
  const ruleY = normalizeRule(state.ruleY);
  const ruleG = normalizeRule(state.ruleG);
  if (ruleF) rules.F = ruleF;
  if (ruleX) rules.X = ruleX;
  if (ruleY) rules.Y = ruleY;
  if (ruleG) rules.G = ruleG;
  return rules;
}

function pick(list, rand) {
  return list[Math.floor(rand() * list.length)];
}

function randRange(rand, min, max) {
  return min + (max - min) * rand();
}

function toConfigFromState(state) {
  return {
    preset: state.preset,
    axiom: state.axiom,
    ruleF: state.ruleF,
    ruleX: state.ruleX,
    ruleY: state.ruleY,
    ruleG: state.ruleG,
    iterations: state.iterations,
    maxChars: state.maxChars,
    angle: state.angle,
    startAngle: state.startAngle,
    step: state.step,
    lengthDecay: state.lengthDecay,
    lineWidth: state.lineWidth,
    widthDecay: state.widthDecay,
    strokeHueStart: state.strokeHueStart,
    strokeHueEnd: state.strokeHueEnd,
    strokeSaturation: state.strokeSaturation,
    strokeLightness: state.strokeLightness,
    strokeOpacity: state.strokeOpacity,
    drawLeaves: state.drawLeaves,
    leafSize: state.leafSize,
    leafDensity: state.leafDensity,
    leafDepthMin: state.leafDepthMin,
    leafHue: state.leafHue,
    leafSaturation: state.leafSaturation,
    leafLightness: state.leafLightness,
    seed: state.seed,
    jitterAngle: state.jitterAngle,
    jitterLength: state.jitterLength,
  };
}

function randomPresetConfig(rand) {
  const presetName = pick(Object.keys(PRESETS), rand);
  const preset = PRESETS[presetName];
  const iterations = Math.max(2, preset.iterations + Math.floor(randRange(rand, -2, 3)));
  const angle = preset.angle + randRange(rand, -12, 12);
  const step = preset.step * randRange(rand, 0.5, 1.6);
  const lengthDecay = Math.max(0.5, Math.min(0.92, preset.lengthDecay + randRange(rand, -0.12, 0.12)));
  const startAngle = preset.startAngle + randRange(rand, -18, 18);
  const hueSeed = randRange(rand, 40, 160);
  const leafHue = hueSeed + randRange(rand, -30, 40);

  return {
    preset: presetName,
    axiom: preset.axiom,
    ruleF: preset.rules.F || "",
    ruleX: preset.rules.X || "",
    ruleY: preset.rules.Y || "",
    ruleG: preset.rules.G || "",
    iterations,
    maxChars: Math.floor(randRange(rand, 20000, 80000)),
    angle,
    startAngle,
    step,
    lengthDecay,
    lineWidth: randRange(rand, 0.6, 3.2),
    widthDecay: randRange(rand, 0.5, 0.92),
    strokeHueStart: hueSeed + randRange(rand, -10, 10),
    strokeHueEnd: hueSeed - randRange(rand, 20, 70),
    strokeSaturation: randRange(rand, 25, 80),
    strokeLightness: randRange(rand, 18, 45),
    strokeOpacity: randRange(rand, 0.6, 0.95),
    drawLeaves: rand() > 0.15,
    leafSize: randRange(rand, 1.5, 6.5),
    leafDensity: randRange(rand, 0.2, 0.9),
    leafDepthMin: Math.floor(randRange(rand, 1, 6)),
    leafHue,
    leafSaturation: randRange(rand, 35, 80),
    leafLightness: randRange(rand, 28, 65),
    seed: Math.floor(randRange(rand, 0, 999999)),
    jitterAngle: randRange(rand, 0, 12),
    jitterLength: randRange(rand, 0, 0.25),
    instanceScale: randRange(rand, 0.6, 1.35),
  };
}

function expandLSystem(axiom, rules, iterations, maxChars) {
  let current = String(axiom || "");
  const iterCount = Math.max(0, Math.floor(iterations));
  const maxLen = Math.max(500, Math.floor(maxChars));

  for (let i = 0; i < iterCount; i += 1) {
    let next = "";
    for (const ch of current) {
      next += rules[ch] ?? ch;
      if (next.length >= maxLen) {
        next = next.slice(0, maxLen);
        break;
      }
    }
    current = next;
    if (current.length >= maxLen) break;
  }

  return current;
}

function buildSegments({
  commands,
  step,
  lengthDecay,
  angleDeg,
  startAngleDeg,
  jitterAngle,
  jitterLength,
  seed,
  leafDensity,
  leafDepthMin,
}) {
  const rand = mulberry32(seed);
  const angleBase = (angleDeg * Math.PI) / 180;
  const toRad = Math.PI / 180;
  const jitterAngleRad = jitterAngle * toRad;

  let x = 0;
  let y = 0;
  let angle = startAngleDeg * toRad;
  let depth = 0;
  let maxDepth = 0;

  const stack = [];
  const segments = [];
  const leaves = [];

  const recordBounds = (pt, bounds) => {
    bounds.minX = Math.min(bounds.minX, pt.x);
    bounds.maxX = Math.max(bounds.maxX, pt.x);
    bounds.minY = Math.min(bounds.minY, pt.y);
    bounds.maxY = Math.max(bounds.maxY, pt.y);
  };

  const bounds = {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
  };

  const shouldLeaf = (nextChar, currentDepth) => {
    if (currentDepth < leafDepthMin) return false;
    if (rand() > leafDensity) return false;
    if (!nextChar) return true;
    return nextChar === "]";
  };

  for (let i = 0; i < commands.length; i += 1) {
    const ch = commands[i];
    switch (ch) {
      case "F":
      case "G": {
        const len = step * Math.pow(lengthDecay, depth) * (1 + (rand() * 2 - 1) * jitterLength);
        const nx = x + Math.cos(angle) * len;
        const ny = y + Math.sin(angle) * len;
        if (ch === "F") {
          segments.push({ x1: x, y1: y, x2: nx, y2: ny, depth });
          maxDepth = Math.max(maxDepth, depth);
          if (shouldLeaf(commands[i + 1], depth)) {
            leaves.push({ x: nx, y: ny, depth });
          }
        }
        x = nx;
        y = ny;
        recordBounds({ x, y }, bounds);
        break;
      }
      case "f": {
        const len = step * Math.pow(lengthDecay, depth) * (1 + (rand() * 2 - 1) * jitterLength);
        x += Math.cos(angle) * len;
        y += Math.sin(angle) * len;
        recordBounds({ x, y }, bounds);
        break;
      }
      case "+": {
        angle += angleBase + (rand() * 2 - 1) * jitterAngleRad;
        break;
      }
      case "-": {
        angle -= angleBase + (rand() * 2 - 1) * jitterAngleRad;
        break;
      }
      case "|": {
        angle += Math.PI;
        break;
      }
      case "[": {
        stack.push({ x, y, angle, depth });
        depth += 1;
        maxDepth = Math.max(maxDepth, depth);
        break;
      }
      case "]": {
        const prev = stack.pop();
        if (prev) {
          x = prev.x;
          y = prev.y;
          angle = prev.angle;
          depth = prev.depth;
        }
        break;
      }
      default:
        break;
    }
  }

  return { segments, leaves, bounds, maxDepth };
}

registerVisual("lsystemGarden", {
  title: "L-System Garden",
  description: "Recursive L-system plants drawn in SVG. Tweak grammar, angle, and styling to grow new species.",
  params: [
    {
      key: "preset",
      label: "preset",
      type: "select",
      default: DEFAULT_PRESET,
      category: "Grammar",
      options: Object.keys(PRESETS),
    },
    {
      key: "axiom",
      label: "axiom",
      type: "text",
      default: PRESETS[DEFAULT_PRESET].axiom,
      category: "Grammar",
    },
    {
      key: "ruleF",
      label: "rule F",
      type: "text",
      default: PRESETS[DEFAULT_PRESET].rules.F || "",
      category: "Grammar",
    },
    {
      key: "ruleX",
      label: "rule X",
      type: "text",
      default: PRESETS[DEFAULT_PRESET].rules.X || "",
      category: "Grammar",
    },
    {
      key: "ruleY",
      label: "rule Y",
      type: "text",
      default: PRESETS[DEFAULT_PRESET].rules.Y || "",
      category: "Grammar",
    },
    {
      key: "ruleG",
      label: "rule G",
      type: "text",
      default: PRESETS[DEFAULT_PRESET].rules.G || "",
      category: "Grammar",
    },
    {
      key: "iterations",
      type: "number",
      default: PRESETS[DEFAULT_PRESET].iterations,
      category: "Grammar",
      min: 0,
      max: 7,
      step: 1,
    },
    {
      key: "maxChars",
      label: "max string size",
      type: "number",
      default: 50000,
      category: "Grammar",
      min: 1000,
      max: 200000,
      step: 1000,
    },
    {
      key: "angle",
      label: "turn angle",
      type: "number",
      default: PRESETS[DEFAULT_PRESET].angle,
      category: "Turtle",
      min: 1,
      max: 90,
      step: 0.5,
    },
    {
      key: "startAngle",
      label: "start angle",
      type: "number",
      default: PRESETS[DEFAULT_PRESET].startAngle,
      category: "Turtle",
      min: -180,
      max: 180,
      step: 1,
    },
    {
      key: "step",
      label: "segment length",
      type: "number",
      default: PRESETS[DEFAULT_PRESET].step,
      category: "Turtle",
      min: 1,
      max: 40,
      step: 0.5,
    },
    {
      key: "lengthDecay",
      label: "length decay",
      type: "number",
      default: PRESETS[DEFAULT_PRESET].lengthDecay,
      category: "Turtle",
      min: 0.5,
      max: 1,
      step: 0.01,
    },
    {
      key: "autoFit",
      label: "auto fit",
      type: "boolean",
      default: true,
      category: "Layout",
    },
    {
      key: "margin",
      label: "fit margin",
      type: "number",
      default: 0.08,
      category: "Layout",
      min: 0,
      max: 0.3,
      step: 0.01,
    },
    {
      key: "originX",
      label: "origin x",
      type: "number",
      default: 0.5,
      category: "Layout",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "originY",
      label: "origin y",
      type: "number",
      default: 0.95,
      category: "Layout",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "forestMode",
      label: "mode",
      type: "select",
      default: "single",
      category: "Forest",
      options: ["single", "forest"],
    },
    {
      key: "forestCount",
      label: "count",
      type: "number",
      default: 6,
      category: "Forest",
      min: 1,
      max: 30,
      step: 1,
    },
    {
      key: "forestSpacing",
      label: "spacing",
      type: "number",
      default: 24,
      category: "Forest",
      min: 0,
      max: 240,
      step: 2,
    },
    {
      key: "forestScale",
      label: "scale",
      type: "number",
      default: 1,
      category: "Forest",
      min: 0.4,
      max: 1.6,
      step: 0.05,
    },
    {
      key: "forestAnchor",
      label: "anchor",
      type: "select",
      default: "center",
      category: "Forest",
      options: ["center", "bottom"],
    },
    {
      type: "button",
      key: "randomForest",
      label: "Generate Random Forest",
      category: "Forest",
      onClick: ({ state }) => {
        const count = Math.max(1, Math.floor(clampNum(state.forestCount, 6)));
        const rand = mulberry32(Math.floor(Math.random() * 1_000_000));
        state.__forest = {
          instances: Array.from({ length: count }, () => randomPresetConfig(rand)),
        };
        state.forestMode = "forest";
      },
    },
    {
      key: "lineWidth",
      label: "line width",
      type: "number",
      default: 1.6,
      category: "Styling",
      min: 0.2,
      max: 6,
      step: 0.1,
    },
    {
      key: "widthDecay",
      label: "width decay",
      type: "number",
      default: 0.8,
      category: "Styling",
      min: 0.3,
      max: 1,
      step: 0.02,
    },
    {
      key: "strokeHueStart",
      label: "hue start",
      type: "number",
      default: 115,
      category: "Styling",
      min: 0,
      max: 360,
      step: 1,
    },
    {
      key: "strokeHueEnd",
      label: "hue end",
      type: "number",
      default: 60,
      category: "Styling",
      min: 0,
      max: 360,
      step: 1,
    },
    {
      key: "strokeSaturation",
      label: "saturation",
      type: "number",
      default: 48,
      category: "Styling",
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "strokeLightness",
      label: "lightness",
      type: "number",
      default: 32,
      category: "Styling",
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "strokeOpacity",
      label: "stroke opacity",
      type: "number",
      default: 0.9,
      category: "Styling",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "background",
      type: "select",
      default: "paper",
      category: "Styling",
      options: ["paper", "night", "ink"],
    },
    {
      key: "drawLeaves",
      label: "draw leaves",
      type: "boolean",
      default: true,
      category: "Leaves",
    },
    {
      key: "leafSize",
      label: "leaf size",
      type: "number",
      default: 3.5,
      category: "Leaves",
      min: 0.5,
      max: 10,
      step: 0.1,
    },
    {
      key: "leafDensity",
      label: "leaf density",
      type: "number",
      default: 0.6,
      category: "Leaves",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "leafDepthMin",
      label: "leaf depth min",
      type: "number",
      default: 2,
      category: "Leaves",
      min: 0,
      max: 8,
      step: 1,
    },
    {
      key: "leafHue",
      label: "leaf hue",
      type: "number",
      default: 110,
      category: "Leaves",
      min: 0,
      max: 360,
      step: 1,
    },
    {
      key: "leafSaturation",
      label: "leaf saturation",
      type: "number",
      default: 55,
      category: "Leaves",
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "leafLightness",
      label: "leaf lightness",
      type: "number",
      default: 45,
      category: "Leaves",
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "seed",
      label: "seed",
      type: "number",
      default: 42,
      category: "Randomness",
      min: 0,
      max: 999999,
      step: 1,
    },
    {
      key: "jitterAngle",
      label: "angle jitter",
      type: "number",
      default: 1,
      category: "Randomness",
      min: 0,
      max: 20,
      step: 0.2,
    },
    {
      key: "jitterLength",
      label: "length jitter",
      type: "number",
      default: 0.08,
      category: "Randomness",
      min: 0,
      max: 0.5,
      step: 0.01,
    },
    {
      type: "button",
      key: "randomizeSeed",
      label: "Randomize Seed",
      category: "Randomness",
      onClick: ({ state }) => {
        state.seed = Math.floor(Math.random() * 1_000_000);
      },
    },
  ],

  create({ mountEl }, state) {
    mountEl.innerHTML = "";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";

    const gRoot = document.createElementNS(svg.namespaceURI, "g");
    svg.appendChild(gRoot);
    mountEl.appendChild(svg);

    let lastPreset = null;

    const applyPreset = (presetName) => {
      const preset = PRESETS[presetName];
      if (!preset) return;
      state.axiom = preset.axiom;
      state.ruleF = preset.rules.F || "";
      state.ruleX = preset.rules.X || "";
      state.ruleY = preset.rules.Y || "";
      state.ruleG = preset.rules.G || "";
      state.iterations = preset.iterations;
      state.angle = preset.angle;
      state.step = preset.step;
      state.lengthDecay = preset.lengthDecay;
      state.startAngle = preset.startAngle;
    };

    const getSize = () => {
      const rect = mountEl.getBoundingClientRect();
      return {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      };
    };

    const backgroundFor = (name) => {
      switch (String(name || "").toLowerCase()) {
        case "night":
          return "#0b1020";
        case "ink":
          return "#f8f1e7";
        case "paper":
        default:
          return "#f7f5ef";
      }
    };

    const render = () => {
      if (state.preset !== lastPreset) {
        applyPreset(state.preset);
        lastPreset = state.preset;
      }

      const { width, height } = getSize();
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.style.background = backgroundFor(state.background);

      const renderInstance = (config, targetRect, anchorMode = "center", globalHeight = targetRect.height) => {
        const rules = buildRules(config);
        const commands = expandLSystem(config.axiom, rules, config.iterations, config.maxChars);

        const seed = Math.floor(clampNum(config.seed, 1));
        const step = clampNum(config.step, 8);
        const lengthDecay = clamp01(config.lengthDecay || 1);
        const angle = clampNum(config.angle, 20);
        const startAngle = clampNum(config.startAngle, -90);
        const jitterAngle = clampNum(config.jitterAngle, 0);
        const jitterLength = clampNum(config.jitterLength, 0);
        const leafDensity = clamp01(config.leafDensity);
        const leafDepthMin = Math.max(0, Math.floor(clampNum(config.leafDepthMin, 2)));

        const result = buildSegments({
          commands,
          step,
          lengthDecay,
          angleDeg: angle,
          startAngleDeg: startAngle,
          jitterAngle,
          jitterLength,
          seed,
          leafDensity,
          leafDepthMin,
        });

        const segments = result.segments;
        const leaves = result.leaves;
        const bounds = result.bounds;
        const maxDepth = Math.max(1, result.maxDepth);

        const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
        const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
        const margin = clamp01(state.margin) * Math.min(targetRect.width, targetRect.height);

        let scale = 1;
        if (state.autoFit) {
          scale = Math.min(
            (targetRect.width - margin * 2) / boundsWidth,
            (targetRect.height - margin * 2) / boundsHeight
          );
          scale = Number.isFinite(scale) ? scale : 1;
        }
        const scaleMultiplierRaw = config.instanceScale ?? config.forestScale ?? state.forestScale ?? 1;
        const scaleMultiplier = Number.isFinite(Number(scaleMultiplierRaw))
          ? Number(scaleMultiplierRaw)
          : 1;
        scale *= Math.max(0.3, Math.min(2, scaleMultiplier));

        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const originX = targetRect.x + targetRect.width / 2;
        const originY = anchorMode === "bottom"
          ? globalHeight - margin
          : targetRect.y + targetRect.height / 2;
        const anchorY = anchorMode === "bottom" ? bounds.maxY : centerY;
        const translateX = originX - centerX * scale;
        const translateY = originY - anchorY * scale;

        const g = document.createElementNS(svg.namespaceURI, "g");
        g.setAttribute("transform", `translate(${translateX}, ${translateY}) scale(${scale})`);

        const strokeOpacity = clamp01(config.strokeOpacity);
        const lineWidth = clampNum(config.lineWidth, 1.5);
        const widthDecay = clamp01(config.widthDecay || 1);
        const hueStart = clampNum(config.strokeHueStart, 120);
        const hueEnd = clampNum(config.strokeHueEnd, 40);
        const sat = clampNum(config.strokeSaturation, 50);
        const light = clampNum(config.strokeLightness, 35);

        const pathByDepth = new Map();
        for (const seg of segments) {
          const key = seg.depth;
          const path = pathByDepth.get(key) || "";
          pathByDepth.set(
            key,
            `${path}M ${seg.x1.toFixed(2)} ${seg.y1.toFixed(2)} L ${seg.x2.toFixed(2)} ${seg.y2.toFixed(2)} `
          );
        }

        for (const [depth, d] of pathByDepth.entries()) {
          const t = maxDepth > 0 ? depth / maxDepth : 0;
          const hue = lerp(hueStart, hueEnd, t);
          const width = Math.max(0.1, lineWidth * Math.pow(widthDecay, depth));
          const path = document.createElementNS(svg.namespaceURI, "path");
          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", hsl(hue, sat, light, strokeOpacity));
          path.setAttribute("stroke-width", String(width));
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          g.appendChild(path);
        }

        if (config.drawLeaves) {
          const leafColor = hsl(
            clampNum(config.leafHue, 110),
            clampNum(config.leafSaturation, 55),
            clampNum(config.leafLightness, 45),
            0.9
          );
          const leafSize = clampNum(config.leafSize, 3);
          const frag = document.createDocumentFragment();
          for (const leaf of leaves) {
            const c = document.createElementNS(svg.namespaceURI, "circle");
            c.setAttribute("cx", String(leaf.x));
            c.setAttribute("cy", String(leaf.y));
            c.setAttribute("r", String(leafSize * (1 - leaf.depth / (maxDepth + 1) * 0.4)));
            c.setAttribute("fill", leafColor);
            c.setAttribute("opacity", "0.9");
            frag.appendChild(c);
          }
          g.appendChild(frag);
        }

        gRoot.appendChild(g);
      };

      gRoot.innerHTML = "";

      const mode = state.forestMode === "forest" ? "forest" : "single";
      if (mode === "single") {
        const config = toConfigFromState(state);
        const originX = clamp01(state.originX) * width;
        const originY = clamp01(state.originY) * height;
        renderInstance(config, {
          x: originX - width / 2,
          y: originY - height / 2,
          width,
          height,
        });
        return;
      }

      const count = Math.max(1, Math.floor(clampNum(state.forestCount, 6)));
      if (!state.__forest || !Array.isArray(state.__forest.instances)) {
        state.__forest = { instances: Array.from({ length: count }, () => toConfigFromState(state)) };
      }
      if (state.__forest.instances.length !== count) {
        state.__forest.instances = Array.from({ length: count }, () => toConfigFromState(state));
      }

      const spacing = Math.max(0, clampNum(state.forestSpacing, 24));
      const rand = mulberry32(Math.floor(clampNum(state.seed, 1)) + 9917);
      const usableWidth = Math.max(1, width - spacing * 2);
      const step = count > 1 ? usableWidth / (count - 1) : 0;
      const jitter = Math.min(step * 0.45, spacing * 0.6 + step * 0.25);

      state.__forest.instances.slice(0, count).forEach((config, idx) => {
        let xCenter = width * 0.5;
        if (count > 1) {
          const base = spacing + idx * step;
          const jittered = base + (rand() * 2 - 1) * jitter;
          xCenter = Math.max(spacing, Math.min(width - spacing, jittered));
        }
        const cellWidth = Math.max(1, step || usableWidth);
        renderInstance({ ...config, forestScale: state.forestScale }, {
          x: xCenter - cellWidth / 2,
          y: 0,
          width: cellWidth,
          height,
        }, state.forestAnchor, height);
      });
    };

    const ro = new ResizeObserver(() => render());
    ro.observe(mountEl);

    render();
    return {
      render,
      destroy() {
        ro.disconnect();
      },
    };
  },
});
