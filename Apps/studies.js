/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

import { createAppSearch } from './search.js';
import { sortStudies } from './studySort.js';

const PAGE_SIZE = 20;
const MAX_IMAGE_LOADS = 2;
const IMAGE_MARGIN = 180;
const assetUrl = (folder, slug, extension) => new URL(`./studies/${folder}/${encodeURIComponent(slug)}.${extension}`, import.meta.url).href;

function sourceUrl(record) {
  const source = new URL(`../${encodeURIComponent(record.app)}/index.html`, import.meta.url);
  source.searchParams.set('settings', new URL(assetUrl('settings', record.slug, 'json')).pathname);
  source.searchParams.set('settingsVisual', record.visualId);
  return source.href;
}

export function mountStudiesViewer(container, { createViewSelector } = {}) {
  const root = document.createElement('section');
  root.className = 'studies-viewer';
  root.innerHTML = `
    <div class="studies-intro">
      <div><h1>SVG studies</h1><p>Explore saved moments from the visual apps. Open any study to play with its settings.</p><a class="studies-intro-link" href="/Apps/algebra/">Explore the algebra walkthrough &amp; notes</a></div>
      <p class="studies-total" aria-live="polite"></p>
    </div>
    <form class="studies-browse-tools" role="search" aria-label="Search SVG studies">
      <div class="studies-search-wrap">
        <input id="study-search" type="search" aria-label="Search SVG studies" placeholder="Search studies, apps, effects…" maxlength="160" autocomplete="off" spellcheck="false" disabled>
        <button class="studies-search-clear" type="button" hidden>Clear</button>
      </div>
    </form>
    <div class="studies-filters" aria-label="Filter studies">
      <label>App<select id="study-app-filter" disabled><option value="all">All apps</option></select></label>
      <label>Type<select id="study-kind-filter" disabled><option value="all">Main + Math</option><option value="main">Main visuals</option><option value="math">Math visuals</option></select></label>
      <label>Color<select id="study-color-filter" disabled><option value="all">All colors</option><option value="mono">Monochrome</option><option value="color">Color</option></select></label>
      <label>Series<select id="study-collection-filter" disabled><option value="all">All studies</option></select></label>
      <label>Sort<select id="study-sort" disabled><option value="relevance">Default / relevance</option><option value="complexity-asc">Complexity: simplest first</option><option value="complexity-desc">Complexity: most complex first</option></select></label>
    </div>
    <div class="studies-browse-status">
      <p id="study-result-count" role="status" aria-live="polite">Loading studies…</p>
      <div class="studies-shape-key" aria-label="Circle: Main visuals. Rounded square: Math visuals."><span><i aria-hidden="true"></i>Main</span><span><i class="square" aria-hidden="true"></i>Math</span></div>
    </div>
    <ol class="study-grid" aria-label="SVG studies" aria-busy="true"></ol>
    <div class="studies-empty" hidden><p>No studies match these filters.</p><button class="studies-pill" id="study-reset-filters" type="button">Reset filters</button></div>
    <div class="studies-load-area"><button class="studies-pill" id="study-load-more" type="button" hidden>Load more</button><button class="studies-pill" id="study-retry" type="button" hidden>Try again</button></div>
    <footer class="studies-footer"><p>Every study includes its SVG and saved app settings.</p><a href="/Apps/algebra/">Algebra walkthrough &amp; notes</a></footer>`;
  container.append(root);
  const form = root.querySelector('.studies-browse-tools');
  if (createViewSelector) form.append(createViewSelector('studies'));
  const grid = root.querySelector('.study-grid');
  const searchInput = root.querySelector('#study-search');
  const clearSearch = root.querySelector('.studies-search-clear');
  const appFilter = root.querySelector('#study-app-filter');
  const kindFilter = root.querySelector('#study-kind-filter');
  const colorFilter = root.querySelector('#study-color-filter');
  const collectionFilter = root.querySelector('#study-collection-filter');
  const filters = [appFilter, kindFilter, colorFilter, collectionFilter];
  const sortSelect = root.querySelector('#study-sort');
  const status = root.querySelector('#study-result-count');
  const empty = root.querySelector('.studies-empty');
  const loadMore = root.querySelector('#study-load-more');
  const retry = root.querySelector('#study-retry');
  const lifetime = new AbortController();
  let destroyed = false;
  let catalogRequest;
  let records = [];
  let filtered = [];
  let search;
  let loaded = 0;
  let searchTimer;
  let visibilityFrame;
  let activeTrigger;
  const imageTasks = new Map();
  const activeImages = new Set();
  let imageQueue = [];

  const imageObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        const task = imageTasks.get(entry.target);
        if (!task || task.state === 'loading' || task.state === 'complete') continue;
        if (entry.isIntersecting) queueImage(task);
        else if (task.state === 'queued') {
          task.state = 'waiting';
          imageQueue = imageQueue.filter(candidate => candidate !== task);
        }
      }
      startImages();
    }, { rootMargin: `${IMAGE_MARGIN}px 0px` }) : null;
  const pageObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      if (!destroyed && entries.some(entry => entry.target === activeTrigger && entry.isIntersecting)) appendBatch();
    }, { rootMargin: '260px 0px' }) : null;

  function queueImage(task) {
    if (destroyed || task.state !== 'waiting' || !task.image.isConnected) return;
    task.state = 'queued';
    imageQueue.push(task);
  }

  function startImages() {
    if (destroyed) return;
    // Prioritize visible rows if scrolling outruns the thumbnail queue.
    imageQueue.sort((a, b) => Math.abs(a.image.getBoundingClientRect().top) - Math.abs(b.image.getBoundingClientRect().top));
    while (activeImages.size < MAX_IMAGE_LOADS && imageQueue.length) {
      const task = imageQueue.shift();
      if (!task.image.isConnected || task.state !== 'queued') continue;
      const box = task.image.getBoundingClientRect();
      if (box.bottom < -IMAGE_MARGIN || box.top > window.innerHeight + IMAGE_MARGIN) {
        task.state = 'waiting';
        continue;
      }
      task.state = 'loading';
      activeImages.add(task);
      imageObserver?.unobserve(task.image);
      task.frame.setAttribute('aria-busy', 'true');
      task.indicator.textContent = 'Loading preview...';
      const finish = success => {
        task.cleanup();
        if (destroyed || !imageTasks.has(task.image)) return;
        task.state = 'complete';
        activeImages.delete(task);
        task.frame.setAttribute('aria-busy', 'false');
        task.frame.classList.toggle('is-ready', success);
        task.frame.classList.toggle('has-error', !success);
        if (!success) task.indicator.textContent = 'Preview unavailable · open the app';
        startImages();
      };
      const onLoad = () => finish(true);
      const onError = () => finish(false);
      task.cleanup = () => {
        task.image.removeEventListener('load', onLoad);
        task.image.removeEventListener('error', onError);
      };
      task.image.addEventListener('load', onLoad);
      task.image.addEventListener('error', onError);
      // Visibility is already checked above. Browser-level lazy loading here can
      // stall a queue slot after a fast scroll, so defer only through our queue.
      task.image.src = task.url;
    }
  }

  function checkVisibleImages() {
    visibilityFrame = undefined;
    if (destroyed) return;
    for (const task of imageTasks.values()) {
      if (task.state !== 'waiting' && task.state !== 'queued') continue;
      const box = task.image.getBoundingClientRect();
      if (box.bottom >= -IMAGE_MARGIN && box.top <= window.innerHeight + IMAGE_MARGIN) queueImage(task);
      else if (task.state === 'queued') {
        task.state = 'waiting';
        imageQueue = imageQueue.filter(candidate => candidate !== task);
      }
    }
    startImages();
  }

  function queueVisibilityCheck() {
    if (visibilityFrame === undefined && !destroyed) visibilityFrame = requestAnimationFrame(checkVisibleImages);
  }

  function releaseImages() {
    imageObserver?.disconnect();
    imageQueue = [];
    for (const task of imageTasks.values()) {
      task.cleanup?.();
      task.image.removeAttribute('src');
    }
    imageTasks.clear();
    activeImages.clear();
    if (visibilityFrame !== undefined) cancelAnimationFrame(visibilityFrame);
    visibilityFrame = undefined;
  }

  function createCard(record, index) {
    const item = document.createElement('li');
    item.className = 'study';
    item.dataset.kind = record.kind;
    item.dataset.app = record.app;
    item.dataset.slug = record.slug;
    item.setAttribute('aria-posinset', index + 1);
    item.setAttribute('aria-setsize', filtered.length);
    const source = sourceUrl(record);
    const visual = document.createElement('a');
    visual.className = 'study-visual';
    visual.href = source;
    visual.setAttribute('aria-label', `Open ${record.title} in ${record.appName} with saved settings`);
    const image = document.createElement('img');
    image.alt = '';
    image.width = 480;
    image.height = 480;
    image.decoding = 'async';
    image.style.backgroundColor = record.background || 'transparent';
    const indicator = document.createElement('span');
    indicator.className = 'study-image-status';
    indicator.textContent = 'Image preview';
    indicator.setAttribute('aria-hidden', 'true');
    visual.append(image, indicator);
    const task = { image, frame: visual, indicator, state: 'waiting', url: assetUrl('thumbnails', record.slug, 'webp') };
    imageTasks.set(image, task);
    const heading = document.createElement('h2');
    const title = document.createElement('a');
    title.href = source;
    title.textContent = record.title;
    heading.append(title);
    const meta = document.createElement('p');
    meta.className = 'study-meta';
    meta.textContent = record.appName;
    if (record.monochrome) {
      const tag = document.createElement('span');
      tag.className = 'study-tag';
      tag.textContent = 'MONO';
      meta.append(tag);
    }
    if (Number.isFinite(record.elements) && record.elements >= 0) {
      const complexity = document.createElement('span');
      complexity.className = 'study-complexity';
      complexity.textContent = `${record.elements.toLocaleString()} SVG elements`;
      complexity.title = 'Complexity is the number of vector shapes in the saved SVG.';
      meta.append(complexity);
    }
    const actions = document.createElement('div');
    actions.className = 'study-actions';
    for (const [folder, extension, label] of [['svg', 'svg', 'SVG ↓'], ['settings', 'json', 'Settings']]) {
      const link = document.createElement('a');
      link.href = assetUrl(folder, record.slug, extension);
      link.download = `${record.slug}.${extension}`;
      link.textContent = label;
      link.setAttribute('aria-label', `Download ${folder === 'svg' ? 'SVG' : 'saved settings'}: ${record.title}`);
      actions.append(link);
    }
    if (['algebra', 'algebraCOEF'].includes(record.collection)) {
      const link = document.createElement('a');
      link.href = assetUrl('flows', record.slug, 'flow.json');
      link.download = `${record.slug}.flow.json`;
      link.textContent = 'Flow';
      link.setAttribute('aria-label', `Download reusable flow: ${record.title}`);
      actions.append(link);
    }
    item.append(visual, heading, meta, actions);
    return item;
  }

  function appendBatch() {
    if (destroyed || loaded >= filtered.length) return;
    pageObserver?.disconnect();
    grid.setAttribute('aria-busy', 'true');
    const end = Math.min(loaded + PAGE_SIZE, filtered.length);
    const fragment = document.createDocumentFragment();
    const newImages = [];
    for (let index = loaded; index < end; index++) {
      const card = createCard(filtered[index], index);
      newImages.push(card.querySelector('img'));
      fragment.append(card);
    }
    grid.append(fragment);
    loaded = end;
    grid.setAttribute('aria-busy', 'false');
    loadMore.hidden = loaded >= filtered.length;
    loadMore.textContent = `Load ${Math.min(PAGE_SIZE, filtered.length - loaded)} more`;
    status.textContent = `${loaded} of ${filtered.length} ${filtered.length === 1 ? 'study' : 'studies'}${filtered.length !== records.length ? ` · ${records.length} total` : ''}`;
    activeTrigger = loaded < filtered.length ? grid.children[Math.max(0, loaded - 3)] : null;
    if (activeTrigger) pageObserver?.observe(activeTrigger);
    if (imageObserver) newImages.forEach(image => imageObserver.observe(image));
    else queueVisibilityCheck();
  }

  function showResults() {
    clearTimeout(searchTimer);
    if (destroyed || !search) return;
    releaseImages();
    pageObserver?.disconnect();
    activeTrigger = null;
    filtered = search(searchInput.value).filter(record =>
      (appFilter.value === 'all' || record.app === appFilter.value) &&
      (kindFilter.value === 'all' || record.kind === kindFilter.value) &&
      (collectionFilter.value === 'all' || record.collection === collectionFilter.value) &&
      (colorFilter.value === 'all' || record.monochrome === (colorFilter.value === 'mono'))
    );
    filtered = sortStudies(filtered, sortSelect.value);
    loaded = 0;
    grid.replaceChildren();
    clearSearch.hidden = !searchInput.value;
    empty.hidden = filtered.length !== 0;
    loadMore.hidden = !filtered.length;
    if (filtered.length) appendBatch();
    else {
      status.textContent = 'No studies found';
      grid.setAttribute('aria-busy', 'false');
    }
  }

  function queueSearch(event) {
    if (event.isComposing) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(showResults, 100);
  }
  const listen = (node, event, callback) => node.addEventListener(event, callback, { signal: lifetime.signal });
  listen(searchInput, 'input', queueSearch);
  listen(searchInput, 'compositionend', queueSearch);
  listen(form, 'submit', event => { event.preventDefault(); showResults(); });
  filters.forEach(control => listen(control, 'change', showResults));
  listen(sortSelect, 'change', showResults);
  listen(clearSearch, 'click', () => { searchInput.value = ''; showResults(); searchInput.focus(); });
  listen(root.querySelector('#study-reset-filters'), 'click', () => {
    searchInput.value = '';
    filters.forEach(control => { control.value = 'all'; });
    sortSelect.value = 'relevance';
    showResults();
    searchInput.focus();
  });
  listen(loadMore, 'click', () => {
    const start = loaded;
    appendBatch();
    grid.children[start]?.querySelector('.study-visual').focus({ preventScroll: true });
  });
  if (!imageObserver) {
    window.addEventListener('scroll', queueVisibilityCheck, { passive: true, signal: lifetime.signal });
    listen(window, 'resize', queueVisibilityCheck);
  }

  async function loadCatalog() {
    if (destroyed || catalogRequest) return;
    catalogRequest = new AbortController();
    const request = catalogRequest;
    retry.hidden = true;
    status.textContent = 'Loading studies…';
    grid.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(new URL('./studies/catalog.json', import.meta.url), { signal: request.signal });
      if (!response.ok) throw new Error(`Study catalog returned ${response.status}`);
      const catalog = await response.json();
      if (destroyed) return;
      if (!Array.isArray(catalog) || catalog.some(record => !record ||
        !/^[a-zA-Z0-9_-]+$/.test(record.slug || '') || !/^[a-zA-Z0-9_-]+$/.test(record.app || '') ||
        typeof record.title !== 'string' || typeof record.appName !== 'string' || typeof record.visualId !== 'string')) {
        throw new Error('The study catalog has an invalid format');
      }
      records = catalog.map(record => ({
        ...record,
        collection: record.collection || 'original',
        description: [record.appName, record.app, record.concept || '', record.kind === 'math' ? 'math mathematical' : 'main simulation', record.monochrome ? 'mono monochrome single color' : 'color', ...(record.tags || [])].join(' '),
      }));
      search = createAppSearch(records);
      const apps = [...new Map(records.map(record => [record.app, record.appName]))].sort((a, b) => a[1].localeCompare(b[1]));
      appFilter.replaceChildren(new Option('All apps', 'all'), ...apps.map(([id, name]) => new Option(name, id)));
      const names = { original: 'Original', extreme: 'Extreme', algebra: 'Algebra', algebraCOEF: 'algebraCOEF' };
      const collections = [...new Set(records.map(record => record.collection))];
      collectionFilter.replaceChildren(new Option('All studies', 'all'), ...collections.map(id => new Option(`${names[id] || id} (${records.filter(record => record.collection === id).length})`, id)));
      const queryParams = new URLSearchParams(window.location.search);
      searchInput.value = (queryParams.get('search') || '').slice(0, 160);
      const requestedCollection = queryParams.get('collection');
      if (collections.includes(requestedCollection)) collectionFilter.value = requestedCollection;
      root.querySelector('.studies-total').textContent = `${records.length} studies · ${apps.length} apps`;
      searchInput.disabled = false;
      sortSelect.disabled = false;
      filters.forEach(control => { control.disabled = false; });
      showResults();
    } catch (error) {
      if (destroyed || error.name === 'AbortError') return;
      grid.setAttribute('aria-busy', 'false');
      status.textContent = 'The studies could not load. Please try again.';
      retry.hidden = false;
      console.error(error);
    } finally {
      if (catalogRequest === request) catalogRequest = undefined;
    }
  }
  listen(retry, 'click', loadCatalog);
  loadCatalog();
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      catalogRequest?.abort();
      lifetime.abort();
      clearTimeout(searchTimer);
      pageObserver?.disconnect();
      releaseImages();
      root.remove();
    },
  };
}
