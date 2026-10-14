// In-memory store backend: used by Node tests, by the demo build and as the fallback when
// IndexedDB is unavailable. Same contract as indexeddb.js.

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function createMemoryBackend() {
  let rows = new Map();
  let imports = [];
  let settings = new Map();
  return {
    backend: 'memory',
    async putRows(newRows, meta) {
      let added = 0;
      let skipped = 0;
      for (const r of newRows) {
        if (rows.has(r.id)) { skipped++; continue; }
        rows.set(r.id, clone(r));
        added++;
      }
      imports.push({ id: imports.length + 1, ...clone(meta), added, skipped, at: new Date().toISOString() });
      return { added, skipped };
    },
    async allRows() { return [...rows.values()].map(clone); },
    async listImports() { return imports.map(clone); },
    async getSetting(key, fallback) { return settings.has(key) ? clone(settings.get(key)) : fallback; },
    async setSetting(key, value) { settings.set(key, clone(value)); },
    async allSettings() { const o = {}; for (const [k, v] of settings) o[k] = clone(v); return o; },
    async clear() { rows = new Map(); imports = []; settings = new Map(); },
    async snapshot() { return { rows: [...rows.values()].map(clone), imports: imports.map(clone), settings: Object.fromEntries([...settings].map(([k, v]) => [k, clone(v)])) }; },
    async restore(snap) {
      rows = new Map(snap.rows.map((r) => [r.id, clone(r)]));
      imports = snap.imports.map(clone);
      settings = new Map(Object.entries(snap.settings).map(([k, v]) => [k, clone(v)]));
    },
  };
}
