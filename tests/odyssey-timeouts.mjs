/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run against the existing static website in a fresh, disposable browser.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const url = process.env.ODYSSEY_TEST_URL || 'https://127.0.0.1:5500/TheOdyssey/';
const executablePath = process.env.CHROME_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
// A broken isolation implementation must fail the test, not hang the test runner.
const watchdog = setTimeout(() => { console.error('Timeout regression test hung.'); browser.close(); process.exitCode = 1; }, 45000);
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const fixture = `<!doctype html><svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle r="5"/></svg>
<script type="module">
import {attachOdysseyClient} from '/helper/odysseyClientBridge.js';
let ticks = 0;
function step() { if (++ticks >= 3) { while (true) {} } requestAnimationFrame(step); }
requestAnimationFrame(step);
attachOdysseyClient({spec:{title:'Blocked simulation',params:[]},state:{}}, 'blockedFrame', document.body);
</script>`;
try {
  await page.route('**/odyssey-test-block-load/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><script>while (true) {}</script>' }));
  await page.route('**/odyssey-test-block-frame/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.goto(url);
  await page.getByRole('heading', { name: 'The odyssey', exact: true }).waitFor();
  const result = await page.evaluate(async () => {
    const { BrowserOdyssey } = await import('./client.js');
    const { DEFAULTS, clone, flattenParams, defaultParam } = await import('./search.js');
    const client = await new BrowserOdyssey().open();
    const real = client.catalog.apps.find(app => app.id === 'lissajousFigures');
    client.catalog = { apps: [
      { id: 'blockedLoad', title: 'Blocked startup', params: [], url: '/odyssey-test-block-load/' },
      { id: 'blockedFrame', title: 'Blocked simulation', params: [], url: '/odyssey-test-block-frame/' }, real,
    ] };
    const settings = { ...clone(DEFAULTS), samples: 1, frames: 2, computeMs: 2000, frameMs: 350, intervalMs: 50, width: 400, height: 300 };
    for (const app of client.catalog.apps) settings.apps[app.id] = { enabled: true,
      params: Object.fromEntries(flattenParams(app.params).map(p => [p.key, { ...defaultParam(p), enabled: false }])) };
    settings.apps.lissajousFigures.params.curveCount.fixed = 2;
    settings.apps.lissajousFigures.params.samples.fixed = 100;
    const ticks = []; const heartbeat = setInterval(() => ticks.push(performance.now()), 20);
    const started = performance.now();
    try {
      const search = await client.request('start', settings); await client.task;
      const session = client.sessions.get(search.id);
      const partial = session.runs[1].frames[0];
      return { status: session.status, runs: session.runs, elapsed: performance.now() - started,
        ticks: ticks.length, maxGap: Math.max(...ticks.slice(1).map((time, i) => time - ticks[i])),
        saved: partial && (await (await client.storage.read(session.id, partial.file)).text()).includes('ohey-settings') };
    } finally { clearInterval(heartbeat); client.storage.db.close(); }
  });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.runs.map(run => run.status), ['timeout', 'timeout', 'complete']);
  assert.match(result.runs[0].error, /Compute deadline exceeded \(2000 ms\)/);
  assert.match(result.runs[1].error, /Frame deadline exceeded \(350 ms\)/);
  assert.deepEqual(result.runs.map(run => run.frames.length), [0, 1, 2]);
  assert.equal(result.saved, true, 'Earlier frames survive a blocked simulation');
  assert.ok(result.elapsed < 8000, 'The queue advances past infinite loops');
  assert.ok(result.ticks > 50 && result.maxGap < 500, 'Host timers keep running while captures are blocked');
  assert.equal(await page.locator('iframe[title="Odyssey source capture"]').count(), 0);
  console.log('Infinite startup/frame loops: deadlines, responsive host, saved partial frames, next-app success and frame cleanup passed.');

  const stopped = await page.evaluate(async () => {
    const { VisualFrame } = await import('./client.js');
    const controller = new AbortController();
    const frame = new VisualFrame('/odyssey-test-block-frame/', { mode: 'run', state: {}, width: 400, height: 300 }, controller.signal);
    await frame.prepare(5000); await frame.capture(1000, 0);
    const started = performance.now();
    const stop = setTimeout(() => controller.abort(), 100);
    try { await frame.capture(2000, 50); return { error: 'Unexpected success' }; }
    catch (error) { return { error: error.message, elapsed: performance.now() - started, pending: frame.pending.size, destroyed: frame.destroyed }; }
    finally { clearTimeout(stop); frame.destroy(); }
  });
  assert.equal(stopped.error, 'Search stopped.');
  assert.ok(stopped.elapsed < 1000, 'Stop interrupts the blocked capture before its frame deadline');
  assert.equal(stopped.pending, 0); assert.equal(stopped.destroyed, true);
  assert.equal(await page.locator('iframe[title="Odyssey source capture"]').count(), 0);
  console.log('Stop interrupts a running infinite simulation and clears pending requests.');

  const workers = await page.evaluate(async () => {
    const { VisualFrame } = await import('./client.js');
    const frame = new VisualFrame('/imageToSVG/', { mode: 'run', state: { sampleSize: 64 }, width: 400, height: 300 });
    try {
      await frame.prepare(15000); const captured = await frame.capture(5000, 0);
      return { svg: captured.svg.includes('ohey-settings'), empty: captured.empty, errors: captured.errors };
    } finally { frame.destroy(); }
  });
  assert.equal(workers.svg, true); assert.equal(workers.empty, false); assert.deepEqual(workers.errors, []);
  assert.deepEqual(errors, []);
  console.log('Image-to-SVG native module worker works inside the isolated capture.');
} finally { clearTimeout(watchdog); await browser.close(); }

const unsupported = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--disable-features=IsolateSandboxedIframes'] });
try {
  const page = await unsupported.newPage({ ignoreHTTPSErrors: true }); await page.goto(url);
  const error = await page.evaluate(async () => {
    const { VisualFrame } = await import('./client.js');
    const frame = new VisualFrame('/Voronoi/', { mode: 'run', state: { pointCount: 4 } });
    try { await frame.prepare(5000); return 'Unexpected success'; }
    catch (error) { return error.message; }
    finally { frame.destroy(); }
  });
  assert.match(error, /cannot isolate/);
  assert.equal(await page.locator('iframe[title="Odyssey source capture"]').count(), 0);
  console.log('Isolation disabled: unsafe capture rejected before app startup.');
} finally { await unsupported.close(); }
