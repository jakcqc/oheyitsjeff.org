/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

export function createInnerLight({ mountEl, onResize }, state) {
  const AppState = {
    width: 1,
    height: 1,
    get shouldMoveShapes() { return state.motionEnabled; },
  };
  const svg = d3.select(mountEl).append("svg")
    .attr("xmlns", "http://www.w3.org/2000/svg")
    .attr("role", "img")
    .attr("aria-label", "Interactive Inner Light drawing");
  // The shared transform runtime keeps this group as its live source.
  const source = svg.append("g");
  const waves = new Map();
  const signatures = new Map();
  const interactiveShapes = new Map();
  const shapeAnimations = new Map();
  let nextShapeId = 0;
  const startupTimers = new Set();
  let destroyed = false;
  let wasMoving = state.motionEnabled;
  let previousPointer = null;

  function originalShape(element) {
    const shape = element.closest?.("[data-innerlight-shape]");
    if (!shape || !svg.node().contains(shape)) return null;
    return interactiveShapes.get(shape.getAttribute("data-innerlight-shape"));
  }

  function paintPointer(event) {
    if (!state.motionEnabled) {
      previousPointer = null;
      return;
    }
    const targets = new Set();
    const directTarget = originalShape(event.target);
    if (directTarget) targets.add(directTarget);
    const current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    const hitStack = (x, y) => {
      const elements = mountEl.ownerDocument.elementsFromPoint(x, y);
      // Captured drags may pass over Info or outside the drawing.
      if (!elements.length || !svg.node().contains(elements[0])) return false;
      for (const element of elements) {
        const original = originalShape(element);
        if (original) targets.add(original);
      }
      return true;
    };

    if (hitStack(current.x, current.y)) {
      // Subpixel samples also reach thin outlines in scaled transform copies.
      if (previousPointer?.id === current.id) {
        const dx = current.x - previousPointer.x;
        const dy = current.y - previousPointer.y;
        const steps = Math.min(4096, Math.ceil(Math.hypot(dx, dy) / 0.5));
        for (let step = 1; step < steps; step++) {
          hitStack(previousPointer.x + dx * step / steps, previousPointer.y + dy * step / steps);
        }
      }
      previousPointer = current;
    } else {
      previousPointer = null;
    }

    // Collect the full path before forwarding more animations that raise shapes.
    // Transform copies also need forwarding: their nodes have no D3 listeners.
    for (const original of targets) {
      if (!original.isConnected) continue;
      if (event.type === "pointermove" && original === event.target) continue;
      original.dispatchEvent(new PointerEvent("pointermove", { pointerType: event.pointerType }));
    }
  }

  svg.on("pointerdown.innerLight", (event) => {
    if (event.button !== 0) return;
    previousPointer = null;
    // Capture on the SVG so touch and pen can leave the first shape touched.
    try { svg.node().setPointerCapture(event.pointerId); } catch { /* Synthetic events have no active pointer. */ }
    paintPointer(event);
  }).on("pointermove.innerLight", paintPointer)
    .on("pointerup.innerLight pointercancel.innerLight lostpointercapture.innerLight", (event) => {
      previousPointer = null;
      if (svg.node().hasPointerCapture(event.pointerId)) svg.node().releasePointerCapture(event.pointerId);
    })
    .on("pointerleave.innerLight", () => { previousPointer = null; });

  const ShapeDefaults = {
    square: {
        count: 50,
        baseStrokeWidth: "0.5vh",
        hoverStrokeWidth: "3vh",
        fillOpacity: 0.2,
        className: "square",
        initialPointsPercent: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        initialTotalPercentChange: 20,
        squareScale:1,
        hueIncrement: 2.0,
    },
    circle: {
        // Adjust count based on screen size, ensuring a minimum
        count: () => Math.min(85,Math.max(100, Math.floor(Math.min(AppState.width, AppState.height) / (2 * 5 * Math.max(0.5, AppState.height / 1000) )) -2)),
        baseStrokeWidth: "2px",
        hoverStrokeWidths: ["10px", "15px"],
        fillOpacity: 0.45,
        className: "circle",
        initialRadius: 10,
        radiusIncrement: 5,
        hueIncrement: 2.0,
        centerX: () => AppState.width / 2,
        centerY: () => AppState.height / 2,
    },
    rect: {
        count: () => Math.min(80,Math.max(70, Math.floor(Math.min(AppState.width, AppState.height) / (2 * 30 * Math.max(0.5, AppState.height / 1000))) -2)),
        baseStrokeWidth: "0.6vh",
        hoverStrokeWidth1: "2vh", // Used in common handler's hoverStrokeWidths
        fillOpacity: 0.45,
        className: "rect",
        initialSize: 10,
        sizeIncrement: 30,
        hueIncrement: 1.8,
        centerX: () => AppState.width / 2,
        centerY: () => AppState.height / 2,
    },
    prism: {
        zGridUnit: 40,
        count: function() {
            const x_cells = Math.floor(AppState.width / this.zGridUnit);
            const y_cells = Math.floor(AppState.height / this.zGridUnit);
            return Math.max(15, x_cells * y_cells); // Ensure some are drawn, even on small screens
        },
        baseStrokeWidth: "0.3vh",
        hoverStrokeWidths: ["5px", "4px", "1px"],
        fillOpacity: 0.7,
        strokeColor: 'white',
        initialStrokeColor:"goldenrod",
        incrementFill:[true,0.3,0.5],
        className: "prism",
        initialRadius: 10, // Initial radius for the sequence of circles
        radiusIncrementPerGroup: 25, // How much radius increases periodically
        hueIncrement: 2.0,
        minRadius:5,
        transitionDuration: 250
    },
    user: { // Default config for user-defined shapes
        shapeType: 'circle',
        numElements: 50,
        numSides: 6, // For polygon
        radius: 50, // Initial radius/size
        strokeWidth: '2px',
        strokeColor: 'white',
        fillColor: 'none',
        fillOpacity: 1,
        className: 'user',
        incrementSize: 10, // How much size changes per element
        xDivisions: 10, // For rect grid layout
        yDivisions: 10, // For rect grid layout
        dynamicSize: 10, // For rect variance in grid AND hover stroke width for user shapes
        hueIncrement: 10, // Hue step per element for distinct hover colors in user shapes
    }
  };


  function distance(x1, y1, x2, y2) {
      return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  }

  // Test if a new circle overlaps any existing
  function isOverlapping(circles, x, y, r, padding = 0) {
      return circles.some(c =>
          distance(x, y, c.x, c.y) < (r + c.r + padding)
      );
  }

  function packCircles(config, svg, AppState) {
      const numCircles = typeof config.count === 'function' ? config.count() : config.count;
      const centerX = AppState.width / 2;
      const centerY = AppState.height / 2;
      const minRadius = config.minRadius || 15;
      const maxRadius = config.maxRadius || 60;
      const circles = [];

      // 1. Start from the center
      let r = Math.random() * (maxRadius - minRadius) + minRadius;
      circles.push({ x: centerX, y: centerY, r });

      // 2. Place bubbles tangent to previous ones
      for (let i = 1; i < numCircles; i++) {
          let found = false, tries = 0;
          while (!found && tries < 1200) {
              tries++;
              // Randomly pick a parent bubble to attach to
              const parent = circles[Math.floor(Math.random() * circles.length)];
              const angle = Math.random() * 2 * Math.PI;
              const newR = Math.random() * (maxRadius - minRadius) + minRadius;
              // Compute new circle tangent to parent
              const x = parent.x + (parent.r + newR + 1) * Math.cos(angle);
              const y = parent.y + (parent.r + newR + 1) * Math.sin(angle);

              // Check for screen bounds
              if (
                  x - newR < 0 || x + newR > AppState.width ||
                  y - newR < 0 || y + newR > AppState.height
              ) continue;

              // Overlap check
              if (!isOverlapping(circles, x, y, newR, 1)) {
                  circles.push({ x, y, r: newR });
                  found = true;
              }
          }
          // Optionally break if we can't place more
          if (!found) break;
      }

      // 3. Fill remaining spaces (bubble maximization)
      let attempts = 0;
      while (circles.length < numCircles && attempts < 4000) {
          attempts++;
          // Random point in bounds
          const x = Math.random() * AppState.width;
          const y = Math.random() * AppState.height;

          // Find maximum possible radius at this point without overlapping
          let maxR = maxRadius;
          for (const c of circles) {
              const d = distance(x, y, c.x, c.y) - c.r - 1;
              if (d < maxR) maxR = d;
          }
          // Also respect screen edge
          maxR = Math.min(
              maxR,
              x, AppState.width - x,
              y, AppState.height - y
          );
          if (maxR >= minRadius && !isOverlapping(circles, x, y, maxR, 1)) {
              circles.push({ x, y, r: maxR });
          }
      }

      return circles;
  }

  // III. Shape Drawing Engine
  const ShapeDrawer = {
    _hueState: { globalHue: 0 }, // Internal state for hue cycling for standard shapes

    /**
     * Generic mouseover handler for shapes.
     * @param {Event} event - The D3 event object.
     * @param {*} d - The datum associated with the element.
     * @param {object} handlerConfig - Configuration for hover effects.
     *   - baseStrokeWidth, initialStrokeColor, hoverStrokeWidths (array), hoverStrokeColors (array, optional)
     *   - fillOpacity, hueIncrement (for global hue) or elementHue (for specific hue)
     *   - finalStrokeColor, transitionDuration
     */
    commonMouseoverHandler: function(event, d, handlerConfig) {
      if (!AppState.shouldMoveShapes) return;
      // Skip if already animating
      if (this.dataset.animating === "true") return;
      if(!this.parentNode) return;
      this.dataset.animating = "true";

      this.parentNode.appendChild(this);
      const element = d3.select(this);
      // element.raise(); // Bring to front if desired

      let defaults = {
          baseStrokeWidth: '1px',
          initialStrokeColor: 'white',
          hoverStrokeWidths: ['3px'],
          hoverStrokeColors: [],
          fillOpacity: 0.2,
          hueIncrement: 2.0,
          elementHue: undefined,
          incrementFill:[false,0.5,0.7],
          // finalStrokeColor is no longer used since we won't revert
          transitionDuration: 300
      };
      let config = { ...defaults, ...handlerConfig };


      let currentHueForShape = ShapeDrawer._hueState.globalHue;
      if (typeof config.elementHue !== 'undefined') {
          currentHueForShape = config.elementHue;
      } else if (typeof config.hueIncrement === 'number') {
          ShapeDrawer._hueState.globalHue = (ShapeDrawer._hueState.globalHue + config.hueIncrement) % 360;
          currentHueForShape = ShapeDrawer._hueState.globalHue;
      }
      const cycledHueColor = d3.hsl(currentHueForShape, config.incrementFill[1], config.incrementFill[2]).toString();

      element.style("stroke", config.initialStrokeColor)
             .style("stroke-width", config.baseStrokeWidth)
             .style("fill-opacity", config.fillOpacity);

      animateShape(this, config, cycledHueColor);

      // Removed the final revert to original color so the last hover state remains
  }
  ,

    createSquare: (svg, config) => {
        const z = 50, x_factor = AppState.width / z, y_factor = AppState.height / z;

        function getSquarePercentCoord(pointsArray, idx) {
          const effectiveTotalPercentChange = config.initialTotalPercentChange * idx * (config.squareScale);

            let newStringTemp = "";
            let currentSign = [1, 0];
            const tempPoints = [...pointsArray];
            for (let count8 = 0; count8 < 9; count8 += 2) {
                if (count8 === 0) { currentSign = [1, 0]; }
                else if (count8 === 2) { currentSign = [0, 1]; }
                else if (count8 === 4) { currentSign = [-1, 0]; }
                else if (count8 === 6) { currentSign = [0, -1]; }
                else if (count8 === 8) { currentSign = [1, 0]; }

                let pX = (tempPoints[count8] * x_factor * z) - (currentSign[0] * effectiveTotalPercentChange);
                let pY = (tempPoints[count8 + 1] * y_factor * z) - (currentSign[1] * effectiveTotalPercentChange);
                newStringTemp += `${pX},${pY}${count8 !== 8 ? "," : ""}`;
            }
            return newStringTemp;
        }

        svg.selectAll(`.${config.className}`)
            .data(d3.range(config.count))
            .enter().append("polyline")
            .attr("class", config.className)
            .style("stroke", "white")
            .style("stroke-width", config.baseStrokeWidth)
            .attr("points", (d,i) => getSquarePercentCoord(config.initialPointsPercent,i))
            .attr("fill", "none")
            .attr("stroke-linecap", "square")
            .on("pointermove", function(event, d) {
                 ShapeDrawer.commonMouseoverHandler.call(this, event, d, {
                    baseStrokeWidth: config.baseStrokeWidth,
                    initialStrokeColor: "white",
                    hoverStrokeWidths: [config.hoverStrokeWidth],
                    fillOpacity: config.fillOpacity,
                    hueIncrement: config.hueIncrement,
                    finalStrokeColor: "white"
                });
            });
    },

    createCircle: (svg, config) => {
        const centerXVal = typeof config.centerX === 'function' ? config.centerX() : config.centerX;
        const centerYVal = typeof config.centerY === 'function' ? config.centerY() : config.centerY;
        const countVal = typeof config.count === 'function' ? config.count() : config.count;

        svg.selectAll(`.${config.className}`)
            .data(d3.range(countVal))
            .enter().append("circle")
            .attr("class", config.className)
            .attr("cx", centerXVal)
            .attr("cy", centerYVal)
            .attr("r", (d, i) => config.initialRadius + (i * config.radiusIncrement))
            .attr("fill", "none")
            .attr("stroke", "white")
            .style("stroke-width", config.baseStrokeWidth)
            .on("pointermove", function(event, d) {
                ShapeDrawer.commonMouseoverHandler.call(this, event, d, {
                    baseStrokeWidth: config.baseStrokeWidth,
                    initialStrokeColor: "white",
                    hoverStrokeWidths: config.hoverStrokeWidths, // Should be an array like ["10px", "15px"]
                    fillOpacity: config.fillOpacity,
                    hueIncrement: config.hueIncrement,
                    finalStrokeColor: "white"
                });
            });
    },

    createRect: (svg, config) => {
        const centerXVal = typeof config.centerX === 'function' ? config.centerX() : config.centerX;
        const centerYVal = typeof config.centerY === 'function' ? config.centerY() : config.centerY;
        const countVal = typeof config.count === 'function' ? config.count() : config.count;

        svg.selectAll(`.${config.className}`)
            .data(d3.range(countVal))
            .enter().append("rect")
            .attr("class", config.className)
            .attr("width", (d, i) => config.initialSize + (i * config.sizeIncrement))
            .attr("height", (d, i) => config.initialSize + (i * config.sizeIncrement))
            .attr("x", (d, i) => centerXVal - (config.initialSize + (i * config.sizeIncrement)) / 2)
            .attr("y", (d, i) => centerYVal - (config.initialSize + (i * config.sizeIncrement)) / 2)
            .attr("stroke", "white")
            .attr("stroke-width", config.baseStrokeWidth)
            .attr("fill", "none")
            .on("pointermove", function(event, d) {
                // Rect hover: white -> HUE(2vh) -> BLACK(2vh) -> white(base)
                // Common handler needs hue for the first step, then black for the second.
                // We pre-calculate the hue it *would* use, so we can pass it explicitly.
                const nextHue = (ShapeDrawer._hueState.globalHue + config.hueIncrement) % 360; // Don't advance globalHue yet
                const hueColorForRect = d3.hsl(nextHue, 1, 0.60).toString();

                ShapeDrawer.commonMouseoverHandler.call(this, event, d, {
                    baseStrokeWidth: config.baseStrokeWidth,
                    initialStrokeColor: "white",
                    hoverStrokeWidths: [config.hoverStrokeWidth1, config.hoverStrokeWidth1],
                    hoverStrokeColors: [hueColorForRect, "black"], // Step 1 HUE, Step 2 BLACK
                    fillOpacity: config.fillOpacity,
                    hueIncrement: config.hueIncrement, // Now common handler will advance globalHue
                    finalStrokeColor: "white",
                    transitionDuration: 500 // Give a bit more time for multi-phase hover
                });
            });
    },

    createPrism: (svg, config) => {
        const circles = packCircles(config, svg, AppState);

          svg.selectAll(`.${config.className}`).remove();

          svg.selectAll(`.${config.className}`)
              .data(circles)
              .enter().append("circle")
              .attr("class", config.className)
              .attr("cx", d => d.x)
              .attr("cy", d => d.y)
              .attr("r", d => d.r)
              .attr("fill", "none")
              .attr("stroke", config.strokeColor)
              .attr("stroke-width", config.baseStrokeWidth)
              .on("pointermove", function(event, d) {
                  ShapeDrawer.commonMouseoverHandler.call(this, event, d, config);
              });
    },

    createCustomShape: (svg, userConfig) => {
        // Merge provided userConfig with defaults for user shapes
        const mergedConfig = { ...ShapeDefaults.user, ...userConfig };
        const {
            shapeType, numElements, numSides, radius, strokeWidth, strokeColor, fillColor,
            fillOpacity, className, incrementSize, xDivisions, yDivisions,
            dynamicSize, // Used for rect size variation and hover stroke width
            centerX: cfgCenterX, centerY: cfgCenterY, hueIncrement // hueIncrement for per-element hue calculation
        } = mergedConfig;

        const centerXVal = cfgCenterX || AppState.width / 2;
        const centerYVal = cfgCenterY || AppState.height / 2;

        // Use a key function for object constancy if numElements changes
        let elementData = svg.selectAll(`.${className}`).data(d3.range(numElements), (d_item, i) => i);
        elementData.exit().remove(); // Remove old elements

        let newElementsEnter;
        if (shapeType === 'rect') newElementsEnter = elementData.enter().append('rect');
        else if (shapeType === 'circle') newElementsEnter = elementData.enter().append('circle');
        else if (shapeType === 'polygon') newElementsEnter = elementData.enter().append('polygon');
        else { console.error("Unknown custom shape type:", shapeType); return; }

        const mergedElements = newElementsEnter.merge(elementData) // Apply attributes to new and updating elements
            .attr('class', className)
            .attr('stroke', strokeColor)
            .attr('stroke-width', strokeWidth)
            .attr('fill', fillColor)
            .style('fill-opacity', fillOpacity)
            .on("pointermove", function(event, d_index) { // d_index is the datum (0 to numElements-1)
                // For user shapes, each element gets its own hue based on its index
                const elementSpecificHue = (d_index * hueIncrement) % 360;
                ShapeDrawer.commonMouseoverHandler.call(this, event, d_index, {
                    baseStrokeWidth: strokeWidth,
                    initialStrokeColor: strokeColor,
                    hoverStrokeWidths: [`${dynamicSize}px`], // Use dynamicSize for hover stroke width
                    fillOpacity: fillOpacity,
                    elementHue: elementSpecificHue, // Pass the calculated hue for this specific element
                    hueIncrement: null, // Prevent commonMouseoverHandler from advancing global hue state
                    finalStrokeColor: strokeColor,
                });
            });

        if (shapeType === 'circle') {
            // Example: Draw circles from smallest (radius) to largest
            mergedElements.attr('cx', centerXVal)
                         .attr('cy', centerYVal)
                         .attr('r', (d, i) => radius + i * incrementSize);
        } else if (shapeType === 'rect') {
            // Grid of rectangles, potentially varying in size
            const widthUnit = AppState.width / xDivisions;
            const heightUnit = AppState.height / yDivisions;
            mergedElements
                .attr('width', (d, i) => Math.max(1, widthUnit - i * (dynamicSize / numElements) )) // Example: make rects smaller with higher index 'i'
                .attr('height', (d, i) => Math.max(1, heightUnit - i * (dynamicSize / numElements) ))
                .attr('x', (d, i) => {
                    const currentWidth = Math.max(1, widthUnit - i * (dynamicSize / numElements));
                    return (i % xDivisions) * widthUnit + (widthUnit - currentWidth) / 2; // Center in cell
                })
                .attr('y', (d, i) => {
                    const currentHeight = Math.max(1, heightUnit - i * (dynamicSize / numElements));
                    return Math.floor(i / xDivisions) * heightUnit + (heightUnit - currentHeight) / 2; // Center in cell
                });
        } else if (shapeType === 'polygon') {
            mergedElements.attr('points', (d, i) =>
                ShapeDrawer._getPolygonPoints(numSides, radius + i * incrementSize, centerXVal, centerYVal)
            );
        }
    },

    _getPolygonPoints: (sides, polyRadius, centerX, centerY) => {
        const angleStep = 2 * Math.PI / sides;
        // Offset angle to make polygons (e.g., hexagons) have a flat top or point upwards as preferred
        const angleOffset = (sides % 2 === 0) ? Math.PI / sides : -Math.PI / 2; // Example: flat top for even, point up for odd
        return Array.from({ length: sides }, (_, i) => {
            const x = centerX + polyRadius * Math.cos(i * angleStep + angleOffset);
            const y = centerY + polyRadius * Math.sin(i * angleStep + angleOffset);
            return `${x.toFixed(3)},${y.toFixed(3)}`; // Fixed precision for cleaner SVG points
        }).join(' ');
    }
  };



  function customConfig() {
    const input = state.custom || {};
    const number = (key, fallback, min, max, integer = false) => {
      const parsed = input[key] === "" ? NaN : Number(input[key]);
      const upper = state.overrideMinMax !== false && key !== "fillOpacity" ? Infinity : max;
      const value = Number.isFinite(parsed) ? Math.max(min, Math.min(upper, parsed)) : fallback;
      return integer ? Math.round(value) : value;
    };
    const color = (value, fallback) => value === "none" || CSS.supports("color", String(value)) ? value : fallback;
    return {
      ...ShapeDefaults.user,
      shapeType: ["circle", "rect", "polygon"].includes(input.shapeType) ? input.shapeType : "circle",
      numElements: number("numElements", 50, 1, 500, true),
      numSides: number("numSides", 6, 3, 32, true),
      radius: number("radius", 50, 1, 1000),
      incrementSize: number("incrementSize", 10, 0, 100),
      xDivisions: number("xDivisions", 10, 1, 100, true),
      yDivisions: number("yDivisions", 10, 1, 100, true),
      dynamicSize: number("dynamicSize", 10, 0, 100),
      fillOpacity: number("fillOpacity", 1, 0, 1),
      strokeWidth: CSS.supports("stroke-width", String(input.strokeWidth)) ? input.strokeWidth : "2px",
      strokeColor: color(input.strokeColor, "#ffffff"),
      fillColor: color(input.fillColor, "none"),
      centerX: AppState.width / 2,
      centerY: AppState.height / 2,
    };
  }

  // D3 transitions use wall-clock time, so use an active clock for hover effects.
  // Keeping their progress here allows Space to freeze and resume each stroke.
  function animateShape(node, config, cycledHueColor) {
    const element = d3.select(node);
    let previous = {
      width: element.style("stroke-width"),
      stroke: element.style("stroke"),
      fill: element.attr("fill"),
    };
    const stages = config.hoverStrokeWidths.map((width, index) => {
      const stroke = config.hoverStrokeColors[index] || cycledHueColor;
      const next = { width, stroke, fill: config.incrementFill[0] ? stroke : previous.fill };
      const stage = {
        width: d3.interpolateString(previous.width, next.width),
        stroke: d3.interpolateRgb(previous.stroke, next.stroke),
        fill: config.incrementFill[0] ? d3.interpolateRgb(previous.fill, next.fill) : null,
      };
      previous = next;
      return stage;
    });
    if (!stages.length) {
      node.dataset.animating = "false";
      return;
    }
    const duration = Math.max(1, Number(config.transitionDuration) || 0);
    let activeElapsed = 0;
    let lastElapsed = 0;
    const timer = d3.timer((elapsed) => {
      const delta = elapsed - lastElapsed;
      lastElapsed = elapsed;
      if (!AppState.shouldMoveShapes) return;
      activeElapsed += delta;
      const index = Math.min(stages.length - 1, Math.floor(activeElapsed / duration));
      const progress = d3.easeCubicInOut(Math.min(1, (activeElapsed - index * duration) / duration));
      const stage = stages[index];
      element.style("stroke-width", stage.width(progress)).style("stroke", stage.stroke(progress));
      if (stage.fill) element.attr("fill", stage.fill(progress));
      // Preserve the short hold at the last color before allowing another hit.
      if (activeElapsed >= duration * (stages.length + 1)) {
        timer.stop();
        shapeAnimations.delete(node);
        node.dataset.animating = "false";
      }
    });
    shapeAnimations.set(node, timer);
  }

  function stopWaves() {
    for (const timer of waves.values()) clearInterval(timer);
    waves.clear();
  }

  function interruptShapes(selection = source.selectAll("*")) {
    selection.interrupt().each(function() {
      shapeAnimations.get(this)?.stop();
      shapeAnimations.delete(this);
      delete this.dataset.animating;
    });
  }

  function render() {
    if (destroyed) return;
    const bounds = mountEl.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const resized = width !== AppState.width || height !== AppState.height;
    AppState.width = width;
    AppState.height = height;
    if (resized) {
      svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
    }
    if (wasMoving && !state.motionEnabled) {
      previousPointer = null;
    }
    wasMoving = state.motionEnabled;

    for (const key of ["circle", "square", "rect", "prism", "user"]) {
      const config = key === "user" ? customConfig() : ShapeDefaults[key];
      const signature = state.shapes?.[key] ? JSON.stringify([width, height, config]) : null;
      if (signatures.get(key) === signature) continue;
      previousPointer = null;
      stopWaves();
      const shapes = source.selectAll(`.${config.className}`);
      interruptShapes(shapes);
      shapes.each(function() { interactiveShapes.delete(this.getAttribute("data-innerlight-shape")); });
      shapes.remove();
      signatures.set(key, signature);
      if (!signature) continue;
      const creator = key === "user" ? ShapeDrawer.createCustomShape : ShapeDrawer[`create${key[0].toUpperCase()}${key.slice(1)}`];
      creator(source, config);
      source.selectAll(`.${config.className}`).attr("data-innerlight-shape", function() {
        const id = String(++nextShapeId);
        interactiveShapes.set(id, this);
        return id;
      });
    }
  }

  function animate(direction = "forward", interval = 50) {
    if (destroyed || !state.motionEnabled) return;
    clearInterval(waves.get(direction));
    const groups = ["circle", "square", "rect", "prism", "user"].map((key) => source.selectAll(`.${key}`).nodes());
    const length = Math.max(0, ...groups.map((group) => group.length));
    if (!length) return;
    let step = 0;
    const timer = setInterval(() => {
      if (!state.motionEnabled) return;
      for (const group of groups) {
        const element = group[direction === "reverse" ? group.length - 1 - step : step];
        if (element?.isConnected) element.dispatchEvent(new PointerEvent("pointermove"));
      }
      if (++step >= length) {
        clearInterval(timer);
        waves.delete(direction);
      }
    }, interval);
    waves.set(direction, timer);
  }

  render();
  const observer = new ResizeObserver(() => {
    if (destroyed) return;
    const bounds = mountEl.getBoundingClientRect();
    if (Math.max(1, Math.round(bounds.width)) === AppState.width && Math.max(1, Math.round(bounds.height)) === AppState.height) return;
    // Run shared transforms, effects and flows after resizing the source drawing.
    if (onResize) onResize();
    else render();
  });
  observer.observe(mountEl);
  for (const [direction, delay] of [["forward", 300], ["reverse", 200]]) {
    const timer = setTimeout(() => {
      startupTimers.delete(timer);
      animate(direction, 60);
    }, delay);
    startupTimers.add(timer);
  }

  return {
    render,
    animate,
    destroy() {
      destroyed = true;
      previousPointer = null;
      observer.disconnect();
      stopWaves();
      for (const timer of startupTimers) clearTimeout(timer);
      startupTimers.clear();
      interactiveShapes.clear();
      interruptShapes();
      svg.on(".innerLight", null).remove();
    },
  };
}
