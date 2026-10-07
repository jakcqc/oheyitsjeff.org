/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run against the repository's local server (override TRANSFORM_TEST_URL).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const executablePath = process.env.CHROME_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1050, height: 850 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const base = process.env.TRANSFORM_TEST_URL || 'https://127.0.0.1:5500';
  await page.route('**/__transform-test__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/helper/uiHelper.css"></head><body style="background:#171717;color:#eee;margin:20px;overflow:auto"><div id="panel" class="vr-tabBody" style="width:420px"></div><div id="vis" style="position:absolute;left:480px;top:30px"></div></body></html>' }));
  await page.goto(`${base}/__transform-test__`);
  const results = await page.evaluate(async () => {
    const { initTransformRuntime, buildTransformPanel, ensureTransformState } = await import('/helper/transformHelp.js');
    const checks = [];
    const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
    const mountEl = document.getElementById('vis');
    mountEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-120 -90 240 180" width="480" height="360"><g fill="#ff7b32" transform="translate(3 4)"><defs><linearGradient id="ink"><stop stop-color="#ff7b32"/><stop offset="1" stop-color="#ffdf50"/></linearGradient></defs><circle id="mark" cx="53" cy="12" r="9" fill="url(#ink)"/><path d="M 22 2 L 40 4 L 28 14 Z"/></g></svg>';
    const svg = mountEl.querySelector('svg');
    const source = svg.querySelector('g');
    const state = {};
    ensureTransformState(state);
    const runtime = initTransformRuntime({ mountEl, state });
    let dirty = 0;
    const panel = buildTransformPanel({ mountEl, state, xfRuntime: runtime, onStateChange: () => dirty++ });
    document.getElementById('panel').appendChild(panel);
    const button = text => [...panel.querySelectorAll('button')].find(node => node.textContent.trim() === text);
    const tab = name => [...panel.querySelectorAll('[role="tab"]')].find(node => node.textContent === name);
    const input = (key, value, event = 'change') => {
      const node = panel.querySelector(`[data-xf-key="${key}"]`);
      if (node.type === 'checkbox') node.checked = value; else node.value = String(value);
      node.dispatchEvent(new Event(event, { bubbles: true }));
      return node;
    };
    const apply = panel.querySelector('[data-xf-action="apply"]');
    check(panel.querySelectorAll('[role="tab"]').length === 6, 'six transform subtabs');
    check([...panel.querySelectorAll('.xf-footer button')].map(node => node.textContent.trim()).join(',') === 'apply,undo,reset', 'sticky footer contains exactly Apply, Undo, Reset in order');
    check(apply === button('apply') && !panel.querySelector('[role="tabpanel"] button'), 'one shared Apply replaces inline transform action buttons');
    check(button('undo').disabled && button('reset').disabled, 'empty history disables undo and reset');
    tab('Symmetry').click();
    check(tab('Symmetry').getAttribute('aria-selected') === 'true', 'symmetry tab selects accessibly');
    check(apply.disabled && panel.querySelector('.xf-applyHint').textContent.includes('automatically'), 'kaleidoscope explains that its controls apply automatically');
    check(state.__xf.stack.length === 0, 'opening kaleidoscope does not apply an operation');
    const activePanel = panel.querySelector('[role="tabpanel"]:not([hidden])');
    const countField = activePanel.querySelector('input[type="number"]');
    countField.focus(); countField.value = '5'; countField.dispatchEvent(new Event('input', { bubbles: true }));
    check(document.activeElement === countField && countField.isConnected, 'number edit retains input focus');
    check(state.__xf.stack.length === 1 && state.__xf.stack.at(-1).count === 5, 'editing N applies immediately without Apply');
    countField.dispatchEvent(new Event('change', { bubbles: true }));
    check(state.__xf.stack.length === 1, 'committing an already-live number edit does not duplicate history');
    check(svg.querySelectorAll('use[data-xf-sector]').length === 10, 'odd N has 2N mirrored sectors');
    check(source.style.display === 'none', 'live source hidden while instances render');
    check(svg.querySelectorAll('[data-xf-layer] circle').length === 1, 'one source clone regardless of N');
    check(svg.querySelector('[data-xf-layer] g[fill="#ff7b32"]').getAttribute('transform') === 'translate(3 4)', 'source group style and transform preserved');
    const clonedCircle = svg.querySelector('[data-xf-layer] circle');
    const gradientRef = clonedCircle.getAttribute('fill').slice(5, -1);
    check(svg.querySelector(`[id="${gradientRef}"]`)?.tagName === 'linearGradient', 'cloned sibling gradient reference resolves');
    const rasterize = async (target = svg) => {
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(target)], { type: 'image/svg+xml' }));
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, 480, 360).data;
      } finally { URL.revokeObjectURL(url); }
    };
    const pixels = await rasterize();
    check(pixels.filter((v, i) => i % 4 === 3 && v > 100).length > 5000, 'exported SVG renders its clipped use instances');
    // The off-axis source circle must appear under each dihedral action.
    const theta = Math.atan2(16, 56), r = Math.hypot(56, 16);
    for (let k = 0; k < 5; k++) for (const angle of [theta + k * 2 * Math.PI / 5, (k + 1) * 2 * Math.PI / 5 - theta]) {
      const px = Math.round((120 + r * Math.cos(angle)) * 2), py = Math.round((90 + r * Math.sin(angle)) * 2);
      check(pixels[(py * 480 + px) * 4 + 3] > 200, `rendered symmetry image ${k}, ${angle}`);
    }
    source.querySelector('circle').setAttribute('r', '10');
    await new Promise(resolve => setTimeout(resolve, 100));
    check(svg.querySelector('[data-xf-layer] circle').getAttribute('r') === '10', 'source animation redraw updates instances');
    const saved = JSON.parse(JSON.stringify(state.__xf));
    state.__xf = saved; runtime.rebuildNow(); panel._onShow?.();
    check(!svg.innerHTML.includes('NaN') && svg.querySelectorAll('use[data-xf-sector]').length === 10, 'saved config round trips with automatic center');
    state.__xf.stack.push({ kind: 'kaleidoscope', count: 7 }); runtime.rebuildNow(); panel._onShow?.();
    button('undo').click();
    check(svg.querySelectorAll('use[data-xf-sector]').length === 10, 'undo restores the previous kaleidoscope');
    state.__xf.stack.push({ kind: 'split', count: 2 }, { kind: 'kaleidoscope', count: 3, mirror: false, targets: [1] });
    runtime.rebuildNow();
    check(svg.querySelectorAll('use[data-xf-sector][data-xf-mode="0"]').length === 10 && svg.querySelectorAll('use[data-xf-sector][data-xf-mode="1"]').length === 3, 'latest kaleidoscope applies only to targeted tiles');
    state.__xf.stack.push({ kind: 'planes3d', count: 2, targets: [1], baseScale: 1, scaleStep: -.2 }); runtime.rebuildNow();
    check(svg.querySelectorAll('use[data-xf-sector][data-xf-mode="1"]').length === 6, 'kaleidoscope composes with plane layers');
    const ids = [...svg.querySelectorAll('[id]')].map(node => node.id);
    check(new Set(ids).size === ids.length, 'all source and generated IDs unique');
    const extraMount = document.createElement('div'); document.body.appendChild(extraMount);
    extraMount.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-120 -90 240 180" width="480" height="360"><g><circle cx="105" cy="5" r="3" fill="red"/></g><g id="sibling" style="display:inline"><rect x="35" y="10" width="5" height="5" fill="blue"/></g><g id="invisible" style="display:none"><circle r="80" fill="green"/></g></svg>';
    const extraSvg = extraMount.querySelector('svg');
    const sibling = extraSvg.querySelector('#sibling');
    const extraState = { __xf: { ui: { splitMode: 'fit' }, stack: [
      { kind: 'split', count: 4 }, { kind: 'kaleidoscope', count: 4, mirror: false, targets: [0] },
    ] } };
    const extraRuntime = initTransformRuntime({ mountEl: extraMount, state: extraState }); extraRuntime.rebuildNow();
    check(sibling.style.display === 'none' && extraSvg.querySelectorAll('[data-xf-layer] rect[fill="blue"]').length === 4, 'sibling artwork participates in every tile without a stray original');
    check([...extraSvg.querySelectorAll('[data-xf-layer] g[id^="invisible__"]')].every(node => node.style.display === 'none'), 'intentionally hidden artwork stays hidden');
    const tilePixels = await rasterize(extraSvg);
    check(tilePixels[(195 * 480 + 115) * 4 + 3] === 0, 'rotated wedge cannot bleed into neighboring tile');
    check(tilePixels[(275 * 480 + 225) * 4 + 3] > 200, 'untargeted tile keeps its own source artwork');
    sibling.querySelector('rect').setAttribute('fill', 'purple');
    await new Promise(resolve => setTimeout(resolve, 100));
    check(extraSvg.querySelectorAll('[data-xf-layer] rect[fill="purple"]').length === 4, 'sibling updates refresh the whole kaleidoscope scene');
    extraState.__xf.stack.pop(); extraRuntime.rebuildNow();
    check(sibling.style.display === 'inline', 'leaving kaleidoscope mode restores sibling visibility');
    extraState.__xf.stack.push({ kind: 'kaleidoscope', count: 3 }); extraRuntime.rebuildNow();
    extraRuntime.destroy();
    check(sibling.style.display === 'inline' && !extraSvg.querySelector('[data-xf-layer]').children.length, 'destroy restores sibling layers and removes generated artwork');
    extraMount.remove();
    panel._onShow?.(); button('reset').click();
    check(state.__xf.stack.length === 0 && source.style.display === '' && !svg.querySelector('[data-xf-layer]').children.length, 'reset restores source and removes definitions');
    check(source.getAttribute('transform') === 'translate(3 4)', 'reset restores original transform');
    panel._onShow?.();
    check(state.__xf.stack.length === 0 && source.style.display === '', 'showing kaleidoscope after Reset does not reapply saved controls');
    check(dirty > 0, 'toolbar edits notify persistence');

    const finishEdit = node => node.dispatchEvent(new Event('change', { bubbles: true }));
    const geometry = () => JSON.stringify([...svg.querySelectorAll('clipPath path, use[data-xf-sector]')].map(node => [node.tagName, node.getAttribute('d'), node.getAttribute('transform')]));
    const liveCount = input('kaleidoscope.count', 6, 'input');
    check(state.__xf.stack.at(-1).count === 6 && svg.querySelectorAll('use[data-xf-sector]').length === 12, 'live N updates rendered sector count');
    finishEdit(liveCount);
    const beforeMirror = JSON.stringify(state.__xf.stack);
    const mirror = input('kaleidoscope.mirror', false, 'input');
    check(!state.__xf.stack.at(-1).mirror && svg.querySelectorAll('use[data-xf-sector]').length === 6, 'mirror checkbox applies immediately on input');
    finishEdit(mirror);
    check(JSON.stringify(state.__xf.stack.slice(0, -1)) === beforeMirror, 'changing mirror preserves earlier completed operations');
    const centerX = input('kaleidoscope.center.x', 13, 'input');
    check(state.__xf.stack.at(-1).center.x === 13, 'center input applies immediately');
    finishEdit(centerX);
    const beforeCenterY = JSON.stringify(state.__xf.stack);
    const centerY = input('kaleidoscope.center.y', -7, 'input');
    check(state.__xf.stack.at(-1).center.y === -7, 'second center input applies immediately');
    finishEdit(centerY);
    check(JSON.stringify(state.__xf.stack.slice(0, -1)) === beforeCenterY, 'editing a center coordinate preserves earlier center objects');
    const angle = panel.querySelector('[data-xf-key="kaleidoscope.rotationDeg"]');
    check(angle.type === 'range' && angle.min === '0' && angle.max === '360' && angle.step === '1', 'sector angle uses a native degree slider');
    const beforeDrag = state.__xf.stack.length;
    const savedBeforeDrag = dirty;
    angle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    for (const degrees of [11, 27, 63]) input('kaleidoscope.rotationDeg', degrees, 'input');
    check(state.__xf.stack.length === beforeDrag + 1 && state.__xf.stack.at(-1).rotationDeg === 63, 'continuous slider inputs update one live history operation');
    check(dirty === savedBeforeDrag, 'live drag does not persist every intermediate frame');
    const angleValue = panel.querySelector('[data-xf-range-value="kaleidoscope.rotationDeg"]');
    check(angleValue?.textContent.includes('63') && angleValue.textContent.includes('°'), 'sector angle shows its current degree value');
    finishEdit(angle);
    check(state.__xf.stack.length === beforeDrag + 1, 'ending the slider gesture does not append a duplicate');
    check(dirty === savedBeforeDrag + 1, 'completed drag persists one edit');
    const firstDragGeometry = geometry();
    const firstDragHistory = JSON.stringify(state.__xf.stack);
    angle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    for (const degrees of [94, 121]) input('kaleidoscope.rotationDeg', degrees, 'input');
    finishEdit(angle);
    check(state.__xf.stack.length === beforeDrag + 2 && state.__xf.stack.at(-1).rotationDeg === 121, 'a separate slider gesture creates one additional undo step');
    check(JSON.stringify(state.__xf.stack.slice(0, -1)) === firstDragHistory && geometry() !== firstDragGeometry, 'a new slider gesture changes geometry without changing previous history');
    button('undo').click();
    check(JSON.stringify(state.__xf.stack) === firstDragHistory && geometry() === firstDragGeometry, 'Undo restores geometry before the latest slider gesture');
    const beforeTargets = JSON.stringify(state.__xf.stack);
    input('applyToAll', false); input('tileTargets', '0');
    check(JSON.stringify(state.__xf.stack) === beforeTargets, 'editing target settings does not change applied operations');
    const targetAngle = input('kaleidoscope.rotationDeg', 150, 'input'); finishEdit(targetAngle);
    check(JSON.stringify(state.__xf.stack.slice(0, -1)) === beforeTargets && JSON.stringify(state.__xf.stack.at(-1).targets) === '[0]', 'next live edit captures the current targets without mutating earlier operations');
    const beforeIncomplete = JSON.stringify(state.__xf.stack), beforeIncompleteGeometry = geometry();
    input('kaleidoscope.count', '', 'input');
    check(liveCount.value === '' && JSON.stringify(state.__xf.stack) === beforeIncomplete && geometry() === beforeIncompleteGeometry && !svg.innerHTML.includes('NaN'), 'incomplete number editing keeps the field text and previous valid geometry');
    input('kaleidoscope.count', 8, 'input'); finishEdit(liveCount);
    const beforeInterruptedDrag = state.__xf.stack.length;
    input('kaleidoscope.rotationDeg', 170, 'input');
    tab('Arrange').click(); tab('Symmetry').click();
    input('kaleidoscope.rotationDeg', 180, 'input'); finishEdit(angle);
    check(state.__xf.stack.length === beforeInterruptedDrag + 2 && state.__xf.stack.at(-2).rotationDeg === 170, 'switching tabs ends the current slider gesture');
    const beforeToolSwitch = state.__xf.stack.length;
    input('kaleidoscope.rotationDeg', 195, 'input');
    input('symmetryAction', 'flipX'); input('symmetryAction', 'kaleidoscope');
    input('kaleidoscope.rotationDeg', 205, 'input'); finishEdit(angle);
    check(state.__xf.stack.length === beforeToolSwitch + 2 && state.__xf.stack.at(-2).rotationDeg === 195, 'switching symmetry tools ends the current slider gesture');
    input('kaleidoscope.rotationDeg', 206, 'input');
    const savedBeforeHide = dirty;
    panel._onHide?.();
    check(dirty === savedBeforeHide + 1 && state.__xf.stack.at(-1).rotationDeg === 206, 'hiding the panel persists an unfinished live edit');
    button('reset').click(); panel._onShow?.();
    check(state.__xf.stack.length === 0 && source.style.display === '', 'Reset remains stable after live controls and panel refresh');
    input('applyToAll', true);

    const applyOnce = (kind, description, verify = () => true) => {
      const previousCount = state.__xf.stack.length;
      const label = { split: 'Tile layout', rotate: 'Rotate', translate: 'Translate', flipX: 'Flip X', flipY: 'Flip Y', warp: 'Hamiltonian vortex', matrix: 'Affine matrix', planes3d: 'Stacked planes', zoom: state.__xf.ui.arrangeAction === 'zoomOut' ? 'Zoom out' : 'Zoom in' }[kind];
      check(panel.querySelector('.xf-applyHint').textContent.includes(label), `${description}: footer identifies the pending action`);
      check(!apply.disabled, `${description}: Apply is available`);
      apply.click();
      const operation = state.__xf.stack.at(-1);
      check(state.__xf.stack.length === previousCount + 1 && operation.kind === kind && verify(operation), `${description}: sticky Apply adds exactly the selected operation`);
      button('undo').click();
      check(state.__xf.stack.length === previousCount, `${description}: sticky Undo removes that operation`);
    };
    tab('Arrange').click();
    check(state.__xf.ui.arrangeAction === 'split', 'Arrange initially selects tile layout');
    input('splitCount', 4);
    applyOnce('split', 'Arrange split', op => op.count === 4);
    input('arrangeAction', 'rotate'); input('rotateDeg', 37);
    check(panel.querySelector('[data-xf-key="rotateDeg"]').checkVisibility() && !panel.querySelector('[data-xf-key="splitCount"]').checkVisibility(), 'Arrange shows settings only for the selected tool');
    applyOnce('rotate', 'Arrange rotate', op => op.deg === 37);
    input('zoomFactor', 2);
    input('arrangeAction', 'zoomIn'); applyOnce('zoom', 'Arrange zoom in', op => op.factor === 2);
    input('arrangeAction', 'zoomOut'); applyOnce('zoom', 'Arrange zoom out', op => op.factor === .5);
    input('arrangeAction', 'translate'); input('translateVec.x', 8); input('translateVec.y', -3);
    applyOnce('translate', 'Arrange translate', op => op.v.x === 8 && op.v.y === -3);
    input('arrangeAction', 'preset'); input('preset', '');
    check(apply.disabled, 'unavailable preset disables sticky Apply');
    check(panel.querySelector('.xf-applyHint').textContent.includes('Choose a preset'), 'unavailable preset explains how to enable Apply');
    const beforeEmptyPreset = JSON.stringify(state.__xf.stack);
    apply.click();
    check(JSON.stringify(state.__xf.stack) === beforeEmptyPreset, 'unavailable preset leaves history untouched');
    tab('Symmetry').click();
    check(apply.disabled && state.__xf.ui.symmetryAction === 'kaleidoscope' && panel.querySelector('.xf-applyHint').textContent.includes('automatically'), 'switching from an unavailable preset identifies automatic kaleidoscope controls');
    input('symmetryAction', 'flipX'); applyOnce('flipX', 'Symmetry flip X');
    input('symmetryAction', 'flipY'); applyOnce('flipY', 'Symmetry flip Y');
    check(!panel.querySelector('[data-xf-key="kaleidoscope.count"]').checkVisibility(), 'Symmetry hides kaleidoscope settings when a flip is selected');
    tab('Math').click(); input('math.type', 'vortex'); input('math.strength', 1.7);
    applyOnce('warp', 'Math vortex', op => op.type === 'vortex' && op.strength === 1.7);
    tab('Matrix').click(); input('matrix.a', 1.3); input('matrix.e', 17);
    applyOnce('matrix', 'Matrix', op => op.m[0] === 1.3 && op.m[4] === 17);
    tab('Layers').click(); input('planeCount', 2);
    applyOnce('planes3d', 'Layers', op => op.count === 2);
    tab('History').click();
    const beforeHistoryApply = JSON.stringify(state.__xf.stack);
    check(apply.disabled, 'History disables sticky Apply');
    check(panel.querySelector('.xf-applyHint').textContent.includes('Choose a transform tab'), 'History explains why no tool can be applied');
    apply.click();
    check(JSON.stringify(state.__xf.stack) === beforeHistoryApply, 'History cannot reapply the previous tool');
    tab('Arrange').click(); input('arrangeAction', 'rotate');
    applyOnce('rotate', 'returning to Arrange after other tabs', op => op.deg === 37);
    apply.click(); input('arrangeAction', 'preset'); input('preset', 'split4');
    check(!apply.disabled, 'choosing a valid preset enables sticky Apply');
    apply.click();
    check(state.__xf.stack.length === 1 && state.__xf.stack[0].kind === 'split' && state.__xf.stack[0].count === 4, 'sticky preset Apply replaces the previous history once');
    button('reset').click();
    tab('Symmetry').click();
    tab('Symmetry').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    check(tab('Math').getAttribute('aria-selected') === 'true', 'subtabs support arrow-key navigation');
    tab('Symmetry').click();
    input('symmetryAction', 'kaleidoscope');
    input('kaleidoscope.count', 7);
    input('kaleidoscope.center.x', ''); input('kaleidoscope.center.y', '');
    input('kaleidoscope.mirror', true); input('kaleidoscope.rotationDeg', 0);
    window.transformFixture = { state, runtime, panel };
    return checks;
  });
  const slider = page.locator('[data-xf-key="kaleidoscope.rotationDeg"]');
  const sliderBounds = await slider.boundingBox();
  const beforePointer = await page.evaluate(() => window.transformFixture.state.__xf.stack.length);
  await page.mouse.move(sliderBounds.x + sliderBounds.width * .15, sliderBounds.y + sliderBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(sliderBounds.x + sliderBounds.width * .58, sliderBounds.y + sliderBounds.height / 2, { steps: 12 });
  await page.mouse.up();
  const pointerResult = await page.evaluate(() => ({
    count: window.transformFixture.state.__xf.stack.length,
    angle: window.transformFixture.state.__xf.stack.at(-1).rotationDeg,
    slider: Number(document.querySelector('[data-xf-key="kaleidoscope.rotationDeg"]').value),
    output: document.querySelector('[data-xf-range-value="kaleidoscope.rotationDeg"]').textContent,
  }));
  assert.equal(pointerResult.count, beforePointer + 1, 'real pointer drag produces one history operation');
  results.push('real pointer drag produces one history operation');
  assert.ok(pointerResult.angle > 0 && pointerResult.angle === pointerResult.slider && pointerResult.output === `${pointerResult.angle}°`, 'real pointer drag updates the live angle and degree output');
  results.push('real pointer drag updates the live angle and degree output');
  await slider.press('ArrowRight');
  const keyboardResult = await page.evaluate(() => ({
    count: window.transformFixture.state.__xf.stack.length,
    angle: window.transformFixture.state.__xf.stack.at(-1).rotationDeg,
  }));
  assert.ok(keyboardResult.count === pointerResult.count + 1 && keyboardResult.angle === pointerResult.angle + 1, 'keyboard slider adjustment applies automatically in its own undo step');
  results.push('keyboard slider adjustment applies automatically in its own undo step');
  await page.getByRole('button', { name: 'undo', exact: true }).click();
  const afterKeyboardUndo = await page.evaluate(() => ({
    count: window.transformFixture.state.__xf.stack.length,
    angle: window.transformFixture.state.__xf.stack.at(-1).rotationDeg,
    slider: Number(document.querySelector('[data-xf-key="kaleidoscope.rotationDeg"]').value),
  }));
  assert.ok(afterKeyboardUndo.count === pointerResult.count && afterKeyboardUndo.angle === pointerResult.angle && afterKeyboardUndo.slider === pointerResult.angle, 'Undo restores the applied angle and live slider after a keyboard edit');
  results.push('Undo restores the applied angle and live slider after a keyboard edit');
  // Keep the off-axis source inside the source wedge for the review screenshot.
  await slider.press('Home');
  mkdirSync(new URL('../.local/transform-review/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../.local/transform-review/desktop.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#panel').evaluate(node => { node.style.width = '350px'; });
  const overflow = await page.locator('.xf-panel').evaluate(node => node.scrollWidth > node.clientWidth + 1);
  assert.equal(overflow, false, 'transform toolbar fits narrow mobile width');
  const footerLayout = await page.locator('.xf-footer').evaluate(node => {
    const buttons = [...node.querySelectorAll('button')].map(button => button.getBoundingClientRect());
    return { sameRow: buttons.every(button => Math.abs(button.top - buttons[0].top) < 1), inOrder: buttons[0].right <= buttons[1].left && buttons[1].right <= buttons[2].left };
  });
  assert.deepEqual(footerLayout, { sameRow: true, inOrder: true }, 'mobile Apply, Undo and Reset share one row in order');
  await page.getByRole('tab', { name: 'Math', exact: true }).click();
  await page.locator('#panel').evaluate(node => { node.style.height = '400px'; node.style.overflowY = 'auto'; node.scrollTop = 0; });
  const footerBeforeScroll = await page.locator('.xf-footer').boundingBox();
  const scrollRange = await page.locator('#panel').evaluate(node => { node.scrollTop = 100; return { top: node.scrollTop, max: node.scrollHeight - node.clientHeight }; });
  const footerAfterScroll = await page.locator('.xf-footer').boundingBox();
  const scrollBounds = await page.locator('#panel').boundingBox();
  assert.ok(scrollRange.top > 0 && scrollRange.max > scrollRange.top, 'mobile fixture scrolls through long Math settings');
  assert.ok(Math.abs(footerAfterScroll.y - footerBeforeScroll.y) < 2 && footerAfterScroll.y >= scrollBounds.y && footerAfterScroll.y + footerAfterScroll.height <= scrollBounds.y + scrollBounds.height + 1, 'sticky buttons stay in view while Math settings scroll');
  assert.deepEqual(errors, []);
  console.log(`${results.length + 5} transform checks passed.\n${results.join('\n')}`);
} finally { await browser.close(); }
