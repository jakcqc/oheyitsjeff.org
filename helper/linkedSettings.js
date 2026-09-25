/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Resolve a saved-study link before the source app creates its first frame.
// Keeping this separate preserves runVisualApp's synchronous handle for presets.
let linkedSettings = null;

function showLoadError(error) {
  const mount = document.getElementById('vis') || document.body;
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'Could not load the saved study settings. ' + error.message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry loading settings';
  retry.addEventListener('click', () => window.location.reload());
  mount.replaceChildren(message, retry);
}

export async function preloadLinkedSettings(visualId) {
  const pageUrl = new URL(window.location.href);
  const source = pageUrl.searchParams.get('settings');
  if (source === null) return true;
  const mount = document.getElementById('vis');
  mount?.setAttribute('aria-busy', 'true');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Loading saved study settings...';
  mount?.append(status);
  try {
    if (!source.trim()) throw new Error('The settings link is empty.');
    const targetVisual = pageUrl.searchParams.get('settingsVisual');
    if (targetVisual && targetVisual !== visualId) throw new Error('These settings belong to a different visual app.');
    const url = new URL(source, pageUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== pageUrl.origin || url.username || url.password) {
      throw new Error('Open the gallery through this site to load its settings file.');
    }
    const response = await fetch(url, {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('The settings file could not be read (HTTP ' + response.status + ').');
    const text = (await response.text()).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(text, (key, value) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('The settings file contains an unsupported key.');
      return value;
    });
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The settings file must contain a JSON object.');
    linkedSettings = { visualId, json: JSON.stringify(parsed) };
    status.remove();
    return true;
  } catch (error) {
    linkedSettings = null;
    showLoadError(error);
    return false;
  } finally {
    mount?.removeAttribute('aria-busy');
  }
}

// Consume once: changing presets later must not reapply the original study.
export function consumeLinkedSettings(visualId) {
  if (linkedSettings?.visualId !== visualId) return null;
  const json = linkedSettings.json;
  linkedSettings = null;
  return json;
}
