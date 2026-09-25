/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Run in a browser served from the repository:
// await (await import('/tests/panel-regressions.js')).runPanelRegressions()
export async function runPanelRegressions() {
  const { mountAutoUI, registerVisual, runVisualApp } = await import('../helper/visualHelp.js');
  const { runEffectsFromUI } = await import('../helper/effectsHelp.js');
  const { applyToolFlow, setToolFlowStages } = await import('../helper/toolFlowHelp.js');
  const passed = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); passed.push(message); };
  const fixture = document.createElement('div');
  fixture.className = 'panel-test-fixture';
  fixture.innerHTML = '<div class="vr-autoUI" style="max-width:520px;height:650px"></div><div class="test-visual"></div>';
  document.body.replaceChildren(fixture);
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = '/helper/uiHelper.css'; document.head.append(stylesheet);
  const container = fixture.firstElementChild;
  const mountEl = fixture.lastElementChild;
  const markup = '<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="definition" fill="#f00"/></defs><rect width="20" height="20" fill="#ff0000"/><circle r="10" fill="#00ff00"/><path d="M0 0L5 5" fill="#0000ff"/><line x2="10" stroke="#cccccc" fill="none"/><text fill="#eeeeee">Test</text></svg>';
  const redraw = () => { mountEl.innerHTML = markup; };
  redraw();
  const state = { amount: 10, second: 20, __ui: { tabsOpen: true }, __anim: { ui: {
    targetType: 'params', paramTargets: [{ key: 'amount', from: 0, to: 100 }],
    durationSec: .3, fps: 60, autoFromCurrent: false, easing: 'linear', snapToEndOnStop: true,
  } } };
  const spec = { title: 'Panel regression fixture', params: [{ key: 'amount', type: 'number' }, { key: 'second', type: 'number' }] };
  const mount = () => mountAutoUI({ container, mountEl, spec, state, onChange: redraw });
  mount();
  const clickText = (root, text, selector = 'button') => {
    const node = [...root.querySelectorAll(selector)].find((item) => item.textContent === text);
    if (!node) throw new Error(`Missing control: ${text}`);
    node.click(); return node;
  };
  const tab = (name) => clickText(container, name, '.vr-tab');
  const input = (node, value, event = 'input') => { node.value = value; node.dispatchEvent(new Event(event, { bubbles: true })); };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const mainTabs = [...container.querySelectorAll('.vr-tab')].map((node) => node.textContent);
  assert(!mainTabs.includes('color'), 'Standalone Color tab removed');
  assert(mainTabs.at(-1) === 'developer' && !mainTabs.includes('propOps') && !mainTabs.includes('autoExport'), 'Developer is last and contains the advanced editors');
  tab('effects');
  const effects = container.querySelector('.fx-panel');
  clickText(effects, 'Color');
  const colorSelector = effects.querySelector('[aria-label="Color selector"]');
  input(colorSelector, 'rect,circle,path,line');
  const paletteSection = [...effects.querySelectorAll('details')].find((node) => node.querySelector('summary')?.textContent === 'Palette');
  paletteSection.open = false;
  tab('params'); tab('effects');
  assert(container.querySelector('.fx-panel') === effects && colorSelector.value === 'rect,circle,path,line' && !paletteSection.open, 'Effects retains DOM, selector, subtab and open sections');
  assert(state.__effects.ui.effectType === 'color', 'Effects remembers selected color subtab');
  const preset = effects.querySelector('[aria-label="Color preset"]');
  input(preset, 'greyscale', 'change');
  input(colorSelector, '*');
  let result = runEffectsFromUI({ mountEl, state });
  const fills = [...mountEl.querySelectorAll('rect,circle,path:not(defs path),text')].map((node) => node.getAttribute('fill'));
  assert(result.ok && fills.every((fill) => /^rgb\((\d+), \1, \1\)$/.test(fill)), 'Greyscale wildcard maps all visible shape/text colors');
  assert(mountEl.querySelector('#definition').getAttribute('fill') === '#f00', 'Wildcard leaves SVG definitions intact');
  redraw(); input(preset, 'blackWhite', 'change'); input(colorSelector, 'rect,circle,path,line');
  runEffectsFromUI({ mountEl, state });
  assert([...mountEl.querySelectorAll('rect,circle,path:not(defs path)')].every((node) => ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'].includes(node.getAttribute('fill'))), 'Black and white preset emits exactly two colors');
  assert(mountEl.querySelector('text').getAttribute('fill') === '#eeeeee', 'Comma-separated selectors leave other elements unchanged');
  input(colorSelector, '[');
  assert(runEffectsFromUI({ mountEl, state }).ok === false, 'Invalid color selectors fail without throwing');
  input(colorSelector, '*');
  redraw();
  mountEl.querySelector('text').setAttribute('fill', 'white');
  mountEl.querySelector('line').setAttribute('stroke', 'blue');
  runEffectsFromUI({ mountEl, state });
  assert(mountEl.querySelector('text').getAttribute('fill') === 'rgb(255, 255, 255)' && mountEl.querySelector('line').getAttribute('stroke') === 'rgb(0, 0, 0)', 'Presets map named fill and stroke colors independently');
  const originalUi = state.__effects.ui;
  setToolFlowStages(state, [{ kind: 'color', config: { selector: '*', mode: 'byLuminance', paletteText: '#000,#fff', paletteSteps: 2 } }]);
  assert(state.__toolFlows.stages[0].kind === 'effect' && state.__toolFlows.stages[0].config.effectType === 'color', 'Legacy color flows migrate to color effects');
  applyToolFlow({ mountEl, state });
  assert(state.__effects.ui === originalUi, 'Running flows preserves cached Effects settings reference');
  input(colorSelector, 'circle');
  assert(state.__effects.ui.color.selector === 'circle', 'Cached Effects inputs still edit live state after applying flows');
  const activeEffect = effects.querySelector('.vr-subTabs [aria-selected="true"]');
  activeEffect.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert(state.__effects.ui.effectType === 'paint', 'Subtabs support arrow-key navigation');

  for (const name of ['transforms', 'flows']) {
    tab(name);
    const panel = [...container.querySelector('.vr-tabBody').children].find((node) => !node.hidden);
    const draft = panel.querySelector('textarea');
    if (draft) draft.value = 'unsaved draft';
    tab('effects'); tab(name);
    assert([...container.querySelector('.vr-tabBody').children].find((node) => !node.hidden) === panel && (!draft || draft.value === 'unsaved draft'), `${name} retains its panel and drafts across tabs`);
  }
  for (const name of ['propOps', 'autoExport']) {
    tab('developer');
    const developer = container.querySelector('.vr-developerPanel');
    clickText(developer, name, '.vr-subTab');
    const panel = developer.querySelector(`[data-developer-section="${name}"]`).firstElementChild;
    const draft = panel.querySelector('textarea');
    if (draft) draft.value = 'unsaved developer draft';
    clickText(developer, 'Settings', '.vr-subTab');
    clickText(developer, name, '.vr-subTab');
    tab('effects'); tab('developer');
    assert(developer.querySelector(`[data-developer-section="${name}"]`).firstElementChild === panel && (!draft || draft.value === 'unsaved developer draft'), `${name} retains its panel and drafts across Developer and main tabs`);
  }
  tab('animate');
  const animate = container.querySelector('.anim-panel');
  clickText(animate, 'Flow');
  let compact = animate.querySelector('.anim-flow-card');
  input(compact.querySelector('[aria-label="amount start"]'), '20');
  input(compact.querySelector('[aria-label="amount end"]'), '80');
  const progress = animate.querySelector('[aria-label="Animation progress"]');
  input(progress, '.5');
  assert(state.amount === 50, 'Compact start/end values drive the scrubber');
  assert(![...animate.querySelectorAll('button')].some(button => button.textContent === 'Edit'), 'Animate has no Edit area');
  assert(animate.querySelector('.anim-flow [aria-label="Duration in seconds"]') && animate.querySelector('.anim-flow [aria-label="Frames per second"]'), 'Timing controls live in Flow');
  assert(animate.querySelectorAll('.anim-flow input[type="checkbox"]').length === 2, 'Flow exposes only Loop and Yoyo option flags');
  input(animate.querySelector('[aria-label="Add animation parameter"]'), 'second'); clickText(animate, 'Add');
  assert(state.__anim.ui.paramTargets.length === 2, 'Flow adds simultaneous animation properties');
  clickText(animate, 'JSON');
  const json = animate.querySelector('[aria-label="Animation JSON"]');
  assert(JSON.parse(json.value).paramTargets[0].to === 80, 'JSON reflects property edits');
  input(json, '{ unfinished draft'); tab('effects'); tab('animate');
  assert(animate.querySelector('[aria-label="Animation JSON"]') === json && json.value === '{ unfinished draft', 'Animation preserves JSON drafts across main tabs');
  clickText(animate, 'Apply JSON');
  assert(state.__anim.ui.paramTargets[0].to === 80, 'Invalid JSON does not mutate animation settings');
  input(json, JSON.stringify({ paramTargets: [{ key: 'amount', from: 10, to: 30 }, { key: 'second', from: 40, to: 80 }], durationSec: .3, fps: 60, autoFromCurrent: false }));
  clickText(animate, 'Apply JSON'); clickText(animate, 'Flow');
  input(progress, '.5');
  assert(state.amount === 20 && state.second === 60 && animate.querySelectorAll('.anim-flow-card').length === 2, 'Applied JSON synchronizes both views and simultaneous parameter scrubbing');
  clickText(animate, 'Resume'); await sleep(50); clickText(animate, 'Pause');
  const pausedProgress = state.__anim.ui.progress01;
  await sleep(80);
  assert(state.__anim.ui.progress01 === pausedProgress && pausedProgress >= .5, 'Pause keeps the current progress');
  const stableInput = animate.querySelector('.anim-flow-card input');
  clickText(animate, 'Resume'); await sleep(35);
  assert(state.__anim.ui.progress01 >= pausedProgress && animate.querySelector('.anim-flow-card input') === stableInput, 'Resume continues from pause without rebuilding editable controls');
  tab('effects'); await sleep(180); tab('animate');
  assert(state.amount === 30 && state.second === 80, 'Animation continues across main tabs and reaches both endpoints');
  tab('params');
  const paramField = container.querySelector('.vr-tabBody > :not([hidden]) input[type="number"]');
  assert(paramField.value === '30', 'Cached Params refreshes values changed by animation');
  tab('animate'); clickText(animate, 'JSON');
  input(json, JSON.stringify({ targetType: 'svg', selector: 'rect,circle', svgKind: 'attr', svgName: 'opacity', from: .2, to: .8 }));
  clickText(animate, 'Apply JSON');
  clickText(animate, 'Flow'); input(progress, '.5');
  assert([...mountEl.querySelectorAll('rect,circle')].every((node) => Math.abs(+node.getAttribute('opacity') - .5) < .001), 'SVG start/end scrubbing survives visual rerenders');
  clickText(animate, 'Resume'); await sleep(40); clickText(animate, 'Stop');
  const stoppedOpacity = +mountEl.querySelector('rect').getAttribute('opacity');
  await sleep(60);
  assert(stoppedOpacity > .5 && stoppedOpacity < .8 && +mountEl.querySelector('rect').getAttribute('opacity') === stoppedOpacity, 'Stop holds the current SVG values');
  mount(); tab('animate');
  assert(container.querySelector('.anim-flow').hidden === false, 'Animation view survives a full UI rebuild');
  const finished = container.querySelector('.anim-panel');
  clickText(finished, 'JSON');
  assert(JSON.parse(finished.querySelector('textarea').value).targetType === 'svg', 'Rebuilt animation editor retains settings');
  const width = fixture.style.width;
  fixture.style.width = '320px';
  clickText(finished, 'Flow');
  await sleep(20);
  assert(finished.scrollWidth <= finished.clientWidth + 1, 'Compact animation fits a narrow panel');
  fixture.style.width = width;

  state.__ui.activeTab = 'propOps';
  mount();
  assert(state.__ui.activeTab === 'developer' && state.__ui.developerTab === 'propOps' && !container.querySelector('[data-developer-section="propOps"]').hidden, 'Saved propOps tabs migrate into Developer');
  container._destroyTabs?.();

  const settingsFixture = document.createElement('div');
  settingsFixture.innerHTML = '<div id="infoBar">Navigation</div><div id="config" class="open"><div class="test-ui"></div></div><div class="test-visual"></div>';
  fixture.appendChild(settingsFixture);
  const settingsUi = settingsFixture.querySelector('.test-ui');
  const settingsMount = settingsFixture.querySelector('.test-visual');
  const visualId = `toolbarRegression-${Date.now()}`;
  registerVisual(visualId, {
    title: 'Toolbar regression fixture',
    params: [{ key: 'amount', type: 'number', default: 10, category: 'General' }],
    create({ mountEl }, state) {
      const render = () => { mountEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="${state.amount}" height="10"/></svg>`; };
      render();
      return { render };
    },
  });
  let app = runVisualApp({ visualId, mountEl: settingsMount, uiEl: settingsUi, state: { __ui: { tabsOpen: true } } });
  const settingsTab = (name) => clickText(settingsUi, name, '.vr-tab');
  const checkedFlag = (label) => [...settingsUi.querySelectorAll('label')].find(node => node.textContent === label)?.querySelector('input');
  const footer = settingsUi.querySelector('.vr-settingsWrap');
  assert([...footer.querySelectorAll('button')].map(button => button.textContent).join(',') === 'Save,Load' && !footer.querySelector('label'), 'Footer contains only Save and Load SVG buttons');
  assert(footer.getBoundingClientRect().height <= 30, 'Save/Load footer uses a single compact row');
  assert([...settingsUi.querySelectorAll('.vr-paramGroup')].every(group => !group.open), 'Parameter categories start collapsed');
  settingsTab('developer');
  assert(checkedFlag('Start categories collapsed')?.checked && checkedFlag('Remember settings for this visual')?.checked, 'Developer settings default to collapsed categories and remembered settings');
  assert(['Save Settings', 'Load Settings', 'Reset Defaults', 'Load Settings from SVG', 'Unpin UI', 'Hide Nav'].every(text => [...settingsUi.querySelectorAll('.vr-developerSettings button')].some(button => button.textContent === text)), 'Developer groups settings import/export and layout controls');
  clickText(settingsUi.querySelector('.vr-developerSettings'), 'Hide Nav');
  assert(document.getElementById('infoBar').classList.contains('hidden'), 'Developer Hide Nav still controls the navigation');
  clickText(settingsUi.querySelector('.vr-developerSettings'), 'Show Nav');
  settingsTab('params');
  input(settingsUi.querySelector('input[type="number"]'), '42', 'change');
  await sleep(300);
  app = app.setVisual(visualId);
  assert(app.state.amount === 42, 'Settings are remembered automatically without enabling a flag');
  settingsTab('developer');
  const remember = checkedFlag('Remember settings for this visual');
  remember.checked = false;
  remember.dispatchEvent(new Event('change', { bubbles: true }));
  app = app.setVisual(visualId);
  settingsTab('developer');
  assert(app.state.amount === 10 && checkedFlag('Remember settings for this visual')?.checked === false, 'Explicitly disabling remembered settings survives a reload and ignores cached values');
  for (const prefix of ['visualHelp.settings.v1:', 'visualHelp.ui.v1:', 'visualHelp.persist.v1:']) localStorage.removeItem(prefix + visualId);
  return passed;
}
