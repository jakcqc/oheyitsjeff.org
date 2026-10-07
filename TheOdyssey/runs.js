/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { plan } from './search.js';
export const runId = ordinal => 'run-' + String(ordinal + 1).padStart(6, '0');
export const canRemoveRun = run => !!run && ['pending', 'failed', 'timeout', 'interrupted', 'stopped'].includes(run.status);
// Keep original ordinals and sample counts: deleting a queued run must not
// change the parameters or seed of any later sample.
export function listRuns(session) {
  if (!session) return [];
  const removed = new Set(session.deletedRuns || []), saved = new Map(session.runs.map(run => [run.id, run]));
  const result = [];
  let ordinal = 0;
  for (const { app, count } of plan(session.settings, session.catalog)) for (let index = 0; index < count; index++, ordinal++) {
    const id = runId(ordinal), run = saved.get(id);
    if (removed.has(id) || run?.status === 'deleted') continue;
    result.push({ ordinal, ...(run || { id, app: app.id, title: app.title, sample: index + 1, status: 'pending', frames: [] }) });
  }
  return result;
}
export function searchProgress(session) {
  if (!session) return { done: 0, total: 0, removed: 0 };
  const deleted = [...new Set(session.deletedRuns || [])].map(id => Number(id.slice(4)) - 1)
    .filter(ordinal => Number.isInteger(ordinal) && ordinal >= 0 && ordinal < session.total);
  return { done: Math.max(0, session.cursor - deleted.filter(ordinal => ordinal < session.cursor).length),
    total: session.total - deleted.length, removed: deleted.length };
}
