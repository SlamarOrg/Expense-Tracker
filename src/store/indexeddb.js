// IndexedDB store backend. Database "bank-statement-dashboard", schema version 1:
//   rows     keyPath "id"  (RawRow plus `seq` for insertion order), index "seq"
//   imports  keyPath "id"  autoIncrement: { file, bank, added, skipped, at, ... }
//   settings keyPath "key": { key, value }
// Same contract as memory.js. All data stays in this browser profile.

export const DB_NAME = 'bank-statement-dashboard';
export const DB_VERSION = 1;

const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('transaction aborted')); });

export async function createIndexedDbBackend(indexedDB) {
  if (!indexedDB) throw new Error('IndexedDB is not available');
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('rows')) db.createObjectStore('rows', { keyPath: 'id' }).createIndex('seq', 'seq');
    if (!db.objectStoreNames.contains('imports')) db.createObjectStore('imports', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
  };
  open.onblocked = () => { /* another tab holds an old version open; the request will wait */ };
  const db = await req(open);

  const strip = (r) => { const { seq, ...rest } = r; return rest; };

  return {
    backend: 'indexeddb',
    async putRows(newRows, meta) {
      const tx = db.transaction(['rows', 'imports'], 'readwrite');
      const rows = tx.objectStore('rows');
      let seq = await req(rows.count());
      let added = 0;
      let skipped = 0;
      for (const r of newRows) {
        const exists = await req(rows.getKey(r.id));
        if (exists !== undefined) { skipped++; continue; }
        rows.add({ ...r, seq: seq++ });
        added++;
      }
      tx.objectStore('imports').add({ ...meta, added, skipped, at: new Date().toISOString() });
      await done(tx);
      return { added, skipped };
    },
    async allRows() {
      const tx = db.transaction('rows', 'readonly');
      const all = await req(tx.objectStore('rows').index('seq').getAll());
      return all.map(strip);
    },
    async listImports() {
      const tx = db.transaction('imports', 'readonly');
      return req(tx.objectStore('imports').getAll());
    },
    async getSetting(key, fallback) {
      const tx = db.transaction('settings', 'readonly');
      const rec = await req(tx.objectStore('settings').get(key));
      return rec ? rec.value : fallback;
    },
    async setSetting(key, value) {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key, value });
      await done(tx);
    },
    async allSettings() {
      const tx = db.transaction('settings', 'readonly');
      const all = await req(tx.objectStore('settings').getAll());
      const o = {};
      for (const rec of all) o[rec.key] = rec.value;
      return o;
    },
    async clear() {
      const tx = db.transaction(['rows', 'imports', 'settings'], 'readwrite');
      for (const name of ['rows', 'imports', 'settings']) tx.objectStore(name).clear();
      await done(tx);
    },
    async snapshot() {
      return { rows: await this.allRows(), imports: await this.listImports(), settings: await this.allSettings() };
    },
    /** Replace everything with a snapshot in one transaction. */
    async restore(snap) {
      const tx = db.transaction(['rows', 'imports', 'settings'], 'readwrite');
      for (const name of ['rows', 'imports', 'settings']) tx.objectStore(name).clear();
      snap.rows.forEach((r, seq) => tx.objectStore('rows').add({ ...r, seq }));
      for (const i of snap.imports) tx.objectStore('imports').add(i);
      for (const [key, value] of Object.entries(snap.settings)) tx.objectStore('settings').put({ key, value });
      await done(tx);
    },
  };
}
