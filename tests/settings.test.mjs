import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeAccounts, parseAccountLines, formatAccountLines, parseCategoryAccountLines, formatCategoryAccountLines, parseFxLines, formatFxLines, withSections, parseRulesJson } from '../src/settings-model.js';
import { Rules } from '../src/classifier/rules.js';
import { classify } from '../src/classifier/classify.js';
import { parseFio } from '../src/parsers/fio.js';

const defaults = JSON.parse(readFileSync(new URL('../rules/default-cz.json', import.meta.url), 'utf8'));

test('account lines round-trip, with and without labels', () => {
  const obj = parseAccountLines('FIO main: 2900000001/2010\n2900000002\n# comment\n\n  Air Bank : 1000000001 / 3030 ');
  assert.deepEqual(obj, { 'FIO main': '2900000001/2010', 'account 2900000002': '2900000002', 'Air Bank': '1000000001/3030' });
  assert.equal(formatAccountLines(obj), 'FIO main: 2900000001/2010\n2900000002\nAir Bank: 1000000001/3030');
  assert.throws(() => parseAccountLines('main: not-a-number'), /not an account number/);
  assert.equal(formatAccountLines({ _help: 'x', a: '1' }), 'a: 1');
});

test('category account lines round-trip and validate the category', () => {
  const obj = parseCategoryAccountLines('Housing & utilities: 4000000001/0100, 4000000002/0800\nInsurance: 4000000003/0300', ['Housing & utilities', 'Insurance']);
  assert.deepEqual(obj, { 'Housing & utilities': ['4000000001/0100', '4000000002/0800'], Insurance: ['4000000003/0300'] });
  assert.equal(formatCategoryAccountLines(obj), 'Housing & utilities: 4000000001/0100, 4000000002/0800\nInsurance: 4000000003/0300');
  assert.throws(() => parseCategoryAccountLines('Nope: 1/0100', ['Insurance']), /unknown category/);
  assert.throws(() => parseCategoryAccountLines('just text', null), /expected/);
});

test('fx lines round-trip, CZK is implicit', () => {
  assert.deepEqual(parseFxLines('EUR = 25\nusd: 23,5'), { CZK: 1, EUR: 25, USD: 23.5 });
  assert.equal(formatFxLines({ CZK: 1, EUR: 25, USD: 23 }), 'EUR = 25\nUSD = 23');
  assert.throws(() => parseFxLines('EUR = zero'), /expected/);
  assert.throws(() => parseFxLines('EUR = 0'), /positive/);
});

test('withSections applies edits onto a copy, keeps _help, validates', () => {
  const next = withSections(defaults, { own_accounts: { main: '2900000001/2010' }, fx_rates_to_czk: { CZK: 1, EUR: 24 } });
  assert.equal(next.own_accounts.main, '2900000001/2010');
  assert.ok(next.own_accounts._help);
  assert.equal(next.fx_rates_to_czk.EUR, 24);
  assert.equal(defaults.own_accounts.main, undefined); // original untouched
  assert.throws(() => withSections({ categories: null }, {}), /categories/);
});

test('adding an own account re-classifies a stored FIO transfer without re-import', () => {
  const text = readFileSync(new URL('../samples/fio-sample.csv', import.meta.url), 'utf8');
  const raw = parseFio(text).find((r) => r.merchant === 'Převod na spořicí účet');
  assert.equal(classify(raw, Rules.from(defaults)).k, 'expense');
  const edited = withSections(defaults, { own_accounts: { savings: '2900000002/2010' } });
  assert.equal(classify(raw, Rules.from(edited)).k, 'transfer');
});

test('parseRulesJson accepts the default file and rejects junk with a readable message', () => {
  assert.equal(parseRulesJson(JSON.stringify(defaults)).categories.Groceries.length > 5, true);
  assert.throws(() => parseRulesJson('{'), /not valid JSON/);
  assert.throws(() => parseRulesJson('[]'), /object/);
  assert.throws(() => parseRulesJson('{"a":1}'), /categories/);
});

test('mergeAccounts adds accounts without dropping existing ones or duplicating', () => {
  const base = { categories: {}, own_accounts: { _help: 'h', mine: '1/0100' }, category_accounts: { Insurance: ['9/0300'] } };
  const extra = { own_accounts: { _help: 'x', other: '2/0100' }, investment_accounts: { broker: '3/2010' }, category_accounts: { Insurance: ['9/0300', '8/0300'], Fees: ['7/0100'] } };
  const next = mergeAccounts(base, extra);
  assert.deepEqual(next.own_accounts, { _help: 'h', mine: '1/0100', other: '2/0100' });
  assert.deepEqual(next.investment_accounts, { broker: '3/2010' });
  assert.deepEqual(next.category_accounts, { Insurance: ['9/0300', '8/0300'], Fees: ['7/0100'] });
  assert.equal(base.own_accounts.other, undefined);
});
