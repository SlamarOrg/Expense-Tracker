// Import UI: file picker, drag and drop anywhere on the page, and the per-file result cards.
// All parsing and storing happens in import-flow.js; this module only reads files and renders.

import { el, clear } from './dom.js';
import * as i18n from '../i18n/index.js';

/** Read browser File objects into { name, bytes }. */
export async function readFiles(files) {
  return Promise.all([...files].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

/**
 * @param {{onFiles: (files: File[]) => void, onSamples: () => void}} handlers
 */
export function setupImport({ onFiles, onSamples }) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.csv,.pdf,text/csv,application/pdf';
  input.className = 'srhide';
  input.setAttribute('aria-label', i18n.t('import.inputLabel'));
  document.body.appendChild(input);
  const pick = () => input.click();
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.value = '';
    if (files.length) onFiles(files);
  });
  document.getElementById('importBtn').addEventListener('click', pick);

  // the empty-state buttons; re-rendered when the language changes
  function relabel() {
    input.setAttribute('aria-label', i18n.t('import.inputLabel'));
    const actions = clear(document.getElementById('emptyActions'));
    const choose = el('button', 'btn primary', i18n.t('empty.choose'));
    choose.type = 'button';
    choose.addEventListener('click', pick);
    actions.appendChild(choose);
    const samples = el('button', 'btn', i18n.t('empty.samples'));
    samples.type = 'button';
    samples.id = 'samplesBtn';
    samples.addEventListener('click', onSamples);
    actions.appendChild(samples);
  }
  relabel();

  // Drag and drop anywhere. dragenter/dragleave fire for every child element, so count depth.
  const overlay = document.getElementById('dropOverlay');
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; overlay.hidden = false; });
  document.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files);
  });
  return { relabel };
}

const fmt = (n) => (n === null || n === undefined ? '?' : Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function fileCard(r) {
  const card = el('div', 'file' + (r.error ? ' error' : ''));
  card.appendChild(el('div', 'name', r.name));
  if (r.error) {
    card.appendChild(el('div', 'meta warn', r.code === 'unknown-format' ? i18n.t('import.unknownFile') : r.error));
    return card;
  }
  card.appendChild(el('div', 'meta', i18n.t('import.fileMeta', { bank: r.bank, rows: r.rows, added: r.added, skipped: r.skipped })));
  const kinds = Object.entries(r.kinds || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${i18n.t('import.kind.' + k)}`).join(', ');
  if (kinds) card.appendChild(el('div', 'meta', kinds));
  if (r.totals) {
    const t = r.totals;
    card.appendChild(el('div', t.ok ? 'meta ok' : 'meta warn', t.ok
      ? i18n.t('import.debitsOk', { amount: fmt(t.debits) })
      : i18n.t('import.debitsBad', { printed: fmt(t.debits), parsed: fmt(t.parsedDebits) })));
  }
  if (r.problems && r.problems.length) {
    card.appendChild(el('div', 'meta warn', i18n.tn('import.problems', r.problems.length)));
    const ul = el('ul');
    for (const p of r.problems.slice(0, 5)) ul.appendChild(el('li', null, p));
    card.appendChild(ul);
  }
  return card;
}

/**
 * Show the result of an import, or a busy message while files are being read.
 * @param {{results?: object[], busy?: string, warnings?: string[], title?: string}} opts
 */
export function renderImportResults({ results = [], busy = '', warnings = [], title = i18n.t('import.title') } = {}) {
  const panel = clear(document.getElementById('importPanel'));
  panel.hidden = false;
  const head = el('div', 'card-head');
  const left = el('div');
  left.appendChild(el('h2', null, title));
  if (busy) left.appendChild(el('p', 'hint', busy));
  else {
    const added = results.reduce((a, r) => a + (r.added || 0), 0);
    const failed = results.filter((r) => r.error).length;
    left.appendChild(el('p', 'hint', i18n.tn('import.summary', results.length, { added }) + (failed ? i18n.t('import.notRecognized', { n: failed }) : '')));
  }
  head.appendChild(left);
  const close = el('button', 'btn', '×');
  close.type = 'button';
  close.title = i18n.t('import.close');
  close.setAttribute('aria-label', i18n.t('import.close'));
  close.addEventListener('click', () => { panel.hidden = true; });
  head.appendChild(close);
  panel.appendChild(head);
  if (results.length) {
    const grid = el('div', 'files');
    for (const r of results) grid.appendChild(fileCard(r));
    panel.appendChild(grid);
  }
  for (const w of warnings) panel.appendChild(el('div', 'warnings', w));
}

/** Banner at the top of the page; empty text hides it. */
export function setNotice(text, { warn = false } = {}) {
  const n = document.getElementById('notice');
  n.textContent = text || '';
  n.className = 'notice' + (warn ? ' warn' : '');
  n.hidden = !text;
}
