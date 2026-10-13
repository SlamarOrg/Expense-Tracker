// Stable ids for banks whose exports carry no transaction id (FIO, Revolut).
//
// The id is built from the row's content. Two genuinely separate transactions can have identical
// content (three 15 Kč tram tickets on the same day), so the n-th repeat of the same content
// within one file gets "#n". Re-importing the same file, or an overlapping export that covers
// whole days, yields the same ids again, so dedup across imports still works.

/** @param {Array<{id: string}>} rows rows whose `id` is the content key; rewritten in place */
export function numberRepeats(rows) {
  const seen = new Map();
  for (const r of rows) {
    const n = (seen.get(r.id) || 0) + 1;
    seen.set(r.id, n);
    r.id = `${r.id}#${n}`;
  }
  return rows;
}
