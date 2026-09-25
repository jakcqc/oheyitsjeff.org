/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
// Store the original file separately from shared settings and SVG exports.
function withImageStore(mode, operation) {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('imageToSVG', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Image cache is unavailable.')); };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      try {
        const transaction = db.transaction('images', mode);
        const result = operation(transaction.objectStore('images'));
        transaction.oncomplete = () => { db.close(); resolve(result.result); };
        transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Image cache transaction failed.')); };
      } catch (error) { db.close(); reject(error); }
    };
  });
}

// Preserve ordering when a new upload or sample supersedes a pending write.
let pending = Promise.resolve();
function queue(mode, operation) {
  const result = pending.then(() => withImageStore(mode, operation));
  pending = result.catch(() => {});
  return result;
}
export const readCachedImage = () => queue('readonly', store => store.get('source'));
export const cacheImage = file => queue('readwrite', store => store.put(file, 'source'));
export const clearCachedImage = () => queue('readwrite', store => store.delete('source'));
