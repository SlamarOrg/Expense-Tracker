import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAirbank, parseAirbankLines } from '../src/parsers/airbank.js';
import { Rules } from '../src/classifier/rules.js';
import { classify, KIND } from '../src/classifier/classify.js';
import { loadPdfjs } from './helpers/pdfjs.mjs';
import { checkSnapshot } from './helpers/snapshot.mjs';

const rules = Rules.from(JSON.parse(readFileSync(new URL('./fixtures/rules.json', import.meta.url), 'utf8')));
const bytes = readFileSync(new URL('../samples/airbank-sample.pdf', import.meta.url));
const { rows, summary } = await parseAirbank(bytes, await loadPdfjs());
const txs = rows.map((r) => classify(r, rules));
const byType = (t) => txs.filter((x) => x.t === t);
const byMerchant = (m) => txs.find((x) => x.m.includes(m));

test('every block parses, nothing lands in problems', () => {
  assert.deepEqual(summary.problems, []);
  assert.equal(rows.length, 12);
  assert.equal(summary.rows, 12);
  assert.equal(summary.account, '1000000001/3030');
});

test('parsed debit and credit sums equal the printed statement totals', () => {
  assert.equal(summary.debits, 24131.3);
  assert.equal(summary.parsedDebits, 24131.3);
  assert.equal(summary.credits, 46562.34);
  assert.equal(summary.parsedCredits, 46562.34);
  assert.equal(summary.ok, true);
});

test('rows carry the execution date, the booking date and a code-based id', () => {
  const r = rows.find((x) => x.merchant.includes('BILLA'));
  assert.equal(r.date, '2024-03-03');
  assert.equal(r.booked, '2024-03-05');
  assert.equal(r.id, 'AB|1000000102');
  assert.equal(r.bank, 'Airbank');
  assert.equal(r.currency, 'CZK');
});

test('card payment: merchant comes from the detail lines, holder name is not the merchant', () => {
  const t = byMerchant('BILLA');
  assert.equal(t.m, 'BILLA 456 BRNO, BRNO, 602 00, CZE');
  assert.equal(t.cp, '');
  assert.equal(t.k, KIND.EXPENSE);
  assert.equal(t.c, 'Groceries');
  assert.equal(t.amt, 512.3);
});

test('incoming transfer is income with the counterparty account kept', () => {
  const t = byMerchant('ZAMĚSTNAVATEL');
  assert.equal(t.k, KIND.INCOME);
  assert.equal(t.cp, '5500000001/0100');
  assert.equal(t.n, 'Mzda 02/2024');
});

test('outgoing transfer: name is the merchant, details are the note, account rule applies', () => {
  const t = byMerchant('PRONAJÍMATEL');
  assert.equal(t.n, 'Nájem duben');
  assert.equal(t.cp, '4000000001/0100');
  assert.equal(t.c, 'Housing & utilities');
  assert.equal(t.amt, 12500);
});

test('old layout with the account on the code line is an own-account transfer', () => {
  const t = txs.find((x) => x.cp === '2900000001/2010');
  assert.equal(t.k, KIND.TRANSFER);
  assert.equal(t.m, 'Odchozí úhrada'); // no name line before the account, type is the fallback
  assert.equal(t.n, 'Vzorek, Jan'); // text on the amount line becomes a detail
});

test('two-line type and a reward are income', () => {
  const t = byType('Odměna za platby mobilem')[0];
  assert.ok(t, 'two-line type joined with a space');
  assert.equal(t.k, KIND.INCOME);
  assert.equal(t.amt, -50);
});

test('card refund ("Vrácení peněz") stays an expense and nets negative', () => {
  const t = byMerchant('ALZA');
  assert.equal(t.k, KIND.EXPENSE);
  assert.equal(t.amt, -1500);
});

test('text after the amount line does not break the block and investment account applies', () => {
  const t = byMerchant('ZONKY');
  assert.equal(t.k, KIND.INVESTMENT);
  assert.equal(t.amt, 2000);
  assert.equal(t.n, 'Investice Úročení 5,5 % p.a.');
});

test('Revolut card top-up is a transfer', () => {
  assert.equal(byMerchant('Revolut**').k, KIND.TRANSFER);
});

test('ATM withdrawal: fee is added to the expense, category from the type text', () => {
  const t = byMerchant('ATM AIR BANK');
  assert.equal(t.k, KIND.EXPENSE);
  assert.equal(t.orig, -1030);
  assert.equal(t.amt, 1030);
  assert.equal(t.c, 'Cash withdrawals');
});

test('interest is income', () => {
  assert.equal(byType('Úrok z vkladu')[0].k, KIND.INCOME);
});

test('a block without a transaction code or amount line is reported, not silently dropped', () => {
  const lines = [
    'Číslo účtu: 1000000001 / 3030', 'Odepsáno z účtu: 10,00', 'Připsáno na účet: 0,00',
    '01.01.2024', '01.01.2024', 'Platba kartou', 'not-a-code', 'Someone', '-10,00 0,00',
    '02.01.2024', '02.01.2024', 'Platba kartou', '1000000999', 'Someone', 'no amount here',
    'Vklad na tomto účtu podléhá ochraně',
  ];
  const r = parseAirbankLines(lines);
  assert.equal(r.rows.length, 0);
  assert.equal(r.summary.problems.length, 2);
  assert.equal(r.summary.ok, false);
});

test('snapshot of all classified rows', () => {
  checkSnapshot('airbank', txs);
});
