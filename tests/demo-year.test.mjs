// The demo year is not a parser fixture; it exists so the demo shows a full year. These tests
// keep it deterministic and fully classified by the default rules plus the sample accounts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoYearSample } from '../scripts/make-samples.mjs';
import { parseFio } from '../src/parsers/fio.js';
import { Rules } from '../src/classifier/rules.js';
import { classify } from '../src/classifier/classify.js';
import { mergeAccounts } from '../src/settings-model.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const text = read('../samples/demo-fio-year.csv');
const rules = Rules.from(mergeAccounts(JSON.parse(read('../rules/default-cz.json')), JSON.parse(read('../samples/sample-settings.json'))));
const txs = parseFio(text).map((r) => classify(r, rules));

test('the committed demo year equals the generator output', () => {
  assert.equal(text, demoYearSample());
});

test('the demo year covers March 2023 to February 2024, every month, ending before the fixtures start', () => {
  const months = new Set(txs.map((t) => t.d.slice(0, 7)));
  assert.equal(months.size, 12);
  assert.equal([...months].sort()[0], '2023-03');
  assert.ok(txs.every((t) => t.d < '2024-03-01'), 'no overlap with the March 2024 fixtures');
});

test('every demo expense lands in a real category, ids are unique, all kinds appear', () => {
  const other = txs.filter((t) => t.k === 'expense' && t.c === 'Other').map((t) => t.m);
  assert.deepEqual(other, []);
  assert.equal(new Set(txs.map((t) => t.id)).size, txs.length);
  for (const k of ['expense', 'income', 'transfer', 'investment']) assert.ok(txs.some((t) => t.k === k), k);
  assert.ok(new Set(txs.filter((t) => t.k === 'expense').map((t) => t.c)).size >= 10, 'at least ten categories');
});
