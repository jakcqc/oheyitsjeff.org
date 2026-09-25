# algebraCOEF Wild: one app, one experiment

**17 new compositions, 17 different apps, no app reused from the first coefficient batch.** Together the two algebraCOEF batches contain 41 studies across 23 apps. [Browse only Wild](/Apps/?collection=algebraCOEF&search=wild) or [open the algebra lab](/Apps/algebra/#wild).

Each app gets its own composition and parameter set. These are exploratory works, not additional before/after pairs. The original 24 paired experiments remain available.

## Expanded coefficient vocabulary

| Coefficient | What it controls | Values explored here |
| --- | --- | --- |
| lambda-minus, lambda-plus | Smallest and largest echo scale; negative polygon/path factors invert around each object's center | -2.8 through 2.9, including golden-ratio endpoints -1.618 and 2.618 |
| k | Finite echo multiplicity | 4 to 6 copies on selected source families |
| ell | Distribution of echo sizes | Linear and new logarithmic spacing, including 0.125 to 2.2 |
| eta | Per-copy opacity recurrence | `sum(backward):opacity *0.72` and forward decay by 0.76 |
| alpha | Sampled vector length multiplier | Up to 7.7; actual length is alpha times the saved base height in source coordinates |
| tau | Spline tangent extrapolation | -4.5 to 3.3 with **extrapolate tension** explicitly enabled |
| phi | Rotation from the normal, tangent, or vertical direction | -71 to 151 degrees, including 137.507 degrees |
| m | Boundary quantization / control samples | Eight- and nine-vertex reductions up to 61 spline controls |
| q, j | Selection stride and phase | Sparse current-tree selectors such as every 37th path or every 11th source |
| d, s0, ds, dx, dy | Depth-copy count, initial scale, scale increment, and per-plane displacement | 2 to 5 transparent planes with different scales and offsets |
| a, b, c, d | Centered affine matrix / reflection | Strong shear, diagonal transposition, four reflected tiles |
| omega, nu, psi | Fourier placement, rectangle-size oscillation, and rotation phase in F | 11 position lobes, 17/7 size oscillations, 1375.07 degrees across the parameter interval |
| c | Palette assignment domain | Index, geometric size, and luminance, moved to different locations in each pipeline |

These are joint aesthetic changes across different sources. They are not isolated coefficient comparisons and do not establish general commutation laws.

## Three new native capabilities

**Logarithmic echoes.** The Effects tool's scale spacing selector now includes `logarithmic`. For nonzero endpoints with the same sign, s(t) = sign(s0) exp((1-t) log(abs(s0)) + t log(abs(s1))). This gives equal ratios instead of equal increments. Ranges that touch or cross zero use linear spacing. Existing linear and eased recipes keep their behavior. Negative scales are used on polygon/path geometry; circle and rectangle echoes still require positive dimensions.

**Extrapolated tension.** The spline effect now has an explicit `splineExtrapolateTension` switch. When enabled, the tangent multiplier is (1-tau)/2 without the usual 0-to-1 clamp: negative tau exaggerates tangent reach, and tau above one reverses the tangent contribution. The default remains clamped for existing recipes. The UI removes the tension input bounds while extrapolation is enabled.

**Angular vectors.** `splineAngleOffset` rotates the chosen base direction by phi degrees using (dx cos(phi) - dy sin(phi), dx sin(phi) + dy cos(phi)). Segment centers and lengths remain fixed. A default offset of zero preserves earlier exports.

The ordinary saved flow JSON stores all three settings, so reopening a study or importing its Flow reproduces the new operators. These controls also remain available for editing inside the native app's Effects tools.

## Operators and one-off compositions

**E** creates geometric echoes, **N** replaces selected geometry with sampled vectors, **Q** changes representation, **P** sets paint, **C** remaps colors, and **A** applies the final transform stack. **F** adds a parametric rectangle field in the canvas coordinate frame; in the Kakeya study it creates an eleven-lobed register around the needle field. Formula order is right to left. Actual selectors and full coefficients are in each formal JSON recipe.

| App | Study | Composition | SVG elements |
| --- | --- | --- | ---: |
| Boys Surface Model | [Projective Anti-Matter](svg/algebracoef-wild-projective-anti-matter.svg) | A o C o E (G) | 673 |
| Domain Coloring | [Pole Radio](svg/algebracoef-wild-pole-radio.svg) | A o C o N o Q o P (G) | 46,958 |
| Fractal Polyhedra | [Negative Crystal Weather](svg/algebracoef-wild-negative-crystal-weather.svg) | A o C o N o E (G) | 6,301 |
| Mandel Tiling (Zoomable) | [Escape Velocity Comb](svg/algebracoef-wild-escape-velocity-comb.svg) | A o C o Q o N (G) | 6,809 |
| Herwig Hauser Classic Collection | [Cusp Solar Flare](svg/algebracoef-wild-cusp-solar-flare.svg) | A o C o E o N (G) | 402 |
| InnerLight | [Eleven-Sided Time Machine](svg/algebracoef-wild-eleven-sided-time-machine.svg) | A o C o N o E (G) | 1,682 |
| L-System Garden | [Grammar in Retrograde](svg/algebracoef-wild-grammar-in-retrograde.svg) | A o C o N o E (G) | 4,888 |
| Lorenz Attractor | [Chaos Pressure Chamber](svg/algebracoef-wild-chaos-pressure-chamber.svg) | A o N o Q o C o E (G) | 1,701 |
| Marbled Patterns | [Strata With a Pulse](svg/algebracoef-wild-strata-with-a-pulse.svg) | A o C o E o N o Q (G) | 296 |
| Oliver Labs Collection | [Advection in Reverse](svg/algebracoef-wild-advection-in-reverse.svg) | A o N o C o E (G) | 518 |
| Pinkall, Schmitt, Gunn, Hoffmann Collection | [Nyquist Shatterglass](svg/algebracoef-wild-nyquist-shatterglass.svg) | A o C o E o N o Q (G) | 323 |
| Quasicrystalline Wickerwork | [The Loom Crosses Zero](svg/algebracoef-wild-loom-crosses-zero.svg) | A o C o N o Q o E (G) | 2,665 |
| Space Filling Curves | [City Without Scale](svg/algebracoef-wild-city-without-scale.svg) | A o P o Q o C o E (G) | 369 |
| Step Spline Lab | [Alias Observatory](svg/algebracoef-wild-alias-observatory.svg) | A o C o N (G) | 2,860 |
| SURFER Gallery (Bianca Violet) | [Singularity Crosswind](svg/algebracoef-wild-singularity-crosswind.svg) | A o C o N o E (G) | 33,818 |
| Voronoi (Fluid) | [Territory at the Event Horizon](svg/algebracoef-wild-territory-event-horizon.svg) | A o C o E o N o Q o P (G) | 6,067 |
| Kakeya / Besicovitch Needle (Perron-Tree Approx, Rectangles) | [Needle Frequency Altar](svg/algebracoef-wild-needle-frequency-altar.svg) | A o C o F o E (G) | 2,727 |

## Verification and local reproduction

Every export runs the native app and actual ordered Effects/Transform operations. Each recorded stage must change the SVG; ineffective selections fail export. Rendered SVGs are checked for finite coordinates and valid XML, and each has a 480px WebP thumbnail, source settings, flow, and formal coefficient recipe. Full SVGs are only downloaded on request.

The ignored `.local/abstract-studies/algebraCOEF-wild/` folder holds the exact recipes, native export adapter, review previews, and publisher. Run `node --experimental-default-type=module .local/abstract-studies/algebraCOEF-wild/tools/render.mjs algebracoef-wild` from the repository root to rerender. The builder is `.local/build-algebracoef-wild.py`; its app-disjointness check intentionally rejects re-adding a published batch. The stored JSON recipes remain the canonical rerender input. The publisher replaces only its own study slugs, preserving the earlier collection.
