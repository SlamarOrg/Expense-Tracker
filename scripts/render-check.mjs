#!/usr/bin/env node
// Headless render check, the one browser-level test. Opens the page in headless Chrome or Edge,
// waits for the virtual time budget, dumps the DOM and asserts that the dashboard set
// data-ready="1" on <body> and that #errlog is empty.
//
//   node scripts/render-check.mjs <url-or-file> [--theme auto|light|dark] [--lang en|cs]
//                                 [--screenshot out.png] [--budget 30000] [--width 1400] [--height 2600]
//
// The browser comes from $BROWSER, otherwise the usual install paths are tried.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);

export function findBrowser() {
  return CANDIDATES.find((p) => existsSync(p)) || null;
}

export function toUrl(target, params = {}) {
  const url = /^[a-z]+:\/\//i.test(target) ? new URL(target) : new URL(pathToFileURL(resolve(target)).href);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.href;
}

export function inspectDom(html) {
  const ready = /<body[^>]*\sdata-ready="([^"]*)"/.exec(html);
  const err = /<div id="errlog"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  return { ready: ready ? ready[1] : null, errors: err ? err[1].trim() : '' };
}

/** @returns {Promise<{ok: boolean, ready: string|null, errors: string, html: string}>} */
export function renderCheck(target, { theme, lang, screenshot, budget = 30000, width = 1400, height = 2600, browser = findBrowser() } = {}) {
  if (!browser) return Promise.reject(new Error('no Chrome or Edge found; set $BROWSER'));
  const url = toUrl(target, { theme, lang });
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--virtual-time-budget=${budget}`, `--window-size=${width},${height}`, '--dump-dom'];
  if (screenshot) args.push(`--screenshot=${resolve(screenshot)}`);
  args.push(url);
  return new Promise((resolvePromise, reject) => {
    execFile(browser, args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      if (error && !stdout) { reject(error); return; }
      const { ready, errors } = inspectDom(stdout);
      resolvePromise({ ok: ready === '1' && errors === '', ready, errors, html: stdout });
    });
  });
}

if (process.argv[1] && /render-check\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const theme = opt('--theme');
  const lang = opt('--lang');
  const screenshot = opt('--screenshot');
  const budget = Number(opt('--budget') || 30000);
  const width = Number(opt('--width') || 1400);
  const height = Number(opt('--height') || 2600);
  const target = args[0];
  if (!target) { console.error('usage: node scripts/render-check.mjs <url-or-file> [--theme dark] [--lang cs] [--screenshot out.png]'); process.exit(2); }
  const r = await renderCheck(target, { theme, lang, screenshot, budget, width, height });
  console.log(`${r.ok ? 'OK' : 'FAIL'} ${target}${theme ? ' theme=' + theme : ''}${lang ? ' lang=' + lang : ''}: data-ready=${JSON.stringify(r.ready)}${r.errors ? '\n' + r.errors : ''}`);
  process.exit(r.ok ? 0 : 1);
}
