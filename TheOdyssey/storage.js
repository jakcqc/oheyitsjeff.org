/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
const encoder = new TextEncoder();
export const json = value => JSON.stringify(value, null, 2) + '\n';
export function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function parts(path) {
  const result = path.split('/');
  if (result.some(p => !p || p === '.' || p === '..' || /[\\\x00]/.test(p))) throw new Error('Invalid archive path.');
  return result;
}
export class OdysseyStorage {
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('the-odyssey', 1);
      request.onupgradeneeded = () => {
        for (const name of ['preferences', 'sessions', 'files']) request.result.createObjectStore(name);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close older Odyssey tabs to update browser storage.'));
    });
    this.previousDirectory = await this.get('preferences', 'directoryName');
    return this;
  }
  transaction(store, mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(store, mode), request = operation(transaction.objectStore(store));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || request.error || new Error('Browser storage failed.'));
    });
  }
  get(store, key) { return this.transaction(store, 'readonly', s => s.get(key)); }
  put(store, key, value) { return this.transaction(store, 'readwrite', s => s.put(value, key)); }
  all(store) { return this.transaction(store, 'readonly', s => s.getAll()); }
  get label() { return this.directory ? 'Saving to ' + this.directory.name + ' and this browser' : 'Saving in this browser. ' + (this.previousDirectory ? 'Reconnect ' + this.previousDirectory + ' with Choose output folder to resume disk saves.' : 'Choose an output folder for automatic disk saves.'); }
  async chooseDirectory() {
    if (!window.showDirectoryPicker) throw new Error('This browser supports downloads instead of folder access. Use Export settings JSON and Download search ZIP.');
    // Called directly from the user's button, before any asynchronous work.
    const directory = await window.showDirectoryPicker({ id: 'odyssey-output', mode: 'readwrite' });
    await this.put('preferences', 'directoryName', directory.name);
    this.previousDirectory = directory.name;
    this.directory = directory;
    return directory;
  }
  async fileHandle(path, create = false) {
    if (!this.directory) throw new Error('Reconnect the output folder to read this file.');
    const names = parts(path), name = names.pop();
    let dir = this.directory;
    for (const part of names) dir = await dir.getDirectoryHandle(part, { create });
    return dir.getFileHandle(name, { create });
  }
  disk(path, value) {
    if (!this.directory) return Promise.resolve();
    this.writes ||= new Map();
    const write = (this.writes.get(path) || Promise.resolve()).catch(() => {}).then(() => this.writeDisk(path, value));
    this.writes.set(path, write);
    write.finally(() => { if (this.writes.get(path) === write) this.writes.delete(path); }).catch(() => {});
    return write;
  }
  async writeDisk(path, value) {
    try {
      const handle = await this.fileHandle(path, true), writable = await handle.createWritable();
      try { await writable.write(value); await writable.close(); }
      catch (error) { await writable.abort().catch(() => {}); throw error; }
    } catch (error) { throw new Error('Disk save failed; data remains in this browser. Reconnect the output folder: ' + error.message); }
  }
  async saveSettings(settings) {
    await this.put('preferences', 'settings', settings);
    await this.disk('odyssey-settings.json', json(settings));
  }
  async manifest(session) {
    // IDB clones immediately. Capture disk text now too, before the next frame changes the manifest.
    const text = json(session);
    await this.put('sessions', session.id, session);
    await this.disk(session.id + '/manifest.json', text);
  }
  async file(sessionId, path, value) {
    parts(sessionId + '/' + path);
    const blob = value instanceof Blob ? value : new Blob([value], { type: path.endsWith('.svg') ? 'image/svg+xml' : 'application/json' });
    await this.put('files', sessionId + '/' + path, blob);
    await this.disk(sessionId + '/' + path, blob);
  }
  async read(sessionId, path) {
    parts(sessionId + '/' + path);
    const cached = await this.get('files', sessionId + '/' + path);
    if (cached) return cached;
    const file = await (await this.fileHandle(sessionId + '/' + path)).getFile();
    await this.put('files', sessionId + '/' + path, file);
    return file;
  }
  async removeRun(sessionId, runId) {
    if (!/^search-[a-zA-Z0-9-]+$/.test(sessionId) || !/^run-\d{6}$/.test(runId)) throw new Error('Invalid run to remove.');
    const prefix = sessionId + '/' + runId + '/';
    await this.transaction('files', 'readwrite', store => store.delete(IDBKeyRange.bound(prefix, prefix + '\uffff')));
    if (!this.directory) return;
    // Only remove this exact run directory inside the user-selected folder.
    try {
      await Promise.all([...this.writes || []].filter(([path]) => path.startsWith(prefix)).map(([, write]) => write.catch(() => {})));
      const search = await this.directory.getDirectoryHandle(sessionId);
      await search.removeEntry(runId, { recursive: true });
    } catch (error) {
      if (error.name !== 'NotFoundError') throw new Error('Run removed from this browser; reconnect the output folder to finish deleting its disk files: ' + error.message);
    }
  }
  async importDirectory() {
    const sessions = [];
    if (!this.directory) return sessions;
    for await (const [name, handle] of this.directory.entries()) {
      if (handle.kind !== 'directory' || !/^search-[a-zA-Z0-9-]+$/.test(name)) continue;
      try {
        const session = JSON.parse(await (await (await handle.getFileHandle('manifest.json')).getFile()).text());
        if (session.id !== name || !Array.isArray(session.runs) || !session.settings || !session.catalog?.apps) continue;
        sessions.push(session);
      } catch { /* Ignore unrelated/incomplete directories. */ }
    }
    return sessions;
  }
  async exportSearch(session) {
    const files = [ ['settings.json', json(session.settings)], ['manifest.json', json(session)] ];
    for (const run of session.runs) {
      if (run.status === 'deleted' || session.deletedRuns?.includes(run.id)) continue;
      files.push([run.id + '/run.json', json(run)]);
      files.push([run.id + '/requested.json', await this.read(session.id, run.id + '/requested.json').catch(() => new Blob([json({ requested: run.requested })]))]);
      for (const frame of run.frames) {
        files.push([frame.file, await this.read(session.id, frame.file)]);
        const stateFile = frame.file.replace(/\.svg$/, '.json');
        files.push([stateFile, await this.read(session.id, stateFile)]);
      }
    }
    return zip(files);
  }
  async copySearch(session) {
    if (!this.directory) throw new Error('Choose an output folder first.');
    // Export also works for searches generated before a folder was selected.
    await this.disk(session.id + '/settings.json', json(session.settings));
    for (const run of session.runs) {
      if (run.status === 'deleted' || session.deletedRuns?.includes(run.id)) continue;
      await this.disk(session.id + '/' + run.id + '/run.json', json(run));
      const requested = await this.read(session.id, run.id + '/requested.json').catch(() => new Blob([json({ requested: run.requested })]));
      await this.disk(session.id + '/' + run.id + '/requested.json', requested);
      for (const frame of run.frames) for (const file of [frame.file, frame.file.replace(/\.svg$/, '.json')]) {
        await this.disk(session.id + '/' + file, await this.read(session.id, file));
      }
    }
    await this.manifest(session);
    for (const id of session.deletedRuns || []) await this.removeRun(session.id, id);
  }
}
// Standard uncompressed ZIP, requiring no network library or server.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export async function zip(files) {
  if (files.length > 65535) throw new Error('This archive is too large for ZIP export. Save it to an output folder.');
  const chunks = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const [path, value] of files) {
    const name = encoder.encode(path), data = value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : encoder.encode(value);
    if (offset + data.length > 0xffffffff) throw new Error('This archive exceeds 4 GB. Save it to an output folder.');
    let crc = 0xffffffff;
    for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true); view.setUint32(14, crc, true); view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true); view.setUint16(26, name.length, true); header.set(name, 30);
    chunks.push(header, data);
    const entry = new Uint8Array(46 + name.length), cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); entry.set(name, 46);
    directory.push(entry); directorySize += entry.length; offset += header.length + data.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
}
