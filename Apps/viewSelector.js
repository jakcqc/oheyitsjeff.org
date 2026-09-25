/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Both Apps views share this route selector beside their search field.
export function createViewSelector(value, { onChange } = {}) {
  const label = document.createElement('label');
  label.className = 'apps-view-control';
  const caption = document.createElement('span');
  caption.className = 'apps-view-caption';
  caption.textContent = 'Browse';
  const select = document.createElement('select');
  select.className = 'apps-view-select';
  select.setAttribute('aria-label', 'Apps view');
  for (const [key, title] of [['studies', 'SVG studies'], ['apps', 'All apps']]) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = title;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => {
    if (onChange) onChange(select.value);
    else window.location.assign(select.value === 'apps' ? '/Apps/?view=apps' : '/Apps/');
  });
  label.append(caption, select);
  return label;
}
