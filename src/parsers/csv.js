// Small RFC 4180 reader: quoted fields with "" escapes, CRLF or LF, BOM stripped, delimiter given
// or detected from the header line.

/** @returns {string[][]} rows as arrays, header included */
export function parseCsvRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { quoted = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export function detectDelimiter(text) {
  const header = text.slice(0, 2000).split(/\r?\n/)[0] || '';
  const counts = [';', ',', '\t'].map((d) => [d, header.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** @returns {Array<Record<string,string>>} objects keyed by header; duplicate headers get _2, _3... */
export function readCsv(text, { delimiter } = {}) {
  const d = delimiter || detectDelimiter(text);
  const rows = parseCsvRows(text, d);
  if (rows.length < 2) return [];
  const seen = new Map();
  const header = rows[0].map((h) => {
    const name = h.trim();
    const count = (seen.get(name) || 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name}_${count}`;
  });
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] === undefined ? '' : r[idx]; });
    return obj;
  });
}
