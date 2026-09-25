/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import { createViewSelector } from './viewSelector.js';

const container = document.getElementById('visuals');
let viewer;
let renderVersion = 0;

function currentView() {
  return new URL(window.location.href).searchParams.get('view') === 'apps' ? 'apps' : 'studies';
}

async function renderView({ focus = false } = {}) {
  const version = ++renderVersion;
  const view = currentView();
  viewer?.destroy();
  viewer = null;
  document.body.dataset.appsView = view;
  document.title = view === 'studies' ? 'SVG studies | Apps | oheyitsjeff' : 'All apps | oheyitsjeff';
  container.setAttribute('aria-busy', 'true');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = view === 'studies' ? 'Loading SVG studies...' : 'Loading apps...';
  container.replaceChildren(status);
  try {
    const module = await import(view === 'studies' ? './studies.js' : './viewer.js');
    if (version !== renderVersion) return;
    container.replaceChildren();
    const mount = view === 'studies' ? module.mountStudiesViewer : module.mountAppsViewer;
    viewer = mount(container, {
      createViewSelector: value => createViewSelector(value, { onChange: switchView }),
    });
    if (focus) container.querySelector('.apps-view-select')?.focus({ preventScroll: true });
  } catch (error) {
    if (version !== renderVersion) return;
    status.textContent = 'This view could not load. Please try again.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => renderView({ focus }));
    container.replaceChildren(createViewSelector(view, { onChange: switchView }), status, retry);
    console.error(error);
  } finally {
    if (version === renderVersion) container.setAttribute('aria-busy', 'false');
  }
}

function switchView(view) {
  const url = new URL(window.location.href);
  if (view === 'apps') url.searchParams.set('view', 'apps');
  else url.searchParams.delete('view');
  url.hash = '';
  window.history.pushState(null, '', url);
  window.scrollTo(0, 0);
  renderView({ focus: true });
}

window.addEventListener('popstate', () => renderView());
renderView();
