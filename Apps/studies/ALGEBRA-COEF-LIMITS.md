# algebraCOEF Limits: 80 extreme native simulations

**[Browse all 80 limits studies](/Apps/?collection=algebraCOEF&search=limits).** The batch contains 40 main-visual studies and 40 math-visual studies across all 23 source apps. Each of the five main apps contributes eight; each of the 18 math apps contributes two or three. Source-app allocation is nearly uniform within each group. The stressed parameter values are deliberately chosen boundary probes, not random draws.

Each SVG is a native simulation run at its saved settings followed by the saved algebraCOEF flow. The expression in its formal JSON recipe reads right to left: `I = O_n o ... o O_1 (G(p, s, f))`. Every enabled stage changed the SVG. Each study has a full SVG, 480-pixel WebP thumbnail, native settings, reusable Flow, and formal JSON recipe.

## The rate coefficient rho

For each study, `b` is its source recipe value and `x*` is the stressed value. We declare an **exploration proposal** `X ~ Uniform(L, U)`. If `x* >= b`, let `L = min(0, b)` and `U = x* + 0.07 |x* - b|`; then `rho = P(X >= x*) = (U - x*) / (U - L)`. If `x* < b`, let `L = x* - 0.07 |x* - b|` and `U = max(0, b)`; then `rho = P(X <= x*) = (x* - L) / (U - L)`. Every recipe stores its actual interval, inequality, threshold, and computed coefficient.

For the Kakeya study, `b = 6.3` and `x* = 700` **normalized needle units**. Its proposal is `Uniform(0, 748.559)`, so `rho is about 6.49%`. The native control uses normalized units, not pixels; the 700-unit field is fitted to the export viewport.

**rho measures a parameter-draw tail under this stated proposal.** It is not the frequency of an event in the simulation, a probability that the visual form appears, or an empirical estimate from 80 selected outputs. Estimating those rates would require a defined event detector and repeated independent native runs. Here the coefficient makes the extremity of each chosen control value explicit and reproducible.

## What the extremes may look like

These are visual hypotheses based on the native control and the saved operator flow. The SVG links show the actual exports; several limits intentionally become sparse, clipped, or nearly saturated.

### Main visuals (40)

| App | SVG study | Native limit | rho | Appearance |
| --- | --- | --- | ---: | --- |
| Interference | [Crowded Halo](svg/algebracoef-limits-bacteriavisualizer-01-crowded-halo.svg) | `ringCount = 90` | 6.13% | Many rings form dense halos |
| Interference | [Single Halo](svg/algebracoef-limits-bacteriavisualizer-02-single-halo.svg) | `ringCount = 1` | 6.54% | One ring exposes each colony core |
| Interference | [Orbit Crowd](svg/algebracoef-limits-bacteriavisualizer-03-orbit-crowd.svg) | `multiRingCount = 95` | 6.09% | Secondary rings overlap |
| Interference | [Separated Orbits](svg/algebracoef-limits-bacteriavisualizer-04-separated-orbits.svg) | `multiRingGap = 180` | 6.21% | Wide gaps send rings beyond their hosts |
| Interference | [Giant Nuclei](svg/algebracoef-limits-bacteriavisualizer-05-giant-nuclei.svg) | `ringMinRadius = 350` | 5.93% | Large nuclei collide early |
| Interference | [Oversize Membranes](svg/algebracoef-limits-bacteriavisualizer-06-oversize-membranes.svg) | `ringMaxRadius = 900` | 5.87% | Membranes exceed the colony frame |
| Interference | [Repulsion Shock](svg/algebracoef-limits-bacteriavisualizer-07-repulsion-shock.svg) | `collisionPush = 16` | 6.20% | Strong collision response separates cells |
| Interference | [Instant Fade](svg/algebracoef-limits-bacteriavisualizer-08-instant-fade.svg) | `multiRingFade = 0.4` | 6.27% | Fast decay favors earliest rings |
| Bacterial Constructs | [Chemotaxis Storm](svg/algebracoef-limits-bacterialconstructs-01-chemotaxis-storm.svg) | `chemotaxis = 24` | 6.34% | Growth chases steep gradients |
| Bacterial Constructs | [Negative Chemotaxis](svg/algebracoef-limits-bacterialconstructs-02-negative-chemotaxis.svg) | `chemotaxis = -16` | 6.54% | Growth flees gradients |
| Bacterial Constructs | [Diffuse A](svg/algebracoef-limits-bacterialconstructs-03-diffuse-a.svg) | `diffusionA = 8` | 5.77% | Activator diffuses across the field |
| Bacterial Constructs | [Diffuse B](svg/algebracoef-limits-bacterialconstructs-04-diffuse-b.svg) | `diffusionB = 8` | 6.19% | Inhibitor spreads broadly |
| Bacterial Constructs | [Runaway Growth](svg/algebracoef-limits-bacterialconstructs-05-runaway-growth.svg) | `growth = 2` | 6.50% | Fast growth nears saturation |
| Bacterial Constructs | [Feed Deluge](svg/algebracoef-limits-bacterialconstructs-06-feed-deluge.svg) | `feed = 0.35` | 5.98% | Heavy feeding sustains reaction zones |
| Bacterial Constructs | [Kill Frontier](svg/algebracoef-limits-bacterialconstructs-07-kill-frontier.svg) | `kill = 0.35` | 5.54% | Heavy removal erases persistent zones |
| Bacterial Constructs | [Contour Compression](svg/algebracoef-limits-bacterialconstructs-08-contour-compression.svg) | `contourLevels = 44` | 4.84% | Many isolines pack the field |
| Game of Life (SVG) | [Cell Dust](svg/algebracoef-limits-gameoflife-aug-01-cell-dust.svg) | `cellPx = 11` | 6.54% | Small cells make a granular life field |
| Game of Life (SVG) | [Giant Cells](svg/algebracoef-limits-gameoflife-aug-02-giant-cells.svg) | `cellPx = 170` | 4.78% | Large cells turn the field into a few blocks |
| Game of Life (SVG) | [Silent Noise](svg/algebracoef-limits-gameoflife-aug-03-silent-noise.svg) | `protoNoise = 0.001` | 6.54% | Almost no noise exposes threshold bands |
| Game of Life (SVG) | [Noise Six](svg/algebracoef-limits-gameoflife-aug-04-noise-six.svg) | `protoNoise = 6` | 3.11% | High noise seeds scattered live islands |
| Game of Life (SVG) | [Noise Ten](svg/algebracoef-limits-gameoflife-aug-05-noise-ten.svg) | `protoNoise = 10` | 4.51% | Higher noise widens irregular live islands |
| Game of Life (SVG) | [Noise Fourteen](svg/algebracoef-limits-gameoflife-aug-06-noise-fourteen.svg) | `protoNoise = 14` | 5.10% | Heavy noise crowds the activation frontier |
| Game of Life (SVG) | [Noise Eighteen](svg/algebracoef-limits-gameoflife-aug-07-noise-eighteen.svg) | `protoNoise = 18` | 5.42% | Extreme noise fragments the threshold field |
| Game of Life (SVG) | [Noise Twenty Two](svg/algebracoef-limits-gameoflife-aug-08-noise-twenty-two.svg) | `protoNoise = 22` | 5.63% | Maximum noise overwhelms regular field structure |
| InnerLight | [Crowded Reliquary](svg/algebracoef-limits-innerlight-01-crowded-reliquary.svg) | `custom.numElements = 180` | 5.27% | Many elements overlap |
| InnerLight | [Three Remnants](svg/algebracoef-limits-innerlight-02-three-remnants.svg) | `custom.numElements = 3` | 6.54% | Few elements expose the grammar |
| InnerLight | [Almost Circles](svg/algebracoef-limits-innerlight-03-almost-circles.svg) | `custom.numSides = 96` | 5.84% | High polygon order approaches rings |
| InnerLight | [Triangle Engine](svg/algebracoef-limits-innerlight-04-triangle-engine.svg) | `custom.numSides = 3` | 6.54% | Minimal polygon order exposes triangles |
| InnerLight | [Outer Radius](svg/algebracoef-limits-innerlight-05-outer-radius.svg) | `custom.radius = 320` | 6.29% | The first polygon reaches the edge |
| InnerLight | [Point Origin](svg/algebracoef-limits-innerlight-06-point-origin.svg) | `custom.radius = 0.02` | 6.54% | The first polygon shrinks to a point |
| InnerLight | [Rapid Expansion](svg/algebracoef-limits-innerlight-07-rapid-expansion.svg) | `custom.incrementSize = 120` | 6.10% | Successive elements rush outward |
| InnerLight | [Radial Reversal](svg/algebracoef-limits-innerlight-08-radial-reversal.svg) | `custom.incrementSize = -35` | 6.54% | Later elements fold through the origin |
| Mondrian Abstraction | [Micro Tiles 18](svg/algebracoef-limits-mondrianabstraction-01-micro-tiles-18.svg) | `grid.cellSize = 18` | 6.54% | Extremely fine tiles crowd the grid |
| Mondrian Abstraction | [Micro Tiles 20](svg/algebracoef-limits-mondrianabstraction-02-micro-tiles-20.svg) | `grid.cellSize = 20` | 6.54% | Fine tiles form a dense second scale |
| Mondrian Abstraction | [Micro Tiles 22](svg/algebracoef-limits-mondrianabstraction-03-micro-tiles-22.svg) | `grid.cellSize = 22` | 6.54% | Fine tiles approach a woven field |
| Mondrian Abstraction | [Micro Tiles 24](svg/algebracoef-limits-mondrianabstraction-04-micro-tiles-24.svg) | `grid.cellSize = 24` | 6.54% | Small tiles expose many local divisions |
| Mondrian Abstraction | [Monumental Tiles 260](svg/algebracoef-limits-mondrianabstraction-05-monumental-tiles-260.svg) | `grid.cellSize = 260` | 4.13% | Large tiles leave broad color blocks |
| Mondrian Abstraction | [Monumental Tiles 300](svg/algebracoef-limits-mondrianabstraction-06-monumental-tiles-300.svg) | `grid.cellSize = 300` | 4.46% | Few large tiles remain |
| Mondrian Abstraction | [Monumental Tiles 330](svg/algebracoef-limits-mondrianabstraction-07-monumental-tiles-330.svg) | `grid.cellSize = 330` | 4.65% | The grid approaches a handful of blocks |
| Mondrian Abstraction | [Monumental Tiles 400](svg/algebracoef-limits-mondrianabstraction-08-monumental-tiles-400.svg) | `grid.cellSize = 400` | 4.99% | Oversize tiles reduce the field to a few slabs |

### Math visuals (40)

| App | SVG study | Native limit | rho | Appearance |
| --- | --- | --- | ---: | --- |
| Boys Surface Model | [Double Twist](svg/algebracoef-limits-boyssurfacemodel-01-double-twist.svg) | `twist = 720` | 6.54% | Two turns entangle ribbon sheets |
| Boys Surface Model | [Layer Exile](svg/algebracoef-limits-boyssurfacemodel-02-layer-exile.svg) | `layerSpread = 40` | 5.94% | Large spacing opens gaps between sheets |
| Domain Coloring | [Complex Plane Planets](svg/algebracoef-limits-domaincoloring-01-complex-plane-planets.svg) | `dotMaxRadius = 90` | 6.08% | Large dots hide local phase |
| Domain Coloring | [Contour Torrent](svg/algebracoef-limits-domaincoloring-02-contour-torrent.svg) | `contourCount = 150` | 5.68% | Contour bands crowd the phase field |
| Domain Coloring | [Pole Frequency](svg/algebracoef-limits-domaincoloring-03-pole-frequency.svg) | `ringDensity = 450` | 5.56% | Tight rings radiate from singularities |
| Fractal Polyhedra | [Four Turn Crystal](svg/algebracoef-limits-fractalpolyhedra-01-four-turn-crystal.svg) | `spin = 1440` | 6.54% | Repeated turns rotate recursive faces |
| Fractal Polyhedra | [Crystal Scatter](svg/algebracoef-limits-fractalpolyhedra-02-crystal-scatter.svg) | `spread = 35` | 5.91% | Branches pull their shards apart |
| Mandel Tiling (Zoomable) | [Sixty Fold Escape](svg/algebracoef-limits-generic-01-sixty-fold-escape.svg) | `multibrot.Power = 60` | 6.54% | High exponent packs escape lobes |
| Mandel Tiling (Zoomable) | [Inverse Escape](svg/algebracoef-limits-generic-02-inverse-escape.svg) | `multibrot.Power = -40` | 6.02% | Negative exponent reverses escape geometry |
| Herwig Hauser Classic Collection | [Algebraic Warp](svg/algebracoef-limits-herwighauserclassiccollection-01-algebraic-warp.svg) | `warp = 90` | 6.54% | Petals fold through abrupt crossings |
| Herwig Hauser Classic Collection | [Counter Twist](svg/algebracoef-limits-herwighauserclassiccollection-02-counter-twist.svg) | `twist = -720` | 6.54% | Reverse turns reorder the petals |
| L-System Garden | [Four Turn Grammar](svg/algebracoef-limits-lsystemgarden-01-four-turn-grammar.svg) | `angle = 1440` | 5.20% | Branches repeatedly retrace directions |
| L-System Garden | [Full Circle Jitter](svg/algebracoef-limits-lsystemgarden-02-full-circle-jitter.svg) | `jitterAngle = 360` | 4.65% | Jitter scatters all branch headings |
| Lissajous Figures | [Frequency A Skyline](svg/algebracoef-limits-lissajousfigures-01-frequency-a-skyline.svg) | `freqA = 280` | 6.24% | First frequency creates very dense folds |
| Lissajous Figures | [Frequency B Skyline](svg/algebracoef-limits-lissajousfigures-02-frequency-b-skyline.svg) | `freqB = 233` | 6.32% | Second frequency creates competing folds |
| Lissajous Figures | [Amplitude Escape](svg/algebracoef-limits-lissajousfigures-03-amplitude-escape.svg) | `amplitude = 5` | 6.04% | Large amplitude sends curves beyond the frame |
| Lorenz Attractor | [Rho Furnace](svg/algebracoef-limits-lorenzattractor-01-rho-furnace.svg) | `rho = 400` | 3.82% | The orbit leaves its familiar wings |
| Lorenz Attractor | [Sigma Shear](svg/algebracoef-limits-lorenzattractor-02-sigma-shear.svg) | `sigma = 320` | 5.73% | The trajectory crosses phase space rapidly |
| Lorenz Attractor | [Beta Near Zero](svg/algebracoef-limits-lorenzattractor-03-beta-near-zero.svg) | `beta = 0.015` | 6.54% | Slow contraction stretches the orbit |
| Marbled Patterns | [Marble Tsunami](svg/algebracoef-limits-marbledpatterns-01-marble-tsunami.svg) | `amplitude = 3200` | 5.24% | High amplitude folds bands beyond the canvas |
| Marbled Patterns | [Reverse Vortex](svg/algebracoef-limits-marbledpatterns-02-reverse-vortex.svg) | `swirlStrength = -120` | 6.17% | Reverse swirl breaks bands into fragments |
| Oliver Labs Collection | [Curl Singularity](svg/algebracoef-limits-oliverlabscollection-01-curl-singularity.svg) | `curl = 320` | 6.54% | Currents change direction sharply |
| Oliver Labs Collection | [Long Advection](svg/algebracoef-limits-oliverlabscollection-02-long-advection.svg) | `stepSize = 280` | 5.62% | Integration leaps across the field |
| Pinkall, Schmitt, Gunn, Hoffmann Collection | [Surface Aliasing](svg/algebracoef-limits-pinkallschmittgunnhoffmanncollection-01-surface-aliasing.svg) | `frequency = 700` | 6.26% | Waves exceed lattice sampling rate |
| Pinkall, Schmitt, Gunn, Hoffmann Collection | [Amplitude Cliff](svg/algebracoef-limits-pinkallschmittgunnhoffmanncollection-02-amplitude-cliff.svg) | `amplitude = 45` | 6.21% | Displacement folds contours into cliffs |
| Procedural Grass Field | [Seven Hundred Pixel Grass](svg/algebracoef-limits-proceduralgrass-01-seven-hundred-pixel-grass.svg) | `bladeHeight = 700` | 5.21% | Blades tower over the ground |
| Procedural Grass Field | [Hurricane Grass](svg/algebracoef-limits-proceduralgrass-02-hurricane-grass.svg) | `windStrength = 12` | 5.95% | Strong wind drives blades sideways |
| Quasicrystalline Wickerwork | [Four Turn Weave](svg/algebracoef-limits-quasicrystallinewickerwork-01-four-turn-weave.svg) | `twist = 1440` | 6.54% | Strands cross competing directions |
| Quasicrystalline Wickerwork | [Warped Wicker](svg/algebracoef-limits-quasicrystallinewickerwork-02-warped-wicker.svg) | `radialWarp = 35` | 5.82% | Aperiodic rings pull apart |
| Space Filling Curves | [Stretched Parcels](svg/algebracoef-limits-spacefillingcurves-01-stretched-parcels.svg) | `maxRectAspect = 2200` | 6.33% | Parcels become needle thin |
| Space Filling Curves | [Parcel Horizon](svg/algebracoef-limits-spacefillingcurves-02-parcel-horizon.svg) | `maxRectSize = 3000` | 5.41% | Huge parcels swallow nearby curves |
| Step Spline Lab | [Nine Hundred Unit Steps](svg/algebracoef-limits-stepsplinelab-01-nine-hundred-unit-steps.svg) | `sceneMagnitude = 900` | 5.92% | Long signed steps fling fragments outward |
| Step Spline Lab | [Reverse Step Field](svg/algebracoef-limits-stepsplinelab-02-reverse-step-field.svg) | `sceneMagnitude = -900` | 6.54% | Reverse steps invert line direction |
| SURFER Gallery (Bianca Violet) | [Implicit Warp](svg/algebracoef-limits-surfergallerybiancaviolet-01-implicit-warp.svg) | `warp = 240` | 6.54% | Implicit contours fracture |
| SURFER Gallery (Bianca Violet) | [Rotating Level Sets](svg/algebracoef-limits-surfergallerybiancaviolet-02-rotating-level-sets.svg) | `rotation = 120` | 6.32% | Level sets cross at steep angles |
| Voronoi (Fluid) | [Territory Walls](svg/algebracoef-limits-voronoi-01-territory-walls.svg) | `strokeWidth = 70` | 6.47% | Thick borders compete with cells |
| Voronoi (Fluid) | [Transparent Territories](svg/algebracoef-limits-voronoi-02-transparent-territories.svg) | `fillOpacity = 0.001` | 6.54% | Faint cells leave borders exposed |
| Kakeya / Besicovitch Needle (Perron-Tree Approx, Rectangles) | [Seven Hundred Unit Needle](svg/algebracoef-limits-kakeya-01-seven-hundred-unit-needle.svg) | `needleLen = 700` | 6.49% | An enormous fitted needle dominates the Perron footprint |
| Kakeya / Besicovitch Needle (Perron-Tree Approx, Rectangles) | [Needle Wall](svg/algebracoef-limits-kakeya-02-needle-wall.svg) | `needleThickPx = 160` | 6.52% | Wide tubes become opaque slabs |
| Kakeya / Besicovitch Needle (Perron-Tree Approx, Rectangles) | [Wide Perron Fan](svg/algebracoef-limits-kakeya-03-wide-perron-fan.svg) | `baseWidth = 80` | 6.10% | The starting triangle stretches the direction fan |

## Reproduction and checks

Run `python scripts/build-coef-limits.py`, then `node --experimental-default-type=module .local/abstract-studies/algebraCOEF-limits/tools/render.mjs limits`, then `node --experimental-default-type=module scripts/publish-coef-limits.mjs` from the repository root. The existing local algebraCOEF renderer dependencies and native browser adapter are required. The builder copies the proven Wild renderer into an ignored local work area, and the publisher copies only verified final assets into this public collection.

The render pass checks valid SVG XML, finite values, native flow success, and that each enabled stage changes the artwork. The publisher enforces the 48 KiB thumbnail budget. All 80 preview images were compared by content hash within their source app and are distinct. Contact sheets and uncompressed review images remain in the ignored local work area.

