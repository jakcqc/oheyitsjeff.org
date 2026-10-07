/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const executablePath = process.env.CHROME_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.ODYSSEY_TEST_URL || 'https://127.0.0.1:5500/TheOdyssey/');
  await page.getByRole('heading', { name: 'The odyssey', exact: true }).waitFor();
  const results = await page.evaluate(async () => {
    const { VisualFrame } = await import('./client.js');
    const { sample, flattenParams, defaultParam } = await import('./search.js');
    const settings = await (await fetch('./default-settings.json')).json();
    const catalog = await (await fetch('./catalog.json')).json();
    const app = catalog.apps.find(app => app.id === 'lissajousFigures');
    // Keep source geometry small while exercising the actual sampled toolbar.
    for (const p of flattenParams(app.params)) settings.apps[app.id].params[p.key] = { ...defaultParam(p), enabled: false };
    settings.apps[app.id].params.curveCount.fixed = 1;
    settings.apps[app.id].params.samples.fixed = 32;
    const choices = new Map();
    for (let i = 0; i < settings.samples; i++) {
      const value = sample(app, settings, i);
      const key = value.state.__toolFlows.stages.slice(0, 2).map(stage => stage.enabled).join(',');
      if (!choices.has(key)) choices.set(key, { ...value, index: i });
    }
    window.checkGrayPixels = async svg => {
      const blobURL = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const img = new Image(); img.src = blobURL; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 180;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(img, 0, 0, 240, 180);
        const pixels = context.getImageData(0, 0, 240, 180).data;
        let visible = 0, colored = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 32) continue;
          visible++;
          if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 2) colored++;
        }
        return { visible, colored };
      } finally { URL.revokeObjectURL(blobURL); }
    };
    const results = [];
    for (const [choice, value] of choices) {
      const frame = new VisualFrame(app.url, { mode: 'run', state: value.state, seed: settings.seed + ':' + app.id + ':' + value.index, width: 400, height: 300 });
      try {
        await frame.prepare(15000);
        for (let i = 0; i < 2; i++) {
          const capture = await frame.capture(5000, i ? 100 : 0);
          const svg = new DOMParser().parseFromString(capture.svg, 'image/svg+xml').documentElement;
          results.push({ choice, frame: i, filter: svg.style.filter,
            spline: !!svg.querySelector('[data-spline-lines-group="1"]'),
            kaleidoscope: !!svg.querySelector('[data-xf-mode="3"]'),
            grayscale: capture.state.__toolFlows.stages[2].enabled,
            errors: capture.errors, ...await checkGrayPixels(capture.svg) });
        }
      } finally { frame.destroy(); }
    }
    return results;
  });
  assert.equal(results.length, 8);
  for (const result of results) {
    const [kaleidoscope, spline] = result.choice.split(',').map(value => value === 'true');
    assert.equal(result.kaleidoscope, kaleidoscope, JSON.stringify(result));
    assert.equal(result.spline, spline, JSON.stringify(result));
    assert.equal(result.grayscale, true);
    assert.equal(result.filter, 'grayscale(1)');
    assert(result.visible > 100, 'Capture contains visible artwork');
    assert.equal(result.colored, 0, 'Every rendered pixel is grayscale: ' + JSON.stringify(result));
    assert.deepEqual(result.errors, []);
  }
  // A whole-SVG filter must cover colors that fill/stroke palettes cannot touch.
  const mixed = await page.evaluate(async () => {
    const { applyPropOpsToSubtree } = await import('../helper/svgEditor.js');
    const settings = await (await fetch('./default-settings.json')).json();
    const pixel = document.createElement('canvas'); pixel.width = pixel.height = 4;
    const context = pixel.getContext('2d'); context.fillStyle = '#ff00ff'; context.fillRect(0, 0, 4, 4);
    const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><defs><linearGradient id="colors"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="120" height="180" fill="url(#colors)"/><image x="120" width="120" height="180" href="${pixel.toDataURL()}"/></svg>`, 'image/svg+xml').documentElement;
    const before = await checkGrayPixels(new XMLSerializer().serializeToString(svg));
    applyPropOpsToSubtree(svg, settings.toolbar.__propOps.stack);
    const after = await checkGrayPixels(new XMLSerializer().serializeToString(svg));
    return { before, after };
  });
  assert(mixed.before.colored > 10000, 'Fixture contains colored gradient and bitmap content');
  assert(mixed.after.visible > 10000);
  assert.equal(mixed.after.colored, 0, 'Grayscale covers images and gradients');
  assert.deepEqual(errors, []);
  console.log('Toolbar captures: all four spline/kaleidoscope combinations, repeated frames, grayscale pixels, images and gradients passed.');
} finally { await browser.close(); }
