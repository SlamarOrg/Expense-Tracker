// Static checks that every user-facing string goes through the dictionaries:
//  - no English literal is passed to el(), textContent, title, aria-label, placeholder or confirm()
//    in the UI code;
//  - every text node and labelling attribute in index.html is tagged with data-i18n(-attr);
//  - every key the code or the markup uses exists in en.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dictionaries } from '../src/i18n/index.js';

const root = new URL('..', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const UI_FILES = [...readdirSync(new URL('src/ui/', root)).map((f) => `src/ui/${f}`), 'src/app.js'];
// literals that are not language: symbols, units, file names, CSS class strings
const ALLOWED = new Set(['×', '—', '·', ' · ', 'Kč', 'EN', 'CS', 'rules.json', 'overrides.json', 'JSON']);
const looksLikeText = (s) => /[A-Za-z]{2,}/.test(s) && !ALLOWED.has(s.trim());

test('UI code passes no user-facing English literal to the DOM', () => {
  const offenders = [];
  const patterns = [
    /\bel\(\s*'[^']*'\s*,\s*(?:'[^']*'|null)\s*,\s*'([^']+)'/g, // el(tag, cls, 'text')
    /\btextContent\s*=\s*'([^']+)'/g,
    /\.title\s*=\s*'([^']+)'/g,
    /setAttribute\(\s*'(?:aria-label|title|placeholder)'\s*,\s*'([^']+)'/g,
    /\bconfirm\(\s*'([^']+)'/g,
    /\bel\(\s*'[^']*'\s*,\s*(?:'[^']*'|null)\s*,\s*`([^`]+)`/g,
  ];
  for (const file of UI_FILES) {
    const src = read(file);
    for (const re of patterns) for (const m of src.matchAll(re)) if (looksLikeText(m[1])) offenders.push(`${file}: ${m[1]}`);
  }
  assert.deepEqual(offenders, []);
});

test('every static text and labelling attribute in index.html is tagged for translation', () => {
  const html = read('index.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<title>[\s\S]*?<\/title>/, '');
  const offenders = [];
  // text directly inside an element: <tag ...>text<
  for (const m of html.matchAll(/<([a-z0-9]+)([^>]*)>([^<]+)</gi)) {
    const text = m[3].trim();
    if (!text || !looksLikeText(text)) continue;
    if (!/\sdata-i18n="/.test(m[2])) offenders.push(`<${m[1]}> ${text.slice(0, 50)}`);
  }
  for (const m of html.matchAll(/<([a-z0-9]+)([^>]*)>/gi)) {
    const attrs = m[2];
    for (const a of attrs.matchAll(/\s(aria-label|placeholder)="([^"]*)"/g)) {
      if (!looksLikeText(a[2])) continue;
      const tagged = new RegExp(`data-i18n-attr="[^"]*\\b${a[1]}:`).test(attrs);
      if (!tagged) offenders.push(`<${m[1]} ${a[1]}="${a[2]}">`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('every translation key used in code and markup exists in English', () => {
  const used = new Set();
  const files = [...UI_FILES, 'src/i18n/index.js'];
  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/\b(?:i18n\.)?t\(\s*'([a-z][\w.]*)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\b(?:i18n\.)?tn\(\s*'([a-z][\w.]*)'/g)) used.add(m[1] + '.other');
    for (const m of src.matchAll(/'((?:import|settings|notice|monthly|weekly|kpi|tx|other|ovr|footer|sub)\.[\w.]+)'/g)) used.add(m[1]);
  }
  const html = read('index.html');
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1].trim());
  const keys = Object.keys(dictionaries.en);
  // 'month.' + i style prefixes must have at least one key behind them
  const exists = (k) => (k.endsWith('.') ? keys.some((x) => x.startsWith(k)) : dictionaries.en[k] !== undefined || dictionaries.en[k + '.other'] !== undefined);
  const missing = [...used].filter((k) => !exists(k));
  assert.deepEqual(missing, []);
});
