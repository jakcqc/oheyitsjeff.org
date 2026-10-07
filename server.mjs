import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

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
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/resources.css', ['resources.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

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

  const entry = files.get(pathname);
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
