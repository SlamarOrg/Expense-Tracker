// Merchant-to-category overrides chosen in the dashboard. They beat every rule for expense rows.
// `saved` is the last exported or imported state, `pending` what the browser remembered since;
// the "unsaved" badge shows the difference. `persist` is called with the full map on every change,
// `persistSaved` with the new baseline whenever it is marked saved (export or import).

const isCategory = (c) => typeof c === 'string' && c !== '' && c !== 'Other';

export function createOverrides({ saved = {}, pending = {}, persist = () => {}, persistSaved = () => {} } = {}) {
  let savedCopy = { ...saved };
  const map = { ...saved, ...pending };
  const api = {
    get: (key) => map[key],
    all: () => ({ ...map }),
    set(key, category) {
      if (isCategory(category)) map[key] = category; else delete map[key];
      persist(api.all());
    },
    remove(key) { api.set(key, null); },
    /** Import a plain object; returns how many entries were added or updated and how many ignored. */
    merge(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('overrides must be a JSON object of merchant to category');
      let added = 0;
      let ignored = 0;
      for (const [k, v] of Object.entries(obj)) { if (isCategory(v)) { map[k] = v; added++; } else ignored++; }
      persist(api.all());
      return { added, ignored };
    },
    unsaved() {
      const out = {};
      for (const k of Object.keys(map)) if (savedCopy[k] !== map[k]) out[k] = map[k];
      for (const k of Object.keys(savedCopy)) if (!(k in map)) out[k] = null;
      return out;
    },
    unsavedCount: () => Object.keys(api.unsaved()).length,
    savedCount: () => Object.keys(savedCopy).length,
    markSaved() { savedCopy = { ...map }; persistSaved({ ...savedCopy }); },
    /** Drop everything (forget my data). */
    reset() { for (const k of Object.keys(map)) delete map[k]; savedCopy = {}; },
    toJSON: () => JSON.stringify(map, Object.keys(map).sort(), 2) + '\n',
  };
  return api;
}

/** Recompute `c` from `c0` and the overrides for every expense row, in place. */
export function applyOverrides(rows, overrides) {
  for (const t of rows) if (t.k === 'expense') t.c = overrides.get(t.m || t.t) || t.c0;
  return rows;
}
