// Entry point for the parsers: detect the bank from the file name or content, parse, dedupe.

import { parseFio } from './fio.js';
import { parseRevolut } from './revolut.js';
import { parseAirbank } from './airbank.js';

export const FORMATS = {
  fio: { bank: 'FIO', label: 'FIO banka CSV' },
  revolut: { bank: 'Revolut', label: 'Revolut CSV' },
  airbank: { bank: 'Airbank', label: 'Air Bank PDF' },
};

const decoder = new TextDecoder('utf-8');
const head = (bytes, n = 4000) => decoder.decode(bytes.subarray ? bytes.subarray(0, n) : new Uint8Array(bytes).subarray(0, n));

/**
 * @param {string} name file name
 * @param {Uint8Array} bytes file content
 * @returns {'fio'|'revolut'|'airbank'|null}
 */
export function detectFormat(name, bytes) {
  const base = String(name || '').toLowerCase();
  if (base.endsWith('.csv') && (base.includes('fio') || base.startsWith('pohyby'))) return 'fio';
  if (base.endsWith('.csv') && (base.includes('revolut') || base.startsWith('account-statement'))) return 'revolut';
  if (base.endsWith('.pdf') && (base.includes('airbank') || base.includes('vypis'))) return 'airbank';
  if (!bytes || bytes.length === 0) return null;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'airbank'; // %PDF
  const text = head(bytes).replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  if (/"?Datum"?;"?Objem"?;/.test(firstLine) || /^"?Zdrojový účet"?;/.test(firstLine)) return 'fio';
  if (/^"?(Typ|Type)"?,"?(Produkt|Product)"?,/.test(firstLine)) return 'revolut';
  return null;
}

/**
 * @param {{name: string, bytes: Uint8Array}} file
 * @param {{pdfjs?: object}} deps pdf.js namespace, needed for PDF statements
 * @returns {Promise<{format: string|null, rows: object[], summary: object, error?: string}>}
 */
export async function parseFile(file, deps = {}) {
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
  const format = detectFormat(file.name, bytes);
  const base = { name: file.name, format, rows: [], summary: { rows: 0, problems: [] } };
  if (!format) return { ...base, error: `${file.name}: file type not recognized (expected a FIO or Revolut CSV, or an Air Bank PDF)` };
  try {
    if (format === 'airbank') {
      if (!deps.pdfjs) return { ...base, error: `${file.name}: pdf.js is not available, cannot read PDF statements` };
      const { rows, summary } = await parseAirbank(bytes, deps.pdfjs);
      return { ...base, rows, summary };
    }
    const text = decoder.decode(bytes);
    const rows = format === 'fio' ? parseFio(text) : parseRevolut(text);
    return { ...base, rows, summary: { rows: rows.length, problems: [] } };
  } catch (e) {
    return { ...base, error: `${file.name}: ${e && e.message ? e.message : e}` };
  }
}

/**
 * Drop rows whose id was already seen. `seen` may carry ids from earlier imports.
 * @returns {{rows: object[], dropped: number}}
 */
export function dedupe(rows, seen = new Set()) {
  const out = [];
  let dropped = 0;
  for (const r of rows) {
    if (seen.has(r.id)) { dropped++; continue; }
    seen.add(r.id);
    out.push(r);
  }
  return { rows: out, dropped };
}
