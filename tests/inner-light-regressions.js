/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Serve the repository, then open /tests/inner-light-regressions.html.
// The real application runs in an isolated frame; saved settings are restored.
export async function runInnerLightRegressions() {
  const passed = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    passed.push(message);
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (condition, message, timeout = 10000) => {
    const start = performance.now();
    while (!condition()) {
      if (performance.now() - start > timeout) throw new Error(message);
      await sleep(25);
    }
  };
  const cacheKeys = ['settings', 'ui', 'persist'].map((kind) => `visualHelp.${kind}.v1:innerLight`);
  const saved = cacheKeys.map((key) => [key, localStorage.getItem(key)]);
  const frame = document.createElement('iframe');
  frame.title = 'Inner Light regression fixture';
  frame.style.width = '1080px';
  frame.style.height = '720px';
  const errors = [];
  const loadFrame = async (path = '../InnerLight/') => {
    await new Promise((resolve, reject) => {
      frame.addEventListener('load', resolve, { once: true });
      frame.addEventListener('error', reject, { once: true });
      frame.src = path;
      if (!frame.isConnected) document.body.appendChild(frame);
    });
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    win.addEventListener('error', (event) => errors.push(event.message));
    win.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
    const bridge = doc.createElement('script');
    bridge.type = 'module';
    bridge.textContent = "import { app } from './index.js'; window.__regressionApp = app;";
    doc.body.appendChild(bridge);
    await until(() => win.__regressionApp?.instance && doc.querySelector('#vis svg'), 'Inner Light did not initialize');
    return { win, doc, app: win.__regressionApp };
  };

  try {
    for (const key of cacheKeys) localStorage.removeItem(key);
    localStorage.setItem(cacheKeys[2], '0');
    const { win, doc, app } = await loadFrame();
    const ui = doc.querySelector('#config');
    const mount = doc.querySelector('#vis');
    const click = (text, root = ui, selector = 'button') => {
      const node = [...root.querySelectorAll(selector)].find((item) => item.textContent.trim() === text);
      if (!node) throw new Error(`Missing control: ${text}`);
      node.click();
      return node;
    };
    const tab = (name) => {
      if (ui.querySelector('.vr-tabs').classList.contains('hidden')) ui.querySelector('.vr-tabsToggle').click();
      return click(name, ui, '.vr-tab');
    };
    const rowFor = (label, root = ui) => [...root.querySelectorAll('.vr-row')]
      .find((row) => row.querySelector('.vr-label')?.textContent === label);
    const fieldFor = (key) => {
      const param = app.spec.params.find((item) => item.key === key);
      const row = rowFor(param?.label ?? key);
      if (!row) throw new Error(`Missing parameter: ${key}`);
      for (let node = row.parentElement; node; node = node.parentElement) {
        if (node.tagName === 'DETAILS') node.open = true;
      }
      return row.querySelector('input[type="checkbox"], input[type="number"], select, input[type="text"], input[type="color"], button');
    };
    const set = (key, value) => {
      if (key === 'shouldRender') { tab('developer'); click('Settings'); }
      else tab('params');
      const field = fieldFor(key);
      if (field.type === 'checkbox') field.checked = value;
      else field.value = String(value);
      field.dispatchEvent(new win.Event('change', { bubbles: true }));
      return field;
    };
    const source = () => mount.querySelector('svg [data-xf-source="1"]');
    const family = (kind) => [...source().querySelectorAll(`.${kind}`)];

    assert(!!doc.querySelector('#infoBar #button-info') && !!doc.querySelector('#infoBar #button-exit'), 'Shared information and exit controls are mounted');
    assert(!doc.querySelector('#innerLightNav, #info-box, #clickMeLeft, #clickMeRight, #controls'), 'Legacy navigation, configuration and floating action UI are removed');
    assert(['params', 'transforms', 'effects', 'animate', 'flows', 'developer'].every((name) => [...ui.querySelectorAll('.vr-tab')].some((node) => node.textContent === name)), 'Inner Light exposes the shared toolbar tabs');
    assert(ui.querySelector('.vr-tabs').classList.contains('hidden') && [...ui.querySelectorAll('details')].every((group) => !group.open), 'Fresh Info controls use the shared collapsed tabs and parameter groups');
    tab('params');
    assert(!ui.querySelector('.vr-tabs').classList.contains('hidden'), 'The shared toolbar toggle opens the available tabs');
    set('motionEnabled', false);
    const svg = mount.querySelector('svg');
    const originalSource = source();
    assert(!!originalSource && originalSource.children.length > 0, 'The scene is mounted inside the framework source group');

    for (const kind of ['circle', 'square', 'rect', 'prism', 'user']) {
      set(`shapes.${kind}`, true);
      assert(family(kind).length > 0, `${kind} toggle creates its own shape family`);
      set(`shapes.${kind}`, false);
      assert(family(kind).length === 0, `${kind} toggle removes its own shape family`);
    }
    set('shapes.user', true);
    set('custom.numElements', 7);
    for (const kind of ['circle', 'rect', 'polygon']) {
      set('custom.shapeType', kind);
      assert(family('user').length === 7 && family('user').every((node) => node.localName === kind), `Custom ${kind} updates element type and count without stale nodes`);
    }
    set('custom.fillColor', '#123456');
    set('custom.fillOpacity', 0.35);
    set('custom.strokeColor', '#abcdef');
    assert(family('user').every((node) => {
      const style = win.getComputedStyle(node);
      return style.fill === 'rgb(18, 52, 86)' && +style.fillOpacity === 0.35 && style.stroke === 'rgb(171, 205, 239)';
    }), 'Custom fill, opacity and stroke controls reach the rendered shapes');
    set('shapes.user', false);
    click('Update shape');
    assert(app.state.shapes.user && family('user').length === 7, 'Update shape enables and redraws the custom shape');
    assert(mount.querySelector('svg') === svg && source() === originalSource, 'Parameter changes preserve the SVG and framework source group');

    const editable = fieldFor('custom.strokeColor');
    editable.focus();
    editable.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    assert(app.state.motionEnabled === false, 'Typing Space in a setting does not toggle motion');
    editable.blur();
    doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    assert(app.state.motionEnabled === true && fieldFor('motionEnabled').checked, 'Space outside editable controls resumes motion and synchronizes its control');
    doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    assert(app.state.motionEnabled === false && !fieldFor('motionEnabled').checked, 'Space outside editable controls pauses motion and synchronizes its control');
    // Startup waves expire while paused, leaving only the actions under test.
    await sleep(350);
    set('motionEnabled', true);
    for (const [label, reverse] of [['Forward wave', false], ['Reverse wave', true]]) {
      const nodes = family('user');
      const expected = (reverse ? [...nodes].reverse() : nodes).map((node) => node.dataset.innerlightShape);
      const observed = [];
      const listeners = nodes.map((node) => {
        const listener = () => observed.push(node.dataset.innerlightShape);
        node.addEventListener('pointermove', listener);
        return [node, listener];
      });
      click(label);
      await until(() => observed.length >= expected.length, `${label} did not reach every shape`, 3000);
      for (const [node, listener] of listeners) node.removeEventListener('pointermove', listener);
      assert(JSON.stringify(observed) === JSON.stringify(expected), `${label} visits the custom shapes in the requested direction`);
      set('motionEnabled', false);
      set('motionEnabled', true);
    }
    set('motionEnabled', false);

    tab('transforms');
    click('rotate');
    assert(source().getAttribute('transform')?.includes('rotate('), 'Shared rotation transforms the Inner Light scene');
    tab('params');
    set('custom.numElements', 9);
    assert(source() === originalSource && source().getAttribute('transform')?.includes('rotate('), 'Transforms survive Inner Light parameter redraws');
    tab('transforms');
    const split = rowFor('split copies').querySelector('input[type="number"]');
    split.value = '4';
    split.dispatchEvent(new win.Event('change', { bubbles: true }));
    click('apply split');
    assert(mount.querySelector('[data-xf-layer="1"]').children.length === 4, 'Shared split creates four live copies');
    tab('params');
    set('custom.numElements', 5);
    assert(mount.querySelector('[data-xf-layer="1"]').querySelectorAll('.user').length === 20, 'Split copies refresh after custom shape changes');
    set('motionEnabled', true);
    const clone = mount.querySelector('[data-xf-layer="1"] .user');
    const cloneBounds = clone.getBoundingClientRect();
    const hit = doc.elementFromPoint(cloneBounds.x + cloneBounds.width / 2, cloneBounds.y + cloneBounds.height / 2);
    assert(!!hit?.closest('[data-xf-layer="1"]') && !!hit.dataset.innerlightShape, 'Visible split copies participate in pointer hit testing');
    const original = source().querySelector(`[data-innerlight-shape="${hit.dataset.innerlightShape}"]`);
    const beforeStroke = win.getComputedStyle(original).stroke;
    hit.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    assert(original.dataset.animating === 'true', 'Pointer movement over a visible split copy animates its original shape');
    await until(() => win.getComputedStyle(original).stroke !== beforeStroke, 'Split interaction did not color its source shape');
    assert(win.getComputedStyle(original).stroke !== beforeStroke, 'Split pointer interaction changes the original shape color');
    await until(() => {
      const updated = mount.querySelector(`[data-xf-layer="1"] [data-innerlight-shape="${hit.dataset.innerlightShape}"]`);
      return updated && win.getComputedStyle(updated).stroke !== beforeStroke;
    }, 'Split copies did not reflect their pointer interaction');
    assert(true, 'Pointer colors propagate from the source to visible split copies');
    set('motionEnabled', false);
    tab('transforms');
    click('reset');

    tab('effects');
    click('Color', ui.querySelector('.fx-panel'));
    const effects = ui.querySelector('.fx-panel');
    const preset = effects.querySelector('[aria-label="Color preset"]');
    preset.value = 'greyscale';
    preset.dispatchEvent(new win.Event('change', { bubbles: true }));
    const effectsBridge = doc.createElement('script');
    effectsBridge.type = 'module';
    effectsBridge.textContent = "import { runEffectsFromUI } from '../helper/effectsHelp.js'; window.__regressionEffect = runEffectsFromUI({ mountEl: document.querySelector('#vis'), state: window.__regressionApp.state });";
    doc.body.appendChild(effectsBridge);
    await until(() => win.__regressionEffect, 'Effects did not complete');
    assert(win.__regressionEffect.ok && family('user').every((node) => /^rgb\((\d+), \1, \1\)$/.test(node.getAttribute('fill'))), 'Shared color effects apply to Inner Light shapes');
    const autoRun = rowFor('auto run', effects).querySelector('input[type="checkbox"]');
    autoRun.checked = true;
    autoRun.dispatchEvent(new win.Event('change', { bubbles: true }));

    tab('params');
    set('shouldRender', false);
    const stoppedInstance = app.instance;
    await sleep(100);
    assert(!mount.querySelector('svg') && stoppedInstance === null && app.instance === null, 'Master render toggle destroys the scene and stops its runtime');
    set('shouldRender', true);
    await sleep(60);
    assert(!!app.instance && mount.querySelectorAll('svg').length === 1 && family('user').length === 5, 'Master render toggle creates one fresh scene with current settings');
    set('shouldRender', false);
    set('shouldRender', true);
    doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    assert(app.state.motionEnabled === true, 'Repeated runtime recreation keeps a single pause shortcut handler');
    set('motionEnabled', false);

    const checkSceneSize = (message) => {
      const bounds = mount.getBoundingClientRect();
      const viewBox = mount.querySelector('svg').viewBox.baseVal;
      assert(bounds.width > 0 && bounds.height > 0 && Math.abs(viewBox.width - bounds.width) <= 2 && Math.abs(viewBox.height - bounds.height) <= 2, message);
    };
    await sleep(80);
    checkSceneSize('The scene uses its mounted desktop dimensions');
    tab('developer');
    const settings = ui.querySelector('.vr-developerSettings');
    const pin = [...settings.querySelectorAll('button')].find((node) => /^(Unpin|Pin) UI$/.test(node.textContent));
    if (pin.textContent === 'Pin UI') pin.click();
    await sleep(100);
    assert(doc.body.classList.contains('ui-pinned') && mount.getBoundingClientRect().right <= ui.getBoundingClientRect().left + 2, 'Pinned settings reserve space beside the visualization');
    checkSceneSize('Pinning updates the scene viewBox to its available space');
    frame.style.width = '390px';
    frame.style.height = '844px';
    await sleep(150);
    assert(doc.documentElement.scrollWidth <= win.innerWidth + 1 && ui.getBoundingClientRect().right <= win.innerWidth + 1, 'The settings panel fits a narrow viewport without horizontal overflow');
    checkSceneSize('The scene responds to mobile viewport dimensions');
    assert(family('user').every((node) => /^rgb\((\d+), \1, \1\)$/.test(node.getAttribute('fill'))), 'Automatic shared effects remain applied after viewport resize');

    // A saved Developer tab must not need Params to mount before Space is usable.
    localStorage.setItem(cacheKeys[0], JSON.stringify({ motionEnabled: true }));
    localStorage.setItem(cacheKeys[1], JSON.stringify({ activeTab: 'developer', developerTab: 'settings', tabsOpen: true }));
    localStorage.setItem(cacheKeys[2], '1');
    const lazy = await loadFrame('../InnerLight/?regression=lazy-params');
    const hasMotionControl = () => !!lazy.doc.querySelector('.vr-row.innerlight-motionEnabled');
    assert(lazy.app.state.__ui.activeTab === 'developer' && !hasMotionControl(), 'Restoring Developer leaves the Params panel unmounted');
    const key = (letter, modifiers = {}) => lazy.doc.body.dispatchEvent(new lazy.win.KeyboardEvent('keydown', {
      key: letter, code: letter === ' ' ? 'Space' : `Key${letter.toUpperCase()}`, bubbles: true, ...modifiers,
    }));
    const pastCount = lazy.app.state.__history.past.length;
    key(' ');
    assert(lazy.app.state.motionEnabled === false && lazy.app.state.__history.past.length === pastCount + 1 && !hasMotionControl(), 'Space records an undoable change without mounting Params');
    key('z', { ctrlKey: true });
    assert(lazy.app.state.motionEnabled === true && !hasMotionControl(), 'Shared undo restores motion when Params has never mounted');
    key(' ');
    await until(() => JSON.parse(localStorage.getItem(cacheKeys[0]) || '{}').motionEnabled === false, 'Pause shortcut was not saved');
    assert(!hasMotionControl(), 'Saving the pause shortcut keeps Params unmounted');
    const restored = await loadFrame('../InnerLight/?regression=remembered-pause');
    assert(restored.app.state.motionEnabled === false && restored.app.state.__ui.activeTab === 'developer' && !restored.doc.querySelector('.vr-row.innerlight-motionEnabled'), 'Reload remembers paused motion and the saved Developer tab');
    assert(errors.length === 0, `No application runtime errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
    return passed;
  } finally {
    frame.remove();
    for (const [key, value] of saved) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  }
}
