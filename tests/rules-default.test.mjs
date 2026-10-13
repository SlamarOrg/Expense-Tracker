import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Rules } from '../src/classifier/rules.js';

const json = JSON.parse(readFileSync(new URL('../rules/default-cz.json', import.meta.url), 'utf8'));
const rules = Rules.from(json);

test('default ruleset loads and ships no account numbers', () => {
  assert.equal(rules.ownAccounts.size, 0);
  assert.equal(rules.investAccounts.size, 0);
  assert.equal(rules.accountRules.size, 0);
  assert.ok(rules.categories.length >= 10);
  assert.ok(rules.categoryNames.includes('Other'));
  assert.deepEqual(Object.keys(rules.fx).sort(), ['CZK', 'EUR', 'USD']); // no _help key leaks into the footer
});

test('default ruleset has no short keyword that is not a known brand abbreviation', () => {
  // Three-letter keywords match inside other words easily. These were checked by hand.
  const allowed = new Set(['hbo', 'g2a', 'kfc', 'mhd', 'omv', 'c&a', 'h&m', 'xtb']);
  const offenders = [];
  const check = (where, kw) => {
    const core = kw.trim();
    if (core.length < 3) offenders.push(`${where}: "${kw}"`);
    else if (core.length === 3 && !/\s$/.test(kw) && !allowed.has(core)) offenders.push(`${where}: "${kw}"`);
  };
  for (const [cat, kws] of rules.categories) for (const kw of kws) check(cat, kw);
  for (const kw of [...rules.transferKw, ...rules.investKw]) check('flow', kw);
  assert.deepEqual(offenders, []);
});

test('default ruleset classifies common Czech merchants', () => {
  assert.equal(rules.categorize('Nákup: BILLA 123, Praha'), 'Groceries');
  assert.equal(rules.categorize('DEKUJEME, ROHLIK.CZ'), 'Groceries');
  assert.equal(rules.categorize('Spotify AB'), 'Subscriptions');
  assert.equal(rules.categorize('SHELL 1234 BRNO'), 'Transport');
  assert.equal(rules.categorize('Výběr z bankomatu: CS a.s.'), 'Cash withdrawals');
  assert.equal(rules.categorize('částka 120.50 CZK'), 'Other');
});
