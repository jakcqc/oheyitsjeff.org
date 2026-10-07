/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run with node tests/time-attractors.mjs. Uses a disposable browser/server.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(root, '.cache');
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const executablePath = process.env.CHROME_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const insideRoot = file => file === path.resolve(root) || file.startsWith(path.resolve(root) + path.sep);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    assert.ok(insideRoot(file));
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    file = await realpath(file);
    assert.ok(insideRoot(file));
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404); response.end('Not found'); }
});
await mkdir(cache, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [], checks = [], sizes = {};
page.on('pageerror', error => errors.push(error.message));
const note = message => { checks.push(message); console.log('PASS ' + message); };
await context.route('https://**/*', async route => {
  const url = route.request().url();
  const dependency = url.includes('d3') && url.endsWith('.js') ? 'd3.cjs' : url.includes('math') && url.endsWith('.js') ? 'math.cjs' : null;
  await route.fulfill(dependency
    ? { contentType: 'text/javascript', body: await readFile(path.join(cache, 'abstract-export-deps', dependency)) }
    : { contentType: 'text/css', body: '' });
});

async function download(button, filename) {
  const started = page.waitForEvent('download');
  await button.evaluate(node => node.click());
  const artifact = path.join(cache, filename);
  await (await started).saveAs(artifact);
  return readFile(artifact, 'utf8');
}

async function inspectSnapshot(label) {
  return page.evaluate(async label => {
    const { captureTimeSnapshot, makeTimeComposition } = await import('/helper/timeSvg.js');
    const svg = document.querySelector('#vis > svg');
    const captureStart = performance.now();
    const snapshot = captureTimeSnapshot(svg, { id: label });
    const captureMilliseconds = performance.now() - captureStart;
    const clone = svg.cloneNode(true);
    clone.setAttribute('width', snapshot.width); clone.setAttribute('height', snapshot.height);
    const serializer = new XMLSerializer();
    const raw = serializer.serializeToString(clone);
    const composition = serializer.serializeToString(makeTimeComposition({ width: snapshot.width, height: snapshot.height }, [snapshot], [
      { x: 0, y: 0, width: snapshot.width, height: snapshot.height },
    ]));
    async function pixels(text) {
      const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 384;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 384, 384);
        return ctx.getImageData(0, 0, 384, 384).data;
      } finally { URL.revokeObjectURL(url); }
    }
    const [live, captured] = await Promise.all([pixels(raw), pixels(composition)]);
    let painted = 0, changed = 0, edgePainted = 0;
    for (let i = 0; i < captured.length; i += 4) {
      const index = i / 4, x = index % 384, y = Math.floor(index / 384);
      if (captured[i + 3]) painted++;
      if (Math.max(...[0, 1, 2, 3].map(c => Math.abs(live[i + c] - captured[i + c]))) > 30) changed++;
      if ((x < 3 || y < 3 || x >= 381 || y >= 381) && captured[i + 3]) edgePainted++;
    }
    const parsed = new DOMParser().parseFromString(snapshot.svg, 'image/svg+xml');
    const drawable = [...parsed.querySelectorAll('rect,circle,path,polygon,polyline,ellipse,line')]
      .filter(node => !node.closest('defs,clipPath,mask'));
    return {
      rawBytes: new Blob([raw]).size, snapshotBytes: new Blob([snapshot.svg]).size, captureMilliseconds,
      compositionBytes: new Blob([composition]).size, changed, painted, edgePainted,
      backgroundShapes: drawable.filter(node => !node.hasAttribute('data-marks')).map(node => ({
        name: node.localName, fill: node.getAttribute('fill'), math: node.getAttribute('data-xf-math'),
      })),
      hasGeometryCSS: [...parsed.querySelectorAll('path')].some(node => !!node.style.getPropertyValue('d')),
      parseErrors: parsed.querySelectorAll('parsererror').length,
    };
  }, label);
}

try {
  await page.goto(origin + '/PureAttractors/');
  await page.waitForFunction(() => window.pureAttractorsApp && document.querySelector('#vis svg')?.dataset.ready === 'true');
  sizes.default = await inspectSnapshot('default');
  console.log('Default measurement ' + JSON.stringify(sizes.default));
  assert.deepEqual(sizes.default.backgroundShapes, [], 'Default attractor contains only ink geometry');
  assert.equal(sizes.default.edgePainted, 0, 'Standalone Time SVG is transparent beyond the attractor');
  assert.ok(sizes.default.painted > 1000, 'Snapshot preserves visible attractor marks');
  assert.ok(sizes.default.changed < 384 * 384 * .01, 'Captured appearance matches the live vector image');
  assert.equal(sizes.default.hasGeometryCSS, false, 'Static path geometry is stored only once');
  note('Default attractor snapshots retain their appearance and transparent surroundings.');

  // Compact square marks expose path duplication and excessive style overhead.
  await page.evaluate(() => {
    const app = window.pureAttractorsApp;
    Object.assign(app.state, { samples: 40000, resolution: 300, pointShape: 'Square' }); app.refresh();
  });
  const single = await download(page.getByRole('button', { name: 'Save SVG', exact: true }), 'time-attractors-after-single.svg');
  sizes.singleBytes = Buffer.byteLength(single);
  const toggle = page.getByRole('button', { name: 'Show or hide tabs', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('tab', { name: 'Time', exact: true }).click();
  const time = page.locator('[data-time-panel]');
  for (const [label, value] of [['Columns', 3], ['Rows', 2]]) {
    const input = time.getByLabel(label, { exact: true }); await input.fill(String(value)); await input.blur();
  }
  for (let i = 0; i < 6; i++) await time.getByRole('button', { name: 'Take snapshot', exact: true }).click();
  assert.equal(await time.locator('.time-preview g[data-time-index]').count(), 6);
  const composed = await download(time.getByRole('button', { name: 'Download SVG', exact: true }), 'time-attractors-after-six.svg');
  sizes.sixBytes = Buffer.byteLength(composed);
  sizes.sixOverSingleRatio = sizes.sixBytes / sizes.singleBytes;
  sizes.perFrameOverhead = sizes.sixBytes / 6 / sizes.singleBytes;
  console.log('Toolbar measurement ' + JSON.stringify(sizes));
  assert.ok(sizes.sixBytes < sizes.singleBytes * 6 * 1.15,
    `Six-frame SVG (${sizes.sixBytes}) must stay near six single exports (${sizes.singleBytes})`);
  const exportCheck = await page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    return { errors: doc.querySelectorAll('parsererror').length, frames: doc.querySelectorAll(':root > g > svg').length,
      overlays: doc.querySelectorAll('.time-guides, :root > g > rect').length,
      paths: doc.querySelectorAll('path[data-marks]').length };
  }, composed);
  assert.equal(exportCheck.errors, 0); assert.equal(exportCheck.frames, 6); assert.equal(exportCheck.overlays, 0);
  assert.ok(exportCheck.paths >= 6);
  note('Six actual toolbar captures export as six vector frames with less than 15% per-frame size overhead.');
  await page.screenshot({ path: path.join(cache, 'time-attractors-six.png'), fullPage: false, animations: 'disabled' });

  await page.evaluate(() => {
    const app = window.pureAttractorsApp;
    Object.assign(app.state, { samples: 10000, resolution: 100, palette: 'Paper' });
    app.state.__xf.stack = [{ kind: 'warp', type: 'vortex', strength: .7 }, { kind: 'kaleidoscope', count: 4 }];
    app.refresh();
  });
  await page.waitForFunction(() => document.querySelector('#vis [data-xf-layer] path[data-xf-math]'));
  assert.equal(await page.locator('#vis').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(243, 237, 223)',
    'Paper palette retains its light HTML viewing surface');
  assert.equal(await page.locator('#vis > svg').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)',
    'The SVG itself stays transparent');
  sizes.warped = await inspectSnapshot('warped');
  assert.deepEqual(sizes.warped.backgroundShapes, [], 'Warped/kaleidoscopic attractor has no dark background polygons');
  assert.equal(sizes.warped.parseErrors, 0);
  assert.equal(sizes.warped.edgePainted, 0, 'Warped export keeps transparent corners');
  assert.ok(sizes.warped.painted > 100);
  assert.ok(sizes.warped.changed < 384 * 384 * .01, 'Warped snapshot preserves the live image');
  note('Paper palette plus math warp and kaleidoscope retain the viewing surface and capture only attractor geometry.');

  await page.evaluate(() => {
    const app = window.pureAttractorsApp;
    app.state.__xf.stack = []; app.state.showDisks = true; app.refresh();
  });
  assert.equal(await page.locator('#vis .pa-disk > circle').count(), 2, 'Explicit Disk frames still draw both frame shapes');
  await page.evaluate(() => window.pureAttractorsApp.setParam('showDisks', false));
  assert.equal(await page.locator('#vis .pa-disk > circle').count(), 0, 'Turning Disk frames off removes their geometry');
  note('Disk frames remain available when requested and disappear completely when disabled.');

  await page.evaluate(() => window.pureAttractorsApp.setParam('view', 'Bestiary'));
  const blankSpot = await page.evaluate(() => {
    for (const disk of document.querySelectorAll('#vis [data-pa-preset]')) {
      const box = disk.getBoundingClientRect();
      const paths = [...disk.querySelectorAll('path')];
      for (const xFraction of [.5, .2, .8]) for (const yFraction of [.5, .2, .8]) {
        const x = box.x + box.width * xFraction, y = box.y + box.height * yFraction;
        const point = new DOMPoint(x, y);
        if (document.elementFromPoint(x, y)?.closest('[data-pa-preset]') !== disk) continue;
        if (paths.some(path => path.isPointInFill(point.matrixTransform(path.getScreenCTM().inverse())))) continue;
        return { x, y, preset: disk.dataset.paPreset };
      }
    }
    return null;
  });
  assert.ok(blankSpot, 'A blank part of the frameless specimen remains a pointer target');
  await page.mouse.click(blankSpot.x, blankSpot.y);
  assert.equal(await page.evaluate(() => window.pureAttractorsApp.state.view), 'Single attractor');
  assert.equal(await page.evaluate(() => window.pureAttractorsApp.state.preset), blankSpot.preset);
  note('A real pointer click in blank specimen space opens the frameless bestiary attractor.');
  assert.deepEqual(errors, [], 'No browser errors');
  await writeFile(path.join(cache, 'time-attractors-validation.json'), JSON.stringify({ result: 'pass', sizes, checks, errors }, null, 2) + '\n');
} finally {
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
}
