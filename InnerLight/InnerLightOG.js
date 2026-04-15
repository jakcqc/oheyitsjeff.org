
  let width;
  let height;
  let shouldCreate = [true,true,false,false,false, false];
  let shouldMove = true;
  let svg;
  let shouldClose = false;
      document.addEventListener("DOMContentLoaded", function(){
          width = window.innerWidth;
          height = window.innerHeight;
          console.log(height);
          svg = d3.select("#vis").append("svg")
            .attr("width", Math.ceil(width/10)*10)
            .attr("height", Math.ceil(height/10)*10);
          createLotus(svg);
          createCircle(svg);
          document.addEventListener('keydown', logKey);
          const buttons = document.getElementsByTagName('button');
          buttons[1].classList.add('button-active');
          buttons[2].classList.add('button-active');

      });
  function changePattern(index, shape){
    shouldCreate[index] = !shouldCreate[index];
    const buttons = document.getElementsByTagName('button');
    
    if(!shouldCreate[index]){
      buttons[index+1].classList.remove('button-active');
      const currentShape = document.getElementsByClassName(shape);
      let lengthShape = currentShape.length -1;
       while( lengthShape >= 0){
        currentShape[lengthShape].remove();
        lengthShape--;
      }
    }else{
      buttons[index+1].classList.add('button-active');
      if(shape === 'lotus'){
        createLotus(svg);
      }
      if(shape === 'square'){
        createSquare(svg);
      }
      if(shape === 'circle'){
        createCircle(svg);
      }
      if(shape === 'rect'){
        createRect(svg);
      }
      if(shape === 'prism'){
        createPrism(svg);
      }
      if(shape === 'user'){
        createUserShape(svg);
      }
    }
  }
  function information(){
    if(!shouldClose){
      document.getElementById('info-box').style.display = 'block';
      
    }else{
      document.getElementById('info-box').style.display = 'none';
    }
    shouldClose = !shouldClose
    
  }
  function closeInfoBox(){
    //document.getElementById('info-box').style.display = 'none';
  }
  function logKey(e){
    if(e.code === "KeyP"){
      shouldMove = !shouldMove;
      if(!shouldMove){
        document.getElementById('innerLightNav').style.borderTop = '5px double red';
        document.getElementById('innerLightNav').style.borderBottom = '5px double red';

      }else{
        document.getElementById('innerLightNav').style.borderTop = "5px double white";
        document.getElementById('innerLightNav').style.borderBottom = '5px double white';

      }
    }
  }
  function goTo(page){
    window.location.href = page;
  }
  function createLotus(svg){
  const z = 50,
        x = width/ z,
        y = height / z,
        ogLineSize = ".45vh",
        scaleSizeChange = 1;
  let hue = 0,
      hueBody = 0,
      vhTen = height*.05,
      cordXY = [45,52,47,35],
      signCheck = [1,1,1,1],
      newString,
      lineSet = 0,
      cSetPercent = [.5, .5,.5,.5,.5, .5,.5, .5,.5, .5, .5,.5,.5, .5,.5,.5,.5, .5],
      totalPercentChange = 0,
      counter = 1,
      opacP = .2,
      lotusScale = 4;
      
    while(counter<70){
        svg.selectAll(".lotus")
        .data(d3.range(counter))
        .enter().append("polyline")
        .style("stroke", "white")
        .style("stroke-width", ogLineSize)
        .attr("points", getPercentCoord(cSetPercent)) 
        .attr("fill","none")
        .attr("class","lotus")
        .attr("stroke-linecap", "round") 
        .on("start", mouseover)
        .on("drag",  mouseover)
        .on("end",   mouseover)
        .on("mouseover", mouseover);
        counter++;
    }
  function getPercentCoord(points){

  let count8 = 0,
    newStringTemp = "",
    stringNew,
    currentSign = [1,0];
    while(count8 < 17){
      //1
      if(count8 == 0){
        currentSign[0] = 1;
        currentSign[1] = 0;
      }
      //2
      //Crimp1 
      if(count8 == 2){
        currentSign[0] = lotusScale;
        currentSign[1] = lotusScale;
      }
      //3
      if(count8 == 4){
        currentSign[0] = 0;
        currentSign[1] = 1;
      }
      //4
      //crimp2
      if(count8 == 6){
        currentSign[0] = -1*lotusScale;
        currentSign[1] = lotusScale;
      }
      //5
      if(count8 == 8){
        currentSign[0] = -1;
        currentSign[1] = 0;
      }
      //6
      //crimp3
      if(count8 == 10){
        currentSign[0] = -1*lotusScale;
        currentSign[1] = -1*lotusScale;
      }
      //7
      if(count8 == 12){
        currentSign[0] = 0;
        currentSign[1] = -1;
      }
      //8
      //crimp4
      if(count8 == 14){
        currentSign[0] = lotusScale;
        currentSign[1] = -1*lotusScale;
      }
      //8
      if(count8 == 16){
        currentSign[0] = 1;
        currentSign[1] = 0;
      }

      points[count8] = (points[count8] * x*z) - (currentSign[0]*totalPercentChange);
      points[count8+1] = (points[count8+1] * y*z) - (currentSign[1]*totalPercentChange);
      stringNew = points[count8].toString();
      newStringTemp = newStringTemp + stringNew + ",";   
      stringNew = points[count8+1].toString();

      if(count8 != 16){
        newStringTemp = newStringTemp + stringNew + ",";
      }
      else{
        newStringTemp = newStringTemp + stringNew;
      }
      points[count8] = points[count8]/(x*z);
      points[count8+1] = points[count8+1]/(y*z);
      count8 = count8 + 2;
    }
    if(counter == 1){
      totalPercentChange = totalPercentChange + 17;
    }

    totalPercentChange= totalPercentChange ;
    return newStringTemp; 
  }
  function mouseover(i) {
    if(!shouldMove){return;} 
      this.parentNode.appendChild(this);
      d3.select(this)
          .style("stroke", "white")
          .style("stroke-width",ogLineSize)
          .style("fill-opacity", opacP)

      .transition()
        .duration(300)
          .style("stroke-width","3vh")
          .style("stroke", function(i) {
            if(hue != 360){
              hue = hue + 1.3; 
            }else{
              hue = 0;
            }
            
            return d3.hsl(hue, 1,.60); 
            
            })
      .transition()
        .duration(300)
          .style("stroke-width", "1" + ogLineSize)
  
    }
  }
  function createSquare(svg){
    const z = 50,
          x = width / z,
          y = height / z,
          ogLineSize = ".5vh",
          scaleSizeChange = 1;
    let hue = 0,
          hueBody = 0,
          vhTen = height*.05,
          cordXY = [45,52,47,35],
          signCheck = [1,1,1,1],
          newString,
          lineSet = 0,
          cSetPercent = [.5, .5,.5, .5,.5, .5, .5, .5,.5, .5],
          totalPercentChange = 0,
          counter = 1,
          opacP = .2;
        
        while(counter<80){
        svg.selectAll(".square")
          .data(d3.range(counter))
          .enter().append("polyline")
          .style("stroke", "white")
          .style("stroke-width", ogLineSize)
          .attr("points", getPercentCoord(cSetPercent)) 
          .attr("fill","none")
          .attr("class","square")
          .attr("stroke-linecap", "square") 
          .on("start", mouseover)
          .on("drag",  mouseover)
          .on("end",   mouseover)
          .on("mouseover", mouseover);
          counter++;
        }
      function getPercentCoord(points){
        
        let count8 = 0,
            newStringTemp = "",
            stringNew, 
            currentSign = [1,0];
        while(count8 < 9){
          if(count8 == 0){
            currentSign[0] = 1;
            currentSign[1] = 0;
          }
          if(count8 == 2){
            currentSign[0] = 0;
            currentSign[1] = 1;
          }
          if(count8 == 4){
            currentSign[0] = -1;
            currentSign[1] = 0;
          }
          if(count8 == 6){
            currentSign[0] = 0;
            currentSign[1] = -1;
          }
          if(count8 == 8){
            currentSign[0] = 1;
            currentSign[1] = 0;
          }
          points[count8] = (points[count8] * x*z) - (currentSign[0]*totalPercentChange);
          points[count8+1] = (points[count8+1] * y*z) - (currentSign[1]*totalPercentChange);
          stringNew = points[count8].toString();
          newStringTemp = newStringTemp + stringNew + ",";   
          stringNew = points[count8+1].toString();
          if(count8 != 8){
            newStringTemp = newStringTemp + stringNew + ",";
          }
          else{
            newStringTemp = newStringTemp + stringNew;
          }
          points[count8] = points[count8]/(x*z);
        points[count8+1] = points[count8+1]/(y*z);
          count8 = count8 + 2;
        }
        if(counter == 1){
          totalPercentChange = totalPercentChange + 20;
        }
        totalPercentChange= totalPercentChange ;
        return newStringTemp; 
      }
      function mouseover(i) {
        if(!shouldMove){return;} 
        this.parentNode.appendChild(this);
        d3.select(this)
            .style("stroke", "white")
            .style("stroke-width",ogLineSize)
            .style("fill-opacity", opacP)
         .transition()
           .duration(300)
            .style("stroke-width","3vh")
            .style("stroke", function(i) {
              if(hue != 360){
                hue++; 
              }else{
                hue = 0;
              }
                return d3.hsl(hue, 1,.60); 
              })
          .transition()
           .duration(300)
            .style("stroke-width", "1" + ogLineSize)
      }
    }
  function createRect(svg){
      const z = 61;
     let x = width / z,
      y = height / z,
      newW = width,
      sizeScale = 30,
      baseSizeSquare = ".6vh";
let hue = 0,
      hueBody = 0,
      vhTen = height*.05,
      sizeH = 10,
      sizeW = 10,
      angle = 0,
      newSize = 10;
let size = 10;  
    svg.selectAll(".rect")
      .data(d3.range(x * y))
      .enter().append("rect")
      .attr("width",sizeIncreaseW)
      .attr("height",sizeIncreaseH)
      .attr("x", newSquares)
      .attr("y",  newSquaresHeight)
      .attr("stroke","white")
      .attr("class","rect")
      .attr("stroke-width",baseSizeSquare)
      .attr("fill","none")
      .on("start", mouseover)
      .on("drag",  mouseover)
      .on("end",   mouseover)
      .on("mouseover", mouseover);
      
      function toDegrees(rad) {
        return rad * (180/Math.PI);
    }
    function newSquares(i){
        size = size + sizeScale;
        return newW/2 - size/2;
    }   
    function newSquaresHeight(i){
        newSize = newSize + sizeScale;
        return newSize/2;
    } 
    function sizeIncreaseH(i){
           sizeH = sizeH + sizeScale;
           return sizeH;
           
    }
    function sizeIncreaseW(i){
           sizeW = sizeW + sizeScale;
           return sizeW;
    }
      function translateX(i){
              return Math.floor((i % x) * z)
      }
      function translateY(i){
            return (Math.floor(i / x) * z)
      }
    
      function translate(i) {
        return "translate("+(i % x) * z+","+Math.floor(i / x) * z+")";
      }
      
      function mouseover(i) {
        if(!shouldMove){return;} 
        this.parentNode.appendChild(this);
    
        d3.select(this)
            .style("stroke-width"," 2vh")
            .style("stroke", "white")
            .style("fill-opacity", .45)
            .style("z-index","100")
            .style("stroke", function(i) {
              if(hue != 360){
                hue = hue + .8; 
              }else{
                hue = 0;
              }
              
              return d3.hsl(hue, 1,.60); 
              
              })
    
         .transition()
           .duration(1000)
            .style("stroke-width","2vh")
            .style("stroke","black")
        .transition()
           .duration(200)
            .style("stroke-width",baseSizeSquare)
            //.style("stroke","white")
            .transition()
              .duration(1000)
              .style("stroke-width",baseSizeSquare)
              .style("stroke","white")
      }
  }
  function createPrism(svg){
    let h = height,
    w = width,
    z = 90,
    x = w / z,
    y = h / z;
let hue = 0,
    hueBody = 0,
    vhTen = h*.05,
    centerFinderH = 3,
    centerFinderW = 3,
    sizer = 3,
    centerLocation = 2,
    size = 10; 
           
 svg.selectAll(".prism")
    .data(d3.range(x*y))
    .enter().append("circle")
    .attr("cx", getCenterWidth)
    .attr("cy", getCenterHeight)
    .attr("r", sizeIncrease)
    .attr("fill","none")
    .attr("stroke","black")
    .attr("class","prism")
    .attr("stroke-width",".5vh")
    .on("start", mouseover)
        .on("drag",  mouseover)
        .on("end",   mouseover)
    .on("mouseover", mouseover);

function getCenterHeight(i){
  if(centerFinderH%3 == 0){
      centerLocation = 2.09;
  }
   if(centerFinderH%3 == 1){
     centerLocation = 2.09;
  }
   if(centerFinderH%3 == 2){
     centerLocation = 1.99;
  }
  centerFinderH++;
  return h/centerLocation;
}
function getCenterWidth(i){

  if(centerFinderW%3 == 0){
      centerLocation = 1.98;
  }
   if(centerFinderW%3 == 1){
     centerLocation = 2.02;
  }
   if(centerFinderW%3 == 2){
     centerLocation = 2;
  }
  centerFinderW++;
  return w/centerLocation;
}

function sizeIncrease(i){
  if(sizer%3 == 0){
      size = size + 25;
  }
  sizer++;
  return size;
}
function translateX(i){
        return Math.floor((i % x) * z)
}
function translateY(i){
      return (Math.floor(i / x) * z)
}

function translate(i) {
  return "translate("+(i % x) * z+","+Math.floor(i / x) * z+")";
}

function mouseover(i) {
  if(!shouldMove){return;} 
  this.parentNode.appendChild(this);
  d3.select(this)
      .style("stroke-width"," .3vh")
      .style("stroke", "white")
       .style("fill-opacity", .45)
      .style("stroke", function(i) {
        if(hue != 360){
          hue++; 
        }else{
          hue = 0;
        }
        
        return d3.hsl(hue, 1,.60); 
        
        })

   .transition()
     .duration(300)
      .style("stroke-width"," 10px")
  .transition()
     .duration(300)
      .style("stroke-width"," 20px")
    
    }
  }
  function createCircle(svg){
    const z = 72,
    x = width / z,
    y = height / z;
let hue = 0,
    hueBody = 0,
    vhTen = height*.05;
let size = 10;  
 svg.selectAll(".circle")
    .data(d3.range(x * y))
    .enter().append("circle")
    .attr("cx", width/2)
    .attr("cy", height/2)
    .attr("r",sizeIncrease)
    .attr("fill","none")
    .attr("stroke","white")
    .attr("class","circle")
    .style("stroke-width"," 2px")
    .on("start", mouseover)
    .on("drag",  mouseover)
    .on("end",   mouseover)
    .on("mouseover", mouseover);
    
function sizeIncrease(i){
     size = size + 5;
     return size;
}
function translateX(i){
        return Math.floor((i % x) * z)
}
function translateY(i){
      return (Math.floor(i / x) * z)
}

function translate(i) {
  return "translate("+(i % x) * z+","+Math.floor(i / x) * z+")";
}

function mouseover(i) {
  if(!shouldMove){return;} 
  this.parentNode.appendChild(this);

  d3.select(this)
    
      
     
      .style("stroke-width"," .3vh")
      .style("stroke", "white")
       .style("fill-opacity", .45)
      .style("stroke", function(i) {
        if(hue != 360){
          hue++; 
        }else{
          hue = 0;
        }
        
        return d3.hsl(hue, 1,.60); 
        
        })

   .transition()
     .duration(300)
      .style("stroke-width"," 10px")
  .transition()
     .duration(300)
      .style("stroke-width"," 15px")
  }
}
function createShape(svg, shapeConfig) {
  const {
      shapeType, // 'circle', 'rect', or 'polygon'
      numElements,
      numSides, // Needed for polygon shapes
      radius, // Also needed for polygons
      centerX, // Center X coordinate for the shape (for polygons and circles)
      centerY, // Center Y coordinate for the shape (for polygons and circles)
      initialSize,
      color,
      strokeWidth,
      strokeColor,
      fillOpacity,
      className,
      incrementSize,
      xDivisions,
      yDivisions,
      dynamicSize
  } = shapeConfig;
  console.log(shapeConfig);
  const widthUnit = width / xDivisions;
  const heightUnit = height / yDivisions;
  let elementData  = svg.selectAll('.user');
  let elements = elementData.data(d3.range( numElements));
  
  //const elementData = d3.range(numElements);
  //let elements = elementData.enter().append("circle")

  //elements.exit().remove(); // Remove unused elements

  let newElements;
  if (shapeType === 'rect') {
      newElements = elements.enter().append('rect');
  } else if (shapeType === 'circle') {
      newElements = elements.enter().append('circle');
  } else if (shapeType === 'polygon') {
    const max = radius + numElements * incrementSize;
      newElements = elements.enter().append('polygon')
          .attr('points', (d, i) => getPolygonPoints(numSides,max - (radius + i * incrementSize), centerX, centerY));
  }

  newElements.merge(elements)
      .attr('class', 'user')
      .attr('stroke', strokeColor)
      .attr('stroke-width', strokeWidth)
      .attr('fill', 'none')
      .style('fill-opacity', fillOpacity)
      .on("start", mouseover)
        .on("drag",  mouseover)
        .on("end",   mouseover)
      .on('mouseover', mouseover);

  if (shapeType === 'circle') {
    const max = initialSize + numElements * incrementSize;
      newElements.attr('cx', centerX)
                 .attr('cy', centerY)
                 .attr('r', (d, i) => max - (initialSize + i * incrementSize));
  } else if (shapeType === 'rect') {
    //const max = initialSize + numElements * incrementSize;
      newElements.attr('width', (d, i) => widthUnit - i * dynamicSize)
                 .attr('height', (d, i) => heightUnit - i * dynamicSize)
                 .attr('x', (d, i) => i % xDivisions * widthUnit)
                 .attr('y', (d, i) => Math.floor(i / xDivisions) * heightUnit);
  }

  function getPolygonPoints(sides, radius, centerX, centerY) {
      const step = 2 * Math.PI / sides;
      return Array.from({length: sides}, (v, i) => {
          const x = centerX + radius * Math.cos(step * i);
          const y = centerY + radius * Math.sin(step * i);
          return `${x},${y}`;
      }).join(' ');
  }
  
  function mouseover(d, i) {
      if (!shouldMove) return;
      this.parentNode.appendChild(this);
      d3.select(this)
        .transition()
        .duration(300)
        .style('stroke-width', dynamicSize + 'px')
        .style('stroke', () => {
            let hue = (i * 10) % 360;
            return d3.hsl(hue, 1, 0.6);
        })
        .transition()
        .duration(300)
        .style('stroke-width', strokeWidth);
  }
}
function updateShapeIns(){
  if(shouldCreate[5]){
    changePattern(5,'user');
    changePattern(5,'user');

  }else{changePattern(5,'user');}

}
function createUserShape(svg)
{
  
  createShape(svg,updateShape());
}
function updateShape() {
  const shapeType = document.getElementById('shapeType').value;
  const numElements = parseInt(document.getElementById('numElements').value);
  const numSides = parseInt(document.getElementById('numSides').value);
  const radius = parseInt(document.getElementById('radius').value);
  const strokeWidth = document.getElementById('strokeWidth').value;
  const strokeColor = document.getElementById('strokeColor').value;
  const fillColor = document.getElementById('fillColor').value;
  const fillOpacity = parseFloat(document.getElementById('fillOpacity').value);
  const xDiv = parseInt(document.getElementById('xDivisions').value);
  const yDiv = parseInt(document.getElementById('yDivisions').value);
  const dynamiSize = parseInt(document.getElementById('dynamicSize').value);
  const incrementSpace = parseInt(document.getElementById('incrementSpace').value);



  const shapeConfig = {
      shapeType: shapeType,
      numElements: numElements,
      numSides: shapeType === 'polygon' ? numSides : undefined,
      radius: radius,
      centerX: width/2, // Center of the SVG
      centerY: height/2, // Center of the SVG
      initialSize: radius,
      color: fillColor,
      strokeWidth: strokeWidth,
      strokeColor: strokeColor,
      fillOpacity: fillOpacity,
      className: 'user',
      incrementSize: incrementSpace, // Increment size for demonstration
      xDivisions: xDiv,
      yDivisions: yDiv,
      dynamicSize: dynamiSize
  };
return shapeConfig;
  // Remove old shapes
  //svg.selectAll('*').remove();

  // Recreate shape with new settings
  //createShape(svg, shapeConfig);
}


