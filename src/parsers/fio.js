// FIO banka "Pohyby na účtu" CSV export: UTF-8 with BOM, ';' delimited, every field quoted,
// comma decimals, dd.mm.yyyy dates. One export can cover several accounts (column "Zdrojový účet").
//
// Card rows ("Karetní transakce") hide the useful data in the message:
//   Nákup: MERCHANT, address, dne d.m.yyyy, částka X CUR
// The "dne" date is the real purchase date; "Kredit:" means a card refund; "Výběr z bankomatu:" a
// cash withdrawal. The message is also kept as `raw` so that categorization sees the whole text
// (FIO prints "DEKUJEME, ROHLIK.CZ" and the merchant cut at the first comma is useless).

import { readCsv } from './csv.js';
import { numberRepeats } from './ids.js';
import { isoDate, norm, parseCzNumber } from '../classifier/normalize.js';

const CARD_RE = /^(Nákup|Výběr z bankomatu|Kredit|Platba kartou):\s*(.*?),(.*?)(?:,\s*dne\s+(\d{1,2}\.\d{1,2}\.\d{4}))?(?:,\s*částka\s+([\d.]+)\s+([A-Z]{3}))?\s*$/;

/**
 * @param {string} text CSV file content
 * @returns {import('../classifier/types.js').RawRow[]}
 */
export function parseFio(text) {
  const out = [];
  for (const row of readCsv(text, { delimiter: ';' })) {
    const acct = (row['Zdrojový účet'] || '').trim();
    const booked = isoDate(row['Datum']);
    const amount = parseCzNumber(row['Objem']);
    const currency = (row['Měna'] || '').trim() || 'CZK';
    const counter = (row['Protiúčet'] || '').trim();
    const bankCode = (row['Kód banky'] || '').trim();
    const msg = (row['Zpráva pro příjemce'] || '').trim();
    const note = (row['Poznámka'] || '').trim();
    const type = (row['Typ'] || '').trim();
    const isCard = type === 'Karetní transakce';

    let merchant = msg || note || type;
    let date = booked;
    let refund = false;
    if (isCard) {
      const m = CARD_RE.exec(msg || note);
      if (m) {
        const prefix = m[1];
        merchant = m[2].trim();
        if (m[4]) date = isoDate(m[4]); // purchase date, booking is 1-3 days later
        if (prefix === 'Kredit') refund = true; // card refund
        if (prefix === 'Výběr z bankomatu') merchant = 'ATM ' + merchant;
      }
      if ((msg || note).startsWith('Výběr') && !merchant.startsWith('ATM')) merchant = 'ATM ' + merchant;
    }

    const hints = {};
    if (refund) hints.kind = 'expense'; // positive amount, nets as negative spend
    else if (type === 'Připsaný úrok') hints.kind = 'income';
    else if (type === 'Odvod daně z úroků') hints.kind = 'expense';
    else if (isCard && norm(merchant).startsWith('revolut')) hints.transferIfExpense = true; // Revolut top-up paid by card
    if (bankCode.toUpperCase().includes('REVOLT')) hints.kind = 'transfer'; // bank code of Revolut

    out.push({
      bank: 'FIO',
      date,
      booked,
      amount,
      currency,
      fee: 0,
      merchant,
      note: note !== msg ? note : '',
      type,
      counter: counter ? `${counter}/${bankCode}` : '',
      text: [merchant, msg, note, type].join(' '),
      raw: msg,
      hints,
      // no transaction id in the export: content key, repeats numbered by numberRepeats()
      id: `FIO|${acct}|${booked}|${amount}|${currency}|${type}|${counter}/${bankCode}|${msg}|${note}`,
    });
  }
  return numberRepeats(out);
}
