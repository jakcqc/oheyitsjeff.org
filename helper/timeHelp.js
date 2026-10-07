/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { registerTab } from './visualHelp.js';
import { subscribeAnimation } from './animationHelp.js';
import { DEFAULT_TIME_CONFIG, normalizeTimeConfig, layoutSnapshots, getTimeCapacity } from './timeModel.js';
import { captureTimeSnapshot, makeTimeComposition } from './timeSvg.js';
import { createTimeSampler } from './timeSampling.js';

const sessions = new WeakMap();
const NS = 'http://www.w3.org/2000/svg';
let nextSnapshot = 0;
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function getSession(ctx) {
  let session = sessions.get(ctx.state);
  if (session) { session.ctx = ctx; return session; }
  let config;
  try { config = normalizeTimeConfig(ctx.state.__time || {}); }
  catch { config = { ...DEFAULT_TIME_CONFIG }; }
  session = { ctx, config, snapshots: [], selected: null, message: 'Take a snapshot to start.', listeners: new Set() };
  session.emit = () => session.listeners.forEach(listener => listener());
  session.setMessage = message => { session.message = message; session.emit(); };
  session.capture = (capturedAt = null, replace = false) => {
    const before = replace ? [] : session.snapshots;
    if (before.length >= getTimeCapacity(session.config)) throw new Error('The layout is full. Increase the grid or remove a snapshot.');
    const svg = session.ctx.mountEl.querySelector('svg');
    if (!svg) throw new Error('There is no SVG to capture. Enable rendering first.');
    const snapshot = captureTimeSnapshot(svg, { id: `time-${++nextSnapshot}`, capturedAt });
    const next = [...before, snapshot];
    if (next.reduce((size, item) => size + item.svg.length, 0) > 32 * 1024 * 1024) throw new Error('This composition is too large. Download it and clear snapshots before capturing more.');
    layoutSnapshots(session.config, next); // Validate before replacing any work.
    session.snapshots = next;
    session.selected = snapshot.id;
    return snapshot;
  };
  session.sampler = createTimeSampler({
    begin(options) {
      const count = options.sampleMode === 'replace' ? 0 : session.snapshots.length;
      if (count >= getTimeCapacity(session.config)) throw new Error('The layout is full. Clear it or use Replace snapshots.');
    },
    capture({ elapsedSec, index, options }) { session.capture(elapsedSec, index === 0 && options.sampleMode === 'replace'); },
    notify: message => session.setMessage(message),
  });
  // The session owns this subscription, so hiding/rebuilding a panel cannot
  // interrupt sampling. State and its runtime are weakly held by their owners.
  subscribeAnimation(ctx, event => session.sampler.handle(event));
  sessions.set(ctx.state, session);
  return session;
}

export function registerTimeTab() { registerTab('Time', buildTimePanel); }

export function buildTimePanel(ctx) {
  if (!document.querySelector('link[data-time-styles]')) {
    const link = element('link'); link.rel = 'stylesheet';
    link.href = new URL('./timeHelp.css', import.meta.url).href; link.dataset.timeStyles = '';
    document.head.append(link);
  }
  const session = getSession(ctx);
  const root = element('section', 'time-panel');
  root.dataset.timePanel = '';
  const heading = element('div', 'time-heading');
  heading.append(element('strong', '', 'Time'), element('p', 'time-help', 'Collect moments from your visual into one SVG.'));
  const status = element('p', 'time-status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const count = element('span', 'time-count');
  const actions = element('div', 'time-actions');
  const button = (label, action, parent = actions) => {
    const node = element('button', '', label); node.type = 'button';
    node.onclick = () => { try { action(); } catch (error) { session.setMessage(error.message); } };
    parent.append(node); return node;
  };
  const take = button('Take snapshot', () => { session.capture(); session.setMessage('Snapshot added.'); });
  take.classList.add('time-primary');
  const save = button('Download SVG', () => {
    const svg = makeTimeComposition(session.config, session.snapshots, layoutSnapshots(session.config, session.snapshots));
    const source = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
    const link = element('a'); link.href = url; link.download = `${ctx.visualId || 'visual'}-time.svg`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    session.setMessage('Composition downloaded as SVG.');
  });
  const clear = button('Clear snapshots', () => {
    session.snapshots = []; session.selected = null; session.setMessage('Snapshots cleared.');
  });
  const settings = element('fieldset', 'time-settings');
  settings.append(element('legend', '', 'Placement'));
  const controls = new Map();
  const field = (parent, label, key, { type = 'number', min, max, step = 'any', options } = {}) => {
    const wrap = element('label', 'time-field'); wrap.append(element('span', '', label));
    const input = element(options ? 'select' : 'input');
    input.setAttribute('aria-label', label);
    if (options) for (const [value, title] of options) {
      const option = element('option', '', title); option.value = value; input.append(option);
    } else {
      input.type = type; if (type === 'number') input.step = step;
      if (min !== undefined) input.min = min; if (max !== undefined) input.max = max;
    }
    controls.set(key, input); wrap.append(input); parent.append(wrap);
    input.onchange = () => {
      const value = type === 'number' && !options ? input.valueAsNumber : input.value;
      try {
        const next = normalizeTimeConfig({ ...session.config, [key]: value });
        let snapshots = session.snapshots;
        if (key === 'layout' && value === 'free') {
          const placements = layoutSnapshots(session.config, snapshots);
          snapshots = snapshots.map((snapshot, i) => ({ ...snapshot,
            placement: { x: placements[i].x + placements[i].width / 2, y: placements[i].y + placements[i].height / 2, scale: placements[i].width / (session.config.size * snapshot.width / Math.max(snapshot.width, snapshot.height)) } }));
        }
        layoutSnapshots(next, snapshots);
        session.snapshots = snapshots; session.config = next;
        ctx.state.__time = { ...next }; ctx.onStateChange?.();
        session.setMessage('Placement updated.');
      } catch (error) { session.setMessage(error.message); }
    };
    return wrap;
  };
  field(settings, 'Layout', 'layout', { options: [['grid','Grid'],['circle','Circle'],['square','Square'],['triangle','Triangle'],['polygon','Polygon'],['free','Free placement'],['function','Functions: X, Y, scale']] });
  const canvasFields = element('div', 'time-fields'); settings.append(canvasFields);
  field(canvasFields, 'Canvas width', 'width', { min: 1 }); field(canvasFields, 'Canvas height', 'height', { min: 1 });
  const gridFields = element('div', 'time-fields'); settings.append(gridFields);
  field(gridFields, 'Columns', 'columns', { min: 1, max: 400, step: 1 }); field(gridFields, 'Rows', 'rows', { min: 1, max: 400, step: 1 });
  field(gridFields, 'Gap', 'gap', { min: 0 });
  const sizeFields = element('div', 'time-fields'); settings.append(sizeFields);
  field(sizeFields, 'Snapshot size', 'size', { min: 1 });
  const shapeFields = element('div', 'time-fields'); settings.append(shapeFields);
  field(shapeFields, 'Radius', 'radius', { min: 0 }); field(shapeFields, 'Rotation (degrees)', 'rotation');
  const sidesField = field(shapeFields, 'Polygon sides', 'sides', { min: 3, max: 400, step: 1 });
  const formulaFields = element('div', 'time-formulas'); settings.append(formulaFields);
  field(formulaFields, 'X(i)', 'xExpression', { type: 'text' }); field(formulaFields, 'Y(i)', 'yExpression', { type: 'text' });
  field(formulaFields, 'Scale(i)', 'scaleExpression', { type: 'text' });
  formulaFields.append(element('p', 'time-help', 'X and Y give the snapshot center in canvas units. Scale must be positive. i = order starting at 0; n = snapshot count; t = i / max(1, n − 1); W/H = canvas size. Use pi, e, + − * / % ^, sin, cos, tan, atan2, sqrt, abs, floor, ceil, round, min, max, pow, exp, log.'));
  const sampling = element('fieldset', 'time-settings'); sampling.append(element('legend', '', 'Animation sampling'));
  const sampleFields = element('div', 'time-fields'); sampling.append(sampleFields);
  field(sampleFields, 'Start at (seconds)', 'sampleStart', { min: 0 });
  field(sampleFields, 'Every (seconds)', 'sampleInterval', { min: 0.001, step: 0.1 });
  field(sampleFields, 'Number of samples', 'sampleCount', { min: 1, max: 400, step: 1 });
  field(sampling, 'On next run', 'sampleMode', { options: [['append','Append snapshots'],['replace','Replace snapshots']] });
  const schedule = element('p', 'time-help'); sampling.append(schedule);
  const armWrap = element('label', 'time-arm'); const arm = element('input'); arm.type = 'checkbox';
  arm.setAttribute('aria-label', 'Sample next animation run'); armWrap.append(arm, document.createTextNode('Sample next animation run')); sampling.append(armWrap);
  arm.onchange = () => {
    try {
      if (arm.checked) {
        const remaining = getTimeCapacity(session.config) - (session.config.sampleMode === 'replace' ? 0 : session.snapshots.length);
        if (remaining <= 0) throw new Error('The layout is full. Clear it or choose Replace snapshots.');
        session.sampler.arm(session.config);
      } else session.sampler.cancel();
    } catch (error) { session.setMessage(error.message); }
  };
  const stopSampling = button('Cancel sampling', () => session.sampler.cancel(), sampling);
  sampling.append(element('p', 'time-help', 'Arm, then press Play or Restart in Animate (P / R). Sampling turns off after that run. Pause keeps your place. Each sample uses the first rendered frame at or after its time; slow frames can skip samples. A full grid stops capture.'));
  const preview = element('div', 'time-preview'); preview.setAttribute('aria-label', 'Time composition preview');
  const previewHelp = element('p', 'time-help');
  const selection = element('div', 'time-selection');
  const selectedLabel = element('strong'); selection.append(selectedLabel);
  const selectionActions = element('div', 'time-actions'); selection.append(selectionActions);
  const moveSelected = direction => {
    const index = session.snapshots.findIndex(item => item.id === session.selected), to = index + direction;
    if (index < 0 || to < 0 || to >= session.snapshots.length) return;
    reorder(index, to);
  };
  const earlier = button('Move earlier', () => moveSelected(-1), selectionActions);
  const later = button('Move later', () => moveSelected(1), selectionActions);
  const remove = button('Remove snapshot', () => {
    const next = session.snapshots.filter(item => item.id !== session.selected);
    layoutSnapshots(session.config, next); session.snapshots = next; session.selected = next.at(-1)?.id || null;
    session.setMessage('Snapshot removed.');
  }, selectionActions);
  const freeFields = element('div', 'time-fields'); selection.append(freeFields);
  const freeControls = new Map();
  for (const [key, label] of [['x','Snapshot X'],['y','Snapshot Y'],['scale','Snapshot scale']]) {
    const wrap = element('label', 'time-field'), input = element('input'); input.type = 'number'; input.step = 'any'; input.setAttribute('aria-label', label);
    wrap.append(element('span','',label), input); freeFields.append(wrap); freeControls.set(key, input);
    input.onchange = () => {
      try {
        const index = session.snapshots.findIndex(item => item.id === session.selected), item = session.snapshots[index];
        if (!item) return;
        const place = layoutSnapshots(session.config, session.snapshots)[index];
        const position = item.placement || { x: place.x + place.width / 2, y: place.y + place.height / 2, scale: place.scale };
        const next = session.snapshots.map((snapshot, i) => i === index ? { ...snapshot, placement: { ...position, [key]: input.valueAsNumber } } : snapshot);
        layoutSnapshots(session.config, next); session.snapshots = next; session.setMessage('Snapshot moved.');
      } catch (error) { session.setMessage(error.message); }
    };
  }
  const list = element('ol', 'time-snapshots'); list.setAttribute('aria-label', 'Snapshot order');
  root.append(heading, count, actions, status, preview, previewHelp, selection, list, settings, sampling,
    element('p','time-help','Snapshots stay in this page until you clear or reload it. Download SVG to keep the composition.'));
  let drag = null, previewSVG = null, placements = [], destroyed = false, visible = true;
  function reorder(from, to) {
    const next = [...session.snapshots]; const [item] = next.splice(from, 1); next.splice(to, 0, item);
    layoutSnapshots(session.config, next); session.snapshots = next; session.setMessage('Snapshot order updated.');
  }
  function point(event) {
    const matrix = previewSVG?.getScreenCTM(); if (!matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  }
  preview.addEventListener('pointerdown', event => {
    if (event.button !== 0 || session.sampler.running) return;
    const target = event.target.closest('[data-time-index]'); if (!target) return;
    const index = Number(target.dataset.timeIndex), start = point(event); if (!start) return;
    session.selected = session.snapshots[index].id;
    drag = { index, start, current: start, pointerId: event.pointerId, target, originalTransform: target.getAttribute('transform') || '', moved: false };
    preview.setPointerCapture(event.pointerId); event.preventDefault();
  });
  preview.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = point(event); if (!current) return;
    drag.current = current; const dx = current.x - drag.start.x, dy = current.y - drag.start.y;
    drag.moved ||= Math.hypot(dx, dy) > 3;
    if (drag.moved) drag.target.setAttribute('transform', `translate(${dx} ${dy}) ${drag.originalTransform}`);
  });
  const finishDrag = (event, cancel = false) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = point(event) || drag.current, { index, start, moved } = drag; drag = null;
    if (preview.hasPointerCapture(event.pointerId)) preview.releasePointerCapture(event.pointerId);
    if (cancel || !moved) { session.emit(); return; }
    try {
      if (session.config.layout === 'free') {
        const place = placements[index], item = session.snapshots[index];
        const placement = { x: place.x + place.width / 2 + current.x - start.x, y: place.y + place.height / 2 + current.y - start.y, scale: place.scale };
        const next = session.snapshots.map((snapshot,i) => i === index ? { ...item, placement } : snapshot);
        layoutSnapshots(session.config,next); session.snapshots = next; session.setMessage('Snapshot moved.');
      } else {
        let nearest = index, distance = Infinity;
        placements.forEach((place, i) => {
          const d = Math.hypot(current.x - place.x - place.width / 2, current.y - place.y - place.height / 2);
          if (d < distance) { nearest = i; distance = d; }
        });
        reorder(index, nearest);
      }
    } catch (error) { session.setMessage(error.message); }
  };
  preview.addEventListener('pointerup', event => finishDrag(event));
  preview.addEventListener('pointercancel', event => finishDrag(event, true));
  function render() {
    if (destroyed || drag || !visible) return;
    const config = session.config, running = session.sampler.running;
    for (const [key, input] of controls) { input.value = String(config[key]); input.disabled = running || session.sampler.armed; }
    settings.disabled = running || session.sampler.armed;
    gridFields.hidden = config.layout !== 'grid'; sizeFields.hidden = config.layout === 'grid';
    shapeFields.hidden = !['circle','square','triangle','polygon'].includes(config.layout);
    sidesField.hidden = config.layout !== 'polygon'; formulaFields.hidden = config.layout !== 'function';
    take.disabled = running || session.snapshots.length >= getTimeCapacity(config); save.disabled = !session.snapshots.length;
    clear.disabled = running || !session.snapshots.length;
    arm.checked = session.sampler.armed; arm.disabled = running; stopSampling.hidden = !running && !session.sampler.armed;
    schedule.textContent = `${config.sampleCount} samples from ${config.sampleStart}s to ${Number((config.sampleStart + (config.sampleCount - 1) * config.sampleInterval).toFixed(4))}s.`;
    count.textContent = `${session.snapshots.length} / ${getTimeCapacity(config)} snapshots`;
    status.textContent = session.message;
    placements = layoutSnapshots(config, session.snapshots);
    previewSVG = makeTimeComposition(config, session.snapshots, placements);
    previewSVG.setAttribute('aria-label','Snapshot composition');
    if (config.layout === 'grid') {
      const guides = document.createElementNS(NS,'g'); guides.setAttribute('class','time-guides'); guides.setAttribute('pointer-events','none');
      const width = (config.width - (config.columns - 1) * config.gap) / config.columns;
      const height = (config.height - (config.rows - 1) * config.gap) / config.rows;
      for (let i = 0; i < getTimeCapacity(config); i++) {
        const rect = document.createElementNS(NS,'rect');
        for (const [key,value] of Object.entries({x:(i % config.columns)*(width+config.gap), y:Math.floor(i/config.columns)*(height+config.gap), width,height,fill:'none',stroke:'#77818d','stroke-width':1,'vector-effect':'non-scaling-stroke','stroke-dasharray':'4 4'})) rect.setAttribute(key,value);
        guides.append(rect);
      }
      previewSVG.prepend(guides);
    }
    for (const group of previewSVG.querySelectorAll('[data-time-index]')) {
      const i = Number(group.dataset.timeIndex), place = placements[i];
      // A transparent hit area makes white space inside a snapshot draggable.
      const hit = document.createElementNS(NS,'rect');
      for (const [key,value] of Object.entries({x:place.x,y:place.y,width:place.width,height:place.height,fill:'transparent',stroke:session.snapshots[i].id === session.selected ? '#8dc9ff' : 'none','stroke-width':2,'vector-effect':'non-scaling-stroke'})) hit.setAttribute(key,value);
      group.append(hit); group.style.cursor = config.layout === 'free' ? 'move' : 'grab';
    }
    preview.replaceChildren(previewSVG);
    previewHelp.textContent = config.layout === 'free' ? 'Drag a snapshot to place it. Select one to set its position and scale.' : 'Drag a snapshot onto another position to reorder. You can also select one below and move it earlier or later.';
    const index = session.snapshots.findIndex(item => item.id === session.selected), item = session.snapshots[index];
    selection.hidden = !item; selectedLabel.textContent = item ? `Snapshot ${index + 1}${item.capturedAt == null ? '' : ` · ${Number(item.capturedAt.toFixed(3))}s`}` : '';
    earlier.disabled = running || index <= 0; later.disabled = running || index < 0 || index >= session.snapshots.length - 1; remove.disabled = running;
    freeFields.hidden = config.layout !== 'free';
    if (item) {
      const place = placements[index], position = { x:place.x+place.width/2,y:place.y+place.height/2,scale:place.scale };
      for (const [key,input] of freeControls) { input.value = String(Number(position[key].toFixed(4))); input.disabled = running; }
    }
    list.replaceChildren();
    session.snapshots.forEach((snapshot, i) => {
      const row = element('li'), node = element('button','',`${i+1}${snapshot.capturedAt == null ? '' : ` · ${Number(snapshot.capturedAt.toFixed(3))}s`}`);
      node.type = 'button'; node.setAttribute('aria-label',`Select snapshot ${i+1}`); node.setAttribute('aria-pressed',String(snapshot.id === session.selected));
      node.onclick = () => { session.selected = snapshot.id; session.emit(); };
      row.draggable = !running; row.dataset.timeOrder = i;
      row.ondragstart = event => { event.dataTransfer.setData('application/x-time-snapshot', snapshot.id); event.dataTransfer.effectAllowed = 'move'; };
      row.ondragover = event => { if (!running && [...event.dataTransfer.types].includes('application/x-time-snapshot')) event.preventDefault(); };
      row.ondrop = event => {
        event.preventDefault(); if (running) return;
        const from = session.snapshots.findIndex(item => item.id === event.dataTransfer.getData('application/x-time-snapshot'));
        if (from < 0) return;
        try { reorder(from,i); } catch(error) { session.setMessage(error.message); }
      };
      row.append(node); list.append(row);
    });
  }
  session.listeners.add(render); render();
  root._onShow = () => {
    visible = true;
    if (!session.sampler.running && !session.sampler.armed) {
      try {
        const config = normalizeTimeConfig(ctx.state.__time || {});
        layoutSnapshots(config, session.snapshots);
        session.config = config;
      } catch (error) { session.message = `Keeping this composition's placement: ${error.message}`; }
    }
    render();
  };
  root._onHide = () => {
    visible = false;
    if (drag && preview.hasPointerCapture(drag.pointerId)) preview.releasePointerCapture(drag.pointerId);
    drag = null;
  };
  root._destroy = () => { destroyed = true; session.listeners.delete(render); };
  return root;
}
