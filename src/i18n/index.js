// UI strings in English and Czech. `t(key, params)` looks the key up in the current language,
// falls back to English per key, and substitutes {name} placeholders. `tn(key, n)` picks the
// plural form with Intl.PluralRules ("key.one", "key.few", "key.other", ...). Missing keys render
// as the key itself in the browser and throw in strict mode (tests).
//
// Category names, bank names and statement vocabulary are data, not UI strings, and are never
// translated here. The chosen language is a per-browser convenience in localStorage.

import en from './en.json' with { type: 'json' };
import cs from './cs.json' with { type: 'json' };

export const LANGUAGES = { en: 'English', cs: 'Čeština' };
export const dictionaries = { en, cs };
const KEY = 'spend-lang';
let current = 'en';
let strict = false;

export function setStrict(value) { strict = Boolean(value); }
export const getLanguage = () => current;

/** Stored choice, else the browser language (Czech and Slovak get Czech), else English. */
export function detectLanguage(nav = globalThis.navigator) {
  try { const stored = globalThis.localStorage && localStorage.getItem(KEY); if (stored && dictionaries[stored]) return stored; } catch { /* storage unavailable */ }
  const lang = String((nav && nav.language) || '').toLowerCase();
  return lang.startsWith('cs') || lang.startsWith('sk') ? 'cs' : 'en';
}

export function setLanguage(lang, { persist = true } = {}) {
  if (!dictionaries[lang]) return;
  current = lang;
  if (persist) { try { localStorage.setItem(KEY, lang); } catch { /* ignore */ } }
  if (globalThis.document) document.documentElement.lang = lang;
}

export function t(key, params) {
  let s = dictionaries[current][key];
  if (s === undefined) s = dictionaries.en[key];
  if (s === undefined) {
    if (strict) throw new Error(`missing i18n key: ${key}`);
    return key;
  }
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m));
}

export function tn(key, n, params = {}) {
  const form = new Intl.PluralRules(current).select(n);
  const full = dictionaries[current][`${key}.${form}`] !== undefined || dictionaries.en[`${key}.${form}`] !== undefined ? `${key}.${form}` : `${key}.other`;
  return t(full, { n, ...params });
}

/** Fill elements marked data-i18n="key" (text) and data-i18n-attr="attr:key;attr:key". */
export function translateStatic(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  }
}
