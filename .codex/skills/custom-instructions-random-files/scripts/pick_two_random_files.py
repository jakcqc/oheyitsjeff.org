#!/usr/bin/env python3
"""Pick two random files from the repository.

This script avoids common noise directories and only returns regular files.
"""

from __future__ import annotations

import os
import random
from pathlib import Path

# Directories to skip while scanning for candidate files.
EXCLUDE_DIRS = {
    ".git",
    ".DS_Store",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".cache",
}


def iter_files(root: Path) -> list[Path]:
    candidates: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune excluded directories in-place so os.walk does not descend into them.
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for filename in filenames:
            path = Path(dirpath, filename)
            if path.is_file():
                candidates.append(path)
    return candidates


def main() -> None:
    root = Path.cwd()
    files = iter_files(root)
    if len(files) < 2:
        raise SystemExit("Need at least two files to sample from.")

    picks = random.sample(files, k=2)
    for path in picks:
        print(path.relative_to(root))


if __name__ == "__main__":
    main()
