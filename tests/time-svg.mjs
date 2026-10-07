/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run with: node tests/time-svg.mjs (no local server required).
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
  const checks = await page.evaluate(async () => {
    const { captureTimeSnapshot, makeTimeComposition } = await import('/timeSvg.js');
    const passed = [], check = (value, text) => { if (!value) throw new Error(text); passed.push(text); };
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" id="art" width="100" height="100" viewBox="-50 -50 100 100" style="filter:url(#effect)">
      <style>.shared{fill:url(#paint);stroke:none} #art{clip-path:url(#clip)}</style>
      <defs><linearGradient id="paint"><stop stop-color="#00cc00"/><stop offset="1" stop-color="#00cc00"/></linearGradient>
      <clipPath id="clip"><rect x="-50" y="-50" width="100" height="100"/></clipPath>
      <filter id="effect"><feGaussianBlur stdDeviation="0"/></filter><circle id="dot" r="2"/></defs>
      <rect class="shared" x="-50" y="-50" width="100" height="100" onclick="window.changed=true"/>
      <use href="#dot" x="-30" y="-30"/><use xlink:href="#dot" x="30" y="-30"/>
      <circle id="moving" cy="30" r="1" cx="10"><animate attributeName="cx" from="10" to="90" dur="8s" repeatCount="indefinite"/></circle>
      <line id="line" y1="-40" x2="-30" y2="-40"><animate attributeName="x1" from="-40" to="40" dur="8s" repeatCount="indefinite"/></line>
      <circle id="motion" r="1"><animateMotion path="M0 0 L80 40" dur="8s" repeatCount="indefinite"/></circle>
      <circle id="transforming" r="1"><animateTransform attributeName="transform" type="translate" from="0 0" to="80 40" dur="8s" repeatCount="indefinite"/></circle>
      <script>window.changed=true;</script></svg>`;
    const svg = document.querySelector('svg'); svg.pauseAnimations(); svg.setCurrentTime(2);
    const original = svg.outerHTML;
    const first = captureTimeSnapshot(svg, { id: 'first', capturedAt: 2 });
    check(svg.outerHTML === original, 'capture leaves the live artwork unchanged');
    check(first.width === 100 && first.height === 100 && first.capturedAt === 2, 'capture retains viewport dimensions and sample time');
    const parse = text => new DOMParser().parseFromString(text, 'image/svg+xml');
    const saved = parse(first.svg), captured = saved.documentElement;
    check(!saved.querySelector('parsererror'), 'snapshot serializes valid standalone XML');
    check(captured.getAttribute('viewBox') === '-50 -50 100 100', 'snapshot preserves the source coordinate origin');
    check(!saved.querySelector('script,style,animate,[onclick]'), 'snapshot has no active scripts, handlers, stylesheet, or SMIL animation');
    check(parseFloat(saved.querySelector('[id$="moving"]').getAttribute('cx')) === 30, 'SMIL geometry freezes its currently displayed value');
    check(parseFloat(saved.querySelector('[id$="line"]').getAttribute('x1')) === -20, 'SMIL freezes attributes even when the base attribute was absent');
    check(saved.querySelector('[id$="motion"]').style.transform === 'matrix(1, 0, 0, 1, 20, 10)', 'SMIL motion retains its displayed local transformation');
    check(saved.querySelector('[id$="transforming"]').style.transform === 'matrix(1, 0, 0, 1, 20, 10)', 'SMIL transform animation retains its displayed transformation');
    const ids = new Set([...saved.querySelectorAll('[id]')].map(node => node.id));
    for (const node of [captured, ...captured.querySelectorAll('*')]) for (const attr of node.attributes) {
      for (const match of attr.value.matchAll(/url\(["']?#([^\s"')]+)/g)) check(ids.has(match[1]), `frozen reference resolves: ${match[1]}`);
      if (attr.localName === 'href') check(ids.has(attr.value.slice(1)), 'both SVG and xlink use references resolve');
    }
    for (const stop of svg.querySelectorAll('stop')) stop.setAttribute('stop-color', '#0000ee');
    svg.setCurrentTime(4);
    const second = captureTimeSnapshot(svg, { id: 'second', capturedAt: 4 });
    const positions = [{ x: 0, y: 0, width: 100, height: 100 }, { x: 100, y: 0, width: 100, height: 100 }];
    const output = makeTimeComposition({ width: 200, height: 100 }, [first, second], positions);
    check(output.querySelectorAll(':scope > g > svg').length === 2, 'composition preserves two nested vector snapshots');
    check(output.querySelector('[data-time-id="second"]').getAttribute('data-time-index') === '1', 'preview carries stable snapshot interaction targets');
    const outputIds = [...output.querySelectorAll('[id]')].map(node => node.id);
    check(new Set(outputIds).size === outputIds.length, 'gradients, clips, filters, and artwork IDs are unique across frames');
    const serialized = new XMLSerializer().serializeToString(output);
    check(!parse(serialized).querySelector('parsererror'), 'composition serializes valid standalone XML with xlink');
    check(!serialized.includes('<image'), 'composition contains native vector artwork');
    const blob = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }));
    try {
      const image = new Image(); image.src = blob; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const firstPixel = context.getImageData(50, 50, 1, 1).data, secondPixel = context.getImageData(150, 50, 1, 1).data;
      check(firstPixel[1] === 204 && firstPixel[2] === 0 && firstPixel[3] === 255, 'first exported frame keeps its green gradient after live artwork changes');
      check(secondPixel[1] === 0 && secondPixel[2] === 238 && secondPixel[3] === 255, 'second exported frame uses its own blue gradient');
    } finally { URL.revokeObjectURL(blob); }
    const overflow = makeTimeComposition({ width: 200, height: 100 }, [first, second], [
      { x: -40, y: -20, width: 100, height: 100 }, { x: 220, y: 110, width: 150, height: 80 },
    ]);
    check(overflow.getAttribute('viewBox') === '-40 -20 410 210', 'export includes negative and overflowing free/function placements');
    check(first.svg === new XMLSerializer().serializeToString(captured), 'composition does not mutate saved snapshots');
    const repeated = makeTimeComposition({}, [first, first], positions);
    const repeatedIds = [...repeated.querySelectorAll('[id]')].map(node => node.id);
    check(new Set(repeatedIds).size === repeatedIds.length, 'reusing one saved frame still creates unique local definitions');
    return passed;
  });
  assert.ok(checks.length > 20);
  console.log(`Time SVG: ${checks.length} browser checks passed.`);
} finally { await browser.close(); }
