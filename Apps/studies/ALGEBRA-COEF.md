# algebraCOEF: coefficients, repeated operations, and order

This extension adds **24 studies in 12 controlled pairs across six native apps**. [Browse algebraCOEF](/Apps/?collection=algebraCOEF), or see the [visual comparison](/Apps/algebra/#coefficients). Every study includes a final SVG, compressed preview, saved settings, reusable native flow, and formal recipe with measured operation counts.

## Wild extension: one composition per new app

[algebraCOEF Wild](ALGEBRA-COEF-WILD.md) adds 17 one-off studies from the 17 remaining apps, bringing algebraCOEF to 41 works. It adds native logarithmic echo spacing, opt-in extrapolated tension, and angular spline vectors, alongside signed scales, opacity recurrences, Fourier placement and depth layers. [Browse only Wild](/Apps/?collection=algebraCOEF&search=wild). The original 24-study paired experiment is documented below.

## Parameterized composition

Read compositions right to left:

- Source color: **I = A^r o N2[beta] o N1[alpha] o C o E[lambda,k] o B (G(R_seed(p), s, f))**.
- Mark color: **I = A^r o C o N2[beta] o N1[alpha] o E[lambda,k] o B (G(R_seed(p), s, f))**.

**R_seed** randomizes selected starting native parameters before rendering. **G(R_seed(p), s, f)** is the native source at those sampled parameters, ambient source seed **s**, and recorded frame count **f**. **B** is its fixed preparation: optional deletion rules, conversion, and paint, in the exact order recorded in the recipe. **E[lambda,k]** replaces each selected source with **k** scaled echoes, evenly spaced between **lambda** and 1.25, at opacity 0.72. **C** cycles four stroke colors over the current selected objects.

**N1[alpha]** replaces even siblings with sampled normal segments. **N2[beta]** applies the spline operator again, using tangent segments on the remaining eligible sources. Existing generated spline groups are skipped by the native tool. Each source is therefore sampled once, in one of two passes, rather than recursively expanding generated lines. Coefficients multiply segment length in each source's local coordinates: h1 = alpha * h0 and h2 = beta * h0. They do not multiply the SVG as an abstract vector. Base lengths and sample settings remain explicit in each flow.

**A^r** repeats a rotation followed by a 0.98 zoom **r** times. The repetition is expanded inside one transform stack: separate native transform stages replace the current stack and would not express a power. Rotation and uniform zoom give r times the angle and 0.98^r net zoom about the common center.

| Coefficient profile | alpha (normal) | beta (tangent) | lambda (smallest echo) | k (copies) | r (affine repeats) | Rotation per repeat |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0.65 | 1.35 | 0.62 | 2 | 2 | 1.4 degrees |
| B | 1.45 | 0.80 | 0.83 | 3 | 3 | -1.7 degrees |

These are two joint coefficient profiles, not an experiment that isolates one coefficient at a time. Within each order pair, all coefficients, native parameters, source code, seed, frame count, preparation, and final affine stack are held fixed. Only the position of C changes.

## Randomized starting states

The original 24 exports have been rerun with **12 distinct randomized starts**, one per comparison pair. Randomization runs after app defaults and the recipe baseline are loaded, before the native generator and every algebra operation. Both color orders receive the same sampled parameters and source seed; profiles A and B now begin from different sources.

The versioned `mulberry32-v1` sampler supports uniform ranges, inclusive integer ranges, discrete choices, additive offsets, and multiplicative perturbations. It uses a separate stream from the app's geometry randomness. Each saved setting and formal recipe includes the randomization seed, exact sampling rule, previous value, and sampled value. Source parameter and SVG hashes verify that each pair begins identically. Changing the randomization seed produces a new start; reopening a saved study restores its sampled values.

| Native app | Randomized starting properties |
| --- | --- |
| Game of Life | Cell size, initial fill, protofield noise, projection thresholds |
| Mondrian Abstraction | Grid spacing, line width, line opacity |
| Bacteria Visualizer | Colony count, radii, halo count and spacing, fade, motion speed, outline scale |
| Bacterial Constructs | Native seed, inoculation count, solver steps and resolution, diffusion, feed, kill, contour layers |
| Lissajous Figures | Curve count, both frequencies, phase offset, sample count, amplitude, stroke width |
| Procedural Grass | Native seed, distribution, density, blade height and width, taper, clumps, wind, bend, camera |

All 24 final geometry signatures differ from the previous batch. All 12 comparisons still preserve geometry within each pair and change the assigned line strokes. The 17 Wild studies remain unchanged.

## Measured order comparisons

All 12 pairs have identical ordered geometry and different assigned line strokes. Geometry signatures retain geometry, transforms, stroke widths, opacity, and non-paint styles; they omit metadata, titles, identifiers, run tags, and fill/stroke/color. Stroke comparisons resolve explicit attributes, inline styles, and ancestor inheritance. The rendered PNGs also differ in every pair. These observations establish noncommutation for these selected states and rules; they do not assert that every operator pair fails to commute.

| Pair | Source color SVG | Mark color SVG | Lines in each export | Changed line strokes |
| --- | --- | --- | ---: | ---: |
| Cell Coefficients A | [Source](svg/algebracoef-cell-a-source.svg) | [Marks](svg/algebracoef-cell-a-marks.svg) | 20,350 | 14,652 (72.0%) |
| Cell Coefficients B | [Source](svg/algebracoef-cell-b-source.svg) | [Marks](svg/algebracoef-cell-b-marks.svg) | 8,475 | 6,102 (72.0%) |
| Tile Resonance A | [Source](svg/algebracoef-tile-a-source.svg) | [Marks](svg/algebracoef-tile-a-marks.svg) | 8,250 | 5,940 (72.0%) |
| Tile Resonance B | [Source](svg/algebracoef-tile-b-source.svg) | [Marks](svg/algebracoef-tile-b-marks.svg) | 6,600 | 4,752 (72.0%) |
| Halo Interference A | [Source](svg/algebracoef-halo-a-source.svg) | [Marks](svg/algebracoef-halo-a-marks.svg) | 2,750 | 1,980 (72.0%) |
| Halo Interference B | [Source](svg/algebracoef-halo-b-source.svg) | [Marks](svg/algebracoef-halo-b-marks.svg) | 3,150 | 2,268 (72.0%) |
| Culture Derivatives A | [Source](svg/algebracoef-culture-a-source.svg) | [Marks](svg/algebracoef-culture-a-marks.svg) | 1,300 | 960 (73.85%) |
| Culture Derivatives B | [Source](svg/algebracoef-culture-b-source.svg) | [Marks](svg/algebracoef-culture-b-marks.svg) | 2,145 | 1,584 (73.85%) |
| Resonance Quotients A | [Source](svg/algebracoef-resonance-a-source.svg) | [Marks](svg/algebracoef-resonance-a-marks.svg) | 100 | 72 (72.0%) |
| Resonance Quotients B | [Source](svg/algebracoef-resonance-b-source.svg) | [Marks](svg/algebracoef-resonance-b-marks.svg) | 75 | 54 (72.0%) |
| Grass Tangent Fields A | [Source](svg/algebracoef-grass-a-source.svg) | [Marks](svg/algebracoef-grass-a-marks.svg) | 5,636 | 4,032 (71.54%) |
| Grass Tangent Fields B | [Source](svg/algebracoef-grass-b-source.svg) | [Marks](svg/algebracoef-grass-b-marks.svg) | 16,037 | 11,502 (71.72%) |

Each formal JSON recipe in `algebra/` records the coefficients, its companion, the expanded flow, actual stage counts, and the pair geometry hash. All recorded stages changed the SVG; both spline passes generated marks in every study. Native SVGs and flow files are reusable without the export harness.

## Complexity in the viewer

The Sort control orders the full filtered catalog by its recorded SVG vector element count, ascending or descending, before pagination. Each card shows this count. It is a simple structural measure: a long path counts as one element, as does a short line. It includes background and supporting vector elements, so it is not a count of visible marks, perceived detail, bytes, or rendering cost. Default / relevance restores the catalog or search ranking.

## Reproduction

The seeded sampler is in `scripts/study-randomization.mjs` and is covered by `tests/study-randomization.mjs`. The local, ignored `.local/abstract-studies/algebraCOEF/tools/` directory preserves the exact coefficient recipes, adapted native export harness, and website-asset publisher. From the repository root, run `node --experimental-default-type=module .local/abstract-studies/algebraCOEF/tools/render.mjs algebraCOEF`. The harness uses the local JSDOM/canvas dependencies and isolated Edge native-flow adapter. Then run `python .local/abstract-studies/algebraCOEF/tools/validate-randomized.py` and `node .local/abstract-studies/algebraCOEF/tools/publish.mjs` to measure the pairs and refresh public assets. The pre-randomization batch is archived locally under `before-randomization/`. SVG metadata retains source hashes, randomization receipts, and complete saved state. Contact sheets, raster review renders, and validation reports remain local.
