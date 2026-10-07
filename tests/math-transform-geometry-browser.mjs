/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const executablePath = process.env.CHROME_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.route('**/__math-geometry-test__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Math geometry tests</title>' }));
  await page.goto(`${process.env.TRANSFORM_TEST_URL || 'https://127.0.0.1:5500'}/__math-geometry-test__`);
  const checks = await page.evaluate(async () => {
    const { applyMathTransforms, parseSvgPath, parseSvgTransform, applySvgMatrix, multiplySvgMatrices } = await import('/helper/mathTransformGeometry.js');
    const { createMathMapper } = await import('/helper/mathTransformMath.js');
    const passed = [], check = (value, text) => { if (!value) throw new Error(text); passed.push(text); };
    const bounds = { x: -100, y: -100, w: 200, h: 200 };
    const fixture = markup => { const group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.innerHTML = markup; return group; };
    const primitives = fixture('<circle cx="10" cy="20" r="8"/><ellipse cx="-10" cy="-20" rx="9" ry="4"/><rect x="20" y="30" width="9" height="15" rx="2"/><line x1="2" y1="6" x2="15" y2="11"/><polyline points="0,3 8,7 4,9"/><polygon points="3,5 15,7 3,9"/>');
    const report = applyMathTransforms(primitives, { viewBox: bounds, operations: [{ type: 'vortex' }] });
    check(report.transformed === 6 && primitives.querySelectorAll('path').length === 6, 'all SVG primitives become mapped vector paths');
    check(!/NaN|Infinity/.test(primitives.innerHTML), 'primitive geometry remains finite');
    const source = fixture('<g transform="translate(13 17) rotate(23) scale(1.7 .8)"><path id="curve" transform="translate(3 7) rotate(-17)" d="M 20 12 L 30 15" stroke="orange" fill="none"/></g>');
    const before = source.innerHTML, branches = source.cloneNode(true), single = source.cloneNode(true);
    const config = { kind: 'warp', type: 'root', power: 5, allBranches: true, center: { x: .3, y: .6 } };
    const branchReport = applyMathTransforms(branches, { viewBox: bounds, operations: [config] });
    const singleReport = applyMathTransforms(single, { viewBox: bounds, operations: [{ ...config, allBranches: false, branch: 0 }] });
    check(branchReport.sampled === singleReport.sampled, 'N root sheets use the same sample budget as one sheet');
    const originalMatrix = multiplySvgMatrices(parseSvgTransform(source.firstElementChild.getAttribute('transform')), parseSvgTransform(source.querySelector('path').getAttribute('transform')));
    const originalPoint = applySvgMatrix(originalMatrix, [20, 12]);
    for (const path of branches.querySelectorAll('path')) {
      const branch = Number(path.getAttribute('data-xf-math-branch'));
      const expected = createMathMapper(config, bounds, branch).sample(...originalPoint).point;
      const resultMatrix = multiplySvgMatrices(parseSvgTransform(path.parentNode.getAttribute('transform')), parseSvgTransform(path.getAttribute('transform') || ''));
      const result = applySvgMatrix(resultMatrix, parseSvgPath(path.getAttribute('d'))[0].start);
      check(Math.hypot(result[0] - expected[0], result[1] - expected[1]) < .001, `root sheet ${branch} rotates correctly through nested matrices`);
    }
    check(source.innerHTML === before && branches.querySelectorAll('[id="curve"]').length === 1, 'branch expansion preserves source and unique IDs');
    const useFixture = fixture('<defs><path id="seed" d="M 10 20 L 20 30"/></defs><use href="#seed" x="7" y="9" transform="rotate(30)" fill="none" stroke="gold"/>');
    const useReport = applyMathTransforms(useFixture, { viewBox: bounds, operations: [{ type: 'vortex' }] });
    check(useReport.transformed === 1 && !useFixture.querySelector('use'), 'local SVG use references expand and deform');
    check(useFixture.querySelector('defs path').getAttribute('d') === 'M 10 20 L 20 30', 'definition source geometry stays unchanged');
    const features = fixture('<defs><clipPath id="clip"><circle r="20"/></clipPath></defs><path clip-path="url(#clip)" d="M 2 3 L 4 5"/><text x="10" y="10">label</text><image width="5" height="5" href="data:image/png;base64,"/><svg viewBox="0 0 10 10"><circle r="2"/></svg>');
    const featureReport = applyMathTransforms(features, { viewBox: bounds, operations: [{ type: 'vortex' }] });
    check(features.querySelector('clipPath circle')?.getAttribute('r') === '20' && featureReport.warnings.some(w => w.includes('Clips')), 'clips are retained with an explicit geometry warning');
    check(featureReport.skipped === 3 && featureReport.warnings.some(w => w.includes('Text, images')), 'unsupported artwork is retained and reported');
    const base = fixture('<path d="M20 20L21 21"/><path d="M-100 0L100 0"/>');
    const identityWarp = { type: 'vortex', strength: 0 }, expensive = { type: 'vortex', strength: 20 };
    const expected = base.cloneNode(true), stacked = base.cloneNode(true);
    const firstReport = applyMathTransforms(expected, { viewBox: bounds, operations: [identityWarp] });
    const stackedReport = applyMathTransforms(stacked, { viewBox: bounds, operations: [identityWarp, expensive, { type: 'power' }], maxPoints: firstReport.sampled + 100 });
    check(stackedReport.limited && stacked.innerHTML === expected.innerHTML, 'budget exhaustion retains the last complete operation and skips later operations');
    check(stackedReport.transformed === 2 && stackedReport.warnings.some(w => w.includes('not applied')), 'atomic budget report counts only committed transformed shapes');
    return passed;
  });
  assert.deepEqual(errors, []);
  console.log(`${checks.length} geometry browser checks passed.\n${checks.join('\n')}`);
} finally { await browser.close(); }
