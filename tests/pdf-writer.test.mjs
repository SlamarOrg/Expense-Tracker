import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writePdf, encodeText } from '../scripts/pdf-writer.mjs';
import { airbankSample, airbankSampleRows } from '../scripts/make-samples.mjs';
import { pdfToLines } from '../src/parsers/pdf-text.js';
import { loadPdfjs } from './helpers/pdfjs.mjs';

const pdfjs = await loadPdfjs();
const textLines = async (bytes) => (await pdfToLines(bytes, pdfjs)).filter((l) => l && l !== '\f');

test('writePdf produces a PDF header and deterministic bytes', () => {
  const a = writePdf([[{ x: 10, y: 800, text: 'Ahoj' }]]);
  const b = writePdf([[{ x: 10, y: 800, text: 'Ahoj' }]]);
  assert.equal(Buffer.from(a.slice(0, 5)).toString('latin1'), '%PDF-');
  assert.deepEqual(a, b);
  assert.ok(Buffer.from(a).toString('latin1').endsWith('%%EOF\n'));
});

test('encodeText maps Czech letters through the custom encoding and the rest through WinAnsi', () => {
  assert.equal(encodeText('A'), '41');
  assert.equal(encodeText('á'), 'e1');
  assert.equal(encodeText('č'), '81'); // second entry of the /Differences table
  assert.equal(encodeText('€'), '3f'); // not representable, becomes "?"
});

test('pdf.js reads back cells in content-stream order with diacritics intact', async () => {
  const pdf = writePdf([[
    { x: 60, y: 760, text: '22.09.2025' }, { x: 60, y: 748.4, text: '22.09.2025' },
    { x: 108, y: 760, text: 'Příchozí úhrada' }, { x: 108, y: 748.4, text: '1234567001' },
    { x: 186, y: 760, text: 'ŽLUŤOUČKÝ KŮŇ s.r.o.' }, { x: 186, y: 748.4, text: '19-0000000123 / 0100' },
    { x: 502, y: 760, text: '2 500,00' }, { x: 548, y: 760, text: '0,00' },
  ]]);
  assert.deepEqual(await textLines(pdf), ['22.09.2025', '22.09.2025', 'Příchozí úhrada', '1234567001', 'ŽLUŤOUČKÝ KŮŇ s.r.o.', '19-0000000123 / 0100', '2 500,00 0,00']);
});

test('the committed Air Bank sample equals the generator output and has two pages', async () => {
  const committed = readFileSync(new URL('../samples/airbank-sample.pdf', import.meta.url));
  assert.deepEqual(new Uint8Array(committed), airbankSample());
  const lines = await pdfToLines(committed, pdfjs);
  assert.equal(lines.filter((l) => l === '\f').length, 2);
});

test('the Air Bank sample header totals equal the sums of its rows', async () => {
  const lines = await textLines(readFileSync(new URL('../samples/airbank-sample.pdf', import.meta.url)));
  const header = lines.slice(0, 20).join('\n');
  const debits = /Odepsáno z účtu: ([\d ]+,\d{2})/.exec(header)[1];
  const credits = /Připsáno na účet: ([\d ]+,\d{2})/.exec(header)[1];
  const rows = airbankSampleRows();
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const fmt = (n) => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  assert.equal(debits, fmt(sum((r) => (r.amount < 0 ? -r.amount + Math.abs(r.fee || 0) : 0))));
  assert.equal(credits, fmt(sum((r) => (r.amount > 0 ? r.amount : 0))));
});

test('the Air Bank sample contains every layout variant the parser must handle', async () => {
  const lines = await textLines(readFileSync(new URL('../samples/airbank-sample.pdf', import.meta.url)));
  const text = lines.join('\n');
  for (const needle of [
    'Pokračování na straně 2', '1/2', '2/2', 'Air Bank a.s. /', 'Společnost zapsaná',
    'Číslo účtu / debetní karty Detaily Částka CZK Poplatky', 'Vklad na tomto účtu podléhá',
    '516844******4400', 'Vrácení peněz', 'Odměna za platby\nmobilem', 'kurz:', 'Úročení', 'Výběr z bankomatu', 'Revolut**',
  ]) assert.ok(text.includes(needle), `missing ${JSON.stringify(needle)}`);
  // old layout: counterparty account on the transaction-code line
  assert.ok(lines.some((l) => /^\d{10} \d{10} \/ \d{4}$/.test(l)), 'missing old-layout code line');
});
