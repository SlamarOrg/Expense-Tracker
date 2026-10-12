// Settings are the rules JSON itself (same schema as rules/default-cz.json). The settings panel
// edits the account and FX sections as plain text; these helpers convert both ways and validate.

import { Rules } from './classifier/rules.js';

const clean = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

/** "label: 123/0100" or "123/0100" per line -> { label: account } */
export function parseAccountLines(text) {
  const out = {};
  for (const line of clean(text)) {
    const i = line.indexOf(':');
    const label = i > 0 ? line.slice(0, i).trim() : '';
    const acct = (i > 0 ? line.slice(i + 1) : line).trim().replace(/\s+/g, '');
    if (!/^[\d-]+(\/\d{4})?$/.test(acct)) throw new Error(`not an account number: "${line}"`);
    // unlabeled accounts get a non-numeric key so that object key order stays as typed
    out[label || 'account ' + acct] = acct;
  }
  return out;
}

export function formatAccountLines(obj) {
  return Object.entries(obj || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (k === v || k === 'account ' + v ? v : `${k}: ${v}`)).join('\n');
}

/** "Category: 123/0100, 456/0800" per line -> { Category: [accounts] } */
export function parseCategoryAccountLines(text, categories) {
  const out = {};
  for (const line of clean(text)) {
    const i = line.indexOf(':');
    if (i <= 0) throw new Error(`expected "Category: account, account": "${line}"`);
    const cat = line.slice(0, i).trim();
    if (categories && !categories.includes(cat)) throw new Error(`unknown category "${cat}"`);
    const accts = line.slice(i + 1).split(',').map((a) => a.trim().replace(/\s+/g, '')).filter(Boolean);
    for (const a of accts) if (!/^[\d-]+(\/\d{4})?$/.test(a)) throw new Error(`not an account number: "${a}"`);
    out[cat] = [...(out[cat] || []), ...accts];
  }
  return out;
}

export function formatCategoryAccountLines(obj) {
  return Object.entries(obj || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}: ${(v || []).join(', ')}`).join('\n');
}

/** "EUR = 25" per line -> { EUR: 25 }; CZK is always 1 */
export function parseFxLines(text) {
  const out = { CZK: 1 };
  for (const line of clean(text)) {
    const m = /^([A-Za-z]{3})\s*[=:]\s*([\d.,]+)$/.exec(line);
    if (!m) throw new Error(`expected "EUR = 25": "${line}"`);
    const rate = Number(m[2].replace(',', '.'));
    if (!(rate > 0)) throw new Error(`rate must be positive: "${line}"`);
    out[m[1].toUpperCase()] = rate;
  }
  return out;
}

export function formatFxLines(obj) {
  return Object.entries(obj || {}).filter(([k]) => !k.startsWith('_') && k !== 'CZK').map(([k, v]) => `${k} = ${v}`).join('\n');
}

/** Apply edited sections onto a rules JSON copy and validate the result. */
export function withSections(rulesJson, sections) {
  const next = JSON.parse(JSON.stringify(rulesJson));
  for (const key of ['own_accounts', 'investment_accounts', 'category_accounts', 'fx_rates_to_czk']) {
    if (sections[key] !== undefined) {
      const help = next[key] && next[key]._help ? { _help: next[key]._help } : {};
      next[key] = { ...help, ...sections[key] };
    }
  }
  Rules.from(next); // throws when invalid
  return next;
}

/** Validate an imported rules file; returns the parsed JSON or throws a readable error. */
export function parseRulesJson(text) {
  let json;
  try { json = JSON.parse(text); } catch (e) { throw new Error('not valid JSON: ' + e.message); }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('rules must be a JSON object');
  if (!json.categories || typeof json.categories !== 'object') throw new Error('rules.categories is missing');
  Rules.from(json);
  return json;
}

/** Add accounts (own, investment, category) from `extra` to a rules JSON copy; existing entries stay. */
export function mergeAccounts(rulesJson, extra) {
  const next = JSON.parse(JSON.stringify(rulesJson));
  for (const key of ['own_accounts', 'investment_accounts']) {
    next[key] = { ...(next[key] || {}) };
    for (const [k, v] of Object.entries(extra[key] || {})) if (!k.startsWith('_')) next[key][k] = v;
  }
  next.category_accounts = { ...(next.category_accounts || {}) };
  for (const [cat, accts] of Object.entries(extra.category_accounts || {})) {
    if (cat.startsWith('_')) continue;
    const have = new Set(next.category_accounts[cat] || []);
    next.category_accounts[cat] = [...have, ...accts.filter((a) => !have.has(a))];
  }
  return next;
}
