/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(new URL('../TheOdyssey/package.json', import.meta.url))('playwright');
const executablePath = process.env.CHROME_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const cache = new URL('../.cache/', import.meta.url); await mkdir(cache, { recursive: true });
try {
  await page.goto(process.env.ODYSSEY_TEST_URL || 'https://127.0.0.1:5500/TheOdyssey/');
  await page.getByRole('heading', { name: 'The odyssey', exact: true }).waitFor();
  await page.evaluate(async () => {
    const { OdysseyStorage } = await import('./storage.js');
    const { DEFAULTS } = await import('./search.js');
    const storage = await new OdysseyStorage().open();
    const session = { id: 'search-video-fixture', clientVersion: 1, startedAt: new Date().toISOString(), status: 'complete', cursor: 4, total: 4,
      deletedRuns: ['run-000004'], catalog: { apps: [{ id: 'a', title: 'Visual A', params: [] }, { id: 'b', title: 'Visual B', params: [] }] },
      settings: { ...DEFAULTS, samples: 2, width: 321, height: 241, apps: { a: { enabled: true }, b: { enabled: true } } }, runs: [] };
    const colors = [['red', 'magenta'], ['green'], ['blue', 'yellow']];
    for (let i = 0; i < colors.length; i++) {
      const id = 'run-' + String(i + 1).padStart(6, '0');
      const run = { id, app: i < 2 ? 'a' : 'b', title: i < 2 ? 'Visual A' : 'Visual B', sample: i % 2 + 1, status: i === 1 ? 'timeout' : 'complete', frames: [] };
      for (let n = 0; n < colors[i].length; n++) {
        const file = id + '/frame-' + String(n + 1).padStart(5, '0') + '.svg';
        const width = i < 2 ? 321 : 320, height = i < 2 ? 241 : 240;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${colors[i][n]}"/></svg>`;
        await storage.file(session.id, file, svg); await storage.file(session.id, file.replace('.svg', '.json'), '{}');
        run.frames.push({ file, index: n + 1, bytes: svg.length, errors: [] });
      }
      session.runs.push(run);
    }
    await storage.manifest(session); storage.db.close();
  });
  await page.reload(); await page.waitForFunction(() => document.querySelector('[data-sessions]')?.value === 'search-video-fixture');
  await page.evaluate(() => { window.testPickerCalls = 0; window.showSaveFilePicker = () => { window.testPickerCalls++; throw new Error('No picker is needed after Render'); }; });
  await page.locator('#export-video').click();
  const dialog = page.getByRole('dialog', { name: 'Render MP4' });
  assert.equal(await dialog.locator('#video-apps input:checked').count(), 2);
  await dialog.getByLabel('Frame ranges', { exact: true }).fill('0, 3');
  await dialog.getByLabel('Seconds per saved frame', { exact: true }).fill('0.5');
  assert.match(await dialog.locator('#video-estimate').textContent(), /2 saved frames.*24 video frames.*1.000 seconds/);
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  const download = await downloading;
  const file = fileURLToPath(new URL('odyssey-video-test.mp4', cache)); await download.saveAs(file);
  await page.waitForFunction(() => document.querySelector('#video-status').textContent.startsWith('MP4 download started'));
  assert.equal(await page.evaluate(() => window.testPickerCalls), 0, 'Render completes and starts downloading without another user action');
  const bytes = await readFile(file); assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', windowsHide: true }));
  const video = probe.streams.find(stream => stream.codec_type === 'video');
  assert.equal(video.codec_name, 'h264'); assert.equal(video.width, 322); assert.equal(video.height, 242);
  assert.equal(video.r_frame_rate, '24/1'); assert.equal(video.avg_frame_rate, '24/1');
  assert.equal(Number(video.nb_frames), 24); assert(Math.abs(Number(video.duration) - 1) < 0.001);
  // Independent decoder verifies selection, ordering and exact half-second holds.
  for (const [number, channel] of [[0, 0], [11, 0], [12, 2], [23, 2]]) {
    const rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'select=eq(n\\,' + number + '),crop=2:2:160:120,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    assert(rgb[channel] > 180 && rgb[(channel + 1) % 3] < 60 && rgb[(channel + 2) % 3] < 60, 'Correct held frame at video frame ' + number);
  }
  console.log('MP4 download: H.264, 24 fps, original dimensions with padding, correct frame ranges/order and exact hold durations passed.');

  const svgFlow = await page.evaluate(async () => {
    const { videoSVG } = await import('./video-export.js');
    const { applyToolFlow, getBuiltinToolFlow } = await import('../helper/toolFlowHelp.js');
    const input = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><g transform="translate(3 4)"><path d="M0 0L20 20L0 20Z" fill="blue" stroke="red"/><circle cx="40" cy="40" r="10" fill="none" stroke="lime"/></g></svg>';
    const original = videoSVG(input);
    const output = videoSVG(input, {}, getBuiltinToolFlow('builtin-grayscale'));
    const expected = new DOMParser().parseFromString(original.text, 'image/svg+xml').documentElement;
    const flow = getBuiltinToolFlow('builtin-grayscale');
    applyToolFlow({ mountEl: expected, state: {}, stages: flow.stages });
    const actual = new DOMParser().parseFromString(output.text, 'image/svg+xml').documentElement;
    return {
      elementCount: output.elementCount,
      manyElements: videoSVG('<svg xmlns="http://www.w3.org/2000/svg"><defs><rect width="1" height="1"/></defs><g>' + '<circle r="1"/>'.repeat(10000) + '</g></svg>').elementCount,
      matchesToolbar: output.text === new XMLSerializer().serializeToString(expected),
      fill: actual.querySelector('path').getAttribute('fill'),
      stroke: actual.querySelector('path').getAttribute('stroke'),
      transform: actual.querySelector('g').getAttribute('transform'),
      path: actual.querySelector('path').getAttribute('d'),
      unpaintedFill: actual.querySelector('circle').getAttribute('fill'),
      originalColor: original.text.includes('fill="blue"'),
    };
  });
  assert.equal(svgFlow.elementCount, 2, 'Counts artwork after styling without counting groups');
  assert.equal(svgFlow.manyElements, 10000, 'Counts every artwork element and excludes definitions');
  assert.equal(svgFlow.matchesToolbar, true, 'Export uses the exact standard toolbar flow');
  assert.equal(svgFlow.fill, 'rgb(31, 31, 31)', 'The SVG itself contains the grayscale paint');
  assert.equal(svgFlow.stroke, svgFlow.fill, 'Standard flow maps fill and stroke together');
  assert.equal(svgFlow.transform, 'translate(3 4)');
  assert.equal(svgFlow.path, 'M0 0L20 20L0 20Z');
  assert.equal(svgFlow.unpaintedFill, 'none');
  assert.equal(svgFlow.originalColor, true);

  const previewPixel = () => dialog.locator('#video-preview-canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data]);
  assert.equal(await dialog.locator('#video-preview').isVisible(), true);
  assert.match(await dialog.locator('#video-preview-caption').textContent(), /Last rendered saved frame 3.*Captured styling/);
  assert.deepEqual(await previewPixel(), [0, 0, 255, 255], 'Default preview keeps the captured colors');
  await dialog.getByLabel('Render flow', { exact: true }).selectOption('builtin-grayscale');
  const grayscaleDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  const grayFile = fileURLToPath(new URL('odyssey-video-grayscale-test.mp4', cache));
  await (await grayscaleDownload).saveAs(grayFile);
  assert.match(await dialog.locator('#video-preview-caption').textContent(), /frame 3.*Grayscale/);
  const grayPreview = await previewPixel();
  assert.deepEqual(grayPreview, [31, 31, 31, 255], 'Preview renders the standard SVG grayscale palette');
  for (const [number, expected] of [[0, 54], [11, 54], [12, 31], [23, 31]]) {
    const rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', grayFile, '-frames:v', '1', '-vf', 'select=eq(n\\,' + number + '),crop=2:2:160:120,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    assert(Math.max(...rgb) - Math.min(...rgb) <= 2, 'Encoded video is grayscale');
    assert(Math.abs(rgb[0] - expected) <= 4, 'Encoded luminance matches the rendered preview');
  }
  const unchanged = await page.evaluate(async () => {
    const { OdysseyStorage } = await import('./storage.js'); const storage = await new OdysseyStorage().open();
    const svg = await (await storage.read('search-video-fixture', 'run-000003/frame-00001.svg')).text();
    storage.db.close(); return svg.includes('fill="blue"') && !svg.includes('grayscale');
  });
  assert(unchanged, 'Export styling leaves saved captures unchanged');
  const labelOption = dialog.getByLabel('Show frame number and visual name', { exact: true });
  assert.equal(await labelOption.isChecked(), false);
  await labelOption.check();
  const labelDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  const labelFile = fileURLToPath(new URL('odyssey-video-label-test.mp4', cache));
  await (await labelDownload).saveAs(labelFile);
  await page.waitForFunction(() => document.querySelector('#video-status').textContent.startsWith('MP4 download started'));
  assert.equal(await dialog.locator('#video-preview-canvas').getAttribute('aria-label'), 'MP4 render preview: Run 3 / Frame 3 - Visual B - 1 element');
  assert.deepEqual(await previewPixel(), [31, 31, 31, 255], 'Label leaves the artwork center unchanged');
  const labelPixels = await dialog.locator('#video-preview-canvas').evaluate(canvas => {
    const ctx = canvas.getContext('2d');
    const bright = pixels => {
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 180 && pixels[i + 1] > 180 && pixels[i + 2] > 180) count++;
      return count;
    };
    return { bottom: bright(ctx.getImageData(canvas.width / 2, canvas.height - 60, canvas.width / 2, 60).data),
      top: bright(ctx.getImageData(0, 0, canvas.width, 100).data) };
  });
  assert(labelPixels.bottom > 100, 'Preview contains readable label pixels at the bottom right');
  assert.equal(labelPixels.top, 0, 'Labels stay out of the top of the artwork');
  for (const number of [0, 12]) {
    const rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', labelFile, '-frames:v', '1', '-vf', 'select=eq(n\\,' + number + '),crop=160:60:162:182', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    let bright = 0;
    for (let i = 0; i < rgb.length; i += 3) if (rgb[i] > 180 && rgb[i + 1] > 180 && rgb[i + 2] > 180) bright++;
    assert(bright > 100, 'MP4 includes the label on selected frame ' + number);
  }
  await dialog.locator('#video-preview-canvas').screenshot({ path: fileURLToPath(new URL('odyssey-video-label-preview.png', cache)) });
  await labelOption.uncheck();
  const flowChecks = await page.evaluate(async () => {
    const { videoSVG } = await import('./video-export.js');
    const { getBuiltinToolFlow, importToolFlowFromJSON, exportToolFlowToJSON } = await import('../helper/toolFlowHelp.js');
    const flow = getBuiltinToolFlow('builtin-grayscale-no-fill');
    const roundTrip = {}; importToolFlowFromJSON(JSON.parse(JSON.stringify(flow)), roundTrip);
    const input = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>.solid{fill:red !important}</style><defs><clipPath id="clip"><rect width="100" height="100" fill="white"/></clipPath><path id="reusable" d="M0 0L20 0L20 20Z" fill="lime"/></defs><g fill="blue"><rect id="outline" class="solid" x="10" y="10" width="40" height="40" stroke-width="4" clip-path="url(#clip)"/><path id="stroke" fill="none" stroke="red" d="M0 80L100 80"/><use href="#reusable" x="60"/></g></svg>';
    const result = videoSVG(input, {}, flow);
    const svg = new DOMParser().parseFromString(result.text, 'image/svg+xml').documentElement;
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g data-xf-source="1" style="display:none"><rect width="100" height="100" fill="red"/></g><g data-xf-layer="1"><rect width="100" height="100" fill="blue"/></g></svg>';
    const transformed = videoSVG(source, {}, getBuiltinToolFlow('builtin-mirrored-noir'));
    const doc = new DOMParser().parseFromString(transformed.text, 'image/svg+xml');
    return { fills: ['outline', 'stroke', 'reusable'].map(id => svg.querySelector('#' + id).getAttribute('fill')),
      inlineFill: svg.querySelector('#outline').style.getPropertyValue('fill'),
      priority: svg.querySelector('#outline').style.getPropertyPriority('fill'),
      stroke: svg.querySelector('#stroke').getAttribute('stroke'),
      outline: svg.querySelector('#outline').getAttribute('stroke'),
      clipFill: svg.querySelector('clipPath rect').getAttribute('fill'),
      stages: JSON.parse(exportToolFlowToJSON(roundTrip)).stages.length,
      tiles: doc.querySelector('[data-xf-layer="1"]').children.length,
      originalLayers: doc.querySelectorAll('g[style*="display: none"],g[style*="display:none"]').length,
    };
  });
  assert.deepEqual(flowChecks.fills, ['none', 'none', 'none']);
  assert.equal(flowChecks.inlineFill, 'none'); assert.equal(flowChecks.priority, 'important');
  assert.match(flowChecks.stroke, /^rgb\((\d+), \1, \1\)$/);
  assert.match(flowChecks.outline, /^rgb\((\d+), \1, \1\)$/);
  assert.equal(flowChecks.clipFill, 'white', 'Removing fills preserves clipping geometry');
  assert.equal(flowChecks.stages, 3, 'No-fill flow survives JSON import/export');
  assert.equal(flowChecks.tiles, 4, 'Shared transform stages execute on the captured SVG');
  assert(flowChecks.originalLayers > 0, 'Captured hidden source layers remain hidden');
  await dialog.getByLabel('Render flow', { exact: true }).selectOption('builtin-grayscale-no-fill');
  await dialog.getByLabel('Frame ranges', { exact: true }).fill('3');
  const outlineDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  const outlineFile = fileURLToPath(new URL('odyssey-video-outline-test.mp4', cache));
  await (await outlineDownload).saveAs(outlineFile);
  assert.deepEqual(await previewPixel(), [0, 0, 0, 255], 'Outline flow leaves the interior unfilled');
  assert.match(await dialog.locator('#video-preview-caption').textContent(), /No fills \+ Grayscale/);
  const outlineRGB = execFileSync('ffmpeg', ['-v', 'error', '-i', outlineFile, '-frames:v', '1', '-vf', 'crop=2:2:160:120,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
  assert(Math.max(...outlineRGB) < 5, 'The encoded video keeps the outline interior empty');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('visualHelp.toolFlows.v1', JSON.stringify({ flows: [{ id: 'test-custom-flow', name: 'Saved lime flow',
    stages: [{ kind: 'effect', config: { effectType: 'color', color: { selector: '*', sourceProp: 'each', targetProp: 'both', mode: 'byLuminance', paletteText: '#00ff00', paletteSteps: 1, useComputed: true, skipNone: true } } }] }] })));
  await page.locator('#export-video').click();
  await dialog.getByLabel('Render flow', { exact: true }).selectOption('test-custom-flow');
  await dialog.getByLabel('Frame ranges', { exact: true }).fill('3');
  const customDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  // Editing the library during encoding must not change the captured flow.
  await page.evaluate(() => localStorage.removeItem('visualHelp.toolFlows.v1'));
  await (await customDownload).saveAs(fileURLToPath(new URL('odyssey-video-custom-flow-test.mp4', cache)));
  assert.deepEqual(await previewPixel(), [0, 255, 0, 255], 'Saved custom flows use their own stage settings');
  console.log('One-click render, saved custom flows, no-fill grayscale, protected clip paths, use definitions, flow snapshots and transform stages passed.');

  console.log('Optional bottom-right run/frame/app labels appear in the preview and decoded MP4; original range numbers are preserved.');
  await dialog.getByLabel('Render flow', { exact: true }).selectOption('');
  console.log('Grayscale export, matching preview pixels, original-color export and unchanged source SVGs passed.');

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('combobox', { name: 'Visual to inspect' }).selectOption('b');
  await page.locator('#export-video').click();
  assert.equal(await dialog.locator('#video-apps input:checked').count(), 1);
  assert.equal(await dialog.locator('#video-apps input:checked').inputValue(), 'b');
  await dialog.getByLabel('Frame ranges', { exact: true }).fill('0-2');
  assert.equal(await dialog.getByRole('button', { name: 'Render', exact: true }).isDisabled(), true);
  await dialog.getByLabel('Frame ranges', { exact: true }).fill('0-1');
  await dialog.getByLabel('Seconds per saved frame', { exact: true }).fill('0.25');
  // Stream directly to a private test file; no user folder or picker is used.
  await page.evaluate(() => { window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('odyssey-stream-test.mp4', { create: true }); });
  await dialog.getByRole('button', { name: 'Choose output file', exact: true }).click();
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#video-status').textContent.startsWith('MP4 saved'));
  const streamSize = await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('odyssey-stream-test.mp4')).getFile()).size);
  assert(streamSize > 1000);
  const streamData = await page.evaluate(async () => {
    const file = await (await (await navigator.storage.getDirectory()).getFileHandle('odyssey-stream-test.mp4')).getFile();
    return btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
  });
  const streamFile = fileURLToPath(new URL('odyssey-video-stream-test.mp4', cache));
  await writeFile(streamFile, Buffer.from(streamData, 'base64'));
  const streamed = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', streamFile], { encoding: 'utf8', windowsHide: true })).streams[0];
  assert.equal(streamed.width, 320); assert.equal(streamed.height, 240);
  assert.equal(streamed.avg_frame_rate, '24/1'); assert.equal(Number(streamed.nb_frames), 12);
  assert.equal(Number(streamed.duration), 0.5);
  // Cancelling an overwrite must leave the existing file intact.
  const sentinel = await page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('odyssey-cancel-test.mp4', { create: true });
    const writable = await handle.createWritable(); await writable.write('keep-existing-file'); await writable.close();
    window.showSaveFilePicker = async () => handle; return 'keep-existing-file';
  });
  await dialog.getByRole('button', { name: 'Choose output file', exact: true }).click();
  await dialog.getByLabel('Seconds per saved frame', { exact: true }).fill('120');
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#video-status').textContent.startsWith('Encoding'));
  assert.equal(await dialog.locator('#video-preview').isVisible(), true, 'Preview appears during encoding');
  assert.match(await dialog.locator('#video-preview-caption').textContent(), /^Rendering saved frame/);
  await dialog.getByRole('button', { name: 'Cancel render', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#video-status').textContent === 'Video export cancelled.');
  assert.equal(await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('odyssey-cancel-test.mp4')).getFile()).text()), sentinel);
  // Encoder absence and missing captures fail cleanly; subsequent exports remain usable.
  const failure = await page.evaluate(async () => {
    const { exportVideo } = await import('./video-export.js');
    const encoder = window.VideoEncoder; window.VideoEncoder = undefined;
    try { await exportVideo({ plan: {}, storage: {} }); } catch (error) { return error.message; }
    finally { window.VideoEncoder = encoder; }
  });
  assert.match(failure, /encoding support/);
  const invalid = await page.evaluate(async () => {
    const { exportVideo, videoSVG } = await import('./video-export.js');
    const errors = [];
    for (const svg of ['not svg', '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="10"/>', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://example.com/external.png"/></svg>']) {
      try { videoSVG(svg); } catch (error) { errors.push(error.message); }
    }
    try {
      await exportVideo({ plan: { sessionId: 'missing', items: [{ frame: { file: 'missing.svg' } }] }, storage: { read: async () => { throw new Error('Missing captured frame'); } } });
    } catch (error) { errors.push(error.message); }
    const gray = videoSVG('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" style="filter:grayscale(1)"><rect width="20" height="10" fill="red"/></svg>');
    return { errors, gray: gray.text.includes('grayscale(1)') };
  });
  assert.equal(invalid.errors.length, 4); assert.match(invalid.errors[3], /No usable SVG frames/); assert.equal(invalid.gray, true);
  await dialog.getByLabel('Seconds per saved frame', { exact: true }).fill('0.125');
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#video-status').textContent.startsWith('MP4 saved'));
  assert.match(await dialog.locator('#video-status').textContent(), /0.250 seconds/);
  const retry = await page.evaluate(async () => {
    const file = await (await (await navigator.storage.getDirectory()).getFileHandle('odyssey-cancel-test.mp4')).getFile();
    return new TextDecoder().decode(await file.slice(4, 8).arrayBuffer());
  });
  assert.equal(retry, 'ftyp', 'A successful retry commits the finished MP4 after cancellation');

  const recovered = await page.evaluate(async () => {
    const { exportVideo } = await import('./video-export.js');
    const svg = (attrs, color, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="100%" height="100%" fill="${color}" ${extra}/></svg>`;
    const files = [
      svg('width="320" height="240"', 'red'),
      svg('width="0" height="NaN"', 'lime'),
      svg('width="1e20" height="99999999"', 'blue'),
      svg('width="100%" height="auto" viewBox="0 0 NaN -2"', 'magenta'),
      null,
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><path d="M0 0L5 5"/></defs></svg>',
      '<svg>broken',
      svg('width="320" height="240"', 'yellow', 'opacity="0"'),
      svg('width="320" height="240"', 'yellow'),
      svg('width="320" height="240"', 'yellow'),
    ];
    const counts = new Map(), progress = [];
    const plan = { sessionId: 'recovery-fixture', showLabel: true, renderSize: { width: 320, height: 240 }, repeats: 6, totalFrames: 60,
      items: files.map((_, index) => ({ index, runId: 'run-000001', frame: { file: String(index), ...(index === 8 ? { status: 'failed' } : {}) } })) };
    const storage = { read: async (_, file) => {
      const count = (counts.get(file) || 0) + 1; counts.set(file, count);
      if (file === '9' && count > 1) throw new Error('Capture disappeared during export');
      return files[file] == null ? null : new Blob([files[file]]);
    } };
    const result = await exportVideo({ plan, storage, onProgress: item => progress.push(item) });
    const controller = new AbortController();
    let cancelled;
    try {
      await exportVideo({ plan: { ...plan, items: [plan.items[4], plan.items[0]] }, storage, signal: controller.signal,
        onProgress: () => controller.abort() });
    } catch (error) { cancelled = error.name; }
    return { data: btoa(String.fromCharCode(...new Uint8Array(await result.blob.arrayBuffer()))),
      frames: result.frames, duration: result.duration, adjusted: result.adjusted,
      skipped: result.skipped, finalProgress: progress.at(-1), cancelled };
  });
  assert.equal(recovered.frames, 24); assert.equal(recovered.duration, 1); assert.equal(recovered.adjusted, 3);
  assert.deepEqual(recovered.skipped.map(item => item.index).sort((a, b) => a - b), [4, 5, 6, 7, 8, 9]);
  assert.equal(recovered.finalProgress.done, 24); assert.equal(recovered.finalProgress.total, 24);
  assert.equal(recovered.cancelled, 'AbortError', 'Cancellation must not be swallowed as a skipped frame');
  const recoveredFile = fileURLToPath(new URL('odyssey-video-recovery-test.mp4', cache));
  await writeFile(recoveredFile, Buffer.from(recovered.data, 'base64'));
  const recoveredStream = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', recoveredFile], { encoding: 'utf8', windowsHide: true })).streams[0];
  assert.equal(recoveredStream.width, 320); assert.equal(recoveredStream.height, 240);
  assert.equal(recoveredStream.avg_frame_rate, '24/1'); assert.equal(Number(recoveredStream.nb_frames), 24);
  for (const [number, channel] of [[0, 0], [6, 1], [12, 2]]) {
    const rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', recoveredFile, '-frames:v', '1', '-vf', 'select=eq(n\\,' + number + '),crop=2:2:160:120,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    assert(rgb[channel] > 180 && rgb[(channel + 1) % 3] < 60 && rgb[(channel + 2) % 3] < 60, 'Repaired frame retained at ' + number);
  }
  // The real dialog reports skips, repaired dimensions, and actual duration.
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(async () => {
    const { OdysseyStorage } = await import('./storage.js'); const storage = await new OdysseyStorage().open();
    await storage.file('search-video-fixture', 'run-000003/frame-00001.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="null"><rect width="100%" height="100%" fill="blue"/></svg>');
    await storage.file('search-video-fixture', 'run-000003/frame-00002.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    storage.db.close();
  });
  await page.locator('#export-video').click();
  await dialog.getByLabel('Seconds per saved frame', { exact: true }).fill('0.25');
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#video-status').textContent.startsWith('MP4 saved'));
  assert.match(await dialog.locator('#video-status').textContent(), /0.250 seconds.*1 saved frames exported, 1 skipped, 1 resized/);
  assert.equal(await dialog.locator('#video-skipped').isVisible(), true);
  await dialog.locator('#video-skipped summary').click();
  assert.match(await dialog.locator('#video-skipped-list').textContent(), /Frame 1.*No rendered SVG geometry/);
  console.log('Invalid dimensions repaired; missing, failed, empty and invisible captures skipped; playback has no gaps and UI reports actual totals.');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
  await page.screenshot({ path: fileURLToPath(new URL('odyssey-video-dialog.png', cache)) });
  assert.deepEqual(errors, []);
  console.log('Visual selection, invalid ranges, streaming file saves, cancellation without overwrite, unsupported browsers and mobile dialog passed.');
} finally { await browser.close(); }
