import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, parseCzNumber, isoDate } from '../src/classifier/normalize.js';

test('norm lowercases, strips diacritics and collapses whitespace', () => {
  assert.equal(norm('DEKUJEME, ROHLIK.CZ'), 'dekujeme, rohlik.cz');
  assert.equal(norm('Příliš  žluťoučký\tkůň'), 'prilis zlutoucky kun');
  assert.equal(norm('  Nákup: BILLA, dne 3.1.2024  '), 'nakup: billa, dne 3.1.2024');
  assert.equal(norm('ÚČET Č. 12'), 'ucet c. 12');
});

test('norm tolerates null, undefined and non-string input', () => {
  assert.equal(norm(null), '');
  assert.equal(norm(undefined), '');
  assert.equal(norm(''), '');
  assert.equal(norm(42), '42');
});

test('norm keeps the regression text that once matched a short keyword', () => {
  // `stk ` used to match `částka ` after normalization; the parser must see it normalized the same way
  assert.equal(norm('částka 120.50 CZK'), 'castka 120.50 czk');
  assert.ok(norm('částka 120.50 CZK').includes('stka '));
});

test('parseCzNumber reads Czech formatted amounts', () => {
  assert.equal(parseCzNumber('-1 012,00'), -1012);
  assert.equal(parseCzNumber('1 176 841,47'), 1176841.47);
  assert.equal(parseCzNumber('70,00'), 70);
  assert.equal(parseCzNumber('0,00'), 0);
  assert.equal(parseCzNumber('-1 012,50'), -1012.5); // non-breaking space
  assert.equal(parseCzNumber('-1 012,50'), -1012.5); // narrow no-break space
  assert.equal(parseCzNumber('123.45'), 123.45); // already dotted
});

test('parseCzNumber treats empty and lone minus as zero', () => {
  assert.equal(parseCzNumber(''), 0);
  assert.equal(parseCzNumber('-'), 0);
  assert.equal(parseCzNumber('   '), 0);
  assert.equal(parseCzNumber(null), 0);
});

test('isoDate converts Czech day.month.year', () => {
  assert.equal(isoDate('22.09.2022'), '2022-09-22');
  assert.equal(isoDate('3.1.2024'), '2024-01-03');
  assert.equal(isoDate(' 10.10.2026 '), '2026-10-10');
  assert.equal(isoDate('1. 2. 2023'), '2023-02-01');
});

test('isoDate passes ISO dates through and rejects garbage', () => {
  assert.equal(isoDate('2024-01-03'), '2024-01-03');
  assert.throws(() => isoDate('yesterday'));
  assert.throws(() => isoDate(''));
});
