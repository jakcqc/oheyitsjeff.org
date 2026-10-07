/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Developer test only. Point ODYSSEY_TEST_URL at the existing static website.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const url = process.env.ODYSSEY_TEST_URL || 'https://127.0.0.1:5500/TheOdyssey/';
const executablePath = process.env.CHROME_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 } });
const errors = [], requests = [];
page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
page.on('dialog', dialog => dialog.accept());
await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
async function waitStatus(id, status) {
  await page.waitForFunction(({id,status}) => window.testClient.sessions.get(id)?.status === status, {id,status}, {timeout:30000});
}
try {
  await page.goto(url);
  await page.getByRole('heading', { name: 'The odyssey', exact: true }).waitFor();
  assert.match(await page.locator('[data-status]').textContent(), /Ready/);
  assert.doesNotMatch(await page.locator('.odyssey-panel').textContent(), /npm start|local service|8787/);
  assert.equal(await page.getByLabel('Samples per app', { exact: true }).inputValue(), '256');
  assert.equal(await page.getByLabel('New random seed for each search', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Seed', { exact: true }).isDisabled(), true);
  assert.match(await page.locator('[data-estimate]').textContent(), /^5,120 runs/);
  // An existing browser must receive the requested preset once, with a backup.
  await page.evaluate(async () => {
    const { OdysseyStorage } = await import('./storage.js');
    const storage = await new OdysseyStorage().open();
    const old = await storage.get('preferences', 'settings');
    old.samples = 2; old.seed = 'previous-user-seed'; old.randomizeSeed = false;
    await storage.put('preferences', 'settings', old);
    await storage.put('preferences', 'defaultPresetRevision', 'previous-preset');
    storage.db.close();
  });
  await page.reload();
  await page.getByRole('heading', { name: 'The odyssey', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Samples per app', { exact: true }).inputValue(), '256');
  assert.equal(await page.getByLabel('New random seed for each search', { exact: true }).isChecked(), true);
  const migration = await page.evaluate(async () => {
    const { OdysseyStorage } = await import('./storage.js');
    const storage = await new OdysseyStorage().open();
    const revision = await storage.get('preferences', 'defaultPresetRevision');
    const backup = await storage.get('preferences', 'settings-before-' + revision);
    const current = await storage.get('preferences', 'settings'); storage.db.close();
    return { backupSeed: backup.seed, revision, currentRevision: current.presetRevision };
  });
  assert.equal(migration.backupSeed, 'previous-user-seed');
  assert.equal(migration.revision, migration.currentRevision);
  await page.getByLabel('New random seed for each search', { exact: true }).uncheck();
  assert.equal(await page.getByLabel('Seed', { exact: true }).isEnabled(), true);
  console.log('Default preset, existing-browser migration, preference backup and seed controls passed.');
  const settings = await page.evaluate(async () => {
    const { DEFAULTS, clone, flattenParams, defaultParam } = await import('./search.js');
    const catalog = await (await fetch('./catalog.json')).json(), app = catalog.apps.find(a => a.id === 'voronoiFluid');
    const settings = { ...clone(DEFAULTS), randomizeSeed: true, samples: 2, frames: 3, width: 800, height: 600, intervalMs: 50 };
    settings.toolbar = { __xf: { ui: { preset: 'none' }, stack: [{ kind: 'rotate', deg: 17, targets: null }] } };
    settings.apps[app.id] = { enabled: true, params: Object.fromEntries(flattenParams(app.params).map(p => [p.key, { ...defaultParam(p), enabled: false }])) };
    Object.assign(settings.apps[app.id].params.pointCount, { enabled: true, min: 4, max: 8, samples: 5 });
    localStorage.setItem('visualHelp.settings.v1:voronoiFluid', JSON.stringify({ pointCount: 123 }));
    localStorage.setItem('visualHelp.ui.v1:voronoiFluid', JSON.stringify({ configWidth: 321 }));
    return settings;
  });
  await page.locator('.odyssey-panel input[type=file]').setInputFiles({ name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(settings)) });
  assert.match(await page.locator('[data-estimate]').textContent(), /^2 runs/);
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-progress-label]')?.textContent.startsWith('complete'), {}, { timeout: 60000 });
  assert.equal(await page.locator('.ody-run').count(), 2);
  const generatedSeed = await page.getByLabel('Seed', { exact: true }).inputValue();
  assert.notEqual(generatedSeed, settings.seed);
  assert.match(await page.locator('[data-runs]').textContent(), /complete · 3 frames/);
  const svg = await page.locator('#vis svg').evaluate(svg => svg.outerHTML);
  assert.match(svg, /ohey-settings/); assert.match(svg, /<path/); assert.match(svg, /rotate\(17 /);
  assert.deepEqual(await page.evaluate(() => [JSON.parse(localStorage.getItem('visualHelp.settings.v1:voronoiFluid')), JSON.parse(localStorage.getItem('visualHelp.ui.v1:voronoiFluid'))]), [{ pointCount: 123 }, { configWidth: 321 }]);
  const archive = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download search ZIP', exact: true }).click();
  const downloaded = await archive;
  await downloaded.saveAs(new URL('../.cache/odyssey-static-test.zip', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
  const zip = await readFile(await downloaded.path());
  assert.equal(zip.readUInt32LE(0), 0x04034b50); assert.ok(zip.includes(Buffer.from('run-000001/frame-00003.svg')));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#vis svg metadata#ohey-settings'));
  assert.equal(await page.locator('.ody-run').count(), 2, 'Browser library survives reload');
  assert.equal(await page.getByLabel('Samples per app', { exact: true }).inputValue(), '2');
  assert.equal(await page.getByLabel('Seed', { exact: true }).inputValue(), generatedSeed, 'Later preferences survive reload');
  await page.getByLabel('Filter parameters').fill('pointCount');
  const row = page.locator('.ody-param').filter({ hasText: 'Voronoi (Fluid)' });
  await row.getByLabel('Below minimum', { exact: true }).fill('25');
  await row.getByLabel('Below minimum', { exact: true }).press('Tab');
  assert.match(await row.locator('.ody-bounds').textContent(), /below/);
  assert.equal(await row.getByLabel('At least samples', { exact: true }).isDisabled(), true);
  await page.getByLabel('Use per-parameter sample minimums', { exact: true }).check();
  assert.match(await page.locator('[data-estimate]').textContent(), /^5 runs/);
  await page.getByLabel('Use per-parameter sample minimums', { exact: true }).uncheck();
  assert.match(await page.locator('[data-estimate]').textContent(), /^2 runs/);
  console.log('Static UI: two samples, toolbar capture, SVG metadata, preference isolation, reload and ZIP download passed.');

  // Exercise the exported browser engine with real filesystem handles from this
  // fresh test browser's private filesystem (no user picker/files are touched).
  await page.evaluate(async () => {
    const { BrowserOdyssey } = await import('./client.js');
    const { DEFAULTS, clone, flattenParams, defaultParam } = await import('./search.js');
    window.testClient = await new BrowserOdyssey().open();
    window.makeSettings = (id, extra = {}) => {
      const app = testClient.catalog.apps.find(a => a.id === id);
      return { ...clone(DEFAULTS), samples: 1, frames: 4, width: 800, height: 600, intervalMs: 100, ...extra,
        apps: { [id]: { enabled: true, params: Object.fromEntries(flattenParams(app.params).map(p => [p.key, { ...defaultParam(p), enabled: false }])) } } };
    };
    const root = await navigator.storage.getDirectory();
    window.outputDirectory = await root.getDirectoryHandle('odyssey-test-output', { create: true });
    window.showDirectoryPicker = async () => outputDirectory;
    await testClient.chooseDirectory();
  });
  const animated = await page.evaluate(async () => {
    const settings = makeSettings('lissajousFigures');
    settings.apps.lissajousFigures.params.curveCount.fixed = 2;
    settings.apps.lissajousFigures.params.samples.fixed = 100;
    const result = await testClient.request('start', settings);
    await testClient.request('pause', { id: result.id }); return result.id;
  });
  await waitStatus(animated, 'paused');
  const before = await page.evaluate(id => testClient.sessions.get(id).runs.flatMap(r => r.frames).length, animated);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(await page.evaluate(id => testClient.sessions.get(id).runs.flatMap(r => r.frames).length, animated), before);
  await page.evaluate(id => testClient.request('resume', { id }), animated);
  await waitStatus(animated, 'complete');
  const animation = await page.evaluate(async id => {
    await testClient.task;
    const session = testClient.sessions.get(id), run = session.runs[0];
    const first = await (await testClient.storage.read(id, run.frames[0].file)).text();
    const last = await (await testClient.storage.read(id, run.frames.at(-1).file)).text();
    const paths = text => [...new DOMParser().parseFromString(text, 'image/svg+xml').querySelectorAll('path')].map(p => p.getAttribute('d'));
    const directory = await outputDirectory.getDirectoryHandle(id);
    const manifest = JSON.parse(await (await (await directory.getFileHandle('manifest.json')).getFile()).text());
    const runDir = await directory.getDirectoryHandle(run.id);
    const savedSVG = await (await (await runDir.getFileHandle('frame-00004.svg')).getFile()).text();
    const savedState = JSON.parse(await (await (await runDir.getFileHandle('frame-00004.json')).getFile()).text());
    return { count: run.frames.length, status: run.status, first: paths(first), last: paths(last), times: run.frames.map(f => f.timeMs), manifest: manifest.status, savedSVG: savedSVG === last, curveCount: savedState.curveCount };
  }, animated);
  assert.equal(animation.count, 4); assert.equal(animation.status, 'complete'); assert.notDeepEqual(animation.first, animation.last);
  assert.ok(Math.abs(animation.times[3] - animation.times[0] - 300) < 0.01);
  assert.equal(animation.manifest, 'complete'); assert.equal(animation.savedSVG, true); assert.equal(animation.curveCount, 2);
  console.log('Browser engine: pause/resume, frozen simulation clock, animated frames and native JSON/SVG file writes passed.');

  // An unresponsive asynchronous source must time out and allow the next run.
  await page.route('**/odyssey-test-no-ready/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>Loading</body>' }));
  await page.route('**/odyssey-test-no-frame/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="vis"></div><div id="config"></div><script type="module">
    import {registerVisual,runVisualApp} from '/helper/visualHelp.js';
    window.addEventListener('message', event => { if(event.data.command === 'capture') event.stopImmediatePropagation(); });
    registerVisual('fixture',{title:'Frame timeout',params:[],create({mountEl}) {return {render(){mountEl.innerHTML='<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>'}}}});
    runVisualApp({visualId:'fixture',mountEl:document.querySelector('#vis'),uiEl:document.querySelector('#config')});</script>` }));
  const deadline = await page.evaluate(async () => {
    const original = testClient.catalog;
    const actual = original.apps.find(a => a.id === 'voronoiFluid');
    const settings = makeSettings(actual.id, { frames: 1, computeMs: 500, frameMs: 500, intervalMs: 0 });
    settings.apps.voronoiFluid.params.pointCount.fixed = 4;
    testClient.catalog = { apps: [
      { id: 'neverReady', title: 'Compute timeout', params: [], url: '/odyssey-test-no-ready/' },
      { id: 'neverFrame', title: 'Frame timeout', params: [], url: '/odyssey-test-no-frame/' }, actual
    ], failures: [] };
    settings.apps.neverReady = { enabled: true, params: {} }; settings.apps.neverFrame = { enabled: true, params: {} };
    const result = await testClient.request('start', settings);
    testClient.catalog = original; return result.id;
  });
  await waitStatus(deadline, 'complete');
  const timed = await page.evaluate(id => testClient.sessions.get(id).runs.map(r => ({ status: r.status, error: r.error })), deadline);
  assert.deepEqual(timed.map(r => r.status), ['timeout', 'timeout', 'complete']);
  assert.match(timed[0].error, /Compute deadline/); assert.match(timed[1].error, /Frame deadline/);
  assert.equal(await page.locator('iframe[title="Odyssey source capture"]').count(), 0);
  console.log('Compute/frame deadlines, failure continuation and iframe cleanup passed.');

  const interrupted = await page.evaluate(async () => {
    await testClient.task;
    const settings = makeSettings('lissajousFigures', { frames: 5 });
    const result = await testClient.request('start', settings); await testClient.request('pause', { id: result.id }); return result.id;
  });
  await waitStatus(interrupted, 'paused');
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector('.odyssey-panel'), {}, {timeout:5000});
  await page.evaluate(async () => { const {BrowserOdyssey} = await import('./client.js'); window.testClient = await new BrowserOdyssey().open(); });
  assert.equal(await page.evaluate(id => testClient.sessions.get(id).status, interrupted), 'paused');
  await page.evaluate(id => testClient.request('resume', { id }), interrupted);
  await waitStatus(interrupted, 'complete');
  assert.equal(await page.evaluate(id => testClient.sessions.get(id).runs[0].frames.length, interrupted), 5);
  // Disk errors pause the queue and retain browser data for a retry.
  const diskFailure = await page.evaluate(async () => {
    await testClient.task;
    const {DEFAULTS,clone} = await import('./search.js');
    const a = testClient.catalog.apps.find(a => a.id === 'voronoiFluid');
    const settings = {...clone(DEFAULTS),samples:1,frames:2,apps:{[a.id]:{enabled:true,params:{pointCount:{enabled:false,fixed:4}}}}};
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('odyssey-test-output',{create:true});
    await testClient.chooseDirectory();
    const write = testClient.storage.writeDisk.bind(testClient.storage);
    testClient.storage.writeDisk = async (path,value) => { if (path.endsWith('.svg')) throw new Error('Disk save failed: fixture'); return write(path,value); };
    window.restoreWrite = () => { testClient.storage.writeDisk = write; };
    const result = await testClient.request('start',settings); return result.id;
  });
  await waitStatus(diskFailure, 'paused');
  assert.match(await page.evaluate(id => testClient.sessions.get(id).message, diskFailure), /Disk save failed/);
  await page.evaluate(id => { restoreWrite(); return testClient.request('resume',{id}); }, diskFailure);
  await waitStatus(diskFailure, 'complete');
  console.log('Reload recovery and disk-error pause/retry passed.');

  const stoppedId = await page.evaluate(async () => {
    await testClient.task;
    const settings = structuredClone(testClient.settings); settings.frames = 50;
    const result = await testClient.request('start',settings);
    await testClient.request('pause',{id:result.id}); return result.id;
  });
  await waitStatus(stoppedId,'paused');
  await page.evaluate(async id => { await testClient.request('stop',{id}); await testClient.task; },stoppedId);
  assert.equal(await page.evaluate(id => testClient.sessions.get(id).status,stoppedId),'stopped');
  assert.equal(await page.locator('iframe[title="Odyssey source capture"]').count(),0);
  const folderRead = await page.evaluate(async id => {
    const imported = await testClient.storage.importDirectory(), session = imported.find(s=>s.id===id);
    const get = testClient.storage.get.bind(testClient.storage);
    testClient.storage.get = (store,key) => store==='files' ? Promise.resolve(undefined) : get(store,key);
    const frame = await testClient.storage.read(id,session.runs[0].frames[0].file);
    testClient.storage.get = get;
    return { count:imported.length, svg:(await frame.text()).includes('ohey-settings') };
  },animated);
  assert.ok(folderRead.count >= 3); assert.equal(folderRead.svg,true);
  const gallery = await page.evaluate(async () => {
    const {VisualFrame} = await import('./client.js');
    const frame = new VisualFrame('/ART/',{mode:'run',state:{},width:400,height:300});
    try { await frame.prepare(5000); return ''; } catch(error) { return error.message; } finally { frame.destroy(); }
  });
  assert.match(gallery,/does not expose a generated SVG/);
  const initialSave = await page.evaluate(async () => {
    const write = testClient.storage.writeDisk.bind(testClient.storage);
    testClient.storage.writeDisk = async (path,value) => { if(path.endsWith('/settings.json')) throw new Error('Initial save fixture'); return write(path,value); };
    const settings = structuredClone(testClient.settings); settings.frames = 1;
    let message;
    try { await testClient.request('start',settings); } catch(error) { message=error.message; }
    testClient.storage.writeDisk = write;
    const session = [...testClient.sessions.values()].at(-1);
    return {id:session.id,status:session.status,message};
  });
  assert.equal(initialSave.status,'paused'); assert.match(initialSave.message,/Initial save fixture/);
  await page.evaluate(id=>testClient.request('resume',{id}),initialSave.id);
  await waitStatus(initialSave.id,'complete');
  assert.equal(await page.evaluate(async id => { const dir=await testClient.storage.directory.getDirectoryHandle(id); return (await dir.getFileHandle('settings.json')).kind; },initialSave.id),'file');
  console.log('Stop, saved-folder import, initial-save recovery and explicit gallery capture limitation passed.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: new URL('../.cache/odyssey-static-mobile.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  assert.equal(requests.some(r => /:8787\b|\/__odyssey\//.test(r)), false, 'No backend requests');
  assert.deepEqual(errors, []);
  console.log('Mobile layout, no page errors and no backend dependency passed.');
} finally { await browser.close(); }
