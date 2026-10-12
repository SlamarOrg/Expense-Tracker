// Wires parsers, classifier, overrides and dashboard together. Development version: loads the
// three sample statements over the dev server, parses and classifies them, and mounts the
// dashboard. `?empty=1` shows the empty state, `?theme=dark` forces a theme (render check).

import { mountDashboard } from './ui/dashboard.js';
import { parseFile, dedupe, FORMATS } from './parsers/index.js';
import { Rules } from './classifier/rules.js';
import { classify } from './classifier/classify.js';
import { createOverrides } from './store/overrides.js';
import { loadPdfjs } from './pdfjs-loader.js';

const SAMPLES = ['samples/fio-sample.csv', 'samples/revolut-sample.csv', 'samples/airbank-sample.pdf'];
const OVERRIDES_KEY = 'spend-overrides';

async function fetchJson(path) { return (await fetch(path)).json(); }

function urlParams() { return new URLSearchParams(location.search); }

function applyUrlParams() {
  // ?theme=dark lets the headless render check force a theme; the dashboard reads it from storage
  const theme = urlParams().get('theme');
  if (theme && ['auto', 'light', 'dark'].includes(theme)) { try { localStorage.setItem('spend-theme', theme); } catch { /* ignore */ } }
}

function overridesStore() {
  let pending = {};
  try { pending = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}'); } catch { /* ignore */ }
  return createOverrides({ saved: {}, pending, persist: (map) => { try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map)); } catch { /* ignore */ } } });
}

async function loadSamples(rules, pdfjs) {
  const sources = [];
  const raw = [];
  for (const path of SAMPLES) {
    const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer());
    const name = path.split('/').pop();
    const res = await parseFile({ name, bytes }, { pdfjs });
    if (res.error) { console.error(res.error); continue; }
    const s = res.summary;
    sources.push({ bank: FORMATS[res.format].bank, file: name, rows: res.rows.length,
      debits_match: s.ok, statement_debits: s.debits, parsed_debits: s.parsedDebits, unparsed_blocks: (s.problems || []).length });
    raw.push(...res.rows);
  }
  const { rows } = dedupe(raw);
  const tx = rows.map((r) => classify(r, rules)).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { tx, sources };
}

async function main() {
  applyUrlParams();
  const base = JSON.parse(JSON.stringify(await fetchJson('rules/default-cz.json')));
  const sampleSettings = await fetchJson('samples/sample-settings.json');
  for (const key of ['own_accounts', 'investment_accounts', 'category_accounts']) base[key] = { ...(base[key] || {}), ...(sampleSettings[key] || {}) };
  const rules = Rules.from(base);
  const overrides = overridesStore();

  let data = { tx: [], sources: [] };
  if (urlParams().get('empty') !== '1') data = await loadSamples(rules, await loadPdfjs());
  mountDashboard({
    tx: data.tx,
    categories: rules.categoryNames,
    folded: rules.folded,
    fx: rules.fx,
    overridesStore: overrides,
    meta: { generated: new Date().toISOString().slice(0, 19), sources: data.sources },
  });
}

main();
