/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import { mountDirectory } from './directory.js';
import { loadVisualCatalog } from '../helper/galleryRegistry.js';
import { createAppSearch } from './search.js';

// Shared by /Apps/ and the mobile gallery landing pages.
export function mountAppsViewer(container, { onBubbles } = {}) {
  const root = document.createElement('section');
  root.className = 'apps-viewer';
  root.innerHTML = `
    <form class="directory-search" role="search" aria-label="Search apps">
      <input class="directory-search-field" type="search" aria-label="Search Apps" placeholder="Search Apps" maxlength="160" autocomplete="off" spellcheck="false" disabled>
      <button class="directory-search-clear" type="button" hidden>Clear</button>
    </form>
    <ol class="directory-list" aria-label="Apps" aria-busy="true"></ol>
    <div class="directory-progress">
      <p role="status" aria-live="polite">Loading apps…</p>
      <button class="load-more" type="button" hidden>Load more</button>
      <button class="retry" type="button" hidden>Try again</button>
    </div>`;
  container.append(root);
  let bubblesButton;
  if (onBubbles) {
    bubblesButton = document.createElement('button');
    bubblesButton.type = 'button';
    bubblesButton.className = 'header-view-toggle';
    bubblesButton.textContent = 'Bubbles';
    bubblesButton.addEventListener('click', onBubbles);
    document.getElementById('headerActions')?.prepend(bubblesButton);
  }
  const list = root.querySelector('.directory-list');
  const status = root.querySelector('.directory-progress [role="status"]');
  const loadMore = root.querySelector('.load-more');
  const retry = root.querySelector('.retry');
  const form = root.querySelector('.directory-search');
  const searchInput = form.querySelector('input');
  const clearSearch = form.querySelector('button');
  let directory;
  let destroyed = false;
  let search;
  let searchTimer;
  function showResults() {
    clearTimeout(searchTimer);
    if (destroyed || !search) return;
    const query = searchInput.value.trim();
    const items = search(query);
    directory?.destroy();
    list.replaceChildren();
    directory = mountDirectory({ items, list, status, loadMore });
    clearSearch.hidden = !searchInput.value;
  }
  function queueSearch(event) {
    if (event.isComposing) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(showResults, 100);
  }
  searchInput.addEventListener('input', queueSearch);
  searchInput.addEventListener('compositionend', queueSearch);
  form.addEventListener('submit', event => { event.preventDefault(); showResults(); });
  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    showResults();
    searchInput.focus();
  });
  async function loadCatalog() {
    retry.hidden = true;
    status.textContent = 'Loading apps…';
    list.setAttribute('aria-busy', 'true');
    try {
      const items = await loadVisualCatalog();
      if (destroyed) return;
      search = createAppSearch(items);
      searchInput.disabled = false;
      showResults();
    } catch (error) {
      if (destroyed) return;
      list.setAttribute('aria-busy', 'false');
      status.textContent = 'The apps could not load. Please try again.';
      retry.hidden = false;
      console.error(error);
    }
  }
  retry.addEventListener('click', loadCatalog);
  loadCatalog();
  return {
    destroy() {
      destroyed = true;
      clearTimeout(searchTimer);
      directory?.destroy();
      bubblesButton?.remove();
      root.remove();
    }
  };
}
