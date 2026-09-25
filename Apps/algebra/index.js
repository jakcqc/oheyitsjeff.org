/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
const stageRoot = '../studies/stages/algebra-life-without-its-zeros/';
const stages = [
  { name: 'Source', count: 3300, formula: 'G', description: 'The native protofield simulation produces a binary grid. White cells are absent states; dark cells are occupied states.' },
  { name: 'Delete', count: 879, formula: 'D \u2218 G', description: 'The property rule deletes every rectangle whose fill equals #ffffff. This is a real change to the shape set, not a white overlay.' },
  { name: 'Convert', count: 879, formula: 'Q \u2218 D \u2218 G', description: 'Each remaining square becomes an inscribed circle, scaled to 0.72 around its center. The number of occupied sites is preserved.' },
  { name: 'Paint', count: 879, formula: 'P \u2218 Q \u2218 D \u2218 G', description: 'Circle fills become none and strokes become #111111. The boundary becomes the material for the next operator.' },
  { name: 'Normal', count: 27249, formula: 'N \u2218 P \u2218 Q \u2218 D \u2218 G', description: 'Each circle is sampled with 10 control points and 3 steps per segment. A 31-unit segment follows the normal at every sample.' },
  { name: 'Mono', count: 27249, formula: 'C \u2218 N \u2218 P \u2218 Q \u2218 D \u2218 G', description: 'The native luminance palette maps the generated marks into neutral gray values. Their geometry stays the same.' },
  { name: 'Affine', count: 27249, formula: 'A \u2218 C \u2218 N \u2218 P \u2218 Q \u2218 D \u2218 G', description: 'A 2.8 degree rotation and 0.96 zoom act on the complete field. This is the final exported composition.' },
];
const byId = id => document.getElementById(id);
const stageImage = byId('stage-image');
const viewport = byId('stage-viewport');
const imageStatus = byId('stage-image-status');
let current = 0;
let stageIsNear = false;
const stageUrl = index => stageRoot + String(index).padStart(2, '0') + '.svg';
const stagePreviewUrl = index => stageRoot + String(index).padStart(2, '0') + '.large.webp';

function loadSelectedStage() {
  if (!stageIsNear) return;
  const url = stagePreviewUrl(current);
  if (stageImage.getAttribute('src') === url) return;
  imageStatus.textContent = 'Loading selected stage...';
  imageStatus.hidden = false;
  stageImage.classList.remove('is-loaded');
  viewport.setAttribute('aria-busy', 'true');
  stageImage.src = url;
}
stageImage.addEventListener('load', () => {
  stageImage.classList.add('is-loaded');
  imageStatus.hidden = true;
  viewport.removeAttribute('aria-busy');
});
stageImage.addEventListener('error', () => {
  imageStatus.textContent = 'This stage could not load. Use Open this SVG to try again.';
  imageStatus.hidden = false;
  viewport.removeAttribute('aria-busy');
});
function showStage(index) {
  current = Math.max(0, Math.min(stages.length - 1, Number(index)));
  const stage = stages[current];
  stageImage.alt = stage.name + ': ' + stage.description;
  byId('stage-badge').textContent = current + ' / ' + (stages.length - 1);
  byId('stage-title').textContent = current + ' \u00b7 ' + stage.name;
  byId('stage-formula').textContent = stage.formula;
  byId('stage-description').textContent = stage.description;
  byId('shape-count').textContent = stage.count.toLocaleString();
  byId('previous').disabled = current === 0;
  byId('next').disabled = current === stages.length - 1;
  byId('stage-range').value = current;
  byId('stage-range').setAttribute('aria-valuetext', current + ': ' + stage.name);
  byId('range-value').textContent = current + ' of ' + (stages.length - 1);
  byId('stage-svg').href = stageUrl(current);
  byId('stage-download').href = stageUrl(current);
  document.querySelectorAll('[data-stage]').forEach(button => {
    if (Number(button.dataset.stage) === current) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  byId('stage-announcement').textContent = 'Stage ' + current + ', ' + stage.name + ', ' + stage.count.toLocaleString() + ' artwork shapes.';
  loadSelectedStage();
}
byId('previous').addEventListener('click', () => showStage(current - 1));
byId('next').addEventListener('click', () => showStage(current + 1));
byId('stage-range').addEventListener('input', event => showStage(event.target.value));
document.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => showStage(button.dataset.stage)));

const comparisonImages = [...document.querySelectorAll('[data-preview-src]')];
if (typeof window.IntersectionObserver === 'function') {
  const stageObserver = new IntersectionObserver(entries => {
    stageIsNear = entries.some(entry => entry.isIntersecting);
    loadSelectedStage();
  }, { rootMargin: '160px' });
  stageObserver.observe(viewport);
  const comparisonObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.src = entry.target.dataset.previewSrc;
      comparisonObserver.unobserve(entry.target);
    });
  }, { rootMargin: '160px' });
  comparisonImages.forEach(img => comparisonObserver.observe(img));
} else {
  stageIsNear = true;
  loadSelectedStage();
  comparisonImages.forEach(img => { img.src = img.dataset.previewSrc; });
}

const runButton = byId('run-simulation');
const stopButton = byId('stop-simulation');
const simulationMount = byId('simulation-mount');
function closeSimulation() {
  simulationMount.replaceChildren();
  simulationMount.hidden = true;
  runButton.hidden = false;
  runButton.setAttribute('aria-expanded', 'false');
  stopButton.hidden = true;
  byId('simulation-status').textContent = 'Simulation closed.';
}
runButton.addEventListener('click', () => {
  if (simulationMount.querySelector('iframe')) return;
  const frame = document.createElement('iframe');
  frame.title = 'Game of Life - Life Without Its Zeros, saved study settings';
  frame.src = byId('source-app').href;
  frame.loading = 'eager';
  frame.allow = 'fullscreen';
  frame.addEventListener('load', () => { byId('simulation-status').textContent = 'Simulation opened paused with the saved study settings.'; });
  simulationMount.replaceChildren(frame);
  simulationMount.hidden = false;
  runButton.hidden = true;
  runButton.setAttribute('aria-expanded', 'true');
  stopButton.hidden = false;
  byId('simulation-status').textContent = 'Opening Game of Life paused with the saved study settings.';
  stopButton.focus({ preventScroll: true });
});
stopButton.addEventListener('click', () => { closeSimulation(); runButton.focus({ preventScroll: true }); });
window.addEventListener('pagehide', closeSimulation);
