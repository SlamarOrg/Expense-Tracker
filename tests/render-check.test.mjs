// Browser-level tests over the DevTools Protocol. Skipped when no Chrome or Edge is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { serve } from '../scripts/serve.mjs';
import { findBrowser, renderCheck, inspectDom, checkPage } from '../scripts/render-check.mjs';
import { launch } from '../scripts/cdp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SAMPLES = ['fio-sample.csv', 'revolut-sample.csv', 'airbank-sample.pdf'].map((f) => fileURLToPath(new URL(`../samples/${f}`, import.meta.url)));
const browser = findBrowser();
const skip = !browser && 'no headless browser available';

test('inspectDom reads the readiness flag, the empty flag and the error log', () => {
  assert.deepEqual(inspectDom('<body data-ready="1"><div id="errlog" aria-hidden="true"></div>'), { ready: '1', errors: '', empty: false });
  assert.deepEqual(inspectDom('<body data-empty="1"><div id="errlog">ERROR: x\n</div>'), { ready: null, errors: 'ERROR: x', empty: true });
});

test('demo mode renders the samples without errors in light and dark; a fresh profile shows the empty state', { skip }, async () => {
  const server = await serve(ROOT, 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    for (const theme of ['light', 'dark']) {
      const r = await renderCheck(base + '?demo=1', { theme, browser });
      assert.equal(r.errors, '', `errors in ${theme}`);
      assert.equal(r.ready, '1', `not ready in ${theme}`);
      assert.equal(r.empty, false);
      assert.match(r.html, /class="card kpi hero"/);
    }
    const fresh = await renderCheck(base, { browser });
    assert.equal(fresh.errors, '');
    assert.equal(fresh.ready, '1');
    assert.equal(fresh.empty, true);
  } finally {
    server.close();
  }
});

test('importing through the file input stores rows in IndexedDB, survives a reload, re-import adds nothing', { skip }, async () => {
  const server = await serve(ROOT, 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const b = await launch({ browser });
  try {
    const page = await b.newPage();
    await page.goto(base);
    assert.equal((await checkPage(page)).empty, true);

    await page.setFiles('body > input[type=file]', SAMPLES);
    await page.waitFor('!document.body.dataset.empty && /47 new transactions/.test(document.getElementById("importPanel").textContent)');
    assert.match(await page.eval('document.getElementById("importPanel").textContent'), /Debit total matches the statement/);
    const txCount = await page.eval('document.getElementById("txHint").textContent');

    await page.reload();
    const after = await checkPage(page);
    assert.equal(after.errors, '');
    assert.equal(after.empty, false, 'data persisted across the reload');
    assert.equal(await page.eval('document.getElementById("txHint").textContent'), txCount);

    await page.setFiles('body > input[type=file]', SAMPLES.slice(0, 1));
    await page.waitFor('/0 new transactions/.test(document.getElementById("importPanel").textContent)');
    assert.match(await page.eval('document.getElementById("importPanel").textContent'), /20 already imported/);
    assert.deepEqual(page.exceptions, []);
  } finally {
    await b.close();
    server.close();
  }
});
