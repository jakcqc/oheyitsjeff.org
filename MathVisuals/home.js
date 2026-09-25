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
const BUBBLE_SIZE_SCALES = { small: 0.7, medium: 1, large: 1.8, extralarge: 2.5 };

function getProjectBubbleRadius(project) {
  const size = String(project.size || "medium").toLowerCase().replace(/[\s_-]+/g, "");
  return bubbleRadius * (BUBBLE_SIZE_SCALES[size] || BUBBLE_SIZE_SCALES.medium);
}

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
  // Estimate a minimum required height based on a loose packing grid.
  const baseHeight = Math.round(window.innerHeight - 18);
  const bubbleDiameter = (bubbleRadius * 2) + (textRadius * 2) + 16; // include label ring + padding
  const cols = Math.max(1, Math.floor((width - 16) / bubbleDiameter));
  const rows = Math.ceil(projects.length / cols);
  const extraSizeHeight = projects.reduce((total, project) =>
    total + Math.max(0, getProjectBubbleRadius(project) - bubbleRadius) * 2, 0);
  const minBubbleAreaHeight = Math.ceil(rows * bubbleDiameter + extraSizeHeight);
  height = isMobile ? Math.max(baseHeight, minBubbleAreaHeight) : baseHeight;

  const svg = d3.select("#d3-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);
  const simulation = createD3Bubbles(svg);
  runSimulationBurst(2000, undefined, simulation);
}
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function appendMathBubbleShape(group, radius, shape) {
  if (shape === "diamond") {
    // Match the softly rounded diamond used by the main gallery's route bubble.
    const r = radius / 0.9434314575;
    const inset = r * 0.16 / Math.SQRT2;
    return group.append("path").attr("d",
      `M${-inset},${-r + inset} Q0,${-r} ${inset},${-r + inset}` +
      ` L${r - inset},${-inset} Q${r},0 ${r - inset},${inset}` +
      ` L${inset},${r - inset} Q0,${r} ${-inset},${r - inset}` +
      ` L${-r + inset},${inset} Q${-r},0 ${-r + inset},${-inset} Z`);
  }
  return group.append("rect")
    .attr("x", -radius).attr("y", -radius)
    .attr("width", radius * 2).attr("height", radius * 2);
}

function createD3Bubbles(svg) {
 
    // after you’ve set width, height, initStrength, dragSimStrength
const centerX = width  / 2;
const centerY = (height - height*0.4) / 2;
  // Patterns for image fill
  svg.append("defs")
    .selectAll("pattern")
    .data(projects)
    .enter()
    .append("pattern")
    .attr("id", d => `imgpat-${d.title.replace(/\s/g, "")}`)
    .attr("patternUnits", "objectBoundingBox")
    .attr("width", 1)
    .attr("height", 1)
    .append("image")
    .attr("xlink:href", d => d.image)
    .attr("preserveAspectRatio", "xMidYMid slice")
    .attr("width", d => getProjectBubbleRadius(d) * 2)
    .attr("height", d => getProjectBubbleRadius(d) * 2)
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
  nodes = projects.map((d, i) => ({
    ...d,
    r: getProjectBubbleRadius(d),
    x: Math.random() * (width - getProjectBubbleRadius(d) * 2) + getProjectBubbleRadius(d),
    y: Math.random() * (height - getProjectBubbleRadius(d) * 2) + getProjectBubbleRadius(d)
  }));

const forceX = d3.forceX(centerX)
  .strength(d => isOutX(d) ? 0 : initStrength);

const forceY = d3.forceY(centerY)
  .strength(d => isOutX(d) ? dragSimStrength * 4 : initStrength);
 const simulation = d3.forceSimulation(nodes)
  .force("collide", d3.forceCollide().radius(d => d.r + textRadius - 3))
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
    .attr("class", "bubble")
    .style("cursor", "pointer");
  clearBubbleGestures = attachBubbleGestures(node, {
    d3,
    simulation,
    restartSimulation: () => runSimulationBurst(3000, 0.8, simulation),
    activate: datum => { window.location.href = datum.link; },
  });

  // Draw the bubbles
  node.each(function(d) {
    const group = d3.select(this);
    appendMathBubbleShape(group, d.r, d.innerShape)
    .attr("class", `bubble-shape bubble-shape--${d.innerShape}`)
    .attr("fill", `url(#imgpat-${d.title.replace(/\s/g, "")})`)
    .attr("stroke", "var(--bubble-stroke)")
    .attr("stroke-width", "4px")
    .style("filter", "drop-shadow(0 2px 5px var(--bubble-glow))");
    appendMathBubbleShape(group, d.r - 5, d.innerShape)
    .attr("fill", "none")
    .attr("stroke", "var(--bubble-highlight)")
    .attr("stroke-width", "3px")
    .style("filter", "drop-shadow(0 2px 5px var(--bubble-glow-soft))");

    if (d.outerShape === "circle") {
      const radius = d.r + 12;
      const arcId = `bubbleArc-${d.title.replace(/\s/g, "")}`;
      svg.select("defs").append("path")
        .attr("id", arcId)
        .attr("d", describeArc(0, 0, radius, 90, 270));
      group.append("circle")
        .attr("class", "bubble-title-strip bubble-title-strip--circle")
        .attr("r", radius)
        .attr("fill", "none")
        .attr("stroke", "var(--bubble-highlight)")
        .attr("stroke-opacity", 0.25)
        .attr("stroke-width", textRadius)
        .style("filter", "drop-shadow(1 2px 6px var(--bubble-glow-soft))");
      group.append("text").attr("dy", 6)
        .append("textPath")
        .attr("href", `#${arcId}`)
        .attr("startOffset", "50%")
        .style("text-anchor", "middle")
        .style("font-size", "1.0rem")
        .style("fill", "var(--bubble-text)")
        .style("user-select", "none")
        .text(d.title);
    }
  });

  node.filter(d => d.outerShape !== "circle").append("text")
    .attr("y", d => d.r + textRadius * 0.6)
    .style("user-select", "none")          // standard
    .style("-webkit-user-select", "none")  // Safari
    .style("-moz-user-select", "none")     // Firefox
    .style("-ms-user-select", "none")      // IE10+
    .style("text-anchor", "middle")
    .style("font-size", "1.0rem")
    .style("fill", "var(--bubble-text)")
    .style("font-family", "inherit")
    .text(d => d.title);
    function ticked() {
  node.attr("transform", d => {
    
    // clamp inside
    d.x = Math.max(d.r+textRadius-10, Math.min(width  - d.r-textRadius+10, d.x));
    d.y = Math.max(d.r+textRadius-10, Math.min(height - d.r-textRadius+10, d.y));
    return `translate(${d.x},${d.y})`;
  });
}
    



// a little helper to know when a node is off-screen (horizontally)
function isOutX(d) {
  return d.x < d.r || d.x > width - d.r;
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
// Shared with Apps; add/remove apps in MathVisuals/projects.json.
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
  import("../helper/galleryRegistry.js").then(({ loadGalleryProjects }) => loadGalleryProjects("math")),
  import("../helper/galleryGestures.js"),
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
