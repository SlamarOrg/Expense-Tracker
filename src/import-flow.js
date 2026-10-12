// The import pipeline without any DOM: parse files, store what is new, classify everything.
// The UI modules call these; tests run them on the memory store.

import { parseFile, dedupe, FORMATS } from './parsers/index.js';
import { classify, KIND } from './classifier/classify.js';

/** Counts by kind for a list of Tx, in a fixed order. */
export function kindCounts(txs) {
  const out = {};
  for (const k of Object.values(KIND)) out[k] = 0;
  for (const t of txs) out[t.k] = (out[t.k] || 0) + 1;
  return out;
}

/**
 * Parse and store a batch of files.
 * @param {Array<{name: string, bytes: Uint8Array}>} files
 * @param {{store: object, rules: object, pdfjs?: object}} deps
 * @returns {Promise<Array<object>>} one result per file:
 *   { name, format, bank, rows, added, skipped, kinds, problems, totals, error }
 */
export async function importFiles(files, { store, rules, pdfjs }) {
  const seen = new Set((await store.allRows()).map((r) => r.id));
  const results = [];
  for (const file of files) {
    const res = await parseFile(file, { pdfjs });
    const out = {
      name: file.name, format: res.format, bank: res.format ? FORMATS[res.format].bank : null,
      rows: res.rows.length, added: 0, skipped: 0, kinds: {}, problems: [], totals: null, error: res.error || null, code: res.code || null,
    };
    if (!res.error) {
      out.problems = res.summary.problems || [];
      if (res.format === 'airbank') {
        const s = res.summary;
        out.totals = { account: s.account, debits: s.debits, parsedDebits: s.parsedDebits, credits: s.credits, parsedCredits: s.parsedCredits, ok: s.ok };
      }
      const { rows, dropped } = dedupe(res.rows, seen);
      const put = await store.putRows(rows, { file: file.name, bank: out.bank, format: res.format, rows: res.rows.length, totals: out.totals, problems: out.problems.length });
      out.added = put.added;
      out.skipped = dropped + put.skipped; // already stored, or repeated inside this batch
      out.kinds = kindCounts(res.rows.map((r) => classify(r, rules)));
    }
    results.push(out);
  }
  return results;
}

/** Classify every stored row with the given rules; sorted by date. */
export async function loadTransactions(store, rules) {
  const rows = await store.allRows();
  const tx = rows.map((r) => classify(r, rules));
  tx.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return tx;
}

/** Imports as the dashboard footer expects them. */
export function sourcesFromImports(imports) {
  return imports.map((i) => ({
    bank: i.bank, file: i.file, rows: i.rows, at: i.at,
    debits_match: i.totals ? i.totals.ok : undefined,
    statement_debits: i.totals ? i.totals.debits : undefined,
    parsed_debits: i.totals ? i.totals.parsedDebits : undefined,
    unparsed_blocks: i.problems || 0,
  }));
}

/** "Forget my data": rows, imports, rules, overrides. Theme and language live elsewhere and stay. */
export async function forgetAll(store) {
  await store.clear();
}
