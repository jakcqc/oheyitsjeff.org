/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Mount the real app's parameter UI without starting its D3 simulation.
export async function runBacterialConstructsConditionChecks() {
  const { VISUALS, makeDefaultState, mountAutoUI, exportVisualUIJsonSpec } = await import('../helper/visualHelp.js');
  await import('../BacterialConstructs/BacterialConstructs_visual.js');
  const spec = VISUALS.bacterialConstructs;
  const state = makeDefaultState(spec);
  state.__ui = { activeTab: 'params', collapseParamsByDefault: false };
  const fixture = document.createElement('div');
  fixture.className = 'vr-autoUI';
  document.body.append(fixture);
  const mountEl = document.createElement('div');
  const passed = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    passed.push(message);
  };
  let changes = 0;
  mountAutoUI({ container: fixture, spec, state, mountEl, visualId: 'bacterialConstructs', onChange: () => changes++ });
  const input = key => {
    const param = spec.params.find(item => item.key === key);
    return [...fixture.querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === (param.label ?? key));
  };
  const originals = new Map(spec.params.filter(param => param.type !== 'button').map(param => [param.key, input(param.key)]));
  const row = key => input(key).closest('.vr-row');
  const equationKeys = () => spec.params.filter(param => param.category === 'Equation' && !row(param.key).hidden).map(param => param.key);
  const edit = (key, value) => {
    const node = input(key);
    if (node.type === 'checkbox') node.checked = value;
    else node.value = String(value);
    node.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const checkEquation = (model, expected) => {
    assert(state.model === model && JSON.stringify(equationKeys()) === JSON.stringify(expected), `${model} shows only its applicable equation parameters`);
    assert([...originals].every(([key, original]) => input(key) === original), `${model} updates visibility without replacing input nodes`);
    assert([...fixture.querySelectorAll('.vr-paramGroup')].every(group => !group.hidden), `${model} retains the Equation, Simulation, and SVG Styling groups`);
  };

  try {
    assert([...originals.values()].every(Boolean), 'All parameter controls are mounted, including initially hidden ones');
    checkEquation('Gray-Scott', ['model', 'feed', 'kill', 'diffusionA', 'diffusionB']);
    edit('feed', 0.065);
    edit('diffusionB', 0.31);
    edit('model', 'Keller-Segel');
    checkEquation('Keller-Segel', ['model', 'diffusionA', 'diffusionB', 'chemotaxis', 'growth']);
    assert(state.feed === 0.065 && input('feed').value === '0.065', 'Gray-Scott feed value survives while its editor is hidden');
    edit('chemotaxis', 0.81);
    edit('growth', 0.27);
    edit('model', 'Fisher-KPP');
    checkEquation('Fisher-KPP', ['model', 'diffusionA', 'growth']);
    assert(state.diffusionB === 0.31 && input('diffusionB').value === '0.31', 'Signal diffusion survives switching to Fisher-KPP');
    assert(state.chemotaxis === 0.81 && input('chemotaxis').value === '0.81', 'Chemotactic pull survives while its editor is hidden');
    edit('model', 'Gray-Scott');
    checkEquation('Gray-Scott', ['model', 'feed', 'kill', 'diffusionA', 'diffusionB']);
    assert(input('feed').value === '0.065' && input('diffusionB').value === '0.31', 'Returning to Gray-Scott restores the same edited controls and values');
    edit('model', 'Keller-Segel');
    assert(input('chemotaxis').value === '0.81' && input('growth').value === '0.27', 'Returning to Keller-Segel retains both growth and chemotaxis values');

    edit('markDensity', 0.23);
    assert(!row('markDensity').hidden, 'Cell density starts visible with individual cells enabled');
    edit('cellMarks', false);
    assert(row('markDensity').hidden && state.markDensity === 0.23, 'Disabling cell marks hides density while retaining its value');
    edit('cellMarks', true);
    assert(!row('markDensity').hidden && input('markDensity').value === '0.23', 'Enabling cell marks reveals the retained density control');

    const exported = JSON.parse(JSON.stringify(exportVisualUIJsonSpec('bacterialConstructs')));
    for (const param of spec.params) {
      const metadata = exported.params.find(item => item.key === param.key);
      assert(JSON.stringify(metadata.shouldShowWhen) === JSON.stringify(param.shouldShowWhen ?? null), `UI JSON preserves ${param.key} visibility metadata`);
    }
    assert(changes === 11, 'Each actual selector, toggle, or numeric edit emits one normal change notification');
    return passed;
  } finally {
    fixture._destroyTabs?.();
    fixture.remove();
  }
}
