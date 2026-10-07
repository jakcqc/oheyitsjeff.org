/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { describeSource } from './capture-source.js';

// Fetch on the website's origin; never execute source code in the host page.
// Sandboxed frames cannot fetch these modules directly on static servers that
// do not send CORS headers. Completed reads are reused by later samples.
const modules = new Map();
async function read(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Could not load ' + url + ' (' + response.status + ').');
  return response.text();
}
function moduleResolver(doc, baseURL) {
  const imports = {}, scopes = {};
  const isURL = value => /^(?:[./]|[a-z][a-z\d+.-]*:)/i.test(value);
  const normalize = table => Object.fromEntries(Object.entries(table || {}).map(([key, value]) => [
    isURL(key) ? new URL(key, baseURL).href : key, typeof value === 'string' ? new URL(value, baseURL).href : null,
  ]));
  for (const script of doc.querySelectorAll('script[type="importmap"]')) {
    const map = JSON.parse(script.textContent);
    Object.assign(imports, normalize(map.imports));
    for (const [scope, entries] of Object.entries(map.scopes || {})) scopes[new URL(scope, baseURL).href] = normalize(entries);
  }
  const resolve = (specifier, from) => {
    const key = isURL(specifier) ? new URL(specifier, from).href : specifier;
    const tables = Object.keys(scopes).filter(scope => from.startsWith(scope)).sort((a, b) => b.length - a.length).map(scope => scopes[scope]);
    for (const table of [...tables, imports]) {
      const match = Object.keys(table).filter(item => item === key || item.endsWith('/') && key.startsWith(item)).sort((a, b) => b.length - a.length)[0];
      if (match) {
        if (!table[match]) throw new Error('Blocked module import: ' + specifier);
        return table[match] + key.slice(match.length);
      }
    }
    if (!isURL(key)) throw new Error('Unmapped module import: ' + specifier);
    return key;
  };
  return { resolve, cacheKey: JSON.stringify({ imports, scopes }) };
}
export async function captureDocument(url, signal) {
  const html = await read(url, signal);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const baseURL = new URL(doc.querySelector('base[href]')?.getAttribute('href') || url, url).href;
  const resolver = moduleResolver(doc, baseURL);
  doc.querySelectorAll('base, script[type="importmap"], link[rel="modulepreload"]').forEach(node => node.remove());
  const base = doc.createElement('base'); base.href = baseURL; doc.head.prepend(base);
  const graph = new Map(), tasks = [];
  function visit(target, inline, sourceType = 'module') {
    if (graph.has(target)) return;
    graph.set(target, null);
    const task = (async () => {
      const cacheKey = resolver.cacheKey + target;
      let entry = inline === undefined ? modules.get(cacheKey) : null;
      if (!entry) {
        entry = describeSource(inline === undefined ? await read(target, signal) : inline, target, sourceType, resolver.resolve);
        if (inline === undefined && !signal.aborted) modules.set(cacheKey, entry);
      }
      signal.throwIfAborted();
      graph.set(target, entry);
      for (const dependency of [...entry.dependencies, ...entry.workers]) visit(dependency);
    })();
    task.catch(() => {}); tasks.push(task);
  }
  let serial = 0;
  for (const script of doc.querySelectorAll('script')) {
    const type = script.getAttribute('type') || 'text/javascript';
    if (!['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    const src = script.getAttribute('src');
    const target = src ? new URL(src, baseURL).href : new URL('./__odyssey_inline_' + serial++ + '.js', baseURL).href;
    visit(target, src ? undefined : script.textContent, type === 'module' ? 'module' : 'script');
    script.textContent = ''; script.src = target; script.dataset.odysseySource = target;
    script.removeAttribute('integrity');
  }
  // Dependency discovery adds another batch while the current reads finish.
  for (let offset = 0; offset < tasks.length;) {
    const batch = tasks.slice(offset); offset = tasks.length;
    await Promise.all(batch);
  }
  return { html: '<!doctype html>\n' + doc.documentElement.outerHTML, modules: [...graph.values()] };
}
