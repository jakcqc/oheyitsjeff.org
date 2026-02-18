import { registerVisual } from "../helper/visualHelp.js";

function clampNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, fallback, min, max) {
  const n = Math.floor(clampNum(value, fallback));
  return Math.max(min, Math.min(max, n));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, clampNum(value, 0)));
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

const TAU = Math.PI * 2;

const PALETTES = {
  ink: {
    background: "#0b1722",
    strokes: ["#d6c7a2", "#9ab7d3", "#e6e0d0", "#5d7a93"],
  },
  rose: {
    background: "#2a1410",
    strokes: ["#f1d6c5", "#c9837d", "#f4e6da", "#a55458"],
  },
  jade: {
    background: "#0e1f1a",
    strokes: ["#e7d6b3", "#7cb39a", "#cfd8cc", "#4c7a67"],
  },
  ember: {
    background: "#221812",
    strokes: ["#f5d6b4", "#c97c54", "#f0e1cf", "#874a35"],
  },
  tide: {
    background: "#102123",
    strokes: ["#e1d5c1", "#7ba9b6", "#f2eadf", "#44717d"],
  },
  citrus: {
    background: "#1f1a10",
    strokes: ["#f2e2b8", "#d49b3f", "#f0f0e6", "#9b5a24"],
  },
  mono: {
    background: "#f4f4f2",
    strokes: ["#111111", "#5a5a5a", "#9b9b9b", "#2f2f2f"],
  },
  noir: {
    background: "#0d0d0d",
    strokes: ["#f2f2f2", "#bdbdbd", "#e0e0e0"],
  },
};

function parseViewBox(viewBox) {
  if (!viewBox) return null;
  const parts = viewBox.split(/\s+/).map(Number).filter(Number.isFinite);
  if (parts.length !== 4) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

registerVisual("marbledPatterns", {
  title: "Marbled Patterns",
  description: "Flowing, marbled ribbons shaped by swirls and sine-driven veins.",
  params: [
    {
      key: "bandCount",
      label: "bands",
      type: "number",
      default: 261,
      min: 6,
      max: 800,
      step: 1,
      category: "Structure",
    },
    {
      key: "bandWidth",
      label: "band width",
      type: "number",
      default: 4,
      min: 2,
      max: 48,
      step: 1,
      category: "Structure",
    },
    {
      key: "bandJitter",
      label: "band jitter",
      type: "number",
      default: 80,
      min: 0,
      max: 80,
      step: 1,
      category: "Structure",
    },
    {
      key: "amplitude",
      label: "wave amplitude",
      type: "number",
      default: 9,
      min: 0,
      max: 300,
      step: 1,
      category: "Flow",
    },
    {
      key: "frequency",
      label: "wave frequency",
      type: "number",
      default: 0.4,
      min: 0.4,
      max: 16,
      step: 0.1,
      category: "Flow",
    },
    {
      key: "noise",
      label: "noise",
      type: "number",
      default: 0,
      min: 0,
      max: 80,
      step: 1,
      category: "Flow",
    },
    {
      key: "detail",
      label: "detail",
      type: "number",
      default: 12,
      min: 4,
      max: 50,
      step: 1,
      category: "Flow",
    },
    {
      key: "swirlCount",
      label: "swirl count",
      type: "number",
      default: 4,
      min: 0,
      max: 8,
      step: 1,
      category: "Flow",
    },
    {
      key: "swirlStrength",
      label: "swirl strength",
      type: "number",
      default: 1.8,
      min: 0,
      max: 2.4,
      step: 0.05,
      category: "Flow",
    },
    {
      key: "swirlRadius",
      label: "swirl radius",
      type: "number",
      default: 360,
      min: 60,
      max: 520,
      step: 5,
      category: "Flow",
    },
    {
      key: "strokeOpacity",
      label: "stroke opacity",
      type: "number",
      default: 0.59,
      min: 0.2,
      max: 1,
      step: 0.01,
      category: "Styling",
    },
    {
      key: "strokeMode",
      label: "stroke mode",
      type: "boolean",
      default: true,
      category: "Styling",
      description: "Use a single stroke color for every band.",
    },
    {
      key: "strokeColor",
      label: "stroke color",
      type: "text",
      default: "#f2f2f2",
      category: "Styling",
    },
    {
      key: "seed",
      type: "number",
      default: 603430,
      min: 0,
      max: 999999,
      step: 1,
      category: "Styling",
    },
    {
      key: "palette",
      type: "select",
      default: "noir",
      options: Object.keys(PALETTES),
      category: "Styling",
    },
  ],
  defaultState: {
    bandCount: 1500,
    bandWidth: 10,
    bandJitter: 0,
    amplitude: 9,
    frequency: 0.4,
    noise: 0,
    detail: 4,
    swirlCount: 4,
    swirlStrength: 1.8,
    swirlRadius: 360,
    strokeOpacity: 0.2,
    strokeMode: false,
    strokeColor: "#f2f2f2",
    seed: 680324,
    palette: "jade",
    shouldRender: true,
    __xf: {
      ui: {
        splitCount: 1,
        activeTile: "0",
        rotateDeg: 90,
        preset: "",
        splitMode: "screen",
        applyToAll: false,
        tileTargets: "0",
        zoomFactor: 1.25,
        matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        zoomCenter: { x: null, y: null },
        translateVec: { x: 0, y: 0 },
        planeCount: 3,
        planeBaseScale: 1,
        planeScaleStep: -0.12,
        planeOpacity: 0.7,
        planeOpacityFalloff: 0.12,
        planeOffset: { x: 0, y: 0 },
        planeCenter: { x: null, y: null },
        groupOpen: {},
      },
      stack: [],
    },
    __ui: {
      tabsOpen: true,
      activeTab: "params",
      paramGroups: {
        System: false,
        Structure: false,
        Styling: true,
        Flow: true,
      },
      collapseParamsByDefault: true,
      ioOpen: true,
      configPinned: true,
      navHidden: false,
    },
    __propOps: {
      ui: {
        ruleText:
          '{\n        "selector": {"circle":{"r":{"range":[20,100]}}},\n        "apply": {"stroke": null}\n        }',
        lastPreview: "",
        showDocs: false,
      },
      stack: [],
    },
    __scriptOps: {
      ui: {
        codeText:
          '// ctx.root is the <g> subtree being processed\n// ctx.svg is the owning <svg>\n// ctx.create(tag) creates an SVG element\n//\n// Example: circle -> 6-gon (polygon)\n// for (const c of ctx.root.querySelectorAll("circle")) {\n//   const cx = Number(c.getAttribute("cx") || 0);\n//   const cy = Number(c.getAttribute("cy") || 0);\n//   const r = Number(c.getAttribute("r") || 0);\n//   const n = 6;\n//   const pts = Array.from({length:n}, (_,i) => {\n//     const a = (Math.PI*2*i)/n;\n//     return [cx + r*Math.cos(a), cy + r*Math.sin(a)].join(",");\n//   }).join(" ");\n//   const p = ctx.create("polygon");\n//   p.setAttribute("points", pts);\n//   for (const {name,value} of Array.from(c.attributes)) {\n//     if (name === "cx" || name === "cy" || name === "r") continue;\n//     p.setAttribute(name, value);\n//   }\n//   c.replaceWith(p);\n// }',
        fileName: "",
        selectedCacheKey: "",
        autoRunSelected: false,
        lastPreview: "",
        showDocs: false,
      },
      stack: [],
      cache: {},
    },
    __anim: {
      ui: {
        targetType: "params",
        paramTargets: [
          { key: "bandCount", from: 10, to: 800 },
          { key: "bandWidth", from: 1, to: 20 },
        ],
        paramKey: "",
        selector: "svg",
        svgKind: "attr",
        svgName: "opacity",
        durationSec: 7,
        fps: 24,
        easing: "linear",
        loop: true,
        yoyo: false,
        progress01: 1,
        autoFromCurrent: false,
        snapToEndOnStop: true,
        autoPlay: true,
      },
    },
    usePreset: false,
    presetSvg: "",
  },

  create({ mountEl }, state) {
    mountEl.innerHTML = "";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";

    const gScene = document.createElementNS(svg.namespaceURI, "g");
    const gBackground = document.createElementNS(svg.namespaceURI, "g");
    const gBands = document.createElementNS(svg.namespaceURI, "g");
    const gPreset = document.createElementNS(svg.namespaceURI, "g");
    gScene.appendChild(gBackground);
    gScene.appendChild(gBands);
    gScene.appendChild(gPreset);
    svg.appendChild(gScene);
    mountEl.appendChild(svg);

    let presetCache = { text: null, viewBox: null };

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      return {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      };
    };

    const syncPreset = (width, height) => {
      if (!state.usePreset || !state.presetSvg) {
        gPreset.style.display = "none";
        return false;
      }

      gPreset.style.display = "block";

      if (state.presetSvg !== presetCache.text) {
        presetCache.text = state.presetSvg;
        presetCache.viewBox = null;
        gPreset.innerHTML = "";

        try {
          const doc = new DOMParser().parseFromString(state.presetSvg, "image/svg+xml");
          const presetSvg = doc.querySelector("svg");
          if (presetSvg) {
            presetCache.viewBox = parseViewBox(presetSvg.getAttribute("viewBox"));
            const nodes = Array.from(presetSvg.children);
            nodes.forEach(node => {
              gPreset.appendChild(document.importNode(node, true));
            });
          }
        } catch (err) {
          console.warn("Preset SVG parse failed", err);
        }
      }

      const viewBox = presetCache.viewBox || { x: 0, y: 0, width, height };
      const scale = Math.min(width / viewBox.width, height / viewBox.height);
      const tx = (width - viewBox.width * scale) / 2 - viewBox.x * scale;
      const ty = (height - viewBox.height * scale) / 2 - viewBox.y * scale;
      gPreset.setAttribute("transform", `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`);

      return true;
    };

    const render = () => {
      const { width, height } = size();
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      const paletteKey = String(state.palette || "ink");
      const palette = PALETTES[paletteKey] || PALETTES.ink;

      gBackground.innerHTML = "";
      gBands.innerHTML = "";

      const bg = document.createElementNS(svg.namespaceURI, "rect");
      bg.setAttribute("x", "0");
      bg.setAttribute("y", "0");
      bg.setAttribute("width", width);
      bg.setAttribute("height", height);
      bg.setAttribute("fill", palette.background);
      gBackground.appendChild(bg);

      if (syncPreset(width, height)) {
        gBands.style.display = "none";
        return;
      }

      gBands.style.display = "block";

      const seed = Number(state.seed ?? Math.floor(Math.random() * 1_000_000));
      const rand = mulberry32(seed);
      const bandCount = Number(state.bandCount ?? 26);
      const bandWidth = Number(state.bandWidth ?? 14);
      const bandJitter = Number(state.bandJitter ?? 12);
      const amplitude = Number(state.amplitude ?? 60);
      const frequency = Number(state.frequency ?? 2.4);
      const noise = Number(state.noise ?? 12);
      const step = Number(state.detail ?? 12);
      const swirlCount = Number(state.swirlCount ?? 3);
      const swirlStrength = Number(state.swirlStrength ?? 0.9);
      const swirlRadius = Number(state.swirlRadius ?? 260);
      const strokeOpacity = Number(state.strokeOpacity ?? 1).toFixed(2);
      const singleStroke = !!state.strokeMode;
      const strokeColor = String(state.strokeColor || palette.strokes[0]);

      const swirls = Array.from({ length: swirlCount }, () => ({
        x: rand() * width,
        y: rand() * height,
        radius: swirlRadius * (0.65 + rand() * 0.6),
        strength: (rand() < 0.5 ? -1 : 1) * swirlStrength * (0.6 + rand() * 0.6),
      }));

      const applySwirl = (x, y) => {
        let px = x;
        let py = y;
        for (const swirl of swirls) {
          const dx = px - swirl.x;
          const dy = py - swirl.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= swirl.radius || dist < 1e-3) continue;
          const t = 1 - dist / swirl.radius;
          const ang = swirl.strength * t;
          const cos = Math.cos(ang);
          const sin = Math.sin(ang);
          const rx = dx * cos - dy * sin;
          const ry = dx * sin + dy * cos;
          px = swirl.x + rx;
          py = swirl.y + ry;
        }
        return [px, py];
      };

      const margin = Math.max(80, amplitude * 2.4);

      for (let i = 0; i < bandCount; i++) {
        const t = bandCount <= 1 ? 0.5 : i / (bandCount - 1);
        const baseY = t * height;
        const phase = rand() * TAU;
        const jitter = (rand() - 0.5) * bandJitter;
        const weight = bandWidth * (0.75 + rand() * 0.6);
        const color = singleStroke
          ? strokeColor
          : palette.strokes[i % palette.strokes.length];

        const points = [];
        for (let x = -margin; x <= width + margin; x += step) {
          const nx = x / Math.max(1, width);
          const wave = Math.sin(nx * TAU * frequency + phase);
          const y = baseY + jitter + wave * amplitude + (rand() - 0.5) * noise;
          points.push(applySwirl(x, y));
        }

        if (points.length < 2) continue;

        let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
        for (let p = 1; p < points.length; p++) {
          d += ` L ${points[p][0].toFixed(2)} ${points[p][1].toFixed(2)}`;
        }

        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", weight.toFixed(2));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-opacity", strokeOpacity);
        gBands.appendChild(path);
      }
    };

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        render();
      });
      observer.observe(mountEl);
    } else {
      window.addEventListener("resize", () => render());
    }

    return {
      render,
      resize: render,
      destroy: () => {
        if (observer) observer.disconnect();
      },
    };
  },
});
