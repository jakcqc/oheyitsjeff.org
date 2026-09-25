/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

// Run: node --test tests/svg-study-assets.mjs
// Uses only checked-in website assets and Node's built-in modules.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'Apps', 'studies');
const json = filename => JSON.parse(readFileSync(filename, 'utf8'));
const catalog = json(path.join(publicRoot, 'catalog.json'));
const bySlug = new Map(catalog.map(study => [study.slug, study]));
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const filesIn = directory => existsSync(directory)
  ? readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(filename) : [filename];
  }) : [];
function existingFile(filename) {
  assert.ok(existsSync(filename), `Missing website asset: ${path.relative(root, filename)}`);
  assert.ok(statSync(filename).isFile(), `Expected a file: ${filename}`);
}
function inside(directory, filename) {
  const relative = path.relative(directory, filename);
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `Asset escapes its public directory: ${filename}`);
  existingFile(filename);
  return filename;
}
function relativeAsset(owner, value, directory = publicRoot) {
  assert.equal(typeof value, 'string', `Missing asset reference in ${owner}`);
  assert.ok(!path.isAbsolute(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !/[?#\\]/.test(value),
    `Expected a local relative asset reference: ${value}`);
  return inside(directory, path.resolve(path.dirname(owner), value));
}


test('every catalog study has a safe unique identity, native app, settings, and SVG', () => {
  assert.ok(Array.isArray(catalog) && catalog.length > 0);
  assert.equal(bySlug.size, catalog.length, 'Study slugs must be unique');
  for (const study of catalog) {
    assert.match(study.slug, safeSlug);
    assert.ok(['main', 'math'].includes(study.kind), `Invalid kind for ${study.slug}`);
    assert.match(study.app, /^[A-Za-z0-9_-]+$/);
    assert.match(study.visualId, /^[A-Za-z0-9_-]+$/);
    assert.ok(typeof study.title === 'string' && study.title.trim());
    assert.ok(Number.isFinite(study.width) && study.width > 0);
    assert.ok(Number.isFinite(study.height) && study.height > 0);
    inside(root, path.join(root, study.app, 'index.html'));
    const settings = json(inside(publicRoot, path.join(publicRoot, 'settings', `${study.slug}.json`)));
    assert.ok(settings && typeof settings === 'object' && !Array.isArray(settings), study.slug);
    inside(publicRoot, path.join(publicRoot, 'svg', `${study.slug}.svg`));
  }
  for (const [folder, suffix] of [['svg', '.svg'], ['settings', '.json'], ['thumbnails', '.webp']]) {
    const actual = filesIn(path.join(publicRoot, folder)).map(filename => path.basename(filename, suffix)).sort();
    assert.deepEqual(actual, [...bySlug.keys()].sort(), `Uncatalogued or missing ${folder} files`);
  }
});


test('public study assets contain only website SVG, compressed WebP, JSON, and Markdown files', () => {
  const allowed = new Set(['.svg', '.webp', '.json', '.md']);
  for (const filename of filesIn(publicRoot)) {
    assert.ok(allowed.has(path.extname(filename)), `Nonpublic file in studies: ${filename}`);
    assert.doesNotMatch(path.basename(filename), /(?:\.record\.json$|contact[-_]sheet|\.zip(?:\.|$))/i);
    assert.ok(!path.relative(publicRoot, filename).split(path.sep).some(part => ['previews', 'tools', 'assets'].includes(part)),
      `Review or generation directory must remain local: ${filename}`);
  }
  const ignoreRules = readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/).map(line => line.trim());
  assert.ok(ignoreRules.includes('/.local/'), 'The local study archive must remain ignored');
});


test('formal recipes resolve their native flows and preserve the same ordered settings', () => {
  const formalFiles = filesIn(path.join(publicRoot, 'algebra'));
  const flowFiles = filesIn(path.join(publicRoot, 'flows'));
  const formalStudies = catalog.filter(study => ['algebra', 'algebraCOEF'].includes(study.collection));
  assert.ok(formalStudies.length > 0);
  assert.equal(formalFiles.length, formalStudies.length);
  assert.equal(flowFiles.length, formalStudies.length);
  const referencedFlows = new Set();
  for (const study of formalStudies) {
    const filename = inside(publicRoot, path.join(publicRoot, 'algebra', `${study.slug}.algebra.json`));
    const recipe = json(filename);
    assert.equal(recipe.title, study.title);
    assert.equal(recipe.visualId, study.visualId);
    assert.ok(typeof recipe.algebra?.expression === 'string' && recipe.algebra.expression.trim());
    relativeAsset(path.join(root, 'placeholder.json'), recipe.source, root);
    const flowPath = relativeAsset(filename, recipe.nativeFlow);
    const settingsPath = relativeAsset(filename, recipe.nativeSettings);
    assert.equal(flowPath, path.join(publicRoot, 'flows', `${study.slug}.flow.json`));
    assert.equal(settingsPath, path.join(publicRoot, 'settings', `${study.slug}.json`));
    referencedFlows.add(flowPath);
    const flow = json(flowPath);
    const settings = json(settingsPath);
    assert.equal(flow.schemaVersion, 1);
    assert.ok(Array.isArray(flow.stages) && flow.stages.length > 0);
    assert.deepEqual(flow.stages, settings.__toolFlows?.stages, `Reopening ${study.slug} must restore the exported flow`);
    const propertyPrefix = recipe.propertyPrefix ?? [];
    assert.deepEqual(propertyPrefix, settings.__propOps?.stack ?? [], `Property rules differ for ${study.slug}`);
    assert.equal(recipe.observedStages.length,
      flow.stages.filter(stage => stage.enabled !== false).length + (propertyPrefix.length ? 1 : 0),
      `Recorded operation count differs for ${study.slug}`);
  }
  assert.deepEqual([...referencedFlows].sort(), flowFiles.sort(), 'Every portable flow needs a catalogued formal recipe');
});


test('the walkthrough preserves every SVG stage with a lightweight compressed preview', () => {
  const stageRoot = path.join(publicRoot, 'stages');
  const manifests = filesIn(stageRoot).filter(filename => path.basename(filename) === 'stages.json');
  assert.ok(manifests.length > 0);
  const referencedSvgs = new Set();
  for (const filename of manifests) {
    const manifest = json(filename);
    assert.ok(bySlug.has(manifest.study), `Unknown walkthrough study: ${manifest.study}`);
    assert.equal(path.basename(path.dirname(filename)), manifest.study);
    const recipe = json(path.join(publicRoot, 'algebra', `${manifest.study}.algebra.json`));
    assert.equal(manifest.stages.length, recipe.observedStages.length + 1, 'Show the source and every ordered operation');
    for (const [index, stage] of manifest.stages.entries()) {
      assert.equal(stage.index, index);
      assert.ok(typeof stage.label === 'string' && stage.label.trim());
      assert.equal('preview' in stage, false, 'The stage manifest describes original SVGs');
      const preview = inside(publicRoot, path.join(path.dirname(filename), stage.svg.replace(/\.svg$/, '.webp')));
      checkWebp(preview, 64 * 1024);
      checkWebp(inside(publicRoot, path.join(path.dirname(filename), stage.svg.replace(/\.svg$/, '.large.webp'))), 400 * 1024);
      assert.equal(path.extname(stage.svg), '.svg');
      const svg = relativeAsset(filename, stage.svg, path.dirname(filename));
      assert.ok(!referencedSvgs.has(svg), 'Each stage must have its own SVG');
      referencedSvgs.add(svg);
    }
  }
  assert.deepEqual([...referencedSvgs].sort(), filesIn(stageRoot).filter(filename => path.extname(filename) === '.svg').sort());
});


test('the dated export route no longer contains public files', () => {
  const oldRoute = path.join(root, 'SVG-Exports', '2026-09-24-abstract-studies');
  assert.deepEqual(filesIn(oldRoute), [], 'Website assets must live in Apps/studies, not the dated export folder');
  assert.equal(existsSync(path.join(root, 'SVG-Exports', '2026-09-24-abstract-studies.zip')), false);
  assert.equal(existsSync(path.join(root, 'SVG-Exports', '2026-09-24-abstract-studies.zip.sha256')), false);
});


function checkWebp(filename, budget) {
  const bytes = readFileSync(filename);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', filename);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', filename);
  assert.ok(bytes.length > 12 && bytes.length <= budget, `Preview exceeds ${budget} bytes: ${filename} (${bytes.length})`);
}

test('every study has a genuine WebP thumbnail within the 48 KiB budget', () => {
  for (const study of catalog) checkWebp(path.join(publicRoot, 'thumbnails', `${study.slug}.webp`), 48 * 1024);
  for (const filename of filesIn(publicRoot).filter(file => path.extname(file) === '.webp')) {
    assert.ok(['thumbnails', 'stages', 'large'].includes(path.relative(publicRoot, filename).split(path.sep)[0]), filename);
  }
});


test('large algebra comparisons preserve detail within the 400 KiB budget', () => {
  for (const slug of ['algebra-order-color-before-normals', 'algebra-order-normals-before-color', 'algebracoef-halo-b-source', 'algebracoef-halo-b-marks', 'algebracoef-wild-projective-anti-matter', 'algebracoef-wild-needle-frequency-altar']) {
    checkWebp(path.join(publicRoot, 'large', `${slug}.webp`), 400 * 1024);
  }
});


test('algebraCOEF includes at least 20 paired coefficient studies with effective repeated operations', () => {
  const studies = catalog.filter(study => study.collection === 'algebraCOEF' && study.batch !== 'wild');
  assert.ok(studies.length >= 20);
  assert.equal(studies.length % 2, 0);
  for (const study of studies) {
    const recipe = json(path.join(publicRoot, 'algebra', `${study.slug}.algebra.json`));
    const { coefficients, companionSlug, pairId } = recipe.algebra;
    assert.ok(bySlug.has(companionSlug));
    const companion = json(path.join(publicRoot, 'algebra', `${companionSlug}.algebra.json`));
    assert.equal(companion.algebra.companionSlug, study.slug);
    assert.equal(companion.algebra.pairId, pairId);
    assert.deepEqual(coefficients, companion.algebra.coefficients);
    assert.ok(coefficients.alpha > 0 && coefficients.beta > 0 && coefficients.lambda > 0);
    assert.ok(coefficients.k >= 2 && coefficients.affineRepeat >= 2);
    const flow = json(path.join(publicRoot, 'flows', `${study.slug}.flow.json`));
    const pairedFlow = json(path.join(publicRoot, 'flows', `${companionSlug}.flow.json`));
    const geometryStages = stages => stages.filter(stage => stage.config?.effectType !== 'color').map(stage => ({ kind: stage.kind, config: stage.config }));
    assert.deepEqual(geometryStages(flow.stages), geometryStages(pairedFlow.stages));
    const spline = recipe.observedStages.filter(stage => stage.effect === 'splineLines');
    assert.equal(spline.length, 2);
    assert.ok(spline.every(stage => stage.changed && stage.afterShapes > stage.beforeShapes));
    assert.ok(recipe.observedStages.every(stage => stage.changed));
    const affine = flow.stages.find(stage => stage.kind === 'transform');
    assert.equal(affine.config.stack.length, coefficients.affineRepeat * 2);
    assert.equal(recipe.orderComparison.geometrySha256, companion.orderComparison.geometrySha256);
    assert.ok(recipe.orderComparison.changedLineStrokes > 0);
  }
});


test('Wild coefficient studies use exactly one composition per new app and preserve native coefficients', () => {
  const wild = catalog.filter(study => study.collection === 'algebraCOEF' && study.batch === 'wild');
  const previousApps = new Set(catalog.filter(study => study.collection === 'algebraCOEF' && study.batch !== 'wild').map(study => study.app));
  assert.equal(wild.length, 17);
  assert.equal(new Set(wild.map(study => study.app)).size, wild.length);
  const capabilities = new Set();
  for (const study of wild) {
    assert.ok(!previousApps.has(study.app), study.app + ' was already used');
    const recipe = json(path.join(publicRoot, 'algebra', `${study.slug}.algebra.json`));
    const flow = json(path.join(publicRoot, 'flows', `${study.slug}.flow.json`));
    assert.equal(recipe.algebra.edition, 'wild');
    assert.ok(!recipe.algebra.companionSlug);
    assert.ok(recipe.observedStages.every(stage => stage.changed));
    assert.ok(Object.keys(recipe.algebra.coefficients).length >= 3);
    for (const stage of flow.stages) {
      const config = stage.config;
      if (config.spacing === 'logarithmic') capabilities.add('logarithmic');
      if (config.splineExtrapolateTension && (config.splineTension < 0 || config.splineTension > 1)) capabilities.add('tension');
      if (config.splineAngleOffset) capabilities.add('angle');
      if (config.rangeMin < 0) capabilities.add('signed');
      if (config.effectType === 'functionRects') capabilities.add('function');
      if (config.stack?.some(op => op.kind === 'planes3d')) capabilities.add('planes');
    }
  }
  assert.deepEqual([...capabilities].sort(), ['angle', 'function', 'logarithmic', 'planes', 'signed', 'tension']);
});


test('the original coefficient batch saves distinct randomized sources and identical starts within pairs', () => {
  const studies = catalog.filter(study => study.collection === 'algebraCOEF' && study.batch !== 'wild');
  const pairs = new Map();
  for (const study of studies) {
    const recipe = json(path.join(publicRoot, 'algebra', `${study.slug}.algebra.json`));
    const settings = json(path.join(publicRoot, 'settings', `${study.slug}.json`));
    const companion = json(path.join(publicRoot, 'algebra', `${recipe.algebra.companionSlug}.algebra.json`));
    const receipt = recipe.randomization;
    assert.equal(receipt.algorithm, 'mulberry32-v1');
    assert.equal(receipt.version, 1);
    assert.ok(receipt.samples.length >= 3);
    assert.deepEqual(receipt, settings.__studyRandomization);
    assert.deepEqual(receipt, companion.randomization);
    assert.equal(recipe.seed, companion.seed);
    assert.equal(recipe.startingStateSha256, companion.startingStateSha256);
    assert.equal(recipe.startingSvgSha256, companion.startingSvgSha256);
    assert.match(recipe.startingSvgSha256, /^[a-f0-9]{64}$/);
    assert.ok(receipt.samples.filter(sample => sample.value !== sample.before).length >= 3);
    for (const sample of receipt.samples) {
      assert.equal(sample.path.split('.').reduce((value, key) => value?.[key], settings), sample.value, study.slug + ': ' + sample.path);
      if (sample.op === 'choice') assert.ok(sample.values.includes(sample.value));
      else {
        const a = sample.op === 'add' ? sample.before + sample.min : sample.op === 'multiply' ? sample.before * sample.min : sample.min;
        const b = sample.op === 'add' ? sample.before + sample.max : sample.op === 'multiply' ? sample.before * sample.max : sample.max;
        assert.ok(sample.value >= Math.min(a, b) - 0.0001 && sample.value <= Math.max(a, b) + 0.0001);
        if (sample.op === 'integer') assert.ok(Number.isInteger(sample.value));
      }
    }
    pairs.set(recipe.algebra.pairId, recipe);
  }
  assert.equal(pairs.size, 12);
  for (const key of ['seed', 'startingStateSha256', 'startingSvgSha256']) {
    assert.equal(new Set([...pairs.values()].map(recipe => recipe[key])).size, pairs.size, key + ' must vary across pairs');
  }
  assert.equal(new Set([...pairs.values()].map(recipe => recipe.randomization.seed)).size, pairs.size);
});
