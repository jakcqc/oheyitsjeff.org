/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { DEFAULTS, clone, plan, sample, validate } from './search.js';
import { OdysseyStorage, json } from './storage.js';
import { runId, listRuns, canRemoveRun } from './runs.js';
import { captureDocument } from './capture-loader.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const stopped = () => new Error('Search stopped.');
const timestamp = () => new Date().toISOString();
async function readJSON(url, fallback) {
  try { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(response.status); return await response.json(); }
  catch (error) { if (fallback !== undefined) return fallback; throw error; }
}
function recover(session) {
  // Archives created by the old runner used parameter minimums implicitly.
  if (!session.clientVersion && session.settings.respectParamSamples === undefined) session.settings.respectParamSamples = true;
  if (['running', 'pausing'].includes(session.status)) {
    session.status = 'paused'; session.message = 'Page closed. Resume retries the unfinished run from its saved settings.';
  }
  if (session.runs[session.cursor]?.status === 'running') session.runs[session.cursor].status = 'interrupted';
  return session;
}
function summary(session) {
  const { settings, catalog, runs, ...rest } = session;
  return { ...rest, completed: runs.filter(r => r.status === 'complete').length, failed: runs.filter(r => ['failed', 'timeout'].includes(r.status)).length };
}
// Source assets are fetched by the host and executed only in an opaque sandbox.
export class VisualFrame {
  constructor(url, request, signal) {
    const source = new URL(url, location.href);
    if (source.origin !== location.origin) throw new Error('Visual sources must be on the same website.');
    this.token = crypto.randomUUID(); this.pending = new Map(); this.serial = 0; this.signal = signal;
    this.loading = new AbortController();
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    this.iframe.title = 'Odyssey source capture'; this.iframe.setAttribute('aria-hidden', 'true'); this.iframe.tabIndex = -1;
    Object.assign(this.iframe.style, { position: 'fixed', left: '-10000px', top: '0', width: (request.width || 1200) + 'px',
      height: (request.height || 800) + 'px', border: '0', pointerEvents: 'none' });
    source.searchParams.set('odyssey', this.token);
    this.request = { ...request, odyssey: this.token, sourceURL: source.href };
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.ready.catch(() => {});
    this.isolated = new Promise((resolve, reject) => { this.resolveIsolation = resolve; this.rejectIsolation = reject; });
    this.isolated.catch(() => {});
    this.receive = event => {
      if (event.source !== this.iframe.contentWindow || event.origin !== 'null' || event.data?.odyssey !== this.token || this.destroyed) return;
      const data = event.data;
      if (data.booted) {
        this.probeTicks = [];
        this.probeTimer = setInterval(() => this.probeTicks.push(Date.now()), 10);
        this.send({ probe: true });
      }
      if (data.probeFinished) {
        clearInterval(this.probeTimer);
        const { start, end } = data.probeFinished;
        if (this.probeTicks.some(tick => tick > start + 10 && tick < end - 10)) this.resolveIsolation();
        else this.destroy(new Error('This browser cannot isolate capture calculations. Use desktop Chrome or Edge with site isolation enabled.'));
      }
      if (data.resource) this.resource(data);
      if (data.fatal) { this.destroy(new Error(data.fatal)); return; }
      if (data.ready) this.resolveReady();
      const waiting = this.pending.get(data.id);
      if (waiting) { this.pending.delete(data.id); data.error ? waiting.reject(new Error(data.error)) : waiting.resolve(data.result); }
    };
    this.abort = () => this.destroy(stopped());
    window.addEventListener('message', this.receive);
    signal?.addEventListener('abort', this.abort, { once: true });
    this.iframe.src = new URL('./capture.html', import.meta.url).href + '#odyssey=' + this.token;
    document.body.append(this.iframe);
    Promise.all([this.isolated, captureDocument(source.href, this.loading.signal)]).then(([, document]) => {
      if (!this.destroyed) this.send({ start: { ...document, request: this.request } });
    }).catch(error => this.destroy(error));
    if (signal?.aborted) this.abort();
  }
  send(data) {
    // Opaque origins require '*'; receive validates both the window and token.
    if (!this.destroyed) this.iframe.contentWindow.postMessage({ odyssey: this.token, budget: this.budget || null, ...data }, '*');
  }
  async resource(data) {
    try {
      const url = new URL(data.url);
      if (url.origin !== location.origin) throw new Error('Capture resources must be on the same website.');
      const response = await fetch(url, { signal: this.loading.signal });
      this.send({ resourceResult: data.resource, body: await response.arrayBuffer(), status: response.status,
        headers: { 'content-type': response.headers.get('content-type') || 'application/octet-stream' } });
    } catch (error) { this.send({ resourceResult: data.resource, error: error.message }); }
  }
  call(command, value) {
    if (this.destroyed) return Promise.reject(this.error || stopped());
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ id, command, value });
    });
  }
  async deadline(ms, stage, operation) {
    const start = performance.now();
    let timer;
    const error = new Error(stage + ' deadline exceeded (' + ms + ' ms).');
    this.budget = { until: performance.timeOrigin + start + ms, error: error.message };
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { this.destroy(error); reject(error); }, ms);
      });
      const result = await Promise.race([timeout, Promise.resolve().then(operation)]);
      if (performance.now() - start > ms) { this.destroy(error); throw error; }
      return result;
    } finally { clearTimeout(timer); this.budget = null; this.send({}); }
  }
  async prepare(ms) {
    return this.deadline(ms, 'Compute', async () => {
      await this.ready;
      let status = await this.call('prepare'), errors = [...status.errors];
      // Tick once even for synchronous sources to flush initial layout/render work.
      do {
        if (this.destroyed) throw this.error || stopped();
        status = await this.call('advance', 1000 / 60); errors.push(...status.errors);
        if (!status.svg || status.busy) await delay(16);
      } while (!status.svg || status.busy);
      return errors;
    });
  }
  async capture(ms, interval) {
    return this.deadline(ms, 'Frame', async () => {
      let status = await this.call('advance', interval), errors = [...status.errors];
      while (status.busy) { await delay(16); status = await this.call('advance', 1000 / 60); errors.push(...status.errors); }
      const capture = await this.call('capture'); capture.errors.unshift(...errors); return capture;
    });
  }
  destroy(error = stopped()) {
    if (this.destroyed) return;
    this.destroyed = true; this.error = error;
    clearInterval(this.probeTimer); this.loading.abort(); this.rejectIsolation(error);
    window.removeEventListener('message', this.receive); this.signal?.removeEventListener('abort', this.abort);
    this.rejectReady(error);
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear(); this.iframe.src = 'about:blank'; this.iframe.remove();
  }
}
export class BrowserOdyssey {
  async open() {
    this.storage = await new OdysseyStorage().open();
    this.catalog = await this.storage.get('preferences', 'catalog') || await readJSON('./catalog.json');
    const bundled = await readJSON('./default-settings.json', clone(DEFAULTS));
    const saved = await this.storage.get('preferences', 'settings') || await readJSON('./output/settings.json', null);
    const revision = bundled.presetRevision;
    // Apply the requested default once, then preserve subsequent edits and imports.
    // Keep the previous preferences as a backup; archived searches retain their settings.
    if (revision && await this.storage.get('preferences', 'defaultPresetRevision') !== revision) {
      await this.storage.transaction('preferences', 'readwrite', store => {
        if (saved) store.put(saved, 'settings-before-' + revision);
        store.put(bundled, 'settings');
        return store.put(revision, 'defaultPresetRevision');
      });
      this.settings = clone(bundled);
    } else this.settings = saved || bundled;
    this.settings = { ...clone(DEFAULTS), ...this.settings };
    this.sessions = new Map((await this.storage.all('sessions')).map(s => [s.id, recover(s)]));
    for (const session of await this.storage.importDirectory()) if (!this.sessions.has(session.id)) this.sessions.set(session.id, recover(session));
    this.active = null; this.crawling = false;
    return this;
  }
  async request(route, value) {
    if (route === 'status') return { online: true, output: this.storage.label, active: this.active?.id || this.starting, crawling: this.crawling,
      crawlProgress: this.crawlProgress, sessions: [...this.sessions.values()].map(summary).sort((a, b) => b.startedAt.localeCompare(a.startedAt)) };
    if (route === 'catalog') return clone(this.catalog);
    if (route === 'settings') {
      if (value === undefined) return clone(this.settings);
      validate(value, this.catalog); this.settings = clone(value); await this.storage.saveSettings(this.settings); return { ok: true };
    }
    if (route.startsWith('session/')) {
      const session = this.sessions.get(route.slice(8)); if (!session) throw new Error('Saved search not found.'); return clone(session);
    }
    if (route === 'start') {
      if (this.active || this.starting || this.crawling) throw new Error('Finish the active search or parameter crawl first.');
      const total = validate(value, this.catalog);
      this.starting = true;
      try {
      this.settings = clone(value);
      if (this.settings.randomizeSeed === true) this.settings.seed = crypto.randomUUID();
      await this.storage.saveSettings(this.settings);
      const session = { id: 'search-' + Date.now() + '-' + crypto.randomUUID().slice(0, 8), clientVersion: 1,
        settings: clone(this.settings), catalog: clone(this.catalog), startedAt: timestamp(), total, cursor: 0, runs: [], status: 'running' };
      this.sessions.set(session.id, session);
      try {
        await this.storage.file(session.id, 'settings.json', json(session.settings));
        await this.storage.manifest(session);
      } catch (error) {
        session.status = 'paused'; session.message = error.message;
        await this.storage.put('sessions', session.id, session).catch(() => {});
        throw error;
      }
      this.launch(session); return summary(session);
      } finally { this.starting = false; }
    }
    if (route === 'crawl') {
      if (this.active || this.crawling) throw new Error('Stop the current search before crawling.');
      this.crawling = true; this.crawlProgress = 'Looking for toolbar-integrated apps?';
      this.crawlTask = this.crawl().catch(error => { this.crawlProgress = error.message; }).finally(() => { this.crawling = false; });
      return { ok: true };
    }
    const session = this.sessions.get(value?.id);
    if (!session) throw new Error('Choose a saved search first.');
    if (route === 'delete-run') return this.deleteRun(session, value.runId);
    if (route === 'pause') {
      if (session.status !== 'running') throw new Error('This search is not running.');
      session.status = 'pausing'; await this.storage.manifest(session);
    } else if (route === 'resume') {
      if (session.status !== 'paused') throw new Error('This search is not paused.');
      if (this.crawling || this.active && this.active !== session) throw new Error('Another search is active.');
      await this.storage.file(session.id, 'settings.json', json(session.settings));
      session.message = ''; session.status = 'running';
      await this.storage.manifest(session);
      if (this.active === session) { this.wake?.(); this.wake = null; } else this.launch(session);
    } else if (route === 'stop') {
      if (!['running', 'pausing', 'paused'].includes(session.status)) throw new Error('This search has already ended.');
      session.status = 'stopped'; session.finishedAt = timestamp();
      if (this.active === session) { this.controller.abort(); this.wake?.(); this.wake = null; }
      await this.storage.manifest(session);
    } else throw new Error('Unknown search action.');
    return summary(session);
  }
  async deleteRun(session, id) {
    const run = listRuns(session).find(run => run.id === id);
    if (!canRemoveRun(run)) throw new Error('Only failed, stopped, interrupted or pending runs can be removed.');
    if (this.active === session && this.currentRun === id) throw new Error('This run is still finishing. Try again after it stops.');
    // Persist the exclusion before file cleanup so it survives reload/resume.
    session.deletedRuns = [...new Set([...(session.deletedRuns || []), id])];
    const stored = session.runs.find(item => item.id === id);
    if (stored) { stored.status = 'deleted'; stored.frames = []; delete stored.requested; delete stored.error; }
    await this.storage.manifest(session);
    await this.storage.removeRun(session.id, id);
    return summary(session);
  }
  launch(session) {
    this.active = session; this.controller = new AbortController();
    this.task = this.execute(session, this.controller.signal);
  }
  async gate(session, signal) {
    if (session.status === 'pausing') { session.status = 'paused'; await this.storage.manifest(session); }
    if (session.status === 'paused') await new Promise(resolve => { this.wake = resolve; });
    if (signal.aborted || session.status === 'stopped') throw stopped();
  }
  async execute(session, signal) {
    let source;
    try {
      let ordinal = 0;
      const settings = session.settings;
      for (const { app, count } of plan(settings, session.catalog)) for (let index = 0; index < count; index++, ordinal++) {
        if (ordinal < session.cursor) continue;
        const id = runId(ordinal);
        await this.gate(session, signal);
        // Recheck after the pause gate: the user may have removed this pending
        // sample while the runner was waiting to resume.
        if (session.deletedRuns?.includes(id)) {
          session.runs[ordinal] = { id, app: app.id, title: app.title, sample: index + 1, status: 'deleted', frames: [] };
          session.cursor = ordinal + 1;
          await this.storage.manifest(session);
          continue;
        }
        this.currentRun = id;
        const values = sample(app, settings, index, count);
        const run = { id, app: app.id, title: app.title, sample: index + 1, requested: values.requested, status: 'running', frames: [], startedAt: timestamp() };
        session.runs[ordinal] = run;
        await this.storage.file(session.id, id + '/requested.json', json(values));
        await this.storage.manifest(session);
        let phase = 'compute';
        try {
          source = new VisualFrame(app.url, { mode: 'run', state: values.state, seed: settings.seed + ':' + app.id + ':' + index,
            width: settings.width, height: settings.height }, signal);
          const initialErrors = await source.prepare(settings.computeMs);
          for (let frame = 0; frame < settings.frames; frame++) {
            phase = 'save'; await this.gate(session, signal); phase = 'compute';
            const capture = await source.capture(settings.frameMs, frame ? settings.intervalMs : 0);
            if (!frame) capture.errors.unshift(...initialErrors);
            const file = id + '/frame-' + String(frame + 1).padStart(5, '0') + '.svg';
            phase = 'save';
            await this.storage.file(session.id, file, capture.svg);
            await this.storage.file(session.id, file.replace('.svg', '.json'), json(capture.state));
            run.frames.push({ index: frame + 1, file, bytes: new Blob([capture.svg]).size, errors: capture.errors, timeMs: capture.timeMs });
            await this.storage.manifest(session);
          }
          run.status = 'complete';
        } catch (error) {
          if (signal.aborted) { run.status = 'stopped'; run.error = 'Search stopped.'; }
          else if (phase === 'save') { run.status = 'interrupted'; throw error; }
          else { run.status = /deadline/.test(error.message) ? 'timeout' : 'failed'; run.error = error.message; }
        } finally { source?.destroy(); source = null; }
        run.finishedAt = timestamp(); session.cursor = ordinal + 1;
        await this.storage.file(session.id, id + '/run.json', json(run));
        await this.storage.manifest(session);
        this.currentRun = null;
        if (signal.aborted) break;
        // Yield between runs so controls and progress can paint.
        await delay(0);
      }
      if (!signal.aborted) { session.status = 'complete'; session.finishedAt = timestamp(); }
    } catch (error) {
      if (!signal.aborted) { session.status = 'paused'; session.message = error.message; }
    } finally {
      source?.destroy(); this.active = null; this.currentRun = null; this.wake = null;
      try { await this.storage.manifest(session); }
      catch (error) { session.message = error.message; await this.storage.put('sessions', session.id, session).catch(() => {}); }
    }
  }
  async chooseDirectory() {
    await this.storage.chooseDirectory();
    const archives = await this.storage.importDirectory();
    for (const session of archives) if (!this.sessions.has(session.id)) {
      recover(session); this.sessions.set(session.id, session); await this.storage.put('sessions', session.id, session);
    }
    // Apply removals made while this archive's output folder was disconnected.
    for (const archive of archives) {
      const session = this.sessions.get(archive.id);
      if (!session.deletedRuns?.length) continue;
      await this.storage.manifest(session);
      for (const id of session.deletedRuns) await this.storage.removeRun(session.id, id);
    }
    await this.storage.saveSettings(this.settings);
  }
  async crawl() {
    const candidates = new Map(this.catalog.apps.map(app => [new URL(app.url, location.href).pathname, app]));
    // Static sites expose their app inventory through their gallery JSON files.
    for (const file of ['/projects.json', '/MathVisuals/projects.json']) {
      for (const item of await readJSON(file, [])) {
        if (!item.link) continue;
        const url = new URL(item.link, new URL(file, location.href));
        if (url.origin !== location.origin || url.pathname.startsWith('/TheOdyssey/') || candidates.has(url.pathname)) continue;
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(10000) }); if (!response.ok) continue;
          const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
          let integrated = false;
          for (const script of doc.querySelectorAll('script[type="module"][src]')) {
            const src = new URL(script.getAttribute('src'), url); if (src.origin !== location.origin) continue;
            const code = await (await fetch(src, { signal: AbortSignal.timeout(10000) })).text();
            if (code.includes('runVisualApp')) { integrated = true; break; }
          }
          if (integrated) candidates.set(url.pathname, { url: url.pathname, title: item.title });
        } catch { /* An unrelated gallery page does not prevent indexing visual apps. */ }
      }
    }
    const catalog = { version: 1, indexedAt: timestamp(), apps: [], failures: [] };
    for (const candidate of candidates.values()) {
      this.crawlProgress = 'Indexing ' + candidate.title;
      let source;
      try {
        source = new VisualFrame(candidate.url, { mode: 'index' });
        const spec = await source.deadline(15000, 'Index', async () => { await source.ready; return source.call('describe'); });
        catalog.apps.push({ ...spec, url: candidate.url, folder: candidate.url.split('/').filter(Boolean).pop() });
      } catch (error) {
        catalog.failures.push({ app: candidate.title, error: error.message });
        if (candidate.params) catalog.apps.push(candidate);
      } finally { source?.destroy(); }
    }
    catalog.apps = [...new Map(catalog.apps.map(app => [app.id, app])).values()];
    catalog.apps.sort((a, b) => a.title.localeCompare(b.title)); this.catalog = catalog;
    await this.storage.put('preferences', 'catalog', catalog); await this.storage.disk('catalog.json', json(catalog));
    this.crawlProgress = catalog.apps.length + ' apps indexed; ' + catalog.failures.length + ' failed (previous controls retained).';
  }
}
