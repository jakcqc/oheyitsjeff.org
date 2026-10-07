/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { listRuns } from './runs.js';
export const VIDEO_FPS = 24;

// Use the encoder library's very-high-quality AVC quantizer, rather than the
// extreme QP 0 that some encoders accept but fail to encode at runtime.
export function videoQualityOptions(width, height) {
  return { quantizer: 16, bitrate: Math.max(25000000, Math.ceil(width * height * VIDEO_FPS * 2)), bitrateMode: 'variable' };
}

export function videoEncodingProfiles(width, height) {
  const quality = videoQualityOptions(width, height);
  const bitrateQuality = { bitrate: quality.bitrate, bitrateMode: quality.bitrateMode };
  return [
    { label: 'Very high quality', quality },
    { label: 'High bitrate', quality: bitrateQuality },
    { label: 'High bitrate, software preferred', quality: bitrateQuality, hardwareAcceleration: 'prefer-software' },
  ];
}

export function savedVideoFrames(session, appIds) {
  const selected = appIds == null ? null : new Set(appIds);
  return listRuns(session).filter(run => !selected || selected.has(run.app))
    .flatMap(run => [...(run.frames || [])].sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0)).map(frame => ({
      runId: run.id, runNumber: run.ordinal + 1, app: run.app, title: run.title, sample: run.sample, frame,
    }))).map((item, index) => ({ ...item, index }));
}

// Inclusive, zero-based indices into the selected visuals' saved frames.
export function frameRanges(text, count) {
  if (!count) throw new Error('No saved frames for the selected visuals.');
  if (!String(text || '').trim()) return Array.from({ length: count }, (_, i) => i);
  const indices = new Set();
  for (const part of String(text).split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error('Use frame numbers or ranges such as 0-200, 400-560.');
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first > last || last >= count) {
      throw new Error('Frame ranges must be ascending and between 0 and ' + (count - 1) + '.');
    }
    for (let i = first; i <= last; i++) indices.add(i);
  }
  return [...indices].sort((a, b) => a - b);
}

export function videoPlan(session, { appIds, ranges = '', seconds = 2, flow = null, showLabel = false } = {}) {
  if (!session) throw new Error('Choose a saved search first.');
  if (!Number.isFinite(seconds) || seconds < 1 / VIDEO_FPS || seconds > 3600) {
    throw new Error('Seconds per saved frame must be between 1/24 and 3,600.');
  }
  if (flow !== null && (!flow || typeof flow.name !== 'string' || !Array.isArray(flow.stages)
    || !flow.stages.some(stage => stage && stage.enabled !== false)
    || flow.stages.some(stage => !stage || !['transform', 'effect', 'property'].includes(stage.kind)))) {
    throw new Error('Choose a flow with valid, enabled stages.');
  }
  const available = savedVideoFrames(session, appIds), indices = frameRanges(ranges, available.length);
  const repeats = Math.round(seconds * VIDEO_FPS), totalFrames = repeats * indices.length;
  if (!Number.isSafeInteger(totalFrames)) throw new Error('This video contains too many frames.');
  return { sessionId: session.id, flow: flow ? structuredClone(flow) : null, showLabel: showLabel === true, renderSize: { width: session.settings.width, height: session.settings.height }, items: indices.map(index => available[index]), available: available.length,
    repeats, totalFrames, secondsPerFrame: repeats / VIDEO_FPS, duration: totalFrames / VIDEO_FPS, fps: VIDEO_FPS };
}
