/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { VisualFrame } from '../TheOdyssey/client.js';

const aborted = () => new DOMException('Animation render cancelled.', 'AbortError');

// Each job owns a separate disposable renderer and a frozen simulation clock.
// Heavy SVG generation, native workers and capture never use the live visual.
export function createAnimationCapture({ state, sourceURL = location.href, width = 1200, height = 800,
  signal, computeMs = 30000, frameMs = 15000, seed = 'animation-render', svgSource, app = '' } = {}) {
  if (signal?.aborted) throw aborted();
  if (!state || typeof state !== 'object') throw new Error('Animation rendering needs visual settings.');
  const snapshot = JSON.parse(JSON.stringify(state, (key, value) => key === '__history' ? undefined : value));
  snapshot.__anim ??= {};
  snapshot.__anim.ui = { ...snapshot.__anim.ui, autoPlay: false, view: 'flow' };
  const staticSVG = snapshot.__anim.ui.targetType === 'svg' && typeof svgSource === 'string' && svgSource.trim();
  if (String(app).toLowerCase() === 'imagetosvg' || /\/imageToSVG(?:\/|[?#]|$)/i.test(String(sourceURL))) {
    if (!staticSVG) throw new Error('Image to SVG rendering needs the current SVG artwork. Use an SVG attribute or style animation; image conversion parameter rendering cannot reload an uploaded image in the background.');
  }
  const source = new VisualFrame(sourceURL, { mode: 'run', animationCapture: true,
    state: snapshot, width, height, seed, ...(staticSVG ? { svgSource } : {}) }, signal);
  let prepared = false, destroyed = false;
  const run = async operation => {
    if (signal?.aborted || destroyed) throw aborted();
    try { return await operation(); }
    catch (error) {
      if (signal?.aborted || destroyed) throw aborted();
      throw error;
    }
  };
  return {
    prepare: () => run(async () => {
      if (prepared) return;
      // A supplied SVG is already the requested artwork. Do not run source
      // preparation, which may replace uploaded media with bundled samples.
      const warnings = staticSVG ? [] : await source.prepare(computeMs);
      const status = await source.deadline(staticSVG ? computeMs : frameMs, 'Animation setup', async () => {
        await source.ready;
        return source.call('animation-prepare');
      });
      status.errors.unshift(...warnings); prepared = true;
      return status;
    }),
    frame: ({ progress, deltaMs = 0 }) => run(async () => {
      if (!prepared) throw new Error('Prepare the animation before capturing frames.');
      return source.deadline(frameMs, 'Animation frame', () => source.call('animation-frame', { progress, deltaMs }));
    }),
    destroy() { destroyed = true; source.destroy(aborted()); },
  };
}
