/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run: node tests/time-browser.mjs. Uses a disposable headless browser profile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const executablePath = process.env.CHROME_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const cache = new URL('../.cache/', import.meta.url);
await mkdir(cache, { recursive: true });
const artifact = name => fileURLToPath(new URL(name, cache));
const errors = [], checks = [];
page.on('pageerror', error => { errors.push(error.message); console.error('Page error:', error.message); });
const note = message => { checks.push(message); console.log('PASS ' + message); };
const time = page.locator('[data-time-panel]');
const preview = time.locator('.time-preview');
const cards = preview.locator('g[data-time-index]');
const fill = async (label, value) => { const input = time.getByLabel(label, { exact: true }); await input.fill(String(value)); await input.blur(); };
const ids = () => cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-time-id')));
const geometry = () => cards.evaluateAll(nodes => nodes.map(node => {
  const frame = node.querySelector('svg');
  return Object.fromEntries(['x', 'y', 'width', 'height'].map(name => [name, Number(frame.getAttribute(name))]));
}));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.05, message || `${actual} != ${expected}`);
const openTime = () => page.getByRole('tab', { name: 'Time', exact: true }).click();
const openAnimate = () => page.getByRole('tab', { name: 'animate', exact: true }).click();
const snapshot = () => time.getByRole('button', { name: 'Take snapshot', exact: true }).click();
const checkCount = async expected => assert.equal(await cards.count(), expected, `${expected} snapshots expected`);
const readSampleLabels = () => time.locator('.time-snapshots button').allTextContents();
const waitForStop = () => page.locator('.anim-panel:visible .anim-status').filter({ hasText: /^Stopped/ }).waitFor();

async function dragSnapshot(from, to) {
  await preview.scrollIntoViewIfNeeded();
  const source = await cards.nth(from).locator(':scope > rect').boundingBox();
  const target = await cards.nth(to).locator(':scope > rect').boundingBox();
  assert.ok(source && target, 'Snapshot hit regions exist');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
}

try {
  const d3 = new URL('abstract-export-deps/d3.cjs', cache);
  if (existsSync(d3)) await context.route('https://d3js.org/d3.v7.min.js', route => route.fulfill({ contentType: 'text/javascript', path: fileURLToPath(d3) }));
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto(process.env.TIME_TEST_URL || 'https://127.0.0.1:5500/Voronoi/');
  await page.locator('#vis > svg').waitFor();
  if (!await page.getByRole('button', { name: 'Show or hide tabs', exact: true }).isVisible()) await page.locator('#button-info').click();
  if (!await page.getByRole('tab', { name: 'Time', exact: true }).isVisible()) await page.getByRole('button', { name: 'Show or hide tabs', exact: true }).click();
  await openTime();
  assert.equal(await time.isVisible(), true);
  await fill('Canvas width', 900); await fill('Canvas height', 600);
  await fill('Columns', 2); await fill('Rows', 2);
  for (let index = 0; index < 4; index++) await snapshot();
  await checkCount(4);
  assert.equal(await time.getByRole('button', { name: 'Take snapshot', exact: true }).isDisabled(), true);
  assert.match(await time.locator('.time-count').textContent(), /4 \/ 4/);
  const originalIds = await ids();
  await dragSnapshot(0, 3);
  assert.deepEqual(await ids(), [...originalIds.slice(1), originalIds[0]], 'Pointer drag moves the first snapshot to the last grid slot');
  await time.getByRole('button', { name: 'Move earlier', exact: true }).click();
  assert.deepEqual(await ids(), [originalIds[1], originalIds[2], originalIds[0], originalIds[3]]);
  await time.getByRole('button', { name: 'Move later', exact: true }).click();
  assert.deepEqual(await ids(), [...originalIds.slice(1), originalIds[0]]);
  await time.getByRole('button', { name: 'Select snapshot 1', exact: true }).click();
  assert.equal(await time.getByRole('button', { name: 'Move earlier', exact: true }).isDisabled(), true);
  note('Toolbar Time captures until its grid is full and reorders snapshots by pointer drag or selection buttons.');

  await time.getByLabel('Layout', { exact: true }).selectOption('free');
  await fill('Snapshot X', 270); await fill('Snapshot Y', 180); await fill('Snapshot scale', 0.5);
  const placed = (await geometry())[0];
  near(placed.x + placed.width / 2, 270); near(placed.y + placed.height / 2, 180);
  await preview.scrollIntoViewIfNeeded();
  const source = await cards.nth(0).locator(':scope > rect').boundingBox();
  const beforeX = Number(await time.getByLabel('Snapshot X', { exact: true }).inputValue());
  const beforeY = Number(await time.getByLabel('Snapshot Y', { exact: true }).inputValue());
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down(); await page.mouse.move(source.x + source.width / 2 + 22, source.y + source.height / 2 + 12, { steps: 8 }); await page.mouse.up();
  assert.ok(Number(await time.getByLabel('Snapshot X', { exact: true }).inputValue()) > beforeX);
  assert.ok(Number(await time.getByLabel('Snapshot Y', { exact: true }).inputValue()) > beforeY);
  near(Number(await time.getByLabel('Snapshot scale', { exact: true }).inputValue()), 0.5);
  note('Free placement supports editable X, Y, scale and pointer movement while retaining scale.');

  for (const layout of ['circle', 'square', 'triangle', 'polygon']) {
    await time.getByLabel('Layout', { exact: true }).selectOption(layout);
    await checkCount(4);
    assert.equal(new Set((await geometry()).map(place => `${place.x},${place.y}`)).size, 4);
  }
  await fill('Polygon sides', 7);
  await time.getByLabel('Layout', { exact: true }).selectOption('function');
  await fill('X(i)', 'W/4 + i*W/6'); await fill('Y(i)', 'H/2'); await fill('Scale(i)', '1+i*0.1');
  const functionGeometry = await geometry();
  functionGeometry.forEach((place, index) => { near(place.x + place.width / 2, 225 + index * 150); near(place.y + place.height / 2, 300); });
  near(functionGeometry[1].width / functionGeometry[0].width, 1.1);
  const formulaIds = await ids();
  await fill('X(i)', 'window.alert(1)');
  assert.match(await time.locator('.time-status').textContent(), /Unexpected|Unknown|Unsupported/i);
  assert.deepEqual(await geometry(), functionGeometry, 'Rejected expression preserves placements');
  assert.deepEqual(await ids(), formulaIds, 'Rejected expression preserves captured snapshots');
  await fill('Scale(i)', '1/(5-n)');
  await snapshot();
  await checkCount(4);
  assert.match(await time.locator('.time-status').textContent(), /finite|scale|positive/i);
  await fill('Scale(i)', '1+i*0.1');
  note('Circle, square, triangle, polygon and expression layouts work; invalid or newly undefined functions preserve existing snapshots.');

  const downloadStarted = page.waitForEvent('download');
  await time.getByRole('button', { name: 'Download SVG', exact: true }).click();
  const file = artifact('time-composition.svg');
  await (await downloadStarted).saveAs(file);
  const exported = await readFile(file, 'utf8');
  const documentCheck = await page.evaluate(source => {
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const root = document.documentElement;
    const frames = [...root.querySelectorAll('g[data-time-index]')];
    const ids = [...root.querySelectorAll('[id]')].map(node => node.id);
    return { errors: document.querySelectorAll('parsererror').length, root: root.localName,
      frames: frames.length, guides: root.querySelectorAll('.time-guides').length,
      hitAreas: frames.flatMap(frame => [...frame.children].filter(node => node.localName === 'rect')).length,
      nestedSvg: frames.every(frame => frame.firstElementChild.localName === 'svg'), uniqueIds: new Set(ids).size === ids.length };
  }, exported);
  assert.deepEqual(documentCheck, { errors: 0, root: 'svg', frames: 4, guides: 0, hitAreas: 0, nestedSvg: true, uniqueIds: true });
  note('Download produces one valid standalone vector SVG with unique IDs and no preview guides or drag hit overlays.');

  await time.getByLabel('Layout', { exact: true }).selectOption('grid');
  await fill('Columns', 3); await fill('Rows', 2);
  await fill('Start at (seconds)', 0.1); await fill('Every (seconds)', 0.3); await fill('Number of samples', 2);
  await time.getByLabel('On next run', { exact: true }).selectOption('append');
  await openAnimate();
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await page.getByRole('textbox', { name: 'Animation JSON', exact: true }).fill(JSON.stringify({
    targetType: 'svg', selector: 'svg', svgKind: 'attr', svgName: 'opacity', from: 0.2, to: 1,
    durationSec: 1.2, fps: 30, easing: 'linear', loop: false, yoyo: false, progress01: 0, autoPlay: false,
  }));
  await page.getByRole('button', { name: 'Apply JSON', exact: true }).click();
  await openTime();
  await time.getByLabel('Sample next animation run', { exact: true }).check();
  assert.equal(await time.getByLabel('Every (seconds)', { exact: true }).isDisabled(), true);
  await openAnimate();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await waitForStop();
  await openTime();
  await checkCount(6);
  assert.equal(await time.getByLabel('Sample next animation run', { exact: true }).isChecked(), false);
  const appendedIds = await ids();
  const appendLabels = await readSampleLabels();
  assert.match(appendLabels[4], /s$/); assert.match(appendLabels[5], /s$/);
  await openAnimate();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await waitForStop();
  await openTime();
  assert.deepEqual(await ids(), appendedIds, 'Another run without arming does not add or replace snapshots');
  note('Armed append sampling survives hiding Time, takes timed samples during Animate, and automatically disarms for later runs.');

  await time.getByLabel('On next run', { exact: true }).selectOption('replace');
  await fill('Start at (seconds)', 0); await fill('Every (seconds)', 0.3); await fill('Number of samples', 3);
  await time.getByLabel('Sample next animation run', { exact: true }).check();
  await checkCount(6);
  await openAnimate();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await waitForStop();
  await openTime();
  await checkCount(3);
  assert.ok((await ids()).every(id => !appendedIds.includes(id)));
  assert.equal(await time.getByLabel('Sample next animation run', { exact: true }).isChecked(), false);
  const opacities = await cards.evaluateAll(nodes => nodes.map(node => Number(node.querySelector('svg').style.opacity)));
  assert.ok(opacities[0] < opacities[1] && opacities[1] < opacities[2], `Animation appearance is frozen per sample: ${opacities}`);
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: artifact('time-desktop.png') });
  note('Explicitly rearming Replace preserves old work until playback, then captures distinct vector animation frames into the chosen layout.');

  await page.setViewportSize({ width: 390, height: 844 });
  await time.getByLabel('Layout', { exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await time.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'Time controls fit a narrow panel');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Mobile page has no horizontal overflow');
  await page.screenshot({ path: artifact('time-mobile.png') });
  note('Time fits a 390px mobile viewport without horizontal overflow.');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  await writeFile(artifact('time-validation.json'), JSON.stringify({ result: 'pass', checks, errors }, null, 2) + '\n');
} catch (error) {
  console.error('Browser errors:', errors);
  console.error('Time status:', await time.locator('.time-status').textContent().catch(() => 'Unavailable'));
  await page.screenshot({ path: artifact('time-failure.png') }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
