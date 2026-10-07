/*
 * Copyright (c) 2026 Reside Here LLC. All rights reserved.
 * No AI training, fine-tuning, or inclusion in AI/ML training datasets without prior written permission.
 * See LICENSE.txt for terms. Third-party materials retain their own licenses.
 */
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

// Explicit routes keep all repository files and parent directories private.
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/rental-guide.html', ['rental-guide.html', 'text/html; charset=utf-8']],
  ['/about.htm', ['rental-guide.html', 'text/html; charset=utf-8']],
  ['/floor-plans.html', ['floor-plans.html', 'text/html; charset=utf-8']],
  ['/rental_floorplans.htm', ['floor-plans.html', 'text/html; charset=utf-8']],
  ['/fonts.css', ['fonts.css', 'text/css; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/resources.css', ['resources.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/accessibility.js', ['accessibility.js', 'text/javascript; charset=utf-8']],
  ['/accessibility.css', ['accessibility.css', 'text/css; charset=utf-8']],
  ['/property-gallery.js', ['property-gallery.js', 'text/javascript; charset=utf-8']],
  ['/property-gallery.css', ['property-gallery.css', 'text/css; charset=utf-8']],
  ['/navigation.css', ['navigation.css', 'text/css; charset=utf-8']],
  ['/assets/fonts/atkinson-hyperlegible-latin-italic-400.woff2', ['assets/fonts/atkinson-hyperlegible-latin-italic-400.woff2', 'font/woff2']],
  ['/assets/fonts/atkinson-hyperlegible-latin-italic-700.woff2', ['assets/fonts/atkinson-hyperlegible-latin-italic-700.woff2', 'font/woff2']],
  ['/assets/fonts/atkinson-hyperlegible-latin-normal-400.woff2', ['assets/fonts/atkinson-hyperlegible-latin-normal-400.woff2', 'font/woff2']],
  ['/assets/fonts/atkinson-hyperlegible-latin-normal-700.woff2', ['assets/fonts/atkinson-hyperlegible-latin-normal-700.woff2', 'font/woff2']],
  ['/assets/fonts/fraunces-latin-italic.woff2', ['assets/fonts/fraunces-latin-italic.woff2', 'font/woff2']],
  ['/assets/fonts/fraunces-latin-normal.woff2', ['assets/fonts/fraunces-latin-normal.woff2', 'font/woff2']],
  ['/assets/fonts/nunito-sans-latin-italic.woff2', ['assets/fonts/nunito-sans-latin-italic.woff2', 'font/woff2']],
  ['/assets/fonts/nunito-sans-latin-normal.woff2', ['assets/fonts/nunito-sans-latin-normal.woff2', 'font/woff2']],
  ['/assets/resideHereLogoSmaller.png', ['assets/resideHereLogoSmaller.png', 'image/png']],
  ['/assets/simplifiedRRHLogo_altICON.png', ['assets/simplifiedRRHLogo_altICON.png', 'image/png']],
  ['/assets/chairsimpler.png', ['assets/chairsimpler.png', 'image/png']],
  ['/LICENSE.txt', ['LICENSE.txt', 'text/plain; charset=utf-8']],
]);
const propertyRoot = fileURLToPath(new URL('./assets/properties/', import.meta.url));
const propertyTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed.');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : 'Bad request.');
    return;
  }

  let entry = files.get(pathname);
  if (!entry && /^\/assets\/properties\/(?:[a-z0-9-]+\/)+[a-z0-9][a-z0-9._-]*$/.test(pathname)) {
    const contentType = propertyTypes[path.extname(pathname)];
    if (contentType) {
      try {
        const assetPath = await realpath(new URL(`.${pathname}`, import.meta.url));
        const relative = path.relative(await realpath(propertyRoot), assetPath);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative))
          entry = [pathname.slice(1), contentType];
      } catch {
        /* An absent or inaccessible property asset is a 404. */
      }
    }
  }
  if (!entry) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : 'Not found.');
    return;
  }

  try {
    const [filename, contentType] = entry;
    const content = await readFile(new URL(filename, import.meta.url));
    response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.byteLength });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    console.error(`Unable to serve ${pathname}:`, error.message);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : 'Unable to load this page.');
  }
});

server.on('error', (error) => {
  console.error(`Preview server could not start: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Reside Here preview: http://127.0.0.1:${port}`);
});
