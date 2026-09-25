/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

export const DEFAULT_DRAG_DELAY_MS = 150;
export const DRAG_DELAY_STORAGE_KEY = 'home.bubbleDragDelayMs';
const DRAG_DISTANCE_PX = 8;
const IMMEDIATE_DRAG_DISTANCE_PX = 40;
const MAX_DRAG_DELAY_MS = 1500;

function normalizeDelay(value) {
  if (value === null || value === '' || !Number.isFinite(Number(value))) return DEFAULT_DRAG_DELAY_MS;
  return Math.round(Math.max(0, Math.min(MAX_DRAG_DELAY_MS, Number(value))));
}

export function getBubbleDragDelay() {
  try { return normalizeDelay(localStorage.getItem(DRAG_DELAY_STORAGE_KEY)); }
  catch { return DEFAULT_DRAG_DELAY_MS; }
}

export function setBubbleDragDelay(value) {
  const delay = normalizeDelay(value);
  try { localStorage.setItem(DRAG_DELAY_STORAGE_KEY, String(delay)); } catch {}
  return delay;
}

// Small movements wait for the delay; movement beyond 40 CSS pixels confirms
// drag intent immediately. A stationary press always remains a tap.
// Keeping this independent of D3 also keeps mouse and touch behavior identical.
export function createDragIntent({
  delayMs = DEFAULT_DRAG_DELAY_MS,
  distancePx = DRAG_DISTANCE_PX,
  now = () => performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  unschedule = timer => clearTimeout(timer),
  onDragStart = () => {},
  onDragMove = () => {},
  onDragEnd = () => {},
} = {}) {
  let press = null;
  let timer = null;

  function confirmDrag() {
    if (!press || press.dragged) return;
    const { origin, latest } = press;
    const hasClientCoordinates = [origin.clientX, origin.clientY, latest.clientX, latest.clientY].every(Number.isFinite);
    const distance = hasClientCoordinates
      ? Math.hypot(latest.clientX - origin.clientX, latest.clientY - origin.clientY)
      : Math.hypot(latest.x - origin.x, latest.y - origin.y);
    if (distance < distancePx) return;
    if (distance <= IMMEDIATE_DRAG_DISTANCE_PX && now() - press.startedAt < press.delay) return;
    const current = press;
    current.dragged = true;
    if (timer !== null) unschedule(timer);
    timer = null;
    onDragStart(current.latest);
    if (press === current) onDragMove(current.latest);
  }

  function delayElapsed() {
    timer = null;
    if (!press) return;
    const remaining = press.delay - (now() - press.startedAt);
    // Timers can fire a fraction of a millisecond before the deadline.
    if (remaining > 0) timer = schedule(delayElapsed, Math.ceil(remaining));
    else confirmDrag();
  }

  function end({ cancelled = false } = {}) {
    if (timer !== null) unschedule(timer);
    timer = null;
    const current = press;
    press = null;
    if (!current) return { dragged: false, activate: false };
    if (current.dragged) onDragEnd(current.latest);
    return { dragged: current.dragged, activate: !cancelled && !current.dragged };
  }

  return {
    begin(point) {
      end({ cancelled: true });
      const delay = normalizeDelay(typeof delayMs === 'function' ? delayMs() : delayMs);
      press = { origin: point, latest: point, startedAt: now(), delay, dragged: false };
      timer = schedule(delayElapsed, delay);
    },
    move(point) {
      if (!press) return;
      press.latest = point;
      if (press.dragged) onDragMove(point);
      else confirmDrag();
    },
    end,
    cancel: () => end({ cancelled: true }),
  };
}

export function attachBubbleGestures(selection, { d3, simulation, restartSimulation, activate }) {
  const gestures = new Map();
  let disposed = false;
  function pointerPoint(event) {
    const source = event.sourceEvent;
    const pointer = source?.changedTouches
      ? Array.from(source.changedTouches).find(touch => touch.identifier === event.identifier)
      : source;
    // D3 positions are in SVG coordinates, which may be scaled. Recognition
    // uses screen CSS pixels; actual dragging still uses D3's node coordinates.
    return { x: event.x, y: event.y, clientX: pointer?.clientX, clientY: pointer?.clientY };
  }
  const drag = d3.drag()
    .on('start.bubbleIntent', function(event, datum) {
      if (disposed) return;
      const element = this;
      const intent = createDragIntent({
        delayMs: getBubbleDragDelay,
        onDragStart(point) {
          if (!element.isConnected) { intent.cancel(); return; }
          datum.fx = point.x;
          datum.fy = point.y;
          element.classList.add('bubble--dragging');
          restartSimulation();
        },
        onDragMove(point) { datum.fx = point.x; datum.fy = point.y; },
        onDragEnd() {
          datum.fx = null;
          datum.fy = null;
          element.classList.remove('bubble--dragging');
          simulation.alphaTarget(0);
        },
      });
      gestures.set(event.identifier, intent);
      intent.begin(pointerPoint(event));
    })
    .on('drag.bubbleIntent', event => {
      gestures.get(event.identifier)?.move(pointerPoint(event));
    })
    .on('end.bubbleIntent', function(event, datum) {
      const intent = gestures.get(event.identifier);
      gestures.delete(event.identifier);
      const cancelled = disposed || event.sourceEvent?.type === 'touchcancel' || !this.isConnected;
      if (intent?.end({ cancelled }).activate) activate(datum, event.sourceEvent);
    });

  selection.call(drag)
    .attr('role', 'link')
    .attr('tabindex', 0)
    .attr('aria-label', datum => datum.title)
    .on('click.bubbleIntent', function(event, datum) {
      // D3 swallows native clicks after even tiny motion, so pointer taps are
      // handled on release. Keep assistive-technology click activation working.
      event.preventDefault();
      if (event.detail === 0) activate(datum, event);
    })
    .on('keydown.bubbleIntent', function(event, datum) {
      if (event.key !== 'Enter' || event.repeat) return;
      event.preventDefault();
      activate(datum, event);
    });

  return () => {
    disposed = true;
    gestures.forEach(intent => intent.cancel());
    gestures.clear();
    selection.on('.drag', null).on('.bubbleIntent', null);
  };
}
