#!/usr/bin/env node
// Generates the synthetic statement samples in samples/. Deterministic: the same bytes every run.
// The rows are hand-written to hit every parser branch; see tests/*.test.mjs for the coverage
// assertions. All people, merchants and account numbers are fictional (see samples/README.md).
//
//   node scripts/make-samples.mjs

import { mkdir, writeFile } from 'node:fs/promises';

const OUT = new URL('../samples/', import.meta.url);

// Fake account numbers. Own accounts and category accounts match tests/fixtures/rules.json.
export const ACCT = {
  fioMain: '2900000001',
  fioSavings: '2900000002',
  airbank: '1000000001',
  broker: '3000000001',
  landlord: '4000000001',
  utility: '4000000002',
  insurer: '4000000003',
  employer: '5500000001',
  friend: '5500000002',
};

const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';

export function fioSample() {
  const header = ['Zdrojový účet', 'Datum', 'Objem', 'Měna', 'Protiúčet', 'Kód banky', 'Zpráva pro příjemce', 'Poznámka', 'Typ'];
  const card = (msg) => msg;
  const rows = [
    // [date, amount, currency, counter, bank, message, note, type]
    ['05.03.2024', '-245,5', 'CZK', '', '', card('Nákup: BILLA 123, BRNO, CZ, dne 3.3.2024, částka  245.50 CZK'), card('Nákup: BILLA 123, BRNO, CZ, dne 3.3.2024, částka  245.50 CZK'), 'Karetní transakce'],
    ['06.03.2024', '-251,2', 'CZK', '', '', 'Nákup: SPOTIFY AB, STOCKHOLM, SE, dne 4.3.2024, částka  9.99 EUR', 'Nákup: SPOTIFY AB, STOCKHOLM, SE, dne 4.3.2024, částka  9.99 EUR', 'Karetní transakce'],
    ['08.03.2024', '1500', 'CZK', '', '', 'Kredit: ALZA.CZ, PRAHA, CZ, dne 6.3.2024, částka  1500.00 CZK', 'Kredit: ALZA.CZ, PRAHA, CZ, dne 6.3.2024, částka  1500.00 CZK', 'Karetní transakce'],
    ['08.03.2024', '-2000', 'CZK', '', '', 'Výběr z bankomatu: ATM CS A.S., BRNO, CZ, dne 7.3.2024, částka  2000.00 CZK', 'Výběr z bankomatu: ATM CS A.S., BRNO, CZ, dne 7.3.2024, částka  2000.00 CZK', 'Karetní transakce'],
    ['09.03.2024', '-2000', 'CZK', '', '', 'Nákup: Revolut**1234*, DUBLIN, IE, dne 8.3.2024, částka  2000.00 CZK', 'Nákup: Revolut**1234*, DUBLIN, IE, dne 8.3.2024, částka  2000.00 CZK', 'Karetní transakce'],
    ['11.03.2024', '-1200', 'CZK', '', '', 'Platba kartou: SHELL 1234, BRNO, CZ, dne 9.3.2024, částka  1200.00 CZK', 'Platba kartou: SHELL 1234, BRNO, CZ, dne 9.3.2024, částka  1200.00 CZK', 'Karetní transakce'],
    ['12.03.2024', '-89,9', 'CZK', '', '', '', 'Nákup: LIDL 456, BRNO, CZ, dne 11.3.2024, částka  89.90 CZK', 'Karetní transakce'],
    ['12.03.2024', '-5000', 'CZK', ACCT.fioSavings, '2010', 'Převod na spořicí účet', '', 'Platba převodem uvnitř banky'],
    ['13.03.2024', '5000', 'CZK', ACCT.fioSavings, '2010', 'Zpět z úspor', '', 'Platba převodem uvnitř banky'],
    ['15.03.2024', '-12500', 'CZK', ACCT.landlord, '0100', '', '', 'Bezhotovostní platba'],
    ['15.03.2024', '-1890', 'CZK', `000${ACCT.utility}`, '0800', 'Faktura 2024-03', 'Elektřina', 'Bezhotovostní platba'],
    ['16.03.2024', '-650', 'CZK', ACCT.insurer, '0300', 'Pojistka 2024', '', 'Bezhotovostní platba'],
    ['18.03.2024', '-3000', 'CZK', ACCT.broker, '2010', 'PORTU investice', '', 'Bezhotovostní platba'],
    ['20.03.2024', '45000', 'CZK', ACCT.employer, '0100', 'MZDA 02/2024', '', 'Bezhotovostní příjem'],
    ['21.03.2024', '-420', 'CZK', ACCT.friend, '0300', '', 'Pizza party', 'Okamžitá odchozí platba'],
    ['22.03.2024', '-3000', 'CZK', 'LT123456789', 'REVOLTLT', 'Transfer to Revolut', '', 'Platba cizoměnová či zahraniční'],
    ['25.03.2024', '-200', 'CZK', '', '', 'Doručení PIN poštou', 'Doručení PIN poštou', 'Poplatek - platební karta'],
    ['31.03.2024', '1,23', 'CZK', '', '', '', '', 'Připsaný úrok'],
    ['31.03.2024', '-0,18', 'CZK', '', '', '', '', 'Odvod daně z úroků'],
    ['02.04.2024', '-990', 'CZK', ACCT.friend, '0300', 'Chata víkend', 'ubytování', 'Okamžitá odchozí platba'],
  ];
  const lines = [header.map(q).join(';')];
  for (const r of rows) lines.push([ACCT.fioMain, ...r].map(q).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

if (process.argv[1] && /make-samples\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  await mkdir(OUT, { recursive: true });
  await writeFile(new URL('fio-sample.csv', OUT), fioSample(), 'utf8');
  console.log('wrote samples/fio-sample.csv');
}
