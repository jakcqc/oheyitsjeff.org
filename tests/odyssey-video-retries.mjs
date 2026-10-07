/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const executablePath = process.env.CHROME_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const cache = new URL('../.cache/', import.meta.url); await mkdir(cache, { recursive: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.ODYSSEY_TEST_URL || 'https://127.0.0.1:5500/TheOdyssey/');
  await page.getByRole('heading', { name: 'The odyssey', exact: true }).waitFor();
  const results = await page.evaluate(async () => {
    const { exportVideo } = await import('./video-export.js');
    const NativeEncoder = window.VideoEncoder;
    const files = ['red', 'lime', 'blue'].map((color, index) => '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="' + color + '"/>'
      + (index === 2 ? Array.from({ length: 15038 }, (_, i) => '<circle cx="' + (1 + i % 200 * 6) + '" cy="' + (1 + Math.floor(i / 200) * 10) + '" r="0.4" fill="white"/>').join('') : '') + '</svg>');
    const plan = { sessionId: 'encoder-retry-fixture', renderSize: { width: 1200, height: 800 }, repeats: 4, totalFrames: 12,
      items: files.map((_, index) => ({ index: index + 50, title: 'Dense artwork', app: 'fixture', runId: 'run-000053', frame: { file: String(index) } })) };
    const run = async (mode, failCount = 1) => {
      let instances = 0, commits = 0, aborts = 0, opens = 0;
      const configs = [], progress = [], previews = [], reads = [0, 0, 0];
      const controller = new AbortController();
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle('retry-' + mode + '.mp4', { create: true });
      const initial = await handle.createWritable(); await initial.write('existing-file'); await initial.close();
      class FaultEncoder extends NativeEncoder {
        constructor(callbacks) { super(callbacks); this.callbacks = callbacks; this.instance = ++instances; this.calls = 0; }
        configure(config) { configs.push({ ...config }); super.configure(config); }
        encode(frame, options) {
          if (mode !== 'finalize' && ++this.calls === 10 && this.instance <= failCount) {
            this.close(); this.callbacks.error(new DOMException('Injected runtime encoder failure', 'EncodingError')); return;
          }
          return super.encode(frame, options);
        }
        async flush() {
          await super.flush();
          if (mode === 'finalize' && this.instance <= failCount) throw new DOMException('Injected finalization failure', 'EncodingError');
        }
      }
      window.VideoEncoder = FaultEncoder;
      let result, failure;
      try {
        result = await exportVideo({ plan, signal: controller.signal,
          storage: { read: async (_, file) => { reads[file]++; return new Blob([files[file]]); } },
          fileHandle: { createWritable: async () => {
            opens++; const stream = await handle.createWritable();
            return { write: chunk => mode === 'disk' ? Promise.reject(new DOMException('Disk is full', 'QuotaExceededError')) : stream.write(chunk),
              close: async () => { commits++; await stream.close(); },
              abort: async () => { aborts++; await stream.abort(); } };
          } },
          onProgress: value => { progress.push(value); if (mode === 'cancel' && value.phase === 'Retrying') controller.abort(); },
          onFrame: value => previews.push({ frame: value.item.index, elements: value.elementCount }),
        });
      } catch (error) { failure = { name: error.name, message: error.message, retries: error.retries }; }
      finally { window.VideoEncoder = NativeEncoder; }
      const file = await handle.getFile();
      return { result: result && { frames: result.frames, duration: result.duration, sourceFrames: result.sourceFrames,
        skipped: result.skipped, attempts: result.attempts, retries: result.retries, profile: result.encodingProfile },
        failure, instances, configs, commits, aborts, opens, reads, progress, previews,
        preserved: (await file.slice(0, 13).text()) === 'existing-file',
        data: result ? btoa(Array.from(new Uint8Array(await file.arrayBuffer()), byte => String.fromCharCode(byte)).join('')) : null };
    };
    return { runtime: await run('runtime'), finalize: await run('finalize'), software: await run('software', 2),
      exhausted: await run('exhausted', 3), cancel: await run('cancel'), disk: await run('disk', 0) };
  });
  for (const [name, expectedAttempts] of [['runtime', 2], ['finalize', 2], ['software', 3]]) {
    const scenario = results[name];
    assert.equal(scenario.failure, undefined, name + ': ' + JSON.stringify(scenario.failure));
    assert.equal(scenario.result.attempts, expectedAttempts);
    assert.equal(scenario.result.frames, 12); assert.equal(scenario.result.sourceFrames, 3);
    assert.equal(scenario.result.duration, 0.5); assert.deepEqual(scenario.result.skipped, []);
    assert.equal(scenario.commits, 1); assert.equal(scenario.aborts, expectedAttempts - 1);
    assert.equal(scenario.progress.filter(p => p.phase === 'Preparing').length, 3, 'Preflight is reused');
    assert.equal(scenario.progress.filter(p => p.phase === 'Retrying').length, expectedAttempts - 1);
    assert(scenario.previews.some(p => p.frame === 52 && p.elements === 15039), 'Dense SVG is preserved');
    assert.equal(scenario.configs[1].bitrateMode, 'variable', 'Retry replaces quantizer mode');
    assert.equal(scenario.configs[1].bitrate, 46080000, 'High bitrate is retained');
    const file = fileURLToPath(new URL('odyssey-retry-' + name + '.mp4', cache));
    await writeFile(file, Buffer.from(scenario.data, 'base64'));
    const stream = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], { encoding: 'utf8', windowsHide: true })).streams[0];
    assert.equal(stream.width, 1200); assert.equal(stream.height, 800);
    assert.equal(stream.r_frame_rate, '24/1'); assert.equal(Number(stream.nb_frames), 12);
    assert.equal(Number(stream.duration), 0.5);
    for (const [frame, channel] of [[0, 0], [3, 0], [4, 1], [7, 1], [8, 2], [11, 2]]) {
      const rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'select=eq(n\\,' + frame + '),crop=2:2:602:402,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
      assert(rgb[channel] > 180 && rgb[(channel + 1) % 3] < 60 && rgb[(channel + 2) % 3] < 60, name + ' frame order at ' + frame);
    }
  }
  assert.equal(results.software.configs.at(-1).hardwareAcceleration, 'prefer-software');
  assert.equal(results.exhausted.instances, 3); assert.equal(results.exhausted.commits, 0);
  assert.equal(results.exhausted.preserved, true); assert.equal(results.exhausted.aborts, 3);
  assert.match(results.exhausted.failure.message, /after 3 attempts.*Encoding saved frame 52/);
  assert.equal(results.cancel.failure.name, 'AbortError'); assert.equal(results.cancel.instances, 1);
  assert.equal(results.cancel.preserved, true); assert.equal(results.cancel.commits, 0);
  assert.equal(results.disk.failure.name, 'QuotaExceededError'); assert.equal(results.disk.instances, 1);
  assert.equal(results.disk.preserved, true); assert.equal(results.disk.commits, 0);
  assert.deepEqual(errors, []);
  console.log('Encoder recovery: runtime and finalization failures, software retry, dense 15,039-element SVG, preserved order/timing, bounded attempts, cancellation and disk safety passed.');
} finally { await browser.close(); }
