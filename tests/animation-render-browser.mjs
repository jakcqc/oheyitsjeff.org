/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run: node tests/animation-render-browser.mjs
// Uses a disposable browser profile. ANIMATION_TEST_URL can select an existing
// server; the default matches the repository's local HTTPS preview server.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const executablePath = process.env.CHROME_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 }, acceptDownloads: true });
const page = await context.newPage();
const cache = new URL('../.cache/', import.meta.url);
await mkdir(cache, { recursive: true });
const errors = [], checks = [], downloads = [];
const targetURL = process.env.ANIMATION_TEST_URL || 'https://127.0.0.1:5500/Voronoi/';
let captures = 0, visualLoads = 0;
page.on('pageerror', error => { errors.push(error.message); console.error('Page error:', error.stack || error.message); });
page.on('download', download => downloads.push(download));
page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/TheOdyssey/capture.html')) captures++; if (new URL(request.url()).pathname === new URL(targetURL).pathname) visualLoads++; });
const note = message => { checks.push(message); console.log('PASS ' + message); };
const artifact = name => fileURLToPath(new URL(name, cache));
const animatedSettings = { targetType: 'svg', selector: 'svg', svgKind: 'attr', svgName: 'opacity',
  from: 0, to: 1, durationSec: 0.5, fps: 24, easing: 'linear', loop: false, yoyo: false, progress01: 0, autoPlay: false };
const status = page.locator('.anim-render-status');
const render = page.locator('[data-animation-render]');
const preview = page.locator('.anim-render-preview');
const waitStatus = pattern => page.waitForFunction(source => new RegExp(source).test(document.querySelector('.anim-render-status')?.textContent || ''), pattern, { timeout: 90000 });
const fill = async (label, value) => { await render.getByLabel(label, { exact: true }).fill(String(value)); await render.getByLabel(label, { exact: true }).blur(); };
const svg = () => page.locator('#vis > svg').evaluate(node => new XMLSerializer().serializeToString(node));

try {
  // Local cached copies make capture independent of CDN availability where the
  // repository's browser test dependencies have already been downloaded.
  const d3 = new URL('abstract-export-deps/d3.cjs', cache);
  if (existsSync(d3)) await context.route('https://d3js.org/d3.v7.min.js', route => route.fulfill({ contentType: 'text/javascript', path: fileURLToPath(d3) }));
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto(targetURL);
  await page.locator('#vis > svg').waitFor();
  if (!await page.getByRole('button', { name: 'Show or hide tabs', exact: true }).isVisible()) await page.locator('#button-info').click();
  if (!await page.getByRole('tab', { name: 'animate', exact: true }).isVisible()) await page.getByRole('button', { name: 'Show or hide tabs', exact: true }).click();
  await page.getByRole('tab', { name: 'animate', exact: true }).click();
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await page.getByRole('textbox', { name: 'Animation JSON', exact: true }).fill(JSON.stringify(animatedSettings));
  await page.getByRole('button', { name: 'Apply JSON', exact: true }).click();
  await page.getByRole('tab', { name: 'Render', exact: true }).click();
  assert.equal(await render.isVisible(), true, 'Render has its own Animate subtab');
  assert.equal(await page.getByRole('button', { name: 'Play', exact: true }).isVisible(), false, 'Live transport does not obscure the render controls');
  await fill('Output width', 321);
  await fill('Output height', 241);
  await fill('Render duration (seconds)', 0.5);
  const estimates = await render.textContent();
  assert.match(estimates, /24\s*fps/i);
  assert.match(estimates, /memory/i);
  assert.match(estimates, /estimate/i);
  const liveBefore = await svg();
  await writeFile(artifact('animation-render-live.svg'), liveBefore);
  await page.evaluate(() => { window.animationHeartbeat = 0; window.animationHeartbeatTimer = setInterval(() => window.animationHeartbeat++, 20); });
  await render.getByRole('button', { name: 'Preload frames', exact: true }).click();
  await waitStatus('Preloaded|preloaded|ready');
  assert.equal(await render.getByRole('button', { name: 'Render preloaded MP4', exact: true }).isEnabled(), true);
  assert.equal(captures, 1, 'Preload uses one isolated capture app');
  const loadsAfterPreload = visualLoads;
  assert.equal(await svg(), liveBefore, 'Preloading preserves the live simulation SVG');
  const retainedSVG = await page.evaluate(async source => {
    const text = await (await fetch(document.querySelector('.anim-render-preview img').src)).text();
    const parse = value => new DOMParser().parseFromString(value, 'image/svg+xml').documentElement;
    const original = parse(source), captured = parse(text);
    const geometry = svg => [...svg.querySelectorAll('path')].map(path => path.getAttribute('d'));
    return { originalViewBox: original.getAttribute('viewBox'), capturedViewBox: captured.getAttribute('viewBox'),
      originalGeometry: geometry(original), capturedGeometry: geometry(captured) };
  }, liveBefore);
  assert.equal(retainedSVG.capturedViewBox, retainedSVG.originalViewBox, 'Output resizing retains the source SVG coordinate system');
  assert.deepEqual(retainedSVG.capturedGeometry, retainedSVG.originalGeometry, 'SVG-target animation snapshots the exact live artwork');
  assert.equal(await page.evaluate(() => window.animationHeartbeat > 2), true, 'The main page responds during SVG capture');
  assert.equal(downloads.length, 0, 'Preloading does not download a file');
  note('The separate Render tab estimates time, memory and MP4 size; preload keeps the live page responsive and unchanged.');

  await render.getByRole('button', { name: 'Render preloaded MP4', exact: true }).click();
  await preview.getByRole('button', { name: 'Save MP4', exact: true }).waitFor({ timeout: 90000 });
  assert.equal(captures, 2, 'Encoding uses its own isolated renderer');
  assert.equal(visualLoads, loadsAfterPreload, 'Encoding reuses SVGs without loading another capture app');
  assert.equal(downloads.length, 0, 'Completed MP4 waits for an explicit Save');
  assert.equal(await svg(), liveBefore, 'MP4 encoding leaves the live simulation unchanged');
  const video = preview.getByLabel('Rendered animation', { exact: true });
  assert.equal(await video.isVisible(), true, 'The rendered movie appears in the simulation area');
  await page.waitForFunction(() => document.querySelector('.anim-render-preview video')?.readyState >= 2);
  await video.evaluate(node => node.play());
  await page.waitForFunction(() => document.querySelector('.anim-render-preview video')?.currentTime > 0.05);
  await video.evaluate(node => node.pause());
  const saveStarted = page.waitForEvent('download');
  await preview.getByRole('button', { name: 'Save MP4', exact: true }).click();
  const file = artifact('animation-render-test.mp4');
  await (await saveStarted).saveAs(file);
  const bytes = await readFile(file);
  assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', windowsHide: true }));
  const stream = probe.streams.find(item => item.codec_type === 'video');
  assert.equal(stream.codec_name, 'h264');
  assert.equal(stream.width, 322); assert.equal(stream.height, 242);
  assert.equal(stream.avg_frame_rate, '24/1'); assert.equal(Number(stream.nb_frames), 12);
  assert.ok(Math.abs(Number(stream.duration) - 0.5) < 0.001);
  const decoded = [0, 11].map(number => execFileSync('ffmpeg', [
    '-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'select=eq(n\\,' + number + ')', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], { windowsHide: true }));
  const hashes = decoded.map(frame => createHash('sha256').update(frame).digest('hex'));
  assert.ok(decoded[0].every(value => value <= 5), 'The transparent first frame remains in the MP4 as black');
  assert.notEqual(hashes[0], hashes[1], 'The requested SVG animation produces distinct first and last video frames');
  await video.evaluate(node => { node.currentTime = 0.45; });
  await page.waitForFunction(() => !document.querySelector('.anim-render-preview video')?.seeking);
  await page.getByRole('tab', { name: 'Render', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: artifact('animation-render-preview.png') });
  note('Preloaded SVGs encode to a real 24 fps H.264 MP4 at padded 322 × 242; the movie previews before the user chooses Save.');

  await page.evaluate(() => {
    window.animationSaveAborted = 0; window.animationSaveCommitted = false;
    window.showSaveFilePicker = async () => ({ name: 'animation-cancel-test.mp4', createWritable: async () => ({
      write: () => new Promise(() => {}),
      close: async () => { window.animationSaveCommitted = true; },
      abort: async () => { window.animationSaveAborted++; },
    }) });
  });
  await render.getByRole('button', { name: 'Choose output file', exact: true }).click();
  await preview.getByRole('button', { name: 'Save MP4', exact: true }).click();
  await waitStatus('Saving MP4');
  await preview.getByRole('button', { name: 'Cancel render', exact: true }).click();
  await waitStatus('Save cancelled');
  assert.equal(await page.evaluate(() => window.animationSaveCommitted), false, 'Cancelling a stalled save never commits the output file');
  assert.ok(await page.evaluate(() => window.animationSaveAborted > 0), 'Cancelling a stalled save aborts the output stream');
  assert.equal(await video.isVisible(), true, 'The movie remains available after a cancelled save');
  assert.equal(await preview.getByRole('button', { name: 'Save MP4', exact: true }).isEnabled(), true);
  await render.getByRole('button', { name: 'Use download', exact: true }).click();
  note('Cancelling a stalled file save aborts the writer without committing and preserves the completed movie for retry.');

  await preview.getByRole('button', { name: 'Back to simulation', exact: true }).click();
  assert.equal(await preview.isVisible(), false);
  await render.getByRole('button', { name: 'Show preview', exact: true }).click();
  await preview.getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(await preview.isVisible(), false);
  assert.equal(await svg(), liveBefore);
  note('Back to simulation retains the movie; Show preview restores it; Discard releases it without changing the live art.');

  // A long capture request leaves enough time to exercise the actual Cancel UI.
  await fill('Render duration (seconds)', 60);
  await render.getByRole('button', { name: 'Preload frames', exact: true }).click();
  await waitStatus('Preloading SVG');
  const cancelStarted = Date.now();
  await render.getByRole('button', { name: 'Cancel render', exact: true }).click();
  await waitStatus('^Render cancelled');
  assert.ok(Date.now() - cancelStarted < 4000, 'Cancelling preload completes promptly');
  assert.equal(await page.locator('iframe[title="Odyssey source capture"]').count(), 0);
  assert.equal(await svg(), liveBefore);
  note('Cancelling an active preload promptly removes its isolated renderer and preserves the simulation.');

  const cancellation = await page.evaluate(async ui => {
    const { makeAnimationRenderPlan, preloadAnimation, renderAnimation } = await import('/helper/animationRender.js');
    const state = { pointCount: 12, seed: 1, __anim: { ui } };
    const before = JSON.stringify(state);
    const plan = makeAnimationRenderPlan(state, { width: 160, height: 120, durationSec: 0.5 });
    const cacheEntries = async name => {
      const root = await navigator.storage.getDirectory();
      try { const folder = await root.getDirectoryHandle(name); return (await Array.fromAsync(folder.keys())).sort(); }
      catch (error) { if (error.name === 'NotFoundError') return []; throw error; }
    };
    const baselineSVG = await cacheEntries('animation-render-cache');
    const baselineMP4 = await cacheEntries('odyssey-video-downloads');
    const prepared = await preloadAnimation({ state, plan });
    const results = [];
    try {
      for (const phase of ['Encoding', 'Finalizing']) {
        const controller = new AbortController();
        let reached = false;
        const started = performance.now();
        try {
          await renderAnimation({ prepared, signal: controller.signal, onProgress: progress => {
            if (progress.phase === phase && progress.done > 0) { reached = true; controller.abort(); }
          } });
          results.push({ phase, error: 'Did not abort' });
        } catch (error) {
          results.push({ phase, reached, error: error.name, milliseconds: performance.now() - started,
            cleaned: JSON.stringify(await cacheEntries('odyssey-video-downloads')) === JSON.stringify(baselineMP4) });
        }
      }
      const retry = await renderAnimation({ prepared });
      results.push({ phase: 'Retry', frames: retry.frames, size: retry.blob.size });
      await retry.release();
    } finally { await prepared.release(); }
    return { results, statePreserved: JSON.stringify(state) === before,
      svgCleaned: JSON.stringify(await cacheEntries('animation-render-cache')) === JSON.stringify(baselineSVG),
      mp4Cleaned: JSON.stringify(await cacheEntries('odyssey-video-downloads')) === JSON.stringify(baselineMP4) };
  }, animatedSettings);
  for (const result of cancellation.results.slice(0, 2)) {
    assert.equal(result.reached, true, 'The real encoder reaches ' + result.phase);
    assert.equal(result.error, 'AbortError', result.phase + ' stops with AbortError');
    assert.equal(result.cleaned, true, result.phase + ' removes its temporary output');
    assert.ok(result.milliseconds < 5000, result.phase + ' cancels promptly');
  }
  assert.equal(cancellation.results[2].frames, 12, 'The same preload remains reusable after cancelling an encode');
  assert.ok(cancellation.results[2].size > 1000);
  assert.equal(cancellation.statePreserved, true);
  assert.equal(cancellation.svgCleaned, true);
  assert.equal(cancellation.mp4Cleaned, true);
  assert.equal(downloads.length, 1, 'Background retries and cancellation never start downloads');
  note('Encoding and finalization cancel with AbortError, remove temporary MP4s, and allow retry from the same preload; releasing the preload removes its SVG cache.');

  await fill('Render duration (seconds)', 0.5);
  await render.getByLabel('Render format', { exact: true }).selectOption('svg');
  await fill('Frame ranges', '0,11');
  await render.getByRole('button', { name: 'Preload & preview', exact: true }).click();
  await waitStatus('^Preloaded 2 frames');
  assert.equal(await preview.getByRole('button', { name: 'Save MP4', exact: true }).isVisible(), false);
  assert.equal(await preview.getByRole('button', { name: 'Play preloaded frames', exact: true }).isVisible(), true);
  await preview.getByLabel('Preloaded frame', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.waitForFunction(() => /Preloaded frame 11/.test(document.querySelector('.anim-render-preview-status')?.textContent || ''));
  assert.equal(await preview.getByAltText('Preloaded animation frame', { exact: true }).evaluate(image => image.naturalWidth > 0), true);
  await preview.getByRole('button', { name: 'Discard', exact: true }).click();
  await render.getByLabel('Render format', { exact: true }).selectOption('mp4');
  await fill('Frame ranges', '');
  assert.equal(downloads.length, 1);
  assert.equal(await svg(), liveBefore);
  note('SVG-only preload previews the selected frame range and supports scrubbing without encoding or downloading.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.equal(await render.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'Render controls fit a narrow panel');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'The mobile page has no horizontal overflow');
  await page.screenshot({ path: artifact('animation-render-mobile.png') });
  note('Render controls fit a 390px mobile viewport without horizontal page overflow.');

  assert.deepEqual(errors, [], 'No uncaught browser errors');
  await writeFile(artifact('animation-render-validation.json'), JSON.stringify({ result: 'pass', checks, video: { width: stream.width, height: stream.height, fps: stream.avg_frame_rate, frames: stream.nb_frames, bytes: bytes.length }, errors }, null, 2) + '\n');
} catch (error) {
  console.error('Browser errors:', errors);
  console.error('Render status:', await status.textContent().catch(() => 'Unavailable'));
  await page.screenshot({ path: artifact('animation-render-failure.png') }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
