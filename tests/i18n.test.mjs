import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, tn, setLanguage, getLanguage, setStrict, detectLanguage, dictionaries } from '../src/i18n/index.js';

test('English and Czech dictionaries have the same keys, plural forms aside', () => {
  const base = (k) => k.replace(/\.(one|few|many|other|two|zero)$/, '');
  const en = new Set(Object.keys(dictionaries.en).map(base));
  const cs = new Set(Object.keys(dictionaries.cs).map(base));
  assert.deepEqual([...en].filter((k) => !cs.has(k)), [], 'missing in cs');
  assert.deepEqual([...cs].filter((k) => !en.has(k)), [], 'missing in en');
});

test('every plural key has an "other" form in both languages', () => {
  for (const [lang, dict] of Object.entries(dictionaries)) {
    const plurals = new Set(Object.keys(dict).filter((k) => /\.(one|few|many)$/.test(k)).map((k) => k.replace(/\.\w+$/, '')));
    for (const p of plurals) assert.ok(dict[`${p}.other`] !== undefined, `${lang}: ${p}.other`);
  }
});

test('placeholders match between languages', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const [k, v] of Object.entries(dictionaries.en)) {
    if (dictionaries.cs[k] !== undefined) assert.equal(ph(dictionaries.cs[k]), ph(v), k);
  }
});

test('t substitutes parameters, falls back to English, renders unknown keys or throws in strict mode', () => {
  setLanguage('en', { persist: false });
  assert.equal(t('kpi.vsPrev', { days: 30, amount: '100 Kč' }), 'vs previous 30 days (100 Kč)');
  setLanguage('cs', { persist: false });
  assert.equal(getLanguage(), 'cs');
  assert.equal(t('preset.ytd'), 'Letos');
  dictionaries.en['test.onlyEnglish'] = 'only english';
  assert.equal(t('test.onlyEnglish'), 'only english');
  delete dictionaries.en['test.onlyEnglish'];
  assert.equal(t('no.such.key'), 'no.such.key');
  setStrict(true);
  assert.throws(() => t('no.such.key'), /missing i18n key/);
  setStrict(false);
  setLanguage('xx', { persist: false });
  assert.equal(getLanguage(), 'cs', 'unknown language is ignored');
});

test('tn picks Czech and English plural forms', () => {
  setLanguage('cs', { persist: false });
  assert.equal(tn('tx.count', 1), '1 transakce');
  assert.equal(tn('tx.count', 3), '3 transakce');
  assert.equal(tn('tx.count', 5), '5 transakcí');
  assert.equal(tn('tx.count', 0), '0 transakcí');
  setLanguage('en', { persist: false });
  assert.equal(tn('tx.count', 1), '1 transaction');
  assert.equal(tn('tx.count', 2), '2 transactions');
});

test('detectLanguage picks Czech for Czech and Slovak browsers, English otherwise', () => {
  assert.equal(detectLanguage({ language: 'cs-CZ' }), 'cs');
  assert.equal(detectLanguage({ language: 'sk' }), 'cs');
  assert.equal(detectLanguage({ language: 'de-DE' }), 'en');
  assert.equal(detectLanguage({}), 'en');
});
