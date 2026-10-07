/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
import { registerVisual } from "../helper/visualHelp.js";
import { PRESETS, normalizeMap, sampleOrbit } from "./attractorMath.js";
import { POINT_SHAPES, BRIGHTNESS_MODES, buildDensity, buildMarks } from "./pointMarks.js";

const PALETTES = {
  Ember: ["#1f2731", "#67473a", "#b57550", "#e9bd8d", "#fff1d4"],
  Glacier: ["#122c3a", "#255364", "#4b8a9b", "#a8d5d2", "#f1f4df"],
  Orchid: ["#272337", "#544368", "#987294", "#d8b3bf", "#fff0e2"],
  Paper: ["#ece4d4", "#c1b5a2", "#8e8070", "#544e48", "#222a31"],
};
const num = (v, fallback, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : fallback));
const integer = (v, fallback, lo, hi) => Math.round(num(v, fallback, lo, hi));
const subscript = n => String(n).replace(/\d/g, digit => "₀₁₂₃₄₅₆₇₈₉"[digit]);
const INITIAL_PRESET = PRESETS.find(p => p.id === "fivefold-classic") || PRESETS[0];
const selectedPreset = state => PRESETS.find(p => p.name === state.preset) || INITIAL_PRESET;
const customOnly = { view: "Single attractor", preset: "Custom" };

registerVisual("pureAttractors", {
  title: "Pure Attractors",
  description: "A single orbit, or a bestiary of dihedral attractors. The generalized Field–Golubitsky map creates the symmetry; each disk plots one actual orbit. Open a preset in Custom to explore its coefficients. Some choices settle into cycles or escape.",
  params: [
    { key: "view", label: "View", type: "select", default: "Single attractor", options: ["Single attractor", "Bestiary"], category: "Explore" },
    { key: "preset", label: "Specimen", type: "select", default: INITIAL_PRESET.name, options: [...PRESETS.map(p => p.name), "Custom"], category: "Explore", shouldShowWhen: { view: "Single attractor" } },
    { key: "editPreset", label: "Edit this specimen", type: "button", category: "Explore", shouldShowWhen: { view: "Single attractor" },
      onClick: ({ state }) => {
        if (state.preset === "Custom") return;
        const p = selectedPreset(state);
        state.n = p.n; state.p = p.p;
        p.a.forEach((a, i) => { state[`a${i}`] = a; });
        state.preset = "Custom";
      },
      description: "Copies the selected coefficients into the Custom controls." },
    { key: "pointShape", label: "Point shape", type: "select", default: "Circle", options: POINT_SHAPES, category: "Points" },
    { key: "fillPoints", label: "Fill points", type: "boolean", default: true, category: "Points", description: "Turn off for hollow outlines." },
    { key: "pointSize", label: "Point size", type: "number", default: 1, min: .2, max: 4, step: .05, category: "Points", description: "Size relative to a density cell. Lower Density detail to spread marks farther apart." },
    { key: "strokeWidth", label: "Outline width", type: "number", default: .16, min: .03, max: .8, step: .01, category: "Points", shouldShowWhen: { fillPoints: false } },
    { key: "brightnessMode", label: "Brightness method", type: "select", default: "Palette", options: BRIGHTNESS_MODES, category: "Points", description: "Use color, mark size, an ordered pattern, or scattered dots to express orbit density." },
    { key: "exposure", label: "Exposure", type: "number", default: 1.3, min: .3, max: 3, step: .05, category: "Points", description: "Higher exposure lightens colors, enlarges halftone marks, or keeps more dithered points." },
    { key: "n", label: "Symmetry order n", type: "number", default: 5, min: 3, max: 12, step: 1, category: "Map", shouldShowWhen: customOnly, description: "Dₙ has n rotations and n reflections. The orbit can have less symmetry." },
    { key: "p", label: "Angular harmonic p", type: "number", default: 1, min: 1, max: 6, step: 1, category: "Map", shouldShowWhen: customOnly },
    ...["Linear", "Radial", "Polynomial", "Angular", "Conjugate"].map((label, i) => ({
      key: `a${i}`, label: `a${subscript(i)} · ${label}`, type: "number", default: INITIAL_PRESET.a[i], min: -8, max: 8, step: .001, category: "Map", shouldShowWhen: customOnly,
    })),
    { key: "samples", label: "Orbit samples", type: "number", default: 160000, min: 10000, max: 300000, step: 10000, category: "Sampling", description: "Bestiary shares a 450,000-point budget across its disks. Single view supports up to 300,000." },
    { key: "burnIn", label: "Discard initial iterations", type: "number", default: 5000, min: 0, max: 30000, step: 500, category: "Sampling", description: "Let the orbit approach its attractor before plotting." },
    { key: "seedX", label: "Starting real part", type: "number", default: .13, min: -1, max: 1, step: .001, category: "Sampling" },
    { key: "seedY", label: "Starting imaginary part", type: "number", default: .17, min: -1, max: 1, step: .001, category: "Sampling" },
    { key: "palette", label: "Palette", type: "select", default: "Ember", options: Object.keys(PALETTES), category: "Appearance" },
    { key: "markStyle", label: "Render as", type: "select", default: "Orbit density", options: ["Orbit density", "Orbit points"], category: "Appearance", description: "Place one mark per occupied density cell, or one at each orbit sample. Both use local visit density for brightness." },
    { key: "resolution", label: "Density detail", type: "number", default: 600, min: 80, max: 900, step: 20, category: "Appearance" },
    { key: "rotation", label: "View rotation", type: "number", default: -90, min: -180, max: 180, step: 1, category: "Appearance" },
    { key: "showAxes", label: "Reflection axes", type: "boolean", default: false, category: "Appearance" },
    { key: "showDisks", label: "Disk frames", type: "boolean", default: false, category: "Appearance" },
  ],

  create({ mountEl }, state) {
    const d3 = window.d3;
    mountEl.replaceChildren();
    const svg = d3.select(mountEl).append("svg").attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("width", "100%").attr("role", "img").attr("aria-label", "Pure Attractors — generalized Field–Golubitsky orbits");
    svg.append("desc").text("Actual complex-map orbit samples. Density is accumulated without copying points through rotations or reflections. Custom maps may settle or escape. At the origin the angular contribution is zero.");
    const previousBackground = mountEl.style.backgroundColor;
    const scene = svg.append("g").attr("class", "pa-scene");
    const orbitCache = new Map();
    const densityCache = new Map();
    const geometryCache = new Map();
    let previousKey = "", resizeFrame = null, destroyed = false;
    const cached = (cache, key, compute, weight, budget) => {
      if (cache.has(key)) {
        const value = cache.get(key);
        cache.delete(key);
        cache.set(key, value);
        return value;
      }
      const value = compute();
      cache.set(key, value);
      // Bound retained memory as well as entry count: one detailed point cloud
      // is much larger than one bestiary disk. Preserve recent specimens.
      let retained = [...cache.values()].reduce((sum, entry) => sum + weight(entry), 0);
      while (cache.size > 1 && (cache.size > 12 || retained > budget)) {
        const oldest = cache.keys().next().value;
        retained -= weight(cache.get(oldest));
        cache.delete(oldest);
      }
      return value;
    };
    const render = () => {
      if (destroyed) return;
      const box = mountEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(box.width));
      const viewportHeight = Math.max(1, Math.floor(box.height));
      const bestiary = state.view === "Bestiary";
      const compact = width < 540;
      const padding = compact ? 12 : 24;
      const columns = bestiary ? (compact ? 2 : 3) : 1;
      const rows = bestiary ? Math.ceil(PRESETS.length / columns) : 1;
      const height = bestiary ? Math.max(viewportHeight, rows * 180 + padding * 2) : viewportHeight;
      const key = JSON.stringify([width, height, ...Object.keys(state).filter(k => !k.startsWith("__")).sort().map(k => [k, state[k]])]);
      if (key === previousKey) return;
      previousKey = key;
      svg.attr("data-ready", "false").attr("role", bestiary ? "group" : "img").attr("data-view", bestiary ? "Bestiary" : "Single attractor")
        .attr("viewBox", `0 0 ${width} ${height}`).attr("height", height);
      const palette = PALETTES[state.palette] || PALETTES.Ember;
      const paper = state.palette === "Paper";
      const colors = { bg: paper ? "#f3eddf" : "#090e17", disk: paper ? "#eee7d8" : "#0c131e", muted: paper ? "#657077" : "#82949f", rim: paper ? "#c2bcaf" : "#2a3946" };
      // Keep the viewing surface out of vector geometry: transforms and Time
      // snapshots should contain only the attractor and explicitly enabled guides.
      mountEl.style.backgroundColor = colors.bg;
      scene.selectAll("*").remove();
      const specimens = bestiary ? PRESETS : [state.preset === "Custom"
        ? { ...normalizeMap(state), name: "Custom", seed: [state.seedX, state.seedY] }
        : selectedPreset(state)];
      const requested = integer(state.samples, 160000, 1000, 300000);
      const count = bestiary ? Math.min(requested, Math.floor(450000 / specimens.length)) : requested;
      const burnIn = integer(state.burnIn, 5000, 0, 30000);
      const seed = [num(state.seedX, .13, -10, 10), num(state.seedY, .17, -10, 10)];
      const cellWidth = (width - padding * 2) / columns;
      const cellHeight = (height - padding * 2) / rows;
      const radius = Math.max(1, Math.min(cellWidth, cellHeight) / 2 - (bestiary ? 10 : 0));
      const color = d3.interpolateRgbBasis(palette);
      const exposure = num(state.exposure, 1.3, .3, 3);
      const resolution = bestiary
        ? Math.min(integer(state.resolution, 600, 80, 900), 330)
        : integer(state.resolution, 600, 80, 900);
      const markOptions = {
        placement: state.markStyle === "Orbit points" ? "Orbit points" : "Orbit density",
        shape: POINT_SHAPES.includes(state.pointShape) ? state.pointShape : "Circle",
        pointSize: num(state.pointSize, 1, .2, 4),
        brightnessMode: BRIGHTNESS_MODES.includes(state.brightnessMode) ? state.brightnessMode : "Palette",
        exposure,
      };
      const filled = state.fillPoints !== false;
      const outlineWidth = num(state.strokeWidth, .16, .03, .8);
      let totalSamples = 0;
      const statuses = [];

      specimens.forEach((specimen, index) => {
        const map = normalizeMap(specimen);
        const orbitKey = JSON.stringify([map, count, burnIn, seed]);
        const orbit = cached(orbitCache, orbitKey, () => sampleOrbit(map, { count, burnIn, seed }), o => o.count, 750000);
        statuses.push(`${specimen.name}: ${orbit.message || orbit.status}`);
        totalSamples += orbit.count;
        const column = index % columns, row = Math.floor(index / columns);
        // Center the last incomplete row in the mobile bestiary.
        const rowSize = Math.min(columns, specimens.length - row * columns);
        const cx = width / 2 + (column - (rowSize - 1) / 2) * cellWidth;
        const cy = padding + (row + .5) * cellHeight;
        const disk = scene.append("g").attr("class", "pa-disk").attr("data-status", orbit.status)
          .attr("data-samples", orbit.count).attr("data-n", map.n).attr("transform", `translate(${cx},${cy})`)
          .attr("aria-label", `${specimen.name}, D${map.n} map. ${orbit.message || orbit.status}`);
        if (bestiary) disk.attr("role", "button").attr("tabindex", 0).attr("data-pa-preset", specimen.name)
          .attr("pointer-events", "bounding-box")
          .attr("aria-label", `Explore ${specimen.name}, D${map.n} map`);
        if (state.showDisks) disk.append("circle").attr("r", radius).attr("fill", colors.disk);
        const field = disk.append("g").attr("transform", `rotate(${num(state.rotation, -90, -360, 360)})`);
        if (orbit.count > 0 && orbit.status !== "escaped") {
          const densityKey = `${orbitKey}|${resolution}`;
          const density = cached(densityCache, densityKey, () => buildDensity(orbit, resolution), d => d.cells.length, 2000000);
          // Palette exposure only recolors; spatial brightness methods change marks.
          const geometryKey = `${densityKey}|${JSON.stringify({ ...markOptions, exposure: markOptions.brightnessMode === "Palette" ? 1 : exposure })}`;
          const paths = cached(geometryCache, geometryKey, () => buildMarks(orbit, density, markOptions),
            entries => entries.reduce((sum, entry) => sum + entry.d.length, 0), 8000000);
          const ink = field.append("g").attr("transform", `translate(${-radius},${-radius}) scale(${2 * radius / resolution})`);
          ink.selectAll("path").data(paths).join("path").attr("class", "pa-ink")
            .attr("d", p => p.d).attr("data-marks", p => p.marks).attr("data-shape", markOptions.shape)
            .attr("fill", p => filled ? color(markOptions.brightnessMode === "Palette" ? (p.level / 31) ** (1 / exposure) : 1) : "none")
            .attr("stroke", p => filled ? "none" : color(markOptions.brightnessMode === "Palette" ? (p.level / 31) ** (1 / exposure) : 1))
            .attr("stroke-width", outlineWidth).attr("stroke-linejoin", "round");
        }
        if (state.showAxes) {
          field.append("g").attr("stroke", colors.muted).attr("stroke-opacity", .45).attr("stroke-width", .65).attr("stroke-dasharray", "3 5")
            .selectAll("line").data(d3.range(map.n)).join("line")
            .attr("x1", i => -radius * Math.cos(i * Math.PI / map.n)).attr("y1", i => -radius * Math.sin(i * Math.PI / map.n))
            .attr("x2", i => radius * Math.cos(i * Math.PI / map.n)).attr("y2", i => radius * Math.sin(i * Math.PI / map.n));
        }
        if (state.showDisks) disk.append("circle").attr("class", "pa-rim").attr("r", radius + 4).attr("fill", "none").attr("stroke", colors.rim).attr("stroke-width", .8);
      });

      const status = document.getElementById("orbit-status");
      if (status) status.textContent = statuses.join(" ");
      svg.attr("data-ready", "true").attr("data-samples", totalSamples);
    };

    const observer = new ResizeObserver(() => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { resizeFrame = null; render(); });
    });
    observer.observe(mountEl);
    render();
    return {
      render,
      destroy() {
        destroyed = true;
        observer.disconnect();
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        mountEl.style.backgroundColor = previousBackground;
        orbitCache.clear(); densityCache.clear(); geometryCache.clear();
      },
    };
  },
});
