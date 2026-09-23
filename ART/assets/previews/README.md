# Locked Art preview compression recipe

The preview recipe in `ART/build-assets.py` targets **160,000 bytes (160 KB)**
per image instead of the previous fixed 50% resize at quality 90.

Measured on the current 21-image set with this recipe:

- Average: **158.7 KB** (originally 806.0 KB).
- Range: **156.8–166.5 KB**.
- Combined size: **3.33 MB**, down from 16.93 MB (**80.3% smaller**).
- Dimensions: **900 × 1200**, or **1200 × 900** for landscape images.

KB and MB here use decimal bytes (1 KB = 1,000 bytes).

## Generate the gallery images

From the repository root:

```sh
python3 ART/build-assets.py
```

Or from this preview folder:

```sh
python3 ../../build-assets.py
```

The builder scans `ART/assets/originals/`, reuses unchanged full-size compressed
copies, regenerates previews when needed, and updates `ART/manifest.json` with
their dimensions and sizes. Use `--watch` for automatic updates or `--force` to
regenerate both compression stages. Requires Python 3, `cwebp`, and `webpinfo`.

## Exact preview encoder command

For a portrait image, run this from the preview folder:

```sh
cwebp -quiet -size 160000 -pass 6 -qrange 20 90 -m 6 \
  -sharp_yuv -metadata icc -mt -resize 900 1200 \
  "../compressed/kakeya5.jpg.webp" -o "kakeya5.jpg.webp"
```

For the current landscape images, use `-resize 1200 900`. The builder calculates
dimensions automatically: preserve aspect ratio, cap the longest edge at
1200px, round dimensions to the nearest pixel, and never upscale small inputs.

- **Size target:** 160,000 bytes; this is an encoder target, not a minimum or
  guaranteed exact size. Small/simple images may be smaller.
- **Quality search:** 20–90 across six passes.
- **Compression method:** 6, with sharp YUV conversion and multithreading.
- **Metadata:** retain ICC profiles when present.
- **Encoder used for tuning:** `cwebp` 1.6.0.
- **Input:** the full-size compressed copy, not the old preview. This avoids
  accumulating compression damage from repeatedly encoding previews.

Original image bytes and filenames stay unchanged. The gallery loads these
previews lazily and requests an original only when its full-image view is opened.
