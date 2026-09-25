# Saved visual studies

This public collection contains 147 SVG studies from 23 visual apps. The Apps studies viewer loads `catalog.json`, then requests a compressed WebP thumbnail only when its card is near the viewport; the full SVG is loaded only through its download link. Opening a study loads its source app with the matching native settings JSON and starts native simulation and animation playback paused. Saved automatic flows are applied on opening and after native redraws, including resize; the user can resume playback with the app controls.

- `catalog.json`: lightweight searchable metadata for all studies.
- `svg/`: 147 final vector exports.
- `thumbnails/`: 147 compressed WebP previews, at most 480 pixels on the long edge and 48 KiB each. These are the only artwork files requested while browsing the gallery.
- `settings/`: 147 native app settings files, including saved toolbar operations.
- `flows/`: 67 reusable native flow JSON files.
- `algebra/`: 67 formal recipe JSON files linking to their flow and settings.
- `stages/`: seven intermediate Game of Life SVGs, small compressed WebPs, large `.large.webp` versions for the algebra walkthrough, and the stage manifest.
- `large/`: the six high-resolution algebra comparison WebPs. Large previews are rasterized from their original SVGs at 1600-2048px with a 400 KiB cap; sparse images compress smaller.
- `ALGEBRA-COEF-WILD.md`: 17 different-app experiments and the expanded native coefficient vocabulary.
- `ALGEBRA-COEF.md`: definitions and measured comparisons for the 24 algebraCOEF studies.
- `FLOW-ALGEBRA.md`: the formal notes linked from the viewer.

Original generation scripts, provenance records, uncompressed preview images, contact sheets, validation reports, previous HTML, and the ZIP archive are preserved locally in `.local/abstract-studies/2026-09-24/`. That entire directory is ignored by Git and is not part of the website. Archived generators retain their original path assumptions; adapt those paths before running them from the archive.

The SVGs retain their embedded native-source provenance and settings metadata. Public settings files intentionally remain ordinary JSON so the source app can load them without translating the study format.

Regenerate the compressed previews with `node scripts/generate-study-thumbnails.mjs` from the repository root. The generator requires `@napi-rs/canvas` and accepts `--node-modules <directory>` for an existing installation and `--source-dir <directory>` for an alternate render archive. It uses the archived rendered PNGs as source images; public pages use only the compressed WebPs.

Regenerate the larger algebra images directly from the original SVGs with `node scripts/generate-algebra-previews.mjs --node-modules <directory>`. No gallery thumbnails are enlarged or replaced by this generator.

The algebraCOEF recipes, native renderer, raster review files, and reports are preserved separately in `.local/abstract-studies/algebraCOEF/`. The original 106 studies remain unchanged.

Wild render sources and review files are separate in `.local/abstract-studies/algebraCOEF-wild/`. The gallery can filter the new batch using its `wild` search tag.
