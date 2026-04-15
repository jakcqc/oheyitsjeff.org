import * as THREE from 'three'; // Assuming you are using a bundler or can use import maps
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'; // Adjust path if needed
import { TWEEN } from 'three/examples/jsm/libs/tween.module.min.js'; // Adjust path
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass     } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GlowShader as ShaderBasic } from './shaderBasic.js';
import  {GlowShader}  from './shaderBasic.js';

// at top of your script
let ambientLight, directionalLight;
let elementColor = '#ffffff';
let baseOpacity = 0.5;
let outlineOpacity = 1.0;
let shouldResetCam = false;
let elementsToGrab = 4;
let configState = false;
let scene, camera, renderer, raycaster, pointer, controls, composer,globalPass;
let width, height,baseShapeSize;
let hue = 0;
let isDragging = false;
const animatingObjects = new Set();
let elementsGroup; // Group to hold all interactive elements
let baseShapeBool = [false,true,false];
// Configuration
let currentBaseShape = 'sphere'; // 'cube', 'sphere', 'plane' (original)
let currentElementShape = 'cube3d'; // 'square', 'circle', 'triangle'
let elementSize = 40; // Base size of the 2D elements
let boundsSize = 400; // Size of the 3D bounding shape
let shouldMoveCam = true;
const animationConfig = {
    flyOutDistanceMultiplier: 2.5, // how far out to fly
    flyOutDuration: 800,
    spaceBetween:1.1,
    rotationDuration: 800,
    colorDuration: 800,
    opacityTargetMultiplier: 0.9,
    returnDelay: 2500,
    returnPositionDuration: 1500,
    returnRotationDuration: 600,
    randomSampling:1,
  };
  window.updateParamValueInput = function() {
    const key   = document.getElementById('animationParamKey').value;
    document.getElementById('animationParamValue').value =
      parseFloat(animationConfig[key]).toFixed(3);
  };
  
  window.applyAnimationParam = function() {
    const key = document.getElementById('animationParamKey').value;
    const val = document.getElementById('animationParamValue').value;
    setAnimationParam(key, val);
    // refresh the input to the now-saved value
    window.updateParamValueInput();
  };
  
  
  // Optional: call once on load to initialize input value
  document.addEventListener('DOMContentLoaded', updateParamValueInput);
  
  window.setAnimationParam = function (key, value) {
    if (key in animationConfig) {
      const newValue = parseFloat(value);
      if (animationConfig[key] !== newValue) {
        animationConfig[key] = newValue;
        console.log(`✅ Updated animationConfig[${key}] →`, animationConfig[key]);
      } else {
        console.log(`ℹ️ animationConfig[${key}] already set to ${newValue}`);
      }
    } else {
      console.warn(`⚠️ Unknown animation config key: "${key}"`);
    }
  };
  
  
// …now, update createElementMesh:
function createElementMesh(shapeType, size) {
  let geometry;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(elementColor),
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0.1,
    transparent: true,    // ← allow opacity changes
    opacity: baseOpacity            // start fully opaque
  });
  
  // similarly for your stroke material if you want to fade the outline:
  const strokeMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(outlineColor),
    linewidth: 2,
    transparent: true,
    opacity: 1
  });
  switch(shapeType) {
    case 'square':
      geometry = new THREE.PlaneGeometry(size, size);
      break;
    case 'circle':
      geometry = new THREE.CircleGeometry(size/2, 32);
      break;
    
        case 'triangle':
            // ← HERE’S THE FIX:
            const shape = new THREE.Shape();
            shape.moveTo(-size / 2, -size / Math.sqrt(12)); 
            shape.lineTo( size / 2, -size / Math.sqrt(12));
            shape.lineTo(      0,      size * Math.sqrt(3)/2 - size/Math.sqrt(12));
            shape.closePath();
            geometry = new THREE.ShapeGeometry(shape);
            break;
      break;
    case 'cube3d':
      geometry = new THREE.BoxGeometry(size, size, size);
      break;
    case 'sphere3d':
      geometry = new THREE.SphereGeometry(size/2, 16, 16);
      break;
    case 'cone3d':
      geometry = new THREE.ConeGeometry(size/2, size, 16);
      break;
    default:
      geometry = new THREE.PlaneGeometry(size, size);
  }

  const mesh = new THREE.Mesh(geometry, material);
  const edgesGeom = new THREE.EdgesGeometry(geometry);
  const stroke = new THREE.LineSegments(edgesGeom, strokeMaterial);
  mesh.add(stroke);

  mesh.userData.isElement = true;
  return mesh;
}

// …then, add these helper functions at the bottom of your JS file:
window.setAmbientIntensity   = v => {
  ambientLight.intensity     = parseFloat(v);
  document.getElementById('ambientValue').innerText = v;
};
window.setDirectionalIntensity = v => {
  directionalLight.intensity = parseFloat(v);
  document.getElementById('directionalValue').innerText = v;
};
window.setElementColor = hex => {
  elementColor = hex;
  // update existing elements on-the-fly
  elementsGroup.children.forEach(el => {
    el.material.color.set(hex);
    const stroke = el.children.find(c=>c.type==='LineSegments');
    if (stroke) stroke.material.color.set(hex);
  });
};
window.setBaseShapeSize = v => {
  
    
};
// keep track of the outline colour separately
let outlineColor = '#000000';

window.setElementOutline = hex => {
  outlineColor = hex;

  elementsGroup.children.forEach(el => {
    // look for the LineSegments child
    const stroke = el.children.find(c => c instanceof THREE.LineSegments);
    if (stroke) {
      stroke.material.color.set(hex);
      // ensure Three.js knows to recompile if necessary
      stroke.material.needsUpdate = true;
    }
  });
};
// --- UI Interaction Placeholder Functions ---
// These would be called by your HTML menu buttons
window.setOpacity = function(val) {
    baseOpacity = parseFloat(val);
    elementsGroup.children.forEach(el => {
      // fill
      if (el.material) {
        el.material.transparent = true;
        el.material.opacity     = baseOpacity;
        el.material.needsUpdate = true;
      }
    });
    // optional: update a label in your UI
    document.getElementById('baseOpacityValue').innerText = baseOpacity.toFixed(2);
  };
  
  window.setOpacityOutline = function(val) {
    outlineOpacity = parseFloat(val);
    elementsGroup.children.forEach(el => {
      // outline stroke is the LineSegments child
      const stroke = el.children.find(c => c instanceof THREE.LineSegments);
      if (stroke && stroke.material) {
        stroke.material.transparent = true;
        stroke.material.opacity     = outlineOpacity;
        stroke.material.needsUpdate = true;
      }
    });
    // optional: update a label in your UI
    document.getElementById('outlineOpacityValue').innerText = outlineOpacity.toFixed(2);
  };
window.setElementShape = function(baseS) {
    currentElementShape = baseS;
    recreateAbstraction(); // Could also just update existing shapes if desired
}
window.setBaseShape = function(shapeType) {
    baseShapeBool[0] = false;
    baseShapeBool[1] = false;
    baseShapeBool[2] = false;

    if(shapeType == 'sphere')
    {
        baseShapeBool[2] = true;
    }
    if(shapeType == 'plane')
        {
            baseShapeBool[0] = true;
        }
        if(shapeType == 'cube')
            {
                baseShapeBool[1] = true;
            }
    currentBaseShape = shapeType;
    recreateAbstraction(); // Could also just update existing shapes if desired
}
window.resetCamera = function() {
    shouldResetCam = true;
    resetControls(baseShapeSize*2.5);
    shouldResetCam=false;
}
window.setBoundsSize = function(newSize) {
    boundsSize = parseInt(newSize);
    recreateAbstraction();
}

window.setElementSize = function(newSize) {
    if(newSize<5){

    }else{
        elementSize = parseInt(newSize);
        recreateAbstraction();
    }
}
window.showConfig = function() {
    const menu = document.getElementById('mondrian-config-menu');
   if(!configState){menu.style.display = 'block';configState=true;}
   else if(configState){menu.style.display = 'none';configState=false;}
}

document.addEventListener("DOMContentLoaded", function () {
    width = window.innerWidth;
    height = window.innerHeight;
    initThree();
    recreateAbstraction(); // Initial creation
    animate();

    // Example: Add this to your HTML for the nav bar
    // <button onclick="setBaseShape('cube')">Cube Base</button>
    // <button onclick="setBaseShape('sphere')">Sphere Base</button>
    // <button onclick="setBaseShape('plane')">Plane Base</button>
    // ... etc. for element shapes and sizes
});
// Add this to a <script> tag in your HTML, or at the end of mondrian.js (if not module)
document.addEventListener('DOMContentLoaded', () => {
    const boundsSlider = document.getElementById('boundsSizeSlider');
    const boundsValue = document.getElementById('boundsSizeValue');
    if (boundsSlider && boundsValue) {
        boundsSlider.oninput = function() {
            boundsValue.innerHTML = this.value;
            window.setBoundsSize(this.value); // Call your function
        }
    }

    const elementSlider = document.getElementById('elementSizeSlider');
    const elementValue = document.getElementById('elementSizeValue');
    if (elementSlider && elementValue) {
        elementSlider.oninput = function() {
            elementValue.innerHTML = this.value;
            window.setElementSize(this.value); // Call your function
        }
    }
});
window.toggleCameraLock = function () {
    //controls.enabled = !controls.enabled;
    shouldMoveCam = !shouldMoveCam;
    
        controls.enableRotate = shouldMoveCam;
controls.enableZoom = shouldMoveCam;
controls.enablePan = shouldMoveCam;

    
    const status = controls.enabled ? 'Unlocked' : 'Locked';
    console.log(`🎥 Camera is now: ${status}`);
    document.getElementById('cameraLockStatus').innerText = status;
};
export function goTo(page) {
    window.location.href = page;
}
window.goTo = goTo;
function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee); // Light gray background
    // hit‐circle indicator
const circGeo = new THREE.CircleGeometry(1, 32);
const circMat = new THREE.MeshBasicMaterial({
  color: 0xffff00,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.3
});


    // Perspective camera for 3D view
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
    camera.position.set(0, 0, boundsSize * 1.8); // Adjust initial camera distance

    renderer = new THREE.WebGLRenderer({ antialias: true });

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // 3) your “global” shader as a pass
 globalPass = new ShaderPass(GlowShader);
  composer.addPass(globalPass);
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    composer.setPixelRatio(window.devicePixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById("vis").innerHTML = ''; // Clear previous canvas if any
    document.getElementById("vis").appendChild(renderer.domElement);

    // Lighting
     ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
     directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    elementsGroup = new THREE.Group();
    scene.add(elementsGroup);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    // OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    // controls.minDistance = 50;
    // controls.maxDistance = 500;
    controls.target.set(0,0,0); // Ensure controls target the center

    window.addEventListener('resize', onWindowResize, false);
    renderer.domElement.style.pointerEvents = 'auto';

    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);
    renderer.domElement.addEventListener('pointermove', onPointerMove, false);
    renderer.domElement.addEventListener('pointerup', onPointerUp, false);
}

function recreateAbstraction() {
    // Clear existing elements
    while (elementsGroup.children.length > 0) {
        const child = elementsGroup.children[0];
        elementsGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    }
    animatingObjects.clear();

    // Create elements based on current configuration
    if (currentBaseShape === 'plane') {
        createPlaneArrangement();
    } else if (currentBaseShape === 'cube') {
        createCubeArrangement();
    } else if (currentBaseShape === 'sphere') {
        createSphereArrangement();
    }
    // Add more base shapes here (e.g., cylinder, torus)
}

// --- Element Creation ---
// function createElementMesh(shapeType, size) {
//     let geometry;
//     const material = new THREE.MeshStandardMaterial({
//         color: 0xffffff,
//         side: THREE.DoubleSide,
//         roughness: 0.7,
//         metalness: 0.1
//     });
//      const strokeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

//     if (shapeType === 'square') {
//         geometry = new THREE.PlaneGeometry(size, size);
//     } else if (shapeType === 'circle') {
//         geometry = new THREE.CircleGeometry(size / 2, 32);
//     } else if (shapeType === 'triangle') {
//         const shape = new THREE.Shape();
//         shape.moveTo(-size / 2, -size / Math.sqrt(12)); // Equilateral triangle
//         shape.lineTo(size / 2, -size / Math.sqrt(12));
//         shape.lineTo(0, size * Math.sqrt(3) / 2 - size / Math.sqrt(12));
//         shape.closePath();
//         geometry = new THREE.ShapeGeometry(shape);
//     } else { // Default to square
//         geometry = new THREE.PlaneGeometry(size, size);
//     }

//     const mesh = new THREE.Mesh(geometry, material);

//     // Add Edges (Stroke)
//     const edgesGeom = new THREE.EdgesGeometry(geometry);
//     const stroke = new THREE.LineSegments(edgesGeom, strokeMaterial);
//     mesh.add(stroke); // Add stroke as a child of the main mesh

//     mesh.userData.isElement = true; // Flag for raycasting
//     return mesh;
// }
function resetControls(boundsSizeLocal)
{
    if(shouldResetCam){
    controls.target.set(0,0,0); // Reset target for plane
    camera.position.set(0, 0, boundsSize * 2.5); // Adjust camera for plane
    controls.update();
    }
}

// --- Arrangement Functions ---
function createPlaneArrangement() {
    const numX = Math.floor(boundsSize * 2 / (elementSize * 1.2 * animationConfig.spaceBetween)); // Adjust spacing
    const numY = Math.floor(boundsSize * 2 / (elementSize * 1.2 * animationConfig.spaceBetween));
    const stepX = boundsSize * 2 / numX;
    const stepY = boundsSize * 2 / numY;

    for (let i = 0; i < numX; i++) {
        for (let j = 0; j < numY; j++) {
            const element = createElementMesh(currentElementShape, elementSize);
            const xPos = -boundsSize + stepX / 2 + i * stepX;
            const yPos = -boundsSize + stepY / 2 + j * stepY;
            element.position.set(xPos, yPos, 0);

            element.userData.originalPosition = element.position.clone();
            element.userData.originalQuaternion = element.quaternion.clone();
            element.userData.originalScale = element.scale.clone();
            elementsGroup.add(element);
        }
    }
    resetControls(boundsSize*2.5);
}

function createCubeArrangement() {
    const halfBounds = boundsSize / 2;
    const elementsPerFace = Math.max(1, Math.floor(boundsSize / (elementSize * 1.1 * animationConfig.spaceBetween))); // Number of elements along one edge of a face
    const step = boundsSize / elementsPerFace;

    const faces = [
        { normal: new THREE.Vector3(0, 0, 1),  rotation: new THREE.Euler(0, 0, 0) }, // Front
        { normal: new THREE.Vector3(0, 0, -1), rotation: new THREE.Euler(0, Math.PI, 0) }, // Back
        { normal: new THREE.Vector3(1, 0, 0),  rotation: new THREE.Euler(0, Math.PI / 2, 0) }, // Right
        { normal: new THREE.Vector3(-1, 0, 0), rotation: new THREE.Euler(0, -Math.PI / 2, 0) }, // Left
        { normal: new THREE.Vector3(0, 1, 0),  rotation: new THREE.Euler(-Math.PI / 2, 0, 0) }, // Top
        { normal: new THREE.Vector3(0, -1, 0), rotation: new THREE.Euler(Math.PI / 2, 0, 0) }  // Bottom
    ];

    faces.forEach(face => {
        for (let i = 0; i < elementsPerFace; i++) {
            for (let j = 0; j < elementsPerFace; j++) {
                const element = createElementMesh(currentElementShape, elementSize);

                // Position on a canonical face (e.g., XY plane at Z=halfBounds)
                const u = -halfBounds + step / 2 + i * step; // x on canonical face
                const v = -halfBounds + step / 2 + j * step; // y on canonical face

                element.position.set(u, v, halfBounds);
                element.lookAt(u, v, halfBounds + 1); // Make sure it faces outwards initially if needed

                // Apply face rotation to orient the element correctly
                // Create a temporary object to handle the transformation
                const tempObject = new THREE.Object3D();
                tempObject.position.set(u, v, halfBounds); // Position on the front face
                tempObject.lookAt(face.normal.clone().multiplyScalar(halfBounds * 2)); // Look outwards

                // Create a matrix for the face's orientation
                const faceMatrix = new THREE.Matrix4();
                if (face.normal.x !== 0) faceMatrix.lookAt(new THREE.Vector3(), face.normal, new THREE.Vector3(0,1,0));
                else if (face.normal.y !== 0) faceMatrix.lookAt(new THREE.Vector3(), face.normal, new THREE.Vector3(0,0,1));
                else faceMatrix.lookAt(new THREE.Vector3(), face.normal, new THREE.Vector3(0,1,0));


                element.position.set(u, v, 0); // Position relative to its own center
                element.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, halfBounds)); // Move to surface
                element.applyMatrix4(faceMatrix); // Rotate to face orientation

                element.userData.originalPosition = element.position.clone();
                element.userData.originalQuaternion = element.quaternion.clone(); // Use quaternion for 3D
                element.userData.originalScale = element.scale.clone();
                elementsGroup.add(element);
            }
        }
    });
    resetControls(boundsSize*2.5)
}

function createSphereArrangement() {
    let numElements = 100; // Adjust for density
    let packingDensity = 0.5;
    const radius = boundsSize / 2;
    numElements = Math.PI * Math.pow(boundsSize / elementSize, 2) * packingDensity;
    numElements = Math.max(1, Math.round(numElements)); // Ensure at least 1 element and it's an integer
    

    // Using Fibonacci sphere (Golden Spiral) for more even distribution
    const phi = Math.PI * (3. - Math.sqrt(5.)); // Golden angle in radians

    for (let i = 0; i < numElements; i++) {
        const y = 1 - (i / (numElements - 1)) * 2;  // y goes from 1 to -1
        const r_proj = Math.sqrt(1 - y * y);         // radius at y

        const theta = phi * i;                       // golden angle increment

        const x = Math.cos(theta) * r_proj;
        const z = Math.sin(theta) * r_proj;

        const element = createElementMesh(currentElementShape, elementSize);
        element.position.set(x * radius, y * radius, z * radius);

        // Orient the element to be tangent to the sphere surface (facing outwards)
        element.lookAt(scene.position); // Look at the center of the scene (0,0,0)
        // To make it face outwards, you might need to rotate it 180 degrees around its local Y or Z
        // This depends on the default orientation of your element shapes.
        // E.g., if plane is in XY, lookAt(0,0,0) makes its -Z face center.
        // We want its +Z (or whatever is considered its "front") to face outward.
        // A common trick:
        const normal = element.position.clone().normalize();
        element.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), normal);


        element.userData.originalPosition = element.position.clone();
        element.userData.originalQuaternion = element.quaternion.clone();
        element.userData.originalScale = element.scale.clone();
        elementsGroup.add(element);
    }
    resetControls(boundsSize*2.5)
}

/**
 * @param {'plane'|'cube'|'sphere'} shape
 * @param {number} boundsSize   – your boundsSize (for plane it’s half-width; for cube & sphere it’s full edge length)
 * @param {number} percentage   – 0–100% of the domain; <100 uses an outer “shell”
 * @returns {THREE.Vector3}
 */
function samplePointInSpace(boundsSize, percentage = 100) {
    const p = THREE.MathUtils.clamp(percentage, 0, 100) / 100;
    
    // helper to sample 2D or 3D "shell" in [-half, +half]^n
    function randShellPoint(dimensions, half) {
      const inner = half * (1 - p);
      let coords;
  
      const draw = () =>
        Array.from({ length: dimensions },
          () => THREE.MathUtils.randFloatSpread(half * 2)
        );
  
      if (p === 1) {
        coords = draw();
      } else {
        do {
          coords = draw();
        } while (coords.every(c => Math.abs(c) < inner));
      }
  
      return coords;
    }
  
   
      if(baseShapeBool[0]){
        // plane: x,y ∈ [–boundsSize, +boundsSize], z=0
        const [x, y] = randShellPoint(2, boundsSize);
        return new THREE.Vector3(x, y, 0);
      }
  
      if(baseShapeBool[1]) {
        // cube half-extent = boundsSize/2
        const half = boundsSize / 2;
        const [x, y, z] = randShellPoint(3, half);
        return new THREE.Vector3(x, y, z);
      }
  
      if(baseShapeBool[2]){
        const R = boundsSize / 2;
      const c0 = Math.pow(1 - p, 3);
      const u = THREE.MathUtils.randFloat(c0, 1);
      const r = R * Math.cbrt(u);

      // -- inline random unit‐vector via spherical coords --
      const u1 = Math.random();
      const u2 = Math.random();
      const theta = 2 * Math.PI * u1;
      const phi   = Math.acos(2 * u2 - 1);
      const sinP  = Math.sin(phi);

      const x = r * sinP * Math.cos(theta);
      const y = r * sinP * Math.sin(theta);
      const z = r * Math.cos(phi);

      return new THREE.Vector3(x, y, z);
      }
    
    
  }
  
  
// --- Interaction & Animation ---
function onWindowResize() {
    width = window.innerWidth;
    height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);

}

function onPointerDown(event) {
    isDragging = true; // For potential drag-based interaction later, not strictly needed for click
    updatePointer(event);
    handleInteraction();
}

function onPointerMove(event) {
    // if (isDragging) { // If you want interaction only while dragging
    //     updatePointer(event);
    //     handleInteraction();
    // }
    // For hover-like interaction (continuous check) - can be performance intensive
    updatePointer(event);
    handleInteraction();
}

function onPointerUp(event) {
    if (!isDragging && event.button === 0) { // Only on left click release if not dragging
        updatePointer(event); // Already updated on pointerdown
        // handleInteraction(); // Called on pointerdown
    }
    isDragging = false;
}

function updatePointer(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function handleInteraction() {
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(elementsGroup.children, true); // true for recursive

    if (intersects.length > 0) {
        let intersectedElement = null;
        
        // Find the parent Group that is the element itself
        for (let i = 0; i < intersects.length; i++) {
            let obj = intersects[i].object;
            while (obj.parent && obj.parent !== elementsGroup) {
                obj = obj.parent;
            }
            if (obj.userData.isElement) {
                intersectedElement = obj;
                break;
            }
        }

        if (intersectedElement && !animatingObjects.has(intersectedElement)) {
            triggerElementAnimation(intersectedElement);
        }
    }
}
function triggerElementAnimation(element) {
    if (animatingObjects.has(element)) return;
    animatingObjects.add(element);
  
    const originalPosition = element.userData.originalPosition.clone();
    const originalQuaternion = element.userData.originalQuaternion.clone();
    const originalScale = element.userData.originalScale.clone();
    const mainMesh = element;
    const strokeMesh = element.children.find(child => child instanceof THREE.LineSegments);
  
    const originalColor = mainMesh.material.color.clone();
    if (strokeMesh) var originalStrokeColor = strokeMesh.material.color.clone();
  
    // --- Phase 1: Fly out, rotate, change color ---
    const flyOutDistance = boundsSize * animationConfig.flyOutDistanceMultiplier;
    const flyOutPosition = new THREE.Vector3()
      .copy(originalPosition)
      .normalize()
      .multiplyScalar(originalPosition.length() + flyOutDistance);
  
    new TWEEN.Tween(element.position)
      .to({ x: flyOutPosition.x, y: flyOutPosition.y, z: flyOutPosition.z }, animationConfig.flyOutDuration)
      .easing(TWEEN.Easing.Quadratic.Out)
      .start();
  
    const randomRotation = new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );
    const targetQuaternion = new THREE.Quaternion().setFromEuler(randomRotation);
    new TWEEN.Tween(element.quaternion)
      .to({
        x: targetQuaternion.x,
        y: targetQuaternion.y,
        z: targetQuaternion.z,
        w: targetQuaternion.w
      }, animationConfig.rotationDuration)
      .easing(TWEEN.Easing.Quadratic.Out)
      .start();
  
    const newColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
  
    new TWEEN.Tween(mainMesh.material.color)
      .to({ r: newColor.r, g: newColor.g, b: newColor.b }, animationConfig.colorDuration)
      .easing(TWEEN.Easing.Quadratic.Out)
      .start();
  
    new TWEEN.Tween(mainMesh.material)
      .to({ opacity: baseOpacity * animationConfig.opacityTargetMultiplier }, animationConfig.colorDuration)
      .easing(TWEEN.Easing.Quadratic.Out)
      .start();
  
    if (strokeMesh) {
      new TWEEN.Tween(strokeMesh.material.color)
        .to({ r: newColor.r, g: newColor.g, b: newColor.b }, animationConfig.colorDuration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
  
      new TWEEN.Tween(strokeMesh.material)
        .to({ opacity: outlineOpacity * animationConfig.opacityTargetMultiplier }, animationConfig.colorDuration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    }
  
    // --- Phase 2: Return to original state ---
    if(animationConfig.randomSampling == 1){
        setTimeout(() => {
            const pn = samplePointInSpace(boundsSize,95);
            
            new TWEEN.Tween(element.position)
                .to({
                x: pn.x,
                y: pn.y,
                z: pn.z
                }, animationConfig.returnPositionDuration)
                .easing(TWEEN.Easing.Bounce.Out)
                .start();
        
            new TWEEN.Tween(element.quaternion)
                .to({
                x: originalQuaternion.x,
                y: originalQuaternion.y,
                z: originalQuaternion.z,
                w: originalQuaternion.w
                }, animationConfig.returnRotationDuration)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .start();
            
          new TWEEN.Tween(mainMesh.material.color)
            // .to({
            //   r: originalColor.r,
            //   g: originalColor.g,
            //   b: originalColor.b
            // }, animationConfig.colorDuration)
            // .easing(TWEEN.Easing.Quadratic.InOut)
            .onComplete(() => {
              animatingObjects.delete(element);
            })
            .start();
      
          if (strokeMesh) {
            new TWEEN.Tween(strokeMesh.material.color)
              .to({
                r: originalStrokeColor.r,
                g: originalStrokeColor.g,
                b: originalStrokeColor.b
              }, animationConfig.colorDuration)
              .easing(TWEEN.Easing.Quadratic.InOut)
              .start();
          } else {
            animatingObjects.delete(element);
          }
      
          // optional: reset opacity to original
          new TWEEN.Tween(mainMesh.material)
            //.to({ opacity: baseOpacity }, animationConfig.colorDuration)
            //.easing(TWEEN.Easing.Quadratic.InOut)
            .start();
      
          if (strokeMesh) {
            new TWEEN.Tween(strokeMesh.material)
              //.to({ opacity: outlineOpacity }, animationConfig.colorDuration)
              //.easing(TWEEN.Easing.Quadratic.InOut)
              .start();
          }
      
        }, animationConfig.returnDelay);
    }else{
        setTimeout(() => {
            
        new TWEEN.Tween(element.position)
            .to({
            x: originalPosition.x,
            y: originalPosition.y,
            z: originalPosition.z
            }, animationConfig.returnPositionDuration)
            .easing(TWEEN.Easing.Bounce.Out)
            .start();
    
        new TWEEN.Tween(element.quaternion)
            .to({
            x: originalQuaternion.x,
            y: originalQuaternion.y,
            z: originalQuaternion.z,
            w: originalQuaternion.w
            }, animationConfig.returnRotationDuration)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .start();
        
      new TWEEN.Tween(mainMesh.material.color)
        // .to({
        //   r: originalColor.r,
        //   g: originalColor.g,
        //   b: originalColor.b
        // }, animationConfig.colorDuration)
        // .easing(TWEEN.Easing.Quadratic.InOut)
        .onComplete(() => {
          animatingObjects.delete(element);
        })
        .start();
  
      if (strokeMesh) {
        new TWEEN.Tween(strokeMesh.material.color)
          .to({
            r: originalStrokeColor.r,
            g: originalStrokeColor.g,
            b: originalStrokeColor.b
          }, animationConfig.colorDuration)
          .easing(TWEEN.Easing.Quadratic.InOut)
          .start();
      } else {
        animatingObjects.delete(element);
      }
  
      // optional: reset opacity to original
      new TWEEN.Tween(mainMesh.material)
        //.to({ opacity: baseOpacity }, animationConfig.colorDuration)
        //.easing(TWEEN.Easing.Quadratic.InOut)
        .start();
  
      if (strokeMesh) {
        new TWEEN.Tween(strokeMesh.material)
          //.to({ opacity: outlineOpacity }, animationConfig.colorDuration)
          //.easing(TWEEN.Easing.Quadratic.InOut)
          .start();
      }
  
    }, animationConfig.returnDelay);
    }
  }
  

function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();
   
        //console.log(shouldMoveCam)
        controls.update(); // Only required if controls.enableDamping or controls.autoRotate are set to true
    

    //globalPass.uniforms.time.value = performance.now() * 0.001;
    //composer.render();
    renderer.render(scene, camera);
}

// Ensure TWEEN is available globally if not using modules, or import it.
// Same for OrbitControls.