/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

const MANIFEST_URL = new URL('./manifest.json', import.meta.url);
let catalogPromise;

export function loadArtCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(MANIFEST_URL, { cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw new Error(`Could not load the local Art catalog (${response.status})`);
      const catalog = await response.json();
      if (catalog.version !== 1 || !Array.isArray(catalog.assets)) {
        throw new Error('Invalid local Art catalog. Run ART/build-assets.py.');
      }
      const names = new Set();
      return catalog.assets.map(asset => {
        const { name, width, height, previewWidth, previewHeight } = asset;
        if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\]/.test(name) || names.has(name)
            || ![width, height, previewWidth, previewHeight].every(value => Number.isInteger(value) && value > 0)) {
          throw new Error('Invalid or duplicate asset in the local Art catalog');
        }
        names.add(name);
        const filename = encodeURIComponent(name);
        return {
          name, width, height, previewWidth, previewHeight,
          originalUrl: new URL(`./assets/originals/${filename}`, MANIFEST_URL).href,
          previewUrl: new URL(`./assets/previews/${filename}.webp`, MANIFEST_URL).href,
        };
      });
    }).catch(error => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

