import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRevolut } from '../src/parsers/revolut.js';
import { Rules } from '../src/classifier/rules.js';
import { classify, KIND } from '../src/classifier/classify.js';
import { revolutSample } from '../scripts/make-samples.mjs';
import { checkSnapshot } from './helpers/snapshot.mjs';

const rules = Rules.from(JSON.parse(readFileSync(new URL('./fixtures/rules.json', import.meta.url), 'utf8')));
const text = readFileSync(new URL('../samples/revolut-sample.csv', import.meta.url), 'utf8');
const rows = parseRevolut(text);
const txs = rows.map((r) => classify(r, rules));
const byDesc = (d) => txs.find((t) => t.m === d);

test('the committed sample equals the generator output', () => {
  assert.equal(text, revolutSample());
});

test('rows that are not DOKONČENO are dropped', () => {
  assert.equal(rows.length, 15);
  assert.equal(byDesc('Hotel Rejected'), undefined);
});

test('dates come from the started timestamp, booking from the completed one', () => {
  const r = rows.find((r) => r.merchant === 'Record Go');
  assert.equal(r.date, '2024-03-03');
  assert.equal(r.booked, '2024-03-04');
  assert.ok(r.id.startsWith('REV|'));
});

test('top-up is a transfer, exchange legs are skipped', () => {
  assert.equal(byDesc('Dobití Apple Pay kartou *1234').k, KIND.TRANSFER);
  assert.equal(byDesc('Exchanged to USD').k, KIND.SKIP);
  assert.equal(byDesc('Exchanged from EUR').k, KIND.SKIP);
});

test('card payment is an expense converted at the EUR rate, fee added', () => {
  const t = byDesc('Shell Wien');
  assert.equal(t.k, KIND.EXPENSE);
  assert.equal(t.orig, -40.5);
  assert.equal(t.amt, 1012.5);
  assert.equal(t.c, 'Transport');
  assert.equal(byDesc('Record Go').amt, 9486);
});

test('card payment that is a Revolut transfer is a transfer', () => {
  assert.equal(byDesc('Revolut Transfer to savings').k, KIND.TRANSFER);
});

test('fees: custody fee is an expense, zero-amount plan fee is skipped, reversal nets back', () => {
  assert.equal(byDesc('Custody fees').k, KIND.EXPENSE);
  assert.equal(byDesc('Custody fees').amt, 1.15);
  assert.equal(byDesc('Poplatek za plán Premium').k, KIND.SKIP); // amount is 0, the fee column is ignored (same as the Python reference)
  assert.equal(byDesc('Reversal of custody fee duplication').k, KIND.EXPENSE);
  assert.equal(byDesc('Reversal of custody fee duplication').amt, -1.15);
});

test('trades: buy is an investment, sell is income', () => {
  assert.equal(byDesc('Investing money').k, KIND.INVESTMENT);
  assert.equal(byDesc('Sold AAPL').k, KIND.INCOME);
});

test('transfers: to a broker keyword is an investment, to a person a transfer, incoming is income', () => {
  assert.equal(byDesc('To DEGIRO').k, KIND.INVESTMENT);
  assert.equal(byDesc('To Jana Nováková').k, KIND.TRANSFER);
  assert.equal(byDesc('From Petr Novák').k, KIND.INCOME);
});

test('unknown row types go through the generic flow', () => {
  assert.equal(byDesc('Cashback March').k, KIND.INCOME);
});

test('English column headers are accepted too', () => {
  const en = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n'
    + 'CARD_PAYMENT,Current,2024-03-05 18:20:00,2024-03-06 02:00:00,Shell Wien,-40.00,0.50,EUR,COMPLETED,380.06\n'
    + 'TOPUP,Current,2024-03-01 10:00:00,2024-03-01 10:00:05,Top-Up by *1234,1000.00,0.00,EUR,COMPLETED,1000.00\n'
    + 'EXCHANGE,Current,2024-03-02 09:00:00,2024-03-02 09:00:00,Exchanged to USD,-200.00,0.00,EUR,COMPLETED,800.00\n'
    + 'CARD_PAYMENT,Current,2024-03-07 12:00:00,2024-03-07 12:00:01,Hotel,-99.00,0.00,EUR,REVERTED,360.06\n';
  const t = parseRevolut(en).map((r) => classify(r, rules));
  assert.deepEqual(t.map((x) => [x.m, x.k, x.orig]), [['Shell Wien', KIND.EXPENSE, -40.5], ['Top-Up by *1234', KIND.TRANSFER, 1000], ['Exchanged to USD', KIND.SKIP, -200]]);
});

test('snapshot of all classified rows', () => {
  checkSnapshot('revolut', txs);
});
