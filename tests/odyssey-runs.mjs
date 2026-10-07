/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Uses the existing static site and a fresh test browser; no user files touched.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const url = process.env.ODYSSEY_TEST_URL || 'https://127.0.0.1:5500/TheOdyssey/';
const executablePath = process.env.CHROME_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const row = id => page.locator('.ody-run-row[data-run-id="' + id + '"]');
async function savedSession() {
  return page.evaluate(async () => {
    const { OdysseyStorage } = await import('./storage.js'), storage = await new OdysseyStorage().open();
    const id = document.querySelector('[data-sessions]').value; const result = await storage.get('sessions', id); storage.db.close(); return result;
  });
}
async function waitPreview(id) { await page.waitForFunction(id => document.querySelector('#preview-title').textContent.includes(id), id); }
async function ready() { await page.getByRole('heading', { name: 'The odyssey', exact: true }).waitFor(); }
try {
  await page.goto(url); await ready();
  // Keep initial source loading long enough to pause through the real controls.
  await page.route('**/Voronoi/?odyssey=*', async route => { await new Promise(resolve => setTimeout(resolve, 200)); await route.continue(); });
  const settings = await page.evaluate(async () => {
    const { DEFAULTS, clone, flattenParams, defaultParam } = await import('./search.js');
    const catalog = await (await fetch('./catalog.json')).json(), app = catalog.apps.find(a => a.id === 'voronoiFluid');
    const settings = { ...clone(DEFAULTS), samples: 4, frames: 2, method: 'ascending', width: 800, height: 600 };
    settings.apps[app.id] = { enabled: true, params: Object.fromEntries(flattenParams(app.params).map(p => [p.key, { ...defaultParam(p), enabled: false }])) };
    Object.assign(settings.apps[app.id].params.pointCount, { enabled: true, min: 4, max: 10 });
    return settings;
  });
  await page.locator('.odyssey-panel input[type=file]').setInputFiles({ name: 'runs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(settings)) });
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-progress-label]').textContent.startsWith('paused'));
  assert.equal(await page.locator('.ody-run-row').count(), 4, 'Pending runs are visible');
  await row('run-000002').locator('.ody-run').click();
  assert.equal(await page.locator('#frame-bar').isVisible(), true, 'Navigation remains available for empty runs');
  assert.equal(await page.locator('#download-frame').isVisible(), false);
  assert.equal(await page.locator('#vis svg metadata#ohey-settings').count(), 0, 'An empty run never shows another run SVG');
  await page.getByRole('button', { name: 'Delete selected run', exact: true }).click();
  await row('run-000002').waitFor({ state: 'detached' });
  assert.equal(await row('run-000003').locator('.ody-run').getAttribute('aria-pressed'), 'true');
  await row('run-000004').locator('.ody-delete-run').click();
  await row('run-000004').waitFor({ state: 'detached' });
  assert.match(await page.locator('[data-progress-label]').textContent(), /\/ 2 runs.*2 removed/);
  const paused = await savedSession();
  assert.deepEqual(paused.deletedRuns, ['run-000002', 'run-000004']);
  await page.reload(); await ready();
  await row('run-000001').waitFor();
  assert.equal(await page.locator('.ody-run-row').count(), 2, 'Removed queue entries survive reload');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-progress-label]').textContent.startsWith('complete'), {}, { timeout: 30000 });
  const done = await savedSession();
  assert.deepEqual(done.runs.map(r => r.status), ['complete', 'deleted', 'complete', 'deleted']);
  const requested = await page.evaluate(async session => {
    const { sample } = await import('./search.js');
    return sample(session.catalog.apps.find(a => a.id === 'voronoiFluid'), session.settings, 2, 4).requested;
  }, done);
  assert.deepEqual(done.runs[2].requested, requested, 'Removing samples never changes remaining sampled values');
  assert.equal(await page.getByRole('button', { name: 'Previous run', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Next run', exact: true }).click();
  await waitPreview('run-000003');
  assert.match(await page.locator('#preview-title').textContent(), /run-000003/);
  assert.equal(await page.locator('#run-label').textContent(), 'Run 3 / 4');
  assert.equal(await page.locator('#frame-label').textContent(), 'Frame 1 / 2');
  await page.getByRole('button', { name: 'Next saved frame', exact: true }).click();
  assert.equal(await page.locator('#frame-label').textContent(), 'Frame 2 / 2');
  await page.getByRole('button', { name: 'Previous run', exact: true }).click();
  await waitPreview('run-000001');
  assert.match(await page.locator('#preview-title').textContent(), /run-000001/);
  assert.equal(await page.locator('#frame-label').textContent(), 'Frame 1 / 2');
  assert.equal(await page.getByRole('button', { name: 'Delete selected run', exact: true }).isVisible(), false);
  await page.getByLabel('Run number', { exact: true }).fill('3');
  await page.getByLabel('Run number', { exact: true }).press('Enter');
  await waitPreview('run-000003');
  assert.equal(await page.locator('#frame-label').textContent(), 'Frame 1 / 2');
  await page.getByLabel('Run number', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Go to run', exact: true }).click();
  assert.match(await page.locator('#run-jump-message').textContent(), /removed/);
  assert.match(await page.locator('#preview-title').textContent(), /run-000003/);
  for (const invalid of ['0', '5', '1.5', '']) {
    await page.getByLabel('Run number', { exact: true }).fill(invalid);
    await page.getByRole('button', { name: 'Go to run', exact: true }).click();
    assert.match(await page.locator('#run-jump-message').textContent(), /from 1 to 4/);
  }
  await page.getByLabel('Run number', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Go to run', exact: true }).click();
  await waitPreview('run-000001');
  assert.equal(await page.locator('#run-jump-message').textContent(), '');
  console.log('Pending removal, reload/resume, stable sampling, direct run jumps, validation and boundary buttons passed.');

  // Build a saved-search fixture with an empty failure, a failure after one
  // captured frame, and a pending sample; reuse actual generated SVG files.
  const fixtureId = await page.evaluate(async original => {
    const { OdysseyStorage, json } = await import('./storage.js');
    const storage = await new OdysseyStorage().open();
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('odyssey-run-tests', { create: true });
    storage.directory = folder;
    const fixture = structuredClone(original); fixture.id = 'search-runs-' + Date.now(); fixture.startedAt = new Date().toISOString();
    fixture.status = 'paused'; fixture.cursor = 3; fixture.deletedRuns = [];
    fixture.runs = [structuredClone(original.runs[0]), { id: 'run-000002', app: 'voronoiFluid', title: 'Voronoi (Fluid)', sample: 2, status: 'failed', frames: [], error: 'Failed fixture' }, structuredClone(original.runs[2])];
    fixture.runs[2].status = 'timeout'; fixture.runs[2].error = 'Frame deadline fixture'; fixture.runs[2].frames = fixture.runs[2].frames.slice(0, 1);
    for (const run of fixture.runs) {
      await storage.file(fixture.id, run.id + '/requested.json', json({ requested: run.requested || {} }));
      for (const frame of run.frames) for (const name of [frame.file, frame.file.replace('.svg', '.json')]) {
        await storage.file(fixture.id, name, await storage.read(original.id, name));
      }
    }
    await storage.copySearch(fixture); storage.db.close(); return fixture.id;
  }, done);
  await page.reload(); await ready();
  await page.waitForFunction(id => document.querySelector('[data-sessions]').value === id, fixtureId);
  await page.getByRole('button', { name: 'Next run', exact: true }).click();
  await waitPreview('run-000003');
  assert.match(await page.locator('#preview-title').textContent(), /run-000003/, 'Next skips an empty failed run');
  await row('run-000002').locator('.ody-run').click();
  assert.match(await page.locator('#preview-detail').textContent(), /Failed fixture/);
  assert.equal(await page.locator('#download-frame').isVisible(), false);
  assert.equal(await page.locator('#vis svg metadata#ohey-settings').count(), 0);
  await row('run-000002').locator('.ody-delete-run').click();
  await row('run-000002').waitFor({ state: 'detached' });
  // Reconnecting applies removals recorded while the folder was disconnected.
  await page.evaluate(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('odyssey-run-tests'); });
  await page.getByRole('button', { name: 'Choose output folder', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-storage]').textContent.includes('Saving to odyssey-run-tests'));
  await row('run-000003').locator('.ody-run').click();
  await waitPreview('run-000003');
  assert.equal(await page.locator('#vis svg metadata#ohey-settings').count(), 1);
  await page.getByRole('button', { name: 'Delete selected run', exact: true }).click();
  await row('run-000003').waitFor({ state: 'detached' });
  assert.equal(await row('run-000004').locator('.ody-run').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#vis svg metadata#ohey-settings').count(), 0, 'Deleting a selected failure clears its preview');
  await page.getByRole('button', { name: 'Previous run', exact: true }).click();
  await waitPreview('run-000001');
  assert.match(await page.locator('#preview-title').textContent(), /run-000001/);
  const removed = await page.evaluate(async id => {
    const { OdysseyStorage } = await import('./storage.js');
    const storage = await new OdysseyStorage().open(), session = await storage.get('sessions', id);
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('odyssey-run-tests');
    const search = await folder.getDirectoryHandle(id);
    const disk = [];
    for (const run of ['run-000001', 'run-000002', 'run-000003']) {
      try { await search.getDirectoryHandle(run); disk.push(true); } catch (error) { if (error.name !== 'NotFoundError') throw error; disk.push(false); }
    }
    const cached = await storage.get('files', id + '/run-000003/frame-00001.svg');
    const manifest = JSON.parse(await (await (await search.getFileHandle('manifest.json')).getFile()).text());
    const zip = await storage.exportSearch(session);
    const bytes = new Uint8Array(await zip.arrayBuffer()), view = new DataView(bytes.buffer), entries = [];
    let offset = 0;
    while (view.getUint32(offset, true) === 0x04034b50) {
      const length = view.getUint16(offset + 26, true), extra = view.getUint16(offset + 28, true), size = view.getUint32(offset + 18, true);
      entries.push(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + length)));
      offset += 30 + length + extra + size;
    }
    storage.db.close(); return { deleted: session.deletedRuns, disk, cached: !!cached, manifest: manifest.deletedRuns, entries };
  }, fixtureId);
  assert.deepEqual(removed.deleted, ['run-000002', 'run-000003']);
  assert.deepEqual(removed.disk, [true, false, false]); assert.equal(removed.cached, false);
  assert.deepEqual(removed.manifest, removed.deleted);
  assert.equal(removed.entries.some(name => /run-00000[23]\//.test(name)), false, 'Exports exclude deleted runs');
  await page.reload(); await ready();
  await row('run-000001').waitFor();
  assert.equal(await page.locator('.ody-run-row').count(), 2);
  await row('run-000004').locator('.ody-delete-run').click();
  await row('run-000004').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.ody-run-row').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Next run', exact: true }).isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  const controls = await page.locator('#frame-bar').boundingBox(); assert.ok(controls.x >= 0 && controls.x + controls.width <= 391);
  await page.getByRole('button', {name:'Next saved frame',exact:true}).click();
  assert.equal(await page.locator('#frame-label').textContent(),'Frame 2 / 2');
  await page.screenshot({ path: fileURLToPath(new URL('../.cache/odyssey-run-controls.png', import.meta.url)) });
  // A large multi-visual archive exercises global numbers and filtering without
  // running hundreds of simulations or touching the user's stored searches.
  await page.setViewportSize({ width: 1440, height: 960 });
  const multiId = await page.evaluate(async original => {
    const { OdysseyStorage } = await import('./storage.js');
    const storage = await new OdysseyStorage().open();
    const apps = ['lissajousFigures', 'voronoiFluid'].map(id => original.catalog.apps.find(app => app.id === id));
    const fixture = { ...structuredClone(original), id: 'search-multi-' + Date.now(), startedAt: new Date().toISOString(),
      status: 'paused', cursor: 258, total: 512, deletedRuns: [], runs: [], catalog: { apps },
      settings: { ...structuredClone(original.settings), samples: 256, maxRuns: 512,
        apps: Object.fromEntries(apps.map(app => [app.id, { enabled: true, params: {} }])) } };
    for (const number of [1, 2, 256, 257, 258]) {
      const app = apps[number <= 256 ? 0 : 1];
      const id = 'run-' + String(number).padStart(6, '0');
      const run = { ...structuredClone(original.runs[0]), id, app: app.id, title: app.title, sample: (number - 1) % 256 + 1 };
      if ([2, 258].includes(number)) { run.status = 'failed'; run.frames = []; run.error = 'Empty visual fixture'; }
      for (const frame of run.frames) {
        const old = frame.file; frame.file = frame.file.replace(/^run-\d+/, id);
        await storage.file(fixture.id, frame.file, await storage.read(original.id, old));
        await storage.file(fixture.id, frame.file.replace('.svg', '.json'), await storage.read(original.id, old.replace('.svg', '.json')));
      }
      fixture.runs.push(run);
    }
    await storage.manifest(fixture); storage.db.close(); return fixture.id;
  }, done);
  await page.reload(); await ready();
  await page.waitForFunction(id => document.querySelector('[data-sessions]').value === id, multiId);
  const visual = page.getByRole('combobox', { name: 'Visual to inspect', exact: true });
  assert.equal(await visual.locator('option').count(), 3, 'Only visuals in this search are listed');
  await page.getByLabel('Run number', { exact: true }).fill('512');
  await page.getByLabel('Run number', { exact: true }).press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-run-id="run-000512"] .ody-run')?.getAttribute('aria-pressed') === 'true');
  assert.equal(await page.locator('#run-label').textContent(), 'Run 512 / 512');
  assert.equal(await page.locator('.ody-run-row').count(), 201, 'Distant jumps do not render hundreds of unnecessary rows');
  assert.equal(await page.locator('#download-frame').isVisible(), false);
  assert.equal(await page.locator('#vis svg metadata#ohey-settings').count(), 0);
  await visual.selectOption('lissajousFigures');
  await waitPreview('run-000001');
  assert((await page.locator('.ody-run').allTextContents()).every(text => text.includes('Lissajous')));
  await page.getByRole('button', { name: 'Next run', exact: true }).click();
  await waitPreview('run-000256');
  assert.equal(await page.getByRole('button', { name: 'Next run', exact: true }).isDisabled(), true, 'Next stays within the chosen visual');
  await page.getByLabel('Run number', { exact: true }).fill('257');
  await page.getByRole('button', { name: 'Go to run', exact: true }).click();
  await waitPreview('run-000257');
  assert.equal(await visual.inputValue(), 'voronoiFluid', 'Global jumps switch to the destination visual');
  assert((await page.locator('.ody-run').allTextContents()).every(text => text.includes('Voronoi')));
  assert.equal(await page.locator('#frame-label').textContent(), 'Frame 1 / 2');
  await page.getByLabel('Run number', { exact: true }).fill('258');
  await page.getByRole('button', { name: 'Go to run', exact: true }).click();
  assert.match(await page.locator('#preview-detail').textContent(), /Empty visual fixture/);
  await page.getByRole('button', { name: 'Delete selected run', exact: true }).click();
  await row('run-000258').waitFor({ state: 'detached' });
  assert.equal(await visual.inputValue(), 'voronoiFluid');
  assert.equal(await row('run-000259').locator('.ody-run').getAttribute('aria-pressed'), 'true');
  await visual.selectOption('');
  await page.getByRole('button', { name: 'Previous run', exact: true }).click();
  await waitPreview('run-000257');
  await page.getByRole('button', { name: 'Previous run', exact: true }).click();
  await waitPreview('run-000256');
  await page.setViewportSize({ width: 390, height: 844 });
  await visual.selectOption('voronoiFluid');
  await page.getByLabel('Run number', { exact: true }).fill('512');
  await page.getByRole('button', { name: 'Go to run', exact: true }).click();
  assert.equal(await page.locator('#run-label').textContent(), 'Run 512 / 512');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.getByRole('combobox', { name: 'Saved searches', exact: true }).selectOption(done.id);
  await waitPreview('run-000001');
  assert.equal(await visual.inputValue(), '', 'Changing searches resets the visual filter');
  assert.equal(await visual.locator('option').count(), 2);
  await page.screenshot({ path: fileURLToPath(new URL('../.cache/odyssey-run-controls.png', import.meta.url)) });
  console.log('Multi-visual filtering, global jump selection, distant runs, empty/failed runs, deletion and mobile navigation passed.');
  assert.deepEqual(errors, []);
  console.log('Failed/partial run deletion, disk cleanup, reconnect, ZIP exclusion, persistent removal and mobile controls passed.');
} finally { await browser.close(); }
