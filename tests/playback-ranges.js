/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
export async function runPlaybackRangeRegressions() {
  const { registerVisual, runVisualApp, exportStateToJSON, importStateFromJSON, makeDefaultState } = await import('../helper/visualHelp.js');
  const { controlAnimation } = await import('../helper/animationHelp.js');
  const passed = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); passed.push(message); };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fixture = document.createElement('div');
  fixture.innerHTML = '<div id="config" class="open"><div id="test-ui"></div></div><div id="test-mount"></div>';
  document.body.append(fixture);
  const uiEl = fixture.querySelector('#test-ui');
  const mountEl = fixture.querySelector('#test-mount');
  const id = `playbackRanges-${Date.now()}`;
  registerVisual(id, {
    title: 'Playback and ranges',
    simulation: { param: 'running' },
    params: [
      { key: 'amount', type: 'number', default: 5, min: 0, max: 10 },
      { key: 'position', type: 'vector3D', default: { x: 1, y: 2, z: 3 }, min: -10, max: 10 },
      { key: 'uv', type: 'vector2D', default: { x: 0, y: 0 }, min: { x: -1, y: -2 }, max: { x: 1, y: 2 } },
      { key: 'free', type: 'number', default: 3 },
      { key: 'running', type: 'boolean', default: true },
    ],
    create({ mountEl }, state) {
      const render = () => { mountEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="${state.amount}" height="10"/></svg>`; };
      render(); return { render };
    },
  });
  let app = runVisualApp({ visualId: id, mountEl, uiEl, state: { __ui: { tabsOpen: true } } });
  const click = (text, selector = 'button') => {
    const node = [...uiEl.querySelectorAll(selector)].find(node => node.textContent === text);
    if (!node) throw new Error(`Missing button: ${text}`);
    node.click(); return node;
  };
  const tab = name => click(name, '.vr-tab');
  const field = label => uiEl.querySelector(`[aria-label="${label}"]`);
  const type = (label, value, event = 'change') => {
    const node = field(label); node.value = value;
    node.dispatchEvent(new Event(event, { bubbles: true }));
  };
  const flag = (label, checked) => { const node = field(label); node.checked = checked; node.dispatchEvent(new Event('change', { bubbles: true })); };
  const range = label => [Number(field(`${label} slider`).min), Number(field(`${label} slider`).max)];
  const key = (value, target = document.body, extra = {}) => {
    const event = new KeyboardEvent('keydown', { key: value, code: value === ' ' ? 'Space' : `Key${value.toUpperCase()}`, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(event); return event;
  };
  try {
    assert(!field('shouldRender') && !field('overrideMinMax'), 'System flags are absent from Params');
    tab('developer');
    assert(field('shouldRender').checked && field('overrideMinMax').checked && app.state.overrideMinMax, 'Developer has shouldRender and default-enabled overrideMinMax');
    tab('params');
    type('amount', '-20'); type('amount', '45'); type('amount', '8');
    assert(range('amount').join() === '-20,45' && app.state.amount === 8, 'Typed scalar extrema expand both ends and later values do not shrink the slider');
    assert(app.spec.params[0].min === 0 && app.spec.params[0].max === 10, 'Learned bounds do not mutate the shared parameter schema');
    type('amount slider', '25', 'input');
    assert(app.state.amount === 25 && app.state.__paramRanges.amount.min === -20 && app.state.__paramRanges.amount.max === 45, 'Slider uses the expanded range without changing typed extrema');
    type('amount', '');
    assert(app.state.amount === 25 && field('amount').value === '25', 'Empty numeric edits restore the current value');
    type('position x', '-40'); type('position z', '60');
    assert(app.state.position.x === -40 && app.state.position.y === 2 && app.state.position.z === 60, 'Typed vector edits preserve all other coordinates');
    assert(range('position x').join() === '-40,10' && range('position y').join() === '-10,10' && range('position z').join() === '-10,60', 'Vector axes learn independent slider bounds');
    type('uv y', '9');
    assert(range('uv x').join() === '-1,1' && range('uv y').join() === '-2,9', '2D vectors support per-axis declared bounds and overrides');
    type('free', '2'); type('free', '9');
    assert(!field('free slider').hidden && range('free').join() === '2,9', 'Unbounded numbers gain a slider after two distinct typed values');
    const serialized = exportStateToJSON(app.state);
    const imported = makeDefaultState(app.spec);
    importStateFromJSON(serialized, imported, app.spec);
    assert(imported.overrideMinMax && imported.__paramRanges['position.z'].max === 60 && imported.position.z === 60, 'Save/Load Settings round-trips range overrides and vector values');
    importStateFromJSON('{"__paramRanges":{}}', imported, app.spec);
    assert(!Object.keys(imported.__paramRanges).length, 'Loading an empty saved range map clears obsolete overrides');
    tab('developer'); flag('overrideMinMax', false); tab('params');
    assert(range('amount').join() === '0,10' && range('position x').join() === '-10,10', 'Disabling overrideMinMax restores declared slider limits');
    type('amount', '700'); type('position x', '-200');
    assert(app.state.amount === 10 && app.state.position.x === -10 && app.state.__paramRanges.amount.max === 45, 'With overrides disabled, typing respects declared limits and preserves saved ranges');
    tab('developer'); flag('overrideMinMax', true); tab('params');
    assert(range('amount').join() === '-20,45', 'Re-enabling overrides restores previously learned ranges');
    await sleep(300);
    app = app.setVisual(id); tab('params');
    assert(app.state.overrideMinMax && range('position z').join() === '-10,60' && range('amount').join() === '-20,45', 'Reload restores saved scalar and vector slider ranges');
    tab('developer'); click('Reset Defaults'); tab('params');
    assert(app.state.overrideMinMax && range('amount').join() === '0,10' && !Object.keys(app.state.__paramRanges).length, 'Reset Defaults clears learned ranges and restores the enabled flag');

    app.state.__anim = { ui: { paramTargets: [{ key: 'amount', from: 2, to: 8 }, { key: 'position.x', from: -5, to: 5 }], durationSec: 10, fps: 60, autoFromCurrent: true } };
    app.setParam('free', 77);
    const learnedBeforePlayback = JSON.stringify(app.state.__paramRanges);
    key('p');
    assert(app.state.amount === 2 && app.state.position.x === -5 && app.state.position.y === 2 && app.state.free === 77 && app.state.running && app.state.shouldRender, 'P immediately applies configured starts and preserves unrelated params, simulation, and renderer');
    assert(field('amount').value === '2' && field('position x').value === '-5', 'Visible Params fields reflect keyboard animation starts immediately');
    await sleep(70); key('p');
    const paused = app.state.amount;
    const progress = app.state.__anim.ui.progress01;
    await sleep(70);
    assert(app.state.amount === paused && progress > 0 && !uiEl.querySelector('.anim-panel'), 'P pauses animation without needing the Animate panel mounted');
    key(' ');
    assert(!app.state.running && app.state.shouldRender && app.state.amount === paused, 'Space pauses only the simulation and keeps the scene and parameter animation state');
    key('p'); await sleep(60); key('p');
    assert(app.state.__anim.ui.progress01 > progress && !app.state.running, 'P resumes parameter animation while native simulation remains paused');
    key('r');
    assert(app.state.amount === 2 && app.state.position.x === -5 && app.state.__anim.ui.progress01 === 0 && !app.state.running, 'R restarts from configured Start values without restarting the simulation');
    key('p');
    assert(JSON.stringify(app.state.__paramRanges) === learnedBeforePlayback, 'Programmatic animation does not expand typed slider bounds');
    const stateBeforeIgnoredKeys = exportStateToJSON(app.state);
    for (const letter of ['p', 'r', ' ']) {
      key(letter, field('amount'));
      key(letter, document.body, { ctrlKey: true });
      key(letter, document.body, { repeat: true });
    }
    assert(exportStateToJSON(app.state) === stateBeforeIgnoredKeys, 'Typing, modified keys, and held-key repeats do not trigger playback shortcuts');
    const nativeButton = click('params', '.vr-tab');
    const nativeSpace = key(' ', nativeButton);
    assert(!nativeSpace.defaultPrevented && !app.state.running, 'Space retains native activation on focused toolbar buttons');
    tab('animate');
    assert(uiEl.querySelector('.anim-status').textContent.startsWith('Paused'), 'Opening Animate reflects keyboard playback state');
    key('r');
    assert(uiEl.querySelector('.anim-status').textContent.startsWith('Playing'), 'Keyboard Restart refreshes the mounted animation transport');
    key('p');
    tab('developer'); flag('shouldRender', false);
    key(' ');
    assert(app.state.running && !app.state.shouldRender && app.instance === null && !mountEl.querySelector('svg'), 'Space can change simulation state while rendering is disabled without recreating the scene');
    flag('shouldRender', true);
    assert(app.state.running && app.instance && mountEl.querySelector('svg'), 'Re-enabling shouldRender restores the current simulation settings');
    app = app.setVisual(id); key(' ');
    assert(app.state.running === false, 'Recreating a visual keeps exactly one active playback shortcut handler');
    app.state.__anim = { ui: { paramTargets: [{ key: 'amount', from: 2, to: 8 }], durationSec: 10, fps: 60 } };
    key('p'); tab('developer'); click('Settings', '.vr-subTab'); click('Reset Defaults');
    await sleep(70);
    assert(app.state.amount === 5 && controlAnimation({ state: app.state }, 'pause').playing === false, 'Reset Defaults safely stops an active animation and holds default values');
    app.state.__anim.ui.paramTargets = [{ key: 'amount', from: 1, to: 9 }];
    key('p');
    const loadInput = uiEl.querySelector('.vr-developerSettings input[accept="application/json"]');
    const upload = new DataTransfer();
    upload.items.add(new File(['{"amount":7,"__paramRanges":{}}'], 'fresh.settings.json', { type: 'application/json' }));
    loadInput.files = upload.files;
    await loadInput.onchange();
    await sleep(70);
    assert(app.state.amount === 7 && controlAnimation({ state: app.state }, 'pause').playing === false, 'Loading Settings stops active playback and preserves imported values');
    return passed;
  } finally {
    controlAnimation({ mountEl, state: app.state }, 'stop');
    // Let any last write settle before removing this fixture's saved state.
    await sleep(300);
    for (const prefix of ['visualHelp.settings.v1:', 'visualHelp.ui.v1:', 'visualHelp.persist.v1:']) localStorage.removeItem(prefix + id);
  }
}
