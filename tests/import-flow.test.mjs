import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openStore } from '../src/store/db.js';
import { importFiles, loadTransactions, kindCounts, sourcesFromImports, forgetAll } from '../src/import-flow.js';
import { Rules } from '../src/classifier/rules.js';
import { loadPdfjs } from './helpers/pdfjs.mjs';

const pdfjs = await loadPdfjs();
const rules = Rules.from(JSON.parse(readFileSync(new URL('./fixtures/rules.json', import.meta.url), 'utf8')));
const samples = new URL('../samples/', import.meta.url);
const file = (name) => ({ name, bytes: new Uint8Array(readFileSync(new URL(name, samples))) });
const ALL = ['fio-sample.csv', 'revolut-sample.csv', 'airbank-sample.pdf'];

test('importing the three samples stores 47 rows and reports per file', async () => {
  const store = await openStore({ backend: 'memory' });
  const results = await importFiles(ALL.map(file), { store, rules, pdfjs });
  assert.deepEqual(results.map((r) => [r.bank, r.rows, r.added, r.skipped, r.error]), [['FIO', 20, 20, 0, null], ['Revolut', 15, 15, 0, null], ['Airbank', 12, 12, 0, null]]);
  assert.equal(results[2].totals.ok, true);
  assert.equal(results[2].totals.debits, 24131.3);
  assert.equal((await store.allRows()).length, 47);
  assert.equal((await store.listImports()).length, 3);
  assert.deepEqual(results[0].kinds, { expense: 13, investment: 1, transfer: 4, income: 2, skip: 0 });
  const sources = sourcesFromImports(await store.listImports());
  assert.equal(sources[2].debits_match, true);
  assert.equal(sources[2].statement_debits, 24131.3);
  assert.equal(sources[0].debits_match, undefined);
});

test('forgetAll empties rows, imports and settings', async () => {
  const store = await openStore({ backend: 'memory' });
  await importFiles([file('fio-sample.csv')], { store, rules, pdfjs });
  await store.setSetting('rules', { categories: {} });
  await store.setSetting('overrides', { A: 'Travel' });
  await forgetAll(store);
  assert.deepEqual(await store.allRows(), []);
  assert.deepEqual(await store.listImports(), []);
  assert.deepEqual(await store.allSettings(), {});
});

test('importing in any order yields the same set of rows, and re-importing adds nothing', async () => {
  const a = await openStore({ backend: 'memory' });
  const b = await openStore({ backend: 'memory' });
  await importFiles(ALL.map(file), { store: a, rules, pdfjs });
  await importFiles(ALL.slice().reverse().map(file), { store: b, rules, pdfjs });
  const ids = async (s) => (await s.allRows()).map((r) => r.id).sort();
  assert.deepEqual(await ids(a), await ids(b));
  const again = await importFiles([file('fio-sample.csv')], { store: a, rules, pdfjs });
  assert.equal(again[0].added, 0);
  assert.equal(again[0].skipped, 20);
  assert.equal((await a.allRows()).length, 47);
});

test('an unknown file is reported as an error and nothing is stored', async () => {
  const store = await openStore({ backend: 'memory' });
  const [r] = await importFiles([{ name: 'photo.jpg', bytes: new Uint8Array([1, 2, 3]) }], { store, rules, pdfjs });
  assert.match(r.error, /not recognized/);
  assert.equal(r.added, 0);
  assert.deepEqual(await store.allRows(), []);
  assert.deepEqual(await store.listImports(), []);
});

test('loadTransactions classifies stored rows with the rules given, so rule changes need no re-import', async () => {
  const store = await openStore({ backend: 'memory' });
  await importFiles([file('fio-sample.csv')], { store, rules, pdfjs });
  const withAccounts = await loadTransactions(store, rules);
  assert.equal(kindCounts(withAccounts).transfer, 4);
  const noAccounts = await loadTransactions(store, Rules.from({ categories: {}, fx_rates_to_czk: { CZK: 1 } }));
  assert.equal(kindCounts(noAccounts).transfer, 2); // only the two hint-driven transfers remain
  assert.ok(withAccounts.every((t, i) => i === 0 || withAccounts[i - 1].d <= t.d), 'sorted by date');
});
