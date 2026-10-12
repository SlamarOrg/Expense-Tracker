// Wires store, import flow, classifier, overrides and dashboard together.
//
// Normal mode: data lives in this browser's IndexedDB; statements are imported by drag and drop
// or the file picker. Demo mode (?demo=1, or the GitHub Pages build): a memory store preloaded
// with the fake sample statements, nothing persists. ?theme=dark forces a theme (render check).

import defaultRules from '../rules/default-cz.json' with { type: 'json' };
import sampleSettings from '../samples/sample-settings.json' with { type: 'json' };
import { mountDashboard } from './ui/dashboard.js';
import { setupImport, readFiles, renderImportResults, setNotice } from './ui/import.js';
import { Rules } from './classifier/rules.js';
import { createOverrides } from './store/overrides.js';
import { openStore } from './store/db.js';
import { importFiles, loadTransactions, sourcesFromImports } from './import-flow.js';
import { mergeAccounts } from './settings-model.js';
import { getSampleFiles } from './samples-source.js';
import { loadPdfjs } from './pdfjs-loader.js';

const params = new URLSearchParams(location.search);
const DEMO = globalThis.BSD_DEMO === true || params.get('demo') === '1';
const clone = (v) => JSON.parse(JSON.stringify(v));
const ignore = () => {};

const app = { store: null, rulesJson: null, rules: null, overrides: null, dashboard: null };

function applyUrlParams() {
  const theme = params.get('theme');
  if (theme && ['auto', 'light', 'dark'].includes(theme)) { try { localStorage.setItem('spend-theme', theme); } catch { /* ignore */ } }
}

/** Re-classify every stored row with the current rules and remount the dashboard. */
async function refresh() {
  app.rules = Rules.from(app.rulesJson);
  const tx = await loadTransactions(app.store, app.rules);
  const imports = await app.store.listImports();
  if (app.dashboard) { app.dashboard.destroy(); app.dashboard = null; }
  app.dashboard = mountDashboard({
    tx,
    categories: app.rules.categoryNames,
    folded: app.rules.folded,
    fx: app.rules.fx,
    overridesStore: app.overrides,
    meta: { generated: imports.length ? imports[imports.length - 1].at : '', sources: sourcesFromImports(imports) },
  });
}

async function importReadFiles(files, title) {
  const results = await importFiles(files, { store: app.store, rules: Rules.from(app.rulesJson), pdfjs: await loadPdfjs() });
  await refresh();
  renderImportResults({ results, warnings: app.rules.warnings, title });
  return results;
}

async function handleFiles(fileList) {
  renderImportResults({ busy: `Reading ${fileList.length} file${fileList.length === 1 ? '' : 's'}…` });
  try {
    await importReadFiles(await readFiles(fileList));
  } catch (e) {
    renderImportResults({ results: [{ name: 'Import failed', error: String(e && e.message ? e.message : e) }] });
  }
}

/** Import the fake sample statements, with the fake accounts they need to classify fully. */
async function loadSamples() {
  renderImportResults({ busy: 'Loading the sample statements…', title: 'Sample data' });
  try {
    app.rulesJson = mergeAccounts(app.rulesJson, sampleSettings);
    await app.store.setSetting('rules', app.rulesJson);
    await importReadFiles(await getSampleFiles(), 'Sample data');
  } catch (e) {
    renderImportResults({ results: [{ name: 'Sample data', error: String(e && e.message ? e.message : e) }] });
  }
}

async function main() {
  applyUrlParams();
  app.store = await openStore({ backend: DEMO ? 'memory' : 'indexeddb' });
  if (DEMO) setNotice('Demo with fake sample data. Nothing you import here is saved. Download the dashboard to use it with your own statements.');
  else if (app.store.fallbackReason) setNotice(app.store.fallbackReason, { warn: true });

  app.rulesJson = (await app.store.getSetting('rules', null)) || clone(defaultRules);
  app.overrides = createOverrides({
    saved: await app.store.getSetting('overridesSaved', {}),
    pending: await app.store.getSetting('overrides', {}),
    persist: (map) => { app.store.setSetting('overrides', map).catch(ignore); },
    persistSaved: (map) => { app.store.setSetting('overridesSaved', map).catch(ignore); },
  });
  setupImport({ onFiles: handleFiles, onSamples: loadSamples });

  if (DEMO) {
    await loadSamples();
    document.getElementById('importPanel').hidden = true;
  } else {
    await refresh();
  }
}

main();
