import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFio } from '../src/parsers/fio.js';
import { Rules } from '../src/classifier/rules.js';
import { classify, KIND } from '../src/classifier/classify.js';
import { fioSample } from '../scripts/make-samples.mjs';
import { checkSnapshot } from './helpers/snapshot.mjs';

const rules = Rules.from(JSON.parse(readFileSync(new URL('./fixtures/rules.json', import.meta.url), 'utf8')));
const text = readFileSync(new URL('../samples/fio-sample.csv', import.meta.url), 'utf8');
const rows = parseFio(text);
const txs = rows.map((r) => classify(r, rules));
const byMerchant = (m) => txs.find((t) => t.m.includes(m));

test('the committed sample equals the generator output (make-samples is deterministic)', () => {
  assert.equal(text, fioSample());
});

test('every row parses into a RawRow with the required fields', () => {
  assert.equal(rows.length, 20);
  for (const r of rows) {
    assert.equal(r.bank, 'FIO');
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(r.booked, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof r.amount, 'number');
    assert.equal(r.currency, 'CZK');
    assert.ok(r.id.startsWith('FIO|'));
  }
});

test('card purchase: merchant cut from the message, purchase date from "dne"', () => {
  const t = byMerchant('BILLA');
  assert.equal(t.d, '2024-03-03');
  assert.equal(t.m, 'BILLA 123');
  assert.equal(t.k, KIND.EXPENSE);
  assert.equal(t.c, 'Groceries');
  assert.equal(t.amt, 245.5);
});

test('card refund ("Kredit:") stays an expense and nets as negative spend', () => {
  const t = byMerchant('ALZA');
  assert.equal(t.k, KIND.EXPENSE);
  assert.equal(t.amt, -1500);
});

test('ATM withdrawal gets the ATM prefix and lands in Cash withdrawals', () => {
  const t = byMerchant('ATM');
  assert.ok(t.m.startsWith('ATM '));
  assert.equal(t.c, 'Cash withdrawals');
});

test('Revolut top-up paid by card is a transfer, not an expense', () => {
  const t = byMerchant('Revolut**');
  assert.equal(t.k, KIND.TRANSFER);
});

test('"Platba kartou:" prefix is parsed like "Nákup:"', () => {
  const t = byMerchant('SHELL');
  assert.equal(t.d, '2024-03-09');
  assert.equal(t.c, 'Transport');
});

test('card row with an empty message falls back to the note', () => {
  const t = byMerchant('LIDL');
  assert.equal(t.m, 'LIDL 456');
  assert.equal(t.d, '2024-03-11');
});

test('transfers to and from an own account are transfers in both directions', () => {
  const out = txs.find((t) => t.m === 'Převod na spořicí účet');
  const back = txs.find((t) => t.m === 'Zpět z úspor');
  assert.equal(out.k, KIND.TRANSFER);
  assert.equal(back.k, KIND.TRANSFER);
  assert.equal(out.cp, '2900000002/2010');
});

test('payments with empty message and note are categorized by counterparty account', () => {
  const rent = txs.find((t) => t.cp === '4000000001/0100');
  assert.equal(rent.c, 'Housing & utilities');
  assert.equal(rent.m, 'Bezhotovostní platba'); // merchant falls back to the row type
  const util = txs.find((t) => t.cp === '0004000000002/0800'); // leading zeros as printed by the bank
  assert.equal(util.c, 'Housing & utilities');
  assert.equal(util.n, 'Elektřina'); // note kept when it differs from the message
  const ins = txs.find((t) => t.cp === '4000000003/0300');
  assert.equal(ins.c, 'Insurance');
});

test('interest is income, interest tax is an expense, salary is income', () => {
  assert.equal(txs.find((t) => t.t === 'Připsaný úrok').k, KIND.INCOME);
  assert.equal(txs.find((t) => t.t === 'Odvod daně z úroků').k, KIND.EXPENSE);
  assert.equal(txs.find((t) => t.m === 'MZDA 02/2024').k, KIND.INCOME);
});

test('a REVOLT bank code forces a transfer', () => {
  const t = txs.find((t) => t.m === 'Transfer to Revolut');
  assert.equal(t.k, KIND.TRANSFER);
});

test('investment account yields an investment', () => {
  assert.equal(txs.find((t) => t.m === 'PORTU investice').k, KIND.INVESTMENT);
});

test('note takes part in categorization', () => {
  assert.equal(txs.find((t) => t.n === 'Pizza party').c, 'Restaurants & cafés');
});

test('duplicate note equal to the message is dropped', () => {
  const t = byMerchant('Doručení PIN');
  assert.equal(t.n, '');
});

test('snapshot of all classified rows', () => {
  checkSnapshot('fio', txs);
});

test('identical rows inside one export are separate transactions, re-importing the file still dedupes', async () => {
  const { dedupe } = await import('../src/parsers/index.js');
  const header = '"Zdrojový účet";"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"';
  const ticket = '"2900000001";"05.03.2024";"-15";"CZK";"";"";"Nákup: DPMB, BRNO, CZ, dne 4.3.2024, částka  15.00 CZK";"Nákup: DPMB, BRNO, CZ, dne 4.3.2024, částka  15.00 CZK";"Karetní transakce"';
  const fee = '"2900000001";"05.03.2024";"-15";"CZK";"";"";"Nákup: DPMB, BRNO, CZ, dne 4.3.2024, částka  15.00 CZK";"Nákup: DPMB, BRNO, CZ, dne 4.3.2024, částka  15.00 CZK";"Poplatek - platební karta"';
  const csv = '﻿' + [header, ticket, ticket, ticket, fee].join('\r\n') + '\r\n';
  const rows = parseFio(csv);
  assert.equal(new Set(rows.map((r) => r.id)).size, 4, 'three identical tickets and a fee with the same text are four transactions');
  const again = parseFio(csv);
  assert.deepEqual(again.map((r) => r.id), rows.map((r) => r.id), 'ids are stable across parses');
  assert.equal(dedupe([...rows, ...again]).rows.length, 4, 'importing the same file twice adds nothing');
});
