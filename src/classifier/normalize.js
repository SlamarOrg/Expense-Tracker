// Text and number helpers shared by parsers and the classifier.

/** Lowercase, strip diacritics, collapse whitespace. Null-safe. */
export function norm(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Czech formatted amount ("-1 012,50") to a number. Empty and "-" are 0. */
export function parseCzNumber(s) {
  if (s === null || s === undefined) return 0;
  const cleaned = String(s).replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) throw new Error(`not a number: ${JSON.stringify(s)}`);
  return n;
}

/** "d.m.yyyy" (spaces allowed) or ISO "yyyy-mm-dd" to ISO. Throws on anything else. */
export function isoDate(s) {
  const t = String(s ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return t;
  m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(t);
  if (!m) throw new Error(`not a date: ${JSON.stringify(s)}`);
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
