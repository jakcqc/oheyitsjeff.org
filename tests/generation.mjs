/*
 * Copyright (c) 2026 Reside Here LLC. All rights reserved.
 * No AI training, fine-tuning, or inclusion in AI/ML training datasets without prior written permission.
 * See LICENSE.txt for terms. Third-party materials retain their own licenses.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build-site.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const source = JSON.parse(
  await readFile(path.join(repositoryRoot, 'data/properties.json'), 'utf8'),
);
const seedIndex = source.properties.findIndex(
  (property) => property.active !== false && property.photos.length && property.floorPlans.length,
);
assert.ok(
  seedIndex >= 0,
  'The source fixture needs an active property with a photo and floor plan.',
);
const seed = source.properties[seedIndex];
const pageNames = ['index.html', 'floor-plans.html', 'rental-guide.html'];
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'residehere-generation-'));

after(async () => {
  // Only remove the exact temporary directory this test run created.
  const target = path.resolve(temporaryRoot);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('residehere-generation-'));
  await rm(target, { recursive: true, force: true });
});

async function fixture(data = structuredClone(source)) {
  const directory = await mkdtemp(path.join(temporaryRoot, 'case-'));
  const dataPath = path.join(directory, 'properties.json');
  const outDir = path.join(directory, 'output');
  const writeData = (value) => writeFile(dataPath, JSON.stringify(value, null, 2));
  await writeData(data);
  return {
    dataPath,
    outDir,
    writeData,
    build: (options = {}) => buildSite({ dataPath, outDir, ...options }),
  };
}

async function readPages(outDir) {
  return Object.fromEntries(
    await Promise.all(
      pageNames.map(async (name) => [name, await readFile(path.join(outDir, name), 'utf8')]),
    ),
  );
}

function fragment(html, expression, label) {
  const match = html.match(expression);
  assert.ok(match, `${label} should be rendered.`);
  return match[1];
}

const gallery = (html) =>
  fragment(
    html,
    /<div\b[^>]*\bid="property-gallery-slides"[^>]*>([\s\S]*?)<\/div>/,
    'Homepage photo gallery',
  );
const overview = (html) =>
  fragment(
    html,
    /<ul\b[^>]*\bclass="property-overview-list"[^>]*>([\s\S]*?)<\/ul>/,
    'Homepage property overview',
  );
const propertyIndex = (html) =>
  fragment(
    html,
    /<nav\b[^>]*\bclass="[^"]*\bproperty-index\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/,
    'Rental information property index',
  );
const propertyCard = (html, id) =>
  fragment(
    html,
    new RegExp(`<article\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/article>`),
    `Property card ${id}`,
  );

function assertPropertyAbsent(pages, id) {
  assert.ok(
    !pages['index.html'].includes(`#${id}"`),
    'Homepage links must not retain the property.',
  );
  assert.ok(
    !pages['floor-plans.html'].includes(`id="${id}"`),
    'Rental information must not retain the property card.',
  );
  assert.ok(
    !pages['floor-plans.html'].includes(`href="#${id}"`),
    'Property index must not retain the property.',
  );
}

await test('editing one property and shared copy updates all relevant pages', async () => {
  const data = structuredClone(source);
  const property = data.properties[seedIndex];
  property.active = true;
  property.showInOverview = true;
  property.name = 'Regression property updated';
  property.descriptions = ['Updated property description from the shared data file.'];
  property.links = [
    {
      label: 'Updated listing destination',
      href: 'https://example.test/rentals?unit=42&view=details',
    },
  ];
  property.photos[0].alt = 'Updated property photograph description';
  data.home.overview.wellMaintained.paragraphs = [
    'Updated maintenance information from shared data.',
  ];
  data.rentalInfo.intro = 'Updated introduction for the rental information page.';
  data.rentalInfo.title = 'Updated Rental Information';
  data.links.rentalSearch = 'https://example.test/current-rentals';

  const run = await fixture(data);
  await run.build();
  const pages = await readPages(run.outDir);
  const home = pages['index.html'];
  const rentalInfo = pages['floor-plans.html'];

  assert.ok(
    overview(home).includes(property.name),
    'The homepage overview should use the edited name.',
  );
  assert.ok(
    gallery(home).includes(property.name),
    'The gallery caption should use the edited name.',
  );
  assert.ok(
    gallery(home).includes(`alt="${property.photos[0].alt}"`),
    'The gallery image should use the edited alternative text.',
  );
  assert.ok(
    propertyIndex(rentalInfo).includes(property.name),
    'The rental information index should use the edited name.',
  );
  const card = propertyCard(rentalInfo, property.id);
  assert.ok(card.includes(property.name));
  assert.ok(card.includes(property.descriptions[0]));
  assert.ok(card.includes('href="https://example.test/rentals?unit=42&amp;view=details"'));
  assert.ok(card.includes(property.links[0].label));
  assert.ok(home.includes(data.home.overview.wellMaintained.paragraphs[0]));
  assert.ok(rentalInfo.includes(data.rentalInfo.intro));
  assert.ok(rentalInfo.includes(`<title>${data.rentalInfo.title}</title>`));
  for (const [name, html] of Object.entries(pages)) {
    assert.ok(
      html.includes('href="https://example.test/current-rentals"'),
      `${name} should use the shared rental search URL.`,
    );
  }
});

await test('removing or deactivating a property clears its generated links and cards', async () => {
  for (const mode of ['remove', 'inactive']) {
    const data = structuredClone(source);
    const run = await fixture(data);
    await run.build();
    if (mode === 'remove') data.properties.splice(seedIndex, 1);
    else data.properties[seedIndex].active = false;
    await run.writeData(data);
    await run.build();
    assertPropertyAbsent(await readPages(run.outDir), seed.id);
  }
});

await test('a new property appears in the overview, gallery, index, and floor plans', async () => {
  const data = structuredClone(source);
  const added = structuredClone(seed);
  added.id = 'regression-added-property';
  added.name = 'Regression added property';
  added.active = true;
  added.showInOverview = true;
  added.photos[0].alt = 'Photograph for the newly added property';
  added.floorPlans[0].label = 'New property sample floor plan';
  data.properties.push(added);

  const run = await fixture(data);
  await run.build();
  const pages = await readPages(run.outDir);
  assert.ok(overview(pages['index.html']).includes(`#${added.id}"`));
  assert.ok(gallery(pages['index.html']).includes(added.name));
  assert.ok(gallery(pages['index.html']).includes(added.photos[0].alt));
  assert.ok(propertyIndex(pages['floor-plans.html']).includes(`href="#${added.id}"`));
  const card = propertyCard(pages['floor-plans.html'], added.id);
  assert.ok(card.includes(added.name));
  assert.ok(card.includes(added.floorPlans[0].label));
});

await test('an overview-only exclusion keeps the property gallery and rental information available', async () => {
  const data = structuredClone(source);
  data.properties[seedIndex].showInOverview = false;
  const run = await fixture(data);
  await run.build();
  const pages = await readPages(run.outDir);
  assert.ok(!overview(pages['index.html']).includes(`#${seed.id}"`));
  assert.ok(gallery(pages['index.html']).includes(`#${seed.id}"`));
  assert.ok(propertyCard(pages['floor-plans.html'], seed.id));
});

await test('properties without photos or floor plans remain usable without broken media', async () => {
  const data = structuredClone(source);
  const property = structuredClone(seed);
  property.photos = [];
  property.floorPlans = [];
  data.properties = [property];
  const run = await fixture(data);
  await run.build();
  const pages = await readPages(run.outDir);
  const card = propertyCard(pages['floor-plans.html'], property.id);
  assert.ok(card.includes('<h2'), 'Text-only properties should still have a heading.');
  assert.ok(card.includes('<a '), 'Text-only properties should still have a rental link.');
  assert.ok(!card.includes('<img'), 'An empty media list must not produce a broken image.');
  assert.ok(
    !pages['index.html'].includes('data-property-gallery'),
    'An empty photo list must not produce an empty carousel.',
  );
  assert.ok(pages['index.html'].includes(source.links.rentalSearch));

  property.photos = structuredClone(seed.photos);
  await run.writeData(data);
  await run.build();
  const fallbackCard = propertyCard((await readPages(run.outDir))['floor-plans.html'], property.id);
  assert.ok(
    fallbackCard.includes(property.photos[0].src),
    'A photo should remain available when no floor plan exists.',
  );
  assert.ok(
    !fallbackCard.includes('class="floorplan-image-link"'),
    'A property without plans must not offer a nonexistent floor plan.',
  );
});

await test('an empty property list removes generated property sections cleanly', async () => {
  const data = structuredClone(source);
  data.properties = [];
  const run = await fixture(data);
  await run.build();
  const pages = await readPages(run.outDir);
  assert.ok(!pages['index.html'].includes('data-property-gallery'));
  assert.ok(!pages['index.html'].includes('class="property-overview-list"'));
  assert.ok(!pages['floor-plans.html'].includes('class="container property-index"'));
  assert.ok(!pages['floor-plans.html'].includes('class="property-card'));
  assert.ok(pages['index.html'].includes(source.links.rentalSearch));
});

await test('a photo excluded from the slider remains available on its rental information card', async () => {
  const data = structuredClone(source);
  const property = structuredClone(seed);
  property.photos = [structuredClone(seed.photos[0])];
  property.photos[0].showInGallery = false;
  property.floorPlans = [];
  data.properties = [property];
  const run = await fixture(data);
  await run.build();
  const pages = await readPages(run.outDir);
  assert.ok(!pages['index.html'].includes('data-property-gallery'));
  assert.ok(propertyCard(pages['floor-plans.html'], property.id).includes(property.photos[0].src));
});

await test('invalid JSON, identifiers, links, and assets never overwrite valid output', async () => {
  const cases = [
    ['malformed JSON', null, /JSON/i],
    ['duplicate IDs', (data) => data.properties.push(structuredClone(seed)), /duplicate/i],
    [
      'unsafe URL',
      (data) => {
        data.properties[seedIndex].links = [{ label: 'Invalid link', href: 'javascript:alert(1)' }];
      },
      /URL/i,
    ],
    [
      'malformed URL',
      (data) => {
        data.links.rentalSearch = 'https://';
      },
      /URL/i,
    ],
    [
      'missing asset',
      (data) => {
        data.properties[seedIndex].photos[0].src =
          `assets/properties/${seed.id}/missing-regression-photo.jpg`;
      },
      /asset/i,
    ],
    [
      'asset traversal',
      (data) => {
        data.properties[seedIndex].photos[0].src = 'assets/properties/../private.jpg';
      },
      /asset/i,
    ],
  ];

  for (const [label, mutate, errorPattern] of cases) {
    const data = structuredClone(source);
    const run = await fixture(data);
    await run.build();
    const originalPages = await readPages(run.outDir);
    if (mutate) {
      mutate(data);
      await run.writeData(data);
    } else {
      await writeFile(run.dataPath, '{"schemaVersion": 1, "properties": [');
    }
    await assert.rejects(run.build(), errorPattern, label);
    assert.deepEqual(
      await readPages(run.outDir),
      originalPages,
      `${label} must leave every generated page unchanged.`,
    );
  }
});

await test('HTML-looking names, descriptions, and image alternatives render as text', async () => {
  const data = structuredClone(source);
  const property = data.properties[seedIndex];
  property.showInOverview = true;
  property.name = 'Rental <script>alert("name")</script> & "quoted"';
  property.descriptions = ['<img src=x onerror="alert(1)"> & text'];
  property.photos[0].alt = '" onerror="alert(2)" <photo> & details';
  const run = await fixture(data);
  await run.build();
  const pages = await readPages(run.outDir);
  const escapedName =
    'Rental &lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt; &amp; &quot;quoted&quot;';
  assert.ok(overview(pages['index.html']).includes(escapedName));
  assert.ok(gallery(pages['index.html']).includes(escapedName));
  assert.ok(
    gallery(pages['index.html']).includes(
      'alt="&quot; onerror=&quot;alert(2)&quot; &lt;photo&gt; &amp; details"',
    ),
  );
  const card = propertyCard(pages['floor-plans.html'], property.id);
  assert.ok(card.includes(escapedName));
  assert.ok(card.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; text'));
  for (const html of Object.values(pages)) {
    assert.ok(!html.includes('<script>alert("name")</script>'));
    assert.ok(!html.includes('<img src=x onerror="alert(1)">'));
  }
});

await test('rebuilding is deterministic and check mode detects stale or missing output without writing', async () => {
  const run = await fixture();
  await run.build();
  const originalPages = await readPages(run.outDir);
  await run.build();
  assert.deepEqual(await readPages(run.outDir), originalPages);
  await run.build({ check: true });

  const homePath = path.join(run.outDir, 'index.html');
  await writeFile(homePath, '<!doctype html><p>Deliberately stale test output</p>');
  await assert.rejects(run.build({ check: true }), /out of date/i);
  assert.equal(
    await readFile(homePath, 'utf8'),
    '<!doctype html><p>Deliberately stale test output</p>',
  );
  await run.build();
  assert.deepEqual(await readPages(run.outDir), originalPages);

  await unlink(path.join(run.outDir, 'floor-plans.html'));
  await assert.rejects(run.build({ check: true }), /out of date/i);
  await assert.rejects(readFile(path.join(run.outDir, 'floor-plans.html')), { code: 'ENOENT' });
});
