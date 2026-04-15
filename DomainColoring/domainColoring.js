import { registerVisual, runVisualApp } from "../helper/visualHelp.js";

const TAU = Math.PI * 2;
const EPS = 1e-12;

const FUNCTION_OPTIONS = [
  "((z^2 - 1) * (z - 2 - i)^2) / (z^2 + 2 + 2i)",
  "z^2",
  "z + 1/z",
  "1/z",
  "tan(z)",
  "exp(z)",
  "sin(z)",
  "z^3",
  "(z^3 - 1) / (z^3 + 1)"
];

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function hslToRgb(h, s, l) {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hp >= 0 && hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

function scaleRgb(rgb, factor) {
  return rgb.map((value) => Math.max(0, Math.min(255, Math.round(value * factor))));
}

function evalFunction(kind, z) {
  const re = z.re;
  const im = z.im;

  switch (kind) {
    case "((z^2 - 1) * (z - 2 - i)^2) / (z^2 + 2 + 2i)": {
      const z2 = { re: re * re - im * im, im: 2 * re * im };
      const z2Minus1 = { re: z2.re - 1, im: z2.im };
      const aRe = re - 2;
      const aIm = im - 1;
      const a2 = { re: aRe * aRe - aIm * aIm, im: 2 * aRe * aIm };
      const num = {
        re: z2Minus1.re * a2.re - z2Minus1.im * a2.im,
        im: z2Minus1.re * a2.im + z2Minus1.im * a2.re
      };
      const den = { re: z2.re + 2, im: z2.im + 2 };
      const denom = Math.max(EPS, den.re * den.re + den.im * den.im);
      return {
        re: (num.re * den.re + num.im * den.im) / denom,
        im: (num.im * den.re - num.re * den.im) / denom
      };
    }
    case "z^2": {
      return {
        re: re * re - im * im,
        im: 2 * re * im
      };
    }
    case "z^3": {
      const re2 = re * re - im * im;
      const im2 = 2 * re * im;
      return {
        re: re2 * re - im2 * im,
        im: re2 * im + im2 * re
      };
    }
    case "1/z": {
      const denom = Math.max(EPS, re * re + im * im);
      return {
        re: re / denom,
        im: -im / denom
      };
    }
    case "z + 1/z": {
      const denom = Math.max(EPS, re * re + im * im);
      const inv = { re: re / denom, im: -im / denom };
      return { re: re + inv.re, im: im + inv.im };
    }
    case "exp(z)": {
      const expRe = Math.exp(re);
      return {
        re: expRe * Math.cos(im),
        im: expRe * Math.sin(im)
      };
    }
    case "tan(z)": {
      const sinRe = Math.sin(re) * Math.cosh(im);
      const sinIm = Math.cos(re) * Math.sinh(im);
      const cosRe = Math.cos(re) * Math.cosh(im);
      const cosIm = -Math.sin(re) * Math.sinh(im);
      const denom = Math.max(EPS, cosRe * cosRe + cosIm * cosIm);
      return {
        re: (sinRe * cosRe + sinIm * cosIm) / denom,
        im: (sinIm * cosRe - sinRe * cosIm) / denom
      };
    }
    case "sin(z)": {
      return {
        re: Math.sin(re) * Math.cosh(im),
        im: Math.cos(re) * Math.sinh(im)
      };
    }
    case "(z^3 - 1) / (z^3 + 1)": {
      const z2 = { re: re * re - im * im, im: 2 * re * im };
      const z3 = { re: z2.re * re - z2.im * im, im: z2.re * im + z2.im * re };
      const num = { re: z3.re - 1, im: z3.im };
      const den = { re: z3.re + 1, im: z3.im };
      const denom = Math.max(EPS, den.re * den.re + den.im * den.im);
      return {
        re: (num.re * den.re + num.im * den.im) / denom,
        im: (num.im * den.re - num.re * den.im) / denom
      };
    }
    default:
      return { re, im };
  }
}

registerVisual("domainColoring", {
  title: "Domain Coloring",
  description: "Domain coloring rendered with SVG dots for popular complex functions.",
  params: [
    {
      key: "renderMode",
      type: "select",
      default: "color",
      category: "Render",
      options: ["color", "mono"],
      description: "Color mode or monochrome density mode."
    },
    {
      key: "function",
      type: "select",
      default: "((z^2 - 1) * (z - 2 - i)^2) / (z^2 + 2 + 2i)",
      category: "Function",
      options: FUNCTION_OPTIONS,
      description: "Choose which complex function to color."
    },
    {
      key: "view.centerRe",
      type: "number",
      default: 0,
      min: -4,
      max: 4,
      step: 0.01,
      category: "View",
      description: "Real axis center of the view."
    },
    {
      key: "view.centerIm",
      type: "number",
      default: 0,
      min: -4,
      max: 4,
      step: 0.01,
      category: "View",
      description: "Imaginary axis center of the view."
    },
    {
      key: "view.spanRe",
      type: "number",
      default: 4,
      min: 0.1,
      max: 12,
      step: 0.05,
      category: "View",
      description: "Width of the complex plane (real axis)."
    },
    {
      key: "renderScale",
      type: "number",
      default: 1,
      min: 0.2,
      max: 1.5,
      step: 0.05,
      category: "Render",
      description: "Internal render scale (lower is faster)."
    },
    {
      key: "dotSpacing",
      type: "number",
      default: 6,
      min: 2,
      max: 24,
      step: 0.5,
      category: "Dots",
      description: "Pixel spacing between dots."
    },
    {
      key: "dotMinRadius",
      type: "number",
      default: 1.2,
      min: 0.2,
      max: 12,
      step: 0.1,
      category: "Dots",
      description: "Minimum dot radius."
    },
    {
      key: "dotMaxRadius",
      type: "number",
      default: 3.5,
      min: 0.5,
      max: 18,
      step: 0.1,
      category: "Dots",
      description: "Maximum dot radius."
    },
    {
      key: "dotStrokeStrength",
      type: "number",
      default: 0.55,
      min: 0,
      max: 1,
      step: 0.05,
      category: "Dots",
      description: "Stroke darkening multiplier for dot outlines."
    },
    {
      key: "monoDensity",
      type: "number",
      default: 2,
      min: 0,
      max: 6,
      step: 0.5,
      category: "Mono",
      description: "Extra dot overlap in monochrome mode."
    },
    {
      key: "monoJitter",
      type: "number",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.05,
      category: "Mono",
      description: "Jitter applied to overlapping dots (fraction of spacing)."
    },
    {
      key: "monoSizeBias",
      type: "number",
      default: 1,
      min: 0.2,
      max: 3,
      step: 0.1,
      category: "Mono",
      description: "Boost dot size response to magnitude in monochrome mode."
    },
    {
      key: "showContours",
      type: "boolean",
      default: true,
      category: "Contours",
      description: "Show magnitude/angle contour lines."
    },
    {
      key: "contourStep",
      type: "number",
      default: 18,
      min: 6,
      max: 60,
      step: 1,
      category: "Contours",
      description: "Sampling step for contour lines (px)."
    },
    {
      key: "contourCount",
      type: "number",
      default: 8,
      min: 0,
      max: 30,
      step: 1,
      category: "Contours",
      description: "Number of magnitude contour rings."
    },
    {
      key: "angleContourCount",
      type: "number",
      default: 10,
      min: 0,
      max: 36,
      step: 1,
      category: "Contours",
      description: "Number of angle contour rays."
    },
    {
      key: "contourOpacity",
      type: "number",
      default: 0.45,
      min: 0,
      max: 1,
      step: 0.05,
      category: "Contours",
      description: "Opacity of contour lines."
    },
    {
      key: "contourStroke",
      type: "text",
      default: "#777777",
      category: "Contours",
      description: "Stroke color for contour lines."
    },
    {
      key: "hueOffset",
      type: "number",
      default: 0,
      min: -1,
      max: 1,
      step: 0.01,
      category: "Color",
      description: "Hue rotation applied to the argument color wheel."
    },
    {
      key: "saturation",
      type: "number",
      default: 0.85,
      min: 0,
      max: 1,
      step: 0.01,
      category: "Color",
      description: "Overall color saturation."
    },
    {
      key: "lightness",
      type: "number",
      default: 0.55,
      min: 0,
      max: 1,
      step: 0.01,
      category: "Color",
      description: "Base lightness for the domain coloring."
    },
    {
      key: "ringDensity",
      type: "number",
      default: 6,
      min: 0,
      max: 20,
      step: 0.1,
      category: "Guides",
      description: "Density of magnitude rings."
    },
    {
      key: "ringStrength",
      type: "number",
      default: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
      category: "Guides",
      description: "Contrast of magnitude rings."
    },
    {
      key: "angleLines",
      type: "number",
      default: 12,
      min: 0,
      max: 48,
      step: 1,
      category: "Guides",
      description: "How many angle rays are emphasized."
    },
    {
      key: "angleStrength",
      type: "number",
      default: 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      category: "Guides",
      description: "Contrast of angle rays."
    }
  ],
  create({ mountEl }, state) {
    const svg = d3.select(mountEl)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("display", "block");

    const scene = svg.append("g").attr("class", "scene");
    const dotLayer = scene.append("g").attr("class", "domain-dots");
    const contourLayer = scene.append("g").attr("class", "domain-contours");
    let lastSize = { w: 0, h: 0, scale: 1 };

    const getRenderSize = () => {
      const bounds = mountEl.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(0.2, Number(state.renderScale) || 1);
      const displayW = Math.max(1, bounds.width);
      const displayH = Math.max(1, bounds.height);
      return {
        w: Math.max(1, Math.floor(displayW * dpr * scale)),
        h: Math.max(1, Math.floor(displayH * dpr * scale)),
        scale,
        dpr,
        displayW,
        displayH
      };
    };

    const render = () => {
      const {
        w: width,
        h: height,
        scale,
        dpr,
        displayW,
        displayH
      } = getRenderSize();
      if (!width || !height) return;
      if (width !== lastSize.w || height !== lastSize.h || scale !== lastSize.scale) {
        lastSize = { w: width, h: height, scale };
      }
      svg.attr("viewBox", `0 0 ${displayW} ${displayH}`);

      const centerRe = Number(state.view?.centerRe ?? 0);
      const centerIm = Number(state.view?.centerIm ?? 0);
      const spanRe = Math.max(0.01, Number(state.view?.spanRe ?? 4));
      const spanIm = spanRe * (height / width);
      const reMin = centerRe - spanRe * 0.5;
      const imMax = centerIm + spanIm * 0.5;

      const ringDensity = Math.max(0, Number(state.ringDensity) || 0);
      const ringStrength = Math.max(0, Number(state.ringStrength) || 0);
      const angleLines = Math.max(0, Number(state.angleLines) || 0);
      const angleStrength = Math.max(0, Number(state.angleStrength) || 0);
      const hueOffset = Number(state.hueOffset) || 0;
      const saturation = clamp01(Number(state.saturation) || 0);
      const baseLightness = clamp01(Number(state.lightness) || 0.5);
      const spacing = Math.max(1, Number(state.dotSpacing) || 6);
      const minR = Math.max(0.1, Number(state.dotMinRadius) || 1);
      const maxR = Math.max(minR, Number(state.dotMaxRadius) || minR);
      const strokeStrength = clamp01(Number(state.dotStrokeStrength) || 0);
      const renderMode = state.renderMode === "mono" ? "mono" : "color";
      const monoDensity = Math.max(0, Number(state.monoDensity) || 0);
      const monoJitter = clamp01(Number(state.monoJitter) || 0);
      const monoSizeBias = Math.max(0.1, Number(state.monoSizeBias) || 1);
      const showContours = !!state.showContours;
      const contourStep = Math.max(4, Number(state.contourStep) || 18);
      const contourCount = Math.max(0, Math.round(Number(state.contourCount) || 0));
      const angleContourCount = Math.max(0, Math.round(Number(state.angleContourCount) || 0));
      const contourOpacity = clamp01(Number(state.contourOpacity) || 0);
      const contourStroke = state.contourStroke || "#777777";

      const step = Math.max(2, spacing * dpr);
      const xDen = Math.max(1, width - 1);
      const yDen = Math.max(1, height - 1);
      const dots = [];

      for (let py = 0; py <= height; py += step) {
        const im = imMax - (py / yDen) * spanIm;
        for (let px = 0; px <= width; px += step) {
          const re = reMin + (px / xDen) * spanRe;
          const w = evalFunction(state.function, { re, im });
          const mag = Math.hypot(w.re, w.im);
          const arg = Math.atan2(w.im, w.re);

          const rings = ringDensity > 0
            ? 0.5 + 0.5 * Math.cos(Math.log(mag + EPS) * ringDensity)
            : 0.5;
          const angles = angleLines > 0
            ? 0.5 + 0.5 * Math.cos(arg * angleLines)
            : 0.5;

          const sizeBias = 0.5 + 0.5 * Math.tanh(Math.log(mag + 1) * monoSizeBias);
          const r = minR + (maxR - minR) * sizeBias;

          if (renderMode === "mono") {
            const density = Math.max(0, rings * 0.6 + angles * 0.4);
            const extra = Math.max(0, Math.floor(density * monoDensity));
            const count = 1 + extra;
            for (let i = 0; i < count; i++) {
              const jitter = monoJitter * spacing * 0.5;
              const jx = (Math.random() * 2 - 1) * jitter;
              const jy = (Math.random() * 2 - 1) * jitter;
              dots.push({
                x: (px / dpr) + jx,
                y: (py / dpr) + jy,
                r,
                fill: "#ffffff",
                stroke: "#000000"
              });
            }
          } else {
            const hue = (arg / TAU) + 0.5 + hueOffset;
            let lightness = baseLightness;
            lightness += ringStrength * (rings - 0.5);
            lightness += angleStrength * (angles - 0.5);
            lightness = clamp01(lightness);

            const baseColor = hslToRgb(hue, saturation, lightness);
            const strokeColor = scaleRgb(baseColor, Math.max(0, 1 - strokeStrength));
            dots.push({
              x: px / dpr,
              y: py / dpr,
              r,
              fill: `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`,
              stroke: `rgb(${strokeColor[0]}, ${strokeColor[1]}, ${strokeColor[2]})`
            });
          }
        }
      }

      const selection = dotLayer.selectAll("circle").data(dots);
      selection.exit().remove();
      selection
        .enter()
        .append("circle")
        .merge(selection)
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", d => d.r)
        .attr("fill", d => d.fill)
        .attr("stroke", d => d.stroke)
        .attr("stroke-width", Math.max(0.4, minR * 0.2));

      if (!showContours) {
        contourLayer.selectAll("*").remove();
        return;
      }

      const contourStepPx = Math.max(6, contourStep) * dpr;
      const gridW = Math.max(2, Math.floor(width / contourStepPx) + 1);
      const gridH = Math.max(2, Math.floor(height / contourStepPx) + 1);
      const valuesMag = new Float32Array(gridW * gridH);
      const valuesAng = new Float32Array(gridW * gridH);

      let vMin = Infinity;
      let vMax = -Infinity;
      for (let gy = 0; gy < gridH; gy++) {
        const im = imMax - (gy / (gridH - 1)) * spanIm;
        for (let gx = 0; gx < gridW; gx++) {
          const re = reMin + (gx / (gridW - 1)) * spanRe;
          const w = evalFunction(state.function, { re, im });
          const mag = Math.hypot(w.re, w.im);
          const logMag = Math.log(mag + EPS);
          const arg = Math.atan2(w.im, w.re);
          const idx = gy * gridW + gx;
          valuesMag[idx] = logMag;
          valuesAng[idx] = (arg / TAU) + 0.5;
          vMin = Math.min(vMin, logMag);
          vMax = Math.max(vMax, logMag);
        }
      }

      const magThresholds = [];
      if (contourCount > 0 && Number.isFinite(vMin) && Number.isFinite(vMax)) {
        const span = vMax - vMin || 1;
        for (let i = 1; i <= contourCount; i++) {
          magThresholds.push(vMin + (span * i) / (contourCount + 1));
        }
      }

      const angThresholds = [];
      if (angleContourCount > 0) {
        for (let i = 1; i <= angleContourCount; i++) {
          angThresholds.push(i / (angleContourCount + 1));
        }
      }

      const geo = d3.geoPath(d3.geoIdentity().scale(contourStepPx / dpr));
      const magContours = magThresholds.length
        ? d3.contours().size([gridW, gridH]).thresholds(magThresholds)(valuesMag)
        : [];
      const angContours = angThresholds.length
        ? d3.contours().size([gridW, gridH]).thresholds(angThresholds)(valuesAng)
        : [];

      const magSel = contourLayer.selectAll("path.contour-mag").data(magContours);
      magSel.exit().remove();
      magSel
        .enter()
        .append("path")
        .attr("class", "contour-mag")
        .merge(magSel)
        .attr("d", geo)
        .attr("fill", "none")
        .attr("stroke", contourStroke)
        .attr("stroke-width", 1.4)
        .attr("opacity", contourOpacity);

      const angSel = contourLayer.selectAll("path.contour-ang").data(angContours);
      angSel.exit().remove();
      angSel
        .enter()
        .append("path")
        .attr("class", "contour-ang")
        .merge(angSel)
        .attr("d", geo)
        .attr("fill", "none")
        .attr("stroke", contourStroke)
        .attr("stroke-width", 1)
        .attr("opacity", contourOpacity * 0.8);
    };

    const ro = new ResizeObserver(render);
    ro.observe(mountEl);

    return {
      render,
      destroy() {
        ro.disconnect();
        mountEl.innerHTML = "";
      }
    };
  }
});

let appHandle = null;

const INITIAL_STATE = {
  renderMode: "mono",
  function: "((z^2 - 1) * (z - 2 - i)^2) / (z^2 + 2 + 2i)",
  view: {
    centerRe: 0,
    centerIm: 0,
    spanRe: 6
  },
  renderScale: 1,
  dotSpacing: 6.5,
  dotMinRadius: 1.2,
  dotMaxRadius: 1.6,
  dotStrokeStrength: 1,
  monoDensity: 6,
  monoJitter: 1,
  monoSizeBias: 1,
  showContours: true,
  contourStep: 18,
  contourCount: 8,
  angleContourCount: 10,
  contourOpacity: 0.45,
  contourStroke: "#777777",
  hueOffset: 0,
  saturation: 0.85,
  lightness: 0.55,
  ringDensity: 6,
  ringStrength: 0.25,
  angleLines: 12,
  angleStrength: 0.2
};

const PRESETS = {
  "preset-z2": {
    label: "Z^2",
    settings: {
      ...INITIAL_STATE,
      function: "z^2",
      view: { centerRe: 0, centerIm: 0, spanRe: 4 }
    }
  },
  "preset-default": {
    label: "Default",
    settings: {
      ...INITIAL_STATE
    }
  },
  "preset-reciprocal": {
    label: "1/Z",
    settings: {
      ...INITIAL_STATE,
      function: "1/z",
      view: { centerRe: 0, centerIm: 0, spanRe: 6 }
    }
  },
  "preset-exp": {
    label: "exp",
    settings: {
      ...INITIAL_STATE,
      function: "exp(z)",
      view: { centerRe: 0, centerIm: 0, spanRe: 4 }
    }
  },
  "preset-sin": {
    label: "sin",
    settings: {
      ...INITIAL_STATE,
      function: "sin(z)",
      view: { centerRe: 0, centerIm: 0, spanRe: 7 }
    }
  }
};

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));
}

function startDomainApp(settings = INITIAL_STATE) {
  const mountEl = document.getElementById("vis");
  const uiEl = document.getElementById("config");

  if (appHandle?.instance?.destroy) {
    appHandle.instance.destroy();
  }

  uiEl.innerHTML = "";
  mountEl.innerHTML = "";

  appHandle = runVisualApp({
    visualId: "domainColoring",
    mountEl,
    uiEl,
    state: cloneSettings(settings)
  });
}

function wirePresetButtons() {
  Object.entries(PRESETS).forEach(([id, preset]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = preset.label;
    btn.addEventListener("click", () => startDomainApp(preset.settings));
  });
}

function wirePresetToggle() {
  const toggleBtn = document.getElementById("button-toggle");
  const presetBar = document.getElementById("preset-bar");
  if (!toggleBtn || !presetBar) return;

  toggleBtn.addEventListener("click", () => {
    const isShown = presetBar.classList.toggle("show");
    presetBar.style.display = isShown ? "flex" : "none";
    toggleBtn.setAttribute("aria-pressed", String(isShown));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  startDomainApp();
  wirePresetButtons();
  wirePresetToggle();
});

function goTo(page) {
  window.location.href = page;
}

window.goTo = goTo;
