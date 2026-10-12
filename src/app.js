// Wires store, import flow, classifier, overrides and dashboard together.
//
// Normal mode: data lives in this browser's IndexedDB; statements are imported by drag and drop
// or the file picker. Demo mode (?demo=1, or the GitHub Pages build): a memory store preloaded
// with the fake sample statements, nothing persists. ?theme=dark forces a theme (render check).

import defaultRules from '../rules/default-cz.json' with { type: 'json' };
import sampleSettings from '../samples/sample-settings.json' with { type: 'json' };
import { mountDashboard } from './ui/dashboard.js';
import { setupImport, readFiles, renderImportResults, setNotice } from './ui/import.js';
import { setupSettings } from './ui/settings.js';
import { setupTheme, setTheme } from './ui/theme.js';
import { detectLanguage, setLanguage, getLanguage, translateStatic, t, tn } from './i18n/index.js';
import { Rules } from './classifier/rules.js';
import { createOverrides } from './store/overrides.js';
import { openStore } from './store/db.js';
import { importFiles, loadTransactions, sourcesFromImports, forgetAll } from './import-flow.js';
import { mergeAccounts } from './settings-model.js';
import { getSampleFiles } from './samples-source.js';
import { loadPdfjs } from './pdfjs-loader.js';

const params = new URLSearchParams(location.search);
const DEMO = globalThis.BSD_DEMO === true || params.get('demo') === '1';
const clone = (v) => JSON.parse(JSON.stringify(v));
const ignore = () => {};

const app = { store: null, rulesJson: null, rules: null, overrides: null, dashboard: null, importUi: null, panel: null, noticeKey: null };

/** Show the import panel and remember how, so a language switch can render it again. */
function showPanel(render) { app.panel = render; render(); }

function showNotice(key, opts) { app.noticeKey = key ? [key, opts] : null; setNotice(key ? t(key) : '', opts); }

function applyUrlParams() {
  const theme = params.get('theme');
  if (theme) setTheme(theme);
  setLanguage(params.get('lang') || detectLanguage(), { persist: Boolean(params.get('lang')) });
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
  const warnings = app.rules.warnings.slice();
  showPanel(() => renderImportResults({ results, warnings, title: title ? t(title) : undefined }));
  return results;
}

async function handleFiles(fileList) {
  showPanel(() => renderImportResults({ busy: tn('import.busy', fileList.length) }));
  try {
    await importReadFiles(await readFiles(fileList));
  } catch (e) {
    const error = String(e && e.message ? e.message : e);
    showPanel(() => renderImportResults({ results: [{ name: t('import.failed'), error }] }));
  }
}

/** Import the fake sample statements, with the fake accounts they need to classify fully. */
async function loadSamples() {
  showPanel(() => renderImportResults({ busy: t('import.busySamples'), title: t('import.samplesTitle') }));
  try {
    app.rulesJson = mergeAccounts(app.rulesJson, sampleSettings);
    await app.store.setSetting('rules', app.rulesJson);
    await importReadFiles(await getSampleFiles(), 'import.samplesTitle');
  } catch (e) {
    const error = String(e && e.message ? e.message : e);
    showPanel(() => renderImportResults({ results: [{ name: t('import.samplesTitle'), error }], title: t('import.samplesTitle') }));
  }
}

function markLanguage() {
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langBtn === getLanguage())));
}

function setupLanguage() {
  markLanguage();
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.langBtn === getLanguage()) return;
    setLanguage(b.dataset.langBtn);
    markLanguage();
    translateStatic();
    if (app.importUi) app.importUi.relabel();
    if (app.noticeKey) setNotice(t(app.noticeKey[0]), app.noticeKey[1]);
    if (app.panel && !document.getElementById('importPanel').hidden) app.panel();
    await refresh();
  }));
}

async function main() {
  applyUrlParams();
  translateStatic();
  setupLanguage();
  setupTheme(() => { if (app.dashboard) app.dashboard.renderAll(); });
  app.store = await openStore({ backend: DEMO ? 'memory' : 'indexeddb' });
  if (DEMO) showNotice('notice.demo');
  else if (app.store.fallbackReason) { console.warn(app.store.fallbackReason); showNotice('notice.noStorage', { warn: true }); }

  app.rulesJson = (await app.store.getSetting('rules', null)) || clone(defaultRules);
  app.overrides = createOverrides({
    saved: await app.store.getSetting('overridesSaved', {}),
    pending: await app.store.getSetting('overrides', {}),
    persist: (map) => { app.store.setSetting('overrides', map).catch(ignore); },
    persistSaved: (map) => { app.store.setSetting('overridesSaved', map).catch(ignore); },
  });
  app.importUi = setupImport({ onFiles: handleFiles, onSamples: loadSamples });
  setupSettings({
    getState: async () => ({ rulesJson: app.rulesJson, defaults: defaultRules, imports: await app.store.listImports() }),
    onSave: async (rulesJson) => {
      app.rulesJson = rulesJson;
      await app.store.setSetting('rules', rulesJson);
      await refresh();
    },
    onForget: async () => {
      await forgetAll(app.store);
      app.rulesJson = clone(defaultRules);
      app.overrides.reset();
      document.getElementById('importPanel').hidden = true;
      await refresh();
    },
  });

  if (DEMO) {
    await loadSamples();
    document.getElementById('importPanel').hidden = true;
  } else {
    await refresh();
  }
}

main();
