// Import UI: file picker, drag and drop anywhere on the page, and the per-file result cards.
// All parsing and storing happens in import-flow.js; this module only reads files and renders.

import { el, clear } from './dom.js';

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
  input.setAttribute('aria-label', 'Choose statement files');
  document.body.appendChild(input);
  const pick = () => input.click();
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.value = '';
    if (files.length) onFiles(files);
  });
  document.getElementById('importBtn').addEventListener('click', pick);

  const actions = clear(document.getElementById('emptyActions'));
  const choose = el('button', 'btn primary', 'Choose files');
  choose.type = 'button';
  choose.addEventListener('click', pick);
  actions.appendChild(choose);
  const samples = el('button', 'btn', 'Try with sample data');
  samples.type = 'button';
  samples.addEventListener('click', onSamples);
  actions.appendChild(samples);

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
}

const fmt = (n) => (n === null || n === undefined ? '?' : Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const KIND_LABEL = { expense: 'spending', investment: 'investments', transfer: 'transfers', income: 'income', skip: 'skipped' };

function fileCard(r) {
  const card = el('div', 'file' + (r.error ? ' error' : ''));
  card.appendChild(el('div', 'name', r.name));
  if (r.error) {
    card.appendChild(el('div', 'meta warn', r.error));
    return card;
  }
  card.appendChild(el('div', 'meta', `${r.bank} · ${r.rows} rows · ${r.added} new · ${r.skipped} already imported`));
  const kinds = Object.entries(r.kinds || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${KIND_LABEL[k] || k}`).join(', ');
  if (kinds) card.appendChild(el('div', 'meta', kinds));
  if (r.totals) {
    const t = r.totals;
    card.appendChild(el('div', t.ok ? 'meta ok' : 'meta warn', t.ok
      ? `Debit total matches the statement (${fmt(t.debits)} Kč) ✓`
      : `Debit total does NOT match the statement: printed ${fmt(t.debits)}, parsed ${fmt(t.parsedDebits)}`));
  }
  if (r.problems && r.problems.length) {
    card.appendChild(el('div', 'meta warn', `${r.problems.length} block${r.problems.length === 1 ? '' : 's'} could not be read:`));
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
export function renderImportResults({ results = [], busy = '', warnings = [], title = 'Import' } = {}) {
  const panel = clear(document.getElementById('importPanel'));
  panel.hidden = false;
  const head = el('div', 'card-head');
  const left = el('div');
  left.appendChild(el('h2', null, title));
  if (busy) left.appendChild(el('p', 'hint', busy));
  else {
    const added = results.reduce((a, r) => a + (r.added || 0), 0);
    const failed = results.filter((r) => r.error).length;
    left.appendChild(el('p', 'hint', `${results.length} file${results.length === 1 ? '' : 's'} read · ${added} new transactions${failed ? ` · ${failed} not recognized` : ''}`));
  }
  head.appendChild(left);
  const close = el('button', 'btn', '×');
  close.type = 'button';
  close.title = 'Close';
  close.setAttribute('aria-label', 'Close import results');
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
