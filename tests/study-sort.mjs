/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { sortStudies } from '../Apps/studySort.js';

const input = [{ slug: 'large', elements: 200 }, { slug: 'small', elements: 2 }, { slug: 'tie', elements: 2 }, { slug: 'unknown' }];
test('complexity sorts numerically, retains relevance ties, and puts unknown counts last', () => {
  assert.deepEqual(sortStudies(input, 'complexity-asc').map(x => x.slug), ['small', 'tie', 'large', 'unknown']);
  assert.deepEqual(sortStudies(input, 'complexity-desc').map(x => x.slug), ['large', 'small', 'tie', 'unknown']);
  assert.equal(sortStudies(input), input);
  assert.deepEqual(input.map(x => x.slug), ['large', 'small', 'tie', 'unknown']);
  assert.deepEqual(sortStudies([{elements: -1}, {elements: NaN}, {elements: 0}], 'complexity-desc').map(x => x.elements), [0, -1, NaN]);
});

test('viewer sorts the entire filtered catalog before pagination and restores default order', async () => {
  const require = createRequire(import.meta.url);
  const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
  const dom = new JSDOM('<body><main></main>', { url: 'https://example.test/Apps/', pretendToBeVisual: true });
  const { window } = dom;
  const keys = ['window', 'document', 'Option', 'AbortController', 'IntersectionObserver', 'fetch'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const records = Array.from({length:45}, (_, index) => ({ slug: `s-${index}`, title: `Study ${index}`, app: index % 2 ? 'Odd' : 'Even', appName: index % 2 ? 'Odd' : 'Even', visualId: 'test', elements: 45-index, collection: index % 2 ? 'algebraCOEF' : 'original', kind: 'main', monochrome: false }));
  for (const key of ['window','document','Option','AbortController']) Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true,writable:true});
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.fetch = async () => ({ ok: true, json: async () => records });
  let viewer;
  try {
    const { mountStudiesViewer } = await import('../Apps/studies.js');
    viewer = mountStudiesViewer(document.querySelector('main'));
    await new Promise(resolve => setImmediate(resolve));
    const slugs = () => [...document.querySelectorAll('.study')].map(node => node.dataset.slug);
    const select = (id, value) => { const node = document.getElementById(id); node.value=value; node.dispatchEvent(new window.Event('change')); };
    assert.deepEqual(slugs(),records.slice(0,20).map(x=>x.slug));
    select('study-sort','complexity-asc');
    assert.deepEqual(slugs(),records.toReversed().slice(0,20).map(x=>x.slug));
    document.getElementById('study-load-more').click();
    assert.deepEqual(slugs(),records.toReversed().slice(0,40).map(x=>x.slug));
    select('study-collection-filter','algebraCOEF');
    assert.deepEqual(slugs(),records.filter(x=>x.collection==='algebraCOEF').toReversed().slice(0,20).map(x=>x.slug));
    assert.equal(document.querySelector('.study-actions a[download$="flow.json"]').textContent,'Flow');
    select('study-sort','complexity-desc');
    assert.deepEqual(slugs(),records.filter(x=>x.collection==='algebraCOEF').slice(0,20).map(x=>x.slug));
    const query=document.getElementById('study-search'); query.value='Study 1';
    document.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
    const counts=[...document.querySelectorAll('.study')].map(node=>records.find(x=>x.slug===node.dataset.slug).elements);
    assert.ok(counts.length>0); assert.deepEqual(counts,[...counts].sort((a,b)=>b-a));
    document.getElementById('study-reset-filters').click();
    assert.equal(document.getElementById('study-sort').value,'relevance');
    assert.deepEqual(slugs(),records.slice(0,20).map(x=>x.slug));
    assert.match(document.querySelector('.study-complexity').textContent,/45 SVG elements/);
  } finally {
    viewer?.destroy(); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; }
  }
});
