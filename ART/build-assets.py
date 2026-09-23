#!/usr/bin/env python3
# Copyright (c) 2026 Jeffrey Kerley.
# SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
# Source-available for noncommercial public-source projects.
# No AI/ML training. No paid/commercial or closed-source application use.
# Personal noncommercial experimentation is permitted.
# Violating these conditions terminates permission under this license.
# See LICENSE.md at the repository root for the full terms.

"""Build the Art catalog and WebP derivatives from local, untouched originals."""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "assets" / "originals"
MANIFEST = ROOT / "manifest.json"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".pnm", ".ppm", ".pgm", ".pam"}
COMPRESSED_RECIPE = {"quality": 90, "method": 6, "sharpYuv": True, "metadata": "icc"}
PREVIEW_RECIPE = {
    "targetBytes": 160_000, "maxEdge": 1200, "passes": 6,
    "qualityMin": 20, "qualityMax": 90, "method": 6,
    "sharpYuv": True, "metadata": "icc",
}
RECIPE = {"version": 2, "compressed": COMPRESSED_RECIPE, "preview": PREVIEW_RECIPE}


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def dimensions(path):
    details = run("webpinfo", str(path))
    width = re.search(r"Width:\s*(\d+)", details)
    height = re.search(r"Height:\s*(\d+)", details)
    if not width or not height or "Animation: 1" in details:
        raise ValueError(f"Expected a still WebP image: {path}")
    return int(width[1]), int(height[1])


def natural_key(name):
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", name)]


def originals():
    return sorted((p for p in SOURCE.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS),
                  key=lambda p: natural_key(p.name))


def build(force=False):
    SOURCE.mkdir(parents=True, exist_ok=True)
    for tool in ("cwebp", "webpinfo"):
        if not shutil.which(tool):
            raise RuntimeError(f"Install the WebP command-line tools; {tool} is required.")
    recipe = {**RECIPE, "encoderVersion": run("cwebp", "-version").splitlines()[0]}
    previous = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    old_assets = previous.get("assets", []) if isinstance(previous, dict) else []
    old_by_name = {asset["name"]: asset for asset in old_assets}
    old_recipe = previous.get("recipe", {}) if isinstance(previous, dict) else {}
    old_compressed_recipe = old_recipe.get("compressed")
    if old_recipe.get("version") == 1:
        # The old half-size preview recipe used the same full-size compression.
        old_compressed_recipe = {
            "quality": old_recipe.get("quality"), "method": old_recipe.get("method"),
            "sharpYuv": True, "metadata": "icc",
        }
    old_order = previous if isinstance(previous, list) else [asset["name"] for asset in old_assets]
    order = {name: index for index, name in enumerate(old_order)}
    sources = originals()
    # Retain the gallery's existing order; append new local filenames naturally.
    sources.sort(key=lambda source: order.get(source.name, len(order)))
    assets = []
    for source in sources:
        name = source.name
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        compressed = ROOT / "assets" / "compressed" / f"{name}.webp"
        preview = ROOT / "assets" / "previews" / f"{name}.webp"
        old = old_by_name.get(name)
        reuse_compressed = bool(
            not force and old and old.get("sha256") == digest
            and old_compressed_recipe == COMPRESSED_RECIPE
            and old_recipe.get("encoderVersion") == recipe["encoderVersion"]
            and compressed.exists() and old.get("compressedBytes") == compressed.stat().st_size
        )
        if (reuse_compressed and old_recipe.get("preview") == PREVIEW_RECIPE and preview.exists()
                and old.get("previewBytes") == preview.stat().st_size):
            assets.append(old)
            continue
        compressed.parent.mkdir(parents=True, exist_ok=True)
        preview.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="art-images-") as temp:
            full = Path(temp) / "compressed.webp"
            small = Path(temp) / "preview.webp"
            # Stage 1: high-quality compression at the original pixel dimensions.
            if not reuse_compressed:
                run("cwebp", "-quiet", "-q", str(COMPRESSED_RECIPE["quality"]),
                    "-m", str(COMPRESSED_RECIPE["method"]), "-sharp_yuv", "-metadata", "icc", "-mt",
                    str(source), "-o", str(full))
            preview_source = compressed if reuse_compressed else full
            width, height = dimensions(preview_source)
            scale = min(1, PREVIEW_RECIPE["maxEdge"] / max(width, height))
            preview_width, preview_height = max(1, round(width * scale)), max(1, round(height * scale))
            # Stage 2: target bytes through multi-pass quality adjustment, with a size cap.
            run("cwebp", "-quiet", "-size", str(PREVIEW_RECIPE["targetBytes"]),
                "-pass", str(PREVIEW_RECIPE["passes"]),
                "-qrange", str(PREVIEW_RECIPE["qualityMin"]), str(PREVIEW_RECIPE["qualityMax"]),
                "-m", str(PREVIEW_RECIPE["method"]), "-sharp_yuv", "-metadata", "icc", "-mt",
                "-resize", str(preview_width), str(preview_height), str(preview_source), "-o", str(small))
            if dimensions(small) != (preview_width, preview_height):
                raise ValueError(f"Incorrect preview dimensions: {name}")
            if not reuse_compressed:
                shutil.copyfile(full, compressed)
            shutil.copyfile(small, preview)
        assets.append({
            "name": name, "width": width, "height": height,
            "previewWidth": preview_width, "previewHeight": preview_height,
            "originalBytes": source.stat().st_size,
            "compressedBytes": compressed.stat().st_size,
            "previewBytes": preview.stat().st_size, "sha256": digest,
        })
        print(f"Built {name}: {preview_width}x{preview_height}, {preview.stat().st_size / 1000:.1f} KB", flush=True)
    catalog = {"version": 1, "recipe": recipe, "assets": assets}
    output = json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"
    if not MANIFEST.exists() or MANIFEST.read_text() != output:
        pending = MANIFEST.with_suffix(".json.tmp")
        pending.write_text(output)
        pending.replace(MANIFEST)
    totals = [sum(asset[key] for asset in assets) for key in ("originalBytes", "compressedBytes", "previewBytes")]
    print(f"Catalog: {len(assets)} assets; original/compressed/preview bytes: {totals}", flush=True)
    if assets:
        print(f"Average preview: {totals[2] / len(assets) / 1000:.1f} KB", flush=True)


def fingerprint():
    return [(p.name, p.stat().st_size, p.stat().st_mtime_ns) for p in originals()]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true", help="Rebuild after local originals are added, changed, or removed")
    parser.add_argument("--force", action="store_true", help="Regenerate all compressed images and previews")
    args = parser.parse_args()
    build(force=args.force)
    if args.watch:
        print(f"Watching {SOURCE}", flush=True)
        last = fingerprint()
        try:
            while True:
                time.sleep(2)
                current = fingerprint()
                if current != last:
                    # Wait until a file copy has stopped changing before encoding it.
                    time.sleep(1)
                    if fingerprint() != current:
                        continue
                    try:
                        build()
                        last = current
                    except (ValueError, OSError, subprocess.CalledProcessError) as error:
                        print(f"Build failed; keeping the last catalog and retrying: {error}", flush=True)
        except KeyboardInterrupt:
            pass
