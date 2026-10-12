#!/usr/bin/env node
// Generates the synthetic statement samples in samples/. Deterministic: the same bytes every run.
// The rows are hand-written to hit every parser branch; see tests/*.test.mjs for the coverage
// assertions. All people, merchants and account numbers are fictional (see samples/README.md).
//
//   node scripts/make-samples.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { writePdf } from './pdf-writer.mjs';

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

export function revolutSample() {
  const header = ['Typ', 'Produkt', 'Datum zahájení', 'Datum dokončení', 'Popis', 'Částka', 'Poplatek', 'Měna', 'State', 'Zůstatek'];
  const rows = [
    // [type, product, started, completed, description, amount, fee, currency, state, balance]
    ['Dobíjení', 'Aktuální', '2024-03-01 10:00:00', '2024-03-01 10:00:05', 'Dobití Apple Pay kartou *1234', '1000.00', '0.00', 'EUR', 'DOKONČENO', '1000.00'],
    ['Směna', 'Aktuální', '2024-03-02 09:00:00', '2024-03-02 09:00:00', 'Exchanged to USD', '-200.00', '0.00', 'EUR', 'DOKONČENO', '800.00'],
    ['Směna', 'Aktuální', '2024-03-02 09:00:00', '2024-03-02 09:00:00', 'Exchanged from EUR', '216.00', '0.00', 'USD', 'DOKONČENO', '216.00'],
    ['Platba kartou', 'Aktuální', '2024-03-03 08:36:06', '2024-03-04 03:12:33', 'Record Go', '-379.44', '0.00', 'EUR', 'DOKONČENO', '420.56'],
    ['Platba kartou', 'Aktuální', '2024-03-05 18:20:00', '2024-03-06 02:00:00', 'Shell Wien', '-40.00', '0.50', 'EUR', 'DOKONČENO', '380.06'],
    ['Platba kartou', 'Aktuální', '2024-03-06 12:00:00', '2024-03-06 12:00:01', 'Revolut Transfer to savings', '-20.00', '0.00', 'EUR', 'DOKONČENO', '360.06'],
    ['Platba kartou', 'Aktuální', '2024-03-07 12:00:00', '2024-03-07 12:00:01', 'Hotel Rejected', '-99.00', '0.00', 'EUR', 'VRÁCENO ZPĚT', '360.06'],
    ['Poplatek', 'Investice', '2024-03-10 08:48:55', '2024-03-10 08:48:55', 'Custody fees', '-0.05', '0.00', 'USD', 'DOKONČENO', '215.95'],
    ['Účtovat', 'Aktuální', '2024-03-12 03:08:36', '2024-03-12 03:08:36', 'Poplatek za plán Premium', '0.00', '10.14', 'EUR', 'DOKONČENO', '349.92'],
    ['FEE_REVERSAL', 'Investice', '2024-03-14 16:44:19', '2024-03-14 16:44:19', 'Reversal of custody fee duplication', '0.05', '0.00', 'USD', 'DOKONČENO', '216.00'],
    ['TRADE', 'Investice', '2024-03-15 23:18:31', '2024-03-18 02:19:57', 'Investing money', '-150.00', '0.00', 'USD', 'DOKONČENO', '66.00'],
    ['TRADE', 'Investice', '2024-03-20 23:18:31', '2024-03-22 02:19:57', 'Sold AAPL', '60.00', '0.00', 'USD', 'DOKONČENO', '126.00'],
    ['Převod', 'Aktuální', '2024-03-21 09:17:19', '2024-03-21 09:17:21', 'To DEGIRO', '-100.00', '0.00', 'EUR', 'DOKONČENO', '249.92'],
    ['Převod', 'Aktuální', '2024-03-22 09:17:19', '2024-03-22 09:17:21', 'To Jana Nováková', '-50.00', '0.00', 'EUR', 'DOKONČENO', '199.92'],
    ['Převod', 'Aktuální', '2024-03-23 09:17:19', '2024-03-23 09:17:21', 'From Petr Novák', '30.00', '0.00', 'EUR', 'DOKONČENO', '229.92'],
    ['Cashback', 'Aktuální', '2024-03-25 00:00:00', '2024-03-25 00:00:00', 'Cashback March', '1.50', '0.00', 'EUR', 'DOKONČENO', '231.42'],
  ];
  const lines = [header.join(',')];
  for (const r of rows) lines.push(r.join(','));
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------------
// Air Bank PDF statement. Geometry copied from a real statement: date column at x=60, type and
// transaction code at 108, name, account and details at 186, amount at 502, fee at 548, 11.6pt
// between lines. Cells are written in the same order as the real PDF's content stream.
// ---------------------------------------------------------------------------------------------
export const fmtCz = (n) => {
  const s = Math.abs(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (n < 0 ? '-' : '') + s;
};

export function airbankSampleRows() {
  const card = '516844******4400';
  return [
    { booked: '02.03.2024', executed: '02.03.2024', type: ['Příchozí úhrada'], code: '1000000101', name: ['ZAMĚSTNAVATEL S.R.O.'], acct: `${ACCT.employer} / 0100`, details: ['Mzda 02/2024'], amount: 45000, fee: 0 },
    { booked: '05.03.2024', executed: '03.03.2024', type: ['Platba kartou'], code: '1000000102', name: ['Jan Vzorek'], acct: card, details: ['BILLA 456 BRNO, BRNO,', '602 00, CZE'], amount: -512.3, fee: 0 },
    { booked: '07.03.2024', executed: '05.03.2024', type: ['Platba kartou'], code: '1000000103', name: ['Jan Vzorek'], acct: card, details: ['RYANAIR DUBLIN, DUBLIN,', 'IRL', '40,00 EUR kurz: 25,100 CZK/EUR'], amount: -1004, fee: 0 },
    { booked: '15.03.2024', executed: '15.03.2024', type: ['Odchozí úhrada'], code: '1000000104', name: ['PRONAJÍMATEL'], acct: `${ACCT.landlord} / 0100`, details: ['Nájem duben'], amount: -12500, fee: 0 },
    { booked: '16.03.2024', executed: '16.03.2024', type: ['Odchozí úhrada'], code: '1000000105', oldLayout: true, name: ['Vzorek, Jan'], acct: `${ACCT.fioMain} / 2010`, details: [], amount: -5000, fee: 0 },
    { booked: '20.03.2024', executed: '20.03.2024', type: ['Odměna za platby', 'mobilem'], code: '1000000106', name: ['Air Bank'], acct: null, details: [], amount: 50, fee: 0 },
    { booked: '22.03.2024', executed: '20.03.2024', type: ['Vrácení peněz'], code: '1000000107', name: ['Jan Vzorek'], acct: card, details: ['ALZA.CZ PRAHA, PRAHA,', '170 00'], amount: 1500, fee: 0 },
    { booked: '25.03.2024', executed: '25.03.2024', type: ['Odchozí úhrada'], code: '1000000108', name: ['ZONKY INVESTICE'], acct: `${ACCT.broker} / 2010`, details: ['Investice'], amount: -2000, fee: 0, after: ['Úročení 5,5 % p.a.'] },
    { booked: '27.03.2024', executed: '26.03.2024', type: ['Platba kartou'], code: '1000000109', name: ['Jan Vzorek'], acct: card, details: ['Revolut**1234* DUBLIN,', 'IRL'], amount: -2000, fee: 0 },
    { booked: '28.03.2024', executed: '27.03.2024', type: ['Výběr z bankomatu'], code: '1000000110', name: ['Jan Vzorek'], acct: card, details: ['ATM AIR BANK BRNO, BRNO,', 'CZE'], amount: -1000, fee: -30 },
    { booked: '31.03.2024', executed: '31.03.2024', type: ['Úrok z vkladu'], code: '1000000111', name: ['Air Bank'], acct: null, details: [], amount: 12.34, fee: 0 },
    { booked: '02.04.2024', executed: '01.04.2024', type: ['Platba kartou'], code: '1000000112', name: ['Jan Vzorek'], acct: card, details: ['KAVARNA U KOCKY, BRNO,', 'CZE'], amount: -85, fee: 0 },
  ];
}

export function airbankSample() {
  const rows = airbankSampleRows();
  const debits = rows.reduce((s, r) => s + (r.amount < 0 ? -r.amount + Math.abs(r.fee) : 0), 0);
  const credits = rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  const opening = 10000;
  const LINE = 11.6;
  const pages = [];
  let cells = [];
  let y = 790;
  const put = (x, text, size = 8) => cells.push({ x, y, text, size });
  const columnHeader = () => {
    const top = y;
    for (const [x, a, b] of [[60, 'Zaúčtování', 'Provedení'], [106, 'Typ', 'Kód transakce'], [184, 'Název', 'Číslo účtu / debetní karty Detaily Částka CZK Poplatky']]) {
      cells.push({ x, y: top, text: a, size: 7 });
      cells.push({ x, y: top - 10.2, text: b, size: 7 });
    }
    y = top - 26;
  };
  const furniture = (pageNo, total, more) => {
    const items = [];
    if (more) items.push('Pokračování na straně ' + (pageNo + 1));
    items.push('1048/25/01', `${pageNo}/${total}`, 'Air Bank a.s. / Evropská 2690/17 / 160 00 Praha 6 / IČO 00000000 / fiktivní výpis', 'Společnost zapsaná u rejstříkového soudu v Praze, spisová značka B 00000.');
    let fy = 20 + items.length * 9;
    for (const t of items) { cells.push({ x: 60, y: fy, text: t, size: 6 }); fy -= 9; }
  };

  // page 1 header (holder block, statement data, totals)
  for (const t of ['Jan Vzorek', 'Vzorová 1', '602 00 Brno', 'Česká republika']) { put(60, t, 9); y -= 12; }
  y -= 8;
  put(60, 'Výpis z běžného účtu', 11); y -= 16;
  for (const t of [
    `Číslo účtu: ${ACCT.airbank} / 3030`, 'Období výpisu: 1. 3. 2024 - 5. 4. 2024', 'Frekvence výpisu: Mimořádný výpis',
    'IBAN: CZ00 3030 0000 0010 0000 0001', 'Název účtu: Běžný účet', 'Datum výpisu: 5. 4. 2024', 'Měna: CZK', 'Číslo výpisu: 1',
    `Počáteční zůstatek: ${fmtCz(opening)} Připsáno na účet: ${fmtCz(credits)}`,
    `Konečný zůstatek: ${fmtCz(opening + credits - debits)} Odepsáno z účtu: ${fmtCz(debits)}`,
  ]) { put(60, t); y -= 12; }
  y -= 6;
  columnHeader();

  const blockHeight = (r) => Math.max(2, r.type.length + 1, r.name.length + (r.acct && !r.oldLayout ? 1 : 0) + r.details.length + (r.after || []).length) * LINE + 16;
  const pageBreakAt = 80;
  rows.forEach((r, idx) => {
    if (y - blockHeight(r) < pageBreakAt) {
      furniture(pages.length + 1, 2, true);
      pages.push(cells); cells = []; y = 790;
      columnHeader();
    }
    const top = y;
    cells.push({ x: 60, y: top, text: r.booked });
    cells.push({ x: 60, y: top - LINE, text: r.executed });
    r.type.forEach((t, i) => cells.push({ x: 108, y: top - i * LINE, text: t }));
    cells.push({ x: 108, y: top - r.type.length * LINE, text: r.oldLayout ? `${r.code} ${r.acct}` : r.code });
    let ly = top;
    for (const n of r.name) { cells.push({ x: 186, y: ly, text: n }); ly -= LINE; }
    if (r.acct && !r.oldLayout) { cells.push({ x: 186, y: ly, text: r.acct }); ly -= LINE; }
    for (const d of r.details) { cells.push({ x: 186, y: ly, text: d }); ly -= LINE; }
    cells.push({ x: 502, y: top, text: fmtCz(r.amount) });
    cells.push({ x: 548, y: top, text: fmtCz(r.fee) });
    for (const a of r.after || []) { cells.push({ x: 186, y: ly, text: a }); ly -= LINE; }
    y = top - blockHeight(r);
    if (idx === rows.length - 1) {
      y -= 10;
      put(60, 'Vklad na tomto účtu podléhá ochraně, kterou poskytuje systém pojištění pohledávek z vkladů. Podrobnější přehled', 6);
      furniture(pages.length + 1, 2, false);
      pages.push(cells);
    }
  });
  return writePdf(pages);
}

if (process.argv[1] && /make-samples\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  await mkdir(OUT, { recursive: true });
  await writeFile(new URL('fio-sample.csv', OUT), fioSample(), 'utf8');
  await writeFile(new URL('revolut-sample.csv', OUT), revolutSample(), 'utf8');
  await writeFile(new URL('airbank-sample.pdf', OUT), airbankSample());
  console.log('wrote samples/fio-sample.csv, samples/revolut-sample.csv, samples/airbank-sample.pdf');
}
