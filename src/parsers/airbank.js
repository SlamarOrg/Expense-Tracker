// Air Bank PDF statement. The text is read with pdf.js in content-stream order (see pdf-text.js),
// which gives one clean block per transaction:
//
//   booking date, execution date, type (may span two lines), transaction code (10-12 digits,
//   on older statements followed by the counterparty account), payee name lines, card number
//   "516844******4400" or account "NNN / BBBB", detail lines, then an "amount fee" line such as
//   "-1 012,00 0,00". Some blocks carry extra text after the amount line, so the last line that
//   looks like an amount is the amount line, not the last line of the block.
//
// Page furniture (continuation notes, page numbers, the bank's footer, repeated column headers)
// is stripped first; the table ends at "Vklad na tomto účtu podléhá". The header prints
// "Odepsáno z účtu" and "Připsáno na účet"; the parsed sums are compared with them so a
// misparse is visible instead of silent.

import { pdfToLines } from './pdf-text.js';
import { isoDate, norm, parseCzNumber } from '../classifier/normalize.js';

const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
const CODE_RE = /^(\d{10,12})(?:\s+(.+))?$/;
const CARD_RE = /^\d{6}\*{4,}\d{4}$/;
const ACCT_RE = /^[\d-]{3,}\s*\/\s*\d{4}$/;
const AMOUNT_RE = /^(.*?)\s*(-?\d[\d ]*,\d{2})\s+(-?\d[\d ]*,\d{2})$/;
const NOISE_RE = /^(Pokračování na straně \d+|1048\/\d+\/\d+|\d+\/\d+|Air Bank a\.s\. \/.*|Společnost zapsaná.*|Zaúčtování|Provedení|Typ|Kód transakce|Název|Číslo účtu \/ debetní karty Detaily Částka CZK Poplatky)$/;
const END_RE = /^Vklad na tomto účtu podléhá/;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Parse already extracted text lines (pure, testable without pdf.js).
 * @param {string[]} lines
 * @returns {{ rows: import('../classifier/types.js').RawRow[], summary: object }}
 */
export function parseAirbankLines(lines) {
  const header = lines.slice(0, 40).join('\n');
  const summary = { account: '?', debits: null, credits: null };
  let m = /Odepsáno z účtu:\s*([\d ]+,\d{2})/.exec(header);
  if (m) summary.debits = parseCzNumber(m[1]);
  m = /Připsáno na účet:\s*([\d ]+,\d{2})/.exec(header);
  if (m) summary.credits = parseCzNumber(m[1]);
  m = /Číslo účtu:\s*([\d-]+)\s*\/\s*(\d{4})/.exec(header);
  if (m) summary.account = `${m[1]}/${m[2]}`;

  // body: drop furniture and blank lines, stop at the legal footer
  const body = [];
  for (const raw of lines) {
    const ln = raw.trim();
    if (END_RE.test(ln)) break;
    if (!ln || ln === '\f' || NOISE_RE.test(ln)) continue;
    body.push(ln);
  }

  // blocks start with two consecutive date lines
  const blocks = [];
  let cur = null;
  for (let i = 0; i < body.length; i++) {
    if (i + 1 < body.length && DATE_RE.test(body[i]) && DATE_RE.test(body[i + 1])) {
      if (cur) blocks.push(cur);
      cur = [body[i], body[i + 1]];
      i++;
      continue;
    }
    if (cur) cur.push(body[i]);
  }
  if (cur) blocks.push(cur);

  const rows = [];
  const problems = [];
  for (const b of blocks) {
    const booked = isoDate(b[0]);
    const executed = isoDate(b[1]);
    const rest = b.slice(2);
    const codeIdx = rest.findIndex((ln) => CODE_RE.test(ln));
    if (codeIdx < 0) { problems.push(b.join(' | ').slice(0, 160)); continue; }
    const type = rest.slice(0, codeIdx).join(' ');
    const cm = CODE_RE.exec(rest[codeIdx]);
    const code = cm[1];
    let tail = (cm[2] ? [cm[2].trim()] : []).concat(rest.slice(codeIdx + 1));
    // the amount line is the LAST line carrying "amount fee"; anything after it is extra detail
    let amtIdx = -1;
    for (let j = tail.length - 1; j >= 0; j--) if (AMOUNT_RE.test(tail[j])) { amtIdx = j; break; }
    if (amtIdx < 0) { problems.push(b.join(' | ').slice(0, 160)); continue; }
    const am = AMOUNT_RE.exec(tail[amtIdx]);
    const lastText = am[1].trim();
    const amount = parseCzNumber(am[2]);
    const fee = parseCzNumber(am[3]);
    tail = tail.slice(0, amtIdx).concat(lastText ? [lastText] : [], tail.slice(amtIdx + 1));
    const acctIdx = tail.findIndex((ln) => CARD_RE.test(ln) || ACCT_RE.test(ln));
    let names;
    let counter;
    let details;
    if (acctIdx < 0) { names = tail.slice(0, 1); counter = ''; details = tail.slice(1); }
    else { names = tail.slice(0, acctIdx); counter = tail[acctIdx]; details = tail.slice(acctIdx + 1); }
    const name = names.join(' ').trim();
    const detail = details.join(' ').trim();
    const isCard = CARD_RE.test(counter);
    let merchant;
    let note;
    let counterAcct;
    if (isCard) { merchant = detail || name || type; note = ''; counterAcct = ''; }
    else { merchant = name || type; note = detail; counterAcct = counter.replace(/\s+/g, ''); }

    const nt = norm(type);
    const hints = {};
    if (nt.includes('vraceni')) hints.kind = 'expense'; // card refund, nets as negative spend
    else if (nt.includes('odmena') || nt.includes('urok')) hints.kind = 'income';
    else if (isCard && norm(merchant).startsWith('revolut')) hints.transferIfExpense = true;

    rows.push({
      bank: 'Airbank',
      date: executed,
      booked,
      amount,
      currency: 'CZK',
      fee: Math.abs(fee),
      merchant,
      note,
      type,
      counter: counterAcct,
      text: [type, name, detail].join(' '),
      raw: '',
      hints,
      id: `AB|${code}`,
    });
  }

  // totals as the statement prints them: debits include fees
  summary.parsedDebits = round2(rows.reduce((s, r) => s + (r.amount < 0 ? -r.amount + r.fee : 0), 0));
  summary.parsedCredits = round2(rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0));
  summary.rows = rows.length;
  summary.problems = problems;
  summary.ok = problems.length === 0 && summary.debits !== null && Math.abs(summary.debits - summary.parsedDebits) < 0.005;
  return { rows, summary };
}

/**
 * @param {Uint8Array|ArrayBuffer} bytes PDF file content
 * @param {object} pdfjs pdf.js library namespace
 */
export async function parseAirbank(bytes, pdfjs) {
  const lines = await pdfToLines(bytes, pdfjs);
  return parseAirbankLines(lines);
}
