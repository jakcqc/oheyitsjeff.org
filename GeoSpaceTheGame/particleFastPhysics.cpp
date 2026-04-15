#include <cmath>
#include <cstdint>

extern "C" void physics_kernel(
    float* positions,        // flat: [x, y, z, x, y, z, ...] for all particles
    float* velocities,       // same as above
    int32_t* groupOffsets,   // start index (in #particles) for each group
    int32_t* amounts,        // particles per group
    int32_t  numGroups,
    float* interactWeights,  // flat [numGroups * numGroups]
    float* interactRadii,    // flat [numGroups * numGroups]
    float   interactionScaling,
    float* velocityScale,    // [3]
    int32_t totalParticles
) {
    for (int giA = 0; giA < numGroups; ++giA) {
        int offsetA = groupOffsets[giA];
        int amountA = amounts[giA];
        for (int i = 0; i < amountA; ++i) {
            int idxA = (offsetA + i) * 3;
            float fx = 0, fy = 0, fz = 0;
            float x1 = positions[idxA], y1 = positions[idxA+1], z1 = positions[idxA+2];

            for (int giB = 0; giB < numGroups; ++giB) {
                int offsetB = groupOffsets[giB];
                int amountB = amounts[giB];
                float G = interactWeights[giA * numGroups + giB] / interactionScaling;
                float R2 = interactRadii[giA * numGroups + giB];
                R2 *= R2;

                for (int j = 0; j < amountB; ++j) {
                    if (giA == giB && i == j) continue;
                    int idxB = (offsetB + j) * 3;
                    float dx = x1 - positions[idxB];
                    float dy = y1 - positions[idxB+1];
                    float dz = z1 - positions[idxB+2];
                    float d2 = dx*dx + dy*dy + dz*dz;
                    if (d2 > 0 && d2 < R2) {
                        float inv = 1.0f / sqrtf(d2);
                        fx += dx * inv * G;
                        fy += dy * inv * G;
                        fz += dz * inv * G;
                    }
                }
            }
            velocities[idxA]   = (velocities[idxA]   + fx) * velocityScale[0];
            velocities[idxA+1] = (velocities[idxA+1] + fy) * velocityScale[1];
            velocities[idxA+2] = (velocities[idxA+2] + fz) * velocityScale[2];
        }
    }
}
