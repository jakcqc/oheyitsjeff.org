/*
 * Copyright (c) 2026 Reside Here LLC. All rights reserved.
 * No AI training, fine-tuning, or inclusion in AI/ML training datasets without prior written permission.
 * See LICENSE.txt for terms. Third-party materials retain their own licenses.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const siteData = JSON.parse(await readFile(path.join(root, 'data/properties.json'), 'utf8'));
const key = 'residehere-accessibility-v1';
const routes = ['/', '/rental-guide.html', '/floor-plans.html'];
const navigationLabels = [
  'Rental Search',
  'Tenant Login',
  'Rental Criteria',
  'Rental Info',
  'Contact Us',
];
const secondaryNavigationLabels = ['Tenant Login', 'Rental Criteria', 'Rental Info', 'Contact Us'];
const defaults = {
  textSize: '100',
  contrast: 'default',
  reduceMotion: false,
  underlineLinks: false,
  fontFamily: 'auto',
  lineHeight: 'default',
  heavierText: false,
  textSpacing: false,
  controlLabels: false,
};
const maximal = {
  textSize: '200',
  contrast: 'dark',
  reduceMotion: true,
  underlineLinks: true,
  fontFamily: 'system',
  lineHeight: 'roomy',
  heavierText: true,
  textSpacing: true,
  controlLabels: true,
};
const portFinder = createServer();
await new Promise((resolve) => portFinder.listen(0, '127.0.0.1', resolve));
const port = portFinder.address().port;
await new Promise((resolve) => portFinder.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stderr.on('data', (chunk) => (serverOutput += chunk));

let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Server did not start: ${serverOutput}`)),
      10000,
    );
    server.once('error', reject);
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${serverOutput}`));
    });
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Reside Here preview:')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  const executablePath =
    process.env.BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? [
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        ].find((candidate) => existsSync(candidate))
      : undefined);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  const openSettings = async () => {
    await page.locator('[data-accessibility-open]').first().click();
    await page.waitForFunction(() => document.querySelector('#accessibility-dialog').open);
  };
  const closeSettings = async () => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#accessibility-dialog').open);
  };
  const storePreferences = async (prefs) => {
    await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
      key,
      prefs,
    });
  };
  const scrollToAndSettle = async (top) => {
    const transitions = await page.evaluate(async (position) => {
      window.scrollTo({ top: position, behavior: 'instant' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return document
        .querySelector('.site-header')
        .getAnimations({ subtree: true })
        .map((animation) => animation.transitionProperty);
    }, top);
    await page.waitForFunction(
      () =>
        document
          .querySelector('.site-header')
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState === 'finished'),
      undefined,
      { timeout: 2000 },
    );
    return transitions;
  };
  const headerGeometry = async () =>
    page.locator('.site-header').evaluate((header) => {
      const rect = header.getBoundingClientRect();
      const chair = header.querySelector('.brand-chair').getBoundingClientRect();
      const innerStyle = getComputedStyle(header.querySelector('.header-inner'));
      const tagline = header.querySelector('.brand-small');
      const taglineStyle = getComputedStyle(tagline);
      return {
        position: getComputedStyle(header).position,
        stuck: header.dataset.stuck === 'true',
        top: rect.top,
        height: rect.height,
        chairWidth: chair.width,
        chairHeight: chair.height,
        paddingTop: parseFloat(innerStyle.paddingTop),
        paddingBottom: parseFloat(innerStyle.paddingBottom),
        taglineOpacity: Number(taglineStyle.opacity),
        taglineHeight: tagline.getBoundingClientRect().height,
        taglineMargin: parseFloat(taglineStyle.marginTop),
        links: [...header.querySelectorAll('.site-nav a')].map((link) => {
          const style = getComputedStyle(link);
          const bounds = link.getBoundingClientRect();
          return {
            label: link.textContent.trim().replace(/\s+/g, ' '),
            paddingTop: parseFloat(style.paddingTop),
            paddingBottom: parseFloat(style.paddingBottom),
            width: bounds.width,
            height: bounds.height,
          };
        }),
      };
    });
  const assertLayout = async (label, targetPage = page) => {
    const problems = await targetPage.evaluate(() => {
      const overflow = [
        ...document.querySelectorAll(
          'p,h1,h2,h3,button,select,label,summary,nav,.photo-placeholder',
        ),
      ]
        .filter((element) => element.getClientRects().length && element.clientWidth > 0)
        .filter(
          (element) =>
            !(
              element.matches('[data-gallery-status]') &&
              element.clientWidth <= 1 &&
              element.clientHeight <= 1 &&
              getComputedStyle(element).clipPath !== 'none'
            ),
        )
        .filter((element) => element.scrollWidth > element.clientWidth + 2)
        .map(
          (element) =>
            `${element.tagName}.${element.className}: ${element.scrollWidth}/${element.clientWidth}`,
        );
      if (document.documentElement.scrollWidth > innerWidth + 1) {
        overflow.unshift(`Document: ${document.documentElement.scrollWidth}/${innerWidth}`);
      }
      return overflow;
    });
    assert.deepEqual(problems, [], label);
  };
  const assertAxe = async (label) => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    assert.deepEqual(
      result.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      })),
      [],
      label,
    );
  };

  await page.goto(origin);
  const fontLoads = await page.evaluate(async () => {
    const faces = [
      '400 16px "Nunito Sans"',
      'italic 400 16px "Nunito Sans"',
      '500 32px "Fraunces"',
      '400 16px "Atkinson Hyperlegible"',
      '700 16px "Atkinson Hyperlegible"',
    ];
    return Promise.all(
      faces.map(async (font) => ({
        font,
        loaded: (await document.fonts.load(font)).some((face) => face.status === 'loaded'),
      })),
    );
  });
  assert.ok(fontLoads.every(({ loaded }) => loaded), JSON.stringify(fontLoads));
  const fontUrls = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map(({ name }) => name)
      .filter((url) => /\.(?:woff2?|ttf|otf)(?:\?|$)/i.test(url)),
  );
  assert.ok(fontUrls.length >= 5, 'All five font files are requested');
  assert.ok(
    fontUrls.every((url) => new URL(url).origin === origin),
    'Font files load from this site without a third-party font request',
  );
  assert.equal(await page.locator('h1').innerText(), siteData.home.heading);
  assert.equal(await page.locator('.direct-hero .maintenance-link').count(), 0);
  assert.equal(await page.locator('#owner-managed-copy').innerText(), siteData.home.ownerManaged);
  assert.equal(await page.locator('.maintenance-lead').innerText(), siteData.home.maintenance);
  assert.equal(
    await page.locator('.hero-actions .button').getAttribute('href'),
    siteData.links.rentalSearch,
  );
  await page.keyboard.press('Tab');
  assert.equal(
    await page.locator('.skip-link').evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('#main').evaluate((element) => element === document.activeElement),
    true,
  );
  await page.locator('[data-accessibility-open]').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('#a11y-close').evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await page.locator('#a11y-line-height').evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press('Tab');
  assert.equal(
    await page.locator('#a11y-close').evaluate((element) => element === document.activeElement),
    true,
  );
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    assert.equal(
      await page
        .locator('#accessibility-dialog')
        .evaluate((element) => element.contains(document.activeElement)),
      true,
      'Dialog keeps keyboard focus',
    );
  }
  await closeSettings();
  assert.equal(
    await page
      .locator('[data-accessibility-open]')
      .first()
      .evaluate((element) => element === document.activeElement),
    true,
  );
  console.log(
    'PASS: skip navigation, keyboard dialog, focus containment, Escape and focus restoration.',
  );

  const typography = async () =>
    page.evaluate(() => {
      const paragraph = getComputedStyle(document.querySelector('.hero-description'));
      const heading = getComputedStyle(document.querySelector('h1'));
      return {
        bodyFamily: getComputedStyle(document.body).fontFamily,
        headingFamily: heading.fontFamily,
        paragraphWeight: Number(paragraph.fontWeight),
        headingWeight: Number(heading.fontWeight),
        lineHeight: parseFloat(paragraph.lineHeight) / parseFloat(paragraph.fontSize),
      };
    });
  const siteTypography = await typography();
  assert.match(siteTypography.bodyFamily, /^"?Nunito Sans"?(?:,|$)/);
  assert.match(siteTypography.headingFamily, /^"?Fraunces"?(?:,|$)/);
  await openSettings();
  for (const fontFamily of ['atkinson', 'system', 'default']) {
    await page.locator('#a11y-font-family').selectOption(fontFamily);
    await page.evaluate(() => document.fonts.ready);
    const selected = await typography();
    assert.equal(await page.locator('html').getAttribute('data-font-family'), fontFamily);
    if (fontFamily === 'default') {
      assert.equal(selected.bodyFamily, siteTypography.bodyFamily);
      assert.equal(selected.headingFamily, siteTypography.headingFamily);
    } else {
      const expected = fontFamily === 'atkinson' ? /Atkinson Hyperlegible/ : /system-ui/;
      assert.match(selected.bodyFamily, expected);
      assert.equal(selected.headingFamily, selected.bodyFamily, 'Font choice includes headings');
      for (const selector of ['#a11y-font-family', '#a11y-close']) {
        assert.equal(
          await page.locator(selector).evaluate((element) => getComputedStyle(element).fontFamily),
          selected.bodyFamily,
          'Font choice includes form controls',
        );
      }
    }
  }
  for (const [lineHeight, ratio] of [['relaxed', 1.8], ['roomy', 2]]) {
    await page.locator('#a11y-line-height').selectOption(lineHeight);
    assert.ok(Math.abs((await typography()).lineHeight - ratio) < 0.02);
  }
  await page.locator('#a11y-text-spacing').check();
  assert.ok(
    Math.abs((await typography()).lineHeight - 2) < 0.02,
    'Roomy line spacing remains effective with increased text spacing',
  );
  await page.locator('#a11y-heavier-text').check();
  const heavierTypography = await typography();
  assert.ok(heavierTypography.paragraphWeight > siteTypography.paragraphWeight);
  assert.ok(heavierTypography.headingWeight > siteTypography.headingWeight);
  await page.locator('#a11y-reset').click();
  assert.deepEqual(await typography(), siteTypography, 'Reset restores the site typography');
  assert.equal(await page.locator('#a11y-font-family').inputValue(), 'auto');
  assert.equal(await page.locator('#a11y-line-height').inputValue(), 'default');
  assert.equal(await page.locator('#a11y-heavier-text').isChecked(), false);
  await closeSettings();
  console.log('PASS: local fonts load; font, line spacing, and weight controls apply and reset.');

  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForFunction(() => document.documentElement.dataset.fontFamily === 'system');
  assert.match((await typography()).bodyFamily, /system-ui/);
  assert.equal(await page.locator('html').getAttribute('data-accessibility-enabled'), 'false');
  await openSettings();
  assert.equal(await page.locator('#a11y-font-family').inputValue(), 'auto');
  assert.deepEqual(await page.locator('.a11y-panel button, .a11y-panel select, .a11y-panel input')
    .evaluateAll((elements) => elements.slice(-2).map((element) => element.id)),
    ['a11y-font-family', 'a11y-line-height']);
  await page.locator('#a11y-font-family').selectOption('default');
  await closeSettings();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-font-family'), 'default', 'Explicit site-font choice survives mobile reload');
  await openSettings();
  await page.locator('#a11y-reset').click();
  assert.equal(await page.locator('html').getAttribute('data-font-family'), 'system');
  await closeSettings();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => document.documentElement.dataset.fontFamily === 'default');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), null);
  console.log('PASS: automatic mobile system font, saved override, responsive reset, and reading controls last.');

  const normalSize = await page
    .locator('.hero-description')
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const normalHeading = await page
    .locator('h1')
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  await openSettings();
  await page.locator('#a11y-text-size').selectOption('200');
  await page.locator('#a11y-contrast').selectOption('dark');
  await page.locator('#a11y-font-family').selectOption('system');
  await page.locator('#a11y-line-height').selectOption('roomy');
  for (const id of [
    'reduce-motion',
    'underline-links',
    'heavier-text',
    'text-spacing',
    'control-labels',
  ]) {
    await page.locator(`#a11y-${id}`).check();
  }
  assert.deepEqual(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key),
    maximal,
  );
  const largeSize = await page
    .locator('.hero-description')
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  assert.ok(largeSize >= normalSize * 1.99, '200% text really doubles body text');
  const largeHeading = await page
    .locator('h1')
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  assert.ok(largeHeading >= normalHeading * 1.99, '200% text also doubles fluid headings');
  await closeSettings();
  for (const route of routes) {
    await page.goto(origin + route);
    assert.equal(await page.locator('html').getAttribute('data-text-size'), '200');
    assert.equal(await page.locator('html').getAttribute('data-contrast'), 'dark');
    assert.equal(await page.locator('html').getAttribute('data-font-family'), 'system');
    assert.equal(await page.locator('html').getAttribute('data-line-height'), 'roomy');
    assert.equal(await page.locator('html').getAttribute('data-heavier-text'), 'true');
    assert.equal(await page.locator('html').getAttribute('data-control-labels'), 'true');
    assert.equal(await page.locator('html').getAttribute('data-accessibility-enabled'), 'true');
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await assertLayout(`${route}: all preferences at ${width}px`);
      await openSettings();
      await assertLayout(`${route}: large settings panel at ${width}px`);
      if (process.env.A11Y_SCREENSHOTS && route === '/' && width === 390) {
        await mkdir(process.env.A11Y_SCREENSHOTS, { recursive: true });
        await page.locator('#accessibility-dialog').evaluate((element) => {
          element.scrollTop = 0;
        });
        await page.screenshot({
          path: path.join(process.env.A11Y_SCREENSHOTS, '200-percent-mobile-dialog.png'),
        });
      }
      await closeSettings();
      if (width === 320) {
        await page.locator('#navigation-toggle').click();
        await assertLayout(`${route}: expanded mobile navigation with all preferences`);
        await page.keyboard.press('Escape');
      }
    }
  }
  console.log(
    'PASS: settings persist across all pages; 200% text and all preferences reflow at four widths.',
  );

  for (const fontFamily of ['default', 'atkinson', 'system']) {
    await storePreferences({ ...maximal, contrast: 'default', fontFamily });
    for (const route of routes) {
      await page.goto(origin + route);
      await page.evaluate(() => document.fonts.ready);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await assertLayout(`${route}: ${fontFamily} font at 200% and ${width}px`);
        await openSettings();
        assert.equal(await page.locator('#a11y-font-family').inputValue(), fontFamily);
        await assertLayout(`${route}: ${fontFamily} settings at 200% and ${width}px`);
        await closeSettings();
        await page.locator('#navigation-toggle').click();
        await assertLayout(`${route}: ${fontFamily} navigation at 200% and ${width}px`);
        await page.keyboard.press('Escape');
      }
    }
  }
  console.log('PASS: all font choices reflow at 200% with every spacing option on mobile.');

  for (const route of routes) {
    for (const contrast of ['default', 'light', 'dark']) {
      await storePreferences({ ...defaults, contrast });
      await page.goto(origin + route);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      await assertAxe(`${route}: ${contrast} page`);
      await openSettings();
      await assertAxe(`${route}: ${contrast} dialog`);
      if (process.env.A11Y_SCREENSHOTS && route === '/' && contrast === 'default') {
        await page.screenshot({
          path: path.join(process.env.A11Y_SCREENSHOTS, 'default-dialog.png'),
        });
      }
      await closeSettings();
      if (process.env.A11Y_SCREENSHOTS && route === '/') {
        await mkdir(process.env.A11Y_SCREENSHOTS, { recursive: true });
        await page.screenshot({
          path: path.join(process.env.A11Y_SCREENSHOTS, `${contrast}-desktop.png`),
        });
      }
    }
  }
  console.log(
    'PASS: automated WCAG A/AA checks on all pages and the settings dialog in every color scheme.',
  );

  await storePreferences(defaults);
  for (const route of routes) {
    await page.goto(origin + route);
    assert.equal(
      (await page.locator('.site-header .brand-wordmark').innerText()).trim(),
      'Reside Here',
      `${route}: the header uses the title-case wordmark`,
    );
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await scrollToAndSettle(0);
      const chair = await page.locator('.site-header .brand-chair').evaluate((image) => {
        const rect = image.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      const expectedSize = width > 900 ? 80 : 64;
      assert.ok(
        Math.abs(chair.width - expectedSize) <= 1 && Math.abs(chair.height - expectedSize) <= 1,
        `${route}: the header chair is ${expectedSize}px square at ${width}px`,
      );
      await assertLayout(`${route}: compact header branding at ${width}px`);
      if (width <= 900) {
        const topbar = await page.locator('.topbar-inner').evaluate((element) => {
          const bounds = (node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          };
          return {
            bar: bounds(element),
            accessibility: bounds(element.querySelector('button')),
            phone: bounds(element.querySelector('a[href^="tel:"]')),
            maintenance: bounds(element.querySelector('.topbar-maintenance-link')),
          };
        });
        assert.ok(topbar.bar.height <= topbar.accessibility.height + 8, 'Mobile green bar stays compact');
        assert.ok(topbar.phone.x >= topbar.accessibility.x + topbar.accessibility.width);
        assert.equal(await page.locator('.topbar-maintenance-link').isVisible(), false);
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await scrollToAndSettle(0);
    const expandedHeader = await headerGeometry();
    assert.ok(expandedHeader.paddingTop <= 4 && expandedHeader.paddingBottom <= 4);
    assert.equal(expandedHeader.position, 'sticky', `${route}: desktop header remains sticky`);
    assert.equal(expandedHeader.stuck, false, `${route}: the header starts unshrunk`);
    assert.equal(expandedHeader.taglineOpacity, 1, `${route}: the tagline is visible at the top`);
    assert.ok(expandedHeader.taglineHeight > 0, `${route}: the tagline has room at the top`);
    const stickyThreshold = await page
      .locator('.topbar')
      .evaluate((element) => element.getBoundingClientRect().bottom + window.scrollY);
    for (const [top, expectedStuck] of [
      [Math.max(0, Math.floor(stickyThreshold) - 2), false],
      [Math.ceil(stickyThreshold) + 2, true],
    ]) {
      const transitions = await scrollToAndSettle(top);
      if (expectedStuck) {
        assert.ok(
          transitions.includes('opacity') &&
            transitions.some((property) => property?.startsWith('padding-')),
          `${route}: the tagline fade and header padding animate when scrolling down`,
        );
      }
      await page.waitForFunction(
        (expected) =>
          (document.querySelector('.site-header').dataset.stuck === 'true') === expected,
        expectedStuck,
      );
      const samples = await page.locator('.site-header').evaluate(async (header) => {
        const values = [];
        for (let frame = 0; frame < 8; frame += 1) {
          await new Promise(requestAnimationFrame);
          values.push({
            stuck: header.dataset.stuck === 'true',
            width: header.querySelector('.brand-chair').getBoundingClientRect().width,
            scrollY: window.scrollY,
          });
        }
        return values;
      });
      assert.ok(
        samples.every(
          (sample) =>
            sample.stuck === expectedStuck &&
            Math.abs(sample.width - (expectedStuck ? 64 : 80)) <= 1 &&
            Math.abs(sample.scrollY - samples[0].scrollY) <= 1,
        ),
        `${route}: header size and scroll position remain stable near the sticky threshold`,
      );
    }
    await scrollToAndSettle(Math.max(500, stickyThreshold + 100));
    const stuckHeader = await headerGeometry();
    assert.equal(stuckHeader.paddingTop, 0);
    assert.equal(stuckHeader.paddingBottom, 0);
    assert.equal(stuckHeader.stuck, true, `${route}: scrolling activates the compact header`);
    assert.ok(Math.abs(stuckHeader.top) <= 1, `${route}: the scrolled header stays at the top`);
    assert.ok(
      Math.abs(stuckHeader.chairWidth - 64) <= 1 &&
        Math.abs(stuckHeader.chairHeight - 64) <= 1 &&
        stuckHeader.height <= expandedHeader.height - 12,
      `${route}: sticky mode reduces both the chair and the header height`,
    );
    assert.equal(stuckHeader.taglineOpacity, 0, `${route}: the tagline fades out after scrolling`);
    assert.ok(
      stuckHeader.taglineHeight <= 1 && stuckHeader.taglineMargin <= 1,
      `${route}: the hidden tagline releases its height and margin`,
    );
    assert.ok(
      stuckHeader.paddingTop < expandedHeader.paddingTop &&
        stuckHeader.paddingBottom < expandedHeader.paddingBottom,
      `${route}: scrolling reduces padding above and below the navigation`,
    );
    for (const [index, link] of stuckHeader.links.entries()) {
      const expandedLink = expandedHeader.links[index];
      assert.ok(
        link.paddingTop < expandedLink.paddingTop &&
          link.paddingBottom < expandedLink.paddingBottom,
        `${route}: ${link.label} reduces its vertical padding`,
      );
      assert.ok(
        link.width >= 43.5 && link.height >= 43.5,
        `${route}: ${link.label} retains a 44px target when the header shrinks`,
      );
    }
    const restoringTransitions = await scrollToAndSettle(0);
    assert.ok(
      restoringTransitions.includes('opacity') &&
        restoringTransitions.some((property) => property?.startsWith('padding-')),
      `${route}: the tagline fade and padding animate when returning to the top`,
    );
    const restoredHeader = await headerGeometry();
    assert.equal(restoredHeader.stuck, false, `${route}: returning to the top clears sticky mode`);
    assert.ok(
      Math.abs(restoredHeader.chairWidth - 80) <= 1 &&
        Math.abs(restoredHeader.height - expandedHeader.height) <= 1,
      `${route}: returning to the top restores the original compact header size`,
    );
    assert.equal(restoredHeader.taglineOpacity, 1, `${route}: the tagline fades back in at the top`);
    for (const property of ['taglineHeight', 'taglineMargin', 'paddingTop', 'paddingBottom']) {
      assert.ok(
        Math.abs(restoredHeader[property] - expandedHeader[property]) <= 1,
        `${route}: returning to the top restores ${property}`,
      );
    }
    assert.deepEqual(
      restoredHeader.links,
      expandedHeader.links,
      `${route}: returning to the top restores all navigation button sizes and padding`,
    );

    if (route === '/') {
      for (const { label, systemMotion, preferences } of [
        { label: 'system reduced motion', systemMotion: 'reduce', preferences: defaults },
        {
          label: 'accessibility reduced motion',
          systemMotion: 'no-preference',
          preferences: { ...defaults, reduceMotion: true },
        },
      ]) {
        await page.emulateMedia({ reducedMotion: systemMotion });
        await storePreferences(preferences);
        await page.reload();
        await scrollToAndSettle(0);
        const transitionDurations = await page.locator('.site-header').evaluate((header) =>
          [...header.querySelectorAll('.header-inner, .brand-chair, .brand-small, .site-nav a')]
            .flatMap((element) => getComputedStyle(element).transitionDuration.split(','))
            .map((duration) => parseFloat(duration)),
        );
        assert.ok(
          transitionDurations.every((duration) => duration <= 0.00001),
          `${label}: header transitions are disabled`,
        );
        assert.deepEqual(
          await scrollToAndSettle(500),
          [],
          `${label}: scrolling does not start a header animation`,
        );
        const compact = await headerGeometry();
        assert.equal(compact.stuck, true, `${label}: the compact header is still available`);
        assert.equal(compact.taglineOpacity, 0, `${label}: the tagline hides immediately`);
        await scrollToAndSettle(0);
        assert.equal((await headerGeometry()).taglineOpacity, 1, `${label}: the tagline returns`);
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }

    for (const width of [390, 320]) {
      await storePreferences(defaults);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + route);
      await scrollToAndSettle(0);
      const mobileExpanded = await headerGeometry();
      assert.equal(mobileExpanded.position, 'sticky', `${route}: mobile header is sticky`);
      await scrollToAndSettle(500);
      const mobileCompact = await headerGeometry();
      assert.equal(mobileCompact.stuck, true);
      assert.ok(Math.abs(mobileCompact.top) <= 1);
      assert.equal(mobileCompact.chairWidth, 48);
      assert.equal(mobileCompact.taglineOpacity, 0);
      assert.ok(mobileCompact.height < mobileExpanded.height);
      await page.locator('#navigation-toggle').click();
      assert.equal(await page.locator('#secondary-navigation .nav-tenant-login').isVisible(), true);
      assert.equal(await page.locator('#site-nav > .nav-cta').isVisible(), false);
      await assertLayout(`${route}: scrolled mobile overlay at ${width}px`);
      await Promise.all([
        page.waitForEvent('load'),
        page.locator('.site-header .brand').click(),
      ]);
      assert.equal(new URL(page.url()).pathname, '/index.html');
      assert.equal(await page.locator('h1').innerText(), siteData.home.heading);
      await page.goto(origin + route);
    }

    for (const { label, width, preferences } of [
      { label: 'large text', width: 1440, preferences: { ...defaults, textSize: '200' } },
      { label: 'text spacing', width: 1440, preferences: { ...defaults, textSpacing: true } },
    ]) {
      await storePreferences(preferences);
      await page.setViewportSize({ width, height: 1000 });
      await page.reload();
      await scrollToAndSettle(0);
      const beforeScroll = await headerGeometry();
      assert.equal(beforeScroll.position, 'static', `${route}: ${label} keeps a static header`);
      await scrollToAndSettle(500);
      const afterScroll = await headerGeometry();
      assert.equal(afterScroll.stuck, false, `${route}: ${label} does not activate sticky shrink`);
      assert.ok(
        afterScroll.top < 0 &&
          Math.abs(afterScroll.chairWidth - beforeScroll.chairWidth) <= 1 &&
          Math.abs(afterScroll.height - beforeScroll.height) <= 1 &&
          afterScroll.taglineOpacity === 1 &&
          Math.abs(afterScroll.taglineHeight - beforeScroll.taglineHeight) <= 1,
        `${route}: ${label} scrolls the header away without changing its size`,
      );
    }
    await storePreferences(defaults);
    await page.reload();
    await scrollToAndSettle(0);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.addStyleTag({
      content:
        '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
    });
    await scrollToAndSettle(0);
    await assertLayout(`${route}: custom text spacing`);
    const navLinks = page.locator('#site-nav a');
    assert.deepEqual(
      (await navLinks.allTextContents()).map((text) => text.trim().replace(/\s+/g, ' ')),
      navigationLabels,
    );
    const nav = page.locator('#site-nav');
    const menu = page.locator('#navigation-toggle');
    const secondary = page.locator('#secondary-navigation');
    assert.equal(await menu.isVisible(), true);
    assert.equal(await menu.getAttribute('aria-controls'), 'secondary-navigation');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await secondary.isVisible(), false);
    assert.equal(await nav.locator('.nav-cta').isVisible(), false);
    for (const name of secondaryNavigationLabels) {
      assert.equal(
        await nav.getByRole('link', { name, exact: true, includeHidden: true }).isVisible(),
        false,
        `${name} is disclosed by Menu`,
      );
    }
    await menu.focus();
    const mainPosition = await page.locator('main').evaluate((element) =>
      element.getBoundingClientRect().top + window.scrollY,
    );
    const closedHeaderHeight = (await headerGeometry()).height;
    await menu.press('Enter');
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    assert.equal(await secondary.isVisible(), true);
    assert.equal(await secondary.evaluate((element) => element.inert), false);
    assert.equal(await secondary.evaluate((element) => getComputedStyle(element).position), 'absolute');
    assert.ok(Math.abs((await headerGeometry()).height - closedHeaderHeight) <= 1);
    assert.ok(Math.abs(await page.locator('main').evaluate((element) =>
      element.getBoundingClientRect().top + window.scrollY,
    ) - mainPosition) <= 1, 'Opening the mobile menu never pushes content down');
    await secondary.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
    });
    assert.equal(await secondary.evaluate((element) => getComputedStyle(element).opacity), '1');
    await assertLayout(`${route}: expanded mobile menu with custom text spacing`);
    if (route === '/') await assertAxe('Expanded mobile navigation');
    for (const name of secondaryNavigationLabels) {
      const link = nav.getByRole('link', { name, exact: true });
      assert.equal(await link.isVisible(), true);
      await link.focus();
      assert.equal(await link.evaluate((element) => element === document.activeElement), true);
    }
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await secondary.evaluate((element) => element.inert), true);
    assert.equal(await secondary.getAttribute('aria-hidden'), 'true');
    await secondary.waitFor({ state: 'hidden' });
    assert.equal(await secondary.isVisible(), false);
    assert.equal(
      await menu.evaluate((element) => element === document.activeElement),
      true,
      'Escape closes the mobile menu and returns focus to its button',
    );
    await menu.press('Space');
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    if (route === '/') {
      await nav.getByRole('link', { name: 'Contact Us', exact: true }).click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      await secondary.waitFor({ state: 'hidden' });
      assert.equal(await secondary.isVisible(), false);
      assert.equal(
        await page.locator('#contact').evaluate((element) => element === document.activeElement),
        true,
        'Same-page Contact Us closes the menu and focuses its target',
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(() => !document.querySelector('#secondary-navigation').inert);
    assert.equal(await menu.isVisible(), false);
    for (const name of navigationLabels) {
      assert.equal(
        await nav.getByRole('link', { name, exact: true }).isVisible(),
        true,
        `${name} is visible after resizing to desktop`,
      );
    }
    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForFunction(() => document.querySelector('#secondary-navigation').inert);
    await secondary.waitFor({ state: 'hidden' });
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await menu.isVisible(), true);
    assert.equal(await nav.locator('.nav-cta').isVisible(), false);
    for (const [name, href] of [
      ['Rental Search', siteData.links.rentalSearch],
      ['Tenant Login', siteData.links.tenantLogin],
      ['Rental Criteria', siteData.links.rentalCriteria],
      ['Rental Info', siteData.links.rentalInfo],
    ]) {
      assert.equal(
        await nav
          .getByRole('link', { name, exact: true, includeHidden: true })
          .getAttribute('href'),
        href,
      );
    }
  }
  console.log(
    'PASS: animated sticky header/tagline, stable thresholds, 44px targets, reduced-motion preferences, static accessible layouts, and mobile navigation.',
  );

  await page.goto(origin);
  await openSettings();
  await page.locator('#a11y-reset').click();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), null);
  await page.locator('#a11y-text-size').selectOption('150');
  const otherTab = await context.newPage();
  await otherTab.goto(origin + '/floor-plans.html');
  await page.locator('#a11y-text-size').selectOption('125');
  await page.locator('#a11y-font-family').selectOption('atkinson');
  await page.locator('#a11y-line-height').selectOption('relaxed');
  await page.locator('#a11y-heavier-text').check();
  await otherTab.waitForFunction(() => document.documentElement.dataset.textSize === '125');
  await otherTab.waitForFunction(() => {
    const settings = document.documentElement.dataset;
    return (
      settings.fontFamily === 'atkinson' &&
      settings.lineHeight === 'relaxed' &&
      settings.heavierText === 'true'
    );
  });
  await page.locator('#a11y-reset').click();
  await otherTab.waitForFunction(() => document.documentElement.dataset.textSize === '100');
  assert.equal(await otherTab.locator('html').getAttribute('data-font-family'), 'default');
  assert.equal(await otherTab.locator('html').getAttribute('data-line-height'), 'default');
  assert.equal(await otherTab.locator('html').getAttribute('data-heavier-text'), 'false');
  await otherTab.close();
  await closeSettings();
  for (const value of [
    'broken-json',
    '[]',
    '{"textSize":"9000","contrast":"unknown","reduceMotion":"false","controlLabels":"false","fontFamily":"unknown","lineHeight":"9000","heavierText":"true"}',
  ]) {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value });
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-text-size'), '100');
    assert.equal(await page.locator('html').getAttribute('data-contrast'), 'default');
    assert.equal(await page.locator('html').getAttribute('data-reduce-motion'), 'false');
    assert.equal(await page.locator('html').getAttribute('data-font-family'), 'system');
    assert.equal(await page.locator('html').getAttribute('data-line-height'), 'default');
    assert.equal(await page.locator('html').getAttribute('data-heavier-text'), 'false');
    assert.equal(await page.locator('html').getAttribute('data-control-labels'), 'false');
    assert.equal(await page.locator('html').getAttribute('data-accessibility-enabled'), 'false');
  }
  for (const [preferences, expectedFont] of [
    [{ readingFont: true }, 'system'],
    [{ readingFont: true, fontFamily: 'invalid' }, 'system'],
    [{ readingFont: true, fontFamily: 'atkinson' }, 'atkinson'],
    [{ readingFont: true, fontFamily: 'default' }, 'default'],
    [{ readingFont: false }, 'auto'],
    [{ readingFont: 'true' }, 'auto'],
  ]) {
    await storePreferences(preferences);
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-font-family'), expectedFont === 'auto' ? 'system' : expectedFont);
    await openSettings();
    assert.equal(await page.locator('#a11y-font-family').inputValue(), expectedFont);
    await page.locator('#a11y-line-height').selectOption('relaxed');
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(saved.fontFamily, expectedFont, 'Saving preserves the migrated font choice');
    assert.equal(Object.hasOwn(saved, 'readingFont'), false, 'Saving uses the current schema');
    await closeSettings();
  }
  await storePreferences(defaults);
  await page.reload();
  console.log('PASS: reset, cross-tab synchronization, invalid settings, and legacy font migration.');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    'auto',
  );
  await page.locator('#navigation-toggle').click();
  await page.locator('#site-nav a[href="#contact"]').click();
  assert.equal(
    await page.locator('#contact').evaluate((element) => element === document.activeElement),
    true,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openSettings();
  await page.locator('#a11y-reduce-motion').check();
  await closeSettings();
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    'auto',
  );
  await page.emulateMedia({ forcedColors: 'active' });
  await openSettings();
  assert.equal(await page.locator('#a11y-contrast').isVisible(), true);
  await assertLayout('Forced colors dialog');
  await closeSettings();
  await page.emulateMedia({ forcedColors: 'none' });
  console.log('PASS: system/explicit reduced motion, direct contact focus, and forced colors.');

  await storePreferences(defaults);
  await page.goto(origin);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const galleries = page.locator('[data-property-gallery]');
  const galleryCount = await galleries.count();
  assert.ok(galleryCount > 0, 'The home page includes a property photo gallery');
  const assertGalleryGeometry = async (showLabels, label) => {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    for (let index = 0; index < galleryCount; index += 1) {
      const gallery = galleries.nth(index);
      const photo = gallery.locator('[data-property-slide]:not([hidden]) img').first();
      await photo.evaluate((element) => element.decode());
      const geometry = await gallery.evaluate((element) => {
        const slide = element.querySelector('[data-property-slide]:not([hidden])');
        const image = slide.querySelector('img');
        const caption = slide.querySelector('figcaption');
        const dots = element.querySelector('[data-gallery-dots]');
        const bounds = (node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        };
        const frame = bounds(image);
        const scale = Math.min(
          frame.width / image.naturalWidth,
          frame.height / image.naturalHeight,
        );
        const contentWidth = image.naturalWidth * scale;
        const contentHeight = image.naturalHeight * scale;
        const contentLeft = frame.left + (frame.width - contentWidth) / 2;
        const contentTop = frame.top + (frame.height - contentHeight) / 2;
        return {
          photo: frame,
          content: {
            left: contentLeft,
            top: contentTop,
            right: contentLeft + contentWidth,
            bottom: contentTop + contentHeight,
            width: contentWidth,
            height: contentHeight,
          },
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          objectFit: getComputedStyle(image).objectFit,
          viewportWidth: innerWidth,
          textSize: document.documentElement.dataset.textSize,
          dots: bounds(dots),
          dotPosition: getComputedStyle(dots).position,
          indicators: [...dots.querySelectorAll('[data-gallery-dot]')].map(bounds),
          caption: {
            ...bounds(caption),
            name: caption.querySelector('strong')?.textContent.trim(),
            linkLabel: caption.querySelector('a')?.textContent.trim(),
          },
          controlRow: bounds(element.querySelector('[data-gallery-controls]')),
          controls: ['[data-gallery-previous]', '[data-gallery-next]'].map((selector) => {
            const button = element.querySelector(selector);
            const style = getComputedStyle(button);
            const background = style.backgroundColor;
            const alpha = background.startsWith('rgba(')
              ? Number(background.match(/,\s*([\d.]+)\s*\)$/)?.[1])
              : background === 'transparent'
                ? 0
                : 1;
            return { ...bounds(button), background, alpha };
          }),
        };
      });
      assert.ok(geometry.naturalWidth > 0 && geometry.naturalHeight > 0, `${label}: photo loads`);
      if (geometry.viewportWidth > 900) {
        assert.ok(
          Math.abs(
            geometry.photo.height -
              (geometry.photo.width * geometry.naturalHeight) / geometry.naturalWidth,
          ) <= 2,
          `${label}: the desktop photo frame matches the native image ratio`,
        );
        assert.ok(
          Math.abs(geometry.content.height - geometry.photo.height) <= 2,
          `${label}: desktop photos have no vertical letterboxing`,
        );
      } else {
        assert.ok(
          Math.abs(geometry.photo.height - (geometry.photo.width * 10) / 16) <= 2,
          `${label}: the mobile photo frame keeps a 16:10 ratio`,
        );
      }
      assert.equal(
        geometry.objectFit,
        'contain',
        `${label}: the complete photo fits inside the taller frame without cropping`,
      );
      assert.ok(
        Math.abs(
          geometry.content.width / geometry.content.height -
            geometry.naturalWidth / geometry.naturalHeight,
        ) < 0.001,
        `${label}: rendered photo content retains its intrinsic proportions`,
      );
      const insidePhoto = (rect) =>
        rect.left >= geometry.content.left - 1 &&
        rect.right <= geometry.content.right + 1 &&
        rect.top >= geometry.content.top - 1 &&
        rect.bottom <= geometry.content.bottom + 1;
      assert.equal(geometry.dotPosition, 'absolute', `${label}: position dots overlay the photo`);
      assert.ok(insidePhoto(geometry.dots), `${label}: the dot group stays inside the photo`);
      assert.ok(
        geometry.indicators.length > 0 && geometry.indicators.every(insidePhoto),
        `${label}: every position indicator stays inside the photo`,
      );
      assert.ok(
        Math.abs(
          (geometry.dots.left + geometry.dots.right) / 2 -
            (geometry.content.left + geometry.content.right) / 2,
        ) <= 2,
        `${label}: position dots are horizontally centered`,
      );
      assert.ok(
        geometry.content.bottom - geometry.dots.bottom <=
          Math.max(48, geometry.content.height * 0.15),
        `${label}: position dots sit near the bottom of the photo`,
      );
      assert.ok(
        geometry.caption.top >= geometry.photo.bottom - 1,
        `${label}: the property caption sits below the photo`,
      );
      assert.ok(geometry.caption.name, `${label}: the caption includes the property name`);
      assert.equal(
        geometry.caption.linkLabel,
        siteData.home.galleryLinkLabel,
        `${label}: the caption retains the rental information link`,
      );
      if (!showLabels && geometry.textSize === '100') {
        const maxCaptionHeight = geometry.viewportWidth <= 390 ? 120 : 100;
        assert.ok(
          geometry.caption.height <= maxCaptionHeight,
          `${label}: default caption stays compact (${geometry.caption.height}px)`,
        );
        assert.ok(
          geometry.controlRow.height <= 2,
          `${label}: default controls do not create an extra footer row`,
        );
      }
      for (const control of geometry.controls) {
        assert.ok(
          control.width >= 43.5 && control.height >= 43.5,
          `${label}: photo arrows have at least 44px tap targets`,
        );
        if (showLabels) {
          assert.ok(
            control.top >= geometry.photo.bottom - 1,
            `${label}: labeled accessibility controls stay below the photo`,
          );
        } else {
          assert.ok(insidePhoto(control), `${label}: arrow bounds stay inside the active photo`);
          assert.ok(
            control.alpha > 0 && control.alpha < 1,
            `${label}: arrow backdrop is translucent (${control.background})`,
          );
        }
      }
      if (!showLabels) {
        assert.ok(
          geometry.controls[0].right < geometry.controls[1].left,
          `${label}: previous and next arrows occupy opposite photo edges`,
        );
      }
    }
  };
  const assertControlPresentation = async (showLabels) => {
    const labels = galleries.locator('.gallery-control-label');
    assert.equal(await labels.count(), galleryCount * 2);
    for (let index = 0; index < (await labels.count()); index += 1) {
      const display = await labels
        .nth(index)
        .evaluate((element) => getComputedStyle(element).display);
      assert.equal(
        display !== 'none',
        showLabels,
        'Gallery control labels follow accessibility preferences',
      );
    }
    for (let index = 0; index < galleryCount; index += 1) {
      const gallery = galleries.nth(index);
      for (const selector of ['[data-gallery-previous]', '[data-gallery-next]']) {
        const button = gallery.locator(selector);
        const name = await button.getAttribute('aria-label');
        assert.ok(name?.trim(), 'Gallery controls always have accessible names');
        assert.equal(
          await gallery.getByRole('button', { name, exact: true, includeHidden: true }).count(),
          1,
        );
      }
      const status = gallery.locator('[data-gallery-status]');
      assert.match((await status.textContent()).trim(), /^Photo \d+ of \d+$/);
      const presentation = await status.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          availableToScreenReaders:
            !element.hidden &&
            style.display !== 'none' &&
            style.visibility === 'visible' &&
            !element.closest('[aria-hidden="true"]'),
          visuallyClipped:
            (rect.width <= 1 && rect.height <= 1) ||
            style.clipPath !== 'none' ||
            style.clip !== 'auto',
        };
      });
      assert.equal(
        presentation.availableToScreenReaders,
        true,
        'The photo status remains available to screen readers',
      );
      assert.equal(
        presentation.visuallyClipped,
        !showLabels,
        'The photo status is visually shown with control labels',
      );
    }
  };
  assert.equal(await page.locator('html').getAttribute('data-control-labels'), 'false');
  assert.equal(await page.locator('html').getAttribute('data-accessibility-enabled'), 'false');
  await assertControlPresentation(false);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await assertGalleryGeometry(false, `Default gallery at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSettings();
  await page.locator('#a11y-control-labels').check();
  assert.equal(await page.locator('html').getAttribute('data-control-labels'), 'true');
  assert.equal(await page.locator('html').getAttribute('data-accessibility-enabled'), 'true');
  assert.equal(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).controlLabels, key),
    true,
  );
  await assertControlPresentation(true);
  await closeSettings();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await assertGalleryGeometry(true, `Labeled gallery at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await assertControlPresentation(true);
  await openSettings();
  assert.equal(await page.locator('#a11y-control-labels').isChecked(), true);
  await page.locator('#a11y-reset').click();
  assert.equal(await page.locator('html').getAttribute('data-control-labels'), 'false');
  assert.equal(await page.locator('html').getAttribute('data-accessibility-enabled'), 'false');
  await assertControlPresentation(false);
  await page.locator('#a11y-text-size').selectOption('125');
  assert.equal(await page.locator('html').getAttribute('data-control-labels'), 'false');
  assert.equal(await page.locator('html').getAttribute('data-accessibility-enabled'), 'true');
  await assertControlPresentation(true);
  await page.locator('#a11y-reset').click();
  await assertControlPresentation(false);
  await closeSettings();
  console.log(
    'PASS: taller proportional photo frames, overlaid dots, compact captions, and accessible control positions persist across sizes.',
  );

  const gallerySizes = [];
  const galleryDestinations = [];
  const assertImageDecoded = async (image, label) => {
    await image.scrollIntoViewIfNeeded();
    const result = await image.evaluate(async (element) => {
      try {
        await element.decode();
        return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
      } catch {
        return false;
      }
    });
    assert.equal(result, true, `${label}: image loads and decodes`);
  };
  for (let galleryIndex = 0; galleryIndex < galleryCount; galleryIndex += 1) {
    const gallery = galleries.nth(galleryIndex);
    const slides = gallery.locator('[data-property-slide]');
    const slideCount = await slides.count();
    const previous = gallery.locator('[data-gallery-previous]');
    const next = gallery.locator('[data-gallery-next]');
    const status = gallery.locator('[data-gallery-status]');
    const dotWrapper = gallery.locator('[data-gallery-dots]');
    const dots = dotWrapper.locator('[data-gallery-dot]');
    gallerySizes.push(slideCount);
    assert.ok(slideCount > 0, 'Each gallery contains photos');
    assert.equal(await gallery.getAttribute('data-gallery-ready'), 'true');
    assert.equal(
      await gallery.locator('[data-gallery-controls]').evaluate((element) => element.hidden),
      false,
    );
    assert.equal(await previous.isVisible(), true);
    assert.equal(await next.isVisible(), true);
    assert.equal(await status.getAttribute('aria-live'), 'polite');
    assert.equal(await dotWrapper.getAttribute('aria-hidden'), 'true');
    assert.equal(await dots.count(), slideCount);
    assert.equal(
      await dots.evaluateAll((elements) =>
        elements.every(
          (element) =>
            element.tagName === 'SPAN' &&
            element.tabIndex < 0 &&
            !element.matches('[role="button"],[role="link"],[contenteditable="true"]'),
        ),
      ),
      true,
      'Position dots are decorative and do not add keyboard stops',
    );
    assert.equal(await dotWrapper.locator('button,a[href],input,select,textarea').count(), 0);
    const assertActiveSlide = async (activeIndex, focusedButton) => {
      assert.equal(
        (await status.textContent()).trim(),
        `Photo ${activeIndex + 1} of ${slideCount}`,
      );
      assert.deepEqual(
        await dots.evaluateAll((elements) =>
          elements.flatMap((element, index) =>
            element.getAttribute('aria-current') === 'true' ? [index] : [],
          ),
        ),
        [activeIndex],
        'Exactly one position dot follows the active photo',
      );
      for (let index = 0; index < slideCount; index += 1) {
        assert.equal(
          await slides.nth(index).evaluate((element) => element.hidden),
          index !== activeIndex,
          `Gallery ${galleryIndex + 1}, photo ${index + 1}: hidden state`,
        );
        assert.equal(await slides.nth(index).isVisible(), index === activeIndex);
      }
      if (focusedButton) {
        assert.equal(
          await focusedButton.evaluate((element) => element === document.activeElement),
          true,
          'Changing photos preserves focus on the gallery control',
        );
      }
    };
    await assertActiveSlide(0);
    if (slideCount > 1) {
      await previous.click();
      await assertActiveSlide(slideCount - 1, previous);
      await next.click();
      await assertActiveSlide(0, next);
      await next.press('ArrowRight');
      await assertActiveSlide(1, next);
      await next.press('ArrowLeft');
      await assertActiveSlide(0, next);
    } else {
      assert.equal(await previous.isDisabled(), true);
      assert.equal(await next.isDisabled(), true);
    }
    for (let slideIndex = 0; slideIndex < slideCount; slideIndex += 1) {
      const slide = slides.nth(slideIndex);
      await assertActiveSlide(slideIndex);
      const photos = slide.locator('img');
      assert.ok((await photos.count()) > 0, 'Every gallery slide includes a photo');
      for (let imageIndex = 0; imageIndex < (await photos.count()); imageIndex += 1) {
        await assertImageDecoded(photos.nth(imageIndex), `Gallery photo ${slideIndex + 1}`);
      }
      await assertGalleryGeometry(false, `Gallery ${galleryIndex + 1}, photo ${slideIndex + 1}`);
      const href = await slide.locator('figcaption a').getAttribute('href');
      const destination = new URL(href, origin);
      assert.equal(destination.origin, origin, 'Gallery links stay on this site');
      assert.equal(destination.pathname, '/floor-plans.html');
      assert.ok(destination.hash.length > 1, 'Gallery links identify a particular property');
      galleryDestinations.push({
        href,
        propertyId: decodeURIComponent(destination.hash.slice(1)),
        name: (await slide.locator('figcaption strong').innerText()).trim(),
      });
      if (slideCount > 1) {
        await next.click();
        await assertActiveSlide((slideIndex + 1) % slideCount, next);
      }
    }
  }
  console.log(
    'PASS: manual gallery navigation, wrapping, keyboard controls, focus, and photo decoding.',
  );

  await page.goto(origin + '/floor-plans.html');
  for (const { href, propertyId, name } of galleryDestinations) {
    const target = await page.evaluate((id) => {
      const element = document.getElementById(id);
      return (
        element && {
          isProperty: element.matches('article.property-card'),
          name: element.querySelector('h2')?.textContent.trim(),
        }
      );
    }, propertyId);
    assert.deepEqual(target, { isProperty: true, name }, `${href} opens the matching property`);
  }
  const floorplanImages = page.locator('.property-floorplan img');
  assert.ok(
    (await floorplanImages.count()) > 0,
    'Rental information includes real floor plan images',
  );
  for (let index = 0; index < (await floorplanImages.count()); index += 1) {
    await assertImageDecoded(floorplanImages.nth(index), `Floor plan ${index + 1}`);
  }
  const pdfLinks = await page
    .locator('.property-floorplan a[href]')
    .evaluateAll((links) => [
      ...new Set(
        links.map((link) => link.href).filter((href) => new URL(href).pathname.endsWith('.pdf')),
      ),
    ]);
  assert.ok(pdfLinks.length > 0, 'Floor plans include original PDF downloads');
  for (const href of pdfLinks) {
    assert.equal(new URL(href).origin, origin, 'Floor plan PDFs are served locally');
    const response = await context.request.get(href);
    assert.equal(response.status(), 200, `${href}: PDF is available`);
    assert.match(response.headers()['content-type'] || '', /^application\/pdf(?:;|$)/i);
    assert.equal((await response.body()).subarray(0, 5).toString(), '%PDF-');
    await response.dispose();
  }
  console.log(
    'PASS: gallery links match property destinations, floor plan images decode, and local PDFs load.',
  );

  const unavailableFontContext = await browser.newContext({
    viewport: { width: 320, height: 900 },
  });
  let blockedFontRequests = 0;
  await unavailableFontContext.route('**/*', async (route) => {
    if (route.request().resourceType() === 'font') {
      blockedFontRequests += 1;
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  const fontFallbackPage = await unavailableFontContext.newPage();
  const fallbackErrors = [];
  fontFallbackPage.on('pageerror', (error) => fallbackErrors.push(error.message));
  await fontFallbackPage.goto(origin);
  for (const fontFamily of ['default', 'atkinson', 'system']) {
    await fontFallbackPage.evaluate(
      ({ key, preferences }) => localStorage.setItem(key, JSON.stringify(preferences)),
      { key, preferences: { ...maximal, fontFamily } },
    );
    for (const route of routes) {
      await fontFallbackPage.goto(origin + route);
      await fontFallbackPage.evaluate(() => document.fonts.ready);
      assert.equal(await fontFallbackPage.locator('h1').isVisible(), true);
      assert.ok((await fontFallbackPage.locator('h1').innerText()).trim().length > 0);
      await assertLayout(`${route}: ${fontFamily} with blocked fonts at 200%`, fontFallbackPage);
      await fontFallbackPage.locator('[data-accessibility-open]').first().click();
      assert.equal(await fontFallbackPage.locator('#a11y-font-family').inputValue(), fontFamily);
      await assertLayout(`${route}: blocked-font settings stay usable`, fontFallbackPage);
      await fontFallbackPage.keyboard.press('Escape');
    }
  }
  assert.ok(blockedFontRequests > 0, 'Font failure coverage actually blocks font downloads');
  assert.deepEqual(fallbackErrors, [], 'Font failures do not interrupt page scripts');
  await unavailableFontContext.close();
  console.log('PASS: every page and font choice remains usable when web fonts cannot load.');

  const blockedStorage = await browser.newContext();
  await blockedStorage.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  const blockedPage = await blockedStorage.newPage();
  await blockedPage.goto(origin);
  await blockedPage.locator('[data-accessibility-open]').first().click();
  await blockedPage.locator('#a11y-text-size').selectOption('150');
  assert.equal(await blockedPage.locator('html').getAttribute('data-text-size'), '150');
  assert.match(await blockedPage.locator('#a11y-status').innerText(), /not saving/);
  await blockedStorage.close();

  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 800 },
  });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto(origin);
  assert.equal(await noJsPage.locator('#site-nav').isVisible(), true);
  assert.equal(await noJsPage.locator('[data-accessibility-open]').first().isVisible(), false);
  assert.equal(await noJsPage.locator('#site-nav a').count(), 5);
  const noJsGalleries = noJsPage.locator('[data-property-gallery]');
  assert.equal(await noJsGalleries.count(), galleryCount);
  for (let galleryIndex = 0; galleryIndex < galleryCount; galleryIndex += 1) {
    const gallery = noJsGalleries.nth(galleryIndex);
    const slides = gallery.locator('[data-property-slide]');
    assert.equal(await slides.count(), gallerySizes[galleryIndex]);
    assert.equal(await gallery.locator('[data-gallery-controls]').isVisible(), false);
    for (let slideIndex = 0; slideIndex < gallerySizes[galleryIndex]; slideIndex += 1) {
      assert.equal(
        await slides.nth(slideIndex).isVisible(),
        true,
        'All photos remain visible without JavaScript',
      );
      assert.equal(await slides.nth(slideIndex).evaluate((element) => element.hidden), false);
    }
  }
  for (const route of routes) {
    await noJsPage.goto(origin + route);
    const nav = noJsPage.locator('#site-nav');
    assert.equal(await nav.isVisible(), true);
    assert.equal(await noJsPage.locator('#navigation-toggle').isVisible(), false);
    assert.deepEqual(
      (await nav.locator('a').allTextContents()).map((text) => text.trim().replace(/\s+/g, ' ')),
      navigationLabels,
    );
    for (const name of secondaryNavigationLabels) {
      assert.equal(
        await nav.getByRole('link', { name, exact: true }).isVisible(),
        true,
        `${route}: ${name} remains visible without JavaScript`,
      );
    }
  }
  await noJs.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: blocked storage, no-JavaScript navigation and galleries, and no local request or script errors.',
  );
} finally {
  await browser?.close();
  server.kill();
}
