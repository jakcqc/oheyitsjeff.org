/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// A real HTTP document with an opaque sandbox origin allows desktop Chromium
// to keep CPU-bound visuals out of the Odyssey UI's renderer process.
(() => {
  if (parent === window) return;
  const token = new URLSearchParams(location.hash.slice(1)).get('odyssey');
  const hostOrigin = location.origin;
  const send = data => parent.postMessage({ odyssey: token, ...data }, hostOrigin);
  const nativeNow = performance.now.bind(performance);
  const nativeTimeout = setTimeout.bind(window);
  // Captures have private, disposable preferences, never the user's caches.
  for (const key of ['localStorage', 'sessionStorage']) {
    const values = new Map();
    Object.defineProperty(window, key, { value: {
      get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
      getItem: k => values.get(String(k)) ?? null, setItem: (k, v) => values.set(String(k), String(v)),
      removeItem: k => values.delete(String(k)), clear: () => values.clear(),
    } });
  }
  let budget = null, expired = null, checks = 0;
  window.__odysseyCheck = () => {
    if (expired) throw expired;
    if ((++checks & 255) === 0 && budget && performance.timeOrigin + nativeNow() >= budget.until) {
      expired = new Error(budget.error);
      send({ fatal: expired.message });
      throw expired;
    }
  };
  const expectedTimeout = event => {
    if (expired) event.preventDefault();
  };
  const resources = new Map();
  let serial = 0, started = false;
  const receive = async event => {
    if (event.source !== parent || event.origin !== hostOrigin || event.data?.odyssey !== token) return;
    const data = event.data;
    if ('budget' in data) budget = data.budget;
    if (data.resourceResult) {
      const waiting = resources.get(data.resourceResult);
      if (!waiting) return;
      resources.delete(data.resourceResult);
      data.error ? waiting.reject(new Error(data.error)) : waiting.resolve(new Response(data.body, { status: data.status, headers: data.headers }));
      return;
    }
    if (data.probe) {
      const start = Date.now();
      const end = nativeNow() + 160;
      while (nativeNow() < end) { /* Bounded, safe test of separate event loops. */ }
      send({ probeFinished: { start, end: Date.now() } });
      return;
    }
    if (!data.start || started) return;
    started = true;
    try {
      const { request, html, modules } = data.start;
      window.__ODYSSEY_REQUEST__ = request;
      window.__ODYSSEY_HOST_ORIGIN__ = hostOrigin;
      const sourceModules = new Map(modules.map(entry => [entry.url, entry]));
      const blob = code => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      function rewrite(entry, resolve) {
        const code = entry.code, parts = [];
        let cursor = code.length;
        const edits = entry.edits.map((edit, order) => ({ ...edit, order }));
        edits.sort((a, b) => b.start - a.start || b.order - a.order);
        for (const edit of edits) {
          const value = edit.text ?? (edit.meta ? '({url:' + JSON.stringify(edit.meta) + '})' : JSON.stringify(resolve(edit.target)));
          parts.push(code.slice(edit.end, cursor), value); cursor = edit.start;
        }
        parts.push(code.slice(0, cursor)); return parts.reverse().join('');
      }
      const imports = Object.fromEntries(modules.map(entry => [entry.url, blob(rewrite(entry, url => url))]));
      const workerURLs = new Map();
      function workerModule(url, visiting = new Set()) {
        if (workerURLs.has(url)) return workerURLs.get(url);
        if (visiting.has(url)) throw new Error('Circular worker imports are not supported: ' + url);
        visiting.add(url);
        const entry = sourceModules.get(url);
        if (!entry) throw new Error('Missing capture worker: ' + url);
        const result = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(rewrite(entry, dependency => workerModule(dependency, visiting)));
        visiting.delete(url); workerURLs.set(url, result); return result;
      }
      for (const entry of modules) for (const url of entry.workers) workerModule(url);
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) { super(workerURLs.get(String(url)) || url, options); }
      };
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, options = {}) => {
        const url = new URL(input instanceof Request ? input.url : input, request.sourceURL);
        if (url.origin !== hostOrigin) return nativeFetch(input, options);
        const method = options.method || (input instanceof Request ? input.method : 'GET');
        if (method !== 'GET') return Promise.reject(new Error('Capture resources must use GET.'));
        const id = ++serial;
        return new Promise((resolve, reject) => {
          resources.set(id, { resolve, reject }); send({ resource: id, url: url.href });
        });
      };
      // Install the map before any source modules execute, including cyclic ones.
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const map = doc.createElement('script'); map.type = 'importmap'; map.textContent = JSON.stringify({ imports });
      doc.head.prepend(map);
      // Script src does not consult import maps, whereas its imports do.
      for (const script of doc.querySelectorAll('script[data-odyssey-source]')) {
        script.src = imports[script.dataset.odysseySource]; delete script.dataset.odysseySource;
      }
      document.open();
      // Install before writing: classic startup scripts can block or time out.
      window.addEventListener('message', receive);
      window.addEventListener('error', expectedTimeout);
      document.write('<!doctype html>\n' + doc.documentElement.outerHTML); document.close();
    } catch (error) { send({ fatal: error.message || String(error) }); }
  };
  window.addEventListener('message', receive);
  // Let the parent install handlers before starting the isolation probe.
  nativeTimeout(() => send({ booted: true }), 0);
})();
