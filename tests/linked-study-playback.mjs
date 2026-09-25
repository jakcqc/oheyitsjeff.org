// Run with PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE when not installed locally.
// Uses an isolated browser profile and a temporary local static server.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, stat, realpath, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const review = path.join(root, '.local/abstract-studies/verification');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.md':'text/plain' };
const server = createServer(async (req, res) => {
  try {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    assert.ok(file.startsWith(root));
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    file = await realpath(file);
    assert.ok(file.startsWith(root));
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    if (file === path.join(root, 'helper/visualHelp.js')) {
      const source = await readFile(file, 'utf8');
      res.end(source.replace('  const runtimeRef = { instance: null, xfRuntime: null };', '  window.__studyInitial = JSON.parse(JSON.stringify(state));\n  const runtimeRef = { instance: null, xfRuntime: null };').replace('  return {\n    spec,\n    state,', '  window.__linkedApp = { spec, state, setParam, refresh, toggleSimulation };\n  return {\n    spec,\n    state,'));
    } else createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const requests = [], errors = [], checks = [];
page.on('request', request => requests.push(request.url()));
page.on('pageerror', error => errors.push(String(error)));
await context.route('https://**/*', async route => {
  const url = route.request().url();
  const dependency = url.includes('d3') && url.endsWith('.js') ? 'd3.cjs' : url.includes('math') && url.endsWith('.js') ? 'math.cjs' : null;
  if (dependency) return route.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(root, '.cache/abstract-export-deps', dependency)) });
  return route.fulfill({ contentType: 'text/css', body: '' });
});

const catalog = JSON.parse(await readFile(path.join(root, 'Apps/studies/catalog.json'), 'utf8'));
const selected = new Map();
for (const collection of ['algebra', 'extreme', 'original']) {
  for (const record of catalog.filter(item => item.collection === collection)) {
    if (!selected.has(record.app)) selected.set(record.app, record);
  }
}
selected.set('GameOfLife_aug', catalog.find(item => item.slug === 'algebra-life-without-its-zeros'));
selected.set('MarbledPatterns', catalog.find(item => item.slug === 'algebra-rose-velocity-commutator'));
const cases = [...selected.values()];
for (const record of catalog.filter(item => ['GameOfLife_aug', 'MarbledPatterns'].includes(item.app) && item.collection === 'algebra')) {
  if (!cases.some(item => item.slug === record.slug)) cases.push(record);
}
const rows = [];
await mkdir(review, { recursive: true });
function linkedUrl(record) {
  const url = new URL('/' + record.app + '/index.html', origin);
  url.searchParams.set('settings', '/Apps/studies/settings/' + record.slug + '.json');
  url.searchParams.set('settingsVisual', record.visualId);
  return url.href;
}
async function picture() {
  return page.evaluate(async () => {
    const svg = document.querySelector('#vis svg');
    const bytes = new TextEncoder().encode(svg.outerHTML);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return {
      hash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
      shapes: svg.querySelectorAll('path,line,circle,rect,polygon,polyline').length,
      spline: svg.querySelectorAll('[data-spline-lines-group="1"]').length,
      scale: svg.querySelectorAll('[data-scale-clone="1"]').length,
      convert: svg.querySelectorAll('[data-convert-run]').length,
    };
  });
}
function verifyFlow(record, settings, geometry) {
  const effects = settings.__toolFlows?.stages.filter(stage => stage.enabled !== false).map(stage => stage.config?.effectType) || [];
  if (effects.includes('splineLines')) assert.ok(geometry.spline > 0, record.slug + ': spline chain must be applied visibly');
  else if (effects.includes('scale')) assert.ok(geometry.scale > 0, record.slug + ': scale chain must be applied visibly');
  else if (effects.includes('convert')) assert.ok(geometry.convert > 0, record.slug + ': conversion chain must be applied visibly');
  assert.ok(geometry.shapes > 0, record.slug + ': linked app must render a picture');
}
async function waitForFlow(settings) {
  const effects = settings.__toolFlows?.stages.filter(stage => stage.enabled !== false).map(stage => stage.config?.effectType) || [];
  const selector = effects.includes('splineLines') ? '[data-spline-lines-group="1"]' : effects.includes('scale') ? '[data-scale-clone="1"]' : effects.includes('convert') ? '[data-convert-run]' : 'path,line,circle,rect';
  await page.waitForFunction(selector => document.querySelector('#vis svg')?.querySelector(selector), selector, { timeout: 30000 });
}
try {
  const enabledApps = (process.env.STUDY_APPS || process.env.STUDY_APP || '').split(',').filter(Boolean);
  for (const record of cases.filter(record => !enabledApps.length || enabledApps.includes(record.app))) {
    const settings = JSON.parse(await readFile(path.join(root, 'Apps/studies/settings', record.slug + '.json'), 'utf8'));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(linkedUrl(record), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__linkedApp && document.querySelector('#vis svg'), null, { timeout: 90000 });
    await page.waitForTimeout(450);
    const playback = await page.evaluate(() => {
      const { state, spec } = window.__linkedApp;
      const key = spec.simulation?.param;
      return {
        autoPlay: state.__anim?.ui?.autoPlay,
        key, runningValue: spec.simulation?.runningValue ?? true,
        native: key && key.split('.').reduce((value, part) => value?.[part], state),
        initialNative: key && key.split('.').reduce((value, part) => value?.[part], window.__studyInitial),
        flows: state.__toolFlows?.stages,
      };
    });
    assert.equal(playback.autoPlay, false, record.slug + ': animation autoplay must be disabled');
    if (playback.key) {
      assert.equal(playback.native, !playback.runningValue, record.slug + ': native simulation starts paused');
      assert.equal(playback.initialNative, !playback.runningValue, record.slug + ': paused before factory');
    }
    assert.deepEqual(playback.flows, settings.__toolFlows?.stages, record.slug + ': flow configuration retained');
    await waitForFlow(settings);
    const before = await picture();
    verifyFlow(record, settings, before);
    await page.waitForTimeout(400);
    const after = await picture();
    assert.equal(after.hash, before.hash, record.slug + ': paused composition must stay stable without repeated chains');
    await page.setViewportSize({ width: 1320, height: 920 });
    await page.waitForTimeout(450);
    await waitForFlow(settings);
    const resized = await picture();
    verifyFlow(record, settings, resized);
    await page.waitForTimeout(250);
    assert.equal((await picture()).hash, resized.hash, record.slug + ': resized composition must settle and stay paused');
    if (record.app === 'BacteriaVisualizer') {
      const expectedCounts = { spline: resized.spline, scale: resized.scale, convert: resized.convert, shapes: resized.shapes };
      for (let repeat = 0; repeat < 2; repeat++) {
        await page.evaluate(() => window.__linkedApp.refresh());
        await waitForFlow(settings);
        const refreshed = await picture();
        assert.deepEqual({ spline: refreshed.spline, scale: refreshed.scale, convert: refreshed.convert, shapes: refreshed.shapes }, expectedCounts, 'Bacteria refresh must not accumulate effect output');
      }
    }
    if (playback.key) {
      const resumed = await page.evaluate(() => {
        const app = window.__linkedApp;
        const result = app.toggleSimulation();
        return { result, value: app.spec.simulation.param.split('.').reduce((v, part) => v?.[part], app.state) };
      });
      assert.equal(resumed.result, true);
      assert.equal(resumed.value, playback.runningValue, record.slug + ': user can resume');
      await page.evaluate(() => window.__linkedApp.toggleSimulation());
    }
    rows.push({ app: record.app, slug: record.slug, paused: true, flowApplied: true, stable: true, afterResize: true, shapes: after.shapes });
    console.log('PASS ' + record.app + ': paused, applied chain, stable after resize (' + record.slug + ')');
  }
  // User controls remain able to start a study; ordinary launches keep their defaults.
  const marbled = selected.get('MarbledPatterns');
  await page.goto(linkedUrl(marbled));
  await page.waitForFunction(() => window.__linkedApp);
  const savedCount = await page.evaluate(() => window.__linkedApp.state.bandCount);
  await page.keyboard.press('p');
  await page.waitForTimeout(250);
  assert.notEqual(await page.evaluate(() => window.__linkedApp.state.bandCount), savedCount, 'Animation can be started manually');
  await page.keyboard.press('p');
  const pausedCount = await page.evaluate(() => window.__linkedApp.state.bandCount);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__linkedApp.state.bandCount), pausedCount, 'Manual pause holds the animated setting');
  await page.evaluate(() => localStorage.clear());
  await page.goto(origin + '/MarbledPatterns/');
  await page.waitForFunction(() => window.__linkedApp);
  assert.equal(await page.evaluate(() => window.__linkedApp.state.__anim.ui.autoPlay), true, 'Normal Marbled launch keeps autoplay');
  await page.goto(origin + '/GameOfLife_aug/');
  await page.waitForFunction(() => window.__linkedApp);
  assert.equal(await page.evaluate(() => window.__linkedApp.state.running), true, 'Normal Life launch keeps native playback');
  assert.deepEqual(errors, []);
  const reportSuffix = process.env.STUDY_APPS || process.env.STUDY_APP ? '-partial' : '';
  await writeFile(path.join(review, 'linked-study-playback' + reportSuffix + '.json'), JSON.stringify({ result:'pass', checkedAt:new Date().toISOString(), apps:new Set(rows.map(row => row.app)).size, studies:rows.length, rows, errors }, null, 2) + '\n');
} catch (error) {
  const diagnostic = await page.evaluate(() => ({ url: location.href, app: window.__linkedApp?.spec?.title, state: window.__linkedApp?.state, shapes: document.querySelector('#vis svg')?.querySelectorAll('path,line,circle,rect').length, convert: document.querySelectorAll('#vis [data-convert-run]').length, spline: document.querySelectorAll('#vis [data-spline-lines-group]').length }));
  await writeFile(path.join(review, 'linked-study-playback-failure.json'), JSON.stringify({ error: String(error), errors, ...diagnostic }, null, 2));
  console.log(JSON.stringify({ error: String(error), errors, app: diagnostic.app, shapes: diagnostic.shapes, convert: diagnostic.convert, spline: diagnostic.spline }));
  throw error;
} finally {
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
}
