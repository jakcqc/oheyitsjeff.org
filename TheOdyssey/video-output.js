/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Prepare a download without keeping a large finished MP4 in JavaScript memory.
export async function videoOutput(fileHandle) {
  if (fileHandle) return { fileHandle, blob: async () => null, release: async () => {} };
  if (navigator.storage?.getDirectory) {
    let directory;
    try { directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('odyssey-video-downloads', { create: true }); }
    catch { /* Browsers that disable private files use the bounded memory target. */ }
    if (directory) {
      const name = crypto.randomUUID() + '.mp4';
      const temporary = await directory.getFileHandle(name, { create: true });
      return { fileHandle: temporary, blob: () => temporary.getFile(),
        release: () => directory.removeEntry(name).catch(() => {}) };
    }
  }
  return { fileHandle: null, blob: async result => result.blob, release: async () => {} };
}
