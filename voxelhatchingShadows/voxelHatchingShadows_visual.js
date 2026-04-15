import { registerVisual } from "../helper/visualHelp.js";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";
import {
  ensureShapePlacementState,
  makeShapeInstanceFromTool,
  mountShapePlacementPanel,
} from "./shapePlacementPanel.js";

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

function addSphere(set, bounds, cx, cy, cz, radius, colorMap, colorValue) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.floor(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.floor(cy + radius);
  const minZ = Math.floor(cz - radius);
  const maxZ = Math.floor(cz + radius);
  const r2 = radius * radius;

  for (let x = minX; x <= maxX; x += 1) {
    if (x < bounds.min || x > bounds.max) continue;
    for (let y = minY; y <= maxY; y += 1) {
      if (y < bounds.min || y > bounds.max) continue;
      for (let z = minZ; z <= maxZ; z += 1) {
        if (z < bounds.min || z > bounds.max) continue;
        const dx = x - cx;
        const dy = y - cy;
        const dz = z - cz;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        const key = keyFor(x, y, z);
        set.add(key);
        if (colorMap && colorValue) colorMap.set(key, colorValue);
      }
    }
  }
}

function addCone(set, bounds, cx, baseY, cz, radius, height, colorMap, colorValue) {
  const maxY = Math.floor(baseY + height);
  for (let y = baseY; y <= maxY; y += 1) {
    if (y < bounds.min || y > bounds.max) continue;
    const t = height <= 0 ? 0 : (y - baseY) / height;
    const layerRadius = Math.max(0.5, radius * (1 - t));
    const minX = Math.floor(cx - layerRadius);
    const maxX = Math.floor(cx + layerRadius);
    const minZ = Math.floor(cz - layerRadius);
    const maxZ = Math.floor(cz + layerRadius);
    const r2 = layerRadius * layerRadius;
    for (let x = minX; x <= maxX; x += 1) {
      if (x < bounds.min || x > bounds.max) continue;
      for (let z = minZ; z <= maxZ; z += 1) {
        if (z < bounds.min || z > bounds.max) continue;
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz > r2) continue;
        const key = keyFor(x, y, z);
        set.add(key);
        if (colorMap && colorValue) colorMap.set(key, colorValue);
      }
    }
  }
}

function addRandomPolyhedron(set, bounds, cx, cy, cz, radius, rand, colorMap, colorValue) {
  const planeCount = 6 + Math.floor(rand() * 7);
  const planes = [];
  for (let i = 0; i < planeCount; i += 1) {
    const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (dir.lengthSq() < 0.0001) {
      i -= 1;
      continue;
    }
    dir.normalize();
    planes.push({
      normal: dir,
      limit: 0.42 + rand() * 0.55,
    });
  }

  const minX = Math.floor(cx - radius);
  const maxX = Math.floor(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.floor(cy + radius);
  const minZ = Math.floor(cz - radius);
  const maxZ = Math.floor(cz + radius);
  const invRadius = 1 / Math.max(1, radius);

  for (let x = minX; x <= maxX; x += 1) {
    if (x < bounds.min || x > bounds.max) continue;
    for (let y = minY; y <= maxY; y += 1) {
      if (y < bounds.min || y > bounds.max) continue;
      for (let z = minZ; z <= maxZ; z += 1) {
        if (z < bounds.min || z > bounds.max) continue;
        const px = (x - cx) * invRadius;
        const py = (y - cy) * invRadius;
        const pz = (z - cz) * invRadius;
        const dist = px * px + py * py + pz * pz;
        if (dist > 1.08) continue;
        let inside = true;
        for (let p = 0; p < planes.length; p += 1) {
          const plane = planes[p];
          const d = plane.normal.x * px + plane.normal.y * py + plane.normal.z * pz;
          if (d > plane.limit) {
            inside = false;
            break;
          }
        }
        if (!inside) continue;
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

function getSphereBounds(cx, cy, cz, radius) {
  return {
    minX: Math.floor(cx - radius),
    maxX: Math.floor(cx + radius),
    minY: Math.floor(cy - radius),
    maxY: Math.floor(cy + radius),
    minZ: Math.floor(cz - radius),
    maxZ: Math.floor(cz + radius),
  };
}

function getConeBounds(cx, baseY, cz, radius, height) {
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

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const SHAPE_PALETTE = [
  "#c9d7f8",
  "#a6e1d2",
  "#f4c7a1",
  "#f2a7c4",
  "#b2b1f5",
  "#f7e6a3",
];

const SHAPE_KEY_ALIAS = {
  shapeBoxTall: "boxTall",
  shapeSlab: "slab",
  shapeCylinder: "cylinder",
  shapePyramid: "pyramid",
  shapeSphere: "sphere",
  shapeCone: "cone",
  shapePoly: "poly",
};

function normalizeShapeKey(value) {
  const raw = String(value || "").trim();
  const key = SHAPE_KEY_ALIAS[raw] || raw;
  if (["boxTall", "slab", "cylinder", "pyramid", "sphere", "cone", "poly"].includes(key)) {
    return key;
  }
  return "boxTall";
}

function normalizeShapeStretch(stretch) {
  return {
    x: Math.max(0.25, numOr(stretch?.x, 1)),
    y: Math.max(0.25, numOr(stretch?.y, 1)),
    z: Math.max(0.25, numOr(stretch?.z, 1)),
  };
}

function normalizeShapeRotation(rotation) {
  return {
    x: numOr(rotation?.x, 0),
    y: numOr(rotation?.y, 0),
    z: numOr(rotation?.z, 0),
  };
}

function normalizeShapePosition(position, bounds) {
  return {
    x: Math.max(bounds.min, Math.min(bounds.max, Math.round(numOr(position?.x, 0)))),
    y: Math.max(bounds.min, Math.min(bounds.max, Math.round(numOr(position?.y, 0)))),
    z: Math.max(bounds.min, Math.min(bounds.max, Math.round(numOr(position?.z, 0)))),
  };
}

function getGridBoundsFromState(state) {
  const gridSize = Math.max(4, Math.floor(numOr(state?.gridSize, 40)));
  const half = Math.floor(gridSize / 2);
  return { min: -half, max: half };
}

function getGroundYBase(bounds, voxelSize) {
  return bounds.min * voxelSize - voxelSize * 1.15;
}

function getGroundY(state, bounds, voxelSize) {
  return getGroundYBase(bounds, voxelSize) + numOr(state?.groundYOffset, 0);
}

function estimateShapeHeightInVoxels(shapeTool) {
  const shape = normalizeShapeKey(shapeTool?.shape);
  const scale = Math.max(0.25, numOr(shapeTool?.scale, 1));
  const stretch = normalizeShapeStretch(shapeTool?.stretch);
  const rotation = normalizeShapeRotation(shapeTool?.rotation);

  if (shape === "boxTall" || shape === "slab") {
    const base = shape === "boxTall" ? { sx: 8, sy: 18, sz: 8 } : { sx: 18, sy: 4, sz: 18 };
    let sx = Math.max(2, Math.round(base.sx * scale * stretch.x));
    let sy = Math.max(2, Math.round(base.sy * scale * stretch.y));
    let sz = Math.max(2, Math.round(base.sz * scale * stretch.z));
    ({ sx, sy, sz } = applyQuarterTurnSwaps({ sx, sy, sz }, rotation));
    return sy;
  }
  if (shape === "cylinder") return Math.max(4, Math.round(18 * scale * stretch.y));
  if (shape === "pyramid") return Math.max(4, Math.round(14 * scale * stretch.y));
  if (shape === "cone") return Math.max(4, Math.round(16 * scale * stretch.y));
  if (shape === "sphere" || shape === "poly") {
    const radius = Math.max(2, Math.round(8 * scale * Math.max(stretch.x, stretch.y, stretch.z)));
    return radius * 2;
  }
  return 8;
}

function getDefaultShapeCursorYOnGround(state, bounds) {
  const voxelSize = Math.max(1, numOr(state?.voxelSize, 100));
  const groundVoxelY = getGroundY(state, bounds, voxelSize) / voxelSize;
  const shapeHeight = estimateShapeHeightInVoxels(state?.shapeTool || {});
  const centerY = Math.round(groundVoxelY + Math.max(1, Math.floor(shapeHeight * 0.5)));
  return Math.max(bounds.min, Math.min(bounds.max, centerY));
}

function snapShapeToolCursorToGround(state) {
  ensureShapePlacementState(state);
  if (state.groundEnabled === false) return;
  const bounds = getGridBoundsFromState(state);
  state.shapeTool.cursor.y = getDefaultShapeCursorYOnGround(state, bounds);
}

function hasOddQuarterTurn(deg) {
  const turns = Math.round(numOr(deg, 0) / 90);
  return Math.abs(turns) % 2 === 1;
}

function applyQuarterTurnSwaps(size, rotation) {
  let { sx, sy, sz } = size;
  if (hasOddQuarterTurn(rotation?.x)) [sy, sz] = [sz, sy];
  if (hasOddQuarterTurn(rotation?.y)) [sx, sz] = [sz, sx];
  if (hasOddQuarterTurn(rotation?.z)) [sx, sy] = [sy, sx];
  return { sx, sy, sz };
}

function wrapIndex(value, length) {
  if (!length) return 0;
  const mod = value % length;
  return mod < 0 ? mod + length : mod;
}

function pickWeighted(items, rand) {
  let total = 0;
  for (let i = 0; i < items.length; i += 1) total += Math.max(0, items[i].chance);
  if (total <= 0) return null;
  let roll = rand() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= Math.max(0, items[i].chance);
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1] || null;
}

function generateProceduralShapeInstances(state, bounds, seed) {
  const count = Math.max(0, Math.floor(numOr(state.proceduralShapeCount, 12)));
  if (count <= 0) return [];

  const rand = mulberry32((seed ^ 0x6f3d4c51) >>> 0);
  const spread = clamp01(numOr(state.proceduralSpread, 1), 1);
  const baseRatio = clamp01(numOr(state.proceduralBaseRatio, 0.05), 0.05);
  const scaleMult = Math.max(0.1, numOr(state.proceduralScale, 1));
  const yawSteps = Math.max(0, Math.floor(numOr(state.proceduralYawSteps, 2)));
  const halfSpan = Math.max(1, Math.floor((bounds.max - bounds.min) * 0.5));
  const baseY = Math.floor(bounds.min + (bounds.max - bounds.min) * baseRatio);
  const paletteLength = Math.max(1, SHAPE_PALETTE.length);

  const specs = [
    { shape: "boxTall", chance: 24, scaleMin: 0.8, scaleMax: 1.4, sy: [10, 22], sxz: [3, 10] },
    { shape: "slab", chance: 22, scaleMin: 0.8, scaleMax: 1.35, sy: [2, 7], sxz: [10, 22] },
    { shape: "cylinder", chance: 18, scaleMin: 0.75, scaleMax: 1.35, radius: [4, 10], height: [8, 22] },
    { shape: "pyramid", chance: 12, scaleMin: 0.75, scaleMax: 1.3, base: [8, 18], height: [8, 18] },
    { shape: "sphere", chance: 10, scaleMin: 0.7, scaleMax: 1.3, radius: [5, 12], yLift: 0.25 },
    { shape: "cone", chance: 8, scaleMin: 0.7, scaleMax: 1.35, radius: [4, 11], height: [8, 22] },
    { shape: "poly", chance: 6, scaleMin: 0.65, scaleMax: 1.25, radius: [6, 14], yLift: 0.3 },
  ];

  const instances = [];
  for (let i = 0; i < count; i += 1) {
    const spec = pickWeighted(specs, rand) || specs[0];
    const scale = THREE.MathUtils.lerp(spec.scaleMin, spec.scaleMax, rand()) * scaleMult;
    const x = Math.round((rand() * 2 - 1) * halfSpan * spread);
    const z = Math.round((rand() * 2 - 1) * halfSpan * spread);
    const yawStep = yawSteps > 1 ? Math.floor(rand() * yawSteps) : 0;
    const rotationY = yawStep * 90;

    let y = baseY;
    if (spec.shape === "sphere" || spec.shape === "poly") {
      y += Math.floor((bounds.max - bounds.min) * spec.yLift * rand());
    } else if (spec.shape === "slab") {
      y += Math.floor((bounds.max - bounds.min) * 0.5 * rand());
    } else if (spec.shape === "boxTall") {
      y += Math.floor((bounds.max - bounds.min) * 0.18 * rand());
    } else if (spec.shape === "cylinder" || spec.shape === "pyramid" || spec.shape === "cone") {
      y += Math.floor((bounds.max - bounds.min) * 0.12 * rand());
    }

    const stretch = { x: 1, y: 1, z: 1 };
    if (spec.sxz) {
      const sx = Math.max(2, Math.floor((spec.sxz[0] + rand() * (spec.sxz[1] - spec.sxz[0])) * scale));
      const sz = Math.max(2, Math.floor((spec.sxz[0] + rand() * (spec.sxz[1] - spec.sxz[0])) * scale));
      const sy = Math.max(2, Math.floor((spec.sy[0] + rand() * (spec.sy[1] - spec.sy[0])) * scale));
      stretch.x = sx / Math.max(1, Math.round((spec.shape === "slab" ? 18 : 8) * scale));
      stretch.y = sy / Math.max(1, Math.round((spec.shape === "slab" ? 4 : 18) * scale));
      stretch.z = sz / Math.max(1, Math.round((spec.shape === "slab" ? 18 : 8) * scale));
    }

    instances.push({
      shape: spec.shape,
      position: { x, y, z },
      rotation: { x: 0, y: rotationY, z: 0 },
      scale,
      stretch,
      colorIndex: i % paletteLength,
    });
  }

  return instances;
}

function buildVoxelSet(state) {
  ensureShapePlacementState(state);
  const gridSize = state.gridSize;
  const half = Math.floor(gridSize / 2);
  const bounds = { min: -half, max: half };
  const seed = clampInt(state.seed, 12345, 0, 999999999);

  let set = new Set();
  let colorMap = new Map();
  const shapeBounds = [];
  const placementMode = String(state.placementMode || "allow");
  const shapeSpacing = Math.max(0, Math.floor(numOr(state.shapeSpacing, 0)));

  const fallbackInstance = makeShapeInstanceFromTool(state.shapeTool || {});
  const manualInstances = Array.isArray(state.shapeInstances) ? state.shapeInstances : [];
  const proceduralInstances = state.autoProceduralShapes === true
    ? generateProceduralShapeInstances(state, bounds, seed)
    : [];
  const rawInstances = [...proceduralInstances, ...manualInstances];
  if (rawInstances.length === 0) rawInstances.push(fallbackInstance);

  for (let i = 0; i < rawInstances.length; i += 1) {
    const raw = rawInstances[i] || {};
    const shape = normalizeShapeKey(raw.shape || fallbackInstance.shape);
    const position = normalizeShapePosition(raw.position || raw.cursor || fallbackInstance.position, bounds);
    const rotation = normalizeShapeRotation(raw.rotation || fallbackInstance.rotation);
    const stretch = normalizeShapeStretch(raw.stretch || fallbackInstance.stretch);
    const scale = Math.max(0.25, numOr(raw.scale, fallbackInstance.scale));
    const colorIndex = wrapIndex(Math.round(numOr(raw.colorIndex, i)), SHAPE_PALETTE.length);
    const shapeColor = SHAPE_PALETTE[colorIndex];

    if (shape === "boxTall" || shape === "slab") {
      const base = shape === "boxTall"
        ? { sx: 8, sy: 18, sz: 8 }
        : { sx: 18, sy: 4, sz: 18 };
      let sx = Math.max(2, Math.round(base.sx * scale * stretch.x));
      let sy = Math.max(2, Math.round(base.sy * scale * stretch.y));
      let sz = Math.max(2, Math.round(base.sz * scale * stretch.z));
      ({ sx, sy, sz } = applyQuarterTurnSwaps({ sx, sy, sz }, rotation));
      const boxBounds = getBoxBounds(position.x, position.y, position.z, sx, sy, sz);
      if (placementMode !== "allow") {
        if (
          shapeBounds.some((b) =>
            boundsIntersect(boxBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
          )
        ) continue;
        if (placementMode === "no-overlap" && !canPlaceBox(set, bounds, position.x, position.y, position.z, sx, sy, sz)) continue;
      }
      addBox(set, bounds, position.x, position.y, position.z, sx, sy, sz, colorMap, shapeColor);
      shapeBounds.push(boxBounds);
      continue;
    }

    if (shape === "cylinder") {
      const radius = Math.max(2, Math.round(7 * scale * Math.max(stretch.x, stretch.z)));
      const height = Math.max(4, Math.round(18 * scale * stretch.y));
      const baseY = position.y - Math.floor(height * 0.5);
      const cylBounds = getCylinderBounds(position.x, baseY, position.z, radius, height);
      if (placementMode !== "allow") {
        if (
          shapeBounds.some((b) =>
            boundsIntersect(cylBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
          )
        ) continue;
        if (placementMode === "no-overlap" && !canPlaceCylinder(set, bounds, position.x, baseY, position.z, radius, height)) continue;
      }
      addCylinder(set, bounds, position.x, baseY, position.z, radius, height, colorMap, shapeColor);
      shapeBounds.push(cylBounds);
      continue;
    }

    if (shape === "pyramid") {
      const baseSize = Math.max(4, Math.round(16 * scale * Math.max(stretch.x, stretch.z)));
      const height = Math.max(4, Math.round(14 * scale * stretch.y));
      const baseY = position.y - Math.floor(height * 0.5);
      const pyrBounds = getPyramidBounds(position.x, baseY, position.z, baseSize, height);
      if (placementMode !== "allow") {
        if (
          shapeBounds.some((b) =>
            boundsIntersect(pyrBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
          )
        ) continue;
        if (placementMode === "no-overlap" && !canPlaceBox(set, bounds, position.x, position.y, position.z, baseSize, height, baseSize)) continue;
      }
      addPyramid(set, bounds, position.x, baseY, position.z, baseSize, height, colorMap, shapeColor);
      shapeBounds.push(pyrBounds);
      continue;
    }

    if (shape === "sphere") {
      const radius = Math.max(2, Math.round(8 * scale * Math.max(stretch.x, stretch.y, stretch.z)));
      const sphereBounds = getSphereBounds(position.x, position.y, position.z, radius);
      if (placementMode !== "allow") {
        if (
          shapeBounds.some((b) =>
            boundsIntersect(sphereBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
          )
        ) continue;
        if (placementMode === "no-overlap" && !canPlaceBox(set, bounds, position.x, position.y, position.z, radius * 2, radius * 2, radius * 2)) continue;
      }
      addSphere(set, bounds, position.x, position.y, position.z, radius, colorMap, shapeColor);
      shapeBounds.push(sphereBounds);
      continue;
    }

    if (shape === "cone") {
      const radius = Math.max(2, Math.round(7 * scale * Math.max(stretch.x, stretch.z)));
      const height = Math.max(4, Math.round(16 * scale * stretch.y));
      const baseY = position.y - Math.floor(height * 0.5);
      const coneBounds = getConeBounds(position.x, baseY, position.z, radius, height);
      if (placementMode !== "allow") {
        if (
          shapeBounds.some((b) =>
            boundsIntersect(coneBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
          )
        ) continue;
        if (placementMode === "no-overlap" && !canPlaceBox(set, bounds, position.x, position.y, position.z, radius * 2, height, radius * 2)) continue;
      }
      addCone(set, bounds, position.x, baseY, position.z, radius, height, colorMap, shapeColor);
      shapeBounds.push(coneBounds);
      continue;
    }

    const radius = Math.max(2, Math.round(8 * scale * Math.max(stretch.x, stretch.y, stretch.z)));
    const polyBounds = getSphereBounds(position.x, position.y, position.z, radius);
    if (placementMode !== "allow") {
      if (
        shapeBounds.some((b) =>
          boundsIntersect(polyBounds, b, placementMode === "spacing" ? shapeSpacing : 0)
        )
      ) continue;
      if (placementMode === "no-overlap" && !canPlaceBox(set, bounds, position.x, position.y, position.z, radius * 2, radius * 2, radius * 2)) continue;
    }
    const polyRand = mulberry32((seed + i * 0x9e3779b9) >>> 0);
    addRandomPolyhedron(set, bounds, position.x, position.y, position.z, radius, polyRand, colorMap, shapeColor);
    shapeBounds.push(polyBounds);
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
    const colorPick = colorMap.get(keyFor(x, y, z)) || SHAPE_PALETTE[0];
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

function readSvgPaintValue(node, attrName, cssProp = attrName) {
  const attrValue = node.getAttribute(attrName);
  if (attrValue != null) {
    const raw = String(attrValue).trim();
    if (raw !== "") return raw;
  }

  const inlineValue = node.style?.getPropertyValue?.(cssProp);
  if (inlineValue != null) {
    const raw = String(inlineValue).trim();
    if (raw !== "") return raw;
  }

  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const computedValue = window.getComputedStyle(node).getPropertyValue(cssProp);
    if (computedValue != null) {
      const raw = String(computedValue).trim();
      if (raw !== "") return raw;
    }
  }

  return "";
}

function elementHasVisiblePaint(node) {
  const toFinite = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const toUnit = (value, fallback) => Math.max(0, Math.min(1, toFinite(value, fallback)));

  const opacity = toUnit(readSvgPaintValue(node, "opacity"), 1);
  if (opacity <= 0) return false;

  const fill = String(readSvgPaintValue(node, "fill")).toLowerCase();
  const fillOpacity = toUnit(readSvgPaintValue(node, "fill-opacity"), 1);
  const hasFill = fill !== "" && fill !== "none" && fillOpacity > 0;

  const stroke = String(readSvgPaintValue(node, "stroke")).toLowerCase();
  const strokeOpacity = toUnit(readSvgPaintValue(node, "stroke-opacity"), 1);
  const strokeWidth = Math.max(0, toFinite(readSvgPaintValue(node, "stroke-width"), 0));
  const hasStroke = stroke !== "" && stroke !== "none" && strokeOpacity > 0 && strokeWidth > 0;

  return hasFill || hasStroke;
}

function getSvgCullBounds(svgEl, width, height) {
  const parseFinite = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const viewBoxRaw = String(svgEl.getAttribute("viewBox") || "").trim();
  if (viewBoxRaw) {
    const parts = viewBoxRaw.split(/[\s,]+/).map(Number);
    if (parts.length >= 4 && parts.every((n) => Number.isFinite(n))) {
      const [, , vbWidth, vbHeight] = parts;
      if (vbWidth > 0 && vbHeight > 0) {
        const [vbX, vbY] = parts;
        return {
          minX: vbX,
          minY: vbY,
          maxX: vbX + vbWidth,
          maxY: vbY + vbHeight,
        };
      }
    }
  }

  const w = Math.max(0, parseFinite(width, 0));
  const h = Math.max(0, parseFinite(height, 0));
  return {
    minX: 0,
    minY: 0,
    maxX: w,
    maxY: h,
  };
}

function cullSvgElements(svgEl, width, height, minSize) {
  if (!svgEl) return;
  const rawMinSize = Number(clampNum(minSize, 0));
  const sizeCutoff = Number.isFinite(rawMinSize) ? Math.max(0, rawMinSize) : 0;
  const bounds = getSvgCullBounds(svgEl, width, height);
  const targets = Array.from(
    svgEl.querySelectorAll("path, line, polyline, polygon, rect, circle, ellipse")
  );
  for (const node of targets) {
    const rawDisplay = String(readSvgPaintValue(node, "display")).toLowerCase();
    const rawVisibility = String(readSvgPaintValue(node, "visibility")).toLowerCase();
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
    // Keep perfectly horizontal/vertical strokes (one bbox dimension can be 0).
    // Only cull truly degenerate geometry where both dimensions collapse.
    if (bw <= 0 && bh <= 0) {
      node.remove();
      continue;
    }
    if (sizeCutoff > 0 && Math.max(bw, bh) < sizeCutoff) {
      node.remove();
      continue;
    }

    const strokeWidth = Math.max(0, Number(readSvgPaintValue(node, "stroke-width")) || 0);
    const strokePad = strokeWidth * 0.5;
    const outOfView =
      bbox.x + bw < bounds.minX - strokePad ||
      bbox.y + bh < bounds.minY - strokePad ||
      bbox.x > bounds.maxX + strokePad ||
      bbox.y > bounds.maxY + strokePad;
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
  const svgLineMode = String(state.svgLineMode || "solid");
  const wireframeMode = svgLineMode === "wireframe";
  const cullInvisible = state.svgCullInvisible !== false;
  const cullMinSize = clampNum(state.svgCullMinSize, 0);

  const groundPick = "#00ff00";
  const shadowStrokeWidth = Math.max(0.1, clampNum(state.svgShadowStrokeWidth, strokeWidth));
  const shadowStrokeColor = String(state.svgShadowStroke || "#111111");

  const targets = Array.from(
    svgEl.querySelectorAll("path, line, polyline, polygon, rect, circle, ellipse")
  );
  const groundNodes = [];
  const applyStroke = (node, color, widthPx) => {
    node.setAttribute("stroke", color);
    node.setAttribute("stroke-width", String(widthPx));
    // SVGRenderer often emits inline style declarations that override attributes.
    node.style.setProperty("stroke", color);
    node.style.setProperty("stroke-width", String(widthPx));
  };

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
      const widthPx = wireframeMode ? Math.max(0.1, shadowStrokeWidth * 0.9) : shadowStrokeWidth;
      applyStroke(node, shadowStrokeColor, widthPx);
    } else {
      const strokeColor =
        strokeColorRaw === "auto" || strokeColorRaw === ""
          ? (wireframeMode ? "#111111" : existingStroke || existingFill)
          : strokeColorRaw;
      const widthPx = wireframeMode ? Math.max(0.1, strokeWidth * 0.9) : strokeWidth;
      if (strokeColor) applyStroke(node, strokeColor, widthPx);
    }
    node.removeAttribute("stroke-dasharray");
    node.removeAttribute("stroke-dashoffset");
    node.style.removeProperty("stroke-dasharray");
    node.style.removeProperty("stroke-dashoffset");
    node.setAttribute("stroke-linecap", "round");
    node.setAttribute("stroke-linejoin", "round");
    node.style.setProperty("stroke-linecap", "round");
    node.style.setProperty("stroke-linejoin", "round");
    if (isShadow) {
      // Keep shadow output as stroke-only linework.
      node.setAttribute("fill", "none");
      node.setAttribute("fill-opacity", "0");
      node.style.setProperty("fill", "none");
      node.style.setProperty("fill-opacity", "0");
    } else {
      // SVGRenderer fills meshes by default; force outline-only so the
      // overlay doesn't turn everything into solid black shapes.
      node.setAttribute("fill", "none");
      node.setAttribute("fill-opacity", String(fillOpacity));
      node.style.setProperty("fill", "none");
      node.style.setProperty("fill-opacity", String(fillOpacity));
    }

  });

  if (groundNodes.length > 0) {
    // Keep the ground plane as an internal shadow receiver only.
    // We remove any rendered ground primitives and do not add a visible replacement.
    groundNodes.forEach((node) => node.remove());
  }

  if (cullInvisible) {
    cullSvgElements(svgEl, width, height, cullMinSize);
  }
}

registerVisual("voxelHatchingShadows", {
  title: "Voxel Hatching Shadows",
  description:
    "Voxel primitives exported to SVG as camera-visible closed face loops with line-hatched ground shadows.",
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
      default: 40,
      min: 12,
      max: 500,
      step: 1,
      category: "Scene",
    },
    {
      key: "voxelSize",
      label: "voxel size",
      type: "number",
      default: 100,
      min: 2,
      max: 24,
      step: 1,
      category: "Scene",
    },
    {
      key: "voxelGapRatio",
      label: "voxel gap",
      type: "number",
      default: 0.3,
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
      key: "autoProceduralShapes",
      label: "auto procedural shapes",
      type: "boolean",
      default: true,
      category: "Primitives",
      description: "Automatically seed random shape instances from the current seed.",
    },
    {
      key: "proceduralShapeCount",
      label: "procedural count",
      type: "number",
      default: 12,
      min: 0,
      max: 80,
      step: 1,
      category: "Primitives",
    },
    {
      key: "proceduralScale",
      label: "procedural scale",
      type: "number",
      default: 1,
      min: 0.2,
      max: 3,
      step: 0.01,
      category: "Primitives",
    },
    {
      key: "proceduralSpread",
      label: "procedural spread",
      type: "number",
      default: 1,
      min: 0.2,
      max: 1,
      step: 0.01,
      category: "Primitives",
    },
    {
      key: "proceduralBaseRatio",
      label: "procedural base height",
      type: "number",
      default: 0.05,
      min: 0,
      max: 0.5,
      step: 0.01,
      category: "Primitives",
    },
    {
      key: "proceduralYawSteps",
      label: "procedural yaw steps",
      type: "number",
      default: 2,
      min: 0,
      max: 4,
      step: 1,
      category: "Primitives",
      description: "Rotate procedural shapes around Y in 90 degree increments.",
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
      max: 200000,
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
      default: 20,
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
      default: "solid",
      options: ["solid", "wireframe"],
      category: "SVG",
      description: "solid = source line colors, wireframe = monochrome linework.",
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
      label: "shadow overlay",
      type: "boolean",
      default: false,
      category: "SVG",
      description: "Project a simple shadow onto the ground.",
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
      key: "svgShadowHatchSpacingRatio",
      label: "shadow hatch spacing",
      type: "number",
      default: 0.22,
      min: 0.05,
      max: 0.9,
      step: 0.01,
      category: "SVG",
      description: "Line spacing as a fraction of projected voxel width.",
    },
    {
      key: "svgShadowHatchAngle",
      label: "shadow hatch angle",
      type: "number",
      default: 35,
      min: -90,
      max: 90,
      step: 1,
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
    shapeTool: {
      mode: "translate",
      shape: "boxTall",
      cursor: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1.2,
      stretch: { x: 1, y: 1.2, z: 1 },
      colorIndex: 0,
    },
    shapeInstances: [],
    autoProceduralShapes: true,
    proceduralShapeCount: 12,
    proceduralScale: 1,
    proceduralSpread: 1,
    proceduralBaseRatio: 0.05,
    proceduralYawSteps: 2,
    shapePanelCollapsed: false,
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
      navHidden: true,
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

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200000);
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
    controls.maxDistance = Infinity;
    controls.target.set(0, 120, 0);

    if (!state.__cameraPoseMeta) {
      state.__cameraPoseMeta = getCameraParamSnapshot();
    }
    controls.addEventListener("change", () => {
      updateCameraClipPlanes();
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
    let shapeEditorPanel = null;
    let transformControls = null;
    let shapeMarker = null;
    let shapeMarkerGeom = null;
    let shapeMarkerMat = null;
    let shapePreviewMesh = null;
    let shapePreviewGeom = null;
    let shapePreviewMat = null;
    let syncingMarkerFromState = false;

    ensureShapePlacementState(state);
    if (
      state.__shapeCursorSeededToGround !== true &&
      (!Array.isArray(state.shapeInstances) || state.shapeInstances.length === 0)
    ) {
      snapShapeToolCursorToGround(state);
      state.__shapeCursorSeededToGround = true;
    }

    function getGridHalf() {
      return Math.floor(Math.max(4, numOr(state.gridSize, 40)) / 2);
    }

    function clampShapeCursorToGrid() {
      const half = getGridHalf();
      const cursor = state.shapeTool?.cursor || { x: 0, y: 0, z: 0 };
      cursor.x = Math.max(-half, Math.min(half, Math.round(numOr(cursor.x, 0))));
      cursor.y = Math.max(-half, Math.min(half, Math.round(numOr(cursor.y, 0))));
      cursor.z = Math.max(-half, Math.min(half, Math.round(numOr(cursor.z, 0))));
      state.shapeTool.cursor = cursor;
    }

    function applyTransformModeFromState() {
      if (!transformControls) return;
      const mode = state.shapeTool?.mode === "rotate" ? "rotate" : "translate";
      transformControls.setMode(mode);
    }

    function syncMarkerFromState() {
      if (!shapeMarker || !state.shapeTool) return;
      clampShapeCursorToGrid();
      const voxelSize = Math.max(1, numOr(state.voxelSize, 100));
      syncingMarkerFromState = true;
      shapeMarker.position.set(
        state.shapeTool.cursor.x * voxelSize,
        state.shapeTool.cursor.y * voxelSize,
        state.shapeTool.cursor.z * voxelSize
      );
      shapeMarker.rotation.set(
        THREE.MathUtils.degToRad(numOr(state.shapeTool.rotation?.x, 0)),
        THREE.MathUtils.degToRad(numOr(state.shapeTool.rotation?.y, 0)),
        THREE.MathUtils.degToRad(numOr(state.shapeTool.rotation?.z, 0))
      );
      shapeMarker.scale.setScalar(Math.max(8, voxelSize * 0.16));
      if (transformControls) {
        transformControls.setTranslationSnap(voxelSize);
        transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
      }
      syncingMarkerFromState = false;
    }

    function updateStateFromMarker() {
      if (!shapeMarker || !state.shapeTool) return;
      const voxelSize = Math.max(1, numOr(state.voxelSize, 100));
      const half = getGridHalf();
      state.shapeTool.cursor = {
        x: Math.max(-half, Math.min(half, Math.round(shapeMarker.position.x / voxelSize))),
        y: Math.max(-half, Math.min(half, Math.round(shapeMarker.position.y / voxelSize))),
        z: Math.max(-half, Math.min(half, Math.round(shapeMarker.position.z / voxelSize))),
      };
      state.shapeTool.rotation = {
        x: THREE.MathUtils.radToDeg(shapeMarker.rotation.x),
        y: THREE.MathUtils.radToDeg(shapeMarker.rotation.y),
        z: THREE.MathUtils.radToDeg(shapeMarker.rotation.z),
      };
      syncMarkerFromState();
      updateShapePreviewFromTool();
      shapeEditorPanel?.sync();
    }

    function disposeShapePreview() {
      if (shapePreviewMesh) scene.remove(shapePreviewMesh);
      shapePreviewMesh = null;
      if (shapePreviewGeom) shapePreviewGeom.dispose();
      if (shapePreviewMat) shapePreviewMat.dispose();
      shapePreviewGeom = null;
      shapePreviewMat = null;
    }

    function updateShapePreviewFromTool() {
      if (!state.shapeTool || !shapeMarker) return;
      disposeShapePreview();

      const shape = normalizeShapeKey(state.shapeTool.shape);
      const scale = Math.max(0.25, numOr(state.shapeTool.scale, 1));
      const stretch = normalizeShapeStretch(state.shapeTool.stretch);
      const rotation = normalizeShapeRotation(state.shapeTool.rotation);
      const voxelSize = Math.max(1, numOr(state.voxelSize, 100));
      const colorIndex = wrapIndex(Math.round(numOr(state.shapeTool.colorIndex, 0)), SHAPE_PALETTE.length);
      const previewColor = new THREE.Color(SHAPE_PALETTE[colorIndex]);

      if (shape === "boxTall" || shape === "slab") {
        const base = shape === "boxTall" ? { sx: 8, sy: 18, sz: 8 } : { sx: 18, sy: 4, sz: 18 };
        let sx = Math.max(2, Math.round(base.sx * scale * stretch.x));
        let sy = Math.max(2, Math.round(base.sy * scale * stretch.y));
        let sz = Math.max(2, Math.round(base.sz * scale * stretch.z));
        ({ sx, sy, sz } = applyQuarterTurnSwaps({ sx, sy, sz }, rotation));
        shapePreviewGeom = new THREE.BoxGeometry(sx * voxelSize, sy * voxelSize, sz * voxelSize);
      } else if (shape === "cylinder") {
        const radius = Math.max(2, Math.round(7 * scale * Math.max(stretch.x, stretch.z)));
        const height = Math.max(4, Math.round(18 * scale * stretch.y));
        shapePreviewGeom = new THREE.CylinderGeometry(radius * voxelSize, radius * voxelSize, height * voxelSize, 22);
      } else if (shape === "pyramid") {
        const baseSize = Math.max(4, Math.round(16 * scale * Math.max(stretch.x, stretch.z)));
        const height = Math.max(4, Math.round(14 * scale * stretch.y));
        shapePreviewGeom = new THREE.ConeGeometry(baseSize * 0.5 * voxelSize, height * voxelSize, 4);
      } else if (shape === "sphere") {
        const radius = Math.max(2, Math.round(8 * scale * Math.max(stretch.x, stretch.y, stretch.z)));
        shapePreviewGeom = new THREE.SphereGeometry(radius * voxelSize, 20, 14);
      } else if (shape === "cone") {
        const radius = Math.max(2, Math.round(7 * scale * Math.max(stretch.x, stretch.z)));
        const height = Math.max(4, Math.round(16 * scale * stretch.y));
        shapePreviewGeom = new THREE.ConeGeometry(radius * voxelSize, height * voxelSize, 20);
      } else {
        const radius = Math.max(2, Math.round(8 * scale * Math.max(stretch.x, stretch.y, stretch.z)));
        shapePreviewGeom = new THREE.IcosahedronGeometry(radius * voxelSize, 0);
      }

      shapePreviewMat = new THREE.MeshBasicMaterial({
        color: previewColor,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      });
      shapePreviewMesh = new THREE.Mesh(shapePreviewGeom, shapePreviewMat);
      shapePreviewMesh.position.copy(shapeMarker.position);
      shapePreviewMesh.rotation.set(
        THREE.MathUtils.degToRad(Math.round(numOr(rotation.x, 0) / 5) * 5),
        THREE.MathUtils.degToRad(Math.round(numOr(rotation.y, 0) / 5) * 5),
        THREE.MathUtils.degToRad(Math.round(numOr(rotation.z, 0) / 5) * 5)
      );
      shapePreviewMesh.renderOrder = 998;
      scene.add(shapePreviewMesh);
    }

    function createMarkerAndGizmo() {
      shapeMarkerGeom = new THREE.SphereGeometry(1, 14, 10);
      shapeMarkerMat = new THREE.MeshBasicMaterial({
        color: 0xffd66a,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      });
      shapeMarker = new THREE.Mesh(shapeMarkerGeom, shapeMarkerMat);
      shapeMarker.renderOrder = 999;
      scene.add(shapeMarker);

      transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.addEventListener("dragging-changed", (event) => {
        controls.enabled = !event.value;
      });
      transformControls.addEventListener("objectChange", () => {
        if (syncingMarkerFromState) return;
        updateStateFromMarker();
        renderWebgl();
      });
      scene.add(transformControls);
      transformControls.attach(shapeMarker);
      applyTransformModeFromState();
      syncMarkerFromState();
      updateShapePreviewFromTool();
    }

    createMarkerAndGizmo();

    function updateCameraClipPlanes() {
      const dist = camera.position.distanceTo(controls.target);
      const sceneSpan = Math.max(1500, lastGridExtent * 18);
      const near = Math.max(0.01, Math.min(2, dist * 0.0001));
      const far = Math.max(60000, dist + sceneSpan);
      if (camera.near !== near || camera.far !== far) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    }

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
      updateCameraClipPlanes();
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
      updateCameraClipPlanes();
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
      if (voxelCount > 0) {
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
          // Keep shadow casters alive even at extreme camera distances.
          mesh.frustumCulled = false;

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
      }

      const gridExtent = gridSize * voxelSize * 0.5;
      lastGridExtent = gridExtent;
      updateCameraClipPlanes();

      const defaultTarget = new THREE.Vector3(0, gridExtent * 0.2, 0);
      if (!state.__cameraPose) {
        controls.target.copy(defaultTarget);
      }

      if (state.groundEnabled) {
        const groundScale = Math.max(1, clampNum(state.groundScale, 2.8));
        const groundSize = gridExtent * 2 * groundScale;
        const groundY = getGroundY(state, bounds, voxelSize);
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

      const camDistance = camera.position.distanceTo(controls.target);
      const autoExtent = Math.max(lastGridExtent * 3.5, camDistance * 0.95);
      const shadowExtent = Math.max(clampNum(state.shadowExtent, lastGridExtent * 2.4), autoExtent);
      dirLight.castShadow = true;
      const mapSize = clampNum(state.shadowMapSize, 2048);
      dirLight.shadow.mapSize.width = mapSize;
      dirLight.shadow.mapSize.height = mapSize;
      dirLight.shadow.bias = clampNum(state.shadowBias, -0.0006);
      dirLight.shadow.normalBias = clampNum(state.shadowNormalBias, 0);
      dirLight.shadow.camera.near = Math.max(0.1, clampNum(state.shadowNear, 1));
      dirLight.shadow.camera.far = Math.max(
        clampNum(state.shadowFar, shadowExtent * 6),
        shadowExtent * 10,
        camDistance * 4
      );
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

    function makeVisibilityTester() {
      const cameraPos = camera.getWorldPosition(new THREE.Vector3());
      const viewProjection = new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjection);
      const ndc = new THREE.Vector3();
      const sample = new THREE.Vector3();

      const depthResolution = 220;
      const depthGrid = new Float32Array(depthResolution * depthResolution);
      depthGrid.fill(Number.POSITIVE_INFINITY);

      if (lastVoxels?.positions?.length) {
        const arr = lastVoxels.positions;
        for (let i = 0; i < arr.length; i += 3) {
          sample.set(arr[i + 0], arr[i + 1], arr[i + 2]).project(camera);
          if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.z)) {
            continue;
          }
          if (sample.x < -1 || sample.x > 1 || sample.y < -1 || sample.y > 1 || sample.z < -1 || sample.z > 1) {
            continue;
          }
          const ix = Math.max(0, Math.min(depthResolution - 1, Math.floor(((sample.x + 1) * 0.5) * depthResolution)));
          const iy = Math.max(0, Math.min(depthResolution - 1, Math.floor(((1 - (sample.y + 1) * 0.5)) * depthResolution)));
          const idx = iy * depthResolution + ix;
          if (sample.z < depthGrid[idx]) depthGrid[idx] = sample.z;
        }
      }

      function minDepthNeighbor(ix, iy) {
        let best = Number.POSITIVE_INFINITY;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = ix + ox;
            const ny = iy + oy;
            if (nx < 0 || nx >= depthResolution || ny < 0 || ny >= depthResolution) continue;
            const value = depthGrid[ny * depthResolution + nx];
            if (value < best) best = value;
          }
        }
        return best;
      }

      function isInView(worldPoint) {
        if (!frustum.containsPoint(worldPoint)) return false;
        ndc.copy(worldPoint).project(camera);
        if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z)) return false;
        if (ndc.x < -1 || ndc.x > 1 || ndc.y < -1 || ndc.y > 1 || ndc.z < -1 || ndc.z > 1) return false;
        return true;
      }

      function isVisible(worldPoint, depthBias = 0.03) {
        if (!isInView(worldPoint)) return false;
        const ix = Math.max(0, Math.min(depthResolution - 1, Math.floor(((ndc.x + 1) * 0.5) * depthResolution)));
        const iy = Math.max(
          0,
          Math.min(depthResolution - 1, Math.floor(((1 - (ndc.y + 1) * 0.5)) * depthResolution))
        );
        const nearDepth = minDepthNeighbor(ix, iy);
        if (!Number.isFinite(nearDepth)) return true;
        return ndc.z <= nearDepth + depthBias;
      }

      return { cameraPos, isVisible, isInView };
    }

    function mergeIntervals(intervals, gap = 0) {
      if (!intervals || intervals.length === 0) return [];
      const ordered = intervals
        .filter((iv) => Number.isFinite(iv[0]) && Number.isFinite(iv[1]))
        .map((iv) => (iv[0] <= iv[1] ? [iv[0], iv[1]] : [iv[1], iv[0]]))
        .sort((a, b) => a[0] - b[0]);
      if (ordered.length === 0) return [];
      const merged = [ordered[0].slice()];
      for (let i = 1; i < ordered.length; i += 1) {
        const current = ordered[i];
        const last = merged[merged.length - 1];
        if (current[0] <= last[1] + gap) {
          if (current[1] > last[1]) last[1] = current[1];
          continue;
        }
        merged.push(current.slice());
      }
      return merged;
    }

    function buildSvgScene(sharedVisibility) {
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
      const visibility = sharedVisibility || makeVisibilityTester();
      const cullInvisibleCubes = state.svgCullInvisible !== false;
      const toCamera = new THREE.Vector3();
      const faceVisibilityBias = 0.05;
      const half = geomSize * 0.5;
      const lineBuckets = new Map();

      const drawFaceLoop = (face, basePos, colorKey, color) => {
        let bucket = lineBuckets.get(colorKey);
        if (!bucket) {
          bucket = { color, points: [] };
          lineBuckets.set(colorKey, bucket);
        }
        const corners = face.corners.map((corner) => corner.clone().add(basePos));
        for (let i = 0; i < corners.length; i += 1) {
          const a = corners[i];
          const b = corners[(i + 1) % corners.length];
          bucket.points.push(a, b);
        }
      };

      const isFaceVisibleFromCamera = (face, basePos) => {
        const faceCenter = basePos.clone().add(face.offset);
        if (visibility.isVisible(faceCenter, faceVisibilityBias)) return true;
        for (let c = 0; c < face.corners.length; c += 1) {
          const cornerPt = basePos.clone().add(face.corners[c]);
          if (visibility.isVisible(cornerPt, faceVisibilityBias)) return true;
        }
        return false;
      };

      const isCubeVisibleFromCamera = (basePos) => {
        if (visibility.isVisible(basePos, faceVisibilityBias)) return true;
        for (let sx = -1; sx <= 1; sx += 2) {
          for (let sy = -1; sy <= 1; sy += 2) {
            for (let sz = -1; sz <= 1; sz += 2) {
              const corner = new THREE.Vector3(
                basePos.x + sx * half,
                basePos.y + sy * half,
                basePos.z + sz * half
              );
              if (visibility.isVisible(corner, faceVisibilityBias)) return true;
            }
          }
        }
        return false;
      };

      for (const key of voxelSet) {
        const { x, y, z } = parseKey(key);
        const rawColor = voxelColorMap?.get(key);
        const color =
          rawColor instanceof THREE.Color ? rawColor : new THREE.Color(rawColor || "#c9d7f8");
        const colorKey = `${Math.round(color.r * 255)}-${Math.round(color.g * 255)}-${Math.round(
          color.b * 255
        )}`;
        const basePos = new THREE.Vector3(x * voxelSize, y * voxelSize, z * voxelSize);
        const exposedFaces = [];

        for (let i = 0; i < faceDefs.length; i += 1) {
          const face = faceDefs[i];
          if (!voxelSet.has(keyFor(x + face.dx, y + face.dy, z + face.dz))) {
            exposedFaces.push(face);
          }
        }
        if (exposedFaces.length === 0) continue;
        if (cullInvisibleCubes && !isCubeVisibleFromCamera(basePos)) continue;

        let renderedFaceCount = 0;
        let fallbackFace = null;
        let fallbackFacing = -Infinity;

        for (let i = 0; i < exposedFaces.length; i += 1) {
          const face = exposedFaces[i];
          const faceCenter = basePos.clone().add(face.offset);
          toCamera.copy(visibility.cameraPos).sub(faceCenter);
          const facing = face.normal.dot(toCamera);
          if (facing <= 0) continue;
          if (facing > fallbackFacing) {
            fallbackFacing = facing;
            fallbackFace = face;
          }
          if (cullInvisibleCubes && !isFaceVisibleFromCamera(face, basePos)) continue;
          drawFaceLoop(face, basePos, colorKey, color);
          renderedFaceCount += 1;
        }

        // Guarantee a closed loop for visible cubes even when visibility
        // sampling culls all contributing faces due precision/partial occlusion.
        if (cullInvisibleCubes && renderedFaceCount === 0 && fallbackFace && isCubeVisibleFromCamera(basePos)) {
          drawFaceLoop(fallbackFace, basePos, colorKey, color);
        }
      }

      for (const bucket of lineBuckets.values()) {
        if (!bucket.points.length) continue;
        const geom = new THREE.BufferGeometry().setFromPoints(bucket.points);
        const mat = new THREE.LineBasicMaterial({ color: bucket.color });
        voxelGroup.add(new THREE.LineSegments(geom, mat));
      }

      svgScene.add(voxelGroup);
      // Ground stays implicit for projection math; do not render it in SVG.

      return svgScene;
    }

    function buildShadowSvgScene(sharedVisibility) {
      const svgScene = new THREE.Scene();
      svgScene.background = null;

      if (!lastVoxels || lastVoxels.voxelCount <= 0 || !state.groundEnabled) {
        return svgScene;
      }

      const { positions, voxelCount, voxelSize, bounds } = lastVoxels;
      const gapRatio = state.voxelGapRatio;
      const geomSize = voxelSize * Math.max(0.02, 1 - gapRatio);
      const groundY = getGroundY(state, bounds, voxelSize);
      // Direction from point on model toward light source (used for projection).
      const lightDir = getLightDirection(state.lightAzimuth, state.lightElevation);
      if (Math.abs(lightDir.y) <= 0.0001) return svgScene;

      const visibility = sharedVisibility || makeVisibilityTester();
      let shadowColor = new THREE.Color("#000000");
      try {
        shadowColor = new THREE.Color(String(state.svgShadowStroke || "#111111"));
      } catch {
        shadowColor = new THREE.Color("#000000");
      }
      const shadowMat = new THREE.LineBasicMaterial({ color: shadowColor });
      const shadowGroup = new THREE.Group();
      const hatchAngle = THREE.MathUtils.degToRad(clampNum(state.svgShadowHatchAngle, 35));
      const hatchSpacingRatio = Math.max(0.05, clampNum(state.svgShadowHatchSpacingRatio, 0.22));
      const hatchSpacing = geomSize * hatchSpacingRatio * 1.8;
      const dirUx = Math.cos(hatchAngle);
      const dirUz = Math.sin(hatchAngle);
      const dirVx = -dirUz;
      const dirVz = dirUx;
      const shadowHeight = groundY + voxelSize * 0.01;
      const projectedHalf = geomSize * 0.5 * (Math.abs(dirUx) + Math.abs(dirUz));
      const stripeMap = new Map();
      const mergeGap = geomSize * 0.32;
      const minSegmentLength = geomSize * 0.4;
      const shadowCenter = new THREE.Vector3();
      const shadowMid = new THREE.Vector3();

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
        const pz = iz + lightDir.z * t;
        shadowCenter.set(px, shadowHeight, pz);
        if (!visibility.isInView(shadowCenter)) continue;

        const u = px * dirUx + pz * dirUz;
        const v = px * dirVx + pz * dirVz;
        const uMin = u - projectedHalf;
        const uMax = u + projectedHalf;
        const stripeMin = Math.floor((v - projectedHalf) / hatchSpacing);
        const stripeMax = Math.ceil((v + projectedHalf) / hatchSpacing);

        for (let stripe = stripeMin; stripe <= stripeMax; stripe += 1) {
          let intervals = stripeMap.get(stripe);
          if (!intervals) {
            intervals = [];
            stripeMap.set(stripe, intervals);
          }
          intervals.push([uMin, uMax]);
        }
      }

      const linePoints = [];
      for (const [stripe, intervals] of stripeMap.entries()) {
        const merged = mergeIntervals(intervals, mergeGap);
        if (!merged.length) continue;
        const vLine = stripe * hatchSpacing;
        for (let i = 0; i < merged.length; i += 1) {
          const [u0, u1] = merged[i];
          if (u1 - u0 < minSegmentLength) continue;
          const x0 = dirUx * u0 + dirVx * vLine;
          const z0 = dirUz * u0 + dirVz * vLine;
          const x1 = dirUx * u1 + dirVx * vLine;
          const z1 = dirUz * u1 + dirVz * vLine;
          shadowMid.set((x0 + x1) * 0.5, shadowHeight, (z0 + z1) * 0.5);
          if (!visibility.isInView(shadowMid)) continue;
          linePoints.push(new THREE.Vector3(x0, shadowHeight, z0), new THREE.Vector3(x1, shadowHeight, z1));
        }
      }

      if (linePoints.length > 0) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
        shadowGroup.add(new THREE.LineSegments(lineGeom, shadowMat));
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

    function firstDrawableSvgChild(svgEl) {
      if (!svgEl) return null;
      const nonDrawableTags = new Set(["defs", "style", "title", "desc", "metadata"]);
      for (let i = 0; i < svgEl.childNodes.length; i += 1) {
        const node = svgEl.childNodes[i];
        if (!node || node.nodeType !== 1) continue;
        const tag = String(node.nodeName || "").toLowerCase();
        if (nonDrawableTags.has(tag)) continue;
        return node;
      }
      return null;
    }

    function mergeShadowSvgBehindMain(renderedSvg, shadowSvg) {
      if (!renderedSvg || !shadowSvg) return;
      const fragment = document.createDocumentFragment();
      while (shadowSvg.firstChild) {
        fragment.appendChild(shadowSvg.firstChild);
      }
      if (!fragment.hasChildNodes()) return;
      const anchor = firstDrawableSvgChild(renderedSvg);
      if (anchor) {
        renderedSvg.insertBefore(fragment, anchor);
      } else {
        renderedSvg.appendChild(fragment);
      }
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
        const visibility = makeVisibilityTester();

        svgRenderer.setSize(width, height);
        svgRenderer.domElement.innerHTML = "";
        const svgScene = buildSvgScene(visibility);
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
          const shadowScene = buildShadowSvgScene(visibility);
          shadowSvgRenderer.render(shadowScene, camera);
          disposeSvgScene(shadowScene);
          const shadowSvg = shadowSvgRenderer.domElement;
          postProcessSvg(shadowSvg, state, width, height, "shadow");
          mergeShadowSvgBehindMain(renderedSvg, shadowSvg);
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

    function onKeyDown(event) {
      if (event.code !== "Space") return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      event.preventDefault();
      ensureShapePlacementState(state);
      const nextMode = state.shapeTool.mode === "rotate" ? "translate" : "rotate";
      if (shapeEditorPanel?.setMode) {
        shapeEditorPanel.setMode(nextMode);
      } else {
        state.shapeTool.mode = nextMode;
        applyTransformModeFromState();
        renderWebgl();
      }
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);

    let rafId = 0;
    function animate() {
      rafId = window.requestAnimationFrame(animate);
      controls.update();
      renderWebgl();
    }

    function mountShapePanel() {
      const configEl = document.getElementById("config");
      if (!configEl) return;
      shapeEditorPanel?.destroy?.();
      shapeEditorPanel = mountShapePlacementPanel({
        container: configEl,
        state,
        onToolChange: () => {
          ensureShapePlacementState(state);
          applyTransformModeFromState();
          syncMarkerFromState();
          updateShapePreviewFromTool();
          renderWebgl();
        },
        onTransformSettingsChange: () => {
          rebuild();
        },
        onPlaceShape: (instance) => {
          ensureShapePlacementState(state);
          state.shapeInstances.push(instance);
          rebuild();
        },
        onUndoShape: () => {
          ensureShapePlacementState(state);
          state.shapeInstances.pop();
          rebuild();
        },
        onClearShapes: () => {
          ensureShapePlacementState(state);
          state.shapeInstances.length = 0;
          state.__shapeCursorSeededToGround = false;
          snapShapeToolCursorToGround(state);
          rebuild();
        },
      });
    }

    function rebuild() {
      ensureShapePlacementState(state);
      scene.background = new THREE.Color(String(state.backgroundColor || "#f7f7fb"));
      buildSceneFromState();
      applyTransformModeFromState();
      syncMarkerFromState();
      updateShapePreviewFromTool();
      shapeEditorPanel?.sync?.();
      updateLightsFromState();
      renderWebgl();
      if (state.showSvgOverlay) {
        exportSvgToMount();
      } else {
        hideOverlay();
      }
    }

    mountShapePanel();
    rebuild();
    animate();

    const STATE_GROUPS = {
      geometry: new Set([
        "seed",
        "gridSize",
        "voxelSize",
        "voxelGapRatio",
        "materialMode",
        "placementMode",
        "shapeSpacing",
        "autoProceduralShapes",
        "proceduralShapeCount",
        "proceduralScale",
        "proceduralSpread",
        "proceduralBaseRatio",
        "proceduralYawSteps",
        "shapeInstancesJson",
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
        "svgStrokeWidth",
        "svgFillOpacity",
        "svgStroke",
        "svgLineMode",
        "svgCullInvisible",
        "svgCullMinSize",
        "svgShadowEnabled",
        "svgShadowStrokeWidth",
        "svgShadowStroke",
        "svgShadowHatchSpacingRatio",
        "svgShadowHatchAngle",
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
        placementMode: state.placementMode,
        shapeSpacing: state.shapeSpacing,
        autoProceduralShapes: state.autoProceduralShapes,
        proceduralShapeCount: state.proceduralShapeCount,
        proceduralScale: state.proceduralScale,
        proceduralSpread: state.proceduralSpread,
        proceduralBaseRatio: state.proceduralBaseRatio,
        proceduralYawSteps: state.proceduralYawSteps,
        shapeInstancesJson: JSON.stringify(state.shapeInstances || []),
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
        svgStrokeWidth: state.svgStrokeWidth,
        svgFillOpacity: state.svgFillOpacity,
        svgStroke: state.svgStroke,
        svgLineMode: state.svgLineMode,
        svgCullInvisible: state.svgCullInvisible,
        svgCullMinSize: state.svgCullMinSize,
        svgShadowEnabled: state.svgShadowEnabled,
        svgShadowStrokeWidth: state.svgShadowStrokeWidth,
        svgShadowStroke: state.svgShadowStroke,
        svgShadowHatchSpacingRatio: state.svgShadowHatchSpacingRatio,
        svgShadowHatchAngle: state.svgShadowHatchAngle,
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
            const groundY = getGroundY(state, bounds, voxelSize);
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

        ensureShapePlacementState(state);
        applyTransformModeFromState();
        syncMarkerFromState();
        updateShapePreviewFromTool();
        shapeEditorPanel?.sync?.();
        renderWebgl();
      },
      destroy() {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("keydown", onKeyDown);
        controls.dispose();
        shapeEditorPanel?.destroy?.();
        shapeEditorPanel = null;
        disposeShapePreview();
        if (transformControls) {
          scene.remove(transformControls);
          transformControls.dispose();
        }
        transformControls = null;
        if (shapeMarker) {
          scene.remove(shapeMarker);
        }
        shapeMarker = null;
        if (shapeMarkerGeom) shapeMarkerGeom.dispose();
        if (shapeMarkerMat) shapeMarkerMat.dispose();
        shapeMarkerGeom = null;
        shapeMarkerMat = null;
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
