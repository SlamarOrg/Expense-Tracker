#!/usr/bin/env node
// Headless render check, the browser-level smoke test. Opens the page in headless Chrome or Edge
// through the DevTools Protocol (scripts/cdp.mjs), waits until <body data-ready="1"> or an error,
// and fails when #errlog has any text or the page throws.
//
//   node scripts/render-check.mjs <url-or-file> [--theme auto|light|dark] [--lang en|cs]
//                                 [--screenshot out.png] [--width 1400] [--height 1000] [--timeout 30000]
//
// The browser comes from $BROWSER, otherwise the usual install paths are tried. Each run uses a
// fresh throwaway profile, so IndexedDB and localStorage start empty.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

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
  const empty = /<body[^>]*\sdata-empty="1"/.test(html);
  const err = /<div id="errlog"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  return { ready: ready ? ready[1] : null, errors: err ? err[1].trim() : '', empty };
}

const READY = '(document.body && document.body.dataset.ready === "1") || ((document.getElementById("errlog") || {}).textContent || "").trim() !== ""';

/** Check an already open page (cdp.mjs Page). */
export async function checkPage(page, { timeout = 30000 } = {}) {
  await page.waitFor(READY, { timeout }).catch(() => {});
  const html = await page.eval('document.documentElement.outerHTML');
  const r = inspectDom(html);
  const errors = [r.errors, ...page.exceptions].filter(Boolean).join('\n');
  return { ok: r.ready === '1' && errors === '', ready: r.ready, errors, empty: r.empty, html };
}

/** @returns {Promise<{ok: boolean, ready: string|null, errors: string, empty: boolean, html: string}>} */
export async function renderCheck(target, { theme, lang, screenshot, width = 1400, height = 1000, timeout = 30000, browser = findBrowser() } = {}) {
  if (!browser) throw new Error('no Chrome or Edge found; set $BROWSER');
  const b = await launch({ browser });
  try {
    const page = await b.newPage({ width, height });
    await page.goto(toUrl(target, { theme, lang }));
    const result = await checkPage(page, { timeout });
    if (screenshot) {
      await page.screenshot(resolve(screenshot));
    }
    return result;
  } finally {
    await b.close();
  }
}

if (process.argv[1] && /render-check\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const theme = opt('--theme');
  const lang = opt('--lang');
  const screenshot = opt('--screenshot');
  const width = Number(opt('--width') || 1400);
  const height = Number(opt('--height') || 1000);
  const timeout = Number(opt('--timeout') || 30000);
  const target = args[0];
  if (!target) { console.error('usage: node scripts/render-check.mjs <url-or-file> [--theme dark] [--lang cs] [--screenshot out.png]'); process.exit(2); }
  const r = await renderCheck(target, { theme, lang, screenshot, width, height, timeout });
  console.log(`${r.ok ? 'OK' : 'FAIL'} ${target}${theme ? ' theme=' + theme : ''}${lang ? ' lang=' + lang : ''}: data-ready=${JSON.stringify(r.ready)}${r.empty ? ' (empty state)' : ''}${r.errors ? '\n' + r.errors : ''}`);
  process.exit(r.ok ? 0 : 1);
}
