// Shared data shapes. Documentation only; nothing is exported at runtime.

/**
 * What a parser knows from the statement alone. Stored as-is so that rule changes can
 * re-classify without re-importing the file.
 *
 * @typedef {object} RawRow
 * @property {'FIO'|'Airbank'|'Revolut'} bank
 * @property {string} date      ISO date to report: purchase date for card rows, execution date otherwise
 * @property {string} booked    ISO booking date
 * @property {number} amount    signed amount as printed, negative = money out, before fees
 * @property {string} currency  ISO code
 * @property {number} fee       absolute fee amount in the same currency, added to expenses only
 * @property {string} merchant  payee or merchant as extracted
 * @property {string} note      free text (message for recipient, note)
 * @property {string} type      statement row type as printed
 * @property {string} counter   counterparty account "number/bank", or ''
 * @property {string} text      text used to decide the kind (transfer and investment keywords)
 * @property {string} raw       extra text used only for category keywords (for example the full FIO message)
 * @property {RawHints} hints
 * @property {string} id        stable id for dedup, prefixed by bank
 */

/**
 * Bank-specific decisions the parser alone can make.
 *
 * @typedef {object} RawHints
 * @property {'expense'|'income'|'transfer'|'investment'|'skip'|'transferUnlessInvestment'} [kind]
 *   Fixed kind. 'transferUnlessInvestment' means: investment when an investment keyword matches
 *   the text, transfer otherwise (Revolut "Převod").
 * @property {boolean} [transferIfExpense]
 *   When the generic flow decides "expense", make it a transfer instead (card top-ups to Revolut).
 */

/**
 * The row the dashboard works with.
 *
 * @typedef {object} Tx
 * @property {string} d    ISO date
 * @property {number} amt  CZK spend: positive = money out, negative = refund
 * @property {number} orig signed amount as printed, fees included
 * @property {string} cur  original currency code
 * @property {string} m    merchant or payee, max 80 chars
 * @property {string} n    note, max 120 chars
 * @property {string} s    source bank
 * @property {string} t    statement row type as printed
 * @property {'expense'|'investment'|'transfer'|'income'|'skip'} k
 * @property {string} c    category after overrides
 * @property {string} c0   category from rules, before overrides
 * @property {string} cp   counterparty account 'number/bank' or ''
 * @property {string} id   stable id for dedup
 */

export {};
