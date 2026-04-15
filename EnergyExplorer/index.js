import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FirstPersonControls } from 'three/examples/jsm/controls/FirstPersonControls.js';
function isMobile() {
    //return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
    return true;
  }
  // voxel grid parameters
  let spaceConfig = {
    voxelDim: 35,
    voxelSize: 1,
    voxelCount:0,
    voxels: null,
    voxelMeshes: null,
    minOpacity: 0.1,  // Minimum opacity for visible voxels
    maxOpacity: 0.9   // Maximum opacity for dense voxels

  };

// replace your old initVoxelGrid() with this:
// Modified voxel grid setup for normal meshes
function initVoxelGrid() {
  const S = globalConfig.SimulationBounds;
  const D = spaceConfig.voxelDim;

  // 1. compute grid parameters
  spaceConfig.voxelSize = (S * 2) / D;
  spaceConfig.voxelCount = D ** 3;
  console.log("voxel count ", spaceConfig.voxelCount);
  console.log("voxel size ", spaceConfig.voxelSize);

  // 2. if we already added meshes, remove & dispose them
  if (spaceConfig.voxelMeshes) {
      spaceConfig.voxelMeshes.forEach(mesh => {
          scene.remove(mesh);
          mesh.geometry.dispose();
          mesh.material.dispose();
      });
  }

  // 3. Create array to hold all voxel meshes
  spaceConfig.voxelMeshes = [];
  spaceConfig.voxels = new Array(spaceConfig.voxelCount).fill().map(() => [1, 1, 1, 0]);

  // 4. Create geometry once and reuse it
  const geo = new THREE.BoxGeometry(
      spaceConfig.voxelSize * 0.95, // Make slightly smaller to see gaps
      spaceConfig.voxelSize * 0.95,
      spaceConfig.voxelSize * 0.95
  );

  // 5. Create a mesh for each voxel
  for (let idx = 0; idx < spaceConfig.voxelCount; idx++) {
      // convert flat idx → i,j,k
      const i = idx % D;
      const j = Math.floor((idx / D) % D);
      const k = Math.floor(idx / (D * D));
      
      // Create material for this voxel (transparent initially)
      const mat = new THREE.MeshBasicMaterial({ 
          color: 0xffffff,
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide
      });

      // Create mesh
      const mesh = new THREE.Mesh(geo, mat);
      
      // Position at voxel center
      mesh.position.set(
          i * spaceConfig.voxelSize - S + spaceConfig.voxelSize * 0.5,
          j * spaceConfig.voxelSize - S + spaceConfig.voxelSize * 0.5,
          k * spaceConfig.voxelSize - S + spaceConfig.voxelSize * 0.5
      );

      // Add to scene and store reference
      scene.add(mesh);
      spaceConfig.voxelMeshes.push(mesh);

  }
  
  console.log("Created", spaceConfig.voxelMeshes.length, "voxel meshes");
}


function getVoxelIndex(x, y, z) {
  const S = globalConfig.SimulationBounds;
  // normalize [−S…+S] → [0…voxelDim−1]
  const ix = Math.floor((x + S) / (2 * S) * spaceConfig.voxelDim);
  const iy = Math.floor((y + S) / (2 * S) * spaceConfig.voxelDim);
  const iz = Math.floor((z + S) / (2 * S) * spaceConfig.voxelDim);
  // clamp in case particles stray just outside
  const cx = THREE.MathUtils.clamp(ix, 0, spaceConfig.voxelDim - 1);
  const cy = THREE.MathUtils.clamp(iy, 0, spaceConfig.voxelDim - 1);
  const cz = THREE.MathUtils.clamp(iz, 0, spaceConfig.voxelDim - 1);
  return cx + cy * spaceConfig.voxelDim + cz * spaceConfig.voxelDim * spaceConfig.voxelDim;
}

// === PARAMETERS (mirrors PartInfo) ===
let groups = [
    {
      amount: 400,
      color: 0xff4444, // red
      rgbColor: hexToRgb(0xff4444),
      particleRadius:1,
      // How group 0 (red) is affected by [red, green, blue]:
      interactWeights: [ 50, -20,  60 ], // [red, green, blue]
      interactRadii:   [ 100, 300, 200 ],
    },
    {
      amount: 550,
      color: 0x44ff44, // green
      rgbColor: hexToRgb(0x44ff44),
      particleRadius:1,

      // How group 1 (green) is affected by [red, green, blue]:
      interactWeights: [ -30, 90, -50 ],
      interactRadii:   [ 300, 150, 350 ],
    },
    {
      amount: 500,
      color: 0x4444ff, // blue
      rgbColor: hexToRgb(0x4444ff),
      particleRadius:1,

      // How group 2 (blue) is affected by [red, green, blue]:
      interactWeights: [ 80, -10, 40 ],
      interactRadii:   [ 200, 350, 180 ],
    },
  ];
  let globalConfig = {
    SimulationBounds: 1200,
    velocityScale: [0.9,0.9,0.9],
    interactionScaling: 300,
    baseParticleSize:1,

  }
  function hexToRgb(hex) {
    return [
      (hex >> 16) & 0xff,
      (hex >> 8) & 0xff,
       hex & 0xff
    ];
  }
  
  window.addEventListener('mousedown', (e) => {
    // Only left button
    if (e.button === 0) controls.activeLook = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) controls.activeLook = false;
  });
  window.addEventListener('mouseleave', () => {
    controls.activeLook = false;
  });
// === GLOBALS ===
let scene, camera, renderer, composer;
let controls, raycaster, pointer;
let positions = [], velocities = [];
let width, height;
// === INIT THREE ===
// === INIT THREE ===
function initThree() {
  const container = document.getElementById('vis');

  // Scene & Background
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Camera
  camera = new THREE.PerspectiveCamera(60, width / height, 1, 30000);
  camera.position.set(0, 0, globalConfig.SimulationBounds * 2);

  // Renderer & Composer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // Raycaster & Pointer
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // MOBILE VS DESKTOP CONTROLS
  if (isMobile()) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.target.set(0, 0, 0);
  } else {
      controls = new FirstPersonControls(camera, renderer.domElement);
      controls.movementSpeed = 140;
      controls.lookSpeed = 0.3;
      controls.lookVertical = true;
      controls.activeLook = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = false;
  }

  // Handle resize
  window.addEventListener('resize', onWindowResize, false);
  
  // Mouse event handlers for FirstPersonControls
  window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && controls.activeLook !== undefined) controls.activeLook = true;
  });
  window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && controls.activeLook !== undefined) controls.activeLook = false;
  });
  window.addEventListener('mouseleave', () => {
      if (controls.activeLook !== undefined) controls.activeLook = false;
  });
}

// === INIT INSTANCED MESHES ===
function initInstances() {

  groups.forEach((grp, gi) => {
  

    // data buffers
    const posArr = new Float32Array(grp.amount * 3);
    const velArr = new Float32Array(grp.amount * 3);
    for (let i = 0; i < grp.amount; i++) {
      posArr[3*i  ] = (Math.random() - 0.5) * 1000;
      posArr[3*i+1] = (Math.random() - 0.5) * 1000;
      posArr[3*i+2] = (Math.random() - 0.5) * 1000;
      velArr[3*i  ] = velArr[3*i+1] = velArr[3*i+2] = 0;
    }
    positions.push(posArr);
    velocities.push(velArr);
  });
}

// Helper to convert hex color to string (e.g., 0xff4444 -> "#ff4444")
function hexToHtmlColor(hex) {

    return "#" + (hex & 0xffffff).toString(16).padStart(6, "0");
}
// Helper to convert "#ff4444" to 0xff4444
function htmlColorToHexNumber(hexStr) {
    return 0xFFFFFF & parseInt(hexStr.replace("#", ""), 16);
}

// Helper to convert html color string (e.g., "#ff4444") to hex number
function htmlColorToHex(str) {
    return parseInt(str.replace("#", ""), 16);
}
function randHex(){
    return "#" + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, "0");
}
function hexStringToRgb(hexStr) {
    // Remove "#" if present and convert to integer
    const hex = parseInt(hexStr.replace("#", ""), 16);
    return [
        (hex >> 16) & 0xff, // Red
        (hex >> 8) & 0xff,  // Green
        hex & 0xff          // Blue
    ];
}

function randArray(min,max, num)
{
    let tempArr = [];
    for (let i = 0; i < num; i++) {
        tempArr.push(THREE.MathUtils.randFloat(min,max));
    }
    return tempArr;
}
// --- EXPORT FUNCTION ---
function exportParticleConfig() {
    const data = {
        groups: groups,
        globalConfig: globalConfig
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // Create a temporary link to download
    const link = document.createElement("a");
    link.href = url;
    link.download = "particle_config.json";
    document.body.appendChild(link);
    link.click();

    // Clean up
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

// --- IMPORT FUNCTION ---
// Accepts either JSON string or JS object.
function importParticleConfig(input) {
    let data;
    if (typeof input === "string") {
        try {
            data = JSON.parse(input);
        } catch (err) {
            alert("Invalid JSON: " + err.message);
            return;
        }
    } else {
        data = input;
    }

    if (!data.groups || !Array.isArray(data.groups)) {
        alert("Invalid format: missing or invalid 'groups' array.");
        return;
    }
    if (!data.globalConfig || typeof data.globalConfig !== "object") {
        alert("Invalid format: missing 'globalConfig'.");
        return;
    }
    // Set and re-init
    groups = data.groups.map(group => {
    // Clone the group to avoid mutating the original
    const newGroup = { ...group };

    // Ensure `rgbColor` exists by converting from `color`
    if (!newGroup.rgbColor && newGroup.color !== undefined) {
        newGroup.rgbColor = hexToRgb(newGroup.color);
    }    

    // You can add more fallback checks here as needed
    return newGroup;
});

    globalConfig = data.globalConfig;

    // Refresh everything
    createParticleConfigUI();
    onParticleConfigChanged();
}
window.exportParticleConfig = exportParticleConfig;
function appendParticleGroup()
{
    //add new particle
    const rh = randHex();
    groups.push({
        amount: Math.floor(THREE.MathUtils.randFloat(100,400)),
        color: htmlColorToHexNumber(rh), 
        rgbColor: hexStringToRgb(rh),
        particleRadius:2,
        // How group 0 (red) is affected by [red, green, blue]:
        interactWeights: randArray(-200,200,groups.length+1), // [red, green, blue]
        interactRadii:   randArray(50,1000,groups.length+1),
      });
    //add interacitons for new particle getting added
    groups.forEach(function(element, index) {
        element.interactWeights.push(THREE.MathUtils.randFloat(-200,200));
        element.interactRadii.push(THREE.MathUtils.randFloat(50,800));
    });
    
      createParticleConfigUI();
      onParticleConfigChanged();
}
function createImportExportUI()
{
    const container = document.getElementById("configParticle");
    const innetT = `<div style="margin-bottom: 10px;"><button onclick="exportParticleConfig()">Export Config</button>
  <input type="file" id="importFileInput" style="display:none;" />
  <button onclick="document.getElementById('importFileInput').click()">Import Config</button></div>`;
  container.innerHTML = innetT;
  document.getElementById('importFileInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        importParticleConfig(event.target.result);
    };
    reader.readAsText(file);
    // reset input so user can select same file again if needed
    e.target.value = '';
});
}
// Call this function after DOMContentLoaded and after your groups array is defined
function createParticleConfigUI() {
    const container = document.getElementById("configParticle");
    container.innerHTML = ""; // Clear old UI
  createImportExportUI();
    createGlobalConfigUI();


    groups.forEach((group, gi) => {
        const groupDiv = document.createElement("div");
        groupDiv.style = "margin-bottom:14px; padding:10px; background:#222; border-radius:8px;";

        // Group label
        const title = document.createElement("div");
        title.innerHTML = `<b>Group ${gi + 1}</b>`;
        groupDiv.appendChild(title);

        // Amount input
        groupDiv.appendChild(makeInputRow("Amount", "number", group.amount, (val) => {
            groups[gi].amount = Number(val);
            onParticleConfigChanged();
        }));
        // Color input
        groupDiv.appendChild(makeInputRow("Color", "color", hexToHtmlColor(group.color), (val) => {
            groups[gi].color = htmlColorToHex(val);
            groups[gi].rgbColor = hexToRgb(groups[gi].color)
            onParticleConfigChanged();
        }));

        // Interact Weights (array)
        groupDiv.appendChild(arrayInputRow("Interact Weights", group.interactWeights, (idx, val) => {
            groups[gi].interactWeights[idx] = Number(val);
            onParticleConfigChanged();
        }));

        // Interact Radii (array)
        groupDiv.appendChild(arrayInputRow("Interact Radii", group.interactRadii, (idx, val) => {
            groups[gi].interactRadii[idx] = Number(val);
            onParticleConfigChanged();
        }));

        container.appendChild(groupDiv);
    });

    // === Add Particle Group Button ===
    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.title = "Add Particle Group";
    addBtn.style = "font-size:1.5em; border-radius:50%; width:40px; height:40px; margin-top:8px; background:#333; color:white; border:none; cursor:pointer;";
    addBtn.onclick = appendParticleGroup;
    // Button label (optional, for accessibility)
    const label = document.createElement("span");
    label.textContent = " Add Particle Group";
    label.style = "margin-left:8px; font-size:1em;";
    const wrapper = document.createElement("div");
    wrapper.style = "display:flex; align-items:center; gap:5px; margin-bottom:10px;";
    wrapper.appendChild(addBtn);
    wrapper.appendChild(label);

    container.appendChild(wrapper);
}
function createGlobalConfigUI() {
    const config = globalConfig; // for easy reference
    const container = document.getElementById("configParticle");
    //container.innerHTML = ""; // Clear old UI
  
    // Helper: create a labeled row with input
    function makeInputRow(label, type, value, onChange, extraAttrs={}) {
      const row = document.createElement("div");
      row.style = "margin-bottom:8px; display:flex; align-items:center;";
      const lab = document.createElement("label");
      lab.textContent = label;
      lab.style = "flex:1; margin-right:8px;";
      row.appendChild(lab);
  
      const input = document.createElement("input");
      input.type = type;
      if (type === "number") input.step = "any";
      input.value = value;
      Object.entries(extraAttrs).forEach(([k,v]) => input.setAttribute(k, v));
      input.oninput = (e) => onChange(e.target.value);
      row.appendChild(input);
      return row;
    }
  
    // SimulationBounds
    container.appendChild(makeInputRow(
      "Simulation Bounds",
      "number",
      config.SimulationBounds,
      (val) => {
        config.SimulationBounds = Number(val);
        onParticleConfigChanged();
      }
    ));
  
    // velocityScale (array input)
    function makeVectorInputRow(label, arr, onChange) {
      const row = document.createElement("div");
      row.style = "margin-bottom:8px; display:flex; align-items:center;";
      const lab = document.createElement("label");
      lab.textContent = label;
      lab.style = "flex:1; margin-right:8px;";
      row.appendChild(lab);
  
      arr.forEach((val, idx) => {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = val;
        input.style = "width:60px; margin-right:6px;";
        input.oninput = (e) => {
          arr[idx] = Number(e.target.value);
          onParticleConfigChanged();
        };
        row.appendChild(input);
      });
      return row;
    }
  
    // container.appendChild(makeVectorInputRow(
    //   "Velocity Scale",
    //   config.velocityScale,
    //   onParticleConfigChanged
    // ));
  
    // interactionScaling
    container.appendChild(makeInputRow(
      "Interaction Scale",
      "number",
      config.interactionScaling,
      (val) => {
        config.interactionScaling = Number(val);
        onParticleConfigChanged();
      }
    ));
    container.appendChild(makeInputRow(
        "Voxel Division",
        "number",
        spaceConfig.voxelDim,
        (val) => {
          spaceConfig.voxelDim = Number(val);
          onParticleConfigChanged();
        }
      ));
  }
  

// Helper: single input row
function makeInputRow(label, type, value, onChange) {
    const row = document.createElement("div");
    row.style = "margin:6px 0;";
    const input = document.createElement("input");
    input.type = type;
    input.value = value;
    if(type === "number") {
        input.style = "width:60px;margin-left:8px";
        input.step = "any";
    } else if (type === "color") {
        input.style = "margin-left:8px";
    }
    input.oninput = (e) => onChange(e.target.value);

    row.innerHTML = `<span>${label}:</span>`;
    row.appendChild(input);
    return row;
}

// Helper: array row for interactWeights/interactRadii
function arrayInputRow(label, arr, onChange) {
    const row = document.createElement("div");
    row.style = "margin:6px 0;";
    const title = document.createElement("span");
    title.textContent = `${label}: `;
    row.appendChild(title);

    arr.forEach((val, idx) => {
        const input = document.createElement("input");
        input.type = "number";
        input.value = val;
        input.style = "width:45px; margin-left:6px";
        input.step = "any";
        input.oninput = (e) => onChange(idx, e.target.value);
        row.appendChild(input);
    });
    return row;
}
function showConfig() {
  const container = document.getElementById("configParticle");

  if (container.classList.contains("visible")) {
    // fade out
    container.style.opacity = "0";
    container.addEventListener('transitionend', function handler() {
      container.style.display = 'none';
      container.classList.remove("visible");
      container.removeEventListener('transitionend', handler);
    });
  } else {
    // fade in
    container.style.display = 'block';
    requestAnimationFrame(() => {
      container.classList.add("visible");
      container.style.opacity = "1";
    });
  }
}

window.showConfig = showConfig;
// Main universal config changed handler
function onParticleConfigChanged() {
    // 1. Delete old scene stuff
    deleteScene();
    // 3. Re-create instances with new group settings
    initThree();
    initInstances();
    initVoxelGrid();
    // If you need to update lighting, colors, camera, etc, add here.
}

// Your existing deleteScene() implementation (just make sure this exists!)
function deleteScene() {
    // Remove all meshes from scene
    spaceConfig.voxelMeshes.forEach(mesh => {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        //scene.remove(mesh);
    });
    spaceConfig.voxelMeshes = null;
    positions = [];
    velocities = [];
    spaceConfig.voxelSize = 1;
    spaceConfig.voxelCount = 0;
    spaceConfig.voxels= null;
}

// Call after page loads, and anytime you want to re-render the UI
document.addEventListener("DOMContentLoaded", createParticleConfigUI);

// === RESIZE HANDLER ===
function onWindowResize() {
  const container = document.getElementById('vis');
   width = container.clientWidth;
   height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
    if(renderer && composer){
        renderer.setSize(width, height);
        composer.setSize(width, height);
    }
    initThree();
    onParticleConfigChanged();
}
function updateVoxel(voxel, newColor) {

  const [r, g, b, count] = voxel;
  const newCount = count + 1;

  // Compute running average
  voxel[0] = (r * count + newColor[0]) / newCount;
  voxel[1] = (g * count + newColor[1]) / newCount;
  voxel[2] = (b * count + newColor[2]) / newCount;
  voxel[3] = newCount;
  return voxel;
  
}

let lastTime = performance.now();
// === ANIMATION LOOP ===
// Update voxel color directly in animate()
function animate() {
  requestAnimationFrame(animate);
  if (!spaceConfig.voxels || !spaceConfig.voxelMeshes) return; // Guard early
  const now = performance.now();
  const delta = (now - lastTime) / 1000; // in seconds
  lastTime = now;

  // Reset voxel grid
  spaceConfig.voxels = new Array(spaceConfig.voxelCount).fill().map(() => [1, 1, 1, 0]);

  controls.update(delta);

  groups.forEach((grpA, giA) => {
      const posA = positions[giA];
      const velA = velocities[giA];
      const nA = grpA.amount;
      for (let i = 0; i < nA; i++) {
          let fx = 0, fy = 0, fz = 0;
          const ixA = 3 * i, iyA = ixA + 1, izA = ixA + 2;
          const x1 = posA[ixA], y1 = posA[iyA], z1 = posA[izA];

          // Loop through ALL groups to calculate the force from every other group
          groups.forEach((grpB, giB) => {
              const posB = positions[giB];
              const nB = grpB.amount;
              const G = grpA.interactWeights[giB] / globalConfig.interactionScaling;
              const R2 = grpA.interactRadii[giB] * grpA.interactRadii[giB];

              for (let j = 0; j < nB; j++) {
                  if (giA === giB && i === j) continue; // don't self-interact

                  const ixB = 3 * j, iyB = ixB + 1, izB = ixB + 2;
                  const dx = x1 - posB[ixB];
                  const dy = y1 - posB[iyB];
                  const dz = z1 - posB[izB];
                  const d2 = dx * dx + dy * dy + dz * dz;

                  if (d2 > 0 && d2 < R2) {
                      const inv = 1 / Math.sqrt(d2);
                      fx += dx * inv * G;
                      fy += dy * inv * G;
                      fz += dz * inv * G;
                  }
              }
          });

          velA[ixA] = (velA[ixA] + fx) * globalConfig.velocityScale[0];
          velA[iyA] = (velA[iyA] + fy) * globalConfig.velocityScale[1];
          velA[izA] = (velA[izA] + fz) * globalConfig.velocityScale[2];
      }

      const color = grpA.rgbColor;
      // Update positions & voxel colors
      for (let i = 0; i < nA; i++) {
          const ixA = 3 * i, iyA = ixA + 1, izA = ixA + 2;
          const idx = getVoxelIndex(posA[ixA], posA[iyA], posA[izA]);
          spaceConfig.voxels[idx] = updateVoxel(spaceConfig.voxels[idx], color);

          posA[ixA] += velA[ixA];
          posA[iyA] += velA[iyA];
          posA[izA] += velA[izA];

          // bounding
          for (let k = 0; k < 3; k++) {
              if (posA[3 * i + k] < -globalConfig.SimulationBounds || posA[3 * i + k] > globalConfig.SimulationBounds) {
                  velA[3 * i + k] *= -1;
              }
          }
      }
  });

  // Update voxel colors and transparency
  const voxelMeshes = spaceConfig.voxelMeshes;
  if (voxelMeshes) {
      // Find max particle count for normalization
      let maxCount = 1;
      for (let idx = 0; idx < spaceConfig.voxelCount; idx++) {
          const count = spaceConfig.voxels[idx][3];
          if (count > maxCount) maxCount = count;
      }

      for (let idx = 0; idx < spaceConfig.voxelCount; idx++) {
          const [r, g, b, count] = spaceConfig.voxels[idx];
          const mesh = voxelMeshes[idx];

          if (count > 0) {
              // Calculate opacity based on particle density
              const normalizedCount = count / maxCount;
              const opacity = spaceConfig.minOpacity + 
                             (spaceConfig.maxOpacity - spaceConfig.minOpacity) * normalizedCount;

              // Set color and opacity
              mesh.material.color.setRGB(r / 255, g / 255, b / 255);
              mesh.material.opacity = opacity;
              mesh.visible = true;
          } else {
              // Hide empty voxels
              mesh.visible = false;
          }
      }
  }

  renderer.render(scene, camera);
}

document.addEventListener("DOMContentLoaded", function () {
    width = window.innerWidth;
    height = window.innerHeight;
// === INIT ===
    initThree();
    initInstances();
    initVoxelGrid();
    animate();
});
// OPTIONAL: navigation helper
function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;