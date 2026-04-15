// kakeyaBesicovitchNeedle.js
// Kakeya / Besicovitch (Perron tree) needle visual:
// - Builds a finite "sprouting Perron tree"-style triangle construction (approximation).
// - Places many unit-needle rectangles (tubes) whose endpoints fit inside the construction.
// - Optional animated sweep needle + footprint.
//
// Notes:
// - This is a *visual approximation* inspired by Perron-tree/Besicovitch-style compression,
//   not a formal proof renderer.
// - Works with oheyitsjeff.org visualHelp.js UI + transforms tab (first <g> is the source group).

import { registerVisual, runVisualApp } from "../helper/visualHelp.js";

registerVisual("kakeyaBesicovitchNeedle", {
  title: "Kakeya / Besicovitch Needle (Perron-Tree Approx, Rectangles)",
  description:
    "Finite Perron-tree-style construction. Shows where a unit 'needle' can sit for many directions, using thin rectangles. ",

  params: [
    // Construction
    { key: "levels", type: "number", default: 6, min: 0, max: 10, step: 1, category: "Construction", description: "Tree recursion depth (more = more directions / pieces)." },
    { key: "splitK", type: "number", default: 2, min: 2, max: 10, step: 1, category: "Construction", description: "How many base slices each triangle splits into per level (2 is classic)." },
    { key: "overlap", type: "number", default: 0.78, min: 0, max: 1, step: 0.01, category: "Construction", description: "How strongly slices are pulled toward center (higher = more overlap / smaller footprint)." },
    { key: "copies", type: "number", default: 6, min: 1, max: 16, step: 1, category: "Construction", description: "Rotate the whole tree into multiple orientations (helps fill many directions)." },
    { key: "baseWidth", type: "number", default: 2.0, min: 0.2, max: 4.0, step: 0.01, category: "Construction", description: "Width of the starting triangle base (normalized units)." },
    { key: "height", type: "number", default: 1.0, min: 0.2, max: 2.5, step: 0.01, category: "Construction", description: "Height of the starting triangle (normalized units)." },

    // Needles
    { key: "needleLen", type: "number", default: 1.0, min: 0.05, max: 2.0, step: 0.01, category: "Needles", description: "Needle length (normalized units)." },
    { key: "needleThickPx", type: "number", default: 3, min: 0.25, max: 30, step: 0.25, category: "Needles", description: "Needle rectangle thickness in pixels." },
    { key: "needlePadPx", type: "number", default: 0, min: 0, max: 30, step: 0.25, category: "Needles", description: "Shorten each needle rectangle at both ends (visual spacing)." },
    { key: "needleAlpha", type: "number", default: 0.25, min: 0.01, max: 1, step: 0.01, category: "Needles", description: "Opacity for the full needle set footprint." },
    { key: "maxNeedles", type: "number", default: 4000, min: 50, max: 30000, step: 50, category: "Needles", description: "Safety cap for number of needles drawn." },

    // Display toggles
    { key: "showTriangles", type: "boolean", default: false, category: "Display", description: "Draw construction triangles (the 'set')." },
    { key: "triFillAlpha", type: "number", default: 0.10, min: 0, max: 1, step: 0.01, category: "Display", description: "Triangle fill opacity." },
    { key: "triStrokeAlpha", type: "number", default: 0.18, min: 0, max: 1, step: 0.01, category: "Display", description: "Triangle stroke opacity." },
    { key: "showAllNeedles", type: "boolean", default: true, category: "Display", description: "Draw all needles (footprint)." },

    // Coloring
    { key: "colorMode", type: "select", default: "angle", options: ["angle", "level", "copy", "mono"], category: "Color", description: "How needles are colored." },
    { key: "palette", type: "select", default: "turbo", options: ["turbo", "viridis", "plasma", "magma", "cividis", "spectral"], category: "Color", description: "Palette for numeric color modes." },
    { key: "monoColor", type: "text", default: "#111111", category: "Color", description: "Mono mode color." },

    // Sweep needle (animated)
    // { key: "animateSweep", type: "boolean", default: false, description: "Animate a single rotating needle (and highlight the closest precomputed needle)." },
    // { key: "sweepDegPerSec", type: "number", default: 40, min: -360, max: 360, step: 1, description: "Sweep speed in degrees/sec." },
    // { key: "sweepStroke", type: "text", default: "#000000", description: "Sweep needle stroke color." },
    // { key: "sweepFill", type: "text", default: "#ffffff", description: "Sweep needle fill color." },
    // { key: "sweepGlowPx", type: "number", default: 3, min: 0, max: 20, step: 0.25, description: "Extra thickness for highlighted sweep needle." },

    // Guides + stats
    { key: "showBoundsCircle", type: "boolean", default: false, category: "Guides", description: "Draw a faint outer circle showing the fit-to-view bound." },
    { key: "showStats", type: "boolean", default: false, category: "Guides", description: "Draw stats text." },
    //{ key: "fitToView", type: "boolean", default: true, description: "Scale construction to fit viewport." },
  ],

  create({ mountEl }, state) {
    const root = d3.select(mountEl);
    const svg = root.append("svg")
      .style("background", "white")
      .style("touch-action", "none")
      .style("display", "block")
      .style("width", "100%")
      .style("height", "100%");

    // IMPORTANT for transforms tab: first <g> is the 'source group'.
    const gRoot = svg.append("g");
    const gGuide = gRoot.append("g").attr("data-layer", "guide");
    const gTris = gRoot.append("g").attr("data-layer", "tris");
    const gNeedles = gRoot.append("g").attr("data-layer", "needles");
    const gSweep = gRoot.append("g").attr("data-layer", "sweep");
    const gHud = gRoot.append("g").attr("data-layer", "hud");

    let w = 1, h = 1, Rpx = 1;
    let lastHash = "";
    let cache = null;

    let raf = null;
    let t0 = 0;
    let ro = null;

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const rad = (deg) => (deg * Math.PI) / 180;

    function paletteFn(name) {
      switch (name) {
        case "viridis": return d3.interpolateViridis;
        case "plasma": return d3.interpolatePlasma;
        case "magma": return d3.interpolateMagma;
        case "cividis": return d3.interpolateCividis;
        case "spectral": return d3.interpolateSpectral;
        case "turbo":
        default: return d3.interpolateTurbo;
      }
    }

    // Geometry helpers
    function rotPt(p, a) {
      const ca = Math.cos(a), sa = Math.sin(a);
      return { x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca };
    }
    function add(p, q) { return { x: p.x + q.x, y: p.y + q.y }; }
    function sub(p, q) { return { x: p.x - q.x, y: p.y - q.y }; }
    function mul(p, k) { return { x: p.x * k, y: p.y * k }; }
    function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
    function centroidTri(T) { return mul(add(add(T.A, T.B), T.C), 1 / 3); }

    // Point in triangle using barycentric signs
    function sign(p1, p2, p3) {
      return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    }
    function pointInTri(p, T) {
      const b1 = sign(p, T.A, T.B) < 0.0;
      const b2 = sign(p, T.B, T.C) < 0.0;
      const b3 = sign(p, T.C, T.A) < 0.0;
      return (b1 === b2) && (b2 === b3);
    }

    function boundsOfPts(pts) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
      return { minX, minY, maxX, maxY };
    }

    // Build a finite Perron-tree-ish construction:
    // Each triangle is split into K slices along its base, and each slice is translated toward x=0
    // by an amount proportional to its midpoint x-coordinate and the overlap parameter.
    function sprout(tris, level, K, overlap) {
      const out = [];
      for (const T of tris) {
        // Base is segment B-C. Split it into K segments.
        for (let i = 0; i < K; i++) {
          const t0 = i / K;
          const t1 = (i + 1) / K;
          const b0 = lerp(T.B, T.C, t0);
          const b1 = lerp(T.B, T.C, t1);
          const mid = lerp(b0, b1, 0.5);

          // New subtriangle shares apex A.
          const subT = { A: { ...T.A }, B: b0, C: b1, level };

          // Compress toward vertical axis (x=0): translate by -overlap * mid.x
          const tx = -overlap * mid.x;
          const delta = { x: tx, y: 0 };

          out.push({
            A: add(subT.A, delta),
            B: add(subT.B, delta),
            C: add(subT.C, delta),
            level,
          });
        }
      }
      return out;
    }

    function buildConstruction() {
      const levels = clamp(Math.trunc(Number(state.levels ?? 6)), 0, 12);
      const K = clamp(Math.trunc(Number(state.splitK ?? 2)), 2, 32);
      const overlap = clamp(Number(state.overlap ?? 0.7), 0, 1);
      const copies = clamp(Math.trunc(Number(state.copies ?? 6)), 1, 32);

      const baseW = Math.max(0.05, Number(state.baseWidth ?? 2));
      const H = Math.max(0.05, Number(state.height ?? 1));

      // Starting triangle centered on origin: apex at y=-H/2, base at y=+H/2
      const T0 = {
        A: { x: 0, y: -H / 2 },
        B: { x: -baseW / 2, y: +H / 2 },
        C: { x: +baseW / 2, y: +H / 2 },
        level: 0,
      };

      let tris = [T0];
      for (let L = 1; L <= levels; L++) {
        tris = sprout(tris, L, K, overlap);
      }

      // Rotate into multiple copies (like the “six rotations” pictures)
      const all = [];
      for (let c = 0; c < copies; c++) {
        const a = (Math.PI * c) / copies; // in [0, pi)
        for (const T of tris) {
          all.push({
            A: rotPt(T.A, a),
            B: rotPt(T.B, a),
            C: rotPt(T.C, a),
            level: T.level,
            copy: c,
            rot: a,
          });
        }
      }
      return all;
    }

    // Find a representative unit segment inside triangle, oriented by angle.
    // We try to center it at the centroid and shrink until it fits.
    function segmentInTriangle(T, theta, L) {
      const dir = { x: Math.cos(theta), y: Math.sin(theta) };
      const C = centroidTri(T);

      let lo = 0, hi = L;
      let best = null;

      for (let iter = 0; iter < 30; iter++) {
        const m = (lo + hi) / 2;
        const p0 = sub(C, mul(dir, m / 2));
        const p1 = add(C, mul(dir, m / 2));

        if (pointInTri(p0, T) && pointInTri(p1, T)) {
          best = { p0, p1, len: m };
          lo = m;
        } else {
          hi = m;
        }
      }

      if (!best || best.len < 1e-4) return null;
      return best;
    }

    function buildNeedles(tris) {
      const needles = [];
      const L = Math.max(0.01, Number(state.needleLen ?? 1));

      for (const T of tris) {
        // Use the direction of the triangle’s median (apex -> base midpoint) as a representative angle.
        const baseMid = lerp(T.B, T.C, 0.5);
        const v = sub(baseMid, T.A);
        const theta = Math.atan2(v.y, v.x);

        const seg = segmentInTriangle(T, theta, L);
        if (!seg) continue;

        const dx = seg.p1.x - seg.p0.x;
        const dy = seg.p1.y - seg.p0.y;
        const angDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const len = Math.hypot(dx, dy);

        needles.push({
          x0: seg.p0.x, y0: seg.p0.y,
          x1: seg.p1.x, y1: seg.p1.y,
          midx: (seg.p0.x + seg.p1.x) / 2,
          midy: (seg.p0.y + seg.p1.y) / 2,
          theta,
          angDeg,
          len,
          level: T.level,
          copy: T.copy,
        });
      }

      // Cap for performance
      const maxN = clamp(Math.trunc(Number(state.maxNeedles ?? 4000)), 50, 50000);
      if (needles.length > maxN) return needles.slice(0, maxN);
      return needles;
    }

    function colorForNeedle(d, nNeedles) {
      const mode = state.colorMode || "angle";
      if (mode === "mono") return state.monoColor || "#111";

      const interp = paletteFn(state.palette);
      let t = 0.5;

      if (mode === "angle") {
        // map theta in [0, pi) -> [0,1]
        let a = d.theta % Math.PI;
        if (a < 0) a += Math.PI;
        t = a / Math.PI;
      } else if (mode === "level") {
        const L = Math.max(1, Number(state.levels ?? 1));
        t = clamp(d.level / L, 0, 1);
      } else if (mode === "copy") {
        const C = Math.max(1, Number(state.copies ?? 1));
        t = clamp(d.copy / (C - 1 || 1), 0, 1);
      } else {
        t = 0.5;
      }
      return interp(t);
    }

    function rebuildIfNeeded() {
      const rect = mountEl.getBoundingClientRect();
      const ww = Math.floor(rect.width || 0);
      const hh = Math.floor(rect.height || 0);
      w = Math.max(1, ww > 50 ? ww : (window.innerWidth || 1));
      h = Math.max(1, hh > 50 ? hh : (window.innerHeight || 1));
      Rpx = 0.46 * Math.min(w, h);
      svg.attr("width", w).attr("height", h).attr("viewBox", `${-w / 2} ${-h / 2} ${w} ${h}`);
      
      // Put (0,0) of your drawing coords at the center of the screen
      const hash = JSON.stringify({
        levels: state.levels,
        splitK: state.splitK,
        overlap: state.overlap,
        copies: state.copies,
        baseWidth: state.baseWidth,
        height: state.height,
        needleLen: state.needleLen,
        maxNeedles: state.maxNeedles,
        showTriangles: state.showTriangles,
        triFillAlpha: state.triFillAlpha,
        triStrokeAlpha: state.triStrokeAlpha,
        showAllNeedles: state.showAllNeedles,
        needleThickPx: state.needleThickPx,
        needlePadPx: state.needlePadPx,
        needleAlpha: state.needleAlpha,
        colorMode: state.colorMode,
        palette: state.palette,
        monoColor: state.monoColor,
        showBoundsCircle: state.showBoundsCircle,
        showStats: state.showStats,
        //fitToView: state.fitToView,
      });

      if (hash === lastHash && cache) return;
      lastHash = hash;

      gGuide.selectAll("*").remove();
      gTris.selectAll("*").remove();
      gNeedles.selectAll("*").remove();
      gHud.selectAll("*").remove();

      // Build construction + needles in normalized coords
      const tris = buildConstruction();
      const needles = buildNeedles(tris);

      // Fit to view (scale normalized coords into pixels)
      let scale = 1;
      let off = { x: 0, y: 0 };

      // if (state.fitToView) {
      //   const pts = [];
      //   for (const T of tris) pts.push(T.A, T.B, T.C);
      //   const b = boundsOfPts(pts);
      //   const cx = (b.minX + b.maxX) / 2;
      //   const cy = (b.minY + b.maxY) / 2;
      //   const rx = Math.max(1e-9, (b.maxX - b.minX) / 2);
      //   const ry = Math.max(1e-9, (b.maxY - b.minY) / 2);

      //   scale = 0.98 * Math.min(Rpx / rx, Rpx / ry);
      //   off = { x: -cx, y: -cy };
      // } else {
      //   // still scale a bit so normalized units aren’t tiny
      //   scale = Rpx;
      // }
      scale = Rpx;
      function mapP(p) {
        const q = add(p, off);
        return { x: q.x * scale, y: q.y * scale };
      }

      const trisPx = tris.map((T) => {
        const A = mapP(T.A), B = mapP(T.B), C = mapP(T.C);
        return { ...T, A, B, C };
      });

      const needlesPx = needles.map((d) => {
        const p0 = mapP({ x: d.x0, y: d.y0 });
        const p1 = mapP({ x: d.x1, y: d.y1 });
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        const angDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

        return {
          ...d,
          x0: p0.x, y0: p0.y,
          x1: p1.x, y1: p1.y,
          midx: (p0.x + p1.x) / 2,
          midy: (p0.y + p1.y) / 2,
          len,
          angDeg,
        };
      });

      // Guides
      if (state.showBoundsCircle) {
        gGuide.append("circle")
          .attr("r", Rpx)
          .attr("fill", "none")
          .attr("stroke", "#000")
          .attr("opacity", 0.08)
          .attr("stroke-width", 1);
      }

      // Triangles (construction)
      if (state.showTriangles) {
        const fillA = clamp(Number(state.triFillAlpha ?? 0.1), 0, 1);
        const strokeA = clamp(Number(state.triStrokeAlpha ?? 0.18), 0, 1);

        gTris.selectAll("path")
          .data(trisPx)
          .join("path")
          .attr("d", (T) => `M ${T.A.x} ${T.A.y} L ${T.B.x} ${T.B.y} L ${T.C.x} ${T.C.y} Z`)
          .attr("fill", "#ffd54a")
          .attr("opacity", fillA)
          .attr("stroke", "#111")
          .attr("stroke-opacity", strokeA)
          .attr("stroke-width", 1);
      }

      // Needles footprint
      if (state.showAllNeedles) {
        const thick = Math.max(0.25, Number(state.needleThickPx ?? 3));
        const pad = Math.max(0, Number(state.needlePadPx ?? 0));
        const alpha = clamp(Number(state.needleAlpha ?? 0.25), 0.01, 1);

        gNeedles.selectAll("rect")
          .data(needlesPx, (_, i) => i)
          .join("rect")
          .attr("x", 0)
          .attr("y", (d) => -thick / 2)
          .attr("width", (d) => Math.max(0.001, d.len - 2 * pad))
          .attr("height", thick)
          .attr("rx", 0.6)
          .attr("ry", 0.6)
          .attr("opacity", alpha)
          .attr("fill", (d, i) => colorForNeedle(d, needlesPx.length))
          .attr("transform", (d) => {
            const L = Math.max(0.001, d.len);
            const ux = (d.x1 - d.x0) / Math.max(1e-9, L);
            const uy = (d.y1 - d.y0) / Math.max(1e-9, L);
            const sx = d.x0 + ux * pad;
            const sy = d.y0 + uy * pad;
            return `translate(${sx},${sy}) rotate(${d.angDeg})`;
          });
      }

      // HUD
      if (state.showStats) {
        const lines = [
          `levels=${state.levels}  splitK=${state.splitK}  overlap=${Number(state.overlap).toFixed(2)}  copies=${state.copies}`,
          `triangles: ${trisPx.length.toLocaleString()}  needles: ${needlesPx.length.toLocaleString()}`,
          `needleLen=${Number(state.needleLen).toFixed(2)} (normalized)`,
          `colorMode=${state.colorMode}`,
        ];

        const g = gHud.append("g")
          .attr("transform", `translate(${(-w / 2) + 14},${(-h / 2) + 18})`);

        g.selectAll("text")
          .data(lines)
          .join("text")
          .attr("x", 0)
          .attr("y", (_, i) => i * 14)
          .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace")
          .attr("font-size", 12)
          .attr("fill", "#111")
          .attr("opacity", 0.75)
          .text((d) => d);
      }

      cache = { trisPx, needlesPx };
    }

    function drawSweep(ts) {
      if (!cache) return;

      gSweep.selectAll("*").remove();

      if (!state.animateSweep) return;

      if (!t0) t0 = ts;
      const dt = (ts - t0) / 1000;

      const speed = Number(state.sweepDegPerSec ?? 40);
      // Sweep in [0, pi) (180° covers all directions for unoriented segments)
      let a = rad(dt * speed) % Math.PI;
      if (a < 0) a += Math.PI;

      // Choose the closest precomputed needle by angle
      const needles = cache.needlesPx;
      if (!needles.length) return;

      let best = needles[0];
      let bestErr = Infinity;

      for (const d of needles) {
        // Compare modulo pi
        let da = Math.abs((d.theta % Math.PI) - a);
        da = Math.min(da, Math.PI - da);
        if (da < bestErr) { bestErr = da; best = d; }
      }

      const thick = Math.max(0.25, Number(state.needleThickPx ?? 3)) + Math.max(0, Number(state.sweepGlowPx ?? 0));
      const pad = Math.max(0, Number(state.needlePadPx ?? 0));

      gSweep.append("rect")
        .attr("x", 0)
        .attr("y", -thick / 2)
        .attr("width", Math.max(0.001, best.len - 2 * pad))
        .attr("height", thick)
        .attr("rx", 1.2)
        .attr("ry", 1.2)
        .attr("fill", state.sweepFill || "#fff")
        .attr("stroke", state.sweepStroke || "#000")
        .attr("stroke-width", 1.25)
        .attr("opacity", 1)
        .attr("transform", (() => {
          const L = Math.max(0.001, best.len);
          const ux = (best.x1 - best.x0) / Math.max(1e-9, L);
          const uy = (best.y1 - best.y0) / Math.max(1e-9, L);
          const sx = best.x0 + ux * pad;
          const sy = best.y0 + uy * pad;
          return `translate(${sx},${sy}) rotate(${best.angDeg})`;
        })());

      // small angle readout
      gSweep.append("text")
        .attr("x", (-w / 2) + 14)
        .attr("y", (h / 2) - 18)
        .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace")
        .attr("font-size", 12)
        .attr("fill", "#111")
        .attr("opacity", 0.75)
        .text(`sweep θ ≈ ${(a * 180 / Math.PI).toFixed(1)}°  (matched err ${(bestErr * 180 / Math.PI).toFixed(2)}°)`);
    }

    function loop(ts) {
      rebuildIfNeeded();
      //drawSweep(ts);
      //raf = requestAnimationFrame(loop);
    }

    function start() {
      if (raf) return;
      t0 = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    function onResize() {
      lastHash = "";
      rebuildIfNeeded();
    }
    window.addEventListener("resize", onResize);
    ro = new ResizeObserver(() => onResize());
    ro.observe(mountEl);

    // Click toggles sweep animation
    // svg.on("click", () => {
    //   state.animateSweep = !state.animateSweep;
    //   // no need to rebuild geometry; sweep will reflect next frame
    // });
    start();

    return {
      render: () => {
        // Force rebuild when params change
        lastHash = "";
        rebuildIfNeeded();
      },
      destroy: () => {
        stop();
        ro?.disconnect();
        window.removeEventListener("resize", onResize);
        svg.remove();
      },
    };
  },
});

document.addEventListener("DOMContentLoaded", () => {
  runVisualApp({
    visualId: "kakeyaBesicovitchNeedle",
    mountEl: document.getElementById("vis"),
    uiEl: document.getElementById("config"),
  });
});

// Optional nav helper
function goTo(page) { window.location.href = page; }
window.goTo = goTo;
