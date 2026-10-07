/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run with: node tests/time-svg-compact.mjs (no local server required).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const source = readFileSync(new URL('../helper/timeSvg.js', import.meta.url), 'utf8');
const executablePath = process.env.CHROME_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage();
  await page.route('http://time.test/**', route => route.fulfill({
    contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/html',
    body: route.request().url().endsWith('.js') ? source : '<!doctype html><html><body></body></html>',
  }));
  await page.goto('http://time.test/');
  const result = await page.evaluate(async () => {
    const { captureTimeSnapshot, makeTimeComposition } = await import('/timeSvg.js');
    const checks = [], check = (value, message) => { if (!value) throw new Error(message); checks.push(message); };
    document.body.innerHTML = `<style>
      .live { fill:none; stroke:#123456; stroke-width:2; }
      .red { stroke:rgb(210, 20, 40); }
      .geometry { d:path('M10 80 L90 80'); stroke-width:6; }
    </style><svg class="live" width="100" height="100" viewBox="0 0 100 100">
      <g class="red"><path id="open" d="M10 10 L90 10 L50 60"/><path id="sibling" d="M10 65 L90 65"/></g>
      <path id="override" class="geometry" d="M0 0 L1 1"/>
      <rect id="rect" x="10" y="85" width="80" height="5" fill="#22cc44" stroke="none"/>
    </svg>`;
    const live = document.querySelector('svg'), original = live.outerHTML;
    const snapshot = captureTimeSnapshot(live, { id: 'styles' });
    const parse = text => new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
    const saved = parse(snapshot.svg), open = saved.querySelector('[id$="open"]');
    check(live.outerHTML === original, 'capture does not mutate source classes or presentation');
    check(document.querySelectorAll('iframe').length === 0, 'capture removes its isolated measurement document');
    check(saved.style.fill === 'none', 'root fill:none survives the standalone snapshot');
    check(!open.style.d && open.getAttribute('d') === 'M10 10 L90 10 L50 60', 'ordinary paths serialize their geometry once');
    check(!open.style.stroke && !saved.querySelector('[id$="sibling"]').style.stroke, 'siblings inherit captured group paint instead of duplicating it');
    check(saved.querySelector('[id$="override"]').style.d.includes('80'), 'CSS path geometry still overrides its base attribute');
    check(!saved.querySelector('[class], style') && !snapshot.svg.includes('animation:'), 'captured styles are static without repeated animation boilerplate');
    document.querySelector('style').textContent = '.live{fill:black;stroke:black}.red{stroke:black}';
    const composition = makeTimeComposition({ width: 100, height: 100 }, [snapshot], [{ x: 0, y: 0, width: 100, height: 100 }]);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(composition)], { type: 'image/svg+xml' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data];
      check(pixel(50, 25)[3] === 0, 'open paths remain transparent inside after composing');
      check(pixel(50, 10).join(',') === '210,20,40,255', 'captured inherited CSS paint survives source stylesheet changes');
      check(pixel(50, 80).join(',') === '18,52,86,255', 'captured CSS geometry retains its displayed location');
      check(pixel(50, 87).join(',') === '34,204,68,255', 'explicit child paint overrides inherited root paint');
    } finally { URL.revokeObjectURL(url); }
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" fill="none">
      <defs><circle id="shared" r="10"/></defs>
      <use href="#shared" x="25" y="20" fill="red"/>
      <use href="#shared" x="75" y="20" fill="blue"/>
    </svg>`;
    const reusable = captureTimeSnapshot(document.querySelector('svg'), { id: 'uses' });
    const useUrl = URL.createObjectURL(new Blob([reusable.svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image(); image.src = useUrl; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 40;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      check([...context.getImageData(25, 20, 1, 1).data].join(',') === '255,0,0,255'
        && [...context.getImageData(75, 20, 1, 1).data].join(',') === '0,0,255,255',
      'shared definitions retain paint inherited from each use instance');
    } finally { URL.revokeObjectURL(useUrl); }
    const marks = Array.from({ length: 3000 }, (_, i) => `<path d="M${i % 100} ${i % 97}c1.125 2.375 3.625 4.875 5.125 6.375"/>`).join('');
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="none" stroke="#123456">${marks}</svg>`;
    const dense = document.querySelector('svg'), directBytes = new XMLSerializer().serializeToString(dense).length;
    const started = performance.now(), compact = captureTimeSnapshot(dense, { id: 'dense' });
    const captureMs = Math.round(performance.now() - started);
    check(compact.svg.length < directBytes * 1.1, 'dense snapshot stays close to its original vector size');
    const six = makeTimeComposition({ width: 600, height: 100 }, [compact], Array.from({ length: 6 }, (_, i) => ({ id: compact.id, x: i * 100, y: 0, width: 100, height: 100 })));
    const sixBytes = new XMLSerializer().serializeToString(six).length;
    check(sixBytes < directBytes * 6.7, 'six-frame composition scales with six source SVGs');
    return { checks: checks.length, directBytes, snapshotBytes: compact.svg.length, sixBytes, captureMs };
  });
  assert.ok(result.checks >= 14);
  console.log(`Time SVG compact: ${JSON.stringify(result)}`);
} finally { await browser.close(); }
