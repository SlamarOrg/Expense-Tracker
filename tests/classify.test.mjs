import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Rules } from '../src/classifier/rules.js';
import { classify, classifyFlow, KIND } from '../src/classifier/classify.js';

const rules = Rules.from(JSON.parse(readFileSync(new URL('./fixtures/rules.json', import.meta.url), 'utf8')));

/** Build a RawRow with sensible defaults so each case states only what matters. */
function raw(over = {}) {
  return {
    bank: 'FIO', date: '2024-03-05', booked: '2024-03-05', amount: -100, currency: 'CZK', fee: 0,
    merchant: 'Merchant', note: '', type: 'Platba', counter: '', text: 'merchant', raw: '', hints: {},
    id: 'FIO|x', ...over,
  };
}

test('Rules.from reads the categories.json schema and ignores underscore keys', () => {
  assert.deepEqual(rules.categoryNames, ['Subscriptions', 'Groceries', 'Transport', 'Restaurants & cafés', 'Housing & utilities', 'Other']);
  assert.deepEqual([...rules.ownAccounts].sort(), ['1000000001', '2900000001', '2900000002']);
  assert.deepEqual(rules.folded, ['Subscriptions']);
  assert.equal(rules.fx.EUR, 25);
});

test('account lookups ignore bank code and leading zeros', () => {
  assert.equal(rules.isOwnAccount('2900000002/2010'), true);
  assert.equal(rules.isOwnAccount('2900000002'), true);
  assert.equal(rules.isOwnAccount('0002900000002/2010'), true);
  assert.equal(rules.isOwnAccount(''), false);
  assert.equal(rules.isOwnAccount('9999999999/2010'), false);
  assert.equal(rules.isInvestAccount('3000000001/2010'), true);
  assert.equal(rules.categoryForAccount('4000000002/0800'), 'Housing & utilities');
  assert.equal(rules.categoryForAccount('4000000003'), 'Insurance');
  assert.equal(rules.categoryForAccount('4000000009/0100'), null);
});

test('toCzk converts with fixed rates and records unknown currencies', () => {
  assert.equal(rules.toCzk(-10, 'EUR'), -250);
  assert.equal(rules.toCzk(-10.333, 'CZK'), -10.33);
  assert.equal(rules.toCzk(-7, 'GBP'), -7);
  assert.ok(rules.warnings.some((w) => w.includes('GBP')));
});

test('categorize is first match wins in rules order and falls back to Other', () => {
  assert.equal(rules.categorize('DEKUJEME, ROHLIK.CZ'), 'Groceries');
  assert.equal(rules.categorize('Nákup: BILLA 123, Praha'), 'Groceries');
  assert.equal(rules.categorize('Spotify AB, Stockholm'), 'Subscriptions');
  assert.equal(rules.categorize('Billa pizza corner'), 'Groceries'); // Groceries listed before Restaurants
  assert.equal(rules.categorize('Nějaká Kavárna'), 'Restaurants & cafés');
  assert.equal(rules.categorize('Pan Novák'), 'Other');
});

test('regression: a short keyword must not match inside another word', () => {
  // "stk " (vehicle inspection) once matched "částka " in every FIO card row
  assert.equal(rules.categorize('Nákup: MERCHANT, dne 1.1.2024, částka 120.50 CZK'), 'Other');
  assert.equal(rules.categorize('STK Brno, Praha'), 'Transport');
  assert.equal(rules.categorize('Prohlidka STK'), 'Transport'); // trailing-space keyword at the end of the text
});

const flowCases = [
  // [name, amount, counter, text, expected]
  ['own account counterparty is a transfer even when incoming', 500, '2900000002/2010', 'x', KIND.TRANSFER],
  ['own account counterparty is a transfer when outgoing', -500, '2900000001', 'x', KIND.TRANSFER],
  ['transfer keyword is a transfer', -500, '', 'Převod na spořicí účet', KIND.TRANSFER],
  ['positive amount without transfer markers is income', 25000, '5500000001/0100', 'mzda', KIND.INCOME],
  ['investment account is an investment', -3000, '3000000001/2010', 'x', KIND.INVESTMENT],
  ['investment keyword is an investment', -3000, '', 'PORTU investice', KIND.INVESTMENT],
  ['investment keyword on incoming money is income, not investment', 3000, '', 'Portu výplata', KIND.INCOME],
  ['plain outgoing payment is an expense', -120, '5500000002/0100', 'Nákup: BILLA', KIND.EXPENSE],
  ['transfer wins over investment', -3000, '2900000001', 'PORTU', KIND.TRANSFER],
];
for (const [name, amount, counter, text, expected] of flowCases) {
  test(`classifyFlow: ${name}`, () => {
    assert.equal(classifyFlow(amount, counter, text, rules), expected);
  });
}

const txCases = [
  // [name, raw overrides, expected kind, expected category, expected amt]
  ['card purchase in CZK is an expense with positive spend', { amount: -120, text: 'nakup billa', raw: 'Nákup: BILLA' }, KIND.EXPENSE, 'Groceries', 120],
  ['card refund hint keeps expense kind and nets as negative spend', { amount: 120, hints: { kind: 'expense' }, raw: 'Kredit: BILLA' }, KIND.EXPENSE, 'Groceries', -120],
  ['EUR amounts convert at the fixed rate', { amount: -10, currency: 'EUR', merchant: 'Spotify' , raw: 'Spotify' }, KIND.EXPENSE, 'Subscriptions', 250],
  ['category by counterparty account beats keywords', { amount: -9000, counter: '4000000001/0100', merchant: 'Pizza Palace', raw: 'pizza' }, KIND.EXPENSE, 'Housing & utilities', 9000],
  ['category by counterparty tolerates leading zeros', { amount: -9000, counter: '000004000000002/0800' }, KIND.EXPENSE, 'Housing & utilities', 9000],
  ['own account transfer is kind transfer with category Transfers', { amount: -5000, counter: '2900000002/2010' }, KIND.TRANSFER, 'Transfers', 5000],
  ['income rows get category Income', { amount: 30000, merchant: 'Zaměstnavatel' }, KIND.INCOME, 'Income', -30000],
  ['forced income hint (interest) wins over amount sign logic', { amount: 1.5, hints: { kind: 'income' } }, KIND.INCOME, 'Income', -1.5],
  ['forced expense hint (interest tax) with positive amount', { amount: -0.2, hints: { kind: 'expense' } }, KIND.EXPENSE, 'Other', 0.2],
  ['forced transfer hint (REVOLT bank code)', { amount: -2000, merchant: 'Revolut', hints: { kind: 'transfer' } }, KIND.TRANSFER, 'Transfers', 2000],
  ['forced skip hint (exchange leg) yields Skipped', { amount: -100, hints: { kind: 'skip' } }, KIND.SKIP, 'Skipped', 100],
  ['investment account yields category Investments', { amount: -3000, counter: '3000000001/2010' }, KIND.INVESTMENT, 'Investments', 3000],
  ['transferIfExpense hint turns a card expense into a transfer', { amount: -2000, merchant: 'Revolut**1234*', text: 'revolut**1234*', hints: { transferIfExpense: true } }, KIND.TRANSFER, 'Transfers', 2000],
  ['transferIfExpense does not touch an income row', { amount: 2000, hints: { transferIfExpense: true } }, KIND.INCOME, 'Income', -2000],
  ['transferUnlessInvestment hint with investment keyword', { amount: -1000, merchant: 'To DEGIRO', text: 'to degiro', hints: { kind: 'transferUnlessInvestment' } }, KIND.INVESTMENT, 'Investments', 1000],
  ['transferUnlessInvestment hint without keyword', { amount: -1000, merchant: 'To Mum', text: 'to mum', hints: { kind: 'transferUnlessInvestment' } }, KIND.TRANSFER, 'Transfers', 1000],
  ['fee is added to an expense', { amount: -100, fee: 2.5, merchant: 'Shell', raw: 'shell' }, KIND.EXPENSE, 'Transport', 102.5],
  ['fee is ignored on a transfer', { amount: -100, fee: 2.5, counter: '2900000001' }, KIND.TRANSFER, 'Transfers', 100],
  ['note and raw text take part in categorization', { amount: -500, merchant: 'Pan Novák', note: 'najem březen' }, KIND.EXPENSE, 'Housing & utilities', 500],
  ['unknown merchant lands in Other', { amount: -500, merchant: 'Pan Novák', text: 'pan novak' }, KIND.EXPENSE, 'Other', 500],
];
for (const [name, over, kind, category, amt] of txCases) {
  test(`classify: ${name}`, () => {
    const tx = classify(raw(over), rules);
    assert.equal(tx.k, kind);
    assert.equal(tx.c, category);
    assert.equal(tx.c0, category);
    assert.equal(tx.amt, amt);
  });
}

test('classify copies the row fields into the Tx shape', () => {
  const tx = classify(raw({ amount: -12.344, currency: 'CZK', merchant: ' Billa Praha ', note: 'n', type: 'Karetní transakce', counter: '5500000002/0100', id: 'FIO|1', date: '2024-03-04', bank: 'FIO' }), rules);
  assert.deepEqual(Object.keys(tx).sort(), ['amt', 'c', 'c0', 'cp', 'cur', 'd', 'id', 'k', 'm', 'n', 'orig', 's', 't'].sort());
  assert.equal(tx.d, '2024-03-04');
  assert.equal(tx.orig, -12.34);
  assert.equal(tx.amt, 12.34);
  assert.equal(tx.m, 'Billa Praha');
  assert.equal(tx.n, 'n');
  assert.equal(tx.s, 'FIO');
  assert.equal(tx.t, 'Karetní transakce');
  assert.equal(tx.cp, '5500000002/0100');
  assert.equal(tx.id, 'FIO|1');
});

test('classify truncates merchant to 80 and note to 120 characters', () => {
  const tx = classify(raw({ merchant: 'm'.repeat(100), note: 'n'.repeat(200) }), rules);
  assert.equal(tx.m.length, 80);
  assert.equal(tx.n.length, 120);
});
