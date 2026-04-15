// utils/mergeDetection.js


export const actionRuleMap = {
  "translate":translateAll
}
/**
 * Detect all pairwise merges among groups based on distance.
 *
 * @param {Array} groups           Array of group objects { amount, depth, particleRadius, name, … }
 * @param {Array<Float32Array>} positions  Parallel array of Float32Arrays (x,y,z triples)
 * @param {number} MAX_DEPTH
 * @param {number} extraDistSq      Additional distance² threshold
 * @returns {Array} merges          Each entry: { giA, i, giB, j }
 */
export function detectMerges(groups, positions, MAX_DEPTH, extraDistSq = 300) {
  const merges = [];
  const marked = new Set();

  groups.forEach((grpA, giA) => {
    if (grpA.depth >= MAX_DEPTH) return;
    const posA = positions[giA];
    // Precompute per-target merge distance squared:
    const mergeDist2 = groups.map(
      grpB => (grpA.particleRadius + grpB.particleRadius) ** 2 + extraDistSq
    );

    for (let i = 0; i < grpA.amount; i++) {
      const keyA = `${giA}_${i}`;
      if (marked.has(keyA)) continue;
      const baseA = 3 * i;

      for (let giB = 0; giB < groups.length; giB++) {
        if (giA === giB || groups[giB].depth >= MAX_DEPTH) continue;
        const posB = positions[giB];

        for (let j = 0; j < groups[giB].amount; j++) {
          const keyB = `${giB}_${j}`;
          if (marked.has(keyB)) continue;

          const baseB = 3 * j;
          const dx = posA[baseA]     - posB[baseB];
          const dy = posA[baseA + 1] - posB[baseB + 1];
          const dz = posA[baseA + 2] - posB[baseB + 2];
          if (dx*dx + dy*dy + dz*dz < mergeDist2[giB]) {
            merges.push({ giA, i, giB, j });
            marked.add(keyA);
            marked.add(keyB);
            giB = groups.length; // break to next i
            break;
          }
        }
      }
    }
  });

  return merges;
}

/**
 * Sort merges so that removals from higher indices happen first.
 * This prevents index-shift issues.
 */
export function sortMerges(merges) {
  return merges.sort((a, b) =>
    a.giA !== b.giA ? b.giA - a.giA : b.i - a.i
  );
}
// utils/array.js
export function removeSlice(arr, start, count) {
  // Safely remove `count` items starting at `start`
  if (start < 0 || count < 0 || start >= arr.length || start + count > arr.length) {
    return new Float32Array(0);
  }
  const out = new Float32Array(arr.length - count);
  if (start > 0) out.set(arr.subarray(0, start), 0);
  const tailStart = start + count;
  if (tailStart < arr.length) out.set(arr.subarray(tailStart), start);
  return out;
}

export function appendTriple(arr, triple) {
  // Append [x,y,z] to a Float32Array
  const out = new Float32Array(arr.length + 3);
  out.set(arr, 0);
  out.set(triple, arr.length);
  return out;
}
export function applyMerges({
  merges,
  positions,
  velocities,
  groups,
  meshes,
  getOrCreateMergedGroup,
  MAX_DEPTH
}) {
  const touched = new Set();

  merges.forEach(({ giA, i, giB, j }) => {
    const ixA = 3*i, ixB = 3*j;
    const pA = positions[giA], pB = positions[giB];
    const vA = velocities[giA], vB = velocities[giB];

    // Pick the faster particle as source
    const speed2A = vA[ixA]**2 + vA[ixA+1]**2 + vA[ixA+2]**2;
    const speed2B = vB[ixB]**2 + vB[ixB+1]**2 + vB[ixB+2]**2;
    const useA = speed2A >= speed2B;

    const baseIx = useA ? ixA : ixB;
    const sourcePos = useA ? pA : pB;
    const sourceVel = useA ? vA : vB;
    const newPos = [ sourcePos[baseIx], sourcePos[baseIx+1], sourcePos[baseIx+2] ];
    const newVel = [ sourceVel[baseIx], sourceVel[baseIx+1], sourceVel[baseIx+2] ];

    // Remove old particles
    positions[giA]  = removeSlice(pA,  ixA, 3);
    velocities[giA] = removeSlice(vA,  ixA, 3);
    groups[giA].amount--;
    touched.add(giA);

    // Adjust index for B if B> A (because A’s removal may shift indices)
    const adjBix = giB > giA ? ixB : ixB;
    positions[giB]  = removeSlice(pB,  adjBix, 3);
    velocities[giB] = removeSlice(vB,  adjBix, 3);
    groups[giB].amount--;
    touched.add(giB);

    // Create or fetch the merged bucket
    const { grp: mg, gi: giM } = getOrCreateMergedGroup(
      groups[giA].name,
      groups[giB].name,
      groups[giA],
      groups[giB]
    );
    // Append the merged particle
    positions[giM]  = appendTriple(positions[giM], newPos);
    velocities[giM] = appendTriple(velocities[giM], newVel);
    mg.amount++;
    touched.add(giM);

    // Update instance matrix immediately
    const meshM = meshes[giM];
    meshM.count = mg.amount;
    this.dummy.position.set(...newPos);
    this.dummy.updateMatrix();
    meshM.setMatrixAt(mg.amount - 1, this.dummy.matrix);
    meshM.instanceMatrix.needsUpdate = true;
  });

  // Rebuild any meshes that changed
  touched.forEach(gi => this._rebuildMeshForGroup(gi));
}
/**
   * Translate every particle in every group by (dx,dy,dz),
   * then update each InstancedMesh’s matrices.
   *
   */
  export function translateAll(PS) {
    
    // 1) shift all position buffers
    for (let gi = 0; gi < PS.positions.length; gi++) {
      const pos = PS.positions[gi];
      for (let idx = 0; idx < pos.length; idx += 3) {
        pos[idx]   += PS.translation[0];
        pos[idx+1] += PS.translation[1];
        pos[idx+2] += PS.translation[2];
      }
    }

    // 2) rewrite each mesh’s instanceMatrix
    for (let gi = 0; gi < PS.meshes.length; gi++) {
      const mesh = PS.meshes[gi];
      const pos  = PS.positions[gi];
      const count = PS.groups[gi].amount;

      for (let i = 0; i < count; i++) {
        const ix = 3 * i;
        PS.dummy.position.set(pos[ix], pos[ix+1], pos[ix+2]);
        PS.dummy.updateMatrix();
        mesh.setMatrixAt(i, PS.dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
/**
 * Example usage of the functions
 */
// class ParticleSim {
//   // …

//   handleMerges() {
//     // 1) detect
//     let merges = detectMerges(
//       this.groups,
//       this.positions,
//       MAX_DEPTH,
//       /* extraDistSq= */ 300
//     );

//     if (merges.length === 0) return;

//     // 2) sort
//     merges = sortMerges(merges);

//     // 3) apply
//     applyMerges.call(this, {
//       merges,
//       positions:   this.positions,
//       velocities:  this.velocities,
//       groups:      this.groups,
//       meshes:      this.meshes,
//       getOrCreateMergedGroup: this.getOrCreateMergedGroup.bind(this),
//       MAX_DEPTH
//     });
//   }

//   // …
// }