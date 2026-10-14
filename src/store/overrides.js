// Merchant-to-category overrides chosen in the dashboard. They beat every rule for expense rows.
// `saved` is the last exported or imported state, `pending` what the browser remembered since;
// the "unsaved" badge shows the difference. `persist` is called with the full map on every change,
// `persistSaved` with the new baseline whenever it is marked saved (export or import).
//
// Merchant names come from statements and imported files, so they are kept in a Map: a merchant
// called "constructor" or "__proto__" must not read an inherited Object.prototype member.
// Plain objects appear only at the edges (persist, all(), toJSON) via Object.fromEntries, which
// creates own properties for every key.

const isCategory = (c) => typeof c === 'string' && c !== '' && c !== 'Other';
const toMap = (obj) => new Map(Object.entries(obj || {}));

export function createOverrides({ saved = {}, pending = {}, persist = () => {}, persistSaved = () => {} } = {}) {
  let savedCopy = toMap(saved);
  const map = new Map([...toMap(saved), ...toMap(pending)]);
  const api = {
    get: (key) => map.get(key),
    all: () => Object.fromEntries(map),
    set(key, category) {
      if (isCategory(category)) map.set(key, category); else map.delete(key);
      persist(api.all());
    },
    remove(key) { api.set(key, null); },
    /** Import a plain object; returns how many entries were added or updated and how many ignored. */
    merge(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('overrides must be a JSON object of merchant to category');
      let added = 0;
      let ignored = 0;
      for (const [k, v] of Object.entries(obj)) { if (isCategory(v)) { map.set(k, v); added++; } else ignored++; }
      persist(api.all());
      return { added, ignored };
    },
    unsaved() {
      const out = new Map();
      for (const [k, v] of map) if (savedCopy.get(k) !== v) out.set(k, v);
      for (const k of savedCopy.keys()) if (!map.has(k)) out.set(k, null);
      return Object.fromEntries(out);
    },
    unsavedCount: () => Object.keys(api.unsaved()).length,
    savedCount: () => savedCopy.size,
    markSaved() { savedCopy = new Map(map); persistSaved(Object.fromEntries(savedCopy)); },
    /** Drop everything (forget my data). */
    reset() { map.clear(); savedCopy = new Map(); },
    toJSON: () => { const obj = api.all(); return JSON.stringify(obj, Object.keys(obj).sort(), 2) + '\n'; },
  };
  return api;
}

/** Recompute `c` from `c0` and the overrides for every expense row, in place. */
export function applyOverrides(rows, overrides) {
  for (const t of rows) if (t.k === 'expense') t.c = overrides.get(t.m || t.t) || t.c0;
  return rows;
}
