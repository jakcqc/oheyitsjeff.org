# Local Art gallery

The gallery reads `manifest.json` from this folder. No remote asset database,

## Image folders

- `assets/originals/<filename>`: untouched original downloads. The browser requests
  these only after an artwork is clicked to open its full-image viewer.
- `assets/compressed/<filename>.webp`: high-quality, full-dimension WebP copies.
- `assets/previews/<filename>.webp`: previews encoded toward 160,000 bytes each,
  with a maximum edge of 1200px and no upscaling. These are the images lazily
  loaded in the gallery. The exact recipe and command are recorded in
  [the preview folder README](assets/previews/README.md).

The original extension stays in derivative names to avoid collisions between,
for example, `example.jpg` and `example.png`. Files are not renamed or numbered
again when generating the catalog.

## Add or update artwork

Place a still JPEG, PNG, WebP, TIFF, or PNM image in `assets/originals/`, keeping
the desired filename. Run:

```sh
python3 ART/build-assets.py
```

The builder requires Python 3 and the WebP command-line tools `cwebp` and
`webpinfo` on your PATH. Full-size copies use quality 90/method 6 with sharp YUV
conversion and embedded ICC profiles when available. Previews use six passes
targeting 160,000 bytes, a quality range of 20–90, and a maximum edge of 1200px.
The encoder adjusts quality to the image's content instead of relying on a
fixed 50% resize. Small/simple images can be smaller than the target. Originals
are never changed. Animated images are not supported.

Unchanged outputs are skipped. A preview recipe change regenerates previews
while reusing full-size compressed copies; `--force` rebuilds both stages.
Use `--watch` to rebuild automatically when local originals are added, changed,
or removed. Refresh the gallery to read the updated catalog. Existing ordering
is retained; new filenames are appended in natural order. Removing an original
removes its catalog entry on the next build.

A static browser cannot enumerate a server's filesystem, so the generated
manifest is the bridge between the local folder and the gallery. There is no
handwritten image list to maintain. Commit/deploy the manifest together with
the original and preview folders. The compressed folder is an intermediate
artifact and is never requested by the gallery.

The gallery still appends 20 entries at a time, uses native lazy image loading,
and retains its bubble layout, zoom, pan, rotation, and saved rotation state.
Each visit shuffles the catalog and independently assigns a balanced mix of
small, medium, and large bubbles. That order and those size assignments stay
fixed while scrolling or resizing; refreshing produces a new arrangement.

Art uses the available height below its header, without a footer bar. It follows
the shared saved/system theme. Previews and expanded originals show a loading
pulse and fade in after decoding; reduced-motion preferences disable animation.

`tracking.json` is legacy metadata and is not used by the gallery.
