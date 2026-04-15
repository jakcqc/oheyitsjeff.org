/**
 * Generate a random integer between min and max inclusive.
 */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  /**
   * Convert a 0-based index into an "Excel‐style" column name: 0→A, 25→Z, 26→AA, etc.
   */
  function indexToName(index) {
    let name = '';
    while (index >= 0) {
      name = String.fromCharCode(65 + (index % 26)) + name;
      index = Math.floor(index / 26) - 1;
    }
    return name;
  }
  
  /**
   * Parse either a hex‐string ("#RRGGBB" or "RRGGBB") or a decimal into an integer.
   */
  function parseColor(val) {
    if (typeof val === 'string') {
      return parseInt(val.replace(/^#/, ''), 16);
    }
    return val;
  }
  
  /**
   * Helper to pick a random value from a {min, max} object or return the value as-is.
   * Supports numbers and color strings/ints.
   */
  function pickRandomValue(val) {
    if (val && typeof val === 'object' && val.min !== undefined && val.max !== undefined) {
      // Handle color values
      if (typeof val.min === 'string' || typeof val.max === 'string') {
        const minColor = parseColor(val.min);
        const maxColor = parseColor(val.max);
        return randInt(minColor, maxColor);
      }
      // Handle numbers
      return randInt(val.min, val.max);
    }
    return val;
  }
  
  /**
   * Generate a random Cyclone configuration.
   *
   * @param {Object} minConfig   – { amount, depth, particleRadius, color, interactWeights, interactRadii }
   *                              each a {min, max} pair (color can be hex‐string or decimal)
   * @param {Object} maxConfig   – same shape as minConfig, giving the upper bounds
   * @param {Object} groupCountRange – { min: numberOfGroupsMin, max: numberOfGroupsMax }
   * @param {Object} [globalConfig]  – optional override for the outer GlobalConfig
   * @param {Object} [psConfig]      – optional override for the outer PS
   *
   * @returns {Object} an object of the form { Cyclone: { Groups: [...], GlobalConfig: {...}, PS: {...} } }
   */
  export function generateRandomCycloneConfig(
    minConfig,
    maxConfig,
    groupCountRange,
    globalConfig = {
      SimulationBounds: 450,
      velocityScale: [1.0, 1.0, 1.0],
      interactionScaling: 40000,
      baseParticleSize: 3,
      threeBackground: '#EDEDED',
    },
    psConfig = { translation: [1000, 0, 0] }
  ) {
    // Determine how many groups to create
    const count = randInt(groupCountRange.min, groupCountRange.max);
  
    // Pre-parse color bounds to integers
    const minColor = parseColor(minConfig.color.min);
    const maxColor = parseColor(maxConfig.color.max);
  
    // Build randomized globalConfig if ranges are provided
    let randomizedGlobalConfig = {};
    if (globalConfig && globalConfig.min && globalConfig.max) {
      const keys = Object.keys(globalConfig.min);
      for (const key of keys) {
        // Special handling for arrays (e.g., velocityScale)
        if (Array.isArray(globalConfig.min[key]) && Array.isArray(globalConfig.max[key])) {
          randomizedGlobalConfig[key] = globalConfig.min[key].map((minVal, idx) =>
            pickRandomValue({ min: minVal, max: globalConfig.max[key][idx] })
          );
        } else {
          randomizedGlobalConfig[key] = pickRandomValue({
            min: globalConfig.min[key],
            max: globalConfig.max[key],
          });
        }
      }
    } else {
      randomizedGlobalConfig = { ...globalConfig };
    }
  
    // Build randomized psConfig if ranges are provided
    let randomizedPSConfig = {};
    if (psConfig && psConfig.min && psConfig.max) {
      const keys = Object.keys(psConfig.min);
      for (const key of keys) {
        if (Array.isArray(psConfig.min[key]) && Array.isArray(psConfig.max[key])) {
          randomizedPSConfig[key] = psConfig.min[key].map((minVal, idx) =>
            pickRandomValue({ min: minVal, max: psConfig.max[key][idx] })
          );
        } else {
          randomizedPSConfig[key] = pickRandomValue({
            min: psConfig.min[key],
            max: psConfig.max[key],
          });
        }
      }
    } else {
      randomizedPSConfig = { ...psConfig };
    }
  
    // Build each group
    //we can track some meta ideas about the PS we form
    let energyG = 0;
    const groups = Array.from({ length: count }, (_, i) => {
      let energy = 0;
      const name = indexToName(i);
      const amount = randInt(minConfig.amount.min + 100/count, maxConfig.amount.max + 500/count );
      const depth = randInt(minConfig.depth.min, maxConfig.depth.max);
      const particleRadius = randInt(
        minConfig.particleRadius.min,
        maxConfig.particleRadius.max
      );
      // pick a color int between min and max, then convert back to decimal
      const color = randInt(minColor, maxColor);
  
      // Build interactions arrays of length=count
      const interactWeights = [];
      const interactRadii = [];
      for (let j = 0; j < count; j++) {
        // zero self‐weight (so particles in same group don't self-attract/repel)
        const ww = randInt(minConfig.interactWeights.min, maxConfig.interactWeights.max);
        const rw =  randInt(minConfig.interactRadii.min, maxConfig.interactRadii.max);
        energy += (rw*ww + (ww))**2;
        interactWeights.push(ww);
        interactRadii.push(rw);
      }
      energyG += (energy*amount);
      return {
        name,
        amount,
        depth,
        order: i,
        energy: energy,
        particleRadius,
        color,
        interactWeights,
        interactRadii,
      };
    });
  randomizedPSConfig["energy"] = energyG/count;
    return {
      Default: {
        Groups: groups,
        GlobalConfig: randomizedGlobalConfig,
        PS: randomizedPSConfig,
      },
    };
  }
  
  // — example usage —
  export function formatSciNotation(num) {
    if (num === 0) return "0";

    const sign = num < 0 ? "-" : "";
    const absNum = Math.abs(num);
    const exponent = Math.floor(Math.log10(absNum));
    const mantissa = absNum / Math.pow(10, exponent);

    return `${sign}${Math.floor(mantissa)} * 10^${exponent}`;
}


  const minCfg = {
    amount:        { min: 100,  max: 150 },
    depth:         { min: 1,   max: 2   },
    particleRadius:{ min: 5,   max: 8   },
    color:         { min: '#013320', max: '#FFCC00' },
    interactWeights:{ min: -90, max: 90 },
    interactRadii: { min: 400,  max: 600 },
  };
  
  const maxCfg = { ...minCfg }; // in this pattern you could supply different upper bounds
  
  // Example min/max for globalConfig
  const minGlobalCfg = {
    SimulationBounds: 2000,
    velocityScale: [0.9, 0.9, 0.9],
    interactionScaling: 400,
    baseParticleSize: 15,
    threeBackground: '#CCCCCC',
  };
  const maxGlobalCfg = {
    SimulationBounds: 6000,
    velocityScale: [0.95, 0.95, 0.95],
    interactionScaling: 1200,
    baseParticleSize: 30,
    threeBackground: '#FFFFFF',
  };
  
  // Example min/max for psConfig
  const minPSCfg = {
    translation: [900, -100, -100],
  };
  const maxPSCfg = {
    translation: [1100, 100, 100],
  };
  export function ranFromDefault(){
    return generateRandomCycloneConfig(
    minCfg,
    maxCfg,
    { min: 5, max: 10 },
    { min: minGlobalCfg, max: maxGlobalCfg },   
    { min: minPSCfg, max: maxPSCfg }
  );
  }
  const randomCyclone = generateRandomCycloneConfig(
    minCfg,
    maxCfg,
    { min: 2, max: 8 },
    { min: minGlobalCfg, max: maxGlobalCfg },   
    { min: minPSCfg, max: maxPSCfg }
  );

  //console.log(JSON.stringify(randomCyclone, null, 2));
  