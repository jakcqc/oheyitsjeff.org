/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */

// Regenerate with: node scripts/build-pure-attractors-preview.mjs
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
// Load the browser ES module without requiring a package.json module setting.
const mathSource = await readFile(new URL('PureAttractors/attractorMath.js', root), 'utf8');
const { PRESETS, sampleOrbit } = await import(`data:text/javascript;base64,${Buffer.from(mathSource).toString('base64')}`);
const preset = PRESETS.find(preset => preset.id === 'fivefold-classic');
const orbit = sampleOrbit(preset, { count: 100000, burnIn: 5000, seed: preset.seed });
assert.equal(orbit.status, 'bounded');
assert.equal(orbit.count, 100000);
assert.ok(orbit.maxRadius > 0 && Number.isFinite(orbit.maxRadius));

const resolution = 128;
const buckets = 24;
const extent = orbit.maxRadius * 1.015;
const density = new Uint32Array(resolution * resolution);
for (let i = 0; i < orbit.points.length; i += 2) {
  const x = orbit.points[i];
  const y = orbit.points[i + 1];
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  const col = Math.floor((x / extent + 1) * resolution / 2);
  const row = Math.floor((1 - y / extent) * resolution / 2);
  assert.ok(col >= 0 && col < resolution && row >= 0 && row < resolution);
  density[row * resolution + col] += 1;
}
const peak = Math.max(...density);
const palette = ['#1f2731', '#67473a', '#b57550', '#e9bd8d', '#fff1d4']
  .map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
function color(t) {
  const scaled = t * (palette.length - 1);
  const index = Math.min(palette.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  return '#' + palette[index].map((channel, i) =>
    Math.round(channel + (palette[index + 1][i] - channel) * fraction)
      .toString(16).padStart(2, '0')).join('');
}
const paths = Array.from({ length: buckets }, () => []);
const quantized = new Uint8Array(density.length);
let occupied = 0;
for (let index = 0; index < density.length; index += 1) {
  if (!density[index]) continue;
  const t = Math.log1p(density[index]) / Math.log1p(peak);
  quantized[index] = 1 + Math.min(buckets - 1, Math.floor(t * buckets));
  occupied += 1;
}
// Merge adjacent cells with the same density color into integer rectangles.
// One group transform handles sizing and the app's -90 degree orientation.
let rectangles = 0;
for (let row = 0; row < resolution; row += 1) {
  for (let col = 0; col < resolution;) {
    const value = quantized[row * resolution + col];
    if (!value) { col += 1; continue; }
    let end = col + 1;
    while (end < resolution && quantized[row * resolution + end] === value) end += 1;
    const width = end - col;
    paths[value - 1].push(`M${col},${row}h${width}v1h-${width}z`);
    rectangles += 1;
    col = end;
  }
}
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-labelledby="title desc">',
  `  <title id="title">Pure Attractors: ${preset.name}</title>`,
  '  <desc id="desc">Density of 100,000 iterates of a single generalized Field-Golubitsky orbit, after discarding 5,000 transient steps.</desc>',
  '  <rect width="256" height="256" fill="#090e17"/>',
  '  <circle cx="128" cy="128" r="122" fill="#101620" stroke="#263140" stroke-width="0.6"/>',
  '  <g transform="translate(128 128) rotate(-90) scale(1.875) translate(-64 -64)">',
  ...paths.map((commands, index) => commands.length
    ? `  <path fill="${color(index / (buckets - 1))}" d="${commands.join('')}"/>`
    : '').filter(Boolean),
  '  </g>',
  '</svg>',
  '',
].join('\n');
assert.ok(!/NaN|Infinity|undefined/.test(svg));
assert.ok(occupied > 1000);
assert.ok(Buffer.byteLength(svg) < 250000);
await writeFile(new URL('PureAttractors/preview.svg', root), svg);
console.log(`Pure Attractors preview: ${orbit.count.toLocaleString('en-US')} orbit points, ${occupied.toLocaleString('en-US')} density cells, ${rectangles.toLocaleString('en-US')} rectangles, ${paths.filter(path => path.length).length} SVG paths, ${Buffer.byteLength(svg).toLocaleString('en-US')} bytes.`);
