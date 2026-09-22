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
import { createAppSearch } from '../Apps/search.js';

const apps = [
  { title: 'Grass Field', description: 'Procedural blades with layered wind.' },
  { title: 'Bacteria', description: 'Ring-shaped colonies with adjustable trails.' },
  { title: 'Bacterial Constructs', description: 'Layered colonies grown with equations.' },
  { title: 'Wind Study', description: 'Grass and flowing particles.' },
  { title: 'Café Patterns', description: 'Colorful tiles.' },
];
const search = createAppSearch(apps);
const titles = query => search(query).map(app => app.title);

test('exact titles lead prefixes, typos, and description matches', () => {
  assert.equal(titles('bacteria')[0], 'Bacteria');
  assert.equal(titles('grass field')[0], 'Grass Field');
  assert.equal(titles('grass')[0], 'Grass Field');
});

test('completes prefixes and tolerates missing letters and transpositions', () => {
  assert.ok(titles('bact').includes('Bacterial Constructs'));
  assert.equal(titles('bacteira')[0], 'Bacteria');
  assert.equal(titles('bactria')[0], 'Bacteria');
  assert.equal(titles('constrcuts')[0], 'Bacterial Constructs');
});

test('searches descriptions and ranks complete cross-field matches first', () => {
  assert.equal(titles('adjustable trails')[0], 'Bacteria');
  assert.equal(titles('bacteria equations')[0], 'Bacterial Constructs');
  assert.ok(titles('bacteria equations').includes('Bacteria'));
  assert.equal(titles('layered wind')[0], 'Grass Field');
});

test('normalizes accents, casing, punctuation, and word order', () => {
  assert.equal(titles('CAFE')[0], 'Café Patterns');
  assert.equal(titles('ring shaped')[0], 'Bacteria');
  assert.equal(titles('  FIELD  grass ')[0], 'Grass Field');
});

test('unmatched input is empty and clearing restores the full original order', () => {
  assert.deepEqual(search('zzzzzzzz'), []);
  assert.deepEqual(search('   '), apps);
  assert.deepEqual(search(''), apps);
  assert.notEqual(search(''), apps);
});

test('search includes apps beyond the first display batch', () => {
  const largeCatalog = Array.from({ length: 45 }, (_, i) => ({
    title: `Visual ${i}`, description: i === 44 ? 'Unique kaleidoscope' : 'Shapes',
  }));
  assert.equal(createAppSearch(largeCatalog)('kaleidoscope')[0], largeCatalog[44]);
});
