/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Serve tab-dock-regressions.html, or import this function in a browser.
// Exercise the shared mountUserTabs entry point with lightweight draft editors.
export async function runTabDockRegressions() {
  const { mountUserTabs } = await import('../helper/visualHelp.js');
  const passed = [], fixtures = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    passed.push(message);
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const tabNames = ['params', 'transforms', 'effects', 'assistant'];
  const pane = (id, active) => ({ type: 'pane', id, active });
  const paired = () => ({ version: 2, tabs: [...tabNames], activePaneId: 'left', root: {
    type: 'split', id: 'main', axis: 'row', ratio: .5,
    first: pane('left', 'params'), second: pane('right', 'transforms'),
  } });
  const legacyPaired = () => ({ version: 1, activePaneId: 'left', root: {
    type: 'split', id: 'main', axis: 'row', ratio: .5,
    first: { ...pane('left', 'params'), tabs: ['params', 'effects'] },
    second: { ...pane('right', 'transforms'), tabs: ['transforms', 'assistant'] },
  } });
  const walk = node => node.type === 'pane' ? [node] : [...walk(node.first), ...walk(node.second)];
  const fixture = (saved, names = tabNames) => {
    const container = document.createElement('div');
    container.className = 'vr-autoUI tab-dock-test-fixture';
    container.style.cssText = 'position:relative;width:1000px;height:600px;max-width:100%;';
    document.body.append(container);
    const state = { __ui: { tabsOpen: true, activeTab: 'params', ...(saved ? { dockLayout: saved } : {}) } };
    const instances = new Map(names.map(name => [name, []]));
    let uiChanges = 0, visualChanges = 0;
    const build = name => () => {
      const panel = document.createElement('div');
      panel.dataset.testPanel = name;
      panel.style.minHeight = '1000px';
      const draft = document.createElement('textarea');
      draft.setAttribute('aria-label', `${name} draft`); draft.value = `${name} initial`; panel.append(draft);
      const record = { panel, show: 0, hide: 0, destroy: 0 };
      for (const [hook, key] of [['_onShow', 'show'], ['_onHide', 'hide'], ['_destroy', 'destroy']]) panel[hook] = () => { record[key]++; };
      instances.get(name).push(record); return panel;
    };
    mountUserTabs({ container, state, spec: { title: 'Dock fixture', params: [] }, buildParamsPanel: build('params'),
      extraTabs: Object.fromEntries(names.filter(name => name !== 'params').map(name => [name, build(name)])),
      onUiChange: () => { uiChanges++; }, onChange: () => { visualChanges++; },
    });
    const result = {
      container, state, instances,
      record: name => instances.get(name).at(-1),
      paneEl: id => container.querySelector(`.vr-dockPane[data-pane-id="${id}"]`),
      tab: name => container.querySelector(`.vr-tab[data-tab="${name}"]`),
      activePanels: () => [...container.querySelectorAll('[data-test-panel]')].filter(panel => !panel.hidden && !panel.closest('[hidden]')),
      destroy: () => { container._destroyTabs?.(); container.remove(); },
      get uiChanges() { return uiChanges; }, get visualChanges() { return visualChanges; },
    };
    fixtures.push(result); return result;
  };
  const allTabsInOrder = test => [...test.container.querySelectorAll('.vr-tab[data-tab]')].map(node => node.dataset.tab).join(',') === tabNames.join(',');
  const selected = (test, id) => walk(test.state.__ui.dockLayout.root).find(node => node.id === id)?.active;
  const visibleNames = test => test.activePanels().map(panel => panel.dataset.testPanel).sort().join(',');
  const transfer = () => {
    const data = new Map();
    return { effectAllowed: 'uninitialized', dropEffect: 'none', setData: (type, value) => data.set(type, String(value)),
      getData: type => data.get(type) || '', clearData: () => data.clear(), setDragImage() {}, get types() { return [...data.keys()]; } };
  };
  const dragEvent = (node, type, dataTransfer) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer }); node.dispatchEvent(event); return event;
  };
  const pointer = (node, type, values = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, clientX: 0, clientY: 0, ...values })) {
      Object.defineProperty(event, key, { value });
    }
    node.dispatchEvent(event); return event;
  };
  const focusPane = (test, id) => pointer(test.paneEl(id), 'pointerdown');
  const dropTab = (test, name, targetId, edge) => {
    const source = test.tab(name), data = transfer();
    dragEvent(source, 'dragstart', data);
    const target = test.container.querySelector(`.vr-dockDropTarget[data-pane-id="${targetId}"][data-edge="${edge}"]`);
    if (!target) throw new Error(`Missing drop target: ${targetId}/${edge}`);
    dragEvent(target, 'dragover', data); dragEvent(target, 'drop', data); dragEvent(source, 'dragend', data);
  };

  try {
    const original = fixture();
    assert(original.container.querySelectorAll('.vr-tabCol').length === 1 && original.container.querySelector('.vr-tabCol > .vr-tabsToggle') && original.container.querySelector('.vr-tabCol > .vr-tabs'), 'The toolbar retains its original tab column and existing plus/minus toggle');
    assert(original.container.querySelectorAll('.vr-tabs').length === 1 && allTabsInOrder(original), 'One global tab strip retains every tab in its original order');
    assert(original.container.querySelector('.vr-tabs').getAttribute('aria-orientation') === 'vertical', 'The original global tab strip remains vertical');
    assert(!original.container.querySelector('.vr-dockToolbar,.vr-dockPaneHeader,.vr-dockPaneTools,.vr-dockMoveControls,.vr-dockPane .vr-tabs,select') && original.container.querySelectorAll('button').length === tabNames.length + 1, 'Docking adds no visible toolbar controls, panel headings, arrow buttons, or per-panel tabs');
    assert(original.container.querySelectorAll('.vr-dockPane').length === 1 && visibleNames(original) === 'params', 'Fresh toolbars show one Params editor');
    original.container.querySelector('.vr-tabsToggle').click();
    assert(original.container.querySelector('.vr-tabs').classList.contains('hidden') && visibleNames(original) === 'params', 'The original plus/minus toggle hides the tab strip without hiding its editor');
    original.container.querySelector('.vr-tabsToggle').click();
    assert(!original.container.querySelector('.vr-tabs').classList.contains('hidden') && allTabsInOrder(original), 'Reopening the tab strip restores every original tab');

    const independent = fixture(legacyPaired());
    assert(independent.state.__ui.dockLayout.version === 2 && independent.activePanels().length === 2 && allTabsInOrder(independent), 'Legacy per-panel tab layouts migrate to global tabs with both selected editors visible');
    assert(independent.record('params').show === 1 && independent.record('transforms').show === 1, 'Each initially visible editor receives one show callback');
    assert(independent.instances.get('effects').length === 0 && independent.instances.get('assistant').length === 0, 'Hidden global tabs are built lazily');
    const effectsButton = independent.tab('effects'); effectsButton.focus(); effectsButton.click();
    assert(selected(independent, 'left') === 'effects' && selected(independent, 'right') === 'transforms', 'A global tab click replaces the selected pane while leaving the other pane intact');
    assert(independent.tab('effects') === effectsButton && document.activeElement === effectsButton, 'Global tab buttons remain stable and preserve keyboard focus');
    assert(independent.record('params').hide === 1 && independent.record('effects').show === 1 && independent.record('transforms').hide === 0, 'Replacing a pane runs lifecycle hooks only for its departing and arriving editors');
    independent.tab('effects').click();
    assert(independent.record('effects').show === 1, 'Clicking the selected global tab does not show its editor twice');
    focusPane(independent, 'right'); independent.tab('assistant').click();
    assert(selected(independent, 'right') === 'assistant' && selected(independent, 'left') === 'effects', 'Clicking inside another pane makes it the destination of the next global tab selection');
    assert(independent.tab('assistant').getAttribute('aria-selected') === 'true' && independent.tab('effects').getAttribute('aria-selected') === 'false', 'The global strip marks the focused pane selection for assistive technology');
    focusPane(independent, 'left'); independent.tab('params').click();
    const params = independent.record('params'), assistant = independent.record('assistant');
    params.panel.querySelector('textarea').value = 'unsaved parameter draft'; params.panel.closest('.vr-tabBody').scrollTop = 43;
    assistant.panel.querySelector('textarea').value = 'unsent assistant draft'; assistant.panel.closest('.vr-tabBody').scrollTop = 88;
    const paramsLifecycle = [params.show, params.hide], assistantLifecycle = [assistant.show, assistant.hide];
    independent.tab('assistant').click();
    assert(selected(independent, 'left') === 'assistant' && selected(independent, 'right') === 'params', 'Selecting an already visible tab swaps editors between panes');
    assert(independent.record('assistant') === assistant && independent.record('params') === params && assistant.panel.querySelector('textarea').value === 'unsent assistant draft' && params.panel.querySelector('textarea').value === 'unsaved parameter draft', 'Swapping visible editors preserves both DOM instances and unsaved drafts');
    assert(assistant.panel.closest('.vr-tabBody').scrollTop === 88 && params.panel.closest('.vr-tabBody').scrollTop === 43, 'Each editor retains its own scroll position when swapped');
    assert([params.show, params.hide].join() === paramsLifecycle.join() && [assistant.show, assistant.hide].join() === assistantLifecycle.join(), 'Swapping visible editors does not interrupt either lifecycle');
    assert(independent.activePanels().length === 2 && allTabsInOrder(independent) && independent.container.querySelectorAll('[data-test-panel="assistant"]').length === 1, 'Swapping preserves global tab order and never duplicates an editor');
    assert(independent.visualChanges === 0 && independent.uiChanges > 0, 'Changing panel selections records toolbar state without rerendering the visual');

    const cached = [...independent.instances.values()].flat();
    independent.container._refreshPanels('assistant');
    assert(independent.record('assistant') === assistant && assistant.destroy === 0 && assistant.panel.querySelector('textarea').value === 'unsent assistant draft', 'Refreshing editors preserves the Assistant instance and unsent draft');
    assert([assistant.show, assistant.hide].join() === assistantLifecycle.join(), 'Refreshing other editors leaves a visible Assistant lifecycle untouched');
    assert(cached.filter(item => item !== assistant).every(item => item.destroy === 1), 'Refreshing destroys every stale non-Assistant editor, including hidden cached editors');
    assert(independent.record('params') !== params && independent.record('params').show === 1 && visibleNames(independent) === 'assistant,params', 'Refreshing rebuilds selected editors throughout the split layout');
    const previousUi = independent.state.__ui, previousLayout = JSON.stringify(previousUi.dockLayout);
    const restoredLayout = paired(); restoredLayout.root.first.active = 'effects'; restoredLayout.root.second.active = 'assistant'; restoredLayout.activePaneId = 'right';
    const restoredUi = { tabsOpen: false, activeTab: 'assistant', dockLayout: restoredLayout };
    independent.state.__ui = restoredUi; independent.container._refreshPanels('assistant');
    assert(independent.state.__ui === restoredUi && selected(independent, 'left') === 'effects' && selected(independent, 'right') === 'assistant' && restoredUi.dockLayout.activePaneId === 'right', 'Refreshing after Undo adopts the replacement UI object and its saved pane selections');
    assert(visibleNames(independent) === 'assistant,effects' && independent.container.querySelector('.vr-tabs').classList.contains('hidden'), 'Undo restores the split selections and original tab-strip visibility');
    assert(independent.record('assistant') === assistant && [assistant.show, assistant.hide].join() === assistantLifecycle.join() && assistant.panel.querySelector('textarea').value === 'unsent assistant draft', 'Undo can move the retained visible Assistant without rebuilding it or interrupting its lifecycle');
    independent.container.querySelector('.vr-tabsToggle').click(); dropTab(independent, 'params', 'left', 'bottom');
    assert(independent.state.__ui === restoredUi && walk(restoredUi.dockLayout.root).length === 3 && visibleNames(independent) === 'assistant,effects,params', 'Docking after Undo updates the current restored UI object');
    assert(JSON.stringify(previousUi.dockLayout) === previousLayout && [assistant.show, assistant.hide].join() === assistantLifecycle.join(), 'Later docking leaves detached UI state and the retained Assistant lifecycle unchanged');
    independent.container._destroyTabs(); independent.container._destroyTabs();
    assert([...independent.instances.values()].flat().every(item => item.destroy === 1), 'Repeated cleanup destroys every created editor exactly once');

    const keyboard = fixture(paired());
    focusPane(keyboard, 'right'); keyboard.tab('transforms').focus();
    keyboard.tab('transforms').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert(selected(keyboard, 'right') === 'effects' && selected(keyboard, 'left') === 'params' && document.activeElement === keyboard.tab('effects'), 'Arrow Down selects and focuses the next global tab within the focused pane');
    keyboard.tab('effects').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    assert(selected(keyboard, 'right') === 'transforms' && allTabsInOrder(keyboard), 'Arrow Up returns to the preceding global tab without changing tab order');

    const drag = fixture();
    const baseId = drag.state.__ui.dockLayout.root.id, originalParams = drag.record('params');
    assert(drag.tab('transforms').draggable, 'Global tabs advertise native drag and drop');
    dropTab(drag, 'transforms', baseId, 'right');
    assert(drag.activePanels().length === 2 && drag.container.querySelector('.vr-dockSplit[data-axis="row"]') && selected(drag, baseId) === 'params', 'Dropping a hidden tab on a right edge creates side-by-side editors');
    dropTab(drag, 'effects', baseId, 'bottom');
    assert(drag.activePanels().length === 3 && drag.container.querySelector('.vr-dockSplit[data-axis="column"]'), 'Dropping on a bottom edge creates a nested lower editor');
    const transformPaneId = walk(drag.state.__ui.dockLayout.root).find(node => node.active === 'transforms').id;
    dropTab(drag, 'assistant', transformPaneId, 'top');
    assert(drag.activePanels().length === 4 && allTabsInOrder(drag), 'Mixed edge docking displays four editors with one original global tab strip');
    assert(drag.record('params') === originalParams && originalParams.show === 1 && originalParams.hide === 0, 'Adding panes preserves existing editor DOM and lifecycle');
    const effect = drag.record('effects'); effect.panel.querySelector('textarea').value = 'dragged effect draft'; effect.panel.closest('.vr-tabBody').scrollTop = 76;
    dropTab(drag, 'effects', baseId, 'center');
    assert(selected(drag, baseId) === 'effects' && drag.activePanels().length === 4 && visibleNames(drag) === 'assistant,effects,params,transforms', 'Center-dropping a visible tab swaps it with the target editor');
    assert(drag.record('effects') === effect && effect.panel.querySelector('textarea').value === 'dragged effect draft' && effect.panel.closest('.vr-tabBody').scrollTop === 76 && effect.show === 1 && effect.hide === 0, 'Native center docking preserves the visible editor draft, scroll, and lifecycle');
    dropTab(drag, 'transforms', baseId, 'left');
    assert(drag.activePanels().length === 4 && allTabsInOrder(drag) && drag.container.querySelectorAll('[data-test-panel="transforms"]').length === 1, 'Moving an existing editor to an edge collapses its old pane without duplicates');
    const dragSnapshot = JSON.stringify(drag.state.__ui.dockLayout), alien = transfer(); alien.setData('text/plain', 'params');
    dragEvent(drag.container.querySelector('.vr-dockDropTarget[data-edge="center"]'), 'drop', alien);
    assert(JSON.stringify(drag.state.__ui.dockLayout) === dragSnapshot, 'Unrelated external text drops do not change toolbar placement');
    const globalSource = drag.tab('params'), globalTransfer = transfer();
    dragEvent(globalSource, 'dragstart', globalTransfer); dragEvent(drag.tab('assistant'), 'drop', globalTransfer); dragEvent(globalSource, 'dragend', globalTransfer);
    assert(allTabsInOrder(drag) && JSON.stringify(drag.state.__ui.dockLayout) === dragSnapshot, 'Dropping over the global tab strip keeps the original tab order and panel arrangement');
    const center = fixture(paired()); dropTab(center, 'effects', 'right', 'center');
    assert(selected(center, 'right') === 'effects' && selected(center, 'left') === 'params' && center.record('transforms').hide === 1, 'Center-dropping a hidden tab replaces only the target pane editor');

    const sizing = fixture(paired());
    let divider = sizing.container.querySelector('.vr-dockDivider');
    assert(divider.getAttribute('role') === 'separator' && divider.tabIndex === 0, 'Split dividers remain keyboard-focusable separators');
    const ratioBefore = Number(divider.getAttribute('aria-valuenow'));
    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    divider = sizing.container.querySelector('.vr-dockDivider');
    assert(Number(divider.getAttribute('aria-valuenow')) > ratioBefore, 'Arrow keys resize side-by-side editors');
    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    assert(sizing.state.__ui.dockLayout.root.ratio === .15, 'Home clamps a splitter to its minimum usable ratio');
    sizing.container.querySelector('.vr-dockDivider').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    assert(sizing.state.__ui.dockLayout.root.ratio === .85, 'End clamps a splitter to its maximum usable ratio');
    sizing.container.querySelector('.vr-dockSplit').getBoundingClientRect = () => ({ left: 100, top: 50, width: 1000, height: 600, right: 1100, bottom: 650 });
    const resizeParams = sizing.record('params'), beforeResizeSave = sizing.uiChanges;
    pointer(sizing.container.querySelector('.vr-dockDivider'), 'pointerdown', { clientX: 950, clientY: 100 });
    pointer(document, 'pointermove', { clientX: 700, clientY: 100 });
    assert(sizing.state.__ui.dockLayout.root.ratio === .6, 'Dragging a divider uses the split bounds to resize its editors');
    pointer(document, 'pointerup', { clientX: 700, clientY: 100 });
    assert(sizing.uiChanges > beforeResizeSave && sizing.record('params') === resizeParams && resizeParams.show === 1 && resizeParams.hide === 0, 'Completing a resize saves the ratio without rebuilding or interrupting editors');
    pointer(sizing.container.querySelector('.vr-dockDivider'), 'pointerdown', { clientX: 700, clientY: 100 });
    pointer(document, 'pointermove', { clientX: 400, clientY: 100 }); pointer(document, 'pointercancel');
    assert(sizing.state.__ui.dockLayout.root.ratio === .6 && !sizing.container.querySelector('.resizing'), 'Canceling a divider drag restores the original ratio');
    const saved = JSON.parse(JSON.stringify(sizing.state.__ui.dockLayout)), reloaded = fixture(saved);
    assert(JSON.stringify(reloaded.state.__ui.dockLayout) === JSON.stringify(saved) && visibleNames(reloaded) === 'params,transforms', 'Saved split ratios, editor selections, focused pane, and global tabs survive remounting');

    const touch = fixture(paired()), touchEditor = touch.record('transforms');
    touchEditor.panel.querySelector('textarea').value = 'touch draft'; touchEditor.panel.closest('.vr-tabBody').scrollTop = 64;
    touch.record('params').panel.querySelector('textarea').focus();
    const hitTestDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    let hitTarget = touch.container.querySelector('.vr-dockDropTarget[data-pane-id="left"][data-edge="center"]');
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hitTarget });
    try {
      const start = { pointerType: 'touch', pointerId: 12, clientX: 100, clientY: 100 };
      pointer(touch.tab('transforms'), 'pointerdown', start); pointer(document, 'pointermove', { ...start, clientX: 104, clientY: 104 });
      assert(!touch.container.querySelector('.dragging') && !document.querySelector('.vr-dockDragGhost'), 'Small touch movement does not start a drag');
      pointer(document, 'pointermove', { ...start, clientX: 140, clientY: 140 });
      assert(touch.container.querySelector('.dragging') && document.querySelector('.vr-dockDragGhost') && hitTarget.classList.contains('is-over'), 'Touch dragging displays a ghost and highlights its destination');
      pointer(document, 'pointerup', { ...start, clientX: 140, clientY: 140 });
      assert(selected(touch, 'left') === 'transforms' && selected(touch, 'right') === 'params' && touch.record('transforms') === touchEditor, 'Releasing a touch drag swaps the original editors into their destination panes');
      assert(touch.state.__ui.dockLayout.activePaneId === 'left', 'A touch swap keeps its drop destination selected when a moved textarea previously held focus');
      assert(touchEditor.panel.querySelector('textarea').value === 'touch draft' && touchEditor.panel.closest('.vr-tabBody').scrollTop === 64 && touchEditor.show === 1 && touchEditor.hide === 0, 'Touch docking preserves the visible editor draft, scroll, and lifecycle');
      assert(!document.querySelector('.vr-dockDragGhost') && !touch.container.querySelector('.dragging'), 'Completing a touch move clears its ghost and drag state');
      const beforeCancel = JSON.stringify(touch.state.__ui.dockLayout);
      hitTarget = touch.container.querySelector('.vr-dockDropTarget[data-pane-id="right"][data-edge="bottom"]');
      pointer(touch.tab('effects'), 'pointerdown', start); pointer(document, 'pointermove', { ...start, clientX: 160, clientY: 160 }); pointer(document, 'pointercancel', start);
      assert(JSON.stringify(touch.state.__ui.dockLayout) === beforeCancel && !document.querySelector('.vr-dockDragGhost'), 'Canceling a touch drag leaves panel arrangement unchanged');
      pointer(touch.tab('effects'), 'pointerdown', start); pointer(document, 'pointermove', { ...start, clientX: 160, clientY: 160 });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(550);
      assert(JSON.stringify(touch.state.__ui.dockLayout) === beforeCancel && !document.querySelector('.vr-dockDragGhost'), 'Escape cancels touch dragging and its pending long-press timer');
      touch.tab('effects').click();
      assert(selected(touch, 'left') === 'effects' && selected(touch, 'right') === 'params', 'The next tab selection replaces the touch-drop destination rather than following the previously focused textarea');
    } finally {
      if (hitTestDescriptor) Object.defineProperty(document, 'elementFromPoint', hitTestDescriptor); else delete document.elementFromPoint;
    }

    for (const pointerType of ['mouse', 'touch', 'pen']) {
      const held = fixture(paired()), name = pointerType === 'mouse' ? 'effects' : 'transforms';
      const previousEditor = held.record(name), button = held.tab(name);
      if (previousEditor) { previousEditor.panel.querySelector('textarea').value = 'held draft'; previousEditor.panel.closest('.vr-tabBody').scrollTop = 52; }
      const start = { pointerType, pointerId: 31, clientX: 80, clientY: 80 };
      pointer(button, 'pointerdown', start);
      if (pointerType === 'mouse') {
        await sleep(200);
        assert(held.activePanels().length === 2 && held.instances.get('effects').length === 0, 'A short stationary press does not isolate its editor');
        await sleep(350);
      } else await sleep(550);
      pointer(document, 'pointerup', start);
      assert(held.container.querySelectorAll('.vr-dockPane').length === 1 && visibleNames(held) === name && held.tab(name) === button && allTabsInOrder(held), `A stationary ${pointerType} long press isolates its editor while preserving the original global tabs`);
      assert(!held.container.querySelector('.vr-dockToolbar,.vr-dockPaneHeader') && held.record('params').hide === 1, `${pointerType} isolation hides other editors without introducing new toolbar chrome`);
      if (previousEditor) assert(held.record(name) === previousEditor && previousEditor.panel.querySelector('textarea').value === 'held draft' && held.container.scrollTop === 52 && previousEditor.show === 1 && previousEditor.hide === 0, `${pointerType} long-press isolation preserves an already visible editor draft, scroll, and lifecycle`);
    }
    const scrolling = fixture(), scrollingParams = scrolling.record('params');
    scrollingParams.panel.querySelector('textarea').value = 'single-pane draft'; scrolling.container.scrollTop = 91;
    scrolling.tab('transforms').click();
    assert(scrolling.container.scrollTop === 0, 'A newly opened single-pane editor starts at the top of the original toolbar scroller');
    const scrollingTransforms = scrolling.record('transforms'); scrolling.container.scrollTop = 37;
    scrolling.tab('params').click();
    assert(scrolling.container.scrollTop === 91 && scrolling.record('params') === scrollingParams && scrollingParams.panel.querySelector('textarea').value === 'single-pane draft', 'Switching original single-pane tabs restores each cached editor scroll and draft');
    const scrollingPaneId = scrolling.state.__ui.dockLayout.root.id;
    dropTab(scrolling, 'transforms', scrollingPaneId, 'right');
    assert(scrollingParams.panel.closest('.vr-tabBody').scrollTop === 91 && scrollingTransforms.panel.closest('.vr-tabBody').scrollTop === 37, 'Splitting transfers each editor scroll from the original toolbar into its independent panel scroller');
    const scrollPress = { pointerId: 39, pointerType: 'mouse', clientX: 80, clientY: 80 };
    pointer(scrolling.tab('params'), 'pointerdown', scrollPress); await sleep(550); pointer(document, 'pointerup', scrollPress);
    assert(scrolling.container.querySelectorAll('.vr-dockPane').length === 1 && scrolling.container.scrollTop === 91 && scrollingParams.panel.querySelector('textarea').value === 'single-pane draft', 'Long-press isolation transfers the selected editor scroll back to the original toolbar scroller');
    await sleep(375); scrolling.tab('transforms').click();
    assert(scrolling.container.scrollTop === 37 && scrolling.record('transforms') === scrollingTransforms, 'A cached editor restores its previous scroll after split-to-single isolation');
    const canceledPress = fixture(paired()), press = { pointerId: 41, pointerType: 'mouse', clientX: 80, clientY: 80 };
    pointer(canceledPress.tab('effects'), 'pointerdown', press); pointer(document, 'pointercancel', press); await sleep(550);
    assert(canceledPress.activePanels().length === 2 && canceledPress.instances.get('effects').length === 0, 'Canceling a stationary press prevents delayed editor isolation');
    pointer(canceledPress.tab('effects'), 'pointerdown', press); pointer(document, 'pointermove', { ...press, clientX: 100 }); await sleep(550); pointer(document, 'pointerup', { ...press, clientX: 100 });
    assert(canceledPress.activePanels().length === 2 && canceledPress.instances.get('effects').length === 0, 'Moving the pointer cancels long-press isolation');
    pointer(canceledPress.tab('effects'), 'pointerdown', press); canceledPress.container._refreshPanels('assistant'); await sleep(550);
    assert(canceledPress.activePanels().length === 2 && canceledPress.instances.get('effects').length === 0, 'Refreshing editors cancels a pending long press before rebuilding panels');
    pointer(canceledPress.tab('effects'), 'pointerdown', press); canceledPress.destroy(); await sleep(550);
    assert(canceledPress.instances.get('effects').length === 0 && !document.querySelector('.vr-dockDragGhost'), 'Destroying a toolbar clears its pending long-press work');

    const stale = fixture({ version: 2, tabs: ['params', 'removed-plugin', 'params'], activePaneId: 'gone', root: {
      type: 'split', id: 'main', axis: 'row', ratio: 8,
      first: pane('duplicate', 'params'), second: pane('duplicate', 'transforms'),
    } });
    const normalized = walk(stale.state.__ui.dockLayout.root);
    assert(allTabsInOrder(stale) && stale.state.__ui.dockLayout.tabs.join(',') === tabNames.join(','), 'Saved unknown and duplicate global tabs are repaired while newly registered tabs remain in original order');
    assert(new Set(normalized.map(item => item.id)).size === normalized.length && normalized.some(item => item.id === stale.state.__ui.dockLayout.activePaneId), 'Malformed panel IDs and saved focused pane are repaired');
    assert(stale.state.__ui.dockLayout.root.ratio >= .15 && stale.state.__ui.dockLayout.root.ratio <= .85, 'Malformed saved divider ratios normalize to usable bounds');
    const duplicate = fixture({ version: 2, tabs: tabNames, activePaneId: 'left', root: {
      type: 'split', id: 'main', axis: 'row', ratio: .5, first: pane('left', 'params'), second: pane('right', 'params'),
    } });
    assert(new Set(duplicate.activePanels().map(panel => panel.dataset.testPanel)).size === duplicate.activePanels().length && allTabsInOrder(duplicate), 'Saved duplicate pane editors cannot create duplicate visible DOM');
    const removed = fixture({ version: 2, tabs: ['removed-plugin'], activePaneId: 'gone', root: pane('gone', 'removed-plugin') });
    assert(removed.activePanels().length === 1 && tabNames.includes(removed.state.__ui.dockLayout.root.active) && allTabsInOrder(removed), 'Unavailable saved editors recover to a valid original tab');
    return passed;
  } finally { for (const test of fixtures) test.destroy(); }
}
