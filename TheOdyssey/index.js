/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { registerVisual, registerTab, runVisualApp, exportStateToJSON } from '../helper/visualHelp.js';
import { BrowserOdyssey } from './client.js';
import { setupVideoExport } from './video-ui.js';
import { downloadBlob } from './storage.js';
import { listRuns, canRemoveRun, searchProgress } from './runs.js';
import { DEFAULTS, METHODS, clone, flattenParams, defaultParam, bounds, validate, plan } from './search.js';
let catalog = { apps: [], failures: [] }, settings = clone(DEFAULTS), service = null;
let selectedSession = '', session = null, selectedRun = '', selectedFrame = 0, selectedVisual = '', app, preview = '';
let notice = '', noticeError = false, pollBusy = false, viewedFile = '', crawlWasRunning = false;
let client, startupError = '', frameURLs = [], placeholder = '', viewRequest = 0, runListLimit = 200;
const panels = new Set();
const h = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
};
const button = (text, fn, primary = false) => h('button', { type: 'button', text, className: primary ? 'ody-primary' : '', onclick: () => act(fn) });
const actions = (...buttons) => h('div', { className: 'ody-actions' }, buttons);
const muted = text => h('p', { className: 'ody-muted', text });
const section = (title, ...children) => h('section', { className: 'ody-section' }, [h('h3', { text: title }), ...children]);
const field = (label, input) => { input.setAttribute('aria-label', label); return h('label', { className: 'ody-field' }, [h('span', { text: label }), input]); };
const jsonText = value => JSON.stringify(value, null, 2);
const api = (route, value) => client.request(route, value);
const openVideoExport = setupVideoExport({ getSession: () => session, getVisual: () => selectedVisual, getStorage: () => client.storage });
async function act(fn) {
  try { await fn(); noticeError = false; } catch (error) { notice = error.message; noticeError = true; }
  updateStatus();
}
function download(name, value) {
  const url = URL.createObjectURL(new Blob([jsonText(value) + '\n'], { type: 'application/json' }));
  const anchor = h('a', { href: url, download: name }); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ensureApp(a) {
  const config = settings.apps[a.id] ||= { enabled: false, params: {} };
  for (const p of [...flattenParams(a.params), ...settings.toolbarParams]) config.params[p.key] ||= defaultParam(p);
  return config;
}
function rebuildPanels() {
  for (const panel of panels) {
    if (!panel.isConnected) { panels.delete(panel); continue; }
    fillPanel(panel);
  }
}
function updateStatus() {
  for (const panel of panels) {
    if (!panel.isConnected) continue;
    const status = panel.querySelector('[data-status]');
    status.textContent = notice || (service?.crawling ? service.crawlProgress : session?.message || startupError || 'Ready. Searches run in this page.');
    status.dataset.error = String(!!startupError || noticeError || !!session?.message);
    panel.querySelector('[data-storage]').textContent = service?.output || 'Opening browser storage?';
    const estimate = panel.querySelector('[data-estimate]');
    try { const total = plan(settings, catalog).reduce((sum, j) => sum + j.count, 0); estimate.textContent = total.toLocaleString() + ' runs Â· ' + (total * settings.frames).toLocaleString() + ' SVG frames'; } catch { estimate.textContent = 'Select an app to begin.'; }
    for (const node of panel.querySelectorAll('[data-service]')) node.disabled = !service || service.crawling;
    let blocked = !service ? startupError || 'Opening browser storage?' : service.crawling ? 'Wait for the parameter crawl to finish.' :
      service.active ? 'A search is already active. Pause, resume, or stop it below.' : '';
    if (!blocked) { try { validate(settings, catalog); } catch (error) { blocked = error.message; } }
    const start = panel.querySelector('[data-start]');
    start.disabled = !!blocked;
    start.title = blocked || 'Start the configured search';
    const reason = panel.querySelector('[data-start-reason]');
    reason.textContent = blocked || 'Ready to search.';
    reason.dataset.error = String(!!blocked);
    const progress = panel.querySelector('[data-progress]');
    const counts = searchProgress(session);
    progress.max = counts.total || 1; progress.value = counts.done;
    panel.querySelector('[data-progress-label]').textContent = session ? session.status + ' \u00b7 ' + counts.done + ' / ' + counts.total + ' runs' + (counts.removed ? ' \u00b7 ' + counts.removed + ' removed' : '') : 'No search selected.';
    panel.querySelector('[data-pause]').disabled = session?.status !== 'running';
    panel.querySelector('[data-resume]').disabled = session?.status !== 'paused';
    panel.querySelector('[data-stop]').disabled = !['running', 'paused', 'pausing'].includes(session?.status);
  }
}
function numberField(label, key, target, change = updateStatus, min = 0) {
  return field(label, h('input', { type: 'number', disabled: key === 'samples' && target !== settings && settings.respectParamSamples !== true, value: target[key], ...(min == null ? {} : { min }), step: 'any', onchange: event => { target[key] = event.target.value === '' ? NaN : Number(event.target.value); change(); } }));
}
function paramEditor(a, p) {
  const c = ensureApp(a).params[p.key];
  const row = h('div', { className: 'ody-param' });
  const enabled = h('input', { type: 'checkbox', checked: c.enabled, disabled: p.type === 'button', onchange: () => { c.enabled = enabled.checked; updateStatus(); } });
  row.append(h('label', { className: 'ody-param-title' }, [enabled, document.createTextNode(p.label || p.key)]),
    h('div', { className: 'ody-key', text: a.title + ' / ' + (p.category || 'Parameters') + ' / ' + p.key }),
    muted(p.description || ('Controls ' + (p.label || p.key) + '. This app has not provided a more detailed description.')));
  if (p.shouldShowWhen) row.append(muted('Conditional control: ' + JSON.stringify(p.shouldShowWhen) + '. Indexed even when hidden in the source app.'));
  if (p.type === 'button') { row.append(muted('Action button. Listed for completeness; actions are not permuted.')); return row; }
  if (p.type === 'number') {
    row.append(muted('Declared: ' + (p.min ?? 'unbounded') + ' â†’ ' + (p.max ?? 'unbounded') + ' Â· default ' + p.default));
    const output = h('div', { className: 'ody-bounds' });
    const sync = () => { const b = bounds(p, c); const span = Number.isFinite(p.max - p.min) ? p.max - p.min : c.max - c.min;
      const lower = c.min - b.min, upper = b.max - c.max;
      output.textContent = 'Effective ' + b.min.toPrecision(6) + ' â†’ ' + b.max.toPrecision(6) + ' | below ' + lower.toPrecision(4) + ' (' + (span ? lower / span * 100 : 0).toFixed(1) + '%), above ' + upper.toPrecision(4) + ' (' + (span ? upper / span * 100 : 0).toFixed(1) + '%)';
      updateStatus();
    };
    const grid = h('div', { className: 'ody-grid' }, [
      numberField('Minimum', 'min', c, sync, null), numberField('Maximum', 'max', c, sync, null),
      numberField('Below minimum', 'below', c, sync), numberField('Above maximum', 'above', c, sync),
      field('Extension units', h('select', { onchange: e => { c.extension = e.target.value; sync(); } }, ['percent', 'raw'].map(v => h('option', { value: v, selected: c.extension === v, text: v === 'percent' ? '% of declared span' : 'Raw units' })))),
      numberField('Step (0 = continuous)', 'step', c, sync), numberField('At least samples', 'samples', c, sync, 1),
      numberField('Fixed value when unchecked', 'fixed', c, sync, null),
    ]);
    row.append(grid, output); sync();
  } else {
    row.append(field('Sample choices (JSON array)', h('textarea', { rows: 2, value: JSON.stringify(c.values), onchange: e => act(() => {
      const values = JSON.parse(e.target.value); if (!Array.isArray(values)) throw new Error('Choices must be a JSON array.');
      c.values = values; updateStatus();
    }) })));
    row.append(field('Fixed value when unchecked (JSON)', h('input', { value: JSON.stringify(c.fixed) ?? 'null', onchange: e => act(() => { c.fixed = JSON.parse(e.target.value); }) })));
    row.append(numberField('At least samples', 'samples', c, updateStatus, 1));
  }
  return row;
}
function appList(filter = '') {
  const list = h('div', { className: 'ody-apps' });
  const query = filter.toLowerCase();
  for (const a of catalog.apps) {
    const params = [...flattenParams(a.params), ...settings.toolbarParams];
    const matchesApp = (a.title + ' ' + a.description).toLowerCase().includes(query);
    const found = params.filter(p => matchesApp || (p.key + ' ' + p.label + ' ' + p.description).toLowerCase().includes(query));
    if (!matchesApp && !found.length) continue;
    const config = ensureApp(a);
    const enabled = h('input', { type: 'checkbox', checked: config.enabled, 'aria-label': 'Search ' + a.title,
      onclick: event => event.stopPropagation(), onchange: () => { config.enabled = enabled.checked; updateStatus(); } });
    const detail = h('details', { open: !!query }, [h('summary', {}, [enabled, h('span', { text: a.title + ' Â· ' + params.length + ' controls' })])]);
    let loaded = false;
    const populate = () => {
      if (loaded) return; loaded = true;
      detail.append(muted(a.description), ...(a.captureWarning ? [muted(a.captureWarning)] : []), h('a', { href: a.url, target: '_blank', rel: 'noopener', text: 'Open source app' }),
        actions(button('Sample numeric controls', () => { for (const p of params) config.params[p.key].enabled = p.type === 'number'; rebuildPanels(); }),
          button('Keep all fixed', () => { for (const p of params) config.params[p.key].enabled = false; rebuildPanels(); })));
      for (const p of found) detail.append(paramEditor(a, p));
    };
    detail.addEventListener('toggle', () => { if (detail.open) populate(); });
    if (query) populate();
    list.append(detail);
  }
  return list;
}
function toolbarSnapshot() {
  const state = JSON.parse(exportStateToJSON(app.state));
  const keys = ['__xf', '__propOps', '__scriptOps', '__effects', '__toolFlows'];
  settings.toolbar = Object.fromEntries(keys.filter(k => state[k]).map(k => [k, state[k]]));
  settings.toolbarParams = [];
  const visit = (value, path) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      settings.toolbarParams.push({ key: path, label: path.split('.').slice(-2).join(' / '), type: 'number', default: value,
        category: 'Shared toolbar', description: 'Saved toolbar setting ' + path + '. Bounds are not declared here; enter bounds and enable to sample it.' });
    } else if (value && typeof value === 'object') Object.entries(value).forEach(([key, v]) => visit(v, path ? path + '.' + key : key));
  };
  visit(settings.toolbar, '');
  for (const a of catalog.apps) { const config = ensureApp(a); for (const p of settings.toolbarParams) config.params[p.key] = defaultParam(p); }
  notice = 'Captured toolbar settings and ' + settings.toolbarParams.length + ' numeric fields. Configure their ranges under each app.';
  rebuildPanels();
}
function fillPanel(panel) {
  panel.replaceChildren(h('div', { className: 'ody-eyebrow', text: 'A permutation observatory' }), h('h2', { text: 'The odyssey' }),
    muted('Explore the spaces between your visual settings. Every saved frame carries its source settings.'),
    h('div', { className: 'ody-status', 'data-status': '', role: 'status' }),
    h('p', { className: 'ody-muted', 'data-storage': '' }));
  const method = h('select', { onchange: e => { settings.method = e.target.value; updateStatus(); } },
    Object.entries(METHODS).map(([value, text]) => h('option', { value, text, selected: settings.method === value })));
  panel.append(section('01 Â· Set the course', h('div', { className: 'ody-grid' }, [
    field('Sampling method', method), numberField('Samples per app', 'samples', settings, updateStatus, 1),
    field('Seed', h('input', { disabled: settings.randomizeSeed === true, value: settings.seed, onchange: e => { settings.seed = e.target.value; } })),
    numberField('Maximum total runs', 'maxRuns', settings, updateStatus, 1),
    numberField('Frames per run', 'frames', settings, updateStatus, 1),
    numberField('Compute deadline (ms)', 'computeMs', settings, updateStatus, 10),
    numberField('Frame deadline (ms)', 'frameMs', settings, updateStatus, 10),
    numberField('Simulation time per frame (ms)', 'intervalMs', settings),
    numberField('Capture width', 'width', settings, updateStatus, 100),
    numberField('Capture height', 'height', settings, updateStatus, 100),
  ]), field('New random seed for each search', h('input', { type: 'checkbox', checked: settings.randomizeSeed === true,
    onchange: e => { settings.randomizeSeed = e.target.checked; rebuildPanels(); } })),
  muted('Each app and sample gets its own randomness. Saved searches keep their seed when resumed. Uncheck this option to repeat a search with a specific seed.'),
  field('Use per-parameter sample minimums', h('input', { type: 'checkbox', checked: settings.respectParamSamples === true,
    onchange: e => { settings.respectParamSamples = e.target.checked; rebuildPanels(); } })),
  muted('Samples per app is the run count unless you enable parameter minimums above. Full Cartesian grid uses this many values per numeric parameter and runs every combination.'),
  muted('Stratified covers each interval once per parameter. Ascending starts at all minima; descending starts at maxima. Alternating visits high, low, high, low. Grid tests every combination. Discrete steps can repeat values.'),
  muted('Compute deadline covers source loading and initial rendering. Frame deadline covers each SVG capture and, after the first frame, its simulation time. When a deadline expires, Odyssey cancels that app, keeps earlier frames, and continues the search. Captures require a browser that isolates them from this page, such as desktop Chrome or Edge.'),
  h('div', { 'data-estimate': '', className: 'ody-bounds' })));
  const appSection = section('02 Â· Apps & parameter bounds');
  const input = h('input', { type: 'search', placeholder: 'Find an app, parameter, or description', 'aria-label': 'Filter parameters' });
  let list = appList();
  input.addEventListener('input', () => { const next = appList(input.value); list.replaceWith(next); list = next; });
  appSection.append(muted(catalog.apps.length + ' apps Â· ' + catalog.apps.reduce((n, a) => n + flattenParams(a.params).length, 0) + ' source controls. Check an app to include it. Checked parameters vary; unchecked parameters stay fixed. Source algorithms may still apply their own internal limits.'),
    input, actions(button('Select all apps', () => { catalog.apps.forEach(a => ensureApp(a).enabled = true); rebuildPanels(); }),
      button('Clear selection', () => { catalog.apps.forEach(a => ensureApp(a).enabled = false); rebuildPanels(); }),
      button('Crawl parameters', async () => { await api('crawl', {}); notice = ''; await poll(); })), list);
  // A crawl always uses the source registry, including conditional controls.
  appSection.lastElementChild.previousElementSibling.lastElementChild.setAttribute('data-service', '');
  if (catalog.failures?.length) appSection.append(h('pre', { className: 'ody-code', text: 'Crawl failures:\n' + jsonText(catalog.failures) }));
  panel.append(appSection);
  panel.append(section('03 Â· Toolbar variation', muted('Use the standard transforms, effects, splines, and tool-flow tabs on the preview. Capture that setup to apply it to each source run. Numeric fields from the snapshot can then be sampled per app. Effects must have auto-run enabled to repeat on generated frames.'),
    actions(button('Capture toolbar setup', toolbarSnapshot), button('Clear captured setup', () => { settings.toolbar = {}; settings.toolbarParams = []; notice = 'Toolbar snapshot cleared.'; rebuildPanels(); })),
    muted(settings.toolbarParams.length + ' toolbar fields indexed. Current searches keep their own immutable snapshot.')));
  const start = button('Start search', async () => {
    validate(settings, catalog); const result = await api('start', settings);
    settings.seed = client.settings.seed; rebuildPanels();
    selectedSession = result.id; selectedRun = ''; selectedVisual = ''; runListLimit = 200; notice = client.storage.directory ? 'Search started; saving JSON and SVGs to your output folder.' : 'Search started; saving in this browser. Choose an output folder or download the search ZIP to keep disk files.'; await poll();
  }, true); start.setAttribute('data-start', '');
  const save = button('Save settings to disk', async () => { validate(settings, catalog); await api('settings', settings); if (!client.storage.directory) download('odyssey-settings.json', settings); notice = client.storage.directory ? 'Saved odyssey-settings.json in ' + client.storage.directory.name + '.' : 'Downloaded odyssey-settings.json; also saved in this browser.'; }); save.setAttribute('data-service', '');
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: e => act(async () => {
    const value = JSON.parse(await e.target.files[0].text());
    validate(value, catalog); settings = { ...clone(DEFAULTS), ...clone(value) }; catalog.apps.forEach(ensureApp); notice = 'Settings imported. Save to disk to keep this setup.'; rebuildPanels();
  }) });
  panel.append(section('04 Â· Search & save', h('p', { className: 'ody-status', 'data-start-reason': '', role: 'status' }), actions(start, save), actions(button('Choose output folder', async () => { await client.chooseDirectory(); await api('settings', settings); notice = 'Output folder connected. New frames save there automatically; use Save selected search to folder for earlier frames.'; await poll(); })), actions(button('Export settings JSON', () => download('odyssey-settings.json', settings)),
    button('Import settings JSON', () => file.click())), file, h('progress', { className: 'ody-progress', 'data-progress': '' }),
    h('p', { 'data-progress-label': '' }),
    actions(...[['Pause', 'pause'], ['Resume', 'resume'], ['Stop', 'stop']].map(([label, route]) => {
      const b = button(label, async () => { await api(route, { id: selectedSession }); notice = route === 'pause' ? 'Pausing after the current frame.' : ''; await poll(); });
      b.setAttribute('data-' + route, ''); return b;
    }))));
  panel.append(section('05 Â· Saved runs', h('select', { 'aria-label': 'Saved searches', 'data-sessions': '', onchange: e => act(async () => {
    selectedSession = e.target.value; selectedRun = ''; selectedVisual = ''; runListLimit = 200; await poll();
  }) }), h('div', { className: 'ody-runs', 'data-runs': '' }), h('pre', { className: 'ody-code', 'data-run-details': '' }),
    actions(button('Render video', openVideoExport), button('Download search ZIP', async () => {
      if (!session) throw new Error('Choose a saved search first.');
      downloadBlob(session.id + '.zip', await client.storage.exportSearch(session)); notice = 'Search ZIP downloaded.';
    }), button('Save selected search to folder', async () => {
      if (!session) throw new Error('Choose a saved search first.');
      await client.storage.copySearch(session); notice = 'Saved this search to ' + client.storage.directory.name + '.';
    })),
    button('Use selected search settings', () => {
      if (!session) throw new Error('Choose a saved search first.');
      settings = { ...clone(DEFAULTS), ...clone(session.settings) }; catalog.apps.forEach(ensureApp);
      notice = 'Loaded the saved search settings for another search.'; rebuildPanels();
    })));
  updateSessions(panel); updateRuns(panel); updateStatus();
}
function updateSessions(panel) {
  const select = panel.querySelector('[data-sessions]');
  const options = service?.sessions || [];
  const key = options.map(s => s.id + s.status).join();
  if (select.dataset.key !== key) {
    select.replaceChildren(h('option', { value: '', text: 'Choose a saved search' }),
      ...options.map(s => h('option', { value: s.id, text: s.startedAt.slice(0, 19).replace('T', ' ') + ' Â· ' + s.status })));
    select.dataset.key = key;
  }
  select.value = selectedSession;
}
function visibleRuns() {
  return listRuns(session).filter(run => !selectedVisual || run.app === selectedVisual);
}
function jumpMessage(message = '') {
  document.getElementById('run-jump-message').textContent = message;
  document.getElementById('run-number').setAttribute('aria-invalid', String(!!message));
}
function updateRunSelectors(runs, run) {
  const select = document.getElementById('inspect-visual');
  const counts = new Map();
  for (const item of runs) counts.set(item.app, (counts.get(item.app) || 0) + 1);
  const options = session ? plan(session.settings, session.catalog).map(({ app }) => ({
    value: app.id, text: app.title + ' (' + (counts.get(app.id) || 0) + ' runs)',
  })) : [];
  const key = JSON.stringify([session?.id, runs.length, options]);
  if (select.dataset.key !== key) {
    select.replaceChildren(h('option', { value: '', text: 'All visuals (' + runs.length + ' runs)' }),
      ...options.map(option => h('option', option)));
    select.dataset.key = key;
  }
  select.value = selectedVisual; select.disabled = !session;
  const input = document.getElementById('run-number');
  input.max = session?.total || 1; input.disabled = !session;
  input.placeholder = session ? '1-' + session.total : '';
  const selection = (session?.id || '') + '/' + (run?.id || '');
  if (input.dataset.selection !== selection) {
    input.dataset.selection = selection; input.value = run ? run.ordinal + 1 : ''; jumpMessage();
  }
  document.getElementById('go-to-run').disabled = !session;
}
async function inspectVisual(id) {
  selectedVisual = id; runListLimit = 200; jumpMessage();
  const runs = visibleRuns();
  if (!runs.some(run => run.id === selectedRun)) {
    selectedRun = (runs.find(run => run.frames.length) || runs[0])?.id || ''; selectedFrame = 0;
  }
  await showFrame();
  for (const panel of panels) if (panel.isConnected) updateRuns(panel);
}
async function jumpToRun() {
  if (!session) return;
  const input = document.getElementById('run-number'), raw = input.value.trim(), number = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number) || number < 1 || number > session.total) {
    jumpMessage('Enter a run number from 1 to ' + session.total + '.'); return;
  }
  const run = listRuns(session).find(run => run.ordinal === number - 1);
  if (!run) { jumpMessage('Run ' + number + ' was removed from this search.'); return; }
  // Run numbers always refer to the whole search, even while an app is filtered.
  if (selectedVisual && selectedVisual !== run.app) { selectedVisual = run.app; runListLimit = 200; }
  await selectRun(run.id);
  if (selectedRun === run.id) input.value = number;
}
async function selectRun(id) {
  if (!listRuns(session).some(run => run.id === id)) return;
  selectedRun = id; selectedFrame = 0; jumpMessage();
  await showFrame();
  for (const panel of panels) if (panel.isConnected) updateRuns(panel);
}
function adjacentRun(direction) {
  const runs = visibleRuns(), ordinal = runs.find(run => run.id === selectedRun)?.ordinal ?? -1;
  return direction < 0 ? runs.findLast(run => run.ordinal < ordinal && run.frames.length) : runs.find(run => run.ordinal > ordinal && run.frames.length);
}
async function removeRun(id) {
  const searchId = session?.id, runs = visibleRuns(), index = runs.findIndex(run => run.id === id);
  if (index < 0) return;
  await api('delete-run', { id: searchId, runId: id });
  if (selectedSession !== searchId) return;
  session = await api('session/' + searchId);
  const remaining = visibleRuns();
  if (selectedRun === id) { selectedRun = remaining[Math.min(index, remaining.length - 1)]?.id || ''; selectedFrame = 0; }
  notice = client.storage.directory ? 'Run removed, including its saved files in the connected folder.' : 'Run removed. Reconnect its output folder to also remove any disk copy.';
  service = await api('status');
  await showFrame();
  for (const panel of panels) if (panel.isConnected) { updateSessions(panel); updateRuns(panel); }
}
function updateRuns(panel) {
  const root = panel.querySelector('[data-runs]'), runs = visibleRuns();
  const key = (session?.id || '') + ':' + selectedVisual + ':' + selectedRun + ':' + runListLimit + ':' + runs.map(r => r.id + r.status + r.frames.length).join();
  if (root.dataset.key === key) return;
  root.dataset.key = key;
  const selectedIndex = runs.findIndex(run => run.id === selectedRun);
  const listed = runs.slice(0, runListLimit);
  // A distant jump must not create thousands of buttons just to show selection.
  if (selectedIndex >= runListLimit) listed.push(runs[selectedIndex]);
  root.replaceChildren(...listed.map(run => {
    const open = h('button', { className: 'ody-run', type: 'button', 'aria-pressed': String(run.id === selectedRun),
      onclick: () => act(() => selectRun(run.id)) },
      [h('span', { text: 'Run ' + (run.ordinal + 1) + ' \u00b7 ' + run.title + ' \u00b7 sample ' + run.sample }),
        h('small', { text: run.status + ' \u00b7 ' + run.frames.length + ' frames' + (run.error ? ' \u00b7 ' + run.error.split('\n')[0] : '') })]);
    const row = h('div', { className: 'ody-run-row', 'data-run-id': run.id }, [open]);
    if (canRemoveRun(run)) row.append(h('button', { type: 'button', className: 'ody-delete-run', text: '\u00d7',
      'aria-label': 'Delete ' + run.title + ' sample ' + run.sample, title: 'Remove this ' + run.status + ' run',
      onclick: () => act(() => removeRun(run.id)) }));
    return row;
  }));
  if (runs.length > listed.length) root.append(button('Show more runs (' + (runs.length - listed.length) + ' remaining)', () => {
    runListLimit += 200; for (const panel of panels) if (panel.isConnected) updateRuns(panel);
  }));
  const run = runs.find(r => r.id === selectedRun);
  panel.querySelector('[data-run-details]').textContent = run ? jsonText({ status: run.status, requested: run.requested,
    error: run.error, frameErrors: run.frames.flatMap(f => f.errors || []) }) : 'Select a run to inspect its saved SVG and sampled values.';
}
function cleanSVG(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid saved SVG.');
  doc.querySelectorAll('script,foreignObject,iframe,object,embed,style').forEach(n => n.remove());
  for (const n of doc.querySelectorAll('*')) for (const a of [...n.attributes]) {
    if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !a.value.startsWith('#') && !a.value.startsWith('data:image/'))) n.removeAttribute(a.name);
  }
  return doc.documentElement;
}
function releaseFrameURLs() {
  frameURLs.forEach(URL.revokeObjectURL); frameURLs = [];
}
function renderPreview(svg) {
  preview = svg;
  // Saved SVGs already contain the search tools. Opening a new preview must
  // not apply those same operations twice.
  app.state.__xf = { ui: { preset: 'none', splitCount: 1, activeTile: '0', rotateDeg: 90 }, stack: [] };
  app.state.__propOps = { stack: [] };
  app.state.__scriptOps = { stack: [] };
  app.state.__effects = { ui: { autoRun: false } };
  app.state.__toolFlows = { stages: [], ui: {} };
  app.refresh(); app.rebuildUI();
}
async function showFrame() {
  const request = ++viewRequest, runs = listRuns(session), run = runs.find(r => r.id === selectedRun);
  updateRunSelectors(runs, run);
  document.getElementById('frame-bar').hidden = !session;
  document.getElementById('previous-run').disabled = !adjacentRun(-1);
  document.getElementById('next-run').disabled = !adjacentRun(1);
  document.getElementById('run-label').textContent = run ? 'Run ' + (run.ordinal + 1) + ' / ' + session.total : 'No runs';
  document.getElementById('delete-run').hidden = !canRemoveRun(run);
  selectedFrame = Math.max(0, Math.min(selectedFrame, (run?.frames.length || 0) - 1));
  document.getElementById('frame-label').textContent = run?.frames.length ? 'Frame ' + (selectedFrame + 1) + ' / ' + run.frames.length : 'No saved frames';
  document.getElementById('previous-frame').disabled = !run?.frames.length || selectedFrame === 0;
  document.getElementById('next-frame').disabled = !run?.frames.length || selectedFrame === run.frames.length - 1;
  for (const id of ['download-frame', 'download-state']) document.getElementById(id).hidden = !run?.frames.length;
  if (!run?.frames.length) {
    const key = (session?.id || '') + '/' + (run?.id || '') + '/empty';
    if (viewedFile !== key) { viewedFile = key; releaseFrameURLs(); renderPreview(placeholder); }
    for (const id of ['download-frame', 'download-state']) document.getElementById(id).removeAttribute('href');
    document.getElementById('preview-title').textContent = run ? run.title + ' \u00b7 sample ' + run.sample : 'No runs selected.';
    document.getElementById('preview-detail').textContent = run ? (run.error || (run.status === 'pending' ? 'This run has not started. Use \u00d7 to remove it from the queue.' : run.status + ' \u00b7 no saved frames.')) : (selectedVisual ? 'No remaining runs for this visual. Choose another visual.' : 'Choose a search or start a new one.');
    return;
  }
  const frame = run.frames[selectedFrame], key = session.id + '/' + frame.file;
  if (viewedFile === key) return;
  const [svg, state] = await Promise.all([client.storage.read(session.id, frame.file), client.storage.read(session.id, frame.file.replace(/\.svg$/, '.json'))]);
  const text = await svg.text();
  // Rapid next/back clicks may finish their file reads out of order.
  if (request !== viewRequest) return;
  cleanSVG(text); releaseFrameURLs();
  frameURLs = [URL.createObjectURL(svg), URL.createObjectURL(state)];
  for (const [index, id] of ['download-frame', 'download-state'].entries()) {
    const anchor = document.getElementById(id); anchor.href = frameURLs[index];
    anchor.download = run.id + '-' + frame.file.split('/').pop().replace(/\.svg$/, index ? '.json' : '.svg');
  }
  viewedFile = key; renderPreview(text);
  document.getElementById('preview-title').textContent = run.title + ' \u00b7 ' + run.id;
  document.getElementById('preview-detail').textContent = frame.file + ' \u00b7 ' + (frame.bytes / 1024).toFixed(1) + ' KB saved';
}
async function poll() {
  if (pollBusy) return; pollBusy = true;
  try {
    service = await api('status');
    try {
      if (crawlWasRunning && !service.crawling) { catalog = await api('catalog'); catalog.apps.forEach(ensureApp); rebuildPanels(); }
      crawlWasRunning = service.crawling;
      if (!selectedSession && service.sessions.length) selectedSession = service.sessions[0].id;
      if (selectedSession) {
        const id = selectedSession, next = await api('session/' + id);
        if (id !== selectedSession) return;
        session = next;
        const runs = visibleRuns();
        if (!runs.some(run => run.id === selectedRun)) { selectedRun = (runs.find(run => run.frames.length) || runs[0])?.id || ''; selectedFrame = 0; }
        await showFrame();
      }
      for (const panel of panels) if (panel.isConnected) { updateSessions(panel); updateRuns(panel); }
    } catch (error) { notice = 'Saved data could not be loaded: ' + error.message; noticeError = true; }
  } finally { pollBusy = false; updateStatus(); }
}
try {
  client = await new BrowserOdyssey().open();
  service = await api('status');
  [catalog, settings] = await Promise.all([api('catalog'), api('settings')]);
} catch (error) {
  startupError = 'Browser storage could not open: ' + error.message;
  [catalog, settings] = await Promise.all([fetch('./catalog.json').then(r => r.json()), fetch('./default-settings.json').then(r => r.json())]);
}
settings = { ...clone(DEFAULTS), ...settings };
catalog.apps.forEach(ensureApp);
placeholder = preview = await (await fetch('./odyssey.svg')).text();
registerTab('odyssey', () => {
  const panel = h('div', { className: 'odyssey-panel' });
  panels.add(panel); fillPanel(panel); return panel;
});
registerVisual('theOdyssey', {
  title: 'The odyssey', description: 'Search visual parameter spaces and review the saved SVGs.', params: [],
  create({ mountEl }) { return { render() { mountEl.replaceChildren(document.importNode(cleanSVG(preview), true)); }, destroy() { mountEl.replaceChildren(); } }; },
});
app = runVisualApp({ visualId: 'theOdyssey', mountEl: document.getElementById('vis'), uiEl: document.getElementById('config'),
  state: { __ui: { configPinned: true, configWidth: 560, activeTab: 'odyssey' } } });
document.getElementById('previous-frame').onclick = () => act(async () => { selectedFrame--; await showFrame(); });
document.getElementById('next-frame').onclick = () => act(async () => { selectedFrame++; await showFrame(); });
document.getElementById('previous-run').onclick = () => act(async () => { const run = adjacentRun(-1); if (run) await selectRun(run.id); });
document.getElementById('next-run').onclick = () => act(async () => { const run = adjacentRun(1); if (run) await selectRun(run.id); });
document.getElementById('delete-run').onclick = () => act(() => removeRun(selectedRun));
document.getElementById('inspect-visual').onchange = event => act(() => inspectVisual(event.target.value));
document.getElementById('run-jump').onsubmit = event => { event.preventDefault(); act(jumpToRun); };
document.getElementById('run-number').oninput = () => jumpMessage();
document.getElementById('export-video').onclick = openVideoExport;
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--odyssey-controls-height', document.getElementById('frame-bar').getBoundingClientRect().height + 'px');
}).observe(document.getElementById('frame-bar'));
if (client) { await poll(); setInterval(poll, 1000); }

