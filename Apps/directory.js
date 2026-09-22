/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

const BATCH_SIZE = 20;
const PREFETCH_AT = 10;

function createEntry(visual, index, total) {
  const entry = document.createElement('li');
  entry.className = 'directory-entry';
  entry.dataset.index = String(index + 1);
  entry.setAttribute('aria-posinset', String(index + 1));
  entry.setAttribute('aria-setsize', String(total));

  const preview = document.createElement('a');
  preview.className = 'directory-preview';
  preview.href = visual.url;
  preview.dataset.shape = visual.shape === 'square' ? 'square' : 'circle';
  preview.setAttribute('aria-label', `Open ${visual.title}`);
  const image = document.createElement('img');
  image.src = visual.image;
  image.alt = '';
  image.width = 104;
  image.height = 104;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => { image.src = '/assets/icon/jAsset.png'; }, { once: true });
  preview.appendChild(image);

  const copy = document.createElement('div');
  copy.className = 'directory-copy';
  const heading = document.createElement('h2');
  const titleLink = document.createElement('a');
  titleLink.href = visual.url;
  titleLink.textContent = visual.title;
  heading.appendChild(titleLink);
  const description = document.createElement('p');
  description.className = 'directory-description';
  description.textContent = visual.description;
  copy.append(heading, description);
  entry.append(preview, copy);
  return entry;
}

export function mountDirectory({ items, list, status, loadMore }) {
  let loaded = 0;
  let trigger = null;
  let scheduled = 0;
  let destroyed = false;
  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.target === trigger && entry.isIntersecting)) appendBatch();
    }) : null;

  function appendBatch() {
    if (destroyed || loaded >= items.length) return;
    observer?.disconnect();
    list.setAttribute('aria-busy', 'true');
    const end = Math.min(loaded + BATCH_SIZE, items.length);
    const fragment = document.createDocumentFragment();
    for (let index = loaded; index < end; index++) fragment.appendChild(createEntry(items[index], index, items.length));
    list.appendChild(fragment);
    loaded = end;
    list.setAttribute('aria-busy', 'false');
    status.textContent = loaded === items.length ? `All ${loaded} visuals loaded.` : `${loaded} of ${items.length} visuals`;
    loadMore.hidden = loaded >= items.length;
    // After batches 1, 2, 3, watch entries 10, 30, 50 respectively.
    trigger = loaded < items.length ? list.children[loaded - PREFETCH_AT - 1] : null;
    if (trigger) observer?.observe(trigger);
  }

  function checkPosition() {
    scheduled = 0;
    // Also handles jumping past a threshold without intersecting it.
    while (!destroyed && trigger && trigger.getBoundingClientRect().top <= window.innerHeight) appendBatch();
  }
  function scheduleCheck() {
    if (!scheduled && !destroyed) scheduled = requestAnimationFrame(checkPosition);
  }
  loadMore.addEventListener('click', appendBatch);
  window.addEventListener('scroll', scheduleCheck, { passive: true });
  window.addEventListener('resize', scheduleCheck);
  appendBatch();
  if (!items.length) {
    list.setAttribute('aria-busy', 'false');
    status.textContent = 'No visuals found.';
    loadMore.hidden = true;
  }
  return {
    destroy() {
      destroyed = true;
      observer?.disconnect();
      cancelAnimationFrame(scheduled);
      window.removeEventListener('scroll', scheduleCheck);
      window.removeEventListener('resize', scheduleCheck);
      loadMore.removeEventListener('click', appendBatch);
    },
  };
}
