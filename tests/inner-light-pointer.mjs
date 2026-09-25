/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Serve the repository, then run: node tests/inner-light-pointer.mjs
// Requires Playwright. Optional environment variables: INNER_LIGHT_URL,
// PLAYWRIGHT_MODULE (package path), CHROME_EXECUTABLE (browser executable).
// These checks use browser mouse/touch input so SVG hit testing is exercised.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, hasTouch: true });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let passed = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  passed += 1;
  console.log(`PASS ${message}`);
};

try {
  await page.goto(process.env.INNER_LIGHT_URL || 'http://127.0.0.1:8000/InnerLight/');
  await page.evaluate(async () => {
    window.pointerApp = (await import('./index.js')).app;
    pointerApp.setParam('motionEnabled', false);
    window.pointerHits = new Map();
    window.pointerDurations = [];
    const svg = document.querySelector('#vis svg');
    const starts = new WeakMap();
    svg.addEventListener('pointermove', (event) => {
      if (event.isTrusted) starts.set(event, performance.now());
    }, true);
    svg.addEventListener('pointermove', (event) => {
      if (starts.has(event)) pointerDurations.push(performance.now() - starts.get(event));
    });
    new MutationObserver((records) => {
      for (const { target } of records) {
        if (target.dataset.animating === 'true' && target.closest('[data-xf-source="1"]')) {
          pointerHits.set(target.dataset.innerlightShape, target.getAttribute('class'));
        }
      }
    }).observe(document.querySelector('#vis'), {
      attributes: true, subtree: true, attributeFilter: ['data-animating'],
    });
  });
  // Let startup-wave timers expire while motion is paused.
  await page.waitForTimeout(400);

  const prepare = async (families, custom = {}) => {
    await page.mouse.move(2, 2);
    await page.evaluate(({ families, custom }) => {
      pointerApp.setParam('motionEnabled', false);
      for (const kind of ['circle', 'rect', 'square', 'prism', 'user']) {
        pointerApp.setParam(`shapes.${kind}`, false);
      }
      for (const [key, value] of Object.entries(custom)) pointerApp.setParam(`custom.${key}`, value);
      for (const kind of families) pointerApp.setParam(`shapes.${kind}`, true);
      pointerHits.clear();
    }, { families, custom });
  };
  const center = (selector = '[data-xf-source="1"] .circle') => page.evaluate((selector) => {
    const node = document.querySelector(selector);
    const point = new DOMPoint(+node.getAttribute('cx'), +node.getAttribute('cy')).matrixTransform(node.getScreenCTM());
    return { x: point.x, y: point.y };
  }, selector);
  const hits = () => page.evaluate(() => [...pointerHits.values()].reduce((counts, kind) => {
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {}));
  const resume = () => page.evaluate(() => {
    pointerHits.clear();
    pointerApp.setParam('motionEnabled', true);
  });
  const drag = async (from, to, steps) => {
    await page.mouse.move(from.x, from.y);
    await resume();
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps });
    await page.mouse.up();
    return hits();
  };

  await prepare(['circle']);
  let origin = await center();
  let painted = await drag({ x: origin.x + 230, y: origin.y }, { x: origin.x + 15, y: origin.y }, 43);
  check(painted.circle >= 40, 'Mouse drag reaches nested circle outlines through unfilled outer circles');

  // Pause now preserves in-flight strokes. Wait for the first pass to finish
  // before testing that the same, already-raised shapes can be hit again.
  await page.waitForFunction(() => [...document.querySelectorAll('[data-xf-source="1"] .circle')]
    .every(node => node.dataset.animating !== 'true'));
  await page.evaluate(() => pointerApp.setParam('motionEnabled', false));
  painted = await drag({ x: origin.x + 15, y: origin.y }, { x: origin.x + 230, y: origin.y }, 43);
  check(painted.circle >= 40, 'Reverse drag reaches circles already raised and colored by an earlier pass');

  await prepare(['circle', 'rect']);
  origin = await center();
  await resume();
  await page.mouse.move(origin.x + 225, origin.y);
  await page.mouse.move(origin.x + 15, origin.y);
  painted = await hits();
  check(painted.circle >= 40 && painted.rect >= 14, 'Hovering without a pressed button also crosses overlapping outlines');

  await prepare(['circle', 'rect']);
  origin = await center();
  painted = await drag({ x: origin.x + 230, y: origin.y }, { x: origin.x + 15, y: origin.y }, 1);
  check(painted.circle >= 40 && painted.rect >= 14, 'A fast drag crosses thin circles and overlapping rectangle outlines');

  await prepare(['circle', 'user'], {
    shapeType: 'circle', numElements: 1, radius: 260, fillColor: '#333333', fillOpacity: 0.2,
  });
  origin = await center();
  painted = await drag({ x: origin.x + 230, y: origin.y }, { x: origin.x + 15, y: origin.y }, 43);
  check(painted.circle >= 40 && painted.user === 1, 'A filled shape above the drawing does not prevent lower outlines from responding');

  await prepare(['circle']);
  origin = await center();
  await page.mouse.move(origin.x + 230, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + 15, origin.y, { steps: 43 });
  await page.mouse.up();
  check(Object.keys(await hits()).length === 0, 'Paused motion stays paused during a real mouse drag');

  await page.mouse.move(15, 20);
  await resume();
  await page.mouse.down();
  await page.mouse.move(200, 20, { steps: 20 });
  await page.mouse.up();
  check(Object.keys(await hits()).length === 0, 'Moving across the Info bar does not paint the drawing beneath it');

  await prepare(['circle', 'rect']);
  origin = await center();
  await resume();
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: origin.x + 230, y: origin.y, id: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: origin.x + 15, y: origin.y, id: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  painted = await hits();
  check(painted.circle >= 40 && painted.rect >= 14, 'Touch dragging retargets across nested shapes instead of keeping the first touched shape');
  await session.detach();

  await prepare(['circle']);
  await page.locator('.vr-tabsToggle').click();
  await page.getByRole('button', { name: 'transforms', exact: true }).click();
  const splitRow = page.locator('.vr-row').filter({ has: page.locator('.vr-label', { hasText: /^split copies$/ }) });
  const cloneSelector = '[data-xf-layer="1"] .circle';
  for (const copies of [4, 16]) {
    await page.getByRole('button', { name: 'reset', exact: true }).click();
    await prepare(['circle']);
    await splitRow.locator('xpath=ancestor::details').evaluateAll((nodes) => nodes.forEach((node) => { node.open = true; }));
    await splitRow.locator('input[type="number"]').fill(String(copies));
    await splitRow.locator('input[type="number"]').dispatchEvent('change');
    await page.getByRole('button', { name: 'apply split', exact: true }).click();
    await page.waitForSelector(cloneSelector);
    origin = await center(cloneSelector);
    const scale = 1 / Math.sqrt(copies);
    painted = await drag({ x: origin.x + 230 * scale, y: origin.y }, { x: origin.x + 16 * scale, y: origin.y }, 1);
    check(painted.circle >= 40, `Fast drag reaches thin outlines in a ${copies}-way split (${painted.circle || 0} reached)`);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-xf-layer="1"] .circle')]
      .some((node) => getComputedStyle(node).stroke !== 'rgb(255, 255, 255)'));
    check(true, `Pointer colors propagate to the ${copies} displayed split copies`);
  }
  check(errors.length === 0, `No browser runtime errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  console.log('Pointer handler timings (milliseconds):', await page.evaluate(() => {
    const times = [...pointerDurations].sort((a, b) => a - b);
    return { median: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)], max: times.at(-1) };
  }));
  console.log(`${passed} real pointer checks passed.`);
} finally {
  await browser.close();
}
