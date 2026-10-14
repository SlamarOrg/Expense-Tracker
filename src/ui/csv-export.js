// CSV export of the transaction list. Merchant names and notes come from statements, where a
// merchant or the sender of a payment writes them, so a text cell that a spreadsheet would read as
// a formula (=, +, -, @, tab, carriage return at the start) gets a leading apostrophe (OWASP CSV
// injection guidance). Numbers stay numbers.

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: numbers as they are, everything else quoted and defused. */
export function csvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let s = value == null ? '' : String(value);
  if (FORMULA_START.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export const CSV_HEADER = ['date', 'merchant', 'note', 'category', 'bank', 'type', 'amount_czk', 'original_amount', 'currency'];

/** The export file: a BOM so Excel detects UTF-8, a header, one line per transaction. */
export function transactionsCsv(list) {
  const lines = [CSV_HEADER.join(',')];
  for (const t of list) lines.push([t.d, t.m, t.n, t.c, t.s, t.t, t.amt, t.orig, t.cur].map(csvCell).join(','));
  return '﻿' + lines.join('\n');
}
