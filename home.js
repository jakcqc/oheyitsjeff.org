let width;
let height;
let bubbleRadius = 60;
let textRadius = 28;
let svg;
let initStrength = 0.02;
let dragSimStrength = 0.09;
let needsSingleBubbleMode = false;
const MOBILE_BREAKPOINT_PX = 600;
const MOBILE_MODE_STORAGE_KEY = "home.mobileMode"; // "bubbles" | "cards"
const THEME_STORAGE_KEY = "home.theme"; // "light" | "dark"

function getMobileModePref() {
  const raw = localStorage.getItem(MOBILE_MODE_STORAGE_KEY);
  return raw === "bubbles" || raw === "cards" ? raw : null;
}

function setMobileModePref(mode) {
  localStorage.setItem(MOBILE_MODE_STORAGE_KEY, mode);
}
function getThemePref() {
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === "light" || raw === "dark") return raw;
  const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return systemDark ? "dark" : "light";
}

function setThemePref(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", normalized);
  const btn = document.getElementById("themeToggle");
  if (btn) {
    const isDark = normalized === "dark";
    btn.setAttribute("aria-pressed", isDark ? "true" : "false");
    btn.textContent = isDark ? "light" : "dark";
    btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  }
}

function isMobileLayout() {
  return Math.round(window.innerWidth) < MOBILE_BREAKPOINT_PX;
}

function getEffectiveMode() {
  if (!isMobileLayout()) return "bubbles";
  return getMobileModePref() === "bubbles" ? "bubbles" : "cards";
}

function updateMobileToggleUi() {
  const btn = document.getElementById("mobileModeToggle");
  if (!btn) return;

  const isMobile = isMobileLayout();
  btn.style.display = isMobile ? "inline-flex" : "none";

  const mode = getEffectiveMode();
  const isBubbles = mode === "bubbles";
  btn.setAttribute("aria-pressed", isBubbles ? "true" : "false");
  btn.textContent = isBubbles ? "cards" : "bubbles";
  btn.setAttribute("aria-label", isBubbles ? "Switch to cards view" : "Switch to bubbles view");
}

function clearHome() {
  const backgroundDiv = document.getElementById("background");
  if (backgroundDiv) backgroundDiv.innerHTML = "";
  d3.select("#d3-container").selectAll("*").remove();
}

function renderHome() {
  clearHome();
  updateMobileToggleUi();

  const mode = getEffectiveMode();
  const isMobile = isMobileLayout();

  width = Math.round(window.innerWidth);
  bubbleRadius = Math.min(width * 0.15, 50);


  if (mode === "cards") {
    const backgroundDiv = document.getElementById("background");
    projects.forEach(project => {
      const projectHTML = `
          <div class="outter">
              <div class="apps">
                  <div class="card-header">${project.title}</div>
                  <div class="card-content" onclick="goTo('${project.link}')">
                      <img class="thumb" src="${project.image}" alt="${project.title}">
                  </div>
                  <div class="overlay">
                      <div class="styleInfo"><span class="tab1"></span>${project.description}</div>
                  </div>
              </div>
          </div>
      `;
      backgroundDiv.innerHTML += projectHTML;
    });
    return;
  }

  // Bubbles mode:
  // On small screens we may not have enough vertical room for all bubbles to settle without being clipped.
  // Estimate a minimum required height based on a loose packing grid.
  const baseHeight = Math.round(window.innerHeight - 68);
  const bubbleDiameter = (bubbleRadius * 2) + (textRadius * 2) + 16; // include label ring + padding
  const cols = Math.max(1, Math.floor((width - 16) / bubbleDiameter));
  const rows = Math.ceil(projects.length / cols);
  const minBubbleAreaHeight = Math.ceil(rows * bubbleDiameter);
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
function createD3Bubbles(svg) {
 
    // after you’ve set width, height, initStrength, dragSimStrength
const centerX = width  / 2;
const centerY = (height - height*0.2) / 2;
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
    .attr("width", bubbleRadius * 2)
    .attr("height", bubbleRadius * 2)
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
    r: bubbleRadius,
    x: Math.random() * (width - bubbleRadius * 2) + bubbleRadius,
    y: Math.random() * (height - bubbleRadius * 2) + bubbleRadius
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
// now add drag behavior to your bubbles:
const dragBehavior = d3.drag()
.on("start", (event, d) => {
  // if the simulation is “sleeping,” wake it up
  // if (!event.active) simulation.alphaTarget(0.3).restart();
  // fix the node’s position to the pointer
  d.fx = d.x;

  d.fy = d.y;
  
  runSimulationBurst(3000, 0.8,simulation);
  

})
.on("drag", (event, d) => {
  // move the fixed position with the pointer
  d.fx = event.x;
  d.fy = event.y;
})
.on("end", (event, d) => {
  // release the node so simulation can re-position it
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
});
  // Create g for each node
   node = svg.selectAll("g.bubble")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "bubble")
    .style("cursor", "pointer")
    .call(dragBehavior);

  // Draw the bubbles
  node.append("circle")
    .attr("r", d => d.r)
    .attr("fill", d => `url(#imgpat-${d.title.replace(/\s/g, "")})`)
    .attr("stroke", "var(--bubble-stroke)")
    .attr("stroke-width", "4px")
    .style("filter", "drop-shadow(0 2px 16px var(--bubble-glow))");
  node.append("circle")
    .attr("r", d => d.r - 5)
    .attr("fill", "none")
    .attr("stroke", "var(--bubble-highlight)")
    .attr("stroke-width", "3px")
    .style("filter", "drop-shadow(0 4px 22px var(--bubble-glow-soft))");

    node.each(function(d, i) {
      const g = d3.select(this);
    
      // Create a unique path for each bubble
      const arcId = `bubbleArc-${i}`;
      const r = d.r + 12; // arc radius, slightly larger than bubble for outside
    
      // Add path for text arc in defs
      svg.append("defs")
        .append("path")
        .attr("id", arcId)
        .attr("d", describeArc(0, 0, r, 90, 270)); // semi-circle on top
   

      // Draw white strip for the arc
      g.append("path")
        .attr("d", describeArc(0, 0, r, -90, 270))
        .attr("fill", "none")
        .attr("stroke", "var(--bubble-highlight)")
        .attr("stroke-opacity", 0.45)  // also make it a bit translucent
        .attr("stroke-width", textRadius) // thickness of the white strip
        .style("filter", "drop-shadow(1 2px 6px var(--bubble-glow-soft))"); // optional shadow
    
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
  

  // On click, go to the link
  node.on("click", function(event, d) {
    window.location.href = d.link;
  });
  
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
const projects = shuffle([
  {
    title: "Mondrian Abstraction 3D",
    image: "assets/Images/monder3D.jpg",
    description: "Ever wonder what A Mondrian Composition would like look like in 3D?",
    link: "/MondrianAbstractionV2/Viewer3D/"
  },
  {
    title: "Particle_Explorer",
    image: "assets/Images/stars.jpg",
    description: "Watch Life emerge or fade using particle interactions.",
    link: "/ParticleExplorer/"
  },
  {
    title: "InnerLight",
    image: "assets/Images/idleGame.png",
    description: "Small shape-based visualizations that use color changes and spatial differences. Have fun...",
    link: "/InnerLight/"
  },
  {
    title: "Mondrian Abstraction",
    image: "assets/Images/monder.jpg",
    description: "A fun take on the popular Mondrian Compositions, a play on light and overlaps.",
    link: "/MondrianAbstraction/"
  },
  {
    title: "Energy_Explorer",
    image: "assets/Images/eng.jpg",
    description: "Voxel space energy representations, with continuous particles under the hood.",
    link: "/EnergyExplorer/"
  },
  //  {
  //   title: "GeoSpace",
  //   image: "assets/Images/geoLife.jpg",
  //   description: "A fully randomized partical sim with various indepedent particle groups...",
  //   link: "/GeoSpace/"
  // },
  {
    title: "GameOfLife??",
    image: "assets/Images/gameOfLife0.webp",
    description: "The game of life is a cellular automata simulation. Different dense neighbourhood functions are used in this case.",
    link: "/GameOfLife_aug/"
  },
  {
    title: "Interference",
    image: "assets/Images/bacteria.png",
    description: "A mess of interference circles that have bacteria like movement",
    link: "/BacteriaVisualizer/"
  },
  {
    title: "Math Visuals",
    image: "/assets/Images/marble.png",
    description: "A dedicated gallery of the new math visualization set.",
    link: "/MathVisuals/"
  },
  // {
  //   title: "LSystem_Garden",
  //   image: "assets/Images/stars.jpg",
  //   description: "Grow recursive plant grammars and tweak every branch with live SVG controls.",
  //   link: "/LSystemGarden/"
  // },
  // {
  //   title: "SVG_Wall",
  //   image: "assets/Images/InnerLight.png",
  //   description: "A live gallery that streams every SVG from the CDN art vault.",
  //   link: "/SvgGallery/"
  // },
  // {
  //   title: "SVG_Playground",
  //   image: "assets/Images/stars.jpg",
  //   description: "Drag, duplicate, and style SVG shapes with tiling and kaleidoscope modes.",
  //   link: "/SvgPlayground/"
  // },
  // {
  //   title: "Equation_Visualizer",
  //   image: "assets/Images/eng.jpg",
  //   description: "Starter SVG grid for building equation-driven visuals + neighborhood transforms.",
  //   link: "/EquationVisualizer/"
  // }

]);
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
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || getThemePref();
      const next = current === "dark" ? "light" : "dark";
      setThemePref(next);
      applyTheme(next);
    });
  }

  applyTheme(getThemePref());

  const btn = document.getElementById("mobileModeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const cur = getEffectiveMode();
      const next = cur === "bubbles" ? "cards" : "bubbles";
      setMobileModePref(next);
      renderHome();
    });
  }

  renderHome();
}

// Paint with the saved theme before heavy assets finish loading.
applyTheme(getThemePref());

// wait for EVERYTHING that causes reflow
Promise.all([
  new Promise(r => window.addEventListener("load", r)),
  document.fonts.ready
]).then(() => {
  
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
});
