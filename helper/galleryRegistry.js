/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// The gallery pages and Apps read the same two registrations at runtime.
const GALLERIES = {
  main: { url: new URL('../projects.json', import.meta.url), shape: 'circle' },
  math: { url: new URL('../MathVisuals/projects.json', import.meta.url), shape: 'square' },
};

export async function loadGalleryProjects(name) {
  const gallery = GALLERIES[name];
  if (!gallery) throw new Error(`Unknown gallery: ${name}`);
  const response = await fetch(gallery.url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${name} gallery (${response.status})`);
  const projects = await response.json();
  if (!Array.isArray(projects)) throw new Error(`Invalid ${name} gallery registration`);
  return projects.map((project) => {
    for (const key of ['title', 'description', 'image', 'link']) {
      if (typeof project[key] !== 'string' || !project[key].trim()) {
        throw new Error(`Missing ${key} in ${name} gallery registration`);
      }
    }
    return {
      ...project,
      isApp: project.isApp !== false,
      image: new URL(project.image, gallery.url).href,
      link: new URL(project.link, gallery.url).href,
      gallery: name,
      shape: project.shape || gallery.shape,
      innerShape: project.innerShape || project.shape || gallery.shape,
      outerShape: project.outerShape || project.shape || gallery.shape,
    };
  });
}

export async function loadVisualCatalog() {
  const [main, math] = await Promise.all([
    loadGalleryProjects('main'), loadGalleryProjects('math'),
  ]);
  const unique = new Map();
  for (const project of [...main, ...math]) {
    if (!project.isApp) continue;
    const link = new URL(project.link);
    const key = `${link.origin}${link.pathname.replace(/\/+$/, '')}`;
    // An app registered in both galleries appears once, using its math square.
    unique.set(key, {
      title: project.infoTitle || project.title,
      description: project.description,
      url: project.link,
      image: project.image,
      // Directory preview shapes follow the gallery, independently of bubble styling.
      shape: GALLERIES[project.gallery].shape,
      gallery: project.gallery,
    });
  }
  return [...unique.values()].sort((a, b) =>
    a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) || a.url.localeCompare(b.url)
  );
}
