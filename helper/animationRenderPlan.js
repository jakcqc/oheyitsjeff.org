/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { VIDEO_FPS, frameRanges, videoQualityOptions } from '../TheOdyssey/video-plan.js';

export const ANIMATION_SVG_MEMORY_LIMIT = 64 * 1024 * 1024;
export const ANIMATION_VIDEO_MEMORY_LIMIT = 256 * 1024 * 1024;

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// These are planning estimates, not memory reservations or encoder guarantees.
// Constant-quality H.264 size and SVG work depend heavily on the artwork.
export function makeAnimationRenderPlan(state, options = {}) {
  const ui = state?.__anim?.ui || {};
  const dimension = (key, fallback) => {
    const value = Number(options[key] ?? fallback);
    if (!Number.isInteger(value) || value < 2 || value > 4096) throw new Error('Render ' + key + ' must be a whole number between 2 and 4,096.');
    return value + value % 2;
  };
  const width = dimension('width', 1200), height = dimension('height', 800);
  const durationSec = Number(options.durationSec ?? ui.durationSec ?? 3);
  if (!Number.isFinite(durationSec) || durationSec < 1 / VIDEO_FPS || durationSec > 3600) {
    throw new Error('Animation duration must be between 1/24 and 3,600 seconds.');
  }
  const cycles = Number(options.cycles ?? 1);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 100) throw new Error('Render cycles must be a whole number between 1 and 100.');
  const format = options.format ?? 'mp4';
  if (!['mp4', 'svg'].includes(format)) throw new Error('Choose MP4 or SVG preview.');
  const yoyo = options.yoyo == null ? ui.yoyo === true : options.yoyo === true;
  const framesPerLeg = Math.max(1, Math.round(durationSec * VIDEO_FPS));
  const availableFrames = framesPerLeg * cycles * (yoyo ? 2 : 1);
  if (!Number.isSafeInteger(availableFrames) || availableFrames > 86400) throw new Error('Limit the complete animation to 3,600 seconds (86,400 frames).');
  const indices = frameRanges(options.ranges || '', availableFrames);
  const flow = options.flow ?? null;
  if (flow !== null && (!flow || typeof flow.name !== 'string' || !Array.isArray(flow.stages)
    || !flow.stages.some(stage => stage && stage.enabled !== false)
    || flow.stages.some(stage => !stage || !['transform', 'effect', 'property'].includes(stage.kind)))) {
    throw new Error('Choose a flow with valid, enabled stages.');
  }
  const duration = indices.length / VIDEO_FPS;
  const estimatedFileBytes = Math.ceil(videoQualityOptions(width, height).bitrate * duration / 8 * 1.03);
  // Include canvas/raster/encoder buffers, the bounded SVG cache and a possible
  // in-memory MP4. OPFS-capable browsers usually use much less JavaScript RAM.
  const estimatedMemoryBytes = width * height * 4 * 6 + ANIMATION_SVG_MEMORY_LIMIT
    + Math.min(estimatedFileBytes, ANIMATION_VIDEO_MEMORY_LIMIT);
  const pixels = width * height / (1200 * 800);
  const captureFrames = indices[indices.length - 1] + 1;
  const estimatedCaptureSeconds = 2 + captureFrames * (0.035 + pixels * 0.025);
  const estimatedEncodeSeconds = 1 + indices.length * (0.015 + pixels * 0.02);
  const estimatedSeconds = estimatedCaptureSeconds + (format === 'mp4' ? estimatedEncodeSeconds : 0);
  return freeze({ width, height, renderSize: { width, height }, fps: VIDEO_FPS,
    frames: indices.length, totalFrames: indices.length, availableFrames, captureFrames,
    indices, framesPerLeg, cycles, yoyo, durationSec: framesPerLeg / VIDEO_FPS, duration,
    format, flow: flow ? structuredClone(flow) : null, showLabel: options.showLabel === true,
    estimatedFileBytes, estimatedFileBytesRange: [Math.round(estimatedFileBytes * 0.25), estimatedFileBytes * 2],
    estimatedMemoryBytes, estimatedCaptureSeconds, estimatedEncodeSeconds, estimatedSeconds,
    estimatedSecondsRange: [Math.max(1, estimatedSeconds * 0.3), estimatedSeconds * 4] });
}

// Include both endpoints of each leg, matching the shared Animate easing.
export function animationFrameProgress(plan, index) {
  if (!Number.isInteger(index) || index < 0 || index >= plan.availableFrames) throw new Error('Animation frame is out of range.');
  const leg = Math.floor(index / plan.framesPerLeg);
  const position = plan.framesPerLeg === 1 ? 1 : (index % plan.framesPerLeg) / (plan.framesPerLeg - 1);
  return plan.yoyo && leg % 2 ? 1 - position : position;
}
