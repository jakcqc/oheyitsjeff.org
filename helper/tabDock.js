/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
import {
  normalizeDockLayout, getDockPanes, findDockNode, activateDockTab,
  moveDockTab, setDockRatio, flattenDockLayout,
} from './tabDockModel.js';

let nextOwner = 0;
const MIME = 'application/x-visual-tab';
const HOLD_MS = 500, MOVE_THRESHOLD = 8;
const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** The original vertical tab column, with gesture-controlled editor splits. */
export function mountDockTabs({ container, state = {}, buildParamsPanel, extraTabs = {}, onUiChange }) {
  const names = ['params', ...Object.keys(extraTabs)];
  let ui = state.__ui ||= {};
  if (ui.tabsOpen === undefined) ui.tabsOpen = false;
  let dock = normalizeDockLayout(ui.dockLayout, names, ui.activeTab || 'params');
  const owner = `vr-dock-${++nextOwner}`;
  const panels = new Map(), paneRecords = new Map(), splitRecords = new Map(), scrollPositions = new Map(), tabButtons = new Map();
  let visible = new Set(), disposed = false, rendering = false, drag = null, press = null, resize = null;
  let minimumFrame = null, suppressClickUntil = 0;
  const layout = make('div', 'vr-tabLayout vr-dockLayout');
  const column = make('div', 'vr-tabCol');
  const tabs = make('div', 'vr-tabs vr-dockTabs');
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Visual controls'); tabs.setAttribute('aria-orientation', 'vertical');
  const toggle = make('button', 'vr-tabsToggle', '+');
  toggle.type = 'button'; toggle.title = 'Show or hide tabs'; toggle.setAttribute('aria-label', 'Show or hide tabs');
  toggle.addEventListener('click', () => { ui.tabsOpen = !ui.tabsOpen; render(); onUiChange?.(); });
  const workspace = make('div', 'vr-dockWorkspace');
  const cache = make('div', 'vr-dockCache'); cache.hidden = true;
  const live = make('div', 'vr-dockLive'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  for (const name of names) { const tab = makeTab(name); tabButtons.set(name, tab); tabs.append(tab); }
  column.append(toggle, tabs); layout.append(column, workspace, cache, live);
  container.append(layout); container.classList.add('vr-dockHost');
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMinimums);
  observer?.observe(workspace);
  const onContainerScroll = () => {
    for (const record of paneRecords.values()) {
      if (record.scroller === container && record.shownTab) scrollPositions.set(record.shownTab, container.scrollTop);
    }
  };
  container.addEventListener('scroll', onContainerScroll);

  function scheduleMinimums() {
    if (disposed || minimumFrame !== null) return;
    minimumFrame = requestAnimationFrame(() => {
      minimumFrame = null; if (disposed) return;
      if (dock.root.type === 'pane') {
        const root = paneRecords.get(dock.root.id).root;
        root.style.removeProperty('min-width'); root.style.removeProperty('min-height'); return;
      }
      const measure = node => {
        if (node.type === 'pane') {
          const record = paneRecords.get(node.id);
          record.root.style.minWidth = '160px'; record.root.style.minHeight = '120px';
          return { width: 160, height: 120 };
        }
        const a = measure(node.first), b = measure(node.second), record = splitRecords.get(node.id);
        const gap = node.axis === 'row' ? record.divider.offsetWidth || 8 : record.divider.offsetHeight || 8;
        const size = node.axis === 'row' ? { width: a.width + b.width + gap, height: Math.max(a.height, b.height) }
          : { width: Math.max(a.width, b.width), height: a.height + b.height + gap };
        for (const [child, min] of [[record.first, a], [record.second, b], [record.root, size]]) {
          child.style.minWidth = `${min.width}px`; child.style.minHeight = `${min.height}px`;
        }
        return size;
      };
      measure(dock.root);
    });
  }
  function remember() { ui.dockLayout = dock; ui.activeTab = findDockNode(dock, dock.activePaneId)?.active || names[0]; }
  function announce(message) { live.textContent = message; }
  function commit(next, message = '') {
    dock = next; remember(); render(); onUiChange?.(); if (message) announce(message);
  }
  function syncTabState() {
    for (const [name, tab] of tabButtons) {
      const selected = name === ui.activeTab;
      tab.classList.toggle('active', selected); tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
  }
  function focusPane(id) {
    if (rendering || drag || dock.activePaneId === id) return;
    dock = { ...dock, activePaneId: id }; remember(); syncTabState(); onUiChange?.();
  }
  function activate(name) {
    if (Date.now() < suppressClickUntil) return;
    commit(activateDockTab(dock, name)); tabButtons.get(name)?.focus({ preventScroll: true });
  }
  function isolate(name) {
    commit(flattenDockLayout(dock, name), `${name} is the only visible editor.`);
    tabButtons.get(name)?.focus({ preventScroll: true });
  }
  function move(name, paneId, edge = 'center') {
    if (!names.includes(name)) return;
    const next = moveDockTab(dock, name, paneId, edge);
    commit(next, next === dock ? 'Tab placement unchanged.' : edge === 'center' ? `${name} replaced the selected panel.` : `${name} moved to the ${edge}.`);
    tabButtons.get(name)?.focus({ preventScroll: true });
  }
  function saveScroll() {
    for (const record of paneRecords.values()) {
      if (record.shownTab && record.scroller) scrollPositions.set(record.shownTab, record.scroller.scrollTop);
    }
  }
  function makePane(pane) {
    const root = make('section', 'vr-dockPane'); root.dataset.paneId = pane.id;
    const body = make('div', 'vr-tabBody vr-dockBody');
    const zones = make('div', 'vr-dockDropZones'); zones.setAttribute('aria-hidden', 'true');
    for (const edge of ['left', 'right', 'top', 'bottom', 'center']) {
      const zone = make('div', 'vr-dockDropTarget'); zone.dataset.edge = edge; zone.dataset.paneId = pane.id; zones.append(zone);
    }
    root.append(body, zones);
    root.addEventListener('pointerdown', () => focusPane(pane.id)); root.addEventListener('focusin', () => focusPane(pane.id));
    body.addEventListener('scroll', () => {
      const record = paneRecords.get(pane.id);
      if (record?.shownTab && record.scroller === body) scrollPositions.set(record.shownTab, body.scrollTop);
    });
    return { root, body, zones, shownTab: null, scroller: null };
  }
  function makeTab(name) {
    const tab = make('button', 'vr-tab', name); tab.type = 'button'; tab.dataset.tab = name; tab.draggable = true;
    tab.title = 'Click to show here; hold to focus alone; drag to split or replace a panel.';
    tab.id = `${owner}-tab-${names.indexOf(name)}`; tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `${owner}-panel-${names.indexOf(name)}`);
    tab.addEventListener('click', event => {
      if (Date.now() < suppressClickUntil) { event.preventDefault(); return; } activate(name);
    });
    tab.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); isolate(name); return; }
      const index = names.indexOf(name); let next;
      if (['ArrowDown', 'ArrowRight'].includes(event.key)) next = (index + 1) % names.length;
      if (['ArrowUp', 'ArrowLeft'].includes(event.key)) next = (index + names.length - 1) % names.length;
      if (event.key === 'Home') next = 0; if (event.key === 'End') next = names.length - 1;
      if (next == null) return; event.preventDefault(); activate(names[next]);
    });
    tab.addEventListener('pointerdown', event => beginPress(event, name));
    tab.addEventListener('contextmenu', event => { if (press || drag) event.preventDefault(); });
    tab.addEventListener('dragstart', event => {
      if (press?.held || drag || !event.dataTransfer) { event.preventDefault(); return; }
      cleanupPress(); startDrag(name); event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(MIME, JSON.stringify({ name, owner })); event.dataTransfer.setData('text/plain', name);
    });
    tab.addEventListener('dragend', endDrag); return tab;
  }
  function ensurePanel(name) {
    if (!panels.has(name)) {
      const panel = name === 'params' ? buildParamsPanel() : extraTabs[name]();
      if (!panel.id) panel.id = `${owner}-panel-${names.indexOf(name)}`;
      panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', `${owner}-tab-${names.indexOf(name)}`);
      tabButtons.get(name).setAttribute('aria-controls', panel.id); panels.set(name, panel);
    }
    return panels.get(name);
  }
  function makeTree(node) {
    if (node.type === 'pane') return paneRecords.get(node.id).root;
    const root = make('div', 'vr-dockSplit'); root.dataset.axis = node.axis; root.dataset.splitId = node.id;
    const first = make('div', 'vr-dockChild'), second = make('div', 'vr-dockChild');
    first.style.flex = `${node.ratio} 1 0%`; second.style.flex = `${1 - node.ratio} 1 0%`;
    first.append(makeTree(node.first)); second.append(makeTree(node.second));
    const divider = make('div', 'vr-dockDivider'); divider.tabIndex = 0;
    divider.dataset.splitId = node.id; divider.dataset.axis = node.axis;
    divider.setAttribute('role', 'separator'); divider.setAttribute('aria-label', 'Resize panels');
    divider.setAttribute('aria-orientation', node.axis === 'row' ? 'vertical' : 'horizontal');
    divider.setAttribute('aria-valuemin', '15'); divider.setAttribute('aria-valuemax', '85'); divider.setAttribute('aria-valuenow', Math.round(node.ratio * 100));
    divider.addEventListener('pointerdown', event => beginResize(event, node.id));
    divider.addEventListener('keydown', event => {
      const current = findDockNode(dock, node.id); if (!current) return; let value;
      if (event.key === (node.axis === 'row' ? 'ArrowLeft' : 'ArrowUp')) value = current.ratio - .05;
      if (event.key === (node.axis === 'row' ? 'ArrowRight' : 'ArrowDown')) value = current.ratio + .05;
      if (event.key === 'Home') value = .15; if (event.key === 'End') value = .85;
      if (value == null) return; event.preventDefault(); commit(setDockRatio(dock, node.id, value));
      splitRecords.get(node.id)?.divider.focus({ preventScroll: true });
    });
    root.append(first, divider, second); splitRecords.set(node.id, { root, first, second, divider }); return root;
  }
  function render(keepSavedScroll = false) {
    if (disposed) return; if (!keepSavedScroll) saveScroll(); rendering = true;
    const focused = document.activeElement;
    const panes = getDockPanes(dock), nextVisible = new Set(panes.map(pane => pane.active));
    for (const name of visible) if (!nextVisible.has(name)) panels.get(name)?._onHide?.();
    for (const pane of panes) {
      if (!paneRecords.has(pane.id)) paneRecords.set(pane.id, makePane(pane)); ensurePanel(pane.active);
    }
    for (const [name, panel] of panels) {
      panel.hidden = !nextVisible.has(name); if (panel.hidden && panel.parentElement !== cache) cache.append(panel);
    }
    for (const pane of panes) {
      const record = paneRecords.get(pane.id), panel = panels.get(pane.active);
      record.root.setAttribute('aria-label', `${pane.active} panel`); record.root.dataset.tab = pane.active;
      if (panel.parentElement !== record.body) record.body.append(panel); record.shownTab = pane.active;
    }
    for (const [id, record] of paneRecords) if (!panes.some(pane => pane.id === id)) { record.root.remove(); paneRecords.delete(id); }
    const split = panes.length > 1;
    container.classList.toggle('is-split', split); layout.classList.toggle('has-splits', split);
    if (!split) { const root = paneRecords.get(panes[0].id).root; root.style.removeProperty('min-width'); root.style.removeProperty('min-height'); }
    splitRecords.clear(); workspace.replaceChildren(makeTree(dock.root));
    if (split) container.scrollTop = 0;
    for (const pane of panes) {
      const record = paneRecords.get(pane.id);
      record.scroller = split ? record.body : container;
      record.scroller.scrollTop = scrollPositions.get(pane.active) || 0;
    }
    tabs.classList.toggle('hidden', !ui.tabsOpen);
    toggle.textContent = ui.tabsOpen ? '-' : '+'; toggle.setAttribute('aria-expanded', String(ui.tabsOpen));
    remember(); syncTabState();
    for (const name of nextVisible) if (!visible.has(name)) panels.get(name)?._onShow?.();
    visible = nextVisible;
    const focusedPane = focused?.closest?.('.vr-dockPane');
    if (focused && container.contains(focused) && !focused.closest('[hidden]') &&
        (!focusedPane || focusedPane.dataset.paneId === dock.activePaneId) && document.activeElement !== focused) {
      focused.focus?.({ preventScroll: true });
    }
    rendering = false; scheduleMinimums();
  }
  function beginResize(event, id) {
    if (event.button != null && event.button !== 0) return;
    const node = findDockNode(dock, id), record = splitRecords.get(id); if (!node || !record) return;
    event.preventDefault(); resize = { id, pointerId: event.pointerId, rect: record.root.getBoundingClientRect(), axis: node.axis, initial: dock };
    layout.classList.add('resizing'); document.addEventListener('pointermove', onResizeMove, { passive: false });
    document.addEventListener('pointerup', onResizeEnd); document.addEventListener('pointercancel', onResizeCancel);
  }
  function onResizeMove(event) {
    if (!resize || event.pointerId !== resize.pointerId) return; event.preventDefault();
    const horizontal = resize.axis === 'row', size = horizontal ? resize.rect.width : resize.rect.height; if (!size) return;
    const value = ((horizontal ? event.clientX : event.clientY) - (horizontal ? resize.rect.left : resize.rect.top)) / size;
    dock = setDockRatio(dock, resize.id, value); remember();
    const node = findDockNode(dock, resize.id), record = splitRecords.get(resize.id);
    if (record && node) {
      record.first.style.flex = `${node.ratio} 1 0%`; record.second.style.flex = `${1 - node.ratio} 1 0%`;
      record.divider.setAttribute('aria-valuenow', Math.round(node.ratio * 100));
    }
  }
  function cleanupResize() {
    document.removeEventListener('pointermove', onResizeMove); document.removeEventListener('pointerup', onResizeEnd);
    document.removeEventListener('pointercancel', onResizeCancel); layout.classList.remove('resizing'); resize = null;
  }
  function onResizeEnd(event) { if (resize && event.pointerId === resize.pointerId) { cleanupResize(); onUiChange?.(); } }
  function onResizeCancel(event) {
    if (!resize || event.pointerId !== resize.pointerId) return;
    const prior = resize.initial; cleanupResize(); dock = prior; remember(); render();
  }
  function startDrag(name) {
    drag = { name, owner }; layout.classList.add('dragging'); document.body.classList.add('vr-dockDragging');
    announce(`Moving ${name}. Drop inside a panel to replace it, or at an edge to split.`);
  }
  function clearHighlight() { for (const zone of layout.querySelectorAll('.vr-dockDropTarget.is-over')) zone.classList.remove('is-over'); }
  function dropTarget(target, x, y) {
    if (!(target instanceof Element) || !workspace.contains(target)) return null;
    const zone = target.closest('.vr-dockDropTarget'); if (zone) return { paneId: zone.dataset.paneId, edge: zone.dataset.edge };
    const pane = target.closest('.vr-dockPane'); if (!pane) return null; const rect = pane.getBoundingClientRect();
    const dx = rect.width ? (x - rect.left) / rect.width : .5, dy = rect.height ? (y - rect.top) / rect.height : .5;
    return { paneId: pane.dataset.paneId, edge: dx < .18 ? 'left' : dx > .82 ? 'right' : dy < .18 ? 'top' : dy > .82 ? 'bottom' : 'center' };
  }
  function highlight(target) {
    clearHighlight(); if (!target) return;
    const record = paneRecords.get(target.paneId);
    [...record?.zones.children || []].find(zone => zone.dataset.edge === target.edge)?.classList.add('is-over');
  }
  function onDragOver(event) {
    if (!drag) return; const target = dropTarget(event.target, event.clientX, event.clientY); if (!target) return;
    event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; highlight(target);
  }
  function onDrop(event) {
    if (!drag) return; const target = dropTarget(event.target, event.clientX, event.clientY);
    if (!target) { endDrag(); return; } event.preventDefault(); event.stopPropagation();
    const name = drag.name; endDrag(); move(name, target.paneId, target.edge);
  }
  function cleanupPress() {
    if (press) { clearTimeout(press.timer); press.ghost?.remove(); }
    document.removeEventListener('pointermove', onPressMove); document.removeEventListener('pointerup', onPressEnd);
    document.removeEventListener('pointercancel', onPressCancel); press = null;
  }
  function endDrag() {
    if (drag) suppressClickUntil = Date.now() + 350;
    drag = null; layout.classList.remove('dragging'); document.body.classList.remove('vr-dockDragging'); clearHighlight(); cleanupPress();
  }
  function beginPress(event, name) {
    if (event.isPrimary === false || (event.button != null && event.button !== 0)) return; cleanupPress();
    const current = { name, id: event.pointerId, type: event.pointerType || 'mouse', x: event.clientX, y: event.clientY, moved: false, held: false };
    press = current;
    current.timer = setTimeout(() => {
      if (disposed || press !== current || current.moved || drag) return;
      current.held = true; suppressClickUntil = Date.now() + 350; isolate(name);
    }, HOLD_MS);
    document.addEventListener('pointermove', onPressMove, { passive: false });
    document.addEventListener('pointerup', onPressEnd); document.addEventListener('pointercancel', onPressCancel);
  }
  function onPressMove(event) {
    if (!press || event.pointerId !== press.id || press.held) return;
    if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < MOVE_THRESHOLD) return;
    press.moved = true; clearTimeout(press.timer); if (!['touch', 'pen'].includes(press.type)) return; event.preventDefault();
    if (!drag) { startDrag(press.name); press.ghost = make('div', 'vr-dockDragGhost', press.name); document.body.append(press.ghost); }
    press.ghost.style.left = `${event.clientX + 12}px`; press.ghost.style.top = `${event.clientY + 12}px`;
    press.target = dropTarget(document.elementFromPoint(event.clientX, event.clientY), event.clientX, event.clientY); highlight(press.target);
  }
  function onPressEnd(event) {
    if (!press || event.pointerId !== press.id) return; const current = press;
    if (current.held || current.moved) { event.preventDefault(); suppressClickUntil = Date.now() + 350; }
    const target = drag ? dropTarget(document.elementFromPoint(event.clientX, event.clientY), event.clientX, event.clientY) : null;
    endDrag(); if (target) move(current.name, target.paneId, target.edge);
  }
  function onPressCancel(event) { if (press && event.pointerId === press.id) { suppressClickUntil = Date.now() + 350; endDrag(); } }
  function onEscape(event) {
    if (event.key !== 'Escape') return;
    if (drag || press) { event.preventDefault(); suppressClickUntil = Date.now() + 350; endDrag(); announce('Tab gesture canceled.'); }
    if (resize) { event.preventDefault(); const prior = resize.initial; cleanupResize(); dock = prior; remember(); render(); }
  }
  layout.addEventListener('dragover', onDragOver); layout.addEventListener('drop', onDrop);
  layout.addEventListener('dragleave', event => { if (!layout.contains(event.relatedTarget)) clearHighlight(); });
  document.addEventListener('keydown', onEscape);
  remember(); render();
  container._destroyTabs = () => {
    if (disposed) return; saveScroll(); disposed = true; endDrag(); cleanupResize();
    observer?.disconnect(); if (minimumFrame !== null) cancelAnimationFrame(minimumFrame);
    container.removeEventListener('scroll', onContainerScroll);
    document.removeEventListener('keydown', onEscape);
    for (const name of visible) panels.get(name)?._onHide?.();
    for (const panel of panels.values()) panel._destroy?.();
    panels.clear(); paneRecords.clear(); splitRecords.clear(); visible.clear();
    container.classList.remove('vr-dockHost', 'is-split'); layout.remove();
  };
  container._refreshPanels = (preserveTab = 'assistant') => {
    if (disposed) return; saveScroll(); endDrag(); cleanupResize();
    ui = state.__ui ||= {}; if (ui.tabsOpen === undefined) ui.tabsOpen = false;
    dock = normalizeDockLayout(ui.dockLayout, names, ui.activeTab || 'params');
    for (const [name, panel] of panels) {
      if (name === preserveTab) continue;
      if (visible.has(name)) panel._onHide?.(); visible.delete(name); panel._destroy?.(); panel.remove(); panels.delete(name);
    }
    render(true);
  };
}
