/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Build deployment thumbnails from the archived renders of the exact exported SVGs.
// Install @napi-rs/canvas locally, or pass --node-modules /path/to/node_modules.
// node scripts/generate-study-thumbnails.mjs [--source-dir directory] [--node-modules directory]
// STUDY_PREVIEW_SOURCE and STUDY_THUMBNAIL_NODE_MODULES provide the same overrides.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index];
  if (flag === '--help') {
    console.log('Usage: node scripts/generate-study-thumbnails.mjs [--source-dir directory] [--node-modules directory]');
    process.exit(0);
  }
  if (!['--source-dir', '--node-modules'].includes(flag) || !process.argv[index + 1]) {
    throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  options.set(flag, process.argv[index + 1]);
}
const source = path.resolve(root, options.get('--source-dir') || process.env.STUDY_PREVIEW_SOURCE || '.local/abstract-studies/2026-09-24');
const coefficientSource = options.has('--source-dir') || process.env.STUDY_PREVIEW_SOURCE
  ? source : path.join(root, '.local/abstract-studies/algebraCOEF');
const nodeModules = options.get('--node-modules') || process.env.STUDY_THUMBNAIL_NODE_MODULES;
const require = createRequire(import.meta.url);
let canvasLibrary;
try {
  canvasLibrary = require(nodeModules ? path.join(path.resolve(nodeModules), '@napi-rs/canvas') : '@napi-rs/canvas');
} catch (error) {
  throw new Error('Thumbnail generation needs @napi-rs/canvas. Install it or pass --node-modules /path/to/node_modules.', { cause: error });
}
const { createCanvas, loadImage } = canvasLibrary;
const publicRoot = path.join(root, 'Apps/studies');
const reportRoot = path.join(root, '.local/abstract-studies/verification');
const catalog = JSON.parse(await readFile(path.join(publicRoot, 'catalog.json'), 'utf8'));
const stageDirectory = 'algebra-life-without-its-zeros';
const stageManifest = JSON.parse(await readFile(path.join(publicRoot, 'stages', stageDirectory, 'stages.json'), 'utf8'));
const specs = [
  ...catalog.map(({ slug, collection, batch }) => ({
    group: 'studies', name: slug,
    input: path.join(collection === 'algebraCOEF' ? (batch === 'wild' && !options.has('--source-dir') && !process.env.STUDY_PREVIEW_SOURCE ? path.join(root, '.local/abstract-studies/algebraCOEF-wild') : coefficientSource) : source, 'previews', `${slug}.png`),
    output: path.join(publicRoot, 'thumbnails', `${slug}.webp`),
    longEdge: 480, byteLimit: 48 * 1024,
  })),
  ...stageManifest.stages.map(({ svg }) => ({
    group: 'stages', name: `${stageDirectory}/${path.parse(svg).name}`,
    input: path.join(source, 'stages', stageDirectory, `${path.parse(svg).name}.png`),
    output: path.join(publicRoot, 'stages', stageDirectory, `${path.parse(svg).name}.webp`),
    longEdge: 640, byteLimit: 64 * 1024,
  })),
];
const results = [];
for (const spec of specs) {
  const input = await readFile(spec.input);
  const sourceImage = await loadImage(input);
  const scale = Math.min(1, spec.longEdge / Math.max(sourceImage.width, sourceImage.height));
  const width = Math.max(1, Math.round(sourceImage.width * scale));
  const height = Math.max(1, Math.round(sourceImage.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(sourceImage, 0, 0, width, height);
  let encoded;
  let quality;
  // Keep the intended resolution; lower quality only if unusually dense art exceeds the cap.
  for (quality of [72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24, 20, 16, 12, 8, 4]) {
    encoded = await canvas.encode('webp', quality);
    if (encoded.length <= spec.byteLimit) break;
  }
  if (encoded.length > spec.byteLimit) throw new Error(`${spec.name} exceeds its ${spec.byteLimit}-byte budget.`);
  if (encoded.toString('ascii', 0, 4) !== 'RIFF' || encoded.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`${spec.name} is not a WebP image.`);
  }
  const decoded = await loadImage(encoded);
  if (decoded.width !== width || decoded.height !== height) throw new Error(`${spec.name} decoded dimensions changed.`);
  await mkdir(path.dirname(spec.output), { recursive: true });
  await writeFile(spec.output, encoded);
  results.push({
    group: spec.group, name: spec.name,
    path: path.relative(root, spec.output).split(path.sep).join('/'),
    width, height, quality, bytes: encoded.length,
    sourceBytes: input.length,
    sourceSha256: createHash('sha256').update(input).digest('hex'),
    sha256: createHash('sha256').update(encoded).digest('hex'),
  });
}
const summaries = {};
for (const group of ['studies', 'stages']) {
  const items = results.filter(item => item.group === group);
  const totalBytes = items.reduce((total, item) => total + item.bytes, 0);
  summaries[group] = {
    count: items.length, totalBytes, averageBytes: Math.round(totalBytes / items.length),
    minBytes: Math.min(...items.map(item => item.bytes)), maxBytes: Math.max(...items.map(item => item.bytes)),
    qualityRange: [Math.min(...items.map(item => item.quality)), Math.max(...items.map(item => item.quality))],
    dimensions: [...new Set(items.map(item => `${item.width}x${item.height}`))].sort(),
  };
}
await mkdir(reportRoot, { recursive: true });
await writeFile(path.join(reportRoot, 'thumbnail-generation.json'), JSON.stringify({
  format: 'WebP', generatedAt: new Date().toISOString(),
  constraints: { studies: { longEdge: 480, maxBytes: 48 * 1024 }, stages: { longEdge: 640, maxBytes: 64 * 1024 } },
  summaries, files: results,
}, null, 2) + '\n');
console.log(JSON.stringify(summaries, null, 2));