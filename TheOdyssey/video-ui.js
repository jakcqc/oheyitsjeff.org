/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { savedVideoFrames, videoPlan } from './video-plan.js';
import { exportVideo } from './video-export.js';
import { getFlowLibrary } from '../helper/toolFlowHelp.js';
import { videoOutput } from './video-output.js';

export function setupVideoExport({ getSession, getVisual, getStorage }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'video-export'; dialog.setAttribute('aria-labelledby', 'video-heading');
  dialog.innerHTML = `<h2 id="video-heading">Render MP4</h2>
    <p>Choose your options, then press Render. The MP4 saves or downloads automatically when finished.</p>
    <p>24 fps. Each saved frame becomes an image held for the time below.</p>
    <p>High-quality MP4 export with automatic encoder retries. Files may be much larger. H.264 encoding is still lossy.</p>
    <form id="video-form" novalidate>
      <fieldset id="video-options"><legend>Video selection</legend>
        <div class="ody-actions"><button type="button" id="video-all">All visuals</button><button type="button" id="video-none">Clear selection</button></div>
        <div id="video-apps" role="group" aria-label="Visuals to export"></div>
        <label class="ody-field">Frame ranges<input id="video-ranges" placeholder="All frames, or 0-200, 400-560" aria-describedby="video-range-help"></label>
        <p id="video-range-help">Frame numbers start at 0 across the selected visuals, in run and saved-frame order. Range ends are included. Leave blank for all saved frames.</p>
        <label class="ody-field">Seconds per saved frame<input id="video-seconds" type="number" value="2" min="0.041666666666666664" max="3600" step="any"></label>
        <label class="ody-field">Render flow<select id="video-flow" aria-label="Render flow"></select></label>
        <p>Runs the selected flow after each SVG's saved effects. Choose a built-in or a flow saved in the toolbar library.</p>
        <details><summary>Selected flow stages</summary><ol id="video-flow-stages"></ol></details>
        <div class="ody-actions"><button type="button" id="video-destination">Choose output file</button><button type="button" id="video-auto">Use automatic download</button></div>
        <p id="video-destination-name">Automatic download when rendering finishes.</p>
        <label><input id="video-label" type="checkbox"> Show frame number and visual name</label>
        <p>Small text at the bottom right includes the run number, frame-range number, visual app name, and SVG element count (for example, 10k elements).</p>
        <p>Invalid or oversized dimensions are fitted within the search render size. Missing, failed, and blank frames are skipped. Smaller images and transparent areas use black padding.</p>
      </fieldset>
      <p id="video-estimate" aria-live="polite"></p>
      <figure id="video-preview" hidden>
        <canvas id="video-preview-canvas" role="img" aria-label="MP4 render preview"></canvas>
        <figcaption id="video-preview-caption"></figcaption>
      </figure>
      <progress id="video-progress" value="0" max="1" hidden></progress>
      <p id="video-status" role="status" aria-live="polite"></p>
      <details id="video-skipped" hidden><summary>Skipped frames</summary><pre id="video-skipped-list"></pre></details>
      <div class="ody-actions"><button type="submit" id="video-start">Render</button><button type="button" id="video-cancel" hidden>Cancel render</button><button type="button" id="video-close">Close</button></div>
      <a id="video-download" hidden>Download again</a>
    </form>`;
  document.body.append(dialog);
  const find = id => dialog.querySelector('#' + id);
  let snapshot, controller = null, resultURL, outputFile = null, completedOutput;
  let flows = [];
  const options = () => ({
    appIds: [...find('video-apps').querySelectorAll('input:checked')].map(input => input.value),
    ranges: find('video-ranges').value, seconds: Number(find('video-seconds').value), flow: flows.find(flow => flow.id === find('video-flow').value) || null, showLabel: find('video-label').checked,
  });
  const estimate = () => {
    if (controller) return;
    try {
      const plan = videoPlan(snapshot, options());
      find('video-estimate').textContent = 'Up to ' + plan.items.length + ' saved frames (available: 0-' + (plan.available - 1) + ') / ' + plan.totalFrames.toLocaleString() + ' video frames / ' + plan.duration.toFixed(3) + ' seconds at 24 fps. Each image: ' + plan.secondsPerFrame.toFixed(3) + ' seconds.';
      find('video-start').disabled = false;
    } catch (error) {
      find('video-estimate').textContent = error.message; find('video-start').disabled = true;
    }
  };
  const clearPreview = () => {
    find('video-preview').hidden = true;
    find('video-preview-canvas').width = find('video-preview-canvas').height = 0;
    find('video-preview-caption').textContent = '';
  };
  const showPreview = ({ canvas, item, width, height, flowName, label, elementCount }) => {
    const preview = find('video-preview-canvas'), scale = Math.min(1, 720 / width, 405 / height);
    const previewWidth = Math.max(1, Math.round(width * scale)), previewHeight = Math.max(1, Math.round(height * scale));
    if (preview.width !== previewWidth || preview.height !== previewHeight) {
      preview.width = previewWidth; preview.height = previewHeight;
    }
    preview.getContext('2d').drawImage(canvas, 0, 0, preview.width, preview.height);
    preview.dataset.frame = item.index;
    preview.setAttribute('aria-label', 'MP4 render preview' + (label ? ': ' + label : ''));
    find('video-preview-caption').textContent = 'Rendering saved frame ' + item.index + ' - ' + (item.title || item.app || item.runId)
      + ' - ' + elementCount.toLocaleString() + (elementCount === 1 ? ' element' : ' elements')
      + ' - ' + width + ' x ' + height + ' - ' + flowName;
    find('video-preview').hidden = false;
  };
  const showSkipped = (skipped = []) => {
    find('video-skipped').hidden = !skipped.length;
    find('video-skipped-list').textContent = skipped.map(item => 'Frame ' + item.index + ' (' + (item.runId || item.file || 'unknown run') + '): ' + item.reason).join('\n');
  };
  const release = () => {
    if (resultURL) URL.revokeObjectURL(resultURL);
    resultURL = null; find('video-download').hidden = true;
    void completedOutput?.release(); completedOutput = null;
  };
  const describeFlow = () => {
    const flow = flows.find(flow => flow.id === find('video-flow').value);
    find('video-flow-stages').replaceChildren();
    for (const stage of flow?.stages || []) {
      const item = document.createElement('li');
      item.textContent = (stage.label || stage.kind) + (stage.enabled === false ? ' (disabled)' : '');
      find('video-flow-stages').append(item);
    }
  };
  find('video-flow').onchange = () => { describeFlow(); estimate(); };
  find('video-auto').onclick = () => {
    outputFile = null; find('video-destination-name').textContent = 'Automatic download when rendering finishes.';
  };
  find('video-destination').hidden = typeof window.showSaveFilePicker !== 'function';
  find('video-destination').onclick = async () => {
    find('video-options').disabled = true; find('video-start').disabled = true;
    try {
      const file = await window.showSaveFilePicker({ suggestedName: snapshot.id + '.mp4',
        types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] });
      outputFile = file; find('video-destination-name').textContent = 'Save automatically to ' + file.name;
    } catch (error) { if (error.name !== 'AbortError') find('video-status').textContent = error.message; }
    finally { find('video-options').disabled = false; estimate(); }
  };
  find('video-options').oninput = estimate;
  for (const [id, checked] of [['video-all', true], ['video-none', false]]) find(id).onclick = () => {
    find('video-apps').querySelectorAll('input').forEach(input => { input.checked = checked; }); estimate();
  };
  find('video-cancel').onclick = () => { controller?.abort(); find('video-status').textContent = 'Cancelling export...'; };
  find('video-close').onclick = () => dialog.close();
  dialog.oncancel = event => { if (controller) { event.preventDefault(); controller.abort(); } };
  dialog.onclose = () => { release(); clearPreview(); };
  find('video-form').onsubmit = async event => {
    event.preventDefault(); if (controller) return;
    let plan;
    try { plan = videoPlan(snapshot, options()); } catch (error) { find('video-status').textContent = error.message; return; }
    controller = new AbortController(); const signal = controller.signal;
    find('video-options').disabled = true; find('video-start').disabled = true; find('video-close').disabled = true;
    find('video-cancel').hidden = false; find('video-progress').hidden = false; find('video-progress').value = 0;
    find('video-status').textContent = 'Preparing MP4 export...'; release(); showSkipped(); clearPreview();
    const filename = plan.sessionId + '-frames-' + plan.items[0].index + '-' + plan.items.at(-1).index + '.mp4';
    let destination;
    try {
      destination = await videoOutput(outputFile);
      const fileHandle = destination.fileHandle;
      const result = await exportVideo({ plan, storage: getStorage(), fileHandle, signal, onFrame: showPreview, onProgress: progress => {
        find('video-progress').max = progress.total; find('video-progress').value = progress.done;
        find('video-status').textContent = progress.message || (progress.phase + ': ' + progress.done.toLocaleString() + ' / ' + progress.total.toLocaleString()
          + (progress.width ? ' - ' + progress.width + ' x ' + progress.height : '')
          + (progress.frame === undefined ? '' : ' - saved frame ' + progress.frame)
          + (progress.skipped ? ' - skipped ' + progress.skipped : '')
          + (progress.attempt > 1 ? ' - attempt ' + progress.attempt + '/' + progress.maxAttempts : ''));
      } });
      const blob = await destination.blob(result);
      if (blob) {
        resultURL = URL.createObjectURL(blob); completedOutput = destination;
        const link = find('video-download'); link.href = resultURL; link.download = filename; link.hidden = false;
        link.click();
      }
      find('video-status').textContent = 'MP4 ' + (outputFile ? 'saved' : 'download started') + ': ' + result.width + ' x ' + result.height + ', 24 fps, ' + result.duration.toFixed(3) + ' seconds. ' + result.sourceFrames + ' saved frames exported, ' + result.skipped.length + ' skipped, ' + result.adjusted + ' resized. ' + result.encodingProfile + (result.attempts > 1 ? ' (succeeded on attempt ' + result.attempts + ').' : '.');
      showSkipped(result.skipped);
    } catch (error) {
      await destination?.release();
      showSkipped(error.skipped);
      find('video-status').textContent = error.name === 'AbortError' ? 'Video export cancelled.' : 'Video export failed: ' + error.message;
    } finally {
      find('video-preview-caption').textContent = find('video-preview-caption').textContent.replace(/^Rendering/, 'Last rendered');
      controller = null; find('video-options').disabled = false; find('video-close').disabled = false;
      find('video-cancel').hidden = true; estimate();
    }
  };
  return () => {
    if (controller) { if (!dialog.open) dialog.showModal(); return; }
    snapshot = structuredClone(getSession()); release(); showSkipped(); clearPreview();
    const previousFlow = find('video-flow').value;
    flows = getFlowLibrary();
    find('video-flow').replaceChildren(new Option('Keep captured styling', ''));
    for (const flow of flows) find('video-flow').append(new Option(flow.name, flow.id));
    if (flows.some(flow => flow.id === previousFlow)) find('video-flow').value = previousFlow;
    describeFlow();
    find('video-destination').hidden = typeof window.showSaveFilePicker !== 'function';
    const frames = savedVideoFrames(snapshot), apps = new Map();
    for (const item of frames) {
      if (!apps.has(item.app)) apps.set(item.app, { title: item.title, count: 0 });
      apps.get(item.app).count++;
    }
    find('video-apps').replaceChildren();
    for (const [id, app] of apps) {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.value = id; input.checked = !getVisual() || getVisual() === id;
      label.append(input, document.createTextNode(app.title + ' (' + app.count + ' frames)')); find('video-apps').append(label);
    }
    find('video-ranges').value = ''; find('video-progress').hidden = true;
    find('video-status').textContent = 'Exports the frames already saved when this dialog opens.';
    estimate(); dialog.showModal();
  };
}
