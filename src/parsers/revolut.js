// Revolut "account-statement" CSV export: ',' delimited, dot decimals, ISO timestamps. Headers
// are Czech or English depending on the app language; both are accepted. Only completed rows
// count. Only card payments are spending; exchange legs are skipped, top-ups are transfers,
// trades are investments (buy) or income (sell), transfers to a broker are investments.

import { readCsv } from './csv.js';
import { numberRepeats } from './ids.js';
import { norm } from '../classifier/normalize.js';

const COMPLETED = new Set(['DOKONČENO', 'DOKONCENO', 'COMPLETED']);
const pick = (row, ...names) => {
  for (const n of names) if (row[n] !== undefined && row[n] !== '') return row[n];
  return '';
};

/**
 * @param {string} text CSV file content
 * @returns {import('../classifier/types.js').RawRow[]}
 */
export function parseRevolut(text) {
  const out = [];
  for (const row of readCsv(text, { delimiter: ',' })) {
    const state = pick(row, 'State', 'Stav').trim().toUpperCase();
    if (!COMPLETED.has(state)) continue;
    const type = pick(row, 'Typ', 'Type').trim();
    let desc = pick(row, 'Popis', 'Description').trim();
    const started = pick(row, 'Datum zahájení', 'Started Date');
    const completed = pick(row, 'Datum dokončení', 'Completed Date') || started;
    const amount = Number(pick(row, 'Částka', 'Amount') || 0);
    const fee = Math.abs(Number(pick(row, 'Poplatek', 'Fee') || 0));
    const currency = pick(row, 'Měna', 'Currency').trim() || 'CZK';
    const nd = norm(desc);

    const hints = {};
    if (type === 'Platba kartou' || type === 'CARD_PAYMENT') {
      hints.kind = nd.includes('revolut') && nd.includes('transfer') ? 'transfer' : 'expense';
    } else if (type === 'Poplatek' || type === 'FEE' || type === 'Účtovat') {
      hints.kind = amount !== 0 ? 'expense' : 'skip';
      desc = desc || 'Revolut fee';
    } else if (type === 'FEE_REVERSAL') {
      hints.kind = 'expense'; // positive amount, nets as a refund
    } else if (type === 'TRADE') {
      hints.kind = amount < 0 ? 'investment' : 'income';
    } else if (type === 'Převod' || type === 'TRANSFER') {
      hints.kind = amount < 0 ? 'transferUnlessInvestment' : 'income';
    } else if (type === 'Směna' || type === 'EXCHANGE') {
      hints.kind = 'skip'; // one leg of a currency exchange
    } else if (type === 'Dobíjení' || type === 'TOPUP') {
      hints.kind = 'transfer';
    }

    out.push({
      bank: 'Revolut',
      date: started.slice(0, 10),
      booked: completed.slice(0, 10),
      amount,
      currency,
      fee,
      merchant: desc,
      note: '',
      type,
      counter: '',
      text: desc,
      raw: '',
      hints,
      id: `REV|${started}|${type}|${desc}|${amount}|${currency}`,
    });
  }
  return numberRepeats(out);
}
