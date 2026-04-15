/**
 * Refactored D3 Visualization Code
 * Functional blocks for easier extension, reuse, and readability.
 */

// I. Global State and Configuration
const AppState = {
  width: window.innerWidth,
  height: window.innerHeight,
  svg: null,
  shouldCreateFlags: [true, false, true, false, false], // Initial active shapes: Lotus, Circle
  shouldMoveShapes: true,
  isInfoBoxOpen: false,
};
const DragHoverState = {
  isDragging: false,
  hoveredElements: new WeakSet()
};

// Default configurations for shapes
const ShapeDefaults = {
//   lotus: {
//       count: 10,
//       baseStrokeWidth: "1vh",
//       hoverStrokeWidth: "6vh", // Used as single item in hoverStrokeWidths array for common handler
//       fillOpacity: 0.3,
//       className: "lotus",
//       initialPointsPercent: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
//       lotusScale: 2,
//       initialTotalPercentChange: 50, // This value is used for offsetting points
//       hueIncrement: 5.0,
//       animationScale:5.0
//   },
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
      numElements: 20,
      numSides: 6, // For polygon
      radius: 50, // Initial radius/size
      strokeWidth: '2px',
      strokeColor: 'white',
      fillOpacity: 0.1,
      className: 'user',
      incrementSize: 10, // How much size changes per element
      xDivisions: 10, // For rect grid layout
      yDivisions: 10, // For rect grid layout
      dynamicSize: 10, // For rect variance in grid AND hover stroke width for user shapes
      hueIncrement: 10, // Hue step per element for distinct hover colors in user shapes
  }
};


// II. SVG Utilities
const SvgUtils = {
  createSvgContainer: (selector) => {
      const svgWidth = Math.ceil(AppState.width / 10) * 10;
      const svgHeight = Math.ceil(AppState.height / 10) * 10;
      AppState.svg = d3.select(selector).append("svg")
          .attr("width", svgWidth)
          .attr("height", svgHeight)
         .on("pointerdown", function(event) {
        DragHoverState.isDragging = true;
        DragHoverState.hoveredElements = new WeakSet(); // Reset on new drag
    })
    .on("pointerup", function(event) {
        DragHoverState.isDragging = false;
    })
    .on("pointerleave", function(event) {
        DragHoverState.isDragging = false;
    })
    .on("pointermove", function(event) {
        if (!DragHoverState.isDragging) return;

        const [x, y] = d3.pointer(event);
        const el = document.elementFromPoint(x, y);

        // Only simulate if it's a shape element and we haven't hovered it yet
        if (
            el && 
            el.tagName !== 'svg' &&
            el.dataset.animating !== "true"
        ) {
            DragHoverState.hoveredElements.add(el);
            const simulatedEvent = new PointerEvent("pointermove", event);
            el.dispatchEvent(simulatedEvent);
        }
    });

      // Update AppState with actual SVG dimensions used
      AppState.width = svgWidth;
      AppState.height = svgHeight;
      return AppState.svg;
  },
  removeShapesByClass: (className) => {
      if (AppState.svg) {
          AppState.svg.selectAll(`.${className}`).remove();
      }
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
    
    let transition = element.transition().duration(config.transitionDuration);

    config.hoverStrokeWidths.forEach((width, index) => {
        const strokeForThisStep = config.hoverStrokeColors[index] || cycledHueColor;
        if(config.incrementFill[0])
        {
                transition = transition     
            .style("stroke-width", width)
            .style("stroke", strokeForThisStep)
            .attr("fill", strokeForThisStep)
            .transition()
            .duration(config.transitionDuration)
            .on("end", function() {
            this.dataset.animating = "false";
        });
        }else{
             transition = transition
            .style("stroke-width", width)
            .style("stroke", strokeForThisStep)
            .transition()
            .duration(config.transitionDuration)
            .on("end", function() {
            this.dataset.animating = "false";
        });
        }

    });

    // Removed the final revert to original color so the last hover state remains
}
,

  createLotus: (svg, config) => {
    const z = 100,
          x_factor = AppState.width / z,
          y_factor = AppState.height / z;
  
    function getLotusPercentCoord(pointsArray, idx) {
      // here idx goes from 0 … count-1
      const scaleOffset = config.initialTotalPercentChange * idx * (config.lotusScale);
          let newStringTemp = "";
          let currentSign = [1, 0];
          const tempPoints = [...pointsArray]; // Work on a copy
          for (let count8 = 0; count8 < 17; count8 += 2) {
              if (count8 === 0) { currentSign = [1, 0]; }
              else if (count8 === 2) { currentSign = [config.lotusScale, config.lotusScale]; }
              else if (count8 === 4) { currentSign = [0, 1]; }
              else if (count8 === 6) { currentSign = [-1 * config.lotusScale, config.lotusScale]; }
              else if (count8 === 8) { currentSign = [-1, 0]; }
              //else if (count8 === 10) { currentSign = [-1 * config.lotusScale, -1 * config.lotusScale]; }
              //else if (count8 === 12) { currentSign = [0, -1]; }
              else if (count8 === 14) { currentSign = [config.lotusScale, -1 * config.lotusScale]; }
              else if (count8 === 16) { currentSign = [1, 0]; }

              let pX = (tempPoints[count8] * x_factor * z) - (currentSign[0] * scaleOffset);
              let pY = (tempPoints[count8 + 1] * y_factor * z) - (currentSign[1] * scaleOffset);
              newStringTemp += `${pX},${pY}${count8 !== 16 ? "," : ""}`;
          }
          return newStringTemp;
      }
      svg.selectAll(`.${config.className}`)
          .data(d3.range(config.count))
          .enter().append("polyline")
          .attr("class", config.className)
          .style("stroke", "white")
          .style("stroke-width", config.baseStrokeWidth)
          .attr("points", (d,i) => getLotusPercentCoord(config.initialPointsPercent, i))
          .attr("fill", "none")
          .attr("stroke-linecap", "round")
          //.call(dragToHover)
          .on("pointermove",function(event, d) { // D3 v6 passes event first
            
                ShapeDrawer.commonMouseoverHandler.call(this, event, d, {
                    baseStrokeWidth: config.baseStrokeWidth,
                    initialStrokeColor: "white",
                    hoverStrokeWidths: [config.hoverStrokeWidth], // Common handler expects an array
                    fillOpacity: config.fillOpacity,
                    hueIncrement: config.hueIncrement,
                    finalStrokeColor: "white",
                    transitionDuration:300
                });
            });
          // .on("mouseover", function(event, d) { // D3 v6 passes event first
          //     ShapeDrawer.commonMouseoverHandler.call(this, event, d, {
          //         baseStrokeWidth: config.baseStrokeWidth,
          //         initialStrokeColor: "white",
          //         hoverStrokeWidths: [config.hoverStrokeWidth], // Common handler expects an array
          //         fillOpacity: config.fillOpacity,
          //         hueIncrement: config.hueIncrement,
          //         finalStrokeColor: "white"
          //     });
          // });
  },

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
          shapeType, numElements, numSides, radius, strokeWidth, strokeColor,
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
          .attr('fill', 'none') // User shapes typically not filled solid
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


// IV. UI Interaction & Event Handlers
const UIController = {
  updateButtonActiveState: (buttonIndex, isActive) => {
      const buttons = document.getElementsByTagName('button');
      if (buttons[buttonIndex]) { // buttonIndex is 0-based for the button array from HTML
          buttons[buttonIndex].classList.toggle('button-active', isActive);
      }
  },

  toggleInfoBox: () => {
      AppState.isInfoBoxOpen = !AppState.isInfoBoxOpen;
      const infoBox = document.getElementById('info-box');
      if (infoBox) infoBox.style.display = AppState.isInfoBoxOpen ? 'block' : 'none';
  },

  updateMovementIndicator: () => {
      const navElement = document.getElementById('innerLightNav');
      if (navElement) {
          const borderStyle = AppState.shouldMoveShapes ? "5px double white" : "5px double red";
          navElement.style.borderTop = borderStyle;
          navElement.style.borderBottom = borderStyle;
      }
  },

  handleKeyPress: (e) => {
      if (e.code === "KeyP") {
          AppState.shouldMoveShapes = !AppState.shouldMoveShapes;
          UIController.updateMovementIndicator();
      }
  },

  navigateTo: (page) => {
      window.location.href = page;
  },

  initializeButtonStates: () => {
      AppState.shouldCreateFlags.forEach((shouldCreate, flagIndex) => {
          // HTML button for flagIndex 0 is buttons[1], flagIndex 1 is buttons[2], etc.
          UIController.updateButtonActiveState(flagIndex + 1, shouldCreate);
      });
  },

  // Maps flag index (0-5) to shape key names used in configs and function names
  _shapeKeyMap: ['circle', 'square', 'rect', 'prism', 'user'],

  handleShapeToggle: (flagIndex, shapeKeyNameFromHTML) => {
      // Use flagIndex to get the canonical shapeKeyName, shapeKeyNameFromHTML is for compatibility if HTML calls with string
      const shapeKeyName = UIController._shapeKeyMap[flagIndex];
      if (!shapeKeyName) {
          console.error("Invalid flagIndex for shape toggle:", flagIndex);
          return;
      }

      AppState.shouldCreateFlags[flagIndex] = !AppState.shouldCreateFlags[flagIndex];
      const isActive = AppState.shouldCreateFlags[flagIndex];
      UIController.updateButtonActiveState(flagIndex + 1, isActive); // +1 for HTML button indexing

      const defaultConfig = ShapeDefaults[shapeKeyName];
      if (!defaultConfig) {
          console.error("No default config found for shape:", shapeKeyName);
          return;
      }
      const className = defaultConfig.className;

      if (!isActive) {
          SvgUtils.removeShapesByClass(className);
      } else {
          if (!AppState.svg) {
              console.error("SVG container not found for drawing shape:", shapeKeyName);
              return;
          }
          // Determine the correct creation function and configuration
          let creatorFn;
          let configToUse;

          if (shapeKeyName === 'user') {
              creatorFn = ShapeDrawer.createCustomShape;
              configToUse = UIController.getUserShapeConfig();
          } else {
              // Construct function name, e.g., "createLotus" from "lotus"
              const creatorFnName = `create${shapeKeyName.charAt(0).toUpperCase() + shapeKeyName.slice(1)}`;
              creatorFn = ShapeDrawer[creatorFnName];
              configToUse = defaultConfig;
          }

          if (creatorFn) {
               creatorFn(AppState.svg, configToUse);
          } else {
              console.error("No creator function found for shape:", shapeKeyName, `(tried ${creatorFnName || 'createCustomShape'})`);
          }
      }
  },

  getUserShapeConfig: () => { // Reads from form, providing defaults if form values are missing/invalid
      const getVal = (id, parser, fallback) => {
          const el = document.getElementById(id);
          const val = el ? el.value : undefined; // Check if element exists
          try { //Gracefully handle parsing errors
              return (val !== undefined && val !== '') ? parser(val) : fallback;
          } catch (e) { return fallback; }
      };
      const getInt = (id, fb) => getVal(id, parseIntWithRadix => parseInt(parseIntWithRadix, 10), fb);
      const getFlt = (id, fb) => getVal(id, parseFloat, fb);
      const getStr = (id, fb) => getVal(id, String, fb);

      const defaults = ShapeDefaults.user; // Use user defaults as base
      const shapeType = getStr('shapeType', defaults.shapeType);

      return {
          shapeType: shapeType,
          numElements: getInt('numElements', defaults.numElements),
          numSides: shapeType === 'polygon' ? getInt('numSides', defaults.numSides) : undefined,
          radius: getInt('radius', defaults.radius),
          centerX: AppState.width / 2, // Always center user shapes for now
          centerY: AppState.height / 2,
          strokeWidth: getStr('strokeWidth', defaults.strokeWidth),
          strokeColor: getStr('strokeColor', defaults.strokeColor),
          fillOpacity: getFlt('fillOpacity', defaults.fillOpacity),
          className: defaults.className, // Fixed class name for user shapes
          incrementSize: getInt('incrementSpace', defaults.incrementSize),
          xDivisions: getInt('xDivisions', defaults.xDivisions),
          yDivisions: getInt('yDivisions', defaults.yDivisions),
          dynamicSize: getInt('dynamicSize', defaults.dynamicSize),
          hueIncrement: defaults.hueIncrement, // Use default hueIncrement for user shapes
      };
  },

  updateUserShapeVisualization: () => {
      const userShapeFlagIndex = 4; // 'user' is at index 5 in _shapeKeyMap and shouldCreateFlags
      if (AppState.shouldCreateFlags[userShapeFlagIndex]) {
          // If already active, remove and re-add with new config
          SvgUtils.removeShapesByClass(ShapeDefaults.user.className);
          ShapeDrawer.createCustomShape(AppState.svg, UIController.getUserShapeConfig());
      } else {
          // If not active, toggle it on (which will then use getUserShapeConfig)
          UIController.handleShapeToggle(userShapeFlagIndex, 'user');
      }
  }
};
UIController.animateHoverSequence = function(options = {}) {
    const {
        mode = 'index-wise', // 'index-wise', 'shape-wise', 'reverse'
        interval = 300,       // milliseconds between animation steps
        shapeClasses = Object.values(ShapeDefaults).map(cfg => cfg.className) // Default to all known shapes
    } = options;

    // Gather all elements of each shape class
    const shapeElementsMap = {};
    shapeClasses.forEach(className => {
        const elements = Array.from(document.querySelectorAll(`.${className}`));
        if (elements.length > 0) shapeElementsMap[className] = elements;
    });

    if (Object.keys(shapeElementsMap).length === 0) {
        console.warn("No active shapes found for animation.");
        return;
    }

    const maxLength = Math.max(...Object.values(shapeElementsMap).map(els => els.length));
    let step = 0;

    const intervalId = setInterval(() => {
            const maxLength = Math.max(...Object.values(shapeElementsMap).map(els => els.length));

        if (step >= maxLength && mode === 'index-wise') {
            clearInterval(intervalId);
            return;
        }

        if (mode === 'index-wise') {
            // For each shape type, trigger the shape at index 'step' if it exists
            for (const className in shapeElementsMap) {
                const el = shapeElementsMap[className][step];
                if (el) {
                    const event = new PointerEvent("pointermove", { bubbles: true });
                    el.dispatchEvent(event);
                }
            }
            step++;
        } else if (mode === 'reverse') {
            // Same as index-wise, but starting from the end
            for (const className in shapeElementsMap) {
                const elements = shapeElementsMap[className];
                const el = elements[elements.length - 1 - step];
                if (el) {
                    const event = new PointerEvent("pointermove", { bubbles: true });
                    el.dispatchEvent(event);
                }
            }
            step++;
            if (step >= maxLength) clearInterval(intervalId);
        } else if (mode === 'shape-wise') {
            const classNames = Object.keys(shapeElementsMap);
            if (step >= classNames.length) {
                clearInterval(intervalId);
                return;
            }
            const currentClass = classNames[step];
            shapeElementsMap[currentClass].forEach(el => {
                const event = new PointerEvent("pointermove", { bubbles: true });
                el.dispatchEvent(event);
            });
            step++;
        }
    }, interval);
};

// V. Initialization and Global Exposure
function initializeApp() {
  // Update AppState with current window dimensions before creating SVG
  AppState.width = window.innerWidth;
  AppState.height = window.innerHeight -60;

  SvgUtils.createSvgContainer("#vis"); // Uses AppState.width/height
  console.log("SVG Initialized. Actual Height:", AppState.height); // Original log, now reflects potentially ceiled height

  UIController.initializeButtonStates(); // Sets active classes on buttons
  UIController.updateMovementIndicator(); // Set initial style for movement indicator

  // Create initially active shapes based on AppState.shouldCreateFlags
  AppState.shouldCreateFlags.forEach((shouldCreate, index) => {
      if (shouldCreate) {
          const shapeKey = UIController._shapeKeyMap[index];
          // Directly call handleShapeToggle to ensure consistent creation logic
          // but set the flag to false first so toggle sets it to true and creates
          AppState.shouldCreateFlags[index] = false; 
          UIController.handleShapeToggle(index, shapeKey);
      }
  });

  document.addEventListener('keydown', UIController.handleKeyPress);

  // Expose functions to global scope for HTML onclick="..." attributes
  // Note: It's generally better to attach event listeners programmatically (see commented example below)
  // but this maintains compatibility with the original HTML structure if it uses onclick.
  window.changePattern = UIController.handleShapeToggle;
  window.information = UIController.toggleInfoBox;
  window.goTo = UIController.navigateTo;
  window.updateShapeIns = UIController.updateUserShapeVisualization; // For the "Update Shape" button

  /* Example of programmatic event listener attachment (preferred over onclick in HTML):
     const infoButton = document.querySelector('button#infoButtonId'); // Assuming button has id="infoButtonId"
     if (infoButton) infoButton.addEventListener('click', UIController.toggleInfoBox);
  */
 // Trigger only squares and circles:
    // UIController.animateHoverSequence({
    // mode: 'index-wise',
    // shapeClasses: ['square', 'circle'],
    // interval: 100
    // });
    // Trigger hover animation index-wise across all shapes
    //UIController.animateHoverSequence({ mode: 'index-wise', interval: time });

    // Trigger hover animation for one shape type at a time
    //UIController.animateHoverSequence({ mode: 'shape-wise', interval: 500 });
        const time = 60;

    setTimeout(() => {
        UIController.animateHoverSequence({ mode: 'index-wise', interval: time });

    }, 300);
    setTimeout(() => {
        UIController.animateHoverSequence({ mode: 'reverse', interval: time });

    }, 200);
    setTimeout(() => {
        UIController.animateHoverSequence({ mode: 'reverse', interval: time+50 });

    }, 500);
    // Trigger hover animation in reverse order

}
function triggerAnimationOnCShape(){
    const time = 50;
    //UIController.animateHoverSequence({ mode: 'reverse', interval: time });
    UIController.animateHoverSequence({ mode: 'index-wise', interval: time });

    //UIController.animateHoverSequence({ mode: 'index-wise', interval: time });
    //UIController.animateHoverSequence({ mode: 'shape-wise', interval: 500 });

}
function triggerAnimationOnCShapeReverse(){
    const time = 50;
    UIController.animateHoverSequence({ mode: 'reverse', interval: time });
    //UIController.animateHoverSequence({ mode: 'index-wise', interval: time });

    //UIController.animateHoverSequence({ mode: 'index-wise', interval: time });
    //UIController.animateHoverSequence({ mode: 'shape-wise', interval: 500 });

}
window.triggerAnimationOnCShape = triggerAnimationOnCShape;
// Main execution entry point
document.addEventListener("DOMContentLoaded", initializeApp);