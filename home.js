/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

let width;
let height;
let bubbleRadius = 60;
let textRadius = 28;
let svg;
let initStrength = 0.02;
let dragSimStrength = 0.09;
let needsSingleBubbleMode = false;
const MOBILE_BREAKPOINT_PX = 600;
const MOBILE_MODE_STORAGE_KEY = "home.mobileMode"; // "bubbles" | "apps"
const MOBILE_BUBBLE_SPAWN_HEIGHT_RATIO = 0.72;
const MOBILE_BUBBLE_CENTER_HEIGHT_RATIO = 0.25;
const MOBILE_BUBBLE_CENTER_STRENGTH = 0.035;
const MOBILE_BUBBLE_HEIGHT_SCALE = 1.12;
const MOBILE_BUBBLE_TOP_PADDING = 18;
const BUBBLE_SIZE_SCALES = {
  small: 0.7,
  medium: 1,
  large: 1.8,
  extralarge: 2.5
};
const BUBBLE_SHAPE_DRAW_SCALES = {
  circle: 1,
  square: 1,
  diamond: 1 / 0.9434314575,
  triangle: 1 / 0.8260253906
};
const BUBBLE_SHAPE_MAX_EXTENTS = {
  circle: 1,
  square: 1,
  diamond: 1,
  triangle: 1.148
};
const AVERAGE_IMAGE_COLOR_CACHE = new Map();
function getMobileModePref() {
  const raw = localStorage.getItem(MOBILE_MODE_STORAGE_KEY);
  return raw === "bubbles" ? "bubbles" : "apps";
}

function setMobileModePref(mode) {
  localStorage.setItem(MOBILE_MODE_STORAGE_KEY, mode);
}
function isMobileLayout() {
  return Math.round(window.innerWidth) < MOBILE_BREAKPOINT_PX;
}

function getEffectiveMode() {
  if (!isMobileLayout()) return "bubbles";
  return getMobileModePref() === "bubbles" ? "bubbles" : "apps";
}

let appsViewer;
let attachBubbleGestures;
let clearBubbleGestures = () => {};
let homeRenderVersion = 0;

function clearHome() {
  clearBubbleGestures();
  clearBubbleGestures = () => {};
  homeRenderVersion++;
  appsViewer?.destroy();
  appsViewer = null;
  const backgroundDiv = document.getElementById("background");
  if (backgroundDiv) backgroundDiv.innerHTML = "";
  d3.select("#d3-container").selectAll("*").remove();
}

function getVisibleBubbleViewportHeight() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const containerTop = document.getElementById("d3-container")?.getBoundingClientRect().top || 0;
  return Math.max(1, Math.round(viewportHeight - Math.max(0, containerTop)));
}

function renderHome() {
  clearHome();

  const mode = getEffectiveMode();
  const isMobile = isMobileLayout();

  width = Math.round(window.innerWidth);
  bubbleRadius = Math.min(width * 0.15, 50);


  document.body.classList.toggle("showing-apps", mode === "apps");
  if (mode === "apps") {
    const version = homeRenderVersion;
    const container = document.getElementById("background");
    import("/Apps/viewer.js").then(({ mountAppsViewer }) => {
      if (version !== homeRenderVersion) return;
      appsViewer = mountAppsViewer(container, {
        onBubbles() {
          setMobileModePref("bubbles");
          window.scrollTo(0, 0);
          renderHome();
        }
      });
    }).catch(error => {
      if (version !== homeRenderVersion) return;
      container.textContent = "Apps could not load. Please refresh to try again.";
      console.error(error);
    });
    return;
  }

  // Bubbles mode:
  // On small screens we may not have enough vertical room for all bubbles to settle without being clipped.
  // Estimate a minimum required height from each bubble's actual rendered size.
  const baseHeight = isMobile
    ? getVisibleBubbleViewportHeight()
    : Math.round(window.innerHeight - 38);
  const minBubbleAreaHeight = estimateBubbleAreaHeight(projects, width, bubbleRadius);
  height = isMobile
    ? Math.max(baseHeight, Math.ceil(minBubbleAreaHeight * MOBILE_BUBBLE_HEIGHT_SCALE))
    : baseHeight;

  const svg = d3.select("#d3-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);
  const simulation = createD3Bubbles(svg);
  runSimulationBurst(isMobile ? 3500 : 2000, undefined, simulation);
}
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function roundedPolygonPath(points, cornerRadius) {
  return points.map((point, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    const toPrevious = Math.hypot(previous[0] - point[0], previous[1] - point[1]);
    const toNext = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const previousInset = Math.min(cornerRadius, toPrevious / 2);
    const nextInset = Math.min(cornerRadius, toNext / 2);
    const start = [
      point[0] + (previous[0] - point[0]) * previousInset / toPrevious,
      point[1] + (previous[1] - point[1]) * previousInset / toPrevious
    ];
    const end = [
      point[0] + (next[0] - point[0]) * nextInset / toNext,
      point[1] + (next[1] - point[1]) * nextInset / toNext
    ];
    return `${i === 0 ? "M" : "L"}${start[0]},${start[1]} Q${point[0]},${point[1]} ${end[0]},${end[1]}`;
  }).join(" ") + " Z";
}

function normalizeBubbleShape(shape) {
  return ["circle", "square", "diamond", "triangle"].includes(shape) ? shape : "circle";
}

// Add a project bubble shape. Omitting shape intentionally keeps the existing circle.
function appendBubbleShape(group, radius, shape = "circle") {
  const normalizedShape = normalizeBubbleShape(shape);
  const drawRadius = radius * BUBBLE_SHAPE_DRAW_SCALES[normalizedShape];
  if (normalizedShape === "circle") {
    return group.append("circle").attr("r", drawRadius);
  }

  let points;
  let cornerRadius;
  if (normalizedShape === "square") {
    points = [[-drawRadius, -drawRadius], [drawRadius, -drawRadius], [drawRadius, drawRadius], [-drawRadius, drawRadius]];
    cornerRadius = drawRadius * 0.14;
  } else if (normalizedShape === "diamond") {
    points = [[0, -drawRadius], [drawRadius, 0], [0, drawRadius], [-drawRadius, 0]];
    cornerRadius = drawRadius * 0.16;
  } else {
    points = [[0, -drawRadius], [drawRadius * Math.sqrt(3) / 2, drawRadius / 2], [-drawRadius * Math.sqrt(3) / 2, drawRadius / 2]];
    cornerRadius = drawRadius * 0.12;
  }
  return group.append("path").attr("d", roundedPolygonPath(points, cornerRadius));
}

function getBubbleLayerShape(project, layer) {
  const layerShape = layer === "outer" ? project.outerShape : project.innerShape;
  return normalizeBubbleShape(layerShape || project.shape);
}

function getBubbleGeometry(project, objectRadius) {
  const innerShape = getBubbleLayerShape(project, "inner");
  const outerShape = getBubbleLayerShape(project, "outer");
  const outerInradiusFactor = {
    circle: 1,
    square: 1,
    diamond: Math.SQRT1_2,
    triangle: 0.5
  }[outerShape];
  const shapesAlign = innerShape === outerShape;
  const innerRequiredRadius = objectRadius * BUBBLE_SHAPE_MAX_EXTENTS[innerShape];
  const outerPathRadius = shapesAlign
    ? objectRadius + 12
    : (innerRequiredRadius + 12) / (outerInradiusFactor * BUBBLE_SHAPE_DRAW_SCALES[outerShape]);
  return {
    innerRadius: objectRadius,
    outerPathRadius,
    collisionRadius: outerPathRadius * BUBBLE_SHAPE_MAX_EXTENTS[outerShape] + textRadius / 2
  };
}

function getBubbleSizeScale(size = "medium") {
  const normalizedSize = String(size).toLowerCase().replace(/[\s_-]+/g, "");
  return BUBBLE_SIZE_SCALES[normalizedSize] || BUBBLE_SIZE_SCALES.medium;
}

function estimateBubbleAreaHeight(items, availableWidth, baseRadius) {
  const gap = 16;
  const rowCapacity = Math.max(1, availableWidth - gap);
  const diameters = items
    .map((item) => {
      const objectRadius = baseRadius * getBubbleSizeScale(item.size);
      return getBubbleGeometry(item, objectRadius).collisionRadius * 2 + gap;
    })
    .sort((a, b) => b - a);

  let totalHeight = gap;
  let rowWidth = 0;
  let rowHeight = 0;
  for (const diameter of diameters) {
    if (rowWidth > 0 && rowWidth + diameter > rowCapacity) {
      totalHeight += rowHeight;
      rowWidth = 0;
      rowHeight = 0;
    }
    rowWidth += diameter;
    rowHeight = Math.max(rowHeight, diameter);
  }
  return Math.ceil(totalHeight + rowHeight);
}

function getImagePreserveAspectRatio(imageFit = "cover") {
  return String(imageFit).toLowerCase() === "fill" ? "none" : "xMidYMid slice";
}

function getAverageImageColor(src) {
  if (!src) return Promise.reject(new Error("Cannot average an image without a source."));
  if (AVERAGE_IMAGE_COLOR_CACHE.has(src)) return AVERAGE_IMAGE_COLOR_CACHE.get(src);

  const colorPromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const sampleSize = 40;
        const canvas = document.createElement("canvas");
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, sampleSize, sampleSize);
        const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let weight = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const alpha = pixels[i + 3] / 255;
          if (alpha === 0) continue;
          red += pixels[i] * alpha;
          green += pixels[i + 1] * alpha;
          blue += pixels[i + 2] * alpha;
          weight += alpha;
        }
        if (!weight) throw new Error(`Image "${src}" contains no visible pixels.`);
        resolve(`rgb(${Math.round(red / weight)}, ${Math.round(green / weight)}, ${Math.round(blue / weight)})`);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Unable to load image "${src}" for color averaging.`));
    image.src = src;
  });

  AVERAGE_IMAGE_COLOR_CACHE.set(src, colorPromise);
  return colorPromise;
}

function createD3Bubbles(svg) {
 
    // after you’ve set width, height, initStrength, dragSimStrength
const centerX = width  / 2;
const isMobile = isMobileLayout();
const visibleHeight = isMobile
  ? getVisibleBubbleViewportHeight()
  : Math.max(1, Math.round(window.innerHeight - 38));
  // Patterns for image fill
  svg.append("defs")
    .selectAll("pattern")
    .data(projects)
    .enter()
    .append("pattern")
    .attr("id", d => `imgpat-${d.title.replace(/\s/g, "")}`)
    .attr("patternUnits", "objectBoundingBox")
    .attr("patternContentUnits", "objectBoundingBox")
    .attr("width", 1)
    .attr("height", 1)
    .append("image")
    .attr("xlink:href", d => d.image)
    .attr("preserveAspectRatio", d => getImagePreserveAspectRatio(d.imageFit))
    .attr("width", 1)
    .attr("height", 1)
    .attr("x", 0)
    .attr("y", 0)
    .style("opacity", 0)
  .each(function () {
    const img = this;
    img.onload = () => {
      d3.select(img)
        .transition()
        .duration(420)
        .ease(d3.easeCubicOut)
        .style("opacity", 1);
    };
  });

  // Initial data
  nodes = [];
  projects.forEach((d) => {
    const r = bubbleRadius * getBubbleSizeScale(d.size);
    const geometry = getBubbleGeometry(d, r);
    const minX = geometry.collisionRadius;
    const maxX = Math.max(minX, width - geometry.collisionRadius);
    const minY = geometry.collisionRadius + (isMobile ? MOBILE_BUBBLE_TOP_PADDING : 0);
    const maxY = isMobile
      ? Math.max(
          minY,
          Math.min(
            height - geometry.collisionRadius,
            Math.max(visibleHeight, height) * MOBILE_BUBBLE_SPAWN_HEIGHT_RATIO
          )
        )
      : Math.max(minY, height - geometry.collisionRadius);

    let bestPosition = null;
    const attempts = isMobile ? 160 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const candidate = {
        x: Math.random() * Math.max(0, maxX - minX) + minX,
        y: Math.random() * Math.max(0, maxY - minY) + minY
      };
      const clearance = nodes.reduce(
        (closest, placed) => Math.min(
          closest,
          Math.hypot(candidate.x - placed.x, candidate.y - placed.y) - geometry.collisionRadius - placed.collisionRadius
        ),
        Number.POSITIVE_INFINITY
      );

      if (!bestPosition || clearance > bestPosition.clearance) {
        bestPosition = { ...candidate, clearance };
      }
      if (clearance >= 6) break;
    }

    nodes.push({
      ...d,
      r,
      ...geometry,
      x: bestPosition.x,
      y: bestPosition.y
    });
  });

const largestCollisionRadius = Math.max(...nodes.map(d => d.collisionRadius));
const centerY = isMobile
  ? Math.min(
      height - largestCollisionRadius,
      Math.max(largestCollisionRadius + 8, visibleHeight * MOBILE_BUBBLE_CENTER_HEIGHT_RATIO)
    )
  : (height - height * 0.4) / 2;

const forceX = d3.forceX(centerX)
  .strength(d => isOutX(d) ? 0 : initStrength);

const forceY = d3.forceY(centerY)
  .strength(d => isOutX(d) ? dragSimStrength * 4 : (isMobile ? MOBILE_BUBBLE_CENTER_STRENGTH : initStrength));
 const simulation = d3.forceSimulation(nodes)
  .force(
    "collide",
    d3.forceCollide()
      .radius(d => d.collisionRadius + (isMobile ? 4 : -3))
      .iterations(isMobile ? 5 : 1)
  )
  .force("x", forceX)
  .force("y", forceY)
  .alpha(0)
  .on("tick", ticked)
  .stop(); 
  // Create g for each node
   node = svg.selectAll("g.bubble")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", d => `bubble bubble--${String(d.size || "medium").toLowerCase()}`)
    .style("cursor", "pointer");
  clearBubbleGestures = attachBubbleGestures(node, {
    d3,
    simulation,
    restartSimulation: () => runSimulationBurst(3000, 0.8, simulation),
    activate: datum => { window.location.href = datum.link; },
  });

  // Draw the bubbles. A project's optional `shape` is passed to the helper;
  // leaving it out preserves the original circular bubble.
  node.each(function(d) {
    const group = d3.select(this);
    const innerShape = getBubbleLayerShape(d, "inner");
    const innerRadius = d.innerRadius;
    appendBubbleShape(group, innerRadius, innerShape)
      .attr("class", `bubble-shape bubble-shape--${innerShape}`)
      .attr("fill", d.innerFill || `url(#imgpat-${d.title.replace(/\s/g, "")})`)
      .attr("stroke", "var(--bubble-stroke)")
      .attr("stroke-width", "4px")
      .style("filter", "drop-shadow(0 2px 16px var(--bubble-glow))");
    appendBubbleShape(group, Math.max(1, innerRadius - 5), innerShape)
      .attr("class", `bubble-shape-highlight bubble-shape-highlight--${innerShape}`)
      .attr("fill", "none")
      .attr("stroke", "var(--bubble-highlight)")
      .attr("stroke-width", "3px")
      .style("filter", "drop-shadow(0 4px 22px var(--bubble-glow-soft))");
  });

    node.each(function(d, i) {
      const g = d3.select(this);
    
      // Create a unique path for each bubble
      const arcId = `bubbleArc-${i}`;
      const r = d.outerPathRadius;
    
      // Add path for text arc in defs
      svg.append("defs")
        .append("path")
        .attr("id", arcId)
        .attr("d", describeArc(0, 0, r, 90, 270)); // semi-circle on top
   

      // Draw the title strip around the selected bubble silhouette. Text still
      // follows a gentle arc so non-circular shapes remain easy to read.
      const outerShape = getBubbleLayerShape(d, "outer");
      const titleStrip = outerShape !== "circle"
        ? appendBubbleShape(g, r, outerShape)
        : g.append("path").attr("d", describeArc(0, 0, r, -90, 270));
      const outerColor = String(d.outerColor || "default");
      titleStrip
        .attr("class", `bubble-title-strip bubble-title-strip--${outerShape}`)
        .attr("fill", "none")
        .attr("stroke", outerColor === "default" || outerColor === "average" ? "var(--bubble-highlight)" : outerColor)
        .attr("stroke-opacity", 0.25)
        .attr("stroke-width", textRadius) // thickness of the white strip
        .style("filter", "drop-shadow(1 2px 6px var(--bubble-glow-soft))"); // optional shadow

      if (outerColor === "average") {
        getAverageImageColor(d.image)
          .then((color) => {
            if (!titleStrip.node()?.isConnected) return;
            titleStrip.attr("stroke", color).attr("data-average-color", color);
          })
          .catch(() => {});
      }
    
      // Add the text along the arc
      g.append("text")
        .attr("dy", 6) // vertical offset, adjust as needed
        .append("textPath")
        .style("user-select", "none")          // standard
  .style("-webkit-user-select", "none")  // Safari
  .style("-moz-user-select", "none")     // Firefox
  .style("-ms-user-select", "none")      // IE10+
        .attr("xlink:href", `#${arcId}`)
        .attr("startOffset", "50%") // center the text
        .style("text-anchor", "middle")
        .style("font-size", "1.0rem")
        .style("fill", "var(--bubble-text)")
        .style("font-family", "inherit")
        .text(d.title);
    });
    function ticked() {
  node.attr("transform", d => {
    
    // clamp inside
    d.x = Math.max(d.collisionRadius, Math.min(width - d.collisionRadius, d.x));
    const minY = d.collisionRadius + (isMobile ? MOBILE_BUBBLE_TOP_PADDING : 0);
    d.y = Math.max(minY, Math.min(height - d.collisionRadius, d.y));
    return `translate(${d.x},${d.y})`;
  });
}
    



// a little helper to know when a node is off-screen (horizontally)
function isOutX(d) {
  return d.x < d.collisionRadius || d.x > width - d.collisionRadius;
}

// note: I multiplied dragSimStrength by 4 here to make the vertical “slide” more pronounced
// you can tweak that multiplier to taste

// const simulation = d3.forceSimulation(nodes)
//   .force("collide", d3.forceCollide().radius(d => d.r + textRadius-3).iterations(1))
//   .force("x", forceX)
//   .force("y", forceY)
//   .alpha(0.4)
//   .on("tick", ticked);
  

  return simulation;
}


function runSimulationBurst(duration = 4000, alpha = 0.6, simulation) {
  simulation
    .alpha(alpha)
    .alphaTarget(0)
    .restart();

  clearTimeout(simulation._burstTimer);
  simulation._burstTimer = setTimeout(() => {
    simulation.stop();
  }, duration);
}

// Returns an SVG arc string, center at (cx, cy), radius, from startAngle to endAngle (in degrees)
function describeArc(cx, cy, r, startAngle, endAngle){
  var start = polarToCartesian(cx, cy, r, endAngle);
  var end = polarToCartesian(cx, cy, r, startAngle);
  var largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  var d = [
      "M", start.x, start.y,
      "A", r, r, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
  return d;
}

function polarToCartesian(cx, cy, r, angleInDegrees) {
var angleInRadians = (angleInDegrees-90) * Math.PI / 180.0;
return {
  x: cx + (r * Math.cos(angleInRadians)),
  y: cy + (r * Math.sin(angleInRadians))
};
}

function goTo(page) {
  window.location.href = page;
}
function gradientAnimation() {
  const blurb = document.getElementsByTagName('body');
  let inc = 1;
  setInterval(function () {

    blurb[0].style.background = "linear-gradient(110deg, rgba(248, 182, 241," + inc + ") , rgba(255,255,255,1) 20.71%)";
    inc = inc - .05;
    
  }, 400);
  console.log(blurb);
}
// Shared with Apps; add/remove apps in projects.json.
let projects = [];
// document.addEventListener("DOMContentLoaded", function() {
//   width = window.innerWidth;
//   height = window.innerHeight - 68;
//   bubbleRadius= 50;
//   bubbleRadius = Math.min(window.innerWidth * 0.15, 50);
//    // Clear previous svg if any
//    d3.select("#d3-container").selectAll("*").remove();

//    const svg = d3.select("#d3-container")
//      .append("svg")
//      .attr("width", width)
//      .attr("height", height);
//   //createProjectCards();
//   //createStars(svg);
//   const simulation = createD3Bubbles(svg);
//   runSimulationBurst(2000,undefined,simulation);


// });
function initOnceStable() {
  renderHome();
}

// wait for EVERYTHING that causes reflow
Promise.all([
  new Promise(r => document.readyState === "complete" ? r() : window.addEventListener("load", r, { once: true })),
  document.fonts.ready,
  import("./helper/galleryRegistry.js").then(({ loadGalleryProjects }) => loadGalleryProjects("main")),
  import("./helper/galleryGestures.js"),
]).then(([, , registeredProjects, gestures]) => {
  attachBubbleGestures = gestures.attachBubbleGestures;
  projects = shuffle(registeredProjects);
  
  initOnceStable();
  // On mobile, scrolling can change `innerHeight` as the browser chrome shows/hides,
  // which fires `resize` and would rebuild the whole scene (appearing as a "reset").
  // Only re-render on meaningful viewport changes (width/orientation), not minor height shifts.
  let lastVp = { w: Math.round(window.innerWidth), h: Math.round(window.innerHeight) };
  let resizeRaf = 0;
  const onResize = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      const next = { w: Math.round(window.innerWidth), h: Math.round(window.innerHeight) };
      const widthChanged = next.w !== lastVp.w;
      const bigHeightChanged = Math.abs(next.h - lastVp.h) > 140; // orientation / keyboard; not address-bar scroll
      lastVp = next;
      if (widthChanged || bigHeightChanged) renderHome();
    });
  };
  window.addEventListener("resize", onResize);
  // double RAF ensures viewport + scrollbar + GPU settle
  // requestAnimationFrame(() => {
  //   requestAnimationFrame(initOnceStable);
  // });
}).catch((error) => {
  console.error("Unable to load gallery:", error);
  const message = document.createElement("p");
  message.textContent = "The gallery could not load. Please refresh to try again.";
  document.getElementById("background")?.replaceChildren(message);
});
