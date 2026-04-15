import * as THREE from 'three';
import * as AR from './actionRules.js'
import * as randomSim from './randomPS.js'
console.log(Module)
const mutateChance = 0.2;
const destroyChance = 0.21;

function averageArrays(arr1, arr2) {
    const maxLength = Math.max(arr1.length, arr2.length);
    const result = [];

    for (let i = 0; i < maxLength; i++) {
        const val1 = arr1[i] !== undefined ? arr1[i] : 0;
        const val2 = arr2[i] !== undefined ? arr2[i] : 0;

        if (Math.random() < mutateChance) {
            // mutation range: [-10×min, 10×max]
            const min = Math.min(val1, val2);
            const max = Math.max(val1, val2);
            const lower = min * 0.9;
            const upper = max * 0.9;
            
            // If min and max are both 0, fall back to random between -1 and 1
            const value = (lower === 0 && upper === 0)
                ? Math.random() * 2 - 1
                : Math.random() * (upper - lower) + lower;

            result.push(value);
        } 
        if((Math.random() > mutateChance) && Math.random() < destroyChance){
            result.push(0);
        }
          else {
            // normal average
            result.push((val1 + val2) / 2);
        }
    }

    return result;
}

export class ParticleSim {
    constructor(name, groups, config,scene,onDeleteCallback = null) {
      this.name = name;
      this.modFrameLog = 500;
      this.frameCount = 0;
        this.onDelete = onDeleteCallback;
        this.shouldUpdate = true;
        this.groups = groups;
        this.config = config;
        this.meshes = []; 
        this.positions = [];
        this.velocities = [];
        this.scene = scene;
        this.MAX_DEPTH = 2;
        this.dummy = new THREE.Object3D();
        this.mergedGroups = [];
        this.translation = [0,0,0];
        this.actionRules = [];
        this.energy = 0;
        //this.addActionRule(() => this.handleMerges());
        this.addActionRule(() => this.handleEnergy());

        this.beginPlayRules = [];
        this.addBeginPlayRule(() => AR.translateAll(this));
        this.initInstances();
        //this.startingSettings();
        this.inventory = {}
    }
   /** 
   * Create-or-find a merged group, and assign it the correct depth.
   */
  getOrCreateMergedGroup(nameA, nameB, grpA, grpB) {
    const mergedName = `(${nameA}${nameB})`;
    let gi = this.groups.findIndex(g => g.name === mergedName);
    if (gi !== -1) return { grp: this.groups[gi], gi };

    // new merged group
    const depth = Math.max(grpA.depth, grpB.depth) + 1;
    console.log("new group: ", mergedName, depth)
    const mergedGroup = {
      name: mergedName,
      amount: 0,
      depth,
      particleRadius: (grpA.particleRadius + grpB.particleRadius) / 1,
      color: (grpA.color + grpB.color) / 2,
      interactWeights: averageArrays(grpA.interactWeights, grpB.interactWeights),
      interactRadii:  averageArrays(grpA.interactRadii,  grpB.interactRadii),
    };
    // push it into our lists
    // this.groups.push(mergedGroup);
    // this.mergedGroups.push(mergedGroup);

    // set its “order” to be its index in this.groups
    const newOrder = this.groups.length;
    mergedGroup.order = newOrder;

    // --- update EVERY OTHER GROUP so they now have a weight/radius toward the new one ---
    this.groups.forEach((g, idx) => {
        if (idx === newOrder) return;  // skip the mergedGroup itself

        // look up what this group g felt toward grpA and grpB
        const wA = g.interactWeights[grpA.order];
        const wB = g.interactWeights[grpB.order];
        const rA = g.interactRadii[  grpA.order];
        const rB = g.interactRadii[  grpB.order];

        // push the average into g’s arrays (so now g.interactWeights[newOrder] exists)
        g.interactWeights.push((wA + wB) / 2);
        g.interactRadii.push(  (rA + rB) / 2);
    });

    // --- OPTIONALLY: append a “self” interaction for the mergedGroup itself ---
    //    (e.g. average of grpA’s self + grpB’s self; if those were zero, you get zero)
    const selfW = (grpA.interactWeights[grpA.order] + grpB.interactWeights[grpB.order]) / 2;
    const selfR = (grpA.interactRadii[  grpA.order] + grpB.interactRadii[  grpB.order]) / 2;
    mergedGroup.interactWeights.push(selfW);
    mergedGroup.interactRadii.push(  selfR);
    //console.log(mergedGroup)
    this.groups.push(mergedGroup);
    this.mergedGroups.push(mergedGroup);

    // zero‐instance mesh to start
    const geo = new THREE.BoxGeometry(
      mergedGroup.particleRadius + this.config.baseParticleSize,
      mergedGroup.particleRadius + this.config.baseParticleSize,
      mergedGroup.particleRadius + this.config.baseParticleSize
    );
    const mat = new THREE.MeshBasicMaterial({ color: mergedGroup.color });
    const mesh = new THREE.InstancedMesh(geo, mat, 0);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(mesh);

    this.meshes.push(mesh);
    this.positions .push(new Float32Array(0));
    this.velocities.push(new Float32Array(0));

    gi = this.groups.length - 1;
    return { grp: mergedGroup, gi };
  }
   deleteSystem(){
    this.shouldUpdate = false;
    this.meshes.forEach(mesh => {
        this.scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
    });
    
    this.meshes = [];
    this.positions = [];
    this.velocities = [];
    this.mergedGroups = [];
    if (typeof this.onDelete === 'function') {
      this.onDelete(this.name);
    }
  }
  handleMerges() {
    
    const merges = [];
    const marked = new Set();

    // 1) detect merges based on distance, skipping depth>=this.MAX_DEPTH
    this.groups.forEach((grpA, giA) => {
      if (grpA.depth >= this.MAX_DEPTH) return;
      const posA = this.positions[giA];
      const mergeDist2 = this.groups.map(grpB =>
        (grpA.particleRadius + grpB.particleRadius) ** 2 + 50
      );

      for (let i = 0; i < grpA.amount; i++) {
        const keyA = `${giA}_${i}`;
        if (marked.has(keyA)) continue;
        const ixA = 3 * i;

        for (let giB = 0; giB < this.groups.length; giB++) {
          const grpB = this.groups[giB];
          if (giA === giB || grpB.depth >= this.MAX_DEPTH) continue;
          const posB = this.positions[giB];

          for (let j = 0; j < grpB.amount; j++) {
            const keyB = `${giB}_${j}`;
            if (marked.has(keyB)) continue;

            const ixB = 3 * j;
            const dx = posA[ixA]     - posB[ixB];
            const dy = posA[ixA + 1] - posB[ixB + 1];
            const dz = posA[ixA + 2] - posB[ixB + 2];
            const d2 = dx*dx + dy*dy + dz*dz;

            if (d2 < mergeDist2[giB]) {
              merges.push({ giA, i, giB, j });
              marked.add(keyA);
              marked.add(keyB);
              giB = this.groups.length; // break out to next i
              break;
            }
          }
        }
      }
    });

    if (!merges.length) return;

    // 2) sort for safe removals
    merges.sort((a, b) =>
      a.giA !== b.giA ? b.giA - a.giA : b.i - a.i
    );

    const touched = new Set();

    // 3) apply merges
    for (const { giA, i, giB, j } of merges) {
      const ixA = 3*i, ixB = 3*j;
      const pA = this.positions[giA], pB = this.positions[giB];
      const vA = this.velocities[giA], vB = this.velocities[giB];

      // choose faster particle for BOTH pos & vel
      const speed2A = vA[ixA]*vA[ixA] + vA[ixA+1]*vA[ixA+1] + vA[ixA+2]*vA[ixA+2];
      const speed2B = vB[ixB]*vB[ixB] + vB[ixB+1]*vB[ixB+1] + vB[ixB+2]*vB[ixB+2];

      let sourceV, baseIx, newPos;
      if (speed2A >= speed2B) {
        sourceV = vA;
        baseIx  = ixA;
        newPos  = [ pA[ixA], pA[ixA+1], pA[ixA+2] ];
      } else {
        sourceV = vB;
        baseIx  = ixB;
        newPos  = [ pB[ixB], pB[ixB+1], pB[ixB+2] ];
      }

      const newVel = [
        sourceV[baseIx],
        sourceV[baseIx+1],
        sourceV[baseIx+2],
      ];

      // remove old particles
      this.positions[giA]  = this._removeArraySlice(this.positions[giA],  ixA, 3);
      this.velocities[giA] = this._removeArraySlice(this.velocities[giA], ixA, 3);
      this.groups[giA].amount--;
      touched.add(giA);

      const adjBix = giB > giA ? 3*j : ixB;
      this.positions[giB]  = this._removeArraySlice(this.positions[giB],  adjBix, 3);
      this.velocities[giB] = this._removeArraySlice(this.velocities[giB], adjBix, 3);
      this.groups[giB].amount--;
      touched.add(giB);

      // create/apply merged group
      const { grp: mg, gi: giM } = this.getOrCreateMergedGroup(
        this.groups[giA].name,
        this.groups[giB].name,
        this.groups[giA],
        this.groups[giB]
      );
      this.positions[giM]  = this._appendTriple(this.positions[giM],  newPos);
      this.velocities[giM] = this._appendTriple(this.velocities[giM], newVel);
      mg.amount++;
      touched.add(giM);

      // immediate matrix update
      const meshM = this.meshes[giM];
      meshM.count = mg.amount;
      this.dummy.position.set(...newPos);
      this.dummy.updateMatrix();
      meshM.setMatrixAt(mg.amount - 1, this.dummy.matrix);
      meshM.instanceMatrix.needsUpdate = true;
    }

    // 4) rebuild meshes whose counts changed
    for (let gi of touched) {
      this._rebuildMeshForGroup(gi);
    }
  }
  handleEnergy(){
      let totalEnergy = 0;
      let infDetector = 0;
      let totalNVel = 0;
    let maxSpeed2 = 0; // stores max velocity squared
    this.velocities.forEach((velArray, groupIndex) => {
      for (let i = 0; i < velArray.length; i += 3) {
        totalNVel+= velArray.length;
        const vx = velArray[i];
        const vy = velArray[i + 1];
        const vz = velArray[i + 2];
        // Check for NaN or Infinity
        if (
          !Number.isFinite(vx) ||
          !Number.isFinite(vy) ||
          !Number.isFinite(vz)
        ) {
          infDetector++;
          continue;
        }
        const speed2 = vx * vx + vy * vy + vz * vz;

        totalEnergy += speed2;
        if (speed2 > maxSpeed2) {
          maxSpeed2 = speed2;
        }
      }
    });

    this.energy = totalEnergy;
    if(this.energy == 0 || maxSpeed2 > 1e18){
        console.log("particle sim collapsed");
        console.log("Sim energy: ",randomSim.formatSciNotation(this.energy));
        console.log("Max Particle speed: ",randomSim.formatSciNotation( maxSpeed2));
        this.deleteSystem();
        //this.deleteSystem();
        //console.log("sim bounds increased: ", this.config.SimulationBounds)
      }
    // if(this.frameCount % this.modFrameLog == 0){
    //   console.log(this.name)
    //   console.log("Sim energy: ",randomSim.formatSciNotation(this.energy));
    //   console.log("inf count: ", infDetector, "::",  totalNVel);
    //   console.log(this.config.interactionScaling)
    //   console.log("max S: ", maxSpeed2)

    // }
  }
    /** rebuild an InstancedMesh to match groups[gi].amount + matrices */
    _rebuildMeshForGroup(gi) {
        const grp = this.groups[gi];
        const old = this.meshes[gi];
        this.scene.remove(old);
        old.geometry.dispose();
        old.material.dispose();

        // recreate with exact count
        const geo = new THREE.BoxGeometry(
        grp.particleRadius + this.config.baseParticleSize,
        grp.particleRadius + this.config.baseParticleSize,
        grp.particleRadius + this.config.baseParticleSize
        );
        const mat = new THREE.MeshBasicMaterial({ color: grp.color });
        const mesh = new THREE.InstancedMesh(geo, mat, grp.amount);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(mesh);
        this.meshes[gi] = mesh;

        // reapply every matrix
        const pos = this.positions[gi];
        for (let i = 0; i < grp.amount; i++) {
        this.dummy.position.set(pos[3*i], pos[3*i+1], pos[3*i+2]);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    }
    initInstances() {
        this.groups.forEach((grp) => {
            const geo = new THREE.BoxGeometry(
                grp.particleRadius + this.config.baseParticleSize,
                grp.particleRadius + this.config.baseParticleSize,
                grp.particleRadius + this.config.baseParticleSize
            );
            const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(grp.color) });
            const mesh = new THREE.InstancedMesh(geo, mat, grp.amount);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.scene.add(mesh);
            this.meshes.push(mesh);

            const pos = new Float32Array(grp.amount * 3);
            const vel = new Float32Array(grp.amount * 3);
            for (let i = 0; i < grp.amount; i++) {
                pos[3 * i] = (Math.random() - 0.5) * 1000;
                pos[3 * i + 1] = (Math.random() - 0.5) * 1000;
                pos[3 * i + 2] = (Math.random() - 0.5) * 1000;
            }
            this.positions.push(pos);
            this.velocities.push(vel);
        });
    }
    addBeginPlayRule(incomingRule)
    {
      this.beginPlayRules.push(incomingRule);
    }
    startingSettings(){
      this.beginPlayRules.forEach(element => {
        element();
      });
    }

        /** remove N values from a Float32Array starting at index i */
   _removeArraySlice(arr, i, n) {
    // If the request is invalid or goes out of bounds, remove the whole array
    if (i < 0 || n < 0 || i >= arr.length || i + n > arr.length) {
        return new Float32Array(0);
    }

    const out = new Float32Array(arr.length - n);

    // Copy the part before the slice
    if (i > 0) {
        out.set(arr.subarray(0, i), 0);
    }

    // Copy the part after the slice, only if there's something left
    const afterStart = i + n;
    if (afterStart < arr.length) {
        out.set(arr.subarray(afterStart), i);
    }

    return out;
}



    /** append 3 values to a Float32Array */
    _appendTriple(arr, triple) {
        const out = new Float32Array(arr.length + 3);
        out.set(arr);
        out.set(triple, arr.length);
        return out;
    }
    /** helper: find or create the merged‐group type for A→B */
    // getOrCreateMergedGroup(nameA, nameB, grpA, grpB) {
    //     const mergedName = `${nameA}_${nameB}`;
    //     // see if we already made this direction
    //     let gi = this.groups.findIndex(g => g.name === mergedName);
    //     if (gi !== -1) return { grp: this.groups[gi], gi };

    //     // otherwise build a brand new zero‐size group
    //     const mergedGroup = {
    //     name: mergedName,
    //     amount: 0,
    //     particleRadius: (grpA.particleRadius + grpB.particleRadius),
    //     color: (grpA.color + grpB.color) / 2,
    //     interactWeights: averageArrays(grpA.interactWeights, grpB.interactWeights),
    //     interactRadii:  averageArrays(grpA.interactRadii,  grpB.interactRadii),
    //     };
    //     this.groups.push(mergedGroup);
    //     this.mergedGroups.push(mergedGroup);

    //     // create an InstancedMesh of zero instances to start
    //     const geo = new THREE.BoxGeometry(
    //     mergedGroup.particleRadius + this.config.baseParticleSize,
    //     mergedGroup.particleRadius + this.config.baseParticleSize,
    //     mergedGroup.particleRadius + this.config.baseParticleSize
    //     );
    //     const mat = new THREE.MeshBasicMaterial({ color: mergedGroup.color });
    //     const mesh = new THREE.InstancedMesh(geo, mat, 0);
    //     mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    //     this.scene.add(mesh);

    //     this.meshes.push(mesh);
    //     // empty buffers
    //     this.positions.push(new Float32Array(0));
    //     this.velocities.push(new Float32Array(0));

    //     gi = this.groups.length - 1;
    //     return { grp: mergedGroup, gi };
    // }
    initSingleInstance(grp) {
        const geo = new THREE.BoxGeometry(
            grp.particleRadius + this.config.baseParticleSize,
            grp.particleRadius + this.config.baseParticleSize,
            grp.particleRadius + this.config.baseParticleSize
        );
        const mat = new THREE.MeshBasicMaterial({ color: grp.color });
        const mesh = new THREE.InstancedMesh(geo, mat, grp.amount);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(mesh);
        this.meshes.push(mesh);

        const pos = new Float32Array(grp.amount * 3);
        const vel = new Float32Array(grp.amount * 3);
        for (let i = 0; i < grp.amount; i++) {
            pos[3 * i] = (Math.random() - 0.5) * 1000;
            pos[3 * i + 1] = (Math.random() - 0.5) * 1000;
            pos[3 * i + 2] = (Math.random() - 0.5) * 1000;
        }
        this.positions.push(pos);
        this.velocities.push(vel);
    }
/**
 * Sphere-bounce with clamping.
 * If the particle lies beyond the radius, we
 *   1) mirror its velocity about the surface normal
 *   2) snap the position back onto the sphere
 *
 * @param {ArrayLike<number>} pos   – position array (x,y,z, …)
 * @param {ArrayLike<number>} vel   – velocity array (x,y,z, …)
 * @param {number} i               – particle index
 * @param {number} bounds          – sphere radius (SimulationBounds)
 */
bounceSphere(pos, vel, i) {
    const idx = 3 * i;

    // unpack particle world-space position
    let x = pos[idx],
        y = pos[idx + 1],
        z = pos[idx + 2];

    // sphere center translation as [cx, cy, cz]
    const [cx, cy, cz] = this.translation;

    // compute relative vector from sphere center to particle
    let dx = x - cx,
        dy = y - cy,
        dz = z - cz;

    const r2     = dx * dx + dy * dy + dz * dz;
    const bound  = this.config.SimulationBounds;
    const bound2 = bound * bound;

    if (r2 <= bound2) {
        // still inside the translated sphere
        return;
    }

    // outward normal in world space
    const r  = Math.sqrt(r2);
    const nx = dx / r,
          ny = dy / r,
          nz = dz / r;

    // reflect the velocity about that normal
    const dot = vel[idx]     * nx +
                vel[idx + 1] * ny +
                vel[idx + 2] * nz;

    vel[idx]     -= 2 * dot * nx;
    vel[idx + 1] -= 2 * dot * ny;
    vel[idx + 2] -= 2 * dot * nz;

    // clamp back to sphere surface (in local space), then reapply translation
    const s = bound / r;   // scale factor ≤ 1

    pos[idx]     = cx + dx * s;
    pos[idx + 1] = cy + dy * s;
    pos[idx + 2] = cz + dz * s;
}



    addActionRule(incomingRule){
      this.actionRules.push(incomingRule);
    }
    update(delta) {
      if(this.shouldUpdate){
        this.groups.forEach((grpA, giA) => {
            const posA = this.positions[giA];
            const velA = this.velocities[giA];
            const meshA = this.meshes[giA];

            for (let i = 0; i < grpA.amount; i++) {
                let fx = 0, fy = 0, fz = 0;
                const ixA = 3 * i, iyA = ixA + 1, izA = ixA + 2;
                const x1 = posA[ixA], y1 = posA[iyA], z1 = posA[izA];

                this.groups.forEach((grpB, giB) => {
                    const posB = this.positions[giB];
                    const G = grpA.interactWeights[giB] / this.config.interactionScaling;
                    const R2 = grpA.interactRadii[giB] ** 2;

                    for (let j = 0; j < grpB.amount; j++) {
                        if (giA === giB && i === j) continue;
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

                velA[ixA] = (velA[ixA] + fx) * this.config.velocityScale[0];
                velA[iyA] = (velA[iyA] + fy) * this.config.velocityScale[1];
                velA[izA] = (velA[izA] + fz) * this.config.velocityScale[2];
            }

            for (let i = 0; i < grpA.amount; i++) {
                const ixA = 3 * i, iyA = ixA + 1, izA = ixA + 2;
                posA[ixA] += velA[ixA];
                posA[iyA] += velA[iyA];
                posA[izA] += velA[izA];

                for (let k = 0; k < 3; k++) {
                    // if (posA[3 * i + k] < -this.config.SimulationBounds || posA[3 * i + k] > this.config.SimulationBounds)
                    //     velA[3 * i + k] *= -1;
                        this.bounceSphere(posA, velA, i);
                }

                this.dummy.position.set(posA[ixA], posA[iyA], posA[izA]);
                this.dummy.updateMatrix();
                meshA.setMatrixAt(i, this.dummy.matrix);
            }
            meshA.instanceMatrix.needsUpdate = true;
        });
        this.actionRules.forEach(actionFunctions => {
          actionFunctions();
        });
        //this.handleMerges();
        //this.renderer.render(this.scene, this.camera);
        this.frameCount++;
      }
    }
}
