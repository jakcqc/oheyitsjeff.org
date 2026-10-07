/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */

// Live sampling follows rendered animation time, never wall-clock timers. A slow
// renderer skips missed deadlines instead of duplicating one frame many times.
export function createTimeSampler({ capture, begin = () => {}, notify = () => {} }) {
  let pending = null, active = null;
  const report = message => notify(message);
  return {
    get armed() { return !!pending; },
    get running() { return !!active; },
    arm(options) {
      const { sampleStart, sampleInterval, sampleCount, sampleMode } = options;
      if (!Number.isFinite(sampleStart) || sampleStart < 0 ||
          !Number.isFinite(sampleInterval) || sampleInterval <= 0 ||
          !Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 400 ||
          !['append', 'replace'].includes(sampleMode)) throw new Error('Choose a valid sampling start, interval, count, and mode.');
      if (active) throw new Error('Cancel current sampling before arming another run.');
      pending = { ...options };
      report('Armed for the next animation run.');
    },
    cancel() {
      pending = null; active = null;
      report('Sampling is off. Snapshots are kept.');
    },
    handle(event) {
      if (event.type === 'start') {
        active = null;
        if (!pending) return;
        const options = pending; pending = null;
        try {
          begin(options);
          active = { options, runId: event.runId, deadline: 0, count: 0 };
          report('Sampling this run…');
        } catch (error) { report(error.message); }
        return;
      }
      if (!active || active.runId !== event.runId) return;
      if (event.type === 'frame') {
        const run = active, { sampleStart, sampleInterval, sampleCount } = run.options;
        const elapsed = event.elapsedSec;
        if (!Number.isFinite(elapsed) || elapsed + 1e-8 < sampleStart + run.deadline * sampleInterval) return;
        try {
          capture({ elapsedSec: elapsed, index: run.count, options: run.options });
          run.count++;
          run.deadline = Math.max(run.deadline + 1, Math.floor((elapsed - sampleStart + 1e-8) / sampleInterval) + 1);
          if (run.count >= sampleCount || run.deadline >= sampleCount) {
            active = null;
            report(`Sampling finished: ${run.count}/${sampleCount} snapshots. Arm again for another run.`);
          } else report(`Sampling: ${run.count}/${sampleCount} snapshots.`);
        } catch (error) {
          active = null;
          report(`Sampling stopped: ${error.message}`);
        }
      } else if (event.type === 'pause') {
        report(`Sampling paused: ${active.count}/${active.options.sampleCount} snapshots.`);
      } else if (event.type === 'resume') {
        report(`Sampling: ${active.count}/${active.options.sampleCount} snapshots.`);
      } else if (event.type === 'stop' || event.type === 'complete') {
        const run = active; active = null;
        report(`Animation ended: ${run.count}/${run.options.sampleCount} snapshots. Arm again for another run.`);
      }
    },
  };
}
