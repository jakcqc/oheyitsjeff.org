/*
 * Copyright (c) 2026 Reside Here LLC. All rights reserved.
 * No AI training, fine-tuning, or inclusion in AI/ML training datasets without prior written permission.
 * See LICENSE.txt for terms. Third-party materials retain their own licenses.
 */
(() => {
  'use strict';

  const storageKey = 'residehere-accessibility-v1';
  const mobileLayout = window.matchMedia('(max-width: 900px)');
  const defaults = Object.freeze({
    textSize: '100',
    contrast: 'default',
    reduceMotion: false,
    underlineLinks: false,
    fontFamily: 'auto',
    lineHeight: 'default',
    heavierText: false,
    textSpacing: false,
    controlLabels: false,
  });
  const textSizes = new Set(['100', '125', '150', '175', '200']);
  const contrastOptions = new Set(['default', 'light', 'dark']);
  const fontFamilies = new Set(['auto', 'default', 'atkinson', 'system']);
  const lineHeights = new Set(['default', 'relaxed', 'roomy']);
  const booleanPreferences = [
    'reduceMotion',
    'underlineLinks',
    'heavierText',
    'textSpacing',
    'controlLabels',
  ];

  function validatePreferences(value) {
    const validated = { ...defaults };
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return validated;
    }

    if (textSizes.has(value.textSize)) validated.textSize = value.textSize;
    if (contrastOptions.has(value.contrast)) validated.contrast = value.contrast;
    if (fontFamilies.has(value.fontFamily)) {
      validated.fontFamily = value.fontFamily;
    } else if (value.readingFont === true) {
      // Preserve the simple-font choice saved by earlier versions of the panel.
      validated.fontFamily = 'system';
    }
    if (lineHeights.has(value.lineHeight)) validated.lineHeight = value.lineHeight;
    for (const key of booleanPreferences) {
      if (typeof value[key] === 'boolean') validated[key] = value[key];
    }
    return validated;
  }

  function parsePreferences(serialized) {
    try {
      return validatePreferences(JSON.parse(serialized));
    } catch {
      return { ...defaults };
    }
  }

  let preferences = { ...defaults };
  try {
    preferences = parsePreferences(window.localStorage.getItem(storageKey));
  } catch {
    // Storage can be unavailable; the settings still work for this page.
  }

  function applyPreferences() {
    const root = document.documentElement;
    root.dataset.textSize = preferences.textSize;
    root.dataset.contrast = preferences.contrast;
    root.dataset.reduceMotion = String(preferences.reduceMotion);
    root.dataset.underlineLinks = String(preferences.underlineLinks);
    root.dataset.fontFamily = preferences.fontFamily === 'auto'
      ? (mobileLayout.matches ? 'system' : 'default')
      : preferences.fontFamily;
    root.dataset.lineHeight = preferences.lineHeight;
    root.dataset.heavierText = String(preferences.heavierText);
    root.dataset.textSpacing = String(preferences.textSpacing);
    root.dataset.controlLabels = String(preferences.controlLabels);
    root.dataset.accessibilityEnabled = String(
      Object.entries(defaults).some(([key, value]) => preferences[key] !== value),
    );
    root.style.setProperty('--text-size', `${preferences.textSize}%`);
    root.style.setProperty('--text-scale', String(Number(preferences.textSize) / 100));
  }

  // This script runs in the head so stored preferences apply before first paint.
  applyPreferences();
  mobileLayout.addEventListener('change', () => {
    applyPreferences();
    syncControls();
  });

  let controls;
  let status;

  function syncControls() {
    if (!controls) return;
    controls.textSize.value = preferences.textSize;
    controls.contrast.value = preferences.contrast;
    controls.fontFamily.value = preferences.fontFamily;
    controls.lineHeight.value = preferences.lineHeight;
    for (const key of booleanPreferences) {
      controls[key].checked = preferences[key];
    }
  }

  function savePreferences(reset = false) {
    try {
      if (reset) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, JSON.stringify(preferences));
      }
      status.textContent = reset
        ? 'Preferences reset. Your device’s reduced-motion preference is still respected.'
        : 'Preferences saved on this browser.';
    } catch {
      status.textContent = 'Preferences apply to this page; this browser is not saving them.';
    }
  }

  function buildSettingsDialog() {
    const dialog = document.createElement('dialog');
    dialog.id = 'accessibility-dialog';
    dialog.className = 'a11y-dialog';
    dialog.setAttribute('aria-labelledby', 'a11y-title');
    dialog.setAttribute('aria-describedby', 'a11y-description');
    dialog.innerHTML = `
      <div class="a11y-panel">
        <header class="a11y-header">
          <h2 id="a11y-title" tabindex="-1">Accessibility settings</h2>
          <button class="a11y-close" id="a11y-close" type="button" aria-label="Close accessibility settings">Close <span aria-hidden="true">×</span></button>
        </header>
        <p class="a11y-description" id="a11y-description">Choose what makes this site easier to use. Screen-reader and keyboard support are always on.</p>
        <label class="a11y-field" for="a11y-text-size">
          <span>Text size</span>
          <select id="a11y-text-size" aria-describedby="text-size-help">
            <option value="100">100%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
            <option value="175">175%</option>
            <option value="200">200%</option>
          </select>
        </label>
        <p class="a11y-description" id="text-size-help">100% is the default; 200% doubles text size.</p>
        <label class="a11y-field" for="a11y-contrast">
          <span>Color contrast</span>
          <select id="a11y-contrast" aria-describedby="contrast-help">
            <option value="default">Original</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <p class="a11y-description" id="contrast-help">Light and dark use high contrast without relying on color.</p>
        <label class="a11y-check" for="a11y-reduce-motion"><input type="checkbox" id="a11y-reduce-motion"><span>Reduce motion</span></label>
        <label class="a11y-check" for="a11y-underline-links"><input type="checkbox" id="a11y-underline-links"><span>Underline links</span></label>
        <label class="a11y-check" for="a11y-heavier-text"><input type="checkbox" id="a11y-heavier-text"><span>Use heavier text</span></label>
        <label class="a11y-check" for="a11y-text-spacing"><input type="checkbox" id="a11y-text-spacing"><span>Increase text spacing</span></label>
        <label class="a11y-check" for="a11y-control-labels"><input type="checkbox" id="a11y-control-labels"><span>Show slideshow button labels</span></label>
        <p class="a11y-description">Your device’s reduced-motion preference is always respected.</p>
        <div class="a11y-actions">
          <button class="a11y-reset" id="a11y-reset" type="button">Reset to defaults</button>
          <p class="a11y-status" id="a11y-status" role="status" aria-live="polite" aria-atomic="true"></p>
        </div>
        <label class="a11y-field" for="a11y-font-family">
          <span>Reading font</span>
          <select id="a11y-font-family" aria-describedby="font-family-help">
            <option value="auto">Automatic</option>
            <option value="default">Site fonts</option>
            <option value="atkinson">Atkinson</option>
            <option value="system">System sans</option>
          </select>
        </label>
        <p class="a11y-description" id="font-family-help">Automatic uses the system font on your device on mobile and Fraunces + Nunito Sans on larger screens. Choose a different font here to override it.</p>
        <label class="a11y-field" for="a11y-line-height">
          <span>Reading line spacing</span>
          <select id="a11y-line-height" aria-describedby="line-height-help">
            <option value="default">Site default</option>
            <option value="relaxed">Relaxed (1.8)</option>
            <option value="roomy">Roomy (2.0)</option>
          </select>
        </label>
        <p class="a11y-description" id="line-height-help">Adjust the space between lines in paragraphs and lists.</p>
      </div>
    `;
    document.body.append(dialog);

    controls = {
      textSize: dialog.querySelector('#a11y-text-size'),
      contrast: dialog.querySelector('#a11y-contrast'),
      reduceMotion: dialog.querySelector('#a11y-reduce-motion'),
      underlineLinks: dialog.querySelector('#a11y-underline-links'),
      fontFamily: dialog.querySelector('#a11y-font-family'),
      lineHeight: dialog.querySelector('#a11y-line-height'),
      heavierText: dialog.querySelector('#a11y-heavier-text'),
      textSpacing: dialog.querySelector('#a11y-text-spacing'),
      controlLabels: dialog.querySelector('#a11y-control-labels'),
    };
    status = dialog.querySelector('#a11y-status');
    const closeButton = dialog.querySelector('#a11y-close');
    let launcher = null;
    syncControls();

    for (const [key, control] of Object.entries(controls)) {
      control.addEventListener('change', () => {
        const value = control.type === 'checkbox' ? control.checked : control.value;
        preferences = validatePreferences({ ...preferences, [key]: value });
        applyPreferences();
        syncControls();
        savePreferences();
      });
    }

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const trigger = event.target.closest('[data-accessibility-open]');
      if (!trigger || dialog.open) return;
      event.preventDefault();
      launcher = trigger;
      syncControls();
      status.textContent = '';
      dialog.showModal();
      closeButton.focus({ preventScroll: true });
    });

    closeButton.addEventListener('click', () => dialog.close());

    // Keep Tab within the panel even when a browser would otherwise focus its chrome.
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;

      const tabbables = [
        ...dialog.querySelectorAll(
          'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]',
        ),
      ].filter((element) => {
        if (element.tabIndex < 0 || element.matches(':disabled')) return false;
        if (element.closest('[hidden], [inert]') || !element.getClientRects().length) {
          return false;
        }
        const visibility = window.getComputedStyle(element).visibility;
        return visibility !== 'hidden' && visibility !== 'collapse';
      });

      if (!tabbables.length) {
        event.preventDefault();
        dialog.querySelector('#a11y-title').focus();
        return;
      }

      const activeIndex = tabbables.indexOf(document.activeElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        tabbables[tabbables.length - 1].focus();
      } else if (!event.shiftKey && (activeIndex === -1 || activeIndex === tabbables.length - 1)) {
        event.preventDefault();
        tabbables[0].focus();
      }
    });

    // Native dialog still handles Escape and makes the underlying page inert.
    dialog.addEventListener('close', () => {
      if (launcher?.isConnected) launcher.focus();
      launcher = null;
    });

    dialog.querySelector('#a11y-reset').addEventListener('click', () => {
      preferences = { ...defaults };
      applyPreferences();
      syncControls();
      savePreferences(true);
    });

    document.querySelectorAll('[data-accessibility-open]').forEach((trigger) => {
      trigger.setAttribute('aria-controls', dialog.id);
      trigger.hidden = false;
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    preferences = parsePreferences(event.newValue);
    applyPreferences();
    syncControls();
    // Sync other tabs without repeating a live announcement on every update.
    if (status) status.textContent = '';
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildSettingsDialog, { once: true });
  } else {
    buildSettingsDialog();
  }
})();
