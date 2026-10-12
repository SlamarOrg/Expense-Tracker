// Classification rules. The JSON schema is the one the private categories.json uses:
// fx_rates_to_czk, own_accounts, transfer_keywords, investment_accounts, investment_keywords,
// categories (ordered, first match wins), folded_in_charts, category_accounts.
// Keys starting with "_" are comments and are skipped.

import { norm } from './normalize.js';

// Keywords keep an intentional leading or trailing space ("stk " must not match "částka"),
// while the inside is normalized like any text. An edge space means "word boundary": the
// keyword must be followed (or preceded) by a non-alphanumeric character or the end of the text,
// so "obi " matches "OBI, BRNO" and "obi brno" but not "mobil".
export const normKeyword = (k) => (/^\s/.test(k) ? ' ' : '') + norm(k) + (/\s$/.test(k) ? ' ' : '');

const WORD = /[a-z0-9]/;
/** True when normalized `text` contains normalized keyword `kw`, honouring edge-space boundaries. */
export function keywordMatches(text, kw) {
  const lead = kw.startsWith(' ');
  const trail = kw.endsWith(' ');
  const core = kw.trim();
  if (!lead && !trail) return text.includes(core);
  let from = 0;
  for (;;) {
    const i = text.indexOf(core, from);
    if (i < 0) return false;
    const okLead = !lead || i === 0 || !WORD.test(text[i - 1]);
    const okTrail = !trail || i + core.length >= text.length || !WORD.test(text[i + core.length]);
    if (okLead && okTrail) return true;
    from = i + 1;
  }
}

const stripAccount = (acct) => String(acct || '').split('/')[0].trim().replace(/^0+/, '');

function accountSet(section) {
  const out = new Set();
  for (const [k, v] of Object.entries(section || {})) {
    if (k.startsWith('_')) continue;
    const a = stripAccount(v);
    if (a) out.add(a);
  }
  return out;
}

export class Rules {
  /** @param {object} json parsed rules file */
  static from(json) {
    return new Rules(json);
  }

  constructor(json) {
    if (!json || typeof json !== 'object') throw new Error('rules must be an object');
    if (!json.categories || typeof json.categories !== 'object') throw new Error('rules.categories is missing');
    this.source = json;
    this.fx = { CZK: 1, ...(json.fx_rates_to_czk || {}) };
    this.ownAccounts = accountSet(json.own_accounts);
    this.investAccounts = accountSet(json.investment_accounts);
    this.transferKw = (json.transfer_keywords || []).map(normKeyword).filter((k) => k.trim());
    this.investKw = (json.investment_keywords || []).map(normKeyword).filter((k) => k.trim());
    this.categories = Object.entries(json.categories)
      .filter(([cat]) => !cat.startsWith('_'))
      .map(([cat, kws]) => [cat, (kws || []).map(normKeyword).filter((k) => k.trim())]);
    this.folded = (json.folded_in_charts && json.folded_in_charts.categories) || [];
    this.accountRules = new Map();
    for (const [cat, accts] of Object.entries(json.category_accounts || {})) {
      if (cat.startsWith('_')) continue;
      for (const a of accts || []) {
        const key = stripAccount(a);
        if (key) this.accountRules.set(key, cat);
      }
    }
    this.categoryNames = [...this.categories.map(([c]) => c), 'Other'];
    /** @type {string[]} unknown currencies and other soft problems met while classifying */
    this.warnings = [];
  }

  categoryForAccount(counter) {
    const key = stripAccount(counter);
    return key ? this.accountRules.get(key) || null : null;
  }

  toCzk(amount, currency) {
    let rate = this.fx[currency];
    if (rate === undefined) {
      const msg = `no FX rate for ${currency}, assuming 1:1 - add it to fx_rates_to_czk`;
      if (!this.warnings.includes(msg)) this.warnings.push(msg);
      rate = 1;
    }
    return Math.round(amount * rate * 100) / 100;
  }

  isOwnAccount(acct) {
    const key = stripAccount(acct);
    return key !== '' && this.ownAccounts.has(key);
  }

  isInvestAccount(acct) {
    const key = stripAccount(acct);
    return key !== '' && this.investAccounts.has(key);
  }

  /** First keyword found in already-normalized text, or null. */
  matches(text, keywords) {
    for (const kw of keywords) if (keywordMatches(text, kw)) return kw;
    return null;
  }

  /** Category for free text (normalized here). "Other" when nothing matches. */
  categorize(text) {
    const t = norm(text);
    for (const [cat, kws] of this.categories) if (this.matches(t, kws)) return cat;
    return 'Other';
  }
}
