/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Serve the repository, then run: node tests/simulation-pause.mjs
// Requires Playwright. Optional environment variables: VISUAL_APP_URL,
// PLAYWRIGHT_MODULE (package path), CHROME_EXECUTABLE (browser executable).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.VISUAL_APP_URL || 'http://127.0.0.1:8000/';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let passed = 0;
const check = (value, description) => { assert.ok(value, description); passed++; console.log(`PASS ${description}`); };
try {
  await page.goto(new URL('InnerLight/', baseUrl).href);
  await page.waitForSelector('#vis svg circle');
  await page.evaluate(async () => {
    window.simApp = (await import('/InnerLight/index.js')).app;
    simApp.setParam('motionEnabled', false);
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    simApp.setParam('shapes.rect', false);
    simApp.setParam('motionEnabled', true);
    window.simShape = document.querySelector('#vis svg circle');
    simShape.dispatchEvent(new PointerEvent('pointermove'));
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => simApp.setParam('motionEnabled', false));
  const innerPaused = await page.evaluate(() => simShape.getAttribute('style'));
  await page.waitForTimeout(350);
  check(await page.evaluate(style => simShape.getAttribute('style') === style, innerPaused), 'Inner Light freezes an in-flight hover stroke');
  check(await page.evaluate(() => simShape.dataset.animating === 'true'), 'Inner Light keeps active stroke progress for resume');
  await page.evaluate(() => simApp.setParam('motionEnabled', true));
  await page.waitForTimeout(160);
  check(await page.evaluate(style => simShape.getAttribute('style') !== style, innerPaused), 'Inner Light resumes the paused hover stroke');

  async function createFixture(url, id) {
    await page.goto(new URL(url, baseUrl).href);
    await page.waitForSelector('#vis svg');
    await page.evaluate(async id => {
      const { VISUALS, makeDefaultState } = await import('/helper/visualHelp.js');
      const spec = VISUALS[id];
      window.simState = makeDefaultState(spec);
      const mount = document.createElement('div');
      mount.style.cssText = 'position:fixed;inset:40px 0 0;width:1200px;height:760px;';
      document.body.appendChild(mount);
      window.simMount = mount;
      window.simInstance = spec.create({ mountEl: mount }, simState);
      simInstance.render();
    }, id);
  }

  await createFixture('LissajousFigures/', 'lissajousFigures');
  await page.waitForTimeout(180);
  const lissajousPaused = await page.evaluate(() => {
    const before = simMount.innerHTML;
    simState.animate = false;
    simInstance.render();
    return { before, after: simMount.innerHTML };
  });
  check(lissajousPaused.before === lissajousPaused.after, 'Lissajous pause preserves current phase without resetting');
  await page.waitForTimeout(250);
  check(await page.evaluate(html => simMount.innerHTML === html, lissajousPaused.after), 'Lissajous remains still while paused');
  await page.evaluate(() => { simState.animate = true; simInstance.render(); });
  await page.waitForTimeout(130);
  check(await page.evaluate(html => simMount.innerHTML !== html, lissajousPaused.after), 'Lissajous resumes advancing its phase');

  await createFixture('MondrianAbstraction/', 'mondrianAbstraction');
  await page.evaluate(() => {
    simState.motion.tickMs = 10000;
    simState.motion.durationMs = 1000;
    simState.motion.delayMs = 1000;
    simState.motion.hoverCooldownMs = 0;
    simState.grid.strokeWidth = 6;
    simState.grid.strokeOpacity = 0.5;
    simInstance.render();
    const svg = simMount.querySelector('svg');
    const box = svg.getBoundingClientRect();
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: box.x + 10, clientY: box.y + 10 }));
  });
  await page.waitForTimeout(140);
  check(await page.evaluate(() => {
    const before = simMount.innerHTML;
    simState.motion.running = false;
    simInstance.render();
    return simMount.innerHTML === before;
  }), 'Mondrian pause preserves current stroke styles as well as positions');
  const mondrianPaused = await page.evaluate(() => [...simMount.querySelectorAll('rect')].map(n => n.getAttribute('transform')));
  check(mondrianPaused.some(Boolean), 'Mondrian fixture has an active tile transform');
  await page.waitForTimeout(350);
  check(await page.evaluate(snapshot => JSON.stringify([...simMount.querySelectorAll('rect')].map(n => n.getAttribute('transform'))) === JSON.stringify(snapshot), mondrianPaused), 'Mondrian freezes in-flight tile transforms');
  await page.evaluate(() => { simState.motion.running = true; simInstance.render(); });
  await page.waitForTimeout(170);
  check(await page.evaluate(snapshot => JSON.stringify([...simMount.querySelectorAll('rect')].map(n => n.getAttribute('transform'))) !== JSON.stringify(snapshot), mondrianPaused), 'Mondrian resumes in-flight tile transforms');

  for (const [url, id] of [['GameOfLife_aug/', 'gameOfLifeSVG'], ['BacteriaVisualizer/', 'bacteriaMinimal']]) {
    await createFixture(url, id);
    await page.waitForTimeout(180);
    const snapshot = await page.evaluate(() => {
      simState.running = false;
      simInstance.render();
      return simMount.innerHTML;
    });
    await page.waitForTimeout(250);
    check(await page.evaluate(html => simMount.innerHTML === html, snapshot), `${id} preserves its simulation while paused`);
    await page.evaluate(() => { simState.running = true; simInstance.render(); });
    await page.waitForTimeout(250);
    check(await page.evaluate(html => simMount.innerHTML !== html, snapshot), `${id} resumes advancing its simulation`);
  }
  check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
  console.log(`${passed} simulation pause checks passed.`);
} finally { await browser.close(); }
