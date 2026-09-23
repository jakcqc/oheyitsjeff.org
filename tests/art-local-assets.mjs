/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

let moduleId = 0;
const freshLoader = async () => (await import(`../ART/localAssets.js?test=${++moduleId}`)).loadArtCatalog;
const asset = name => ({ name, width: 1200, height: 801, previewWidth: 600, previewHeight: 400 });
const response = assets => ({ ok: true, json: async () => ({ version: 1, assets }) });

test('loads one local manifest, preserving filenames and distinct image URLs', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return response([asset('Art sample #1.jpg'), asset('Art sample #1.png')]);
  });
  const load = await freshLoader();
  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cache, 'no-cache');
  assert.ok(calls[0].url.endsWith('/ART/manifest.json'));
  assert.equal(first, second);
  assert.equal(first[0].name, 'Art sample #1.jpg');
  assert.ok(first[0].originalUrl.endsWith('/assets/originals/Art%20sample%20%231.jpg'));
  assert.ok(first[0].previewUrl.endsWith('/assets/previews/Art%20sample%20%231.jpg.webp'));
  assert.notEqual(first[0].previewUrl, first[1].previewUrl);
  assert.equal(first[0].previewHeight, 400);
});

test('a failed manifest request can be retried', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? { ok: false, status: 503 } : response([asset('art.jpg')]));
  const load = await freshLoader();
  await assert.rejects(load(), /503/);
  assert.equal((await load()).length, 1);
  assert.equal(calls, 2);
});

test('rejects unsafe names, duplicate names, and invalid dimensions', async t => {
  for (const assets of [
    [asset('../art.jpg')], [asset('folder/art.jpg')], [asset('folder\\art.jpg')], [asset('..')],
    [asset('art.jpg'), asset('art.jpg')], [{ ...asset('art.jpg'), width: 0 }],
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response(assets));
    await assert.rejects((await freshLoader())(), /Invalid or duplicate/);
    mock.mock.restore();
  }
});

test('empty folders produce an empty catalog', async t => {
  t.mock.method(globalThis, 'fetch', async () => response([]));
  assert.deepEqual(await (await freshLoader())(), []);
});
