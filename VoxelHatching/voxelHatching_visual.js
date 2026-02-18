import { registerVisual } from "../helper/visualHelp.js";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";

function clampNum(value, fallback = 0) {
  //const n = Number(value);
  //return Number.isFinite(n) ? n : fallback;
  return value;
}

function clampInt(value, fallback, min, max) {
  //const n = Math.floor(clampNum(value, fallback));
  //return Math.max(min, Math.min(max, n));
  return value;
}

function clamp01(value, fallback = 0) {
  //const n = clampNum(value, fallback);
  //return Math.max(0, Math.min(1, n));
  return value;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function keyFor(x, y, z) {
  return `${x},${y},${z}`;
}

function parseKey(key) {
  const [x, y, z] = key.split(",").map(Number);
  return { x, y, z };
}

const NEIGHBOR_OFFSETS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function neighborCount(set, x, y, z) {
  let count = 0;
  for (let i = 0; i < NEIGHBOR_OFFSETS.length; i += 1) {
    const [dx, dy, dz] = NEIGHBOR_OFFSETS[i];
    if (set.has(keyFor(x + dx, y + dy, z + dz))) count += 1;
  }
  return count;
}

function forEachVoxel(set, fn) {
  for (const key of set) {
    const { x, y, z } = parseKey(key);
    fn(x, y, z);
  }
}

function addBox(set, bounds, cx, cy, cz, sx, sy, sz, colorMap, colorValue) {
  const minX = Math.floor(cx - sx / 2);
  const maxX = Math.floor(cx + sx / 2);
  const minY = Math.floor(cy - sy / 2);
  const maxY = Math.floor(cy + sy / 2);
  const minZ = Math.floor(cz - sz / 2);
  const maxZ = Math.floor(cz + sz / 2);

  for (let x = minX; x <= maxX; x += 1) {
    if (x < bounds.min || x > bounds.max) continue;
    for (let y = minY; y <= maxY; y += 1) {
      if (y < bounds.min || y > bounds.max) continue;
      for (let z = minZ; z <= maxZ; z += 1) {
        if (z < bounds.min || z > bounds.max) continue;
        const key = keyFor(x, y, z);
        set.add(key);
        if (colorMap && colorValue) colorMap.set(key, colorValue);
      }
    }
  }
}

function addCylinder(set, bounds, cx, baseY, cz, radius, height, colorMap, colorValue) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.floor(cx + radius);
  const minZ = Math.floor(cz - radius);
  const maxZ = Math.floor(cz + radius);
  const maxY = Math.floor(baseY + height);
  const r2 = radius * radius;

  for (let x = minX; x <= maxX; x += 1) {
    if (x < bounds.min || x > bounds.max) continue;
    for (let z = minZ; z <= maxZ; z += 1) {
      if (z < bounds.min || z > bounds.max) continue;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz > r2) continue;
      for (let y = baseY; y <= maxY; y += 1) {
        if (y < bounds.min || y > bounds.max) continue;
        const key = keyFor(x, y, z);
        set.add(key);
        if (colorMap && colorValue) colorMap.set(key, colorValue);
      }
    }
  }
}

function addPyramid(set, bounds, cx, baseY, cz, baseSize, height, colorMap, colorValue) {
  const halfBase = baseSize / 2;
  const minY = Math.floor(baseY);
  const maxY = Math.floor(baseY + height);

  for (let y = minY; y <= maxY; y += 1) {
    if (y < bounds.min || y > bounds.max) continue;
    const t = height <= 0 ? 0 : (y - baseY) / height;
    const layerSize = Math.max(1, Math.floor(baseSize * (1 - t)));
    const half = layerSize / 2;
    const minX = Math.floor(cx - half);
    const maxX = Math.floor(cx + half);
    const minZ = Math.floor(cz - half);
    const maxZ = Math.floor(cz + half);
    for (let x = minX; x <= maxX; x += 1) {
      if (x < bounds.min || x > bounds.max) continue;
      for (let z = minZ; z <= maxZ; z += 1) {
        if (z < bounds.min || z > bounds.max) continue;
        const key = keyFor(x, y, z);
        set.add(key);
        if (colorMap && colorValue) colorMap.set(key, colorValue);
      }
    }
  }
}

function getBoxBounds(cx, cy, cz, sx, sy, sz) {
  const minX = Math.floor(cx - sx / 2);
  const maxX = Math.floor(cx + sx / 2);
  const minY = Math.floor(cy - sy / 2);
  const maxY = Math.floor(cy + sy / 2);
  const minZ = Math.floor(cz - sz / 2);
  const maxZ = Math.floor(cz + sz / 2);
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function getPyramidBounds(cx, baseY, cz, baseSize, height) {
  const half = baseSize / 2;
  return {
    minX: Math.floor(cx - half),
    maxX: Math.floor(cx + half),
    minY: Math.floor(baseY),
    maxY: Math.floor(baseY + height),
    minZ: Math.floor(cz - half),
    maxZ: Math.floor(cz + half),
  };
}

function getCylinderBounds(cx, baseY, cz, radius, height) {
  return {
    minX: Math.floor(cx - radius),
    maxX: Math.floor(cx + radius),
    minY: Math.floor(baseY),
    maxY: Math.floor(baseY + height),
    minZ: Math.floor(cz - radius),
    maxZ: Math.floor(cz + radius),
  };
}

function boundsIntersect(a, b, padding = 0) {
  return !(
    a.maxX + padding < b.minX ||
    a.minX - padding > b.maxX ||
    a.maxY + padding < b.minY ||
    a.minY - padding > b.maxY ||
    a.maxZ + padding < b.minZ ||
    a.minZ - padding > b.maxZ
  );
}

function canPlaceBox(set, bounds, cx, cy, cz, sx, sy, sz) {
  const minX = Math.floor(cx - sx / 2);
  const maxX = Math.floor(cx + sx / 2);
  const minY = Math.floor(cy - sy / 2);
  const maxY = Math.floor(cy + sy / 2);
  const minZ = Math.floor(cz - sz / 2);
  const maxZ = Math.floor(cz + sz / 2);

  for (let x = minX; x <= maxX; x += 1) {
    if (x < bounds.min || x > bounds.max) continue;
    for (let y = minY; y <= maxY; y += 1) {
      if (y < bounds.min || y > bounds.max) continue;
      for (let z = minZ; z <= maxZ; z += 1) {
        if (z < bounds.min || z > bounds.max) continue;
        if (set.has(keyFor(x, y, z))) return false;
      }
    }
  }
  return true;
}

function canPlaceCylinder(set, bounds, cx, baseY, cz, radius, height) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.floor(cx + radius);
  const minZ = Math.floor(cz - radius);
  const maxZ = Math.floor(cz + radius);
  const maxY = Math.floor(baseY + height);
  const r2 = radius * radius;

  for (let x = minX; x <= maxX; x += 1) {
    if (x < bounds.min || x > bounds.max) continue;
    for (let z = minZ; z <= maxZ; z += 1) {
      if (z < bounds.min || z > bounds.max) continue;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz > r2) continue;
      for (let y = baseY; y <= maxY; y += 1) {
        if (y < bounds.min || y > bounds.max) continue;
        if (set.has(keyFor(x, y, z))) return false;
      }
    }
  }
  return true;
}

function sliceByHeight(set, bounds, ratio, colorMap) {
  const r = clamp01(ratio, 1);
  const minY = bounds.min;
  const maxY = bounds.max;
  const cutoff = Math.floor(minY + (maxY - minY) * r);
  const next = new Set();
  const nextColors = colorMap ? new Map() : null;
  forEachVoxel(set, (x, y, z) => {
    if (y <= cutoff) {
      const key = keyFor(x, y, z);
      next.add(key);
      if (nextColors && colorMap) {
        const colorValue = colorMap.get(key);
        if (colorValue) nextColors.set(key, colorValue);
      }
    }
  });
  return { set: next, colorMap: nextColors };
}

function erode(set, bounds, steps, minNeighbors, colorMap) {
  let current = set;
  let currentColors = colorMap || null;
  const iterations = steps;
  const minN = minNeighbors;

  for (let s = 0; s < iterations; s += 1) {
    const next = new Set();
    const nextColors = currentColors ? new Map() : null;
    forEachVoxel(current, (x, y, z) => {
      if (x <= bounds.min || x >= bounds.max) return;
      if (y <= bounds.min || y >= bounds.max) return;
      if (z <= bounds.min || z >= bounds.max) return;
      const n = neighborCount(current, x, y, z);
      if (n >= minN) {
        const key = keyFor(x, y, z);
        next.add(key);
        if (nextColors && currentColors) {
          const colorValue = currentColors.get(key);
          if (colorValue) nextColors.set(key, colorValue);
        }
      }
    });
    current = next;
    currentColors = nextColors;
  }

  return { set: current, colorMap: currentColors };
}

function dilate(set, bounds, steps, minNeighbors, colorMap) {
  let current = set;
  let currentColors = colorMap || null;
  const iterations = steps;
  const minN = minNeighbors;

  for (let s = 0; s < iterations; s += 1) {
    const next = new Set(current);
    const nextColors = currentColors ? new Map(currentColors) : null;
    const candidates = new Map();
    const candidateColors = currentColors ? new Map() : null;

    forEachVoxel(current, (x, y, z) => {
      const sourceKey = keyFor(x, y, z);
      const sourceColor = currentColors ? currentColors.get(sourceKey) : null;
      for (let i = 0; i < NEIGHBOR_OFFSETS.length; i += 1) {
        const [dx, dy, dz] = NEIGHBOR_OFFSETS[i];
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < bounds.min || nx > bounds.max) continue;
        if (ny < bounds.min || ny > bounds.max) continue;
        if (nz < bounds.min || nz > bounds.max) continue;
        const k = keyFor(nx, ny, nz);
        if (current.has(k)) continue;
        candidates.set(k, (candidates.get(k) ?? 0) + 1);
        if (candidateColors && sourceColor) {
          let bucket = candidateColors.get(k);
          if (!bucket) {
            bucket = new Map();
            candidateColors.set(k, bucket);
          }
          bucket.set(sourceColor, (bucket.get(sourceColor) ?? 0) + 1);
        }
      }
    });

    for (const [k, count] of candidates.entries()) {
      if (count >= minN) {
        next.add(k);
        if (nextColors && candidateColors) {
          const bucket = candidateColors.get(k);
          if (bucket) {
            let bestColor = null;
            let bestScore = -1;
            for (const [colorValue, score] of bucket.entries()) {
              if (score > bestScore) {
                bestScore = score;
                bestColor = colorValue;
              }
            }
            if (bestColor) nextColors.set(k, bestColor);
          }
        }
      }
    }

    current = next;
    currentColors = nextColors;
  }

  return { set: current, colorMap: currentColors };
}

function applySurfaceNoise(set, bounds, seed, amount, colorMap) {
  const noiseAmount = clamp01(amount, 0);
  if (noiseAmount <= 0) return { set, colorMap };
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const next = new Set(set);
  const nextColors = colorMap ? new Map(colorMap) : null;

  forEachVoxel(set, (x, y, z) => {
    const neighbors = neighborCount(set, x, y, z);
    const isSurface = neighbors < 6;
    if (!isSurface) return;
    if (rand() < noiseAmount * 0.35) {
      const key = keyFor(x, y, z);
      next.delete(key);
      if (nextColors) nextColors.delete(key);
      return;
    }
    if (rand() < noiseAmount * 0.45) {
      const [dx, dy, dz] = NEIGHBOR_OFFSETS[Math.floor(rand() * NEIGHBOR_OFFSETS.length)];
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (nx < bounds.min || nx > bounds.max) return;
      if (ny < bounds.min || ny > bounds.max) return;
      if (nz < bounds.min || nz > bounds.max) return;
      const key = keyFor(nx, ny, nz);
      next.add(key);
      if (nextColors && colorMap) {
        const sourceColor = colorMap.get(keyFor(x, y, z));
        if (sourceColor) nextColors.set(key, sourceColor);
      }
    }
  });

  return { set: next, colorMap: nextColors };
}

function mirror(set, axis, colorMap) {
  const next = new Set(set);
  const nextColors = colorMap ? new Map(colorMap) : null;
  forEachVoxel(set, (x, y, z) => {
    const key = keyFor(x, y, z);
    const colorValue = colorMap ? colorMap.get(key) : null;
    if (axis === "x") {
      const mirrorKey = keyFor(-x, y, z);
      next.add(mirrorKey);
      if (nextColors && colorValue) nextColors.set(mirrorKey, colorValue);
    }
    if (axis === "z") {
      const mirrorKey = keyFor(x, y, -z);
      next.add(mirrorKey);
      if (nextColors && colorValue) nextColors.set(mirrorKey, colorValue);
    }
  });
  return { set: next, colorMap: nextColors };
}

function rotateYQuarterTurns(set, turns, colorMap) {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return { set, colorMap };
  const next = new Set();
  const nextColors = colorMap ? new Map() : null;
  forEachVoxel(set, (x, y, z) => {
    let rx = x;
    let rz = z;
    if (t === 1) {
      rx = -z;
      rz = x;
    } else if (t === 2) {
      rx = -x;
      rz = -z;
    } else if (t === 3) {
      rx = z;
      rz = -x;
    }
    const nextKey = keyFor(rx, y, rz);
    next.add(nextKey);
    if (nextColors && colorMap) {
      const colorValue = colorMap.get(keyFor(x, y, z));
      if (colorValue) nextColors.set(nextKey, colorValue);
    }
  });
  return { set: next, colorMap: nextColors };
}

function applyRandomSlices(set, bounds, seed, count, rotRanges, thickness, colorMap) {
  const total = count;
  if (total <= 0) return { set, colorMap, slices: [] };

  const rand = mulberry32(seed ^ 0x7f4a7c15);
  const rangeX = rotRanges.x;
  const rangeY = rotRanges.y;
  const rangeZ = rotRanges.z;
  const extent = (bounds.max - bounds.min) * 0.5;
  const sliceThickness = thickness;
  const halfThickness = sliceThickness * 0.5;
  const slices = [];

  let current = set;
  let currentColors = colorMap || null;

  for (let i = 0; i < total; i += 1) {
    const rx = THREE.MathUtils.degToRad((rand() * 2 - 1) * rangeX);
    const ry = THREE.MathUtils.degToRad((rand() * 2 - 1) * rangeY);
    const rz = THREE.MathUtils.degToRad((rand() * 2 - 1) * rangeZ);
    const normal = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
    normal.normalize();
    const offset = (rand() * 2 - 1) * extent;
    slices.push({
      normal: normal.clone(),
      offset,
      thickness: sliceThickness,
    });

    const next = new Set();
    const nextColors = currentColors ? new Map() : null;

    forEachVoxel(current, (x, y, z) => {
      const d = normal.x * x + normal.y * y + normal.z * z - offset;
      if (Math.abs(d) > halfThickness) {
        const key = keyFor(x, y, z);
        next.add(key);
        if (nextColors && currentColors) {
          const colorValue = currentColors.get(key);
          if (colorValue) nextColors.set(key, colorValue);
        }
      }
    });

    current = next;
    currentColors = nextColors;
  }

  return { set: current, colorMap: currentColors, slices };
}

function buildVoxelSet(state) {
  const gridSize = state.gridSize;
  const half = Math.floor(gridSize / 2);
  const bounds = { min: -half, max: half };
  const seed = clampInt(state.seed, 12345, 0, 999999999);
  const rand = mulberry32(seed);

  const palette = [
    "#c9d7f8",
    "#a6e1d2",
    "#f4c7a1",
    "#f2a7c4",
    "#b2b1f5",
    "#f7e6a3",
  ];

  let set = new Set();
  let colorMap = new Map();
  const shapeBounds = [];
  const placementMode = String(state.placementMode || "allow");
  // visualHelp range controls can store numbers as strings; spacing math needs a real int (voxels).
  const shapeSpacing = state.shapeSpacing;
  const attemptLimit = placementMode === "allow" ? 1 : 24;

  const presetCount = state.presetCount;
  const presetScale = state.presetScale;

  for (let i = 0; i < presetCount; i += 1) {
    const typeRoll = rand();
    const shapeColor = palette[Math.floor(rand() * palette.length)];
    let placed = false;

    for (let attempt = 0; attempt < attemptLimit && !placed; attempt += 1) {
      const spawnSpread = state.spawnSpread;
      const cx = Math.floor((rand() - 0.5) * gridSize * spawnSpread);
      const cz = Math.floor((rand() - 0.5) * gridSize * spawnSpread);
      const baseY = Math.floor(bounds.min + gridSize * clamp01(state.spawnBaseRatio, 0.05));
      const yawSteps = clampInt(state.shapeYawSteps, 0, 0, 4);
      const yawStep = yawSteps > 1 ? Math.floor(rand() * yawSteps) : 0;
      const swapXZ = yawStep % 2 === 1;

      if (typeRoll < 0.38) {
        let sx = Math.max(2, Math.floor((2 + rand() * 10) * presetScale));
        const sy = Math.max(2, Math.floor((6 + rand() * 18) * presetScale));
        let sz = Math.max(2, Math.floor((2 + rand() * 10) * presetScale));
        if (swapXZ) [sx, sz] = [sz, sx];
        const boxBounds = getBoxBounds(cx, baseY + sy / 2, cz, sx, sy, sz);
        if (placementMode !== "allow") {
          if (
            shapeBounds.some((b) =>
              boundsIntersect(boxBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
            )
          ) {
            continue;
          }
          if (placementMode === "no-overlap") {
            if (!canPlaceBox(set, bounds, cx, baseY + sy / 2, cz, sx, sy, sz)) continue;
          }
        }
        addBox(set, bounds, cx, baseY + sy / 2, cz, sx, sy, sz, colorMap, shapeColor);
        shapeBounds.push(boxBounds);
        placed = true;
      } else if (typeRoll < 0.68) {
        let sx = Math.max(3, Math.floor((10 + rand() * 20) * presetScale));
        const sy = Math.max(2, Math.floor((2 + rand() * 6) * presetScale));
        let sz = Math.max(3, Math.floor((10 + rand() * 20) * presetScale));
        if (swapXZ) [sx, sz] = [sz, sx];
        const y = Math.floor(baseY + rand() * gridSize * 0.5);
        const boxBounds = getBoxBounds(cx, y, cz, sx, sy, sz);
        if (placementMode !== "allow") {
          if (
            shapeBounds.some((b) =>
              boundsIntersect(boxBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
            )
          ) {
            continue;
          }
          if (placementMode === "no-overlap") {
            if (!canPlaceBox(set, bounds, cx, y, cz, sx, sy, sz)) continue;
          }
        }
        addBox(set, bounds, cx, y, cz, sx, sy, sz, colorMap, shapeColor);
        shapeBounds.push(boxBounds);
        placed = true;
      } else if (typeRoll < 0.88) {
        const radius = Math.max(3, Math.floor((4 + rand() * 10) * presetScale));
        const height = Math.max(6, Math.floor((8 + rand() * 22) * presetScale));
        const cylBounds = getCylinderBounds(cx, baseY, cz, radius, height);
        if (placementMode !== "allow") {
          if (
            shapeBounds.some((b) =>
              boundsIntersect(cylBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
            )
          ) {
            continue;
          }
          if (placementMode === "no-overlap") {
            if (!canPlaceCylinder(set, bounds, cx, baseY, cz, radius, height)) continue;
          }
        }
        addCylinder(set, bounds, cx, baseY, cz, radius, height, colorMap, shapeColor);
        shapeBounds.push(cylBounds);
        placed = true;
      } else {
        let baseSize = Math.max(4, Math.floor((8 + rand() * 16) * presetScale));
        const height = Math.max(4, Math.floor((8 + rand() * 18) * presetScale));
        if (swapXZ) baseSize = baseSize;
        const pyrBounds = getPyramidBounds(cx, baseY, cz, baseSize, height);
        if (placementMode !== "allow") {
          if (
            shapeBounds.some((b) =>
              boundsIntersect(pyrBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
            )
          ) {
            continue;
          }
          if (placementMode === "no-overlap") {
            if (!canPlaceBox(set, bounds, cx, baseY + height / 2, cz, baseSize, height, baseSize))
              continue;
          }
        }
        addPyramid(set, bounds, cx, baseY, cz, baseSize, height, colorMap, shapeColor);
        shapeBounds.push(pyrBounds);
        placed = true;
      }
    }
  }

  ({ set, colorMap } = erode(set, bounds, state.erosionSteps, state.erosionNeighbors, colorMap));
  ({ set, colorMap } = dilate(
    set,
    bounds,
    state.dilationSteps,
    state.dilationNeighbors,
    colorMap
  ));
  ({ set, colorMap } = applySurfaceNoise(set, bounds, seed, state.surfaceNoise, colorMap));

  if (state.mirrorX) ({ set, colorMap } = mirror(set, "x", colorMap));
  if (state.mirrorZ) ({ set, colorMap } = mirror(set, "z", colorMap));
  ({ set, colorMap } = rotateYQuarterTurns(
    set,
    clampInt(state.rotateQuarterTurns, 0, -8, 8),
    colorMap
  ));
  let sliceMeta = [];
  ({ set, colorMap, slices: sliceMeta } = applyRandomSlices(
    set,
    bounds,
    seed,
    state.randomSliceCount,
    {
      x: state.sliceRotX,
      y: state.sliceRotY,
      z: state.sliceRotZ,
    },
    state.randomSliceThickness,
    colorMap
  ));

  const voxelSize = state.voxelSize;
  const positions = [];
  const colors = [];
  forEachVoxel(set, (x, y, z) => {
    positions.push(x * voxelSize, y * voxelSize, z * voxelSize);
    const colorPick = colorMap.get(keyFor(x, y, z)) || palette[0];
    const color = new THREE.Color(colorPick);
    colors.push(color.r, color.g, color.b);
  });

  return {
    positions,
    colors,
    voxelCount: positions.length / 3,
    gridSize,
    bounds,
    voxelSize,
    slices: sliceMeta,
    voxelSet: set,
    voxelColorMap: colorMap,
  };
}

function setDirectionalFromAngles(light, azimuthDeg, elevationDeg, distance, target) {
  const azVal = clampNum(azimuthDeg, 45);
  const elVal = clampNum(elevationDeg, 35);
  const r = clampNum(distance, 2000);
  const az = THREE.MathUtils.degToRad(azVal);
  const el = THREE.MathUtils.degToRad(elVal);
  const x = Math.cos(el) * Math.cos(az) * r;
  const y = Math.sin(el) * r;
  const z = Math.cos(el) * Math.sin(az) * r;
  const anchor = target || { x: 0, y: 0, z: 0 };
  light.position.set(anchor.x + x, anchor.y + y, anchor.z + z);
}

function getLightDirection(azimuthDeg, elevationDeg) {
  const azVal = clampNum(azimuthDeg, 45);
  const elVal = clampNum(elevationDeg, 35);
  const az = THREE.MathUtils.degToRad(azVal);
  const el = THREE.MathUtils.degToRad(elVal);
  const x = Math.cos(el) * Math.cos(az);
  const y = Math.sin(el);
  const z = Math.cos(el) * Math.sin(az);
  const pos = new THREE.Vector3(x, y, z);
  return new THREE.Vector3(0, 0, 0).sub(pos).normalize();
}

function getHatchStroke({ density, angleDeg, strokeWidth, baseMin = 2, baseMax = 12, gapRatio = 0.6 }) {
  const clampedDensity = clamp01(density, 0.8);
  const clampedWidth = Math.max(0.1, clampNum(strokeWidth, 1));
  // Smaller dashes at higher density produce a tighter hatch look.
  const dashBase = THREE.MathUtils.lerp(baseMax, baseMin, clampedDensity) * Math.max(0.6, clampedWidth / 2.7);
  const dashGap = Math.max(0.8, dashBase * gapRatio);
  const dashArray = `${dashBase.toFixed(2)} ${dashGap.toFixed(2)}`;
  // We encode hatch "angle" as dash phase offset so exported strokes remain deterministic.
  const dashPhase = ((clampNum(angleDeg, 35) % 360) + 360) % 360;
  const dashOffset = (dashPhase / 360) * dashBase;
  return { dashArray, dashOffset };
}

function elementHasVisiblePaint(node) {
  const opacity = clamp01(node.getAttribute("opacity"), 1);
  if (opacity <= 0) return false;

  const fill = String(node.getAttribute("fill") || "").toLowerCase();
  const fillOpacity = clamp01(node.getAttribute("fill-opacity"), 1);
  const hasFill = fill !== "" && fill !== "none" && fillOpacity > 0;

  const stroke = String(node.getAttribute("stroke") || "").toLowerCase();
  const strokeOpacity = clamp01(node.getAttribute("stroke-opacity"), 1);
  const strokeWidth = Math.max(0, clampNum(node.getAttribute("stroke-width"), 0));
  const hasStroke = stroke !== "" && stroke !== "none" && strokeOpacity > 0 && strokeWidth > 0;

  return hasFill || hasStroke;
}

function cullSvgElements(svgEl, width, height, minSize) {
  if (!svgEl) return;
  const sizeCutoff = Math.max(0, clampNum(minSize, 0));
  const targets = Array.from(
    svgEl.querySelectorAll("path, line, polyline, polygon, rect, circle, ellipse")
  );
  for (const node of targets) {
    const rawDisplay = String(node.getAttribute("display") || "").toLowerCase();
    const rawVisibility = String(node.getAttribute("visibility") || "").toLowerCase();
    if (rawDisplay === "none" || rawVisibility === "hidden") {
      node.remove();
      continue;
    }
    if (!elementHasVisiblePaint(node)) {
      node.remove();
      continue;
    }

    let bbox = null;
    try {
      bbox = node.getBBox();
    } catch {
      // If bbox isn't available, keep the node rather than risk deleting valid content.
      continue;
    }
    if (!bbox) continue;

    const bw = Math.max(0, bbox.width);
    const bh = Math.max(0, bbox.height);
    if (bw <= 0 || bh <= 0) {
      node.remove();
      continue;
    }
    if (sizeCutoff > 0 && Math.max(bw, bh) < sizeCutoff) {
      node.remove();
      continue;
    }

    const outOfView =
      bbox.x + bw < 0 || bbox.y + bh < 0 || bbox.x > width || bbox.y > height;
    if (outOfView) {
      node.remove();
    }
  }
}

function postProcessSvg(svgEl, state, width, height, mode = "main") {
  if (!svgEl) return;
  svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svgEl.style.background = "transparent";

  const strokeWidth = Math.max(0.1, clampNum(state.svgStrokeWidth, 0.8));
  const strokeColorRaw = String(state.svgStroke ?? "auto");
  const fillOpacity = clamp01(state.svgFillOpacity, 0.9);
  const svgLineMode = String(state.svgLineMode || "hatch");
  const enableHatching = svgLineMode === "hatch";
  const wireframeMode = svgLineMode === "wireframe";
  const cullInvisible = state.svgCullInvisible !== false;
  const cullMinSize = clampNum(state.svgCullMinSize, 0);

  // Main mesh hatch stroke profile.
  const mainHatch = getHatchStroke({
    density: state.hatchDensity,
    angleDeg: state.hatchAngleDeg,
    strokeWidth,
  });

  const groundPick = "#00ff00";
  const shadowStrokeWidth = Math.max(0.1, clampNum(state.svgShadowStrokeWidth, strokeWidth));
  const shadowStrokeColor = String(state.svgShadowStroke || "#111111");
  // Shadow uses the same hatch algorithm (single strategy), with shadow-specific controls.
  const shadowHatch = getHatchStroke({
    density: state.svgShadowDensity,
    angleDeg: state.svgShadowAngleDeg,
    strokeWidth: shadowStrokeWidth,
  });

  const targets = Array.from(
    svgEl.querySelectorAll("path, line, polyline, polygon, rect, circle, ellipse")
  );
  const groundNodes = [];

  targets.forEach((node) => {
    const existingStroke = node.getAttribute("stroke");
    const existingFill = node.getAttribute("fill");
    const isShadow = mode === "shadow";
    const isGround =
      existingFill?.toLowerCase?.() === groundPick || existingStroke?.toLowerCase?.() === groundPick;

    if (isGround) {
      groundNodes.push(node);
      return;
    }

    if (isShadow) {
      node.setAttribute("stroke", shadowStrokeColor);
      node.setAttribute("stroke-width", String(wireframeMode ? Math.max(0.1, shadowStrokeWidth * 0.9) : shadowStrokeWidth));
      if (enableHatching) {
        node.setAttribute("stroke-dasharray", shadowHatch.dashArray);
        node.setAttribute("stroke-dashoffset", shadowHatch.dashOffset.toFixed(2));
      } else {
        node.removeAttribute("stroke-dasharray");
        node.removeAttribute("stroke-dashoffset");
      }
    } else {
      const strokeColor =
        strokeColorRaw === "auto" || strokeColorRaw === ""
          ? (wireframeMode ? "#111111" : existingStroke || existingFill)
          : strokeColorRaw;
      if (strokeColor) node.setAttribute("stroke", strokeColor);
      node.setAttribute("stroke-width", String(wireframeMode ? Math.max(0.1, strokeWidth * 0.9) : strokeWidth));
      if (enableHatching) {
        node.setAttribute("stroke-dasharray", mainHatch.dashArray);
        node.setAttribute("stroke-dashoffset", mainHatch.dashOffset.toFixed(2));
      } else {
        node.removeAttribute("stroke-dasharray");
        node.removeAttribute("stroke-dashoffset");
      }
    }
    node.setAttribute("stroke-linecap", "round");
    node.setAttribute("stroke-linejoin", "round");
    if (isShadow) {
      // Keep shadow output hatch-only; no fill overlay to avoid visual double-hatching.
      node.setAttribute("fill", "none");
      node.setAttribute("fill-opacity", "0");
    } else {
      // SVGRenderer fills meshes by default; force outline-only so the
      // overlay doesn't turn everything into solid black shapes.
      node.setAttribute("fill", "none");
      node.setAttribute("fill-opacity", String(fillOpacity));
    }

  });

  if (groundNodes.length > 0) {
    groundNodes.forEach((node) => node.remove());
    const groundStroke =
      strokeColorRaw === "auto" || strokeColorRaw === "" ? "#111111" : strokeColorRaw;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("stroke", groundStroke);
    rect.setAttribute("stroke-width", String(strokeWidth));
    rect.setAttribute("stroke-linecap", "round");
    rect.setAttribute("stroke-linejoin", "round");
    if (enableHatching) {
      rect.setAttribute("stroke-dasharray", mainHatch.dashArray);
      rect.setAttribute("stroke-dashoffset", mainHatch.dashOffset.toFixed(2));
    } else {
      rect.removeAttribute("stroke-dasharray");
      rect.removeAttribute("stroke-dashoffset");
    }
    rect.setAttribute("fill", "none");
    rect.setAttribute("fill-opacity", String(fillOpacity));
    svgEl.prepend(rect);
  }

  if (cullInvisible) {
    cullSvgElements(svgEl, width, height, cullMinSize);
  }
}

registerVisual("voxelHatching", {
  title: "Voxel Hatching",
  description:
    "Preset voxel primitives + iterative transforms rendered in Three.js, then exported to editable SVG.",
  params: [
    {
      key: "seed",
      type: "number",
      default: 41680039,
      min: 0,
      max: 999999999,
      step: 1,
      category: "Scene",
      description: "Deterministic seed for voxel generation.",
    },
    {
      key: "gridSize",
      label: "grid size",
      type: "number",
      default: 207,
      min: 12,
      max: 500,
      step: 1,
      category: "Scene",
    },
    {
      key: "voxelSize",
      label: "voxel size",
      type: "number",
      default: 7,
      min: 2,
      max: 24,
      step: 1,
      category: "Scene",
    },
    {
      key: "voxelGapRatio",
      label: "voxel gap",
      type: "number",
      default: 0.5,
      min: 0,
      max: 0.5,
      step: 0.01,
      category: "Scene",
      description:
        "Gap between voxel cubes as a fraction of voxel size (0 = touching, 0.04 matches prior default).",
    },
    {
      key: "materialMode",
      label: "material mode",
      type: "select",
      default: "lambert",
      options: ["standard", "lambert", "basic"],
      category: "Scene",
      description: "Material type for voxel preview (affects lighting).",
    },
    {
      key: "presetCount",
      label: "preset shapes",
      type: "number",
      default: 12,
      min: 1,
      max: 24,
      step: 1,
      category: "Primitives",
    },
    {
      key: "placementMode",
      label: "placement mode",
      type: "select",
      default: "allow",
      options: ["allow", "no-overlap", "spacing"],
      category: "Primitives",
      description: "Controls whether primitive shapes can intersect.",
    },
    {
      key: "shapeSpacing",
      label: "shape spacing",
      type: "number",
      default: 2,
      min: 0,
      max: 24,
      step: 1,
      category: "Primitives",
      description: "Extra voxel padding between shapes when spacing mode is enabled.",
    },
    {
      key: "presetScale",
      label: "preset scale",
      type: "number",
      default: 3,
      min: 0.25,
      max: 4,
      step: 0.01,
      category: "Primitives",
    },
    {
      key: "spawnSpread",
      label: "spawn spread",
      type: "number",
      default: 1,
      min: 0.2,
      max: 1,
      step: 0.01,
      category: "Primitives",
      description: "Controls how far from center shapes can spawn (as a fraction of grid size).",
    },
    {
      key: "spawnBaseRatio",
      label: "spawn base height",
      type: "number",
      default: 0.05,
      min: 0,
      max: 0.5,
      step: 0.01,
      category: "Primitives",
      description: "Base height offset as a fraction of grid size.",
    },
    {
      key: "shapeYawSteps",
      label: "shape yaw steps",
      type: "number",
      default: 2,
      min: 0,
      max: 4,
      step: 1,
      category: "Primitives",
      description: "Randomly rotate shapes around Y in 90° steps (0 = disabled).",
    },
    {
      key: "erosionSteps",
      label: "erosion steps",
      type: "number",
      default: 6,
      min: 0,
      max: 6,
      step: 1,
      category: "Transforms",
    },
    {
      key: "erosionNeighbors",
      label: "erosion min neighbors",
      type: "number",
      default: 4,
      min: 0,
      max: 6,
      step: 1,
      category: "Transforms",
    },
    {
      key: "dilationSteps",
      label: "dilation steps",
      type: "number",
      default: 5,
      min: 0,
      max: 6,
      step: 1,
      category: "Transforms",
    },
    {
      key: "dilationNeighbors",
      label: "dilation min neighbors",
      type: "number",
      default: 6,
      min: 0,
      max: 6,
      step: 1,
      category: "Transforms",
    },
    {
      key: "surfaceNoise",
      label: "surface noise",
      type: "number",
      default: 1,
      min: 0,
      max: 1,
      step: 0.01,
      category: "Transforms",
    },
    {
      key: "mirrorX",
      label: "mirror X",
      type: "boolean",
      default: false,
      category: "Transforms",
    },
    {
      key: "mirrorZ",
      label: "mirror Z",
      type: "boolean",
      default: false,
      category: "Transforms",
    },
    {
      key: "rotateQuarterTurns",
      label: "rotate (90° steps)",
      type: "number",
      default: 0,
      min: -4,
      max: 4,
      step: 1,
      category: "Transforms",
    },
    {
      key: "randomSliceCount",
      label: "random slice count",
      type: "number",
      default: 0,
      min: 0,
      max: 12,
      step: 1,
      category: "Transforms",
      description: "Number of random slicing planes applied after transforms.",
    },
    {
      key: "randomSliceThickness",
      label: "slice thickness",
      type: "number",
      default: 5,
      min: 1,
      max: 40,
      step: 1,
      category: "Transforms",
      description: "Thickness of each slicing volume in voxel units.",
    },
    {
      key: "sliceRotX",
      label: "slice rot X",
      type: "number",
      default: 35,
      min: 0,
      max: 180,
      step: 1,
      category: "Transforms",
      description: "Max random rotation around X for slice planes (degrees).",
    },
    {
      key: "sliceRotY",
      label: "slice rot Y",
      type: "number",
      default: 35,
      min: 0,
      max: 180,
      step: 1,
      category: "Transforms",
      description: "Max random rotation around Y for slice planes (degrees).",
    },
    {
      key: "sliceRotZ",
      label: "slice rot Z",
      type: "number",
      default: 35,
      min: 0,
      max: 180,
      step: 1,
      category: "Transforms",
      description: "Max random rotation around Z for slice planes (degrees).",
    },
    {
      key: "showSliceVolumes",
      label: "show slice volumes",
      type: "boolean",
      default: false,
      category: "Transforms",
      description: "Display the slicing volumes in the 3D preview.",
    },
    {
      key: "cameraDistance",
      label: "camera distance",
      type: "number",
      default: 820,
      min: 200,
      max: 2400,
      step: 10,
      category: "Camera",
    },
    {
      key: "cameraAzimuth",
      label: "camera azimuth",
      type: "number",
      default: 38,
      min: -180,
      max: 180,
      step: 1,
      category: "Camera",
    },
    {
      key: "cameraElevation",
      label: "camera elevation",
      type: "number",
      default: 32,
      min: 5,
      max: 85,
      step: 1,
      category: "Camera",
    },
    {
      key: "groundEnabled",
      label: "ground plane",
      type: "boolean",
      default: true,
      category: "Scene",
    },
    {
      key: "groundScale",
      label: "ground scale",
      type: "number",
      default: 2.8,
      min: 1,
      max: 6,
      step: 0.1,
      category: "Scene",
    },
    {
      key: "groundYOffset",
      label: "ground Y offset",
      type: "number",
      default: 0,
      min: -400,
      max: 400,
      step: 1,
      category: "Scene",
    },
    {
      key: "groundOpacity",
      label: "ground opacity",
      type: "number",
      default: 1,
      min: 0,
      max: 1,
      step: 0.01,
      category: "Scene",
    },
    {
      key: "groundColor",
      label: "ground color",
      type: "text",
      default: "#e2e5f0",
      category: "Scene",
    },
    {
      key: "backgroundColor",
      label: "background color",
      type: "text",
      default: "#f7f8fb",
      category: "Scene",
    },
    {
      key: "lightAzimuth",
      label: "light azimuth",
      type: "number",
      default: 35,
      min: -180,
      max: 180,
      step: 1,
      category: "Light",
    },
    {
      key: "lightElevation",
      label: "light elevation",
      type: "number",
      default: 48,
      min: 0,
      max: 90,
      step: 1,
      category: "Light",
    },
    {
      key: "lightDistance",
      label: "light distance",
      type: "number",
      default: 2000,
      step: 10,
      category: "Light",
    },
    {
      key: "lightIntensity",
      label: "light intensity",
      type: "number",
      default: 2.65,
      min: 0,
      max: 4,
      step: 0.05,
      category: "Light",
    },
    {
      key: "ambientIntensity",
      label: "ambient intensity",
      type: "number",
      default: 0,
      min: 0,
      max: 3,
      step: 0.05,
      category: "Light",
    },
    {
      key: "shadowExtent",
      label: "shadow extent",
      type: "number",
      default: 1200,
      step: 10,
      category: "Light",
      description: "Half-size of the orthographic shadow camera.",
    },
    {
      key: "shadowNear",
      label: "shadow near",
      type: "number",
      default: 1,
      step: 1,
      category: "Light",
    },
    {
      key: "shadowFar",
      label: "shadow far",
      type: "number",
      default: 6000,
      step: 10,
      category: "Light",
    },
    {
      key: "shadowMapSize",
      label: "shadow map size",
      type: "number",
      default: 2048,
      step: 1,
      category: "Light",
    },
    {
      key: "shadowBias",
      label: "shadow bias",
      type: "number",
      default: -0.0006,
      step: 0.0001,
      category: "Light",
    },
    {
      key: "shadowNormalBias",
      label: "shadow normal bias",
      type: "number",
      default: 0,
      step: 0.0001,
      category: "Light",
    },
    {
      key: "hatchDensity",
      label: "hatch density",
      type: "number",
      default: 0.84,
      min: 0,
      max: 1,
      step: 0.01,
      category: "SVG",
      description: "Controls dash spacing on exported SVG strokes.",
    },
    {
      key: "hatchAngleDeg",
      label: "hatch angle",
      type: "number",
      default: -133,
      min: -180,
      max: 180,
      step: 1,
      category: "SVG",
    },
    {
      key: "svgStrokeWidth",
      label: "stroke width",
      type: "number",
      default: 2.7,
      min: 0.1,
      max: 4,
      step: 0.1,
      category: "SVG",
    },
    {
      key: "svgFillOpacity",
      label: "fill opacity",
      type: "number",
      default: 1,
      min: 0,
      max: 1,
      step: 0.01,
      category: "SVG",
    },
    {
      key: "svgStroke",
      label: "stroke color",
      type: "text",
      default: "auto",
      category: "SVG",
    },
    {
      key: "svgLineMode",
      label: "line mode",
      type: "select",
      default: "hatch",
      options: ["hatch", "solid", "wireframe"],
      category: "SVG",
      description: "hatch = dashed hatch, solid = no hatching, wireframe = monochrome linework.",
    },
    {
      key: "svgCullInvisible",
      label: "cull invisible SVG",
      type: "boolean",
      default: true,
      category: "SVG",
      description: "Remove hidden, zero-size, and out-of-frame SVG elements.",
    },
    {
      key: "svgCullMinSize",
      label: "cull min size",
      type: "number",
      default: 0,
      min: 0,
      max: 20,
      step: 0.1,
      category: "SVG",
      description: "Remove SVG elements smaller than this bbox size (0 disables size culling).",
    },
    {
      key: "svgShadowEnabled",
      label: "shadow hatch",
      type: "boolean",
      default: false,
      category: "SVG",
      description: "Project a simple shadow onto the ground and hatch it.",
    },
    {
      key: "svgShadowDensity",
      label: "shadow hatch density",
      type: "number",
      default: 0.85,
      min: 0,
      max: 1,
      step: 0.01,
      category: "SVG",
    },
    {
      key: "svgShadowAngleDeg",
      label: "shadow hatch angle",
      type: "number",
      default: -15,
      min: -180,
      max: 180,
      step: 1,
      category: "SVG",
    },
    {
      key: "svgShadowStrokeWidth",
      label: "shadow stroke width",
      type: "number",
      default: 2.2,
      min: 0.1,
      max: 4,
      step: 0.1,
      category: "SVG",
    },
    {
      key: "svgShadowStroke",
      label: "shadow stroke color",
      type: "text",
      default: "#101010",
      category: "SVG",
    },
    {
      key: "svgMergePaths",
      label: "merge SVG paths",
      type: "boolean",
      default: false,
      category: "SVG",
      description: "Combine paths by stroke color into fewer paths (approximate).",
    },
    {
      key: "showSvgOverlay",
      label: "show SVG overlay",
      type: "boolean",
      default: false,
      category: "SVG",
      description: "Show the SVG export on top of the WebGL preview.",
    },
    {
      key: "exportSvg",
      label: "export SVG to tabs",
      type: "button",
      category: "SVG",
      onClick: ({ state: currentState, setByPath }) => {
        setByPath(currentState, "showSvgOverlay", true);
        currentState.__exportSvg?.();
      },
    },
    {
      key: "clearSvgOverlay",
      label: "hide SVG overlay",
      type: "button",
      category: "SVG",
      onClick: ({ state: currentState, setByPath }) => {
        setByPath(currentState, "showSvgOverlay", false);
        currentState.__hideSvg?.();
      },
    },
  ],
  defaultState: {
    shouldRender: true,
    __xf: {
      ui: {
        splitCount: 1,
        activeTile: "0",
        rotateDeg: 90,
        preset: "",
        splitMode: "screen",
        applyToAll: false,
        tileTargets: "0",
        zoomFactor: 1.25,
        matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        zoomCenter: { x: null, y: null },
        translateVec: { x: 0, y: 0 },
        planeCount: 3,
        planeBaseScale: 1,
        planeScaleStep: -0.12,
        planeOpacity: 0.7,
        planeOpacityFalloff: 0.12,
        planeOffset: { x: 0, y: 0 },
        planeCenter: { x: null, y: null },
        groupOpen: {},
      },
      stack: [],
    },
    __ui: {
      tabsOpen: false,
      activeTab: "params",
      paramGroups: {
        Primitives: true,
        Scene: true,
        Transforms: true,
        Camera: true,
        Light: true,
      },
      collapseParamsByDefault: true,
      ioOpen: true,
      configPinned: true,
      navHidden: false,
    },
    __cameraPoseMeta: {
      distance: 820,
      azimuth: 38,
      elevation: 32,
    },
    __cameraPose: {
      position: [1378.9078660793834, 834.9522452295657, 2984.7618245768585],
      target: [0, 28.8, 0],
    },
  },
  create({ mountEl }, state) {
    const container = mountEl;
    container.innerHTML = "";
    container.style.position = "relative";

    const previewEl = document.createElement("div");
    previewEl.style.position = "absolute";
    previewEl.style.inset = "0";
    previewEl.style.zIndex = "1";
    container.appendChild(previewEl);

    let svgOverlayEl = null;

    function size() {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      return { width, height };
    }

    let { width, height } = size();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 20000);
    camera.position.set(0, 600, 900);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    if ("outputColorSpace" in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.useLegacyLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    previewEl.appendChild(renderer.domElement);

    const svgRenderer = new SVGRenderer();
    svgRenderer.setQuality("high");
    svgRenderer.setSize(width, height);
    const shadowSvgRenderer = new SVGRenderer();
    shadowSvgRenderer.setQuality("high");
    shadowSvgRenderer.setSize(width, height);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 120, 0);

    if (!state.__cameraPoseMeta) {
      state.__cameraPoseMeta = getCameraParamSnapshot();
    }
    controls.addEventListener("change", () => {
      state.__cameraPose = snapshotCameraPose();
      state.__cameraPoseMeta = getCameraParamSnapshot();
      if (state.showSvgOverlay) {
        exportSvgToMount();
      }
    });

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.castShadow = true;
    scene.add(dirLight);
    scene.add(dirLight.target);

    const voxelGroup = new THREE.Group();
    scene.add(voxelGroup);

    // We intentionally batch instances by color into multiple InstancedMeshes.
    // This avoids relying on `instanceColor` shader support, which can be brittle
    // across three.js versions/materials and was a repeated source of failures.
    let instancedMeshes = [];
    let instancedGeom = null;
    let instancedMats = [];
    let sliceGroup = null;
    let groundMesh = null;
    let groundGeom = null;
    let groundMat = null;
    let lastGridExtent = 800;
    let lastVoxels = null;
    let isExportingSvg = false;

    function disposeInstanced() {
      instancedMeshes.forEach((m) => voxelGroup.remove(m));
      instancedMeshes = [];
      if (instancedGeom) instancedGeom.dispose();
      instancedMats.forEach((m) => m.dispose());
      instancedGeom = null;
      instancedMats = [];
    }

    function disposeSlices() {
      if (sliceGroup) scene.remove(sliceGroup);
      if (sliceGroup) {
        sliceGroup.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
      }
      sliceGroup = null;
    }

    function disposeGround() {
      if (groundMesh) scene.remove(groundMesh);
      groundMesh = null;
      if (groundGeom) groundGeom.dispose();
      if (groundMat) groundMat.dispose();
      groundGeom = null;
      groundMat = null;
    }

    function getCameraParamSnapshot() {
      return {
        distance: clampNum(state.cameraDistance, 820),
        azimuth: clampNum(state.cameraAzimuth, 38),
        elevation: clampNum(state.cameraElevation, 32),
      };
    }

    function cameraMetaEquals(a, b) {
      if (!a || !b) return false;
      return a.distance === b.distance && a.azimuth === b.azimuth && a.elevation === b.elevation;
    }

    function snapshotCameraPose() {
      return {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      };
    }

    function applyCameraPose(pose) {
      if (!pose) return;
      const [px, py, pz] = pose.position || [];
      const [tx, ty, tz] = pose.target || [];
      if ([px, py, pz].every(Number.isFinite)) {
        camera.position.set(px, py, pz);
      }
      if ([tx, ty, tz].every(Number.isFinite)) {
        controls.target.set(tx, ty, tz);
      }
      camera.lookAt(controls.target);
      controls.update();
    }

    function updateCameraFromState() {
      const distance = Math.max(100, clampNum(state.cameraDistance, 820));
      const az = THREE.MathUtils.degToRad(clampNum(state.cameraAzimuth, 38));
      const el = THREE.MathUtils.degToRad(clampNum(state.cameraElevation, 32));
      const x = Math.cos(el) * Math.cos(az) * distance;
      const y = Math.sin(el) * distance;
      const z = Math.cos(el) * Math.sin(az) * distance;
      camera.position.set(x, y, z);
      camera.lookAt(controls.target);
    }

    function buildSceneFromState() {
      disposeInstanced();
      disposeGround();

      const camSnapshot = getCameraParamSnapshot();
      const camChanged = !cameraMetaEquals(state.__cameraPoseMeta, camSnapshot);
      if (camChanged) state.__cameraPose = null;
      state.__cameraPoseMeta = camSnapshot;

      const { positions, colors, voxelCount, voxelSize, gridSize, bounds, slices, voxelSet, voxelColorMap } =
        buildVoxelSet(state);
      lastVoxels = {
        positions,
        colors,
        voxelCount,
        voxelSize,
        gridSize,
        bounds,
        slices,
        voxelSet,
        voxelColorMap,
      };
      if (voxelCount <= 0) return;

      const gapRatio = state.voxelGapRatio;
      const geomSize = voxelSize * Math.max(0.02, 1 - gapRatio);
      instancedGeom = new THREE.BoxGeometry(geomSize, geomSize, geomSize);

      const materialMode = String(state.materialMode || "lambert");
      // Group voxels by their RGB so we can use a plain material color per batch.
      // This is deterministic and works with all lighting/material modes.
      const buckets = new Map(); // key -> { color: THREE.Color, indices: number[] }
      for (let i = 0; i < voxelCount; i += 1) {
        const r = colors[i * 3 + 0] ?? 0.7;
        const g = colors[i * 3 + 1] ?? 0.7;
        const b = colors[i * 3 + 2] ?? 0.9;
        const key = `${Math.round(r * 255)}-${Math.round(g * 255)}-${Math.round(b * 255)}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { color: new THREE.Color(r, g, b), indices: [] };
          buckets.set(key, bucket);
        }
        bucket.indices.push(i);
      }

      const makeMatForColor = (color) => {
        if (materialMode === "basic") {
          return new THREE.MeshBasicMaterial({ color });
        }
        if (materialMode === "standard") {
          return new THREE.MeshStandardMaterial({
            color,
            roughness: 0.82,
            metalness: 0.05,
          });
        }
        return new THREE.MeshLambertMaterial({ color });
      };

      const dummy = new THREE.Object3D();
      for (const bucket of buckets.values()) {
        const mat = makeMatForColor(bucket.color);
        instancedMats.push(mat);

        const mesh = new THREE.InstancedMesh(instancedGeom, mat, bucket.indices.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        for (let j = 0; j < bucket.indices.length; j += 1) {
          const i = bucket.indices[j];
          const ix = positions[i * 3 + 0];
          const iy = positions[i * 3 + 1];
          const iz = positions[i * 3 + 2];
          dummy.position.set(ix, iy, iz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          mesh.setMatrixAt(j, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;

        instancedMeshes.push(mesh);
        voxelGroup.add(mesh);
      }

      const gridExtent = gridSize * voxelSize * 0.5;
      lastGridExtent = gridExtent;

      const defaultTarget = new THREE.Vector3(0, gridExtent * 0.2, 0);
      if (!state.__cameraPose) {
        controls.target.copy(defaultTarget);
      }

      if (state.groundEnabled) {
        const groundScale = Math.max(1, clampNum(state.groundScale, 2.8));
        const groundSize = gridExtent * 2 * groundScale;
        const groundYBase = bounds.min * voxelSize - voxelSize * 1.15;
        const groundY = groundYBase + clampNum(state.groundYOffset, 0);
        const groundColor = new THREE.Color(String(state.groundColor || "#f2f3f7"));
        const groundOpacity = clamp01(state.groundOpacity, 0.92);

        groundGeom = new THREE.PlaneGeometry(groundSize, groundSize, 1, 1);
        groundMat = new THREE.MeshStandardMaterial({
          color: groundColor,
          transparent: groundOpacity < 1,
          opacity: groundOpacity,
          roughness: 0.95,
          metalness: 0.02,
          side: THREE.DoubleSide,
        });
        groundMesh = new THREE.Mesh(groundGeom, groundMat);
        groundMesh.receiveShadow = true;
        groundMesh.castShadow = false;
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(0, groundY, 0);
        scene.add(groundMesh);
      }

      if (state.__cameraPose) {
        applyCameraPose(state.__cameraPose);
      } else {
        updateCameraFromState();
        state.__cameraPose = snapshotCameraPose();
      }

      disposeSlices();
      if (state.showSliceVolumes && lastVoxels.slices && lastVoxels.slices.length > 0) {
        sliceGroup = new THREE.Group();
        const slabSize = gridExtent * 2.2;
        const slabMat = new THREE.MeshBasicMaterial({
          color: 0x111111,
          wireframe: true,
          transparent: true,
          opacity: 0.25,
        });
        lastVoxels.slices.forEach((slice) => {
          const thicknessWorld = slice.thickness * voxelSize;
          const slabGeom = new THREE.BoxGeometry(slabSize, thicknessWorld, slabSize);
          const slab = new THREE.Mesh(slabGeom, slabMat.clone());
          const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            slice.normal.clone().normalize()
          );
          slab.quaternion.copy(quat);
          const center = slice.normal
            .clone()
            .multiplyScalar(slice.offset * voxelSize);
          slab.position.set(center.x, center.y, center.z);
          sliceGroup.add(slab);
        });
        scene.add(sliceGroup);
      }

      dirLight.target.position.copy(controls.target);
    }

    function updateLightsFromState() {
      const ambientIntensity = clampNum(state.ambientIntensity, 0.55);
      const lightIntensity = clampNum(state.lightIntensity, 1.1);
      ambientLight.intensity = ambientIntensity;
      dirLight.intensity = lightIntensity;

      const lightDistance = clampNum(state.lightDistance, lastGridExtent * 2.4);
      setDirectionalFromAngles(
        dirLight,
        state.lightAzimuth,
        state.lightElevation,
        lightDistance,
        controls.target
      );

      const shadowExtent = clampNum(state.shadowExtent, lastGridExtent * 2.4);
      dirLight.castShadow = true;
      const mapSize = clampNum(state.shadowMapSize, 2048);
      dirLight.shadow.mapSize.width = mapSize;
      dirLight.shadow.mapSize.height = mapSize;
      dirLight.shadow.bias = clampNum(state.shadowBias, -0.0006);
      dirLight.shadow.normalBias = clampNum(state.shadowNormalBias, 0);
      dirLight.shadow.camera.near = clampNum(state.shadowNear, 1);
      dirLight.shadow.camera.far = clampNum(state.shadowFar, shadowExtent * 6);
      dirLight.shadow.camera.left = -shadowExtent;
      dirLight.shadow.camera.right = shadowExtent;
      dirLight.shadow.camera.top = shadowExtent;
      dirLight.shadow.camera.bottom = -shadowExtent;
      dirLight.target.position.copy(controls.target);
      dirLight.target.updateMatrixWorld();
      dirLight.shadow.camera.updateProjectionMatrix();
    }

    function renderWebgl() {
      renderer.render(scene, camera);
    }

    function disposeSvgScene(svgScene) {
      if (!svgScene) return;
      svgScene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => mat.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }

    function makeFaceDefs(geomSize) {
      const half = geomSize * 0.5;
      const faceDefs = [
        {
          dx: 1,
          dy: 0,
          dz: 0,
          normal: new THREE.Vector3(1, 0, 0),
          offset: new THREE.Vector3(half, 0, 0),
          corners: [
            new THREE.Vector3(half, -half, -half),
            new THREE.Vector3(half, half, -half),
            new THREE.Vector3(half, half, half),
            new THREE.Vector3(half, -half, half),
          ],
        },
        {
          dx: -1,
          dy: 0,
          dz: 0,
          normal: new THREE.Vector3(-1, 0, 0),
          offset: new THREE.Vector3(-half, 0, 0),
          corners: [
            new THREE.Vector3(-half, -half, half),
            new THREE.Vector3(-half, half, half),
            new THREE.Vector3(-half, half, -half),
            new THREE.Vector3(-half, -half, -half),
          ],
        },
        {
          dx: 0,
          dy: 1,
          dz: 0,
          normal: new THREE.Vector3(0, 1, 0),
          offset: new THREE.Vector3(0, half, 0),
          corners: [
            new THREE.Vector3(-half, half, -half),
            new THREE.Vector3(half, half, -half),
            new THREE.Vector3(half, half, half),
            new THREE.Vector3(-half, half, half),
          ],
        },
        {
          dx: 0,
          dy: -1,
          dz: 0,
          normal: new THREE.Vector3(0, -1, 0),
          offset: new THREE.Vector3(0, -half, 0),
          corners: [
            new THREE.Vector3(-half, -half, half),
            new THREE.Vector3(half, -half, half),
            new THREE.Vector3(half, -half, -half),
            new THREE.Vector3(-half, -half, -half),
          ],
        },
        {
          dx: 0,
          dy: 0,
          dz: 1,
          normal: new THREE.Vector3(0, 0, 1),
          offset: new THREE.Vector3(0, 0, half),
          corners: [
            new THREE.Vector3(-half, -half, half),
            new THREE.Vector3(-half, half, half),
            new THREE.Vector3(half, half, half),
            new THREE.Vector3(half, -half, half),
          ],
        },
        {
          dx: 0,
          dy: 0,
          dz: -1,
          normal: new THREE.Vector3(0, 0, -1),
          offset: new THREE.Vector3(0, 0, -half),
          corners: [
            new THREE.Vector3(half, -half, -half),
            new THREE.Vector3(half, half, -half),
            new THREE.Vector3(-half, half, -half),
            new THREE.Vector3(-half, -half, -half),
          ],
        },
      ];
      return { faceDefs };
    }

    function buildSvgScene() {
      const svgScene = new THREE.Scene();
      svgScene.background = null;

      if (!lastVoxels || lastVoxels.voxelCount <= 0) {
        return svgScene;
      }

      const { positions, colors, voxelCount, voxelSize, bounds } = lastVoxels;
      const gapRatio = state.voxelGapRatio;
      const geomSize = voxelSize * Math.max(0.02, 1 - gapRatio);
      const voxelGroup = new THREE.Group();

      let voxelSet = lastVoxels.voxelSet;
      let voxelColorMap = lastVoxels.voxelColorMap;
      if (!voxelSet || voxelSet.size === 0) {
        voxelSet = new Set();
        voxelColorMap = new Map();
        for (let i = 0; i < voxelCount; i += 1) {
          const ix = Math.round(positions[i * 3 + 0] / voxelSize);
          const iy = Math.round(positions[i * 3 + 1] / voxelSize);
          const iz = Math.round(positions[i * 3 + 2] / voxelSize);
          const key = keyFor(ix, iy, iz);
          voxelSet.add(key);
          const r = colors[i * 3 + 0] ?? 0.7;
          const g = colors[i * 3 + 1] ?? 0.7;
          const b = colors[i * 3 + 2] ?? 0.9;
          voxelColorMap.set(key, new THREE.Color(r, g, b));
        }
      }

      const { faceDefs } = makeFaceDefs(geomSize);
      const materialCache = new Map();
      const cameraPos = camera.getWorldPosition(new THREE.Vector3());

      for (const key of voxelSet) {
        const { x, y, z } = parseKey(key);
        const rawColor = voxelColorMap?.get(key);
        const color =
          rawColor instanceof THREE.Color ? rawColor : new THREE.Color(rawColor || "#c9d7f8");
        const colorKey = `${Math.round(color.r * 255)}-${Math.round(color.g * 255)}-${Math.round(
          color.b * 255
        )}`;
        const basePos = new THREE.Vector3(x * voxelSize, y * voxelSize, z * voxelSize);

        for (let i = 0; i < faceDefs.length; i += 1) {
          const face = faceDefs[i];
          if (voxelSet.has(keyFor(x + face.dx, y + face.dy, z + face.dz))) continue;
          const faceCenter = basePos.clone().add(face.offset);
          const toCamera = cameraPos.clone().sub(faceCenter);
          if (face.normal.dot(toCamera) <= 0) continue;

          const points = face.corners.map((corner) => corner.clone().add(basePos));
          const faceGeom = new THREE.BufferGeometry().setFromPoints(points);
          let mat = materialCache.get(colorKey);
          if (!mat) {
            mat = new THREE.LineBasicMaterial({ color });
            materialCache.set(colorKey, mat);
          }
          voxelGroup.add(new THREE.LineLoop(faceGeom, mat));
        }
      }

      svgScene.add(voxelGroup);

      if (state.groundEnabled) {
        const groundScale = Math.max(1, clampNum(state.groundScale, 2.8));
        const groundSize = lastGridExtent * 2 * groundScale;
        const groundYBase = bounds.min * voxelSize - voxelSize * 1.15;
        const groundY = groundYBase + clampNum(state.groundYOffset, 0);
        const groundColor = new THREE.Color("#00ff00");
        const groundOpacity = clamp01(state.groundOpacity, 0.92);
        const groundPlane = new THREE.PlaneGeometry(groundSize, groundSize, 1, 1);
        const groundMaterial = new THREE.MeshBasicMaterial({
          color: groundColor,
          transparent: groundOpacity < 1,
          opacity: groundOpacity,
          side: THREE.DoubleSide,
        });
        const groundMeshSvg = new THREE.Mesh(groundPlane, groundMaterial);
        groundMeshSvg.rotation.x = -Math.PI / 2;
        groundMeshSvg.position.set(0, groundY, 0);
        groundMeshSvg.renderOrder = -1;
        svgScene.add(groundMeshSvg);
      }

      return svgScene;
    }

    function buildShadowSvgScene() {
      const svgScene = new THREE.Scene();
      svgScene.background = null;

      if (!lastVoxels || lastVoxels.voxelCount <= 0 || !state.groundEnabled) {
        return svgScene;
      }

      const { positions, voxelCount, voxelSize, bounds } = lastVoxels;
      const gapRatio = state.voxelGapRatio;
      const geomSize = voxelSize * Math.max(0.02, 1 - gapRatio);
      const groundYBase = bounds.min * voxelSize - voxelSize * 1.15;
      const groundY = groundYBase + clampNum(state.groundYOffset, 0);
      // Direction from point on model toward light source (used for projection).
      const lightDir = getLightDirection(state.lightAzimuth, state.lightElevation);
      if (Math.abs(lightDir.y) <= 0.0001) return svgScene;

      const mergeMode = String(state.svgMergePaths || "none");
      const shadowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#000000"),
        side: THREE.DoubleSide,
      });
      const shadowGroup = new THREE.Group();
      const shadowGeoms = [];

      let voxelSet = lastVoxels.voxelSet;
      if (!voxelSet || voxelSet.size === 0) {
        voxelSet = new Set();
        for (let i = 0; i < voxelCount; i += 1) {
          const ix = Math.round(positions[i * 3 + 0] / voxelSize);
          const iy = Math.round(positions[i * 3 + 1] / voxelSize);
          const iz = Math.round(positions[i * 3 + 2] / voxelSize);
          voxelSet.add(keyFor(ix, iy, iz));
        }
      }

      // Single shadow algorithm:
      // project one ground quad for each surface-visible voxel, then hatch that output.
      const groundShadowGeom = new THREE.PlaneGeometry(geomSize, geomSize);
      groundShadowGeom.rotateX(-Math.PI / 2);

      for (const key of voxelSet) {
        const { x, y, z } = parseKey(key);
        // Skip enclosed voxels; they do not contribute visible shadow detail.
        if (
          voxelSet.has(keyFor(x + 1, y, z)) &&
          voxelSet.has(keyFor(x - 1, y, z)) &&
          voxelSet.has(keyFor(x, y + 1, z)) &&
          voxelSet.has(keyFor(x, y - 1, z)) &&
          voxelSet.has(keyFor(x, y, z + 1)) &&
          voxelSet.has(keyFor(x, y, z - 1))
        ) {
          continue;
        }

        const ix = x * voxelSize;
        const iy = y * voxelSize;
        const iz = z * voxelSize;
        const t = (groundY - iy) / lightDir.y;
        if (!Number.isFinite(t)) continue;
        const px = ix + lightDir.x * t;
        const py = groundY + voxelSize * 0.01;
        const pz = iz + lightDir.z * t;
        if (mergeMode === "none") {
          const shadowMesh = new THREE.Mesh(groundShadowGeom, shadowMat);
          shadowMesh.position.set(px, py, pz);
          shadowGroup.add(shadowMesh);
        } else {
          const g = groundShadowGeom.clone();
          g.translate(px, py, pz);
          shadowGeoms.push(g);
        }
      }

      if (mergeMode !== "none" && shadowGeoms.length > 0) {
        const merged = mergeGeometries(shadowGeoms, false);
        shadowGroup.add(new THREE.Mesh(merged, shadowMat));
      }

      svgScene.add(shadowGroup);
      return svgScene;
    }

    function showOverlay() {
      if (svgOverlayEl) svgOverlayEl.style.display = "block";
      previewEl.style.opacity = "0";
    }

    function hideOverlay() {
      if (svgOverlayEl) svgOverlayEl.style.display = "none";
      previewEl.style.opacity = "1";
    }

    function exportSvgToMount() {
      if (isExportingSvg) return;
      isExportingSvg = true;
      try {
        updateLightsFromState();

        const next = size();
        if (next.width !== width || next.height !== height) {
          width = next.width;
          height = next.height;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        }

        controls.update();
        camera.updateMatrixWorld();

        svgRenderer.setSize(width, height);
        svgRenderer.domElement.innerHTML = "";
        const svgScene = buildSvgScene();
        svgRenderer.render(svgScene, camera);
        disposeSvgScene(svgScene);

        const renderedSvg = svgRenderer.domElement;
        renderedSvg.classList.add("svg-overlay");
        renderedSvg.setAttribute("width", String(width));
        renderedSvg.setAttribute("height", String(height));
        renderedSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      renderedSvg.style.position = "absolute";
      renderedSvg.style.inset = "0";
      renderedSvg.style.zIndex = "3";
      renderedSvg.style.pointerEvents = "none";
      renderedSvg.style.display = state.showSvgOverlay ? "block" : "none";
      renderedSvg.style.width = "100%";
      renderedSvg.style.height = "100%";
      renderedSvg.style.background = "transparent";

        postProcessSvg(renderedSvg, state, width, height, "main");

        if (state.svgShadowEnabled) {
          shadowSvgRenderer.setSize(width, height);
          shadowSvgRenderer.domElement.innerHTML = "";
          const shadowScene = buildShadowSvgScene();
          shadowSvgRenderer.render(shadowScene, camera);
          disposeSvgScene(shadowScene);
          const shadowSvg = shadowSvgRenderer.domElement;
          postProcessSvg(shadowSvg, state, width, height, "shadow");
          while (shadowSvg.firstChild) {
            renderedSvg.appendChild(shadowSvg.firstChild);
          }
        }
        svgOverlayEl = renderedSvg;
        container.prepend(svgOverlayEl);
        showOverlay();
      } finally {
        isExportingSvg = false;
      }
    }

    state.__exportSvg = exportSvgToMount;
    state.__hideSvg = () => {
      state.showSvgOverlay = false;
      hideOverlay();
    };

    function onResize() {
      const next = size();
      width = next.width;
      height = next.height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      rebuild();
    }

    window.addEventListener("resize", onResize);

    let rafId = 0;
    function animate() {
      rafId = window.requestAnimationFrame(animate);
      controls.update();
      renderWebgl();
    }

    function rebuild() {
      scene.background = new THREE.Color(String(state.backgroundColor || "#f7f7fb"));
      buildSceneFromState();
      updateLightsFromState();
      renderWebgl();
      if (state.showSvgOverlay) {
        exportSvgToMount();
      } else {
        hideOverlay();
      }
    }

    rebuild();
    animate();

    const STATE_GROUPS = {
      geometry: new Set([
        "seed",
        "gridSize",
        "voxelSize",
        "voxelGapRatio",
        "materialMode",
        "presetCount",
        "placementMode",
        "shapeSpacing",
        "presetScale",
        "spawnSpread",
        "spawnBaseRatio",
        "shapeYawSteps",
        "erosionSteps",
        "erosionNeighbors",
        "dilationSteps",
        "dilationNeighbors",
        "surfaceNoise",
        "mirrorX",
        "mirrorZ",
        "rotateQuarterTurns",
        "randomSliceCount",
        "randomSliceThickness",
        "sliceRotX",
        "sliceRotY",
        "sliceRotZ",
      ]),
      camera: new Set(["cameraDistance", "cameraAzimuth", "cameraElevation"]),
      lights: new Set([
        "lightAzimuth",
        "lightElevation",
        "lightIntensity",
        "ambientIntensity",
        "lightDistance",
        "shadowExtent",
        "shadowNear",
        "shadowFar",
        "shadowMapSize",
        "shadowBias",
        "shadowNormalBias",
      ]),
      ground: new Set(["groundEnabled", "groundScale", "groundYOffset", "groundOpacity", "groundColor"]),
      background: new Set(["backgroundColor"]),
      slices: new Set(["showSliceVolumes"]),
      svg: new Set([
        "hatchDensity",
        "hatchAngleDeg",
        "svgStrokeWidth",
        "svgFillOpacity",
        "svgStroke",
        "svgLineMode",
        "svgCullInvisible",
        "svgCullMinSize",
        "svgShadowEnabled",
        "svgShadowDensity",
        "svgShadowAngleDeg",
        "svgShadowStrokeWidth",
        "svgShadowStroke",
        "svgMergePaths",
        "showSvgOverlay",
      ]),
    };

    function snapshotState() {
      return {
        seed: state.seed,
        gridSize: state.gridSize,
        voxelSize: state.voxelSize,
        voxelGapRatio: state.voxelGapRatio,
        materialMode: state.materialMode,
        presetCount: state.presetCount,
        placementMode: state.placementMode,
        shapeSpacing: state.shapeSpacing,
        presetScale: state.presetScale,
        spawnSpread: state.spawnSpread,
        spawnBaseRatio: state.spawnBaseRatio,
        shapeYawSteps: state.shapeYawSteps,
        erosionSteps: state.erosionSteps,
        erosionNeighbors: state.erosionNeighbors,
        dilationSteps: state.dilationSteps,
        dilationNeighbors: state.dilationNeighbors,
        surfaceNoise: state.surfaceNoise,
        mirrorX: state.mirrorX,
        mirrorZ: state.mirrorZ,
        rotateQuarterTurns: state.rotateQuarterTurns,
        randomSliceCount: state.randomSliceCount,
        sliceRotX: state.sliceRotX,
        sliceRotY: state.sliceRotY,
        sliceRotZ: state.sliceRotZ,
        cameraDistance: state.cameraDistance,
        cameraAzimuth: state.cameraAzimuth,
        cameraElevation: state.cameraElevation,
        groundEnabled: state.groundEnabled,
        groundScale: state.groundScale,
        groundYOffset: state.groundYOffset,
        groundOpacity: state.groundOpacity,
        groundColor: state.groundColor,
        backgroundColor: state.backgroundColor,
        lightAzimuth: state.lightAzimuth,
        lightElevation: state.lightElevation,
        lightIntensity: state.lightIntensity,
        ambientIntensity: state.ambientIntensity,
        lightDistance: state.lightDistance,
        shadowExtent: state.shadowExtent,
        shadowNear: state.shadowNear,
        shadowFar: state.shadowFar,
        shadowMapSize: state.shadowMapSize,
        shadowBias: state.shadowBias,
        shadowNormalBias: state.shadowNormalBias,
        hatchDensity: state.hatchDensity,
        hatchAngleDeg: state.hatchAngleDeg,
        svgStrokeWidth: state.svgStrokeWidth,
        svgFillOpacity: state.svgFillOpacity,
        svgStroke: state.svgStroke,
        svgLineMode: state.svgLineMode,
        svgCullInvisible: state.svgCullInvisible,
        svgCullMinSize: state.svgCullMinSize,
        svgShadowEnabled: state.svgShadowEnabled,
        svgShadowDensity: state.svgShadowDensity,
        svgShadowAngleDeg: state.svgShadowAngleDeg,
        svgShadowStrokeWidth: state.svgShadowStrokeWidth,
        svgShadowStroke: state.svgShadowStroke,
        svgMergePaths: state.svgMergePaths,
        showSvgOverlay: state.showSvgOverlay,
        randomSliceThickness: state.randomSliceThickness,
        showSliceVolumes: state.showSliceVolumes,
      };
    }

    function diffGroups(prev, next) {
      const changed = new Set();
      if (!prev) {
        changed.add("geometry");
        changed.add("camera");
        changed.add("lights");
        changed.add("ground");
        changed.add("background");
        changed.add("svg");
        return changed;
      }
      for (const [key, value] of Object.entries(next)) {
        if (prev[key] !== value) {
          for (const [group, keys] of Object.entries(STATE_GROUPS)) {
            if (keys.has(key)) changed.add(group);
          }
        }
      }
      return changed;
    }

    let lastStateSnapshot = snapshotState();

    return {
      render() {
        rebuild();
      },
      update(nextState) {
        // visualHelp already mutates `state` before calling update(); we
        // rebuild from the live state to keep scene + UI tightly in sync.
        const nextSnapshot = snapshotState();
        const changedGroups = diffGroups(lastStateSnapshot, nextSnapshot);
        lastStateSnapshot = nextSnapshot;

        if (changedGroups.has("geometry")) {
          rebuild();
          return;
        }

        if (changedGroups.has("background")) {
          scene.background = new THREE.Color(String(state.backgroundColor || "#f7f7fb"));
        }

        if (changedGroups.has("ground")) {
          disposeGround();
          if (state.groundEnabled && lastVoxels) {
            const { voxelSize, bounds } = lastVoxels;
            const groundScale = Math.max(1, clampNum(state.groundScale, 2.8));
            const groundSize = lastGridExtent * 2 * groundScale;
            const groundYBase = bounds.min * voxelSize - voxelSize * 1.15;
            const groundY = groundYBase + clampNum(state.groundYOffset, 0);
            const groundColor = new THREE.Color(String(state.groundColor || "#f2f3f7"));
            const groundOpacity = clamp01(state.groundOpacity, 0.92);

            groundGeom = new THREE.PlaneGeometry(groundSize, groundSize, 1, 1);
            groundMat = new THREE.MeshStandardMaterial({
              color: groundColor,
              transparent: groundOpacity < 1,
              opacity: groundOpacity,
              roughness: 0.95,
              metalness: 0.02,
              side: THREE.DoubleSide,
            });
            groundMesh = new THREE.Mesh(groundGeom, groundMat);
            groundMesh.receiveShadow = true;
            groundMesh.castShadow = false;
            groundMesh.rotation.x = -Math.PI / 2;
            groundMesh.position.set(0, groundY, 0);
            scene.add(groundMesh);
          }
        }

        if (changedGroups.has("camera") && !state.__cameraPose) {
          updateCameraFromState();
        }

        if (changedGroups.has("lights")) {
          updateLightsFromState();
        }

        if (changedGroups.has("slices")) {
          disposeSlices();
          if (state.showSliceVolumes && lastVoxels?.slices?.length) {
            const gridExtent = lastGridExtent;
            sliceGroup = new THREE.Group();
            const slabSize = gridExtent * 2.2;
            const slabMat = new THREE.MeshBasicMaterial({
              color: 0x111111,
              wireframe: true,
              transparent: true,
              opacity: 0.25,
            });
            lastVoxels.slices.forEach((slice) => {
              const thicknessWorld = slice.thickness * lastVoxels.voxelSize;
              const slabGeom = new THREE.BoxGeometry(slabSize, thicknessWorld, slabSize);
              const slab = new THREE.Mesh(slabGeom, slabMat.clone());
              const quat = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                slice.normal.clone().normalize()
              );
              slab.quaternion.copy(quat);
              const center = slice.normal
                .clone()
                .multiplyScalar(slice.offset * lastVoxels.voxelSize);
              slab.position.set(center.x, center.y, center.z);
              sliceGroup.add(slab);
            });
            scene.add(sliceGroup);
          }
        }

        if (changedGroups.has("svg")) {
          if (state.showSvgOverlay) {
            exportSvgToMount();
          } else {
            hideOverlay();
          }
        }

        renderWebgl();
      },
      destroy() {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener("resize", onResize);
        controls.dispose();
        disposeInstanced();
        disposeGround();
        renderer.dispose();
        previewEl.innerHTML = "";
        if (svgOverlayEl && svgOverlayEl.parentElement) {
          svgOverlayEl.remove();
        }
        svgOverlayEl = null;
        previewEl.remove();
        delete state.__exportSvg;
        delete state.__hideSvg;
      },
    };
  },
});
