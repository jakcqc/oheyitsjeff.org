/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// The global tab strip owns every registered editor. Panes only select which
// editors are visible; an editor can be selected in at most one pane at a time.
export const MAX_DOCK_PANES = 8;
export const MAX_DOCK_DEPTH = 7;
const MAX_SAVED_NODES = 4096;

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 120;
}

function ratio(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0.15, Math.min(0.85, value)) : 0.5;
}

function visit(root, callback) {
  const pending = root ? [root] : [];
  const seen = new Set();
  while (pending.length && seen.size < MAX_SAVED_NODES) {
    const node = pending.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    callback(node);
    if (node.type === 'split') pending.push(node.second, node.first);
  }
}

export function getDockPanes(layout) {
  const panes = [];
  visit(layout?.root, node => { if (node.type === 'pane') panes.push(node); });
  return panes;
}

export function findDockNode(layout, id) {
  let found = null;
  visit(layout?.root, node => { if (node.id === id && !found) found = node; });
  return found;
}

function idFactory(root) {
  const used = new Set();
  visit(root, node => { if (validId(node.id)) used.add(node.id); });
  return type => {
    let number = 1;
    while (used.has(`dock-${type}-${number}`)) number++;
    const id = `dock-${type}-${number}`;
    used.add(id);
    return id;
  };
}

/** Restore a layout against the current global tabs, including v1 saved layouts. */
export function normalizeDockLayout(saved, tabNames, legacyActive = 'params') {
  const tabs = [...new Set((Array.isArray(tabNames) ? tabNames : [])
    .filter(name => typeof name === 'string' && name.length > 0))];
  const allowed = new Set(tabs);
  const rawRoot = saved?.root ?? (saved?.type ? saved : null);
  const createId = idFactory(rawRoot);
  const usedIds = new Set();
  const usedTabs = new Set();
  const seen = new Set();
  let paneCount = 0;
  const identity = (raw, type) => {
    const id = validId(raw?.id) && !usedIds.has(raw.id) ? raw.id : createId(type);
    usedIds.add(id);
    return id;
  };
  const takeActive = raw => {
    const candidates = [raw?.active, ...(Array.isArray(raw?.tabs) ? raw.tabs : [])];
    const active = candidates.find(tab => allowed.has(tab) && !usedTabs.has(tab));
    if (active !== undefined) usedTabs.add(active);
    return active;
  };
  const pane = (raw, active) => {
    paneCount++;
    return { type: 'pane', id: identity(raw, 'pane'), active };
  };
  const read = (raw, depth = 0) => {
    if (!raw || typeof raw !== 'object' || seen.has(raw)
      || seen.size >= MAX_SAVED_NODES || paneCount >= MAX_DOCK_PANES) return null;
    seen.add(raw);
    if (raw.type === 'pane') {
      const active = takeActive(raw);
      return active === undefined ? null : pane(raw, active);
    }
    if (raw.type !== 'split') return null;
    if (depth >= MAX_DOCK_DEPTH) {
      let active;
      visit(raw, descendant => {
        if (active === undefined && descendant.type === 'pane') active = takeActive(descendant);
      });
      return active === undefined ? null : pane(null, active);
    }
    const first = read(raw.first, depth + 1);
    const second = read(raw.second, depth + 1);
    if (!first || !second) return first || second;
    return {
      type: 'split', id: identity(raw, 'split'),
      axis: raw.axis === 'row' ? 'row' : 'column', ratio: ratio(raw.ratio), first, second,
    };
  };
  const root = read(rawRoot) || (tabs.length ? pane(null, allowed.has(legacyActive) ? legacyActive : tabs[0]) : null);
  const layout = { version: 2, tabs, root, activePaneId: null };
  const panes = getDockPanes(layout);
  layout.activePaneId = panes.some(item => item.id === saved?.activePaneId)
    ? saved.activePaneId : (panes.find(item => item.active === legacyActive) || panes[0])?.id ?? null;
  return layout;
}

function cloneNode(node) {
  if (!node) return null;
  return node.type === 'pane' ? { ...node }
    : { ...node, first: cloneNode(node.first), second: cloneNode(node.second) };
}

function cloneLayout(layout) {
  return { ...layout, tabs: [...layout.tabs], root: cloneNode(layout.root) };
}

function replaceNode(root, id, replacement) {
  if (root.id === id) return replacement;
  if (root.type === 'pane') return root;
  root.first = replaceNode(root.first, id, replacement);
  root.second = replaceNode(root.second, id, replacement);
  if (!root.first || !root.second) return root.first || root.second;
  return root;
}

function nodeDepth(root, id, depth = 0) {
  if (root.id === id) return depth;
  if (root.type === 'pane') return -1;
  const first = nodeDepth(root.first, id, depth + 1);
  return first >= 0 ? first : nodeDepth(root.second, id, depth + 1);
}

function replaceEditor(layout, tabName, paneId) {
  const target = findDockNode(layout, paneId);
  if (target?.type !== 'pane' || !layout.tabs.includes(tabName)) return layout;
  if (target.active === tabName && layout.activePaneId === paneId) return layout;
  const next = cloneLayout(layout);
  const source = getDockPanes(next).find(pane => pane.active === tabName);
  const to = findDockNode(next, paneId);
  if (source && source.id !== to.id) source.active = to.active;
  to.active = tabName;
  next.activePaneId = paneId;
  return next;
}

/** Clicking a global tab replaces the editor in the last-focused pane. */
export function activateDockTab(layout, tabName) {
  return replaceEditor(layout, tabName, layout.activePaneId ?? getDockPanes(layout)[0]?.id);
}

/** Replace a pane's editor, or create an adjacent pane at an edge. */
export function moveDockTab(layout, tabName, targetPaneId, edge = 'center') {
  const target = findDockNode(layout, targetPaneId);
  if (!layout.tabs.includes(tabName) || target?.type !== 'pane'
    || !['center', 'left', 'right', 'top', 'bottom'].includes(edge)) return layout;
  if (edge === 'center') return replaceEditor(layout, tabName, targetPaneId);
  const source = getDockPanes(layout).find(pane => pane.active === tabName);
  if (source?.id === targetPaneId) return layout;

  const next = cloneLayout(layout);
  if (source) next.root = replaceNode(next.root, source.id, null);
  if (getDockPanes(next).length >= MAX_DOCK_PANES
    || nodeDepth(next.root, targetPaneId) >= MAX_DOCK_DEPTH) return layout;
  const createId = idFactory(next.root);
  const other = { type: 'pane', id: createId('pane'), active: tabName };
  const to = findDockNode(next, targetPaneId);
  const before = edge === 'left' || edge === 'top';
  next.root = replaceNode(next.root, targetPaneId, {
    type: 'split', id: createId('split'),
    axis: edge === 'left' || edge === 'right' ? 'row' : 'column', ratio: 0.5,
    first: before ? other : to, second: before ? to : other,
  });
  next.activePaneId = other.id;
  return next;
}

export function setDockRatio(layout, splitId, value) {
  const split = findDockNode(layout, splitId);
  const nextRatio = ratio(value);
  if (split?.type !== 'split' || split.ratio === nextRatio) return layout;
  const next = cloneLayout(layout);
  findDockNode(next, splitId).ratio = nextRatio;
  return next;
}

/** Long-pressing a global tab displays only that editor in a single pane. */
export function flattenDockLayout(layout, tabName) {
  const panes = getDockPanes(layout);
  if (!panes.length) return layout;
  const focused = panes.find(pane => pane.id === layout.activePaneId) || panes[0];
  const active = layout.tabs.includes(tabName) ? tabName : focused.active;
  if (panes.length === 1 && focused.active === active) return layout;
  const root = { type: 'pane', id: focused.id, active };
  return { version: 2, tabs: [...layout.tabs], root, activePaneId: root.id };
}
