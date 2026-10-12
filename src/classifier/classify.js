// Turns a parser's RawRow into the Tx the dashboard uses, applying the user's rules.
// Kind precedence is fixed: transfer, then income, then investment, then expense.

import { norm } from './normalize.js';

export const KIND = Object.freeze({
  EXPENSE: 'expense',
  INVESTMENT: 'investment',
  TRANSFER: 'transfer',
  INCOME: 'income',
  SKIP: 'skip',
});

const FIXED_CATEGORY = { [KIND.TRANSFER]: 'Transfers', [KIND.INCOME]: 'Income', [KIND.SKIP]: 'Skipped', [KIND.INVESTMENT]: 'Investments' };

const round2 = (n) => Math.round(n * 100) / 100;

/** Generic decision for a bank row that carries no bank-specific hint. */
export function classifyFlow(amount, counter, text, rules) {
  const t = norm(text);
  if (rules.isOwnAccount(counter) || rules.matches(t, rules.transferKw)) return KIND.TRANSFER;
  if (amount > 0) return KIND.INCOME;
  if (rules.isInvestAccount(counter) || rules.matches(t, rules.investKw)) return KIND.INVESTMENT;
  return KIND.EXPENSE;
}

function decideKind(raw, rules) {
  const hints = raw.hints || {};
  if (hints.kind === 'transferUnlessInvestment') {
    return rules.matches(norm(raw.text), rules.investKw) ? KIND.INVESTMENT : KIND.TRANSFER;
  }
  if (hints.kind) return hints.kind;
  const kind = classifyFlow(raw.amount, raw.counter, raw.text, rules);
  if (kind === KIND.EXPENSE && hints.transferIfExpense) return KIND.TRANSFER;
  return kind;
}

/**
 * @param {import('./types.js').RawRow} raw
 * @param {import('./rules.js').Rules} rules
 * @returns {import('./types.js').Tx}
 */
export function classify(raw, rules) {
  const kind = decideKind(raw, rules);
  let amount = raw.amount;
  if (kind === KIND.EXPENSE && raw.fee) amount -= Math.abs(raw.fee);
  const czk = rules.toCzk(amount, raw.currency);
  let category;
  if (kind === KIND.EXPENSE) {
    category = rules.categoryForAccount(raw.counter) || rules.categorize([raw.merchant, raw.note, raw.raw].join(' '));
  } else {
    category = FIXED_CATEGORY[kind];
  }
  return {
    d: raw.date,
    amt: round2(-czk),
    orig: round2(amount),
    cur: raw.currency,
    m: String(raw.merchant || '').trim().slice(0, 80),
    n: String(raw.note || '').trim().slice(0, 120),
    s: raw.bank,
    t: raw.type,
    k: kind,
    c: category,
    c0: category,
    cp: raw.counter || '',
    id: raw.id,
  };
}
