import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectFormat, parseFile, dedupe } from '../src/parsers/index.js';
import { loadPdfjs } from './helpers/pdfjs.mjs';

const pdfjs = await loadPdfjs();
const samples = new URL('../samples/', import.meta.url);
const fio = readFileSync(new URL('fio-sample.csv', samples));
const rev = readFileSync(new URL('revolut-sample.csv', samples));
const ab = readFileSync(new URL('airbank-sample.pdf', samples));

test('detectFormat by file name', () => {
  assert.equal(detectFormat('Pohyby_na_uctu_FIO.csv', new Uint8Array()), 'fio');
  assert.equal(detectFormat('pohyby-2024.csv', new Uint8Array()), 'fio');
  assert.equal(detectFormat('account-statement_2021_cs-cz.csv', new Uint8Array()), 'revolut');
  assert.equal(detectFormat('my-revolut.csv', new Uint8Array()), 'revolut');
  assert.equal(detectFormat('Vypis z uctu 123 za 2024.pdf', new Uint8Array()), 'airbank');
  assert.equal(detectFormat('airbank.PDF', new Uint8Array()), 'airbank');
});

test('detectFormat by content when the name says nothing', () => {
  assert.equal(detectFormat('export.csv', fio), 'fio');
  assert.equal(detectFormat('export.csv', rev), 'revolut');
  assert.equal(detectFormat('statement.pdf', ab), 'airbank');
  assert.equal(detectFormat('statement.pdf', new TextEncoder().encode('not a pdf')), null);
  assert.equal(detectFormat('notes.txt', new TextEncoder().encode('hello')), null);
});

test('parseFile returns rows and a summary for each supported format', async () => {
  const f = await parseFile({ name: 'fio-sample.csv', bytes: fio }, { pdfjs });
  assert.equal(f.format, 'fio');
  assert.equal(f.rows.length, 20);
  assert.equal(f.summary.rows, 20);
  const r = await parseFile({ name: 'revolut-sample.csv', bytes: rev }, { pdfjs });
  assert.equal(r.format, 'revolut');
  assert.equal(r.rows.length, 15);
  const a = await parseFile({ name: 'airbank-sample.pdf', bytes: ab }, { pdfjs });
  assert.equal(a.format, 'airbank');
  assert.equal(a.rows.length, 12);
  assert.equal(a.summary.ok, true);
  assert.equal(a.summary.debits, 24131.3);
});

test('parseFile reports an unknown file as an error result, it does not throw', async () => {
  const u = await parseFile({ name: 'photo.jpg', bytes: new Uint8Array([1, 2, 3]) }, { pdfjs });
  assert.equal(u.format, null);
  assert.deepEqual(u.rows, []);
  assert.match(u.error, /not recognized/);
});

test('parseFile for a PDF without pdf.js available reports an error', async () => {
  const u = await parseFile({ name: 'airbank-sample.pdf', bytes: ab }, {});
  assert.equal(u.format, 'airbank');
  assert.match(u.error, /pdf\.js/);
});

test('dedupe drops rows whose id was seen, across files', async () => {
  const a = (await parseFile({ name: 'fio-sample.csv', bytes: fio }, { pdfjs })).rows;
  const b = (await parseFile({ name: 'fio-sample.csv', bytes: fio }, { pdfjs })).rows;
  const { rows, dropped } = dedupe([...a, ...b]);
  assert.equal(rows.length, 20);
  assert.equal(dropped, 20);
  const again = dedupe(a, new Set(a.map((r) => r.id)));
  assert.equal(again.rows.length, 0);
  assert.equal(again.dropped, 20);
});

test('all three samples together have unique ids', async () => {
  const all = [];
  for (const [name, bytes] of [['fio-sample.csv', fio], ['revolut-sample.csv', rev], ['airbank-sample.pdf', ab]]) {
    all.push(...(await parseFile({ name, bytes }, { pdfjs })).rows);
  }
  assert.equal(dedupe(all).rows.length, 47);
});
