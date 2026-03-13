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
  node.append("rect")
    .attr("x", d => -d.r)
    .attr("y", d => -d.r)
    .attr("width", d => d.r * 2)
    .attr("height", d => d.r * 2)
    .attr("fill", d => `url(#imgpat-${d.title.replace(/\s/g, "")})`)
    .attr("stroke", "var(--bubble-stroke)")
    .attr("stroke-width", "4px")
    .style("filter", "drop-shadow(0 2px 5px var(--bubble-glow))");
  node.append("rect")
    .attr("x", d => -d.r + 5)
    .attr("y", d => -d.r + 5)
    .attr("width", d => d.r * 2 - 10)
    .attr("height", d => d.r * 2 - 10)
    .attr("fill", "none")
    .attr("stroke", "var(--bubble-highlight)")
    .attr("stroke-width", "3px")
    .style("filter", "drop-shadow(0 2px 5px var(--bubble-glow-soft))");

  node.append("text")
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
    title: "Lissajous Figures",
    image: "/MathVisuals/assets/math8.png",
    description: "Parametric sine curves that weave into looping flower-like forms.",
    link: "/LissajousFigures/"
  },
  {
    title: "Fractal Polyhedra",
    image: "/MathVisuals/assets/math4.png",
    description: "Recursive polyhedral forms with crystalline self-similarity.",
    link: "/FractalPolyhedra/"
  },
  {
    title: "SURFER Gallery",
    image: "/MathVisuals/assets/math2.png",
    description: "Implicit algebraic surfaces rendered as sculptural contours.",
    link: "/SurferGalleryBiancaViolet/"
  },
  {
    title: "Boys Surface Model",
    image: "/MathVisuals/assets/math9.png",
    description: "Twisted ribbon immersions inspired by the projective plane.",
    link: "/BoysSurfaceModel/"
  },
  {
    title: "Quasicrystalline Wickerwork",
    image: "/MathVisuals/assets/math.png",
    description: "Aperiodic lattices woven into star-like radial patterns.",
    link: "/QuasicrystallineWickerwork/"
  },
  {
    title: "Lorenz Attractor",
    image: "/MathVisuals/assets/math3.png",
    description: "Chaotic butterfly trajectories drawn as glowing streams.",
    link: "/LorenzAttractor/"
  },
  {
    title: "Herwig Hauser Classic",
    image: "/MathVisuals/assets/math7.png",
    description: "Classic algebraic surfaces with cusps, folds, and smooth manifolds.",
    link: "/HerwigHauserClassicCollection/"
  },
  {
    title: "Oliver Labs Collection",
    image: "/MathVisuals/assets/math6.png",
    description: "Algorithmic structures shaped by procedural flow fields.",
    link: "/OliverLabsCollection/"
  },
  {
    title: "P.S.G.H Collection",
    image: "/MathVisuals/assets/math5.png",
    description: "Mesh curvature studies with smooth geometric transitions.",
    link: "/PinkallSchmittGunnHoffmannCollection/"
  },
  // {
  //   title: "Islamic Repeating Art",
  //   image: "/MathVisuals/assets/math.png",
  //   description: "Ten-fold tessellations blending pentagrams and hexagon motifs.",
  //   link: "/IslamicRepeatingArt/"
  // },
  {
    title: "Marbled Patterns",
    image: "/assets/Images/marble.png",
    description: "Swirled marbling with ribbon-like ink veins.",
    link: "/MarbledPatterns/"
  },
  {
    title: "Domain Coloring",
    image: "/assets/Images/coloring.png",
    description: "Domain coloring for popular complex functions with adjustable color guides.",
    link: "/DomainColoring/"
  },
  {
    title: "Voronoi Point Ani",
    image: "/assets/Images/voro.png",
    description: "Voronoi diagrams that move and grow; fractal-like patterns emerge.",
    link: "/Voronoi/"
  },
  {
    title: "Kakeya!!",
    image: "/assets/Images/kakaya.png",
    description: "The collatz conjecture about sequences leverages Kakaya sets, which are sets made from line segments!",
    link: "/kakeya/"
  },
  {
    title: "Discrete Fractals",
    image: "/assets/Images/InnerLight.png",
    description: "Discrete fractals like Mandelbrot, Julia, and Multibrot with shape/convergence controls.",
    link: "/Generic/"
  }
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
