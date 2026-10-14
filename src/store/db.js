// Store facade. `openStore({ backend })` returns the same async contract for both backends:
//   putRows(rawRows, importMeta) -> { added, skipped }   (ids already stored are skipped)
//   allRows() -> RawRow[] in insertion order
//   listImports() -> [{ id, file, bank, added, skipped, at, ... }]
//   getSetting(key, fallback), setSetting(key, value), allSettings()
//   clear()
//   snapshot() -> { rows, imports, settings }; restore(snapshot) replaces everything with it
//     (moves the open session between IndexedDB and memory when "don't remember" changes)
// The IndexedDB backend falls back to memory when IndexedDB cannot be opened (private windows,
// blocked storage, Node); `fallbackReason` says why so the UI can warn that data will not persist.

import { createMemoryBackend } from './memory.js';
import { createIndexedDbBackend } from './indexeddb.js';

export async function openStore({ backend = 'indexeddb', indexedDB = globalThis.indexedDB } = {}) {
  if (backend === 'memory') return createMemoryBackend();
  if (backend !== 'indexeddb') throw new Error(`unknown store backend: ${backend}`);
  try {
    if (!indexedDB) throw new Error('IndexedDB is not available in this environment');
    return await createIndexedDbBackend(indexedDB);
  } catch (e) {
    const mem = createMemoryBackend();
    mem.fallbackReason = `IndexedDB unavailable (${e && e.message ? e.message : e}); data will not survive a reload`;
    return mem;
  }
}
