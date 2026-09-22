/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import { registerVisual } from "../helper/visualHelp.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;

const PALETTES = {
  emerald: {
    background: "#101b13",
    ground: "#1b2d1e",
    texture: "#2f4a30",
    blades: ["#173b25", "#34733b", "#77a84c", "#c9dc79"],
    outline: "#0e2a1a",
    seeds: "#d7d49a",
  },
  bluegrass: {
    background: "#111b20",
    ground: "#17282a",
    texture: "#294244",
    blades: ["#183a3a", "#2e6962", "#77a68a", "#c3d7a2"],
    outline: "#102a2d",
    seeds: "#bed0ad",
  },
  moss: {
    background: "#11160d",
    ground: "#242b16",
    texture: "#414b23",
    blades: ["#263513", "#536526", "#8b9842", "#c0b45b"],
    outline: "#1b260e",
    seeds: "#d4c97c",
  },
  straw: {
    background: "#24160d",
    ground: "#3b2915",
    texture: "#654822",
    blades: ["#5f431c", "#9b6c26", "#d4a642", "#f0d183"],
    outline: "#4a2f12",
    seeds: "#f3dca0",
  },
  frost: {
    background: "#182126",
    ground: "#29363a",
    texture: "#455b5f",
    blades: ["#315458", "#5e8580", "#a1bab0", "#e1ece0"],
    outline: "#223c41",
    seeds: "#eef4e9",
  },
  noir: {
    background: "#f1f0e9",
    ground: "#deddd4",
    texture: "#bab9b1",
    blades: ["#111111", "#3b3b39", "#77766f", "#b2b0a5"],
    outline: "#080808",
    seeds: "#32322f",
  },
  storm: {
    background: "#0c1119",
    ground: "#151d2b",
    texture: "#28344b",
    blades: ["#152740", "#2d5375", "#66829a", "#c1c8bd"],
    outline: "#081522",
    seeds: "#d6d7ca",
  },
  neon: {
    background: "#080817",
    ground: "#111126",
    texture: "#262050",
    blades: ["#12375e", "#00a8a8", "#72f06a", "#f4ed5c"],
    outline: "#041421",
    seeds: "#fff39a",
  },
};

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, num(value, min)));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u = Math.max(1e-8, random());
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, scale, seed) {
  const s = Math.max(0.002, scale);
  const fx = x / s;
  const fy = y / s;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}

function fbm(x, y, scale, seed) {
  let value = 0;
  let weight = 0.58;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise(x * frequency, y * frequency, scale, seed + octave * 71) * weight;
    total += weight;
    frequency *= 2.03;
    weight *= 0.5;
  }
  return total ? value / total : 0;
}

function mixAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function sampleRoot(random, distribution, clusters, state, attempt) {
  let x = random() - 0.5;
  let z = random() - 0.5;

  if (distribution === "oval") {
    const angle = random() * TAU;
    const radius = Math.sqrt(random()) * 0.5;
    x = Math.cos(angle) * radius;
    z = Math.sin(angle) * radius;
  } else if (distribution === "clumps" && clusters.length) {
    const cluster = clusters[Math.floor(random() * clusters.length) % clusters.length];
    const pull = clamp01(state.clumping);
    const radius = clamp(state.clumpRadius, 0.01, 0.5);
    const cx = cluster.x + gaussian(random) * radius;
    const cz = cluster.z + gaussian(random) * radius;
    x = x * (1 - pull) + cx * pull;
    z = z * (1 - pull) + cz * pull;
  } else if (distribution === "rows") {
    const spacing = clamp(state.rowSpacing, 0.012, 0.25);
    const row = Math.round((z + 0.5) / spacing);
    const rowZ = row * spacing - 0.5;
    const jitter = clamp01(state.rowJitter) * spacing;
    z = rowZ + (random() - 0.5) * jitter;
    x += Math.sin(row * 1.73 + attempt * 0.011) * jitter * 0.6;
  } else if (distribution === "radial") {
    const angle = random() * TAU;
    const rings = Math.max(3, Math.round(1 / clamp(state.rowSpacing, 0.012, 0.25)));
    const ring = Math.max(1, Math.floor(Math.sqrt(random()) * rings));
    const radius = (ring / rings) * 0.5 + gaussian(random) * 0.006 * (1 + state.rowJitter);
    x = Math.cos(angle) * radius;
    z = Math.sin(angle) * radius;
  }

  return { x, z };
}

function buildRoots(state, count, seed) {
  const random = mulberry32(seed);
  const clusterCount = Math.max(1, Math.floor(num(state.clumpCount, 18)));
  const clusters = Array.from({ length: clusterCount }, () => ({
    x: random() - 0.5,
    z: random() - 0.5,
    angle: random() * TAU,
  }));
  const roots = [];
  const patchScale = clamp(state.patchScale, 0.02, 0.5);
  const bare = clamp01(state.barePatches);
  const maxAttempts = Math.max(300, count * 12);
  const distribution = String(state.distribution || "clumps");

  for (let attempt = 0; attempt < maxAttempts && roots.length < count; attempt += 1) {
    const root = sampleRoot(random, distribution, clusters, state, attempt);
    if (root.x < -0.53 || root.x > 0.53 || root.z < -0.53 || root.z > 0.53) continue;
    const patch = fbm(root.x + 0.5, root.z + 0.5, patchScale, seed + 991);
    const threshold = bare * 0.76;
    if (patch < threshold && random() > 0.08) continue;
    roots.push({
      ...root,
      random: random(),
      random2: random(),
      random3: random(),
      patch,
      cluster: clusters[Math.floor(random() * clusters.length) % clusters.length],
    });
  }
  return roots;
}

function makeProjector(width, height, state) {
  const yaw = num(state.viewYaw, 0) * Math.PI / 180;
  const tilt = clamp(state.viewTilt, 0, 72) * Math.PI / 180;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const scale = clamp(state.fieldScale, 0.25, 1.8);
  const perspective = clamp01(state.perspective);
  const minDim = Math.min(width, height);
  const cx = width * 0.5;
  const cy = height * (0.5 + clamp(state.verticalOffset, -0.35, 0.35));

  return (point) => {
    const xr = point.x * cosYaw - point.z * sinYaw;
    const zr = point.x * sinYaw + point.z * cosYaw;
    const depth = zr * sinTilt + point.y * cosTilt;
    const perspectiveScale = 1 / Math.max(0.36, 1 + depth * perspective * 0.82);
    return {
      x: cx + xr * width * scale * perspectiveScale,
      y: cy + (zr * height * cosTilt - point.y * minDim * sinTilt) * scale * perspectiveScale,
      depth,
      scale: perspectiveScale,
    };
  };
}

function quadratic(p0, p1, p2, t) {
  const one = 1 - t;
  return {
    x: one * one * p0.x + 2 * one * t * p1.x + t * t * p2.x,
    y: one * one * p0.y + 2 * one * t * p1.y + t * t * p2.y,
    z: one * one * p0.z + 2 * one * t * p1.z + t * t * p2.z,
  };
}

function linePath(points) {
  const d3 = globalThis.d3;
  if (d3?.line && d3?.curveCatmullRom) {
    return d3.line()
      .x((point) => point.x)
      .y((point) => point.y)
      .curve(d3.curveCatmullRom.alpha(0.5))(points);
  }
  return points.map((point, i) => `${i ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join("");
}

function bladePath({ root, angle, heightPx, widthPx, bend, taper, project, canvasWidth, canvasHeight }) {
  const minDim = Math.min(canvasWidth, canvasHeight);
  const leanPx = heightPx * bend;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const sideX = -dz * widthPx / canvasWidth;
  const sideZ = dx * widthPx / canvasHeight;
  const p0 = { x: root.x, y: 0, z: root.z };
  const p1 = {
    x: root.x + dx * leanPx * 0.12 / canvasWidth,
    y: heightPx * 0.57 / minDim,
    z: root.z + dz * leanPx * 0.12 / canvasHeight,
  };
  const p2 = {
    x: root.x + dx * leanPx / canvasWidth,
    y: heightPx / minDim,
    z: root.z + dz * leanPx / canvasHeight,
  };
  const left = [];
  const right = [];
  const samples = 7;
  for (let i = 0; i < samples; i += 1) {
    const t = i / (samples - 1);
    const center = quadratic(p0, p1, p2, t);
    const widthFactor = Math.pow(Math.max(0, 1 - t), taper) * 0.5;
    left.push(project({ x: center.x + sideX * widthFactor, y: center.y, z: center.z + sideZ * widthFactor }));
    right.push(project({ x: center.x - sideX * widthFactor, y: center.y, z: center.z - sideZ * widthFactor }));
  }
  const leftD = linePath(left);
  const rightD = linePath(right.reverse()).replace(/^M/, "L");
  return {
    d: `${leftD}${rightD}Z`,
    tip: project(p2),
    root: project(p0),
  };
}

function interpolatePalette(colors, t) {
  const d3 = globalThis.d3;
  if (d3?.interpolateRgbBasis) return d3.interpolateRgbBasis(colors)(clamp01(t));
  const index = Math.min(colors.length - 1, Math.floor(clamp01(t) * colors.length));
  return colors[index] || colors[0];
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  });
  return node;
}

const params = [
  { key: "growth", label: "growth stage", type: "number", default: 0.88, min: 0, max: 1, step: 0.01, category: "Growth", description: "Controls sprout count and blade height; animate this from 0 to 1 to grow the field." },
  { key: "density", label: "blade density", type: "number", default: 1450, min: 12, max: 3200, step: 1, category: "Growth" },
  { key: "bladeHeight", label: "blade height", type: "number", default: 52, min: 2, max: 180, step: 1, category: "Growth" },
  { key: "heightVariation", label: "height variation", type: "number", default: 0.52, min: 0, max: 1, step: 0.01, category: "Growth" },
  { key: "bladeWidth", label: "blade width", type: "number", default: 4.2, min: 0.25, max: 18, step: 0.05, category: "Growth" },
  { key: "widthVariation", label: "width variation", type: "number", default: 0.35, min: 0, max: 1, step: 0.01, category: "Growth" },
  { key: "taper", label: "tip taper", type: "number", default: 1.35, min: 0.2, max: 4, step: 0.05, category: "Growth" },
  { key: "seedHeads", label: "seed head amount", type: "number", default: 0.04, min: 0, max: 1, step: 0.01, category: "Growth" },

  { key: "distribution", type: "select", default: "clumps", options: ["uniform", "clumps", "oval", "rows", "radial"], category: "Distribution" },
  { key: "clumping", type: "number", default: 0.58, min: 0, max: 1, step: 0.01, category: "Distribution" },
  { key: "clumpCount", label: "clump count", type: "number", default: 19, min: 1, max: 80, step: 1, category: "Distribution" },
  { key: "clumpRadius", label: "clump radius", type: "number", default: 0.1, min: 0.01, max: 0.5, step: 0.005, category: "Distribution" },
  { key: "barePatches", label: "bare patches", type: "number", default: 0.08, min: 0, max: 0.82, step: 0.01, category: "Distribution" },
  { key: "patchScale", label: "patch scale", type: "number", default: 0.16, min: 0.02, max: 0.5, step: 0.005, category: "Distribution" },
  { key: "rowSpacing", label: "row / ring spacing", type: "number", default: 0.052, min: 0.012, max: 0.25, step: 0.002, category: "Distribution" },
  { key: "rowJitter", label: "row / ring jitter", type: "number", default: 0.2, min: 0, max: 1, step: 0.01, category: "Distribution" },

  { key: "bend", label: "blade bend", type: "number", default: 0.52, min: 0, max: 1.8, step: 0.01, category: "Blade Form" },
  { key: "bendVariation", label: "bend variation", type: "number", default: 0.4, min: 0, max: 1, step: 0.01, category: "Blade Form" },
  { key: "directionCoherence", label: "direction coherence", type: "number", default: 0.46, min: 0, max: 1, step: 0.01, category: "Blade Form", description: "Makes nearby blades share their clump's growing direction." },
  { key: "twist", label: "blade twist", type: "number", default: 0.18, min: 0, max: 1, step: 0.01, category: "Blade Form" },

  { key: "windStrength", label: "wind strength", type: "number", default: 0.26, min: 0, max: 1.5, step: 0.01, category: "Wind" },
  { key: "windDirection", label: "wind direction", type: "number", default: 38, min: 0, max: 360, step: 1, category: "Wind" },
  { key: "gustScale", label: "gust field scale", type: "number", default: 0.28, min: 0.02, max: 0.7, step: 0.01, category: "Wind" },
  { key: "turbulence", type: "number", default: 0.28, min: 0, max: 1, step: 0.01, category: "Wind" },
  { key: "windPhase", label: "wind phase", type: "number", default: 0.16, min: 0, max: 1, step: 0.005, category: "Wind", description: "Animate 0 to 1 for a seamless moving gust field." },

  { key: "viewTilt", label: "off-nadir tilt", type: "number", default: 8, min: 0, max: 72, step: 1, category: "Camera", description: "0° is nadir; higher values reveal blade height and compress field depth." },
  { key: "viewYaw", label: "field yaw", type: "number", default: 12, min: 0, max: 360, step: 1, category: "Camera" },
  { key: "perspective", type: "number", default: 0.12, min: 0, max: 1, step: 0.01, category: "Camera" },
  { key: "fieldScale", label: "field scale", type: "number", default: 0.96, min: 0.25, max: 1.8, step: 0.01, category: "Camera" },
  { key: "verticalOffset", label: "vertical offset", type: "number", default: 0, min: -0.35, max: 0.35, step: 0.01, category: "Camera" },

  { key: "palette", type: "select", default: "emerald", options: Object.keys(PALETTES), category: "Surface" },
  { key: "colorVariation", label: "color variation", type: "number", default: 0.66, min: 0, max: 1, step: 0.01, category: "Surface" },
  { key: "lightAngle", label: "light direction", type: "number", default: 320, min: 0, max: 360, step: 1, category: "Surface" },
  { key: "bladeOpacity", label: "blade opacity", type: "number", default: 0.94, min: 0.05, max: 1, step: 0.01, category: "Surface" },
  { key: "outlineWidth", label: "outline width", type: "number", default: 0.16, min: 0, max: 2.5, step: 0.02, category: "Surface" },
  { key: "shadowStrength", label: "shadow strength", type: "number", default: 0.14, min: 0, max: 0.8, step: 0.01, category: "Surface" },
  { key: "groundTexture", label: "ground texture", type: "number", default: 0.38, min: 0, max: 1, step: 0.01, category: "Surface" },
  { key: "groundTextureScale", label: "texture scale", type: "number", default: 0.12, min: 0.02, max: 0.4, step: 0.005, category: "Surface" },

  { key: "seed", type: "number", default: 621734, min: 0, max: 999999, step: 1, category: "System", description: "Deterministic seed used by placement, form, color, and texture." },
  { key: "regenerate", label: "new seed", type: "button", category: "System", onClick: ({ state }) => { state.seed = Math.floor(Math.random() * 1_000_000); } },
];

registerVisual("proceduralGrassField", {
  title: "Procedural Grass Field",
  description: "Editable SVG blades grown through deterministic patches, layered wind, and nadir-to-oblique projection.",
  params,
  defaultState: {
    __ui: {
      tabsOpen: true,
      activeTab: "params",
      collapseParamsByDefault: true,
      paramGroups: { Growth: true, Distribution: false, "Blade Form": false, Wind: true, Camera: true, Surface: false, System: false },
      ioOpen: true,
      configPinned: true,
      navHidden: false,
    },
    __anim: {
      ui: {
        targetType: "params",
        paramTargets: [
          { key: "windPhase", from: 0, to: 1 },
          { key: "growth", from: 0.06, to: 1 },
        ],
        durationSec: 9,
        fps: 24,
        easing: "easeInOutQuad",
        loop: true,
        yoyo: false,
        progress01: 0,
        autoPlay: false,
      },
    },
  },

  create({ mountEl }, state) {
    mountEl.replaceChildren();
    const svg = svgEl("svg", { width: "100%", height: "100%", role: "img", "aria-label": "Procedural grass field" });
    svg.style.display = "block";
    const scene = svgEl("g", { "data-grass-scene": "1" });
    const groundLayer = svgEl("g", { "data-grass-layer": "ground" });
    const shadowLayer = svgEl("g", { "data-grass-layer": "shadows" });
    const bladeLayer = svgEl("g", { "data-grass-layer": "blades" });
    scene.append(groundLayer, shadowLayer, bladeLayer);
    svg.appendChild(scene);
    mountEl.appendChild(svg);

    let destroyed = false;
    let resizeObserver = null;

    const size = () => {
      const rect = mountEl.getBoundingClientRect();
      return {
        width: Math.max(1, Math.floor(rect.width || 1000)),
        height: Math.max(1, Math.floor(rect.height || 700)),
      };
    };

    const render = () => {
      if (destroyed) return;
      const { width, height } = size();
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const palette = PALETTES[String(state.palette)] || PALETTES.emerald;
      const seed = Math.floor(num(state.seed, 621734));
      const random = mulberry32(seed + 1847);
      const growth = clamp01(state.growth);
      const count = Math.max(1, Math.round(clamp(state.density, 12, 3200) * (0.06 + growth * 0.94)));
      const roots = buildRoots(state, count, seed);
      const project = makeProjector(width, height, state);
      const baseHeight = clamp(state.bladeHeight, 2, 180) * (0.05 + growth * 0.95);
      const heightVariation = clamp01(state.heightVariation);
      const baseWidth = clamp(state.bladeWidth, 0.25, 18) * (0.4 + growth * 0.6);
      const widthVariation = clamp01(state.widthVariation);
      const bendBase = clamp(state.bend, 0, 1.8);
      const bendVariation = clamp01(state.bendVariation);
      const directionCoherence = clamp01(state.directionCoherence);
      const twist = clamp01(state.twist);
      const windStrength = clamp(state.windStrength, 0, 1.5);
      const windDirection = num(state.windDirection, 0) * Math.PI / 180;
      const phase = clamp01(state.windPhase) * TAU;
      const gustScale = clamp(state.gustScale, 0.02, 0.7);
      const turbulence = clamp01(state.turbulence);
      const lightAngle = num(state.lightAngle, 320) * Math.PI / 180;
      const colorVariation = clamp01(state.colorVariation);
      const seedHeads = clamp01(state.seedHeads) * growth;
      const shadowStrength = clamp(state.shadowStrength, 0, 0.8);

      groundLayer.replaceChildren();
      shadowLayer.replaceChildren();
      bladeLayer.replaceChildren();
      svg.style.background = palette.background;

      const ground = svgEl("rect", {
        class: "grass-ground",
        x: 0,
        y: 0,
        width,
        height,
        fill: palette.ground,
      });
      groundLayer.appendChild(ground);

      const textureAmount = clamp01(state.groundTexture);
      const textureCount = Math.round(textureAmount * 180);
      const textureScale = clamp(state.groundTextureScale, 0.02, 0.4);
      for (let i = 0; i < textureCount; i += 1) {
        const x = random() * width;
        const y = random() * height;
        const r = Math.max(2, Math.min(width, height) * textureScale * (0.08 + random() * 0.32));
        groundLayer.appendChild(svgEl("ellipse", {
          class: "grass-ground-mark",
          cx: x.toFixed(2),
          cy: y.toFixed(2),
          rx: (r * (0.5 + random())).toFixed(2),
          ry: (r * (0.12 + random() * 0.35)).toFixed(2),
          fill: palette.texture,
          opacity: (textureAmount * (0.025 + random() * 0.09)).toFixed(3),
          transform: `rotate(${(random() * 180).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})`,
        }));
      }

      const blades = roots.map((root, index) => {
        const localGust = fbm(
          root.x + Math.cos(phase) * gustScale,
          root.z + Math.sin(phase) * gustScale,
          gustScale,
          seed + 418
        );
        const flutter = Math.sin(phase * 3 + root.random2 * TAU + root.x * 31 + root.z * 19) * turbulence;
        const naturalAngle = root.random * TAU;
        const coherentAngle = root.cluster?.angle ?? naturalAngle;
        let angle = mixAngle(naturalAngle, coherentAngle, directionCoherence);
        angle = mixAngle(angle, windDirection, clamp01(windStrength * (0.32 + localGust * 0.58)));
        angle += flutter * 0.32 + (root.random3 - 0.5) * twist * Math.PI;
        const heightPx = baseHeight * (1 + (root.random2 * 2 - 1) * heightVariation) * (0.72 + root.patch * 0.42);
        const widthPx = baseWidth * (1 + (root.random3 * 2 - 1) * widthVariation);
        const bend = Math.max(0, bendBase * (1 + (root.random - 0.5) * bendVariation) + windStrength * (0.18 + localGust * 0.58) + flutter * 0.08);
        const shape = bladePath({
          root,
          angle,
          heightPx,
          widthPx,
          bend,
          taper: clamp(state.taper, 0.2, 4),
          project,
          canvasWidth: width,
          canvasHeight: height,
        });
        return { root, index, angle, heightPx, widthPx, bend, shape, localGust };
      });

      blades.sort((a, b) => a.shape.root.y - b.shape.root.y || a.shape.root.x - b.shape.root.x);

      if (shadowStrength > 0) {
        for (let i = 0; i < blades.length; i += 2) {
          const blade = blades[i];
          const length = blade.heightPx * (0.16 + shadowStrength * 0.36);
          const x2 = blade.shape.root.x + Math.cos(lightAngle + Math.PI) * length;
          const y2 = blade.shape.root.y + Math.sin(lightAngle + Math.PI) * length * 0.46;
          shadowLayer.appendChild(svgEl("path", {
            class: "grass-shadow",
            d: `M${blade.shape.root.x.toFixed(2)},${blade.shape.root.y.toFixed(2)} Q${((blade.shape.root.x + x2) * 0.5).toFixed(2)},${(blade.shape.root.y + length * 0.08).toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`,
            fill: "none",
            stroke: palette.outline,
            "stroke-width": Math.max(0.3, blade.widthPx * 0.72).toFixed(2),
            "stroke-linecap": "round",
            opacity: (shadowStrength * 0.24).toFixed(3),
          }));
        }
      }

      for (const blade of blades) {
        const facing = 0.5 + 0.5 * Math.cos(blade.angle - lightAngle);
        const colorNoise = blade.root.patch * 0.45 + blade.root.random2 * 0.35 + facing * 0.2;
        const colorT = 0.18 + colorNoise * colorVariation + (1 - colorVariation) * 0.35;
        const path = svgEl("path", {
          class: "grass-blade",
          d: blade.shape.d,
          fill: interpolatePalette(palette.blades, colorT),
          stroke: palette.outline,
          "stroke-width": clamp(state.outlineWidth, 0, 2.5).toFixed(2),
          "stroke-linejoin": "round",
          opacity: clamp(state.bladeOpacity, 0.05, 1).toFixed(3),
          "data-blade-index": blade.index,
          "data-growth": growth.toFixed(3),
          "data-height": blade.heightPx.toFixed(2),
          "data-gust": blade.localGust.toFixed(3),
          "vector-effect": "non-scaling-stroke",
        });
        bladeLayer.appendChild(path);

        if (growth > 0.62 && blade.root.random3 < seedHeads) {
          const headLength = Math.max(2.5, blade.widthPx * 2.2);
          const head = svgEl("line", {
            class: "grass-seed-head",
            x1: (blade.shape.tip.x - Math.cos(blade.angle) * headLength * 0.5).toFixed(2),
            y1: (blade.shape.tip.y - Math.sin(blade.angle) * headLength * 0.22).toFixed(2),
            x2: (blade.shape.tip.x + Math.cos(blade.angle) * headLength * 0.5).toFixed(2),
            y2: (blade.shape.tip.y + Math.sin(blade.angle) * headLength * 0.22).toFixed(2),
            stroke: palette.seeds,
            "stroke-width": Math.max(0.5, blade.widthPx * 0.7).toFixed(2),
            "stroke-linecap": "round",
            opacity: clamp(state.bladeOpacity, 0.05, 1).toFixed(3),
            "data-blade-index": blade.index,
          });
          bladeLayer.appendChild(head);
        }
      }
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => render());
      resizeObserver.observe(mountEl);
    }
    render();

    return {
      render,
      destroy() {
        destroyed = true;
        resizeObserver?.disconnect?.();
      },
    };
  },
});
