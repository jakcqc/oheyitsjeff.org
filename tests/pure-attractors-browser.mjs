/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run with node tests/pure-attractors-browser.mjs. PLAYWRIGHT_MODULE and
// BROWSER_EXECUTABLE can select an installed Playwright package and browser.
// An isolated browser profile and temporary local server leave user tabs alone.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(root, '.cache');
const require = createRequire(import.meta.url);
let playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) {
  try { playwrightModule = require.resolve('playwright'); }
  catch { playwrightModule = path.join(root, 'TheOdyssey/node_modules/playwright'); }
}
const { chromium } = require(playwrightModule);
const executablePath = process.env.BROWSER_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain' };
const insideRoot = file => file === path.resolve(root) || file.startsWith(path.resolve(root) + path.sep);
const server = createServer(async (request, response) => {
  try {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    assert.ok(insideRoot(file));
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    file = await realpath(file);
    assert.ok(insideRoot(file));
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await mkdir(cache, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const note = message => { checks.push(message); console.log('PASS ' + message); };
const serveDependency = async route => {
  const url = route.request().url();
  const dependency = url.includes('d3') && url.endsWith('.js') ? 'd3.cjs' : url.includes('math') && url.endsWith('.js') ? 'math.cjs' : null;
  if (dependency) {
    await route.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(cache, 'abstract-export-deps', dependency)) });
  } else {
    await route.fulfill({ contentType: 'text/css', body: '' });
  }
};
await context.route('https://**/*', serveDependency);

const setParam = (key, value) => page.evaluate(({ key, value }) => window.pureAttractorsApp.setParam(key, value), { key, value });
const waitForInk = (disks = 1) => page.waitForFunction(count => {
  const disks = [...document.querySelectorAll('#vis g.pa-disk')];
  return disks.length === count && disks.every(disk => [...disk.querySelectorAll('path.pa-ink')].some(path => (path.getAttribute('d') || '').length > 100));
}, disks, { timeout: 60000 });
const readInk = () => page.locator('#vis path.pa-ink').evaluateAll(paths => paths.map(path => ({
  d: path.getAttribute('d'),
  fill: path.getAttribute('fill'),
  stroke: path.getAttribute('stroke'),
  strokeWidth: Number(path.getAttribute('stroke-width')),
  marks: Number(path.dataset.marks),
  opacity: path.getAttribute('opacity') || path.getAttribute('fill-opacity'),
})));
const openControls = async () => {
  if (!await page.locator('#config').evaluate(panel => panel.classList.contains('open'))) await page.locator('#button-info').click();
};
const screenshotArtwork = async filename => {
  const pinned = await page.locator('#config').evaluate(panel => panel.classList.contains('pinned'));
  const wasOpen = await page.locator('#config').evaluate(panel => panel.classList.contains('open'));
  if (wasOpen && !pinned) await page.locator('#button-info').click();
  await page.screenshot({ path: path.join(cache, filename), fullPage: false, animations: 'disabled' });
  if (wasOpen && !pinned) await page.locator('#button-info').click();
};
const selectParam = async (key, value) => {
  const label = await page.evaluate(key => window.pureAttractorsApp.spec.params.find(param => param.key === key).label, key);
  await page.getByLabel(label, { exact: true }).selectOption(value);
};
const checkParam = async (key, checked) => {
  const label = await page.evaluate(key => window.pureAttractorsApp.spec.params.find(param => param.key === key).label, key);
  await page.getByLabel(label, { exact: true }).setChecked(checked);
};
const expandParameterGroups = async target => {
  for (const group of await target.locator('details.vr-paramGroup:not([hidden])').all()) {
    if (!await group.evaluate(group => group.open)) await group.locator(':scope > summary').click();
  }
};
const showTabs = async target => {
  const toggle = target.getByRole('button', { name: 'Show or hide tabs', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
};
const sharedUI = target => target.evaluate(() => {
  const panel = document.querySelector('#config');
  const rect = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  return {
    pinned: panel.classList.contains('pinned'), open: panel.classList.contains('open'),
    groupsCollapsed: [...panel.querySelectorAll('details.vr-paramGroup')].every(group => !group.open),
    tabs: [...panel.querySelectorAll('[role="tablist"][aria-label="Visual controls"] [role="tab"]')].map(tab => tab.textContent),
    selectedTab: panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    panes: panel.querySelectorAll('.vr-dockPane').length,
    box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    css: { position: style.position, boxSizing: style.boxSizing, padding: style.padding, border: style.borderWidth, maxHeight: style.maxHeight },
  };
});
const waitForUI = target => target.waitForSelector('#config .vr-dockLayout', { state: 'attached' });

async function verifySharedDocking() {
  const dockPage = await context.newPage();
  const reference = await context.newPage();
  dockPage.on('pageerror', error => errors.push(error.message));
  reference.on('pageerror', error => errors.push('Lorenz reference: ' + error.message));
  try {
    await Promise.all([dockPage.goto(origin + '/PureAttractors/'), reference.goto(origin + '/LorenzAttractor/')]);
    await Promise.all([waitForUI(dockPage), waitForUI(reference)]);
    const defaults = await sharedUI(dockPage);
    const lorenzDefaults = await sharedUI(reference);
    assert.deepEqual(defaults, lorenzDefaults, 'Pure Attractors uses the same default docking UI and panel geometry as Lorenz');
    assert.ok(defaults.pinned && defaults.open && defaults.groupsCollapsed && defaults.panes === 1);
    await reference.close();
    await showTabs(dockPage);
    await dockPage.getByRole('tab', { name: 'developer', exact: true }).click();
    assert.equal(await dockPage.getByLabel('Start categories collapsed', { exact: true }).isChecked(), true);
    await dockPage.getByLabel('Remember settings for this visual', { exact: true }).check();
    const pinnedWidth = await dockPage.locator('#vis').evaluate(vis => vis.getBoundingClientRect().width);
    await dockPage.getByRole('button', { name: 'Unpin UI', exact: true }).click();
    await dockPage.waitForFunction(width => !document.querySelector('#config').classList.contains('pinned') && document.querySelector('#vis').getBoundingClientRect().width > width + 100, pinnedWidth);
    await dockPage.locator('#button-info').click();
    assert.equal(await dockPage.locator('#config').evaluate(panel => panel.classList.contains('open')), false);
    await dockPage.locator('#button-info').click();
    assert.equal(await dockPage.locator('#config').evaluate(panel => panel.classList.contains('open')), true);
    await dockPage.getByRole('button', { name: 'Pin UI', exact: true }).click();
    await dockPage.waitForFunction(width => document.querySelector('#config').classList.contains('pinned') && document.querySelector('#vis').getBoundingClientRect().width <= width + 1, pinnedWidth);
    const initialPanelWidth = await dockPage.locator('#config').evaluate(panel => panel.getBoundingClientRect().width);
    const handle = await dockPage.getByRole('button', { name: 'Resize pinned panel', exact: true }).boundingBox();
    // Shared panel scrolling clips the handle's outer half; grab its visible edge.
    const handleX = handle.x + handle.width - 2;
    await dockPage.mouse.move(handleX, handle.y + handle.height / 2);
    await dockPage.mouse.down();
    await dockPage.mouse.move(handleX - 110, handle.y + handle.height / 2, { steps: 5 });
    await dockPage.mouse.up();
    await dockPage.waitForFunction(width => document.querySelector('#config').getBoundingClientRect().width > width + 80, initialPanelWidth);
    assert.ok(await dockPage.locator('#vis').evaluate((vis, width) => vis.getBoundingClientRect().width < width - 80, pinnedWidth));
    note('Shared desktop defaults match Lorenz; pin/unpin, INFO popup and drag resizing adjust the artwork space.');

    await dockPage.getByRole('tab', { name: 'params', exact: true }).click();
    await dockPage.locator('details.vr-paramGroup').filter({ has: dockPage.locator('summary', { hasText: /^Explore$/ }) }).locator(':scope > summary').click();
    const pane = dockPage.locator('.vr-dockPane');
    const paneBounds = await pane.boundingBox();
    await dockPage.getByRole('tab', { name: 'developer', exact: true }).dragTo(pane, { targetPosition: { x: paneBounds.width - 8, y: Math.min(paneBounds.height / 2, 160) } });
    await dockPage.waitForFunction(() => document.querySelectorAll('.vr-dockPane').length === 2);
    const divider = dockPage.getByRole('separator', { name: 'Resize panels', exact: true });
    const beforeRatio = Number(await divider.getAttribute('aria-valuenow'));
    await divider.focus();
    await dockPage.keyboard.press('ArrowRight');
    assert.equal(Number(await divider.getAttribute('aria-valuenow')), beforeRatio + 5);
    await dockPage.screenshot({ path: path.join(cache, 'pure-attractors-docked.png'), fullPage: false, animations: 'disabled' });
    await dockPage.getByRole('button', { name: 'Hide Nav', exact: true }).click();
    const saved = await dockPage.evaluate(() => {
      const ui = window.pureAttractorsApp.state.__ui;
      return { dockLayout: ui.dockLayout, configWidth: ui.configWidth, configPinned: ui.configPinned, navHidden: ui.navHidden, paramGroups: ui.paramGroups };
    });
    await dockPage.reload();
    await dockPage.waitForFunction(() => window.pureAttractorsApp && document.querySelectorAll('.vr-dockPane').length === 2);
    const restored = await dockPage.evaluate(() => {
      const ui = window.pureAttractorsApp.state.__ui;
      return { dockLayout: ui.dockLayout, configWidth: ui.configWidth, configPinned: ui.configPinned, navHidden: ui.navHidden, paramGroups: ui.paramGroups };
    });
    assert.deepEqual(restored, saved, 'Split layout, resized width, pinning, category state and nav visibility survive reloading');
    assert.equal(await dockPage.locator('#infoBar').evaluate(bar => bar.classList.contains('hidden')), true);
    assert.deepEqual((await dockPage.locator('.vr-dockPane').evaluateAll(panes => panes.map(pane => pane.dataset.tab))).sort(), ['developer', 'params']);
    await dockPage.getByRole('button', { name: 'Show Nav', exact: true }).click();
    note('Dragging tabs creates split editors; keyboard resizing and remembered docking, panel width and header state survive reload.');
    return defaults;
  } finally {
    if (!reference.isClosed()) await reference.close();
    await dockPage.close();
  }
}

try {
  await page.goto(origin + '/PureAttractors/');
  await page.waitForFunction(() => window.pureAttractorsApp && document.querySelector('#vis svg'), null, { timeout: 60000 });
  await waitForInk();
  const initial = await readInk();
  assert.ok(initial.length > 1, 'Density should have several painted levels');
  assert.ok(initial.reduce((length, ink) => length + ink.d.length, 0) > 10000, 'Default attractor has meaningful geometry');
  assert.ok(initial.every(ink => !/NaN|Infinity/.test(ink.d)), 'Every path coordinate is finite');
  assert.equal(await page.locator('#vis canvas, #vis image').count(), 0, 'The artwork is entirely SVG');
  assert.equal(await page.locator('#vis svg text, #vis svg title').count(), 0, 'Artwork has no visible labels or hover tooltips');
  assert.equal(await page.locator('#config').evaluate(panel => panel.classList.contains('pinned') && panel.classList.contains('open')), true, 'Desktop starts with the shared pinned controls');
  const initialDisk = await page.locator('#vis g.pa-disk').evaluate(disk => ({ status: disk.dataset.status, width: disk.getBBox().width, height: disk.getBBox().height }));
  assert.ok(initialDisk.width > 100 && initialDisk.height > 100);
  await page.screenshot({ path: path.join(cache, 'pure-attractors-single.png'), fullPage: false });
  note('Default D5 attractor renders finite SVG geometry without labels or hover text beside the standard pinned controls.');
  const dockingDefaults = await verifySharedDocking();
  await page.evaluate(async () => {
    const { importStateFromJSON } = await import('/helper/visualHelp.js');
    const app = window.pureAttractorsApp;
    importStateFromJSON(JSON.stringify({ ...app.state, showLabels: true }), app.state, app.spec);
    app.refresh();
  });
  assert.equal(await page.locator('#vis svg text, #vis svg title').count(), 0, 'Legacy settings cannot restore labels');
  await openControls();
  await expandParameterGroups(page);
  assert.equal(await page.locator('#button-info').getAttribute('aria-expanded'), 'true');
  await page.screenshot({ path: path.join(cache, 'pure-attractors-controls.png'), fullPage: false, animations: 'disabled' });
  const defaultPreset = await page.evaluate(() => window.pureAttractorsApp.state.preset);
  await page.getByLabel('Specimen', { exact: true }).selectOption('Fivefold classic');
  await waitForInk();
  await screenshotArtwork('pure-attractors-classic.png');
  await page.getByLabel('Specimen', { exact: true }).selectOption(defaultPreset);
  await waitForInk();

  const palette = await page.evaluate(() => {
    const app = window.pureAttractorsApp;
    return app.spec.params.find(param => param.key === 'palette').options.find(option => option !== app.state.palette);
  });
  await page.getByLabel('Palette', { exact: true }).selectOption(palette);
  await page.waitForFunction(before => [...document.querySelectorAll('#vis path.pa-ink')].some((path, index) => path.getAttribute('fill') !== before[index]?.fill), initial);
  const recolored = await readInk();
  assert.deepEqual(recolored.map(ink => ink.d), initial.map(ink => ink.d), 'Changing color preserves the orbit geometry');
  note('Palette changes recolor the image while preserving the computed map.');

  await page.getByLabel('Exposure', { exact: true }).fill('2');
  await page.getByLabel('Exposure', { exact: true }).blur();
  const exposed = await readInk();
  assert.deepEqual(exposed.map(ink => ink.d), recolored.map(ink => ink.d));
  assert.notDeepEqual(exposed.map(ink => ink.fill), recolored.map(ink => ink.fill));
  await page.getByLabel('Orbit samples', { exact: true }).fill('100000');
  await page.getByLabel('Orbit samples', { exact: true }).blur();
  await page.waitForFunction(() => document.querySelector('#vis g.pa-disk')?.dataset.samples === '100000');
  assert.notDeepEqual((await readInk()).map(ink => ink.d), exposed.map(ink => ink.d));
  await setParam('samples', 160000);
  await setParam('exposure', 1.3);
  note('Visible sample and exposure inputs update the density; exposure preserves orbit geometry.');

  await page.getByLabel('Render as', { exact: true }).selectOption('Orbit points');
  const dots = await readInk();
  assert.ok(dots.length > 1 && dots.every(dot => dot.fill !== 'none' && /z/i.test(dot.d) && dot.marks > 0));
  await page.getByLabel('Reflection axes', { exact: true }).check();
  assert.equal(await page.locator('#vis g.pa-disk line').count(), 5);
  await page.getByLabel('Reflection axes', { exact: true }).uncheck();
  await page.getByLabel('Render as', { exact: true }).selectOption('Orbit density');
  note('Orbit points are closed vector marks, and the D5 overlay draws exactly five reflection axes.');

  await setParam('samples', 40000);
  await setParam('resolution', 240);
  const shapePaths = new Map();
  for (const shape of ['Circle', 'Square', 'Diamond', 'Triangle', 'Hexagon']) {
    await selectParam('pointShape', shape);
    const ink = await readInk();
    assert.ok(ink.length && ink.every(path => /z/i.test(path.d) && path.marks > 0 && path.fill !== 'none'));
    shapePaths.set(shape, ink.map(path => path.d).join(''));
  }
  assert.equal(new Set(shapePaths.values()).size, 5, 'Each shape produces different closed geometry');
  const beforeSize = await readInk();
  await setParam('pointSize', 1.2);
  assert.notDeepEqual((await readInk()).map(path => path.d), beforeSize.map(path => path.d));
  await checkParam('fillPoints', false);
  const outlined = await readInk();
  assert.ok(outlined.every(path => path.fill === 'none' && path.stroke !== 'none' && path.strokeWidth > 0 && /z/i.test(path.d)));
  const oldStrokeWidth = outlined[0].strokeWidth;
  await setParam('strokeWidth', 0.7);
  assert.notEqual((await readInk())[0].strokeWidth, oldStrokeWidth);
  await screenshotArtwork('pure-attractors-outline.png');
  await checkParam('fillPoints', true);
  assert.ok((await readInk()).every(path => path.fill !== 'none'));
  note('Circle, square, diamond, triangle and hexagon marks have distinct closed paths; size, fill and outline width work.');

  await selectParam('pointShape', 'Circle');
  await setParam('pointSize', 0.9);
  const paletteGeometry = (await readInk()).map(path => path.d);
  await selectParam('brightnessMode', 'Size halftone');
  const halftone = await readInk();
  assert.notDeepEqual(halftone.map(path => path.d), paletteGeometry, 'Halftone brightness changes mark size');
  const ditherCounts = {};
  const ditherGeometry = [];
  for (const mode of ['Ordered dither', 'Stochastic dither']) {
    await selectParam('brightnessMode', mode);
    await setParam('exposure', 0.3);
    const dim = await readInk();
    await setParam('exposure', 2.5);
    const bright = await readInk();
    const count = paths => paths.reduce((sum, path) => sum + path.marks, 0);
    assert.ok(count(dim) > 0 && count(bright) > count(dim), `${mode} increases coverage with exposure`);
    assert.notDeepEqual(bright.map(path => path.d), paletteGeometry);
    assert.ok(bright.every(path => /z/i.test(path.d) && !/NaN|Infinity/.test(path.d)));
    ditherCounts[mode] = { dim: count(dim), bright: count(bright) };
    ditherGeometry.push(bright.map(path => path.d).join(''));
  }
  assert.notEqual(ditherGeometry[0], ditherGeometry[1], 'Ordered and stochastic dithering create different dot arrangements');
  await setParam('samples', 160000);
  await setParam('resolution', 140);
  await setParam('pointSize', 0.85);
  await setParam('exposure', 1.3);
  await selectParam('pointShape', 'Diamond');
  await selectParam('brightnessMode', 'Ordered dither');
  await screenshotArtwork('pure-attractors-dither.png');
  await selectParam('pointShape', 'Circle');
  await selectParam('brightnessMode', 'Size halftone');
  await checkParam('fillPoints', false);
  await setParam('strokeWidth', 0.16);
  await screenshotArtwork('pure-attractors-outlines.png');
  await checkParam('fillPoints', true);
  await selectParam('brightnessMode', 'Palette');
  await setParam('pointSize', 0.65);
  await setParam('samples', 160000);
  await setParam('resolution', 600);
  await setParam('exposure', 1.3);
  note('Size halftone and both dither modes change geometry; higher dither exposure increases mark coverage.');

  await page.getByLabel('View', { exact: true }).selectOption('Bestiary');
  await page.waitForFunction(() => document.querySelectorAll('#vis g.pa-disk').length > 1, null, { timeout: 60000 });
  const specimens = await page.locator('#vis g.pa-disk').count();
  await waitForInk(specimens);
  const specimenGeometry = await page.locator('#vis g.pa-disk').evaluateAll(disks => disks.map(disk => disk.querySelector('path.pa-ink').getAttribute('d')));
  assert.ok(new Set(specimenGeometry).size === specimens, 'Every disk contains a different attractor');
  assert.equal(await page.locator('#vis svg text, #vis svg title').count(), 0);
  assert.ok((await page.locator('#vis g.pa-disk').evaluateAll(disks => disks.map(disk => disk.getAttribute('aria-label')))).every(Boolean));
  await screenshotArtwork('pure-attractors-bestiary.png');
  note(`Bestiary displays ${specimens} distinct SVG attractors.`);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mobileContext.route('https://**/*', serveDependency);
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  try {
    await mobile.goto(origin + '/PureAttractors/');
    await mobile.waitForFunction(() => window.pureAttractorsApp && document.querySelector('#vis svg')?.dataset.ready === 'true');
    assert.equal(await mobile.locator('#config').evaluate(panel => panel.classList.contains('open')), false, 'Mobile starts with the artwork unobstructed');
    await mobile.locator('#button-info').click();
    const mobileReference = await mobileContext.newPage();
    await mobileReference.goto(origin + '/LorenzAttractor/');
    await waitForUI(mobileReference);
    await mobileReference.locator('#button-info').click();
    assert.deepEqual(await sharedUI(mobile), await sharedUI(mobileReference), 'Mobile popup uses the same layout and controls as Lorenz');
    await mobileReference.close();
    await expandParameterGroups(mobile);
    assert.equal(await mobile.locator('#button-info').getAttribute('aria-expanded'), 'true');
    await mobile.screenshot({ path: path.join(cache, 'pure-attractors-mobile-controls.png'), fullPage: false, animations: 'disabled' });
    await mobile.getByLabel('View', { exact: true }).selectOption('Bestiary');
    await mobile.locator('#button-info').click();
    assert.equal(await mobile.locator('#button-info').getAttribute('aria-expanded'), 'false');
    await mobile.waitForFunction(() => document.querySelectorAll('#vis g.pa-disk').length === 9 && document.documentElement.scrollWidth <= innerWidth);
    assert.equal(await mobile.locator('#vis svg text, #vis svg title').count(), 0);
    assert.ok(await mobile.evaluate(() => !document.elementFromPoint(innerWidth / 2, innerHeight / 2).closest('#config')));
    await mobile.screenshot({ path: path.join(cache, 'pure-attractors-mobile.png'), fullPage: false });
    note('Fresh 390px mobile load shows text-free artwork; settings open and close, and Bestiary fits without horizontal overflow.');
  } finally {
    await mobileContext.close();
  }

  const selectedDisk = page.locator('#vis [data-pa-preset]').last();
  const selectedPreset = await selectedDisk.getAttribute('data-pa-preset');
  await selectedDisk.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.pureAttractorsApp.state.view), 'Single attractor');
  assert.equal(await page.evaluate(() => window.pureAttractorsApp.state.preset), selectedPreset);
  await waitForInk();
  note('Keyboard activation opens an individual bestiary specimen.');
  const downloadStarted = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save SVG', exact: true }).evaluate(button => button.click());
  const download = await downloadStarted;
  assert.match(download.suggestedFilename(), /pureAttractors.*\.svg$/i);
  const exportPath = path.join(cache, 'pure-attractors-export.svg');
  await download.saveAs(exportPath);
  const exported = await readFile(exportPath, 'utf8');
  assert.match(exported, /<svg[\s>]/);
  assert.match(exported, /pa-ink/);
  assert.match(exported, /ohey-settings/);
  assert.doesNotMatch(exported, /NaN|Infinity|<canvas|<(?:image|text|title)[\s>]/);
  assert.ok(exported.length > 10000);
  note('Save SVG downloads actual vector paths and reusable app settings.');

  const expectedCustom = await page.evaluate(async () => {
    const { PRESETS } = await import('/PureAttractors/attractorMath.js');
    const preset = PRESETS.find(preset => preset.name === window.pureAttractorsApp.state.preset);
    return { n: preset.n, p: preset.p, a: preset.a };
  });
  await page.getByRole('button', { name: 'Edit this specimen', exact: true }).click();
  await expandParameterGroups(page);
  const copiedCustom = await page.evaluate(() => {
    const state = window.pureAttractorsApp.state;
    return { preset: state.preset, n: state.n, p: state.p, a: Array.from({ length: 5 }, (_, index) => state['a' + index]) };
  });
  assert.deepEqual(copiedCustom, { preset: 'Custom', ...expectedCustom });
  assert.ok(await page.getByLabel('Angular harmonic p', { exact: true }).isVisible());
  const beforeEdit = await readInk();
  const a3Label = await page.evaluate(() => window.pureAttractorsApp.spec.params.find(param => param.key === 'a3').label);
  await page.getByLabel(a3Label, { exact: true }).fill('-0.1');
  await page.getByLabel(a3Label, { exact: true }).blur();
  await waitForInk();
  const changedCoefficient = await readInk();
  assert.notDeepEqual(changedCoefficient.map(ink => ink.d), beforeEdit.map(ink => ink.d));
  await page.getByLabel('Angular harmonic p', { exact: true }).fill('1');
  await page.getByLabel('Angular harmonic p', { exact: true }).blur();
  await waitForInk();
  assert.notDeepEqual((await readInk()).map(ink => ink.d), changedCoefficient.map(ink => ink.d));
  note('Edit this specimen copies every coefficient; editing the angular term and harmonic each recomputes the orbit.');

  await page.evaluate(() => {
    const app = window.pureAttractorsApp;
    Object.assign(app.state, { preset: 'Custom', n: 5, p: 1, a0: 0, a1: 0, a2: 0, a3: 0, a4: 0 });
    app.refresh();
  });
  await page.waitForFunction(() => document.querySelector('#vis g.pa-disk')?.dataset.status === 'collapsed' && /converg|collaps|fixed|periodic|zero|settled/i.test([...document.querySelectorAll('[aria-live]')].map(node => node.textContent).join(' ')), null, { timeout: 60000 });
  assert.equal(await page.locator('#vis svg text, #vis svg title').count(), 0);
  assert.doesNotMatch(await page.locator('#vis svg').getAttribute('viewBox'), /NaN|Infinity/);
  note('An all-zero custom map reports its collapsed orbit without invalid geometry.');

  await setParam('a0', 8);
  await page.waitForFunction(() => document.querySelector('#vis g.pa-disk')?.dataset.status === 'escaped' && /escap|diverg|unbound/i.test([...document.querySelectorAll('[aria-live]')].map(node => node.textContent).join(' ')), null, { timeout: 60000 });
  assert.equal(await page.locator('#vis svg text, #vis svg title').count(), 0);
  assert.ok((await readInk()).every(ink => !/NaN|Infinity/.test(ink.d || '')));
  note('An escaping custom map stops cleanly and explains its unbounded orbit.');
  assert.deepEqual(errors, [], 'The browser reports no uncaught errors');
  await writeFile(path.join(cache, 'pure-attractors-validation.json'), JSON.stringify({ result: 'pass', checkedAt: new Date().toISOString(), specimens, initialDisk, dockingDefaults, ditherCounts, checks, errors }, null, 2) + '\n');
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
