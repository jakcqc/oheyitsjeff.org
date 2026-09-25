/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

let runNumber = 0;

// Serve conditional-controls.html or import this function in a browser.
export async function runConditionalControlRegressions() {
  const { buildControl, mountAutoUI, registerTab, syncControlVisibility, VISUALS, exportVisualUIJsonSpec, registerVisual, runVisualApp } = await import('../helper/visualHelp.js');
  const passed = [], fixtures = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    passed.push(message);
  };
  const change = (field, value) => {
    if (field.type === 'checkbox') field.checked = value;
    else field.value = String(value);
    field.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const createFixture = () => {
    const container = document.createElement('div');
    container.className = 'vr-autoUI conditional-test-fixture';
    container.style.cssText = 'width:700px;height:600px;';
    document.body.append(container);
    fixtures.push(container);
    return container;
  };
  const makeControl = (container, state, param, onChange) => {
    const row = buildControl({ param, state, onChange });
    container.append(row);
    return row;
  };
  const selectorParam = { key: 'method', label: 'Method', type: 'select', options: ['pixels', 'voronoi', 'triangles'] };
  const tab = (container, name) => {
    const node = [...container.querySelectorAll('.vr-tab')].find(item => item.dataset.tab === name);
    if (!node) throw new Error(`Missing test tab: ${name}`);
    node.click();
  };

  try {
    const standalone = createFixture();
    const state = { method: 'pixels', colorMode: 'rgb', growth: { equation: 'logistic' }, count: 12,
      relax: 3, shape: 'circle', note: 'saved text', enabled: true, offset: { x: 2, y: 3 },
      light: { x: 1, y: 2, z: 3 } };
    const method = makeControl(standalone, state, selectorParam).querySelector('select');
    const mode = makeControl(standalone, state, { key: 'colorMode', type: 'select', options: ['rgb', 'greyscale', 'duotone'] }).querySelector('select');
    const growth = makeControl(standalone, state, { key: 'growth.equation', type: 'select', options: ['logistic', 'monod'] }).querySelector('select');
    const shared = makeControl(standalone, state, { key: 'count', type: 'number', min: 1, max: 100 });
    const dependentParams = [
      { key: 'relax', type: 'number', min: 0, max: 10 },
      { key: 'enabled', type: 'boolean' },
      { key: 'shape', type: 'select', options: ['circle', 'square'] },
      { key: 'note', type: 'text' },
      { key: 'offset', type: 'vector2D', min: 0, max: 10 },
      { key: 'light', type: 'vector3D', min: 0, max: 10 },
      { key: 'reset', type: 'button', label: 'Reset points' },
    ];
    const dependent = dependentParams.map(param => makeControl(standalone, state, {
      ...param, shouldShowWhen: { method: 'voronoi' },
    }));
    const intersect = makeControl(standalone, state, { key: 'palette', type: 'text', shouldShowWhen: {
      method: ['voronoi', 'triangles'], colorMode: ['rgb', 'duotone'],
    } });
    const nested = makeControl(standalone, state, { key: 'halfSaturation', type: 'number', shouldShowWhen: { 'growth.equation': 'monod' } });
    const invalid = makeControl(standalone, state, { key: 'invalid', type: 'text', shouldShowWhen: 'method=voronoi' });
    const missing = makeControl(standalone, state, { key: 'missing', type: 'text', shouldShowWhen: { unknownSelector: 'yes' } });
    const originalRows = [...standalone.children];
    assert(!shared.hidden, 'Controls without a condition retain their original visibility');
    assert(dependent.every(row => row.hidden), 'Every control type is initially hidden for a nonmatching selector');
    assert(intersect.hidden && nested.hidden && invalid.hidden && missing.hidden, 'Intersection, nested, malformed, and missing-selector conditions apply on initial render');

    change(method, 'voronoi');
    assert(state.method === 'voronoi' && dependent.every(row => !row.hidden), 'Standalone selector changes reveal every dependent control type without an onChange callback');
    assert(!intersect.hidden && nested.hidden, 'Showing one algorithm respects other selector constraints');
    assert(originalRows.every((row, index) => standalone.children[index] === row), 'Changing visibility retains every original control and DOM position');
    change(mode, 'greyscale');
    assert(intersect.hidden && dependent.every(row => !row.hidden), 'Each selector in a condition must match');
    change(mode, 'duotone');
    assert(!intersect.hidden, 'Alternative allowed selector values reveal the same control');
    change(growth, 'monod');
    assert(!nested.hidden && state.growth.equation === 'monod', 'A dotted selector path updates both nested state and visibility');

    const draft = dependent[3].querySelector('input');
    draft.value = 'uncommitted filter draft';
    const savedValues = JSON.stringify({ relax: state.relax, enabled: state.enabled, shape: state.shape,
      note: state.note, offset: state.offset, light: state.light });
    change(method, 'triangles');
    assert(dependent.every(row => row.hidden) && !intersect.hidden, 'Switching algorithms hides only their own controls');
    assert(draft.value === 'uncommitted filter draft' && JSON.stringify({ relax: state.relax,
      enabled: state.enabled, shape: state.shape, note: state.note, offset: state.offset, light: state.light }) === savedValues,
    'Hiding controls preserves parameter values and an uncommitted text draft');
    change(method, 'voronoi');
    assert(draft === dependent[3].querySelector('input') && draft.value === 'uncommitted filter draft', 'Revealing controls retains the same draft input');

    const focused = dependent[1].querySelector('input');
    focused.focus();
    assert(document.activeElement === focused, 'A visible conditional input can receive keyboard focus');
    change(method, 'pixels');
    assert(dependent[1].hidden && document.activeElement !== focused, 'A newly hidden conditional input releases keyboard focus');
    state.method = 'voronoi';
    dependent.forEach(row => row._sync());
    assert(dependent.every(row => !row.hidden), 'Explicit row sync applies programmatic selector updates');
    state.method = 'pixels';
    syncControlVisibility(standalone, state);
    assert(dependent.every(row => row.hidden) && intersect.hidden, 'The public visibility sync refreshes standalone programmatic edits');
    assert(draft.value === 'uncommitted filter draft', 'Visibility-only synchronization preserves uncommitted input contents');

    const separate = createFixture();
    const otherState = { method: 'voronoi', relax: 9 };
    const otherRow = makeControl(separate, otherState, { key: 'relax', type: 'number', shouldShowWhen: { method: 'voronoi' } });
    change(method, 'triangles');
    assert(!otherRow.hidden && otherState.method === 'voronoi', 'Selector changes do not affect another visual state');

    const mounted = createFixture();
    const mountEl = document.createElement('div');
    mountEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
    mounted.after(mountEl); fixtures.push(mountEl);
    const mountedState = { method: 'pixels', relax: 4, count: 25,
      __ui: { activeTab: 'params', tabsOpen: true, collapseParamsByDefault: false } };
    const spec = { title: 'Conditional controls', params: [selectorParam,
      { key: 'count', type: 'number', cssClass: 'test-shared', category: 'Conversion' },
      { key: 'relax', type: 'number', cssClass: 'test-relax', category: 'Voronoi', shouldShowWhen: { method: 'voronoi' } },
    ] };
    const otherTab = `conditional-test-${++runNumber}`;
    registerTab(otherTab, ({ state: liveState }) => {
      const panel = document.createElement('div');
      panel.append(buildControl({ param: { ...selectorParam, label: 'Method in another tab' }, state: liveState }));
      return panel;
    });
    mountAutoUI({ container: mounted, mountEl, state: mountedState, spec });
    const mountedMethod = mounted.querySelector('select[aria-label="Method"]');
    const mountedRow = mounted.querySelector('.vr-row.test-relax');
    const algorithmGroup = mountedRow.closest('.vr-paramGroup');
    const commonGroup = mounted.querySelector('.vr-row.test-shared').closest('.vr-paramGroup');
    assert(mountedRow.hidden && !mounted.querySelector('.vr-row.test-shared').hidden, 'The shared auto UI applies initial visibility while keeping common parameters');
    assert(algorithmGroup.hidden && !commonGroup.hidden, 'A parameter category hides only when all its controls are hidden');
    change(mountedMethod, 'voronoi');
    assert(!mountedRow.hidden && mounted.querySelector('.vr-row.test-relax') === mountedRow, 'The shared auto UI updates visibility without rebuilding controls or requiring a render callback');
    assert(!algorithmGroup.hidden && algorithmGroup.open, 'An algorithm category reappears with its existing expansion state');
    const numberField = mountedRow.querySelector('input[type="number"]');
    change(numberField, 7);
    change(mountedMethod, 'pixels');
    change(mountedMethod, 'voronoi');
    assert(mountedState.relax === 7 && numberField.value === '7', 'Algorithm-specific values survive changing away from and back to their algorithm');
    algorithmGroup.open = false;
    change(mountedMethod, 'pixels');
    change(mountedMethod, 'voronoi');
    assert(!algorithmGroup.hidden && !algorithmGroup.open, 'Changing algorithms preserves a collapsed category');
    algorithmGroup.open = true;
    tab(mounted, otherTab);
    const elsewhere = mounted.querySelector('select[aria-label="Method in another tab"]');
    change(elsewhere, 'pixels');
    tab(mounted, 'params');
    assert(mounted.querySelector('.vr-row.test-relax') === mountedRow && mountedRow.hidden, 'Cached Params controls refresh when a selector changes in another tab');
    mountedState.method = 'voronoi';
    tab(mounted, otherTab); tab(mounted, 'params');
    assert(!mountedRow.hidden && mountedMethod.value === 'voronoi', 'Returning to a cached Params tab synchronizes programmatic state and conditional visibility');

    let changes = 0;
    const callbackFixture = createFixture();
    const callbackState = { method: 'pixels', relax: 2, __ui: { tabsOpen: true, collapseParamsByDefault: false } };
    mountAutoUI({ container: callbackFixture, mountEl, state: callbackState, spec, onChange: () => { changes++; } });
    change(callbackFixture.querySelector('select[aria-label="Method"]'), 'voronoi');
    assert(changes === 1 && !callbackFixture.querySelector('.vr-row.test-relax').hidden, 'Conditional refresh retains the existing one-callback-per-parameter-change behavior');
    assert(!Object.keys(callbackState).some(key => /visibility|conditional/i.test(key)), 'Visibility metadata does not add serialized visual parameters');
    VISUALS[otherTab] = spec;
    try {
      const exported = exportVisualUIJsonSpec(otherTab);
      assert(JSON.stringify(exported.params.find(param => param.key === 'relax').shouldShowWhen) === JSON.stringify({ method: 'voronoi' }),
        'Exported UI specifications retain selector-based visibility metadata');
    } finally { delete VISUALS[otherTab]; }

    const applicationUi = createFixture();
    const applicationMount = document.createElement('div');
    applicationUi.after(applicationMount); fixtures.push(applicationMount);
    const visualId = `conditional-application-${Date.now()}-${runNumber}`;
    localStorage.setItem(`visualHelp.persist.v1:${visualId}`, 'false');
    let app;
    try {
      registerVisual(visualId, { ...spec,
        params: spec.params.map(param => ({ ...param, default: param.key === 'method' ? 'pixels' : 4 })),
        create({ mountEl: target }, liveState) {
          const render = () => {
            target.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="${liveState.count}" height="10"/></svg>`;
          };
          render();
          return { render };
        },
      });
      app = runVisualApp({ visualId, mountEl: applicationMount, uiEl: applicationUi,
        state: { __ui: { tabsOpen: true, collapseParamsByDefault: false } } });
      const appRow = () => applicationUi.querySelector('.vr-row.test-relax');
      const firstAppRow = appRow();
      assert(firstAppRow.hidden && app.state.method === 'pixels', 'A running visual starts with conditional parameters hidden for its default algorithm');
      app.setParam('method', 'voronoi');
      assert(app.state.method === 'voronoi' && !appRow().hidden && appRow() === firstAppRow,
        'The running visual setParam path refreshes conditional visibility without recreating controls');
      app.setParam('relax', 9);
      change(applicationUi.querySelector('select[aria-label="Method"]'), 'pixels');
      assert(appRow().hidden && app.state.relax === 9, 'A running visual selector change hides algorithm controls while retaining their settings');
      document.activeElement?.blur?.();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      assert(app.state.method === 'voronoi' && !appRow().hidden && appRow().querySelector('input[type="number"]').value === '9',
        'Undo restores the previous algorithm, its conditional controls, and its parameter values');
    } finally {
      if (app) app.setParam('shouldRender', false);
      applicationUi.querySelector('.vr-autoUI')?._destroyTabs?.();
      delete VISUALS[visualId];
      for (const prefix of ['visualHelp.settings.v1:', 'visualHelp.ui.v1:', 'visualHelp.persist.v1:']) localStorage.removeItem(prefix + visualId);
    }
    return passed;
  } finally {
    for (const fixture of fixtures) {
      fixture._destroyTabs?.();
      fixture.remove();
    }
  }
}
