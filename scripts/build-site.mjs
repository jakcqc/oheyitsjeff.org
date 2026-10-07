/*
 * Copyright (c) 2026 Reside Here LLC. All rights reserved.
 * No AI training, fine-tuning, or inclusion in AI/ML training datasets without prior written permission.
 * See LICENSE.txt for terms. Third-party materials retain their own licenses.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
const pageNames = ['index.html', 'floor-plans.html', 'rental-guide.html'];
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must be nonempty text.`);
  return value;
};
const textList = (value, label, allowEmpty = false) => {
  if (!Array.isArray(value) || (!allowEmpty && !value.length))
    throw new Error(`${label} must be an array of text.`);
  value.forEach((item, index) => text(item, `${label}[${index}]`));
};
function validateUrl(value, label) {
  text(value, label);
  if (/\s|[<>"'\\]/.test(value)) throw new Error(`${label} contains invalid URL characters.`);
  if (/^(https?:|mailto:|tel:)/i.test(value)) {
    try {
      new URL(value);
    } catch {
      throw new Error(`${label} must be a valid URL.`);
    }
  } else if (!/^(?:[a-z0-9-]+\.html(?:#[a-z0-9-]+)?|#[a-z0-9-]+)$/.test(value)) {
    throw new Error(`${label} must use an http(s), mailto, tel, or local page URL.`);
  }
}
async function validateAsset(src, label, extensions) {
  text(src, label);
  if (
    !/^assets\/properties\/(?:[a-z0-9-]+\/)+[a-z0-9][a-z0-9._-]*$/.test(src) ||
    !extensions.includes(path.extname(src))
  ) {
    throw new Error(`${label} must point to a local property asset with a supported extension.`);
  }
  try {
    await access(path.join(root, src));
  } catch {
    throw new Error(`${label}: missing asset ${src}`);
  }
}

export async function validateSiteData(data) {
  if (!data || data.schemaVersion !== 1) throw new Error('schemaVersion must be 1.');
  for (const key of ['rentalSearch', 'tenantLogin', 'rentalCriteria', 'rentalInfo', 'contact'])
    validateUrl(data.links?.[key], `links.${key}`);
  const home = data.home;
  for (const key of [
    'eyebrow',
    'heading',
    'maintenance',
    'ownerManaged',
    'vacancyIntro',
    'searchLabel',
    'criteriaLabel',
    'maintenanceLabel',
    'tagline',
    'galleryLabel',
    'galleryLinkLabel',
  ])
    text(home?.[key], `home.${key}`);
  text(home.overview?.heading, 'home.overview.heading');
  text(home.overview?.locations, 'home.overview.locations');
  for (const section of ['citywide', 'wellMaintained']) {
    text(home.overview?.[section]?.heading, `home.overview.${section}.heading`);
    textList(home.overview?.[section]?.paragraphs, `home.overview.${section}.paragraphs`);
  }
  text(home.overview.wellMaintained.listIntro, 'home.overview.wellMaintained.listIntro');
  const info = data.rentalInfo;
  for (const key of [
    'title',
    'heading',
    'label',
    'intro',
    'maintenanceLabel',
    'propertyIndexLabel',
    'planNote',
  ])
    text(info?.[key], `rentalInfo.${key}`);
  for (const key of ['heading', 'label']) text(info.contact?.[key], `rentalInfo.contact.${key}`);
  textList(info.contact?.paragraphs, 'rentalInfo.contact.paragraphs');
  validateUrl(info.contact?.href, 'rentalInfo.contact.href');
  if (!Array.isArray(data.properties)) throw new Error('properties must be an array.');
  const ids = new Set();
  for (const [index, property] of data.properties.entries()) {
    const label = `properties[${index}]`;
    if (
      !property ||
      typeof property.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(property.id)
    )
      throw new Error(`${label}.id must be a lowercase slug.`);
    if (ids.has(property.id)) throw new Error(`Duplicate property id: ${property.id}`);
    ids.add(property.id);
    text(property.name, `${label}.name`);
    for (const flag of ['active', 'showInOverview']) {
      if (property[flag] !== undefined && typeof property[flag] !== 'boolean')
        throw new Error(`${label}.${flag} must be true or false.`);
    }
    textList(property.descriptions, `${label}.descriptions`, true);
    if (!Array.isArray(property.links)) throw new Error(`${label}.links must be an array.`);
    for (const link of property.links) {
      text(link.label, `${label}.links.label`);
      validateUrl(link.href, `${label}.links.href`);
    }
    for (const type of ['photos', 'floorPlans']) {
      if (!Array.isArray(property[type])) throw new Error(`${label}.${type} must be an array.`);
      for (const [imageIndex, image] of property[type].entries()) {
        const imageLabel = `${label}.${type}[${imageIndex}]`;
        text(image.alt, `${imageLabel}.alt`);
        if (image.showInGallery !== undefined && typeof image.showInGallery !== 'boolean')
          throw new Error(`${imageLabel}.showInGallery must be true or false.`);
        for (const dimension of ['width', 'height']) {
          if (!Number.isInteger(image[dimension]) || image[dimension] < 1)
            throw new Error(`${imageLabel}.${dimension} must be a positive integer.`);
        }
        await validateAsset(image.src, `${imageLabel}.src`, [
          '.png',
          '.jpg',
          '.jpeg',
          '.webp',
          '.gif',
        ]);
        if (image.sourceUrl) validateUrl(image.sourceUrl, `${imageLabel}.sourceUrl`);
        if (type === 'floorPlans') {
          text(image.label, `${imageLabel}.label`);
          text(image.description, `${imageLabel}.description`);
          if (image.href)
            await validateAsset(image.href, `${imageLabel}.href`, [
              '.pdf',
              '.png',
              '.jpg',
              '.jpeg',
              '.webp',
              '.gif',
            ]);
        }
      }
    }
  }
}

const paragraphs = (items) => items.map((value) => `<p>${escapeHtml(value)}</p>`).join('\n');
const arrow = '<svg class="icon" aria-hidden="true"><use href="#icon-arrow" /></svg>';
const linkHtml = (label, href, className = 'text-link') =>
  `<a class="${className}" href="${escapeHtml(href)}">${escapeHtml(label)} ${arrow}</a>`;
function imageHtml(image, eager = false) {
  return `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" width="${image.width}" height="${image.height}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''} />`;
}
function renderGallery(properties, home, links) {
  const photos = properties.flatMap((property) =>
    property.photos
      .filter((photo) => photo.showInGallery !== false)
      .map((photo) => ({ property, photo })),
  );
  if (!photos.length) return `<p>${linkHtml(home.searchLabel, links.rentalSearch)}</p>`;
  const slides = photos
    .map(
      (
        { property, photo },
        index,
      ) => `<figure class="property-slide" data-property-slide role="group" aria-roledescription="slide" aria-label="${index + 1} of ${photos.length}">
  ${imageHtml(photo, index === 0)}
  <figcaption><strong>${escapeHtml(property.name)}</strong><a href="${escapeHtml(links.rentalInfo)}#${property.id}">${escapeHtml(home.galleryLinkLabel)}</a></figcaption>
</figure>`,
    )
    .join('\n');
  return `<section class="property-gallery" data-property-gallery aria-label="${escapeHtml(home.galleryLabel)}" aria-roledescription="carousel">
  <div class="property-gallery-slides" id="property-gallery-slides">${slides}</div>
  <div class="property-gallery-controls" data-gallery-controls hidden>
    <button class="gallery-arrow" type="button" data-gallery-previous aria-label="Previous property photo" aria-controls="property-gallery-slides"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7" /></svg><span class="gallery-control-label">Previous</span></button>
    <p data-gallery-status role="status" aria-live="polite" aria-atomic="true"></p>
    <button class="gallery-arrow" type="button" data-gallery-next aria-label="Next property photo" aria-controls="property-gallery-slides"><span class="gallery-control-label">Next</span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg></button>
    <div class="gallery-dots" data-gallery-dots aria-hidden="true">${photos.map((_, index) => `<span data-gallery-dot aria-current="${index === 0 ? 'true' : 'false'}"></span>`).join('')}</div>
  </div>
</section>`;
}
function renderProperty(property, links) {
  const plans = property.floorPlans
    .map((plan) => {
      const href = plan.href || plan.src;
      const format = path.extname(href) === '.pdf' ? 'PDF' : 'image';
      return `<figure class="property-floorplan">
      <a class="floorplan-image-link" href="${escapeHtml(href)}" aria-label="Open ${escapeHtml(property.name)} ${escapeHtml(plan.label)} (${format})">${imageHtml(plan)}</a>
      <figcaption><h3>${escapeHtml(plan.label)}</h3><p>${escapeHtml(plan.description)}</p>${linkHtml(`Open full floor plan (${format})`, href)}</figcaption>
    </figure>`;
    })
    .join('\n');
  const photo =
    property.photos.find((image) => image.showInGallery === false) || property.photos[0];
  const media =
    plans ||
    (photo
      ? `<figure class="property-photo">${imageHtml(photo)}<figcaption>${escapeHtml(property.name)}</figcaption></figure>`
      : '');
  const propertyLinks = property.links.length
    ? property.links
    : [{ label: 'Search Available Rentals', href: links.rentalSearch }];
  return `<article class="property-card${media ? '' : ' property-card-text'}" id="${property.id}" aria-labelledby="${property.id}-heading" tabindex="-1">
    <div class="property-copy"><h2 id="${property.id}-heading">${escapeHtml(property.name)}</h2>
      ${paragraphs(property.descriptions)}
      <div class="property-links">${propertyLinks.map((link) => linkHtml(link.label, link.href)).join('\n')}</div>
    </div>
    ${media ? `<div class="property-media">${media}</div>` : ''}
  </article>`;
}
function replacements(data) {
  const { home, links, rentalInfo: info } = data;
  const properties = data.properties.filter((property) => property.active !== false);
  const overview = home.overview;
  const overviewLinks = properties
    .filter((property) => property.showInOverview !== false)
    .map(
      (property) =>
        `<li><a href="${escapeHtml(links.rentalInfo)}#${property.id}">${escapeHtml(property.name)}</a></li>`,
    )
    .join('\n');
  return {
    RENTAL_SEARCH_URL: escapeHtml(links.rentalSearch),
    TENANT_LOGIN_URL: escapeHtml(links.tenantLogin),
    RENTAL_CRITERIA_URL: escapeHtml(links.rentalCriteria),
    RENTAL_INFO_URL: escapeHtml(links.rentalInfo),
    CONTACT_URL: escapeHtml(links.contact),
    HOME_CONTACT_URL: escapeHtml(
      links.contact === 'index.html#contact' ? '#contact' : links.contact,
    ),
    HOME_TAGLINE: escapeHtml(home.tagline),
    HOME_HERO_COPY: `<div class="hero-copy">
      <p class="eyebrow">${escapeHtml(home.eyebrow)}</p>
      <h1 id="hero-heading">${escapeHtml(home.heading)}</h1>
      <p class="maintenance-lead"><strong>${escapeHtml(home.maintenance)}</strong></p>
      <p class="hero-description" id="owner-managed-copy">${escapeHtml(home.ownerManaged)}</p>
      <p class="vacancy-intro">${escapeHtml(home.vacancyIntro)}</p>
      <div class="hero-actions">${linkHtml(home.searchLabel, links.rentalSearch, 'button')}${linkHtml(home.criteriaLabel, links.rentalCriteria)}</div>
    </div>`,
    PROPERTY_GALLERY: renderGallery(properties, home, links),
    RENTAL_OVERVIEW: `<section class="source-overview section-space" aria-labelledby="rentals-heading"><div class="container">
      <h2 id="rentals-heading">${escapeHtml(overview.heading)}</h2><p class="rental-locations">${escapeHtml(overview.locations)}</p>
      <div class="source-blocks">
        <article><h3>${escapeHtml(overview.citywide.heading)}</h3>${paragraphs(overview.citywide.paragraphs)}</article>
        <article><h3>${escapeHtml(overview.wellMaintained.heading)}</h3>${paragraphs(overview.wellMaintained.paragraphs)}${overviewLinks ? `<p>${escapeHtml(overview.wellMaintained.listIntro)}</p><ul class="property-overview-list">${overviewLinks}</ul>` : ''}</article>
      </div>
      <div class="rental-actions">${linkHtml('Rental Search', links.rentalSearch, 'button')}${linkHtml('Rental Info & Floor Plans', links.rentalInfo)}</div>
    </div></section>`,
    RENTAL_INFO_TITLE: escapeHtml(info.title),
    RENTAL_INFO_HEADER: `<section class="container resource-hero" aria-labelledby="plans-heading">
      <a class="resource-back" href="index.html"><span aria-hidden="true">&larr;</span> Home</a>
      <p class="eyebrow">${escapeHtml(info.label)}</p><h1 id="plans-heading">${escapeHtml(info.heading)}</h1>
      <p class="resource-lead">${escapeHtml(info.intro)}</p><p class="rental-info-maintenance">${linkHtml(info.maintenanceLabel, links.tenantLogin)}</p>
    </section>`,
    PROPERTY_INDEX: properties.length
      ? `<nav class="container property-index" aria-label="${escapeHtml(info.propertyIndexLabel)}"><ul>${properties.map((property) => `<li><a href="#${property.id}">${escapeHtml(property.name)}</a></li>`).join('\n')}</ul></nav>`
      : '',
    PROPERTY_CARDS: properties.map((property) => renderProperty(property, links)).join('\n'),
    PLAN_NOTE: escapeHtml(info.planNote),
    RENTAL_INFO_CONTACT: `<section class="container resource-next" aria-labelledby="questions-heading"><div>
      <h2 id="questions-heading">${escapeHtml(info.contact.heading)}</h2>${paragraphs(info.contact.paragraphs)}
      </div>${linkHtml(info.contact.label, info.contact.href, 'button')}</section>`,
  };
}

// Validate everything and render every page before changing any generated output.
export async function buildSite({
  dataPath = path.join(root, 'data/properties.json'),
  outDir = root,
  check = false,
} = {}) {
  let data;
  try {
    data = JSON.parse(await readFile(dataPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read property JSON: ${error.message}`);
  }
  await validateSiteData(data);
  const tokens = replacements(data);
  const pages = await Promise.all(
    pageNames.map(async (name) => {
      const template = await readFile(path.join(root, 'templates', name), 'utf8');
      const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
        if (!(key in tokens)) throw new Error(`Unknown template token: ${key}`);
        return tokens[key];
      });
      return [
        name,
        html.replace(
          '<!doctype html>',
          '<!doctype html>\n<!-- Generated by npm run build. Edit data/properties.json or templates, then rebuild. -->',
        ),
      ];
    }),
  );
  if (check) {
    for (const [name, html] of pages) {
      let existing;
      try {
        existing = await readFile(path.join(outDir, name), 'utf8');
      } catch {
        /* Missing output is stale. */
      }
      if (existing?.replace(/\r\n/g, '\n') !== html.replace(/\r\n/g, '\n'))
        throw new Error(`${name} is out of date. Run npm run build.`);
    }
  } else {
    await mkdir(outDir, { recursive: true });
    for (const [name, html] of pages) await writeFile(path.join(outDir, name), html);
  }
  const active = data.properties.filter((property) => property.active !== false);
  return {
    files: pageNames,
    propertyCount: active.length,
    photoCount: active.reduce((n, property) => n + property.photos.length, 0),
    floorPlanCount: active.reduce((n, property) => n + property.floorPlans.length, 0),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--check'))
      throw new Error('Usage: node scripts/build-site.mjs [--check]');
    const result = await buildSite({ check: args.includes('--check') });
    console.log(
      `${args.includes('--check') ? 'Verified' : 'Generated'} ${result.files.join(', ')}: ${result.propertyCount} properties, ${result.photoCount} photos, ${result.floorPlanCount} floor plans.`,
    );
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
