// Contract tests for the store. The memory backend runs here; the IndexedDB backend implements the
// same contract and is exercised in the browser by the render check (the dev page uses it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store/db.js';

const row = (id, over = {}) => ({ bank: 'FIO', date: '2024-03-01', booked: '2024-03-01', amount: -1, currency: 'CZK', fee: 0, merchant: 'm' + id, note: '', type: 't', counter: '', text: '', raw: '', hints: {}, id, ...over });

test('a fresh store is empty', async () => {
  const s = await openStore({ backend: 'memory' });
  assert.deepEqual(await s.allRows(), []);
  assert.deepEqual(await s.listImports(), []);
  assert.equal(s.backend, 'memory');
});

test('putRows stores rows in insertion order, skips ids already present, records the import', async () => {
  const s = await openStore({ backend: 'memory' });
  const r1 = await s.putRows([row('a'), row('b')], { file: 'x.csv', bank: 'FIO' });
  assert.deepEqual(r1, { added: 2, skipped: 0 });
  const r2 = await s.putRows([row('b'), row('c')], { file: 'y.csv', bank: 'FIO' });
  assert.deepEqual(r2, { added: 1, skipped: 1 });
  assert.deepEqual((await s.allRows()).map((r) => r.id), ['a', 'b', 'c']);
  const imports = await s.listImports();
  assert.equal(imports.length, 2);
  assert.equal(imports[1].file, 'y.csv');
  assert.equal(imports[1].added, 1);
  assert.equal(imports[1].skipped, 1);
  assert.match(imports[1].at, /^\d{4}-\d{2}-\d{2}T/);
});

test('rows come back as copies with their raw fields intact', async () => {
  const s = await openStore({ backend: 'memory' });
  const r = row('a', { hints: { kind: 'expense' }, counter: '123/0100' });
  await s.putRows([r], { file: 'x.csv', bank: 'FIO' });
  const [back] = await s.allRows();
  assert.deepEqual(back, r);
  back.merchant = 'changed';
  assert.equal((await s.allRows())[0].merchant, 'ma');
});

test('settings are key-value with a default', async () => {
  const s = await openStore({ backend: 'memory' });
  assert.equal(await s.getSetting('lang', 'en'), 'en');
  await s.setSetting('lang', 'cs');
  assert.equal(await s.getSetting('lang', 'en'), 'cs');
  await s.setSetting('rules', { categories: { A: ['x'] } });
  assert.deepEqual(await s.getSetting('rules'), { categories: { A: ['x'] } });
  assert.deepEqual(await s.allSettings(), { lang: 'cs', rules: { categories: { A: ['x'] } } });
});

test('clear removes rows, imports and settings', async () => {
  const s = await openStore({ backend: 'memory' });
  await s.putRows([row('a')], { file: 'x.csv', bank: 'FIO' });
  await s.setSetting('lang', 'cs');
  await s.clear();
  assert.deepEqual(await s.allRows(), []);
  assert.deepEqual(await s.listImports(), []);
  assert.equal(await s.getSetting('lang', null), null);
});

test('unknown backend is rejected, indexeddb falls back to memory outside a browser', async () => {
  await assert.rejects(openStore({ backend: 'nope' }), /backend/);
  const s = await openStore({ backend: 'indexeddb' });
  assert.equal(s.backend, 'memory');
  assert.match(s.fallbackReason, /IndexedDB/);
});
