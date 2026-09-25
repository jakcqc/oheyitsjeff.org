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

// Rasterize the original vector exports for the larger algebra illustrations.
// The separate 480px gallery and 640px stage thumbnails remain unchanged.
// node scripts/generate-algebra-previews.mjs [--node-modules directory]
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index];
  if (flag === '--help') {
    console.log('Usage: node scripts/generate-algebra-previews.mjs [--node-modules directory]');
    process.exit(0);
  }
  if (flag !== '--node-modules' || !process.argv[index + 1]) throw new Error(`Unknown or incomplete argument: ${flag}`);
  options.set(flag, process.argv[index + 1]);
}
const nodeModules = options.get('--node-modules') || process.env.STUDY_THUMBNAIL_NODE_MODULES;
const require = createRequire(import.meta.url);
let canvasLibrary;
try {
  canvasLibrary = require(nodeModules ? path.join(path.resolve(nodeModules), '@napi-rs/canvas') : '@napi-rs/canvas');
} catch (error) {
  throw new Error('Large preview generation needs @napi-rs/canvas. Install it or pass --node-modules /path/to/node_modules.', { cause: error });
}
const { createCanvas, loadImage } = canvasLibrary;
const publicRoot = path.join(root, 'Apps/studies');
const stageDirectory = 'algebra-life-without-its-zeros';
const stageManifest = JSON.parse(await readFile(path.join(publicRoot, 'stages', stageDirectory, 'stages.json'), 'utf8'));
const comparisonStudies = ['algebra-order-color-before-normals', 'algebra-order-normals-before-color', 'algebracoef-halo-b-source', 'algebracoef-halo-b-marks', 'algebracoef-wild-projective-anti-matter', 'algebracoef-wild-needle-frequency-altar'];
const specs = [
  ...stageManifest.stages.map(({ svg }) => ({
    group: 'stages', name: `${stageDirectory}/${path.parse(svg).name}`,
    input: path.join(publicRoot, 'stages', stageDirectory, svg),
    output: path.join(publicRoot, 'stages', stageDirectory, `${path.parse(svg).name}.large.webp`),
  })),
  ...comparisonStudies.map(slug => ({
    group: 'comparison', name: slug,
    input: path.join(publicRoot, 'svg', `${slug}.svg`),
    output: path.join(publicRoot, 'large', `${slug}.webp`),
  })),
];
const maxBytes = 400 * 1024;
const longEdges = [2048, 1920, 1800, 1600];
const qualities = [94, 90, 86, 82, 78, 74, 70];
const portablePath = value => path.relative(root, value).split(path.sep).join('/');
const digest = value => createHash('sha256').update(value).digest('hex');
const results = [];
for (const spec of specs) {
  const input = await readFile(spec.input);
  const source = input.toString('utf8');
  const rootTag = source.match(/<svg\b[^>]*>/i)?.[0];
  if (!rootTag) throw new Error(`${spec.name}: missing SVG root.`);
  const dimensions = ['width', 'height'].map(name => Number(rootTag.match(new RegExp(`\\b${name}="([0-9.]+)(?:px)?"`))?.[1]));
  if (dimensions.some(value => !Number.isFinite(value) || value <= 0) || !/\bviewBox=/.test(rootTag)) {
    throw new Error(`${spec.name}: numeric SVG dimensions and a viewBox are required.`);
  }
  let chosen;
  for (const longEdge of longEdges) {
    const scale = longEdge / Math.max(...dimensions);
    const width = Math.round(dimensions[0] * scale);
    const height = Math.round(dimensions[1] * scale);
    // Set dimensions before the SVG decoder runs: this rasterizes vector paths at
    // their final display resolution rather than enlarging a decoded thumbnail.
    const resizedTag = rootTag.replace(/\bwidth="[^"]*"/, `width="${width}"`).replace(/\bheight="[^"]*"/, `height="${height}"`);
    const sourceImage = await loadImage(Buffer.from(source.replace(rootTag, resizedTag)));
    if (sourceImage.width !== width || sourceImage.height !== height) throw new Error(`${spec.name}: the SVG decoder ignored output dimensions.`);
    const canvas = createCanvas(width, height);
    canvas.getContext('2d').drawImage(sourceImage, 0, 0);
    for (const quality of qualities) {
      const encoded = await canvas.encode('webp', quality);
      if (encoded.length <= maxBytes) {
        chosen = { encoded, width, height, quality };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) throw new Error(`${spec.name}: cannot meet 400 KiB at 1600px and quality 70 or higher.`);
  const { encoded, width, height, quality } = chosen;
  if (encoded.toString('ascii', 0, 4) !== 'RIFF' || encoded.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${spec.name}: invalid WebP output.`);
  const decoded = await loadImage(encoded);
  if (decoded.width !== width || decoded.height !== height) throw new Error(`${spec.name}: decoded dimensions changed.`);
  await mkdir(path.dirname(spec.output), { recursive: true });
  await writeFile(spec.output, encoded);
  const result = {
    group: spec.group, name: spec.name, path: portablePath(spec.output),
    source: portablePath(spec.input), sourceBytes: input.length, sourceSha256: digest(input),
    width, height, quality, bytes: encoded.length, sha256: digest(encoded),
  };
  results.push(result);
  console.log(`${result.path}: ${width}x${height}, quality ${quality}, ${(encoded.length / 1024).toFixed(1)} KiB`);
}
const totalBytes = results.reduce((sum, file) => sum + file.bytes, 0);
const report = {
  format: 'WebP', generatedAt: new Date().toISOString(),
  renderer: '@napi-rs/canvas SVG decoder, vector source resized before rasterization',
  constraints: { preferredLongEdge: 2048, minimumLongEdge: 1600, minimumQuality: 70, maxBytes },
  summary: { count: results.length, totalBytes, averageBytes: Math.round(totalBytes / results.length), minBytes: Math.min(...results.map(file => file.bytes)), maxBytes: Math.max(...results.map(file => file.bytes)) },
  files: results,
};
const reportRoot = path.join(root, '.local/abstract-studies/verification');
await mkdir(reportRoot, { recursive: true });
await writeFile(path.join(reportRoot, 'algebra-preview-generation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary, null, 2));
