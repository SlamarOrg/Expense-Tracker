// Browser-level smoke test: the dev page renders the samples with no errors, in both themes.
// Skipped when no Chrome or Edge is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '../scripts/serve.mjs';
import { findBrowser, renderCheck, inspectDom } from '../scripts/render-check.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const browser = findBrowser();

test('inspectDom reads the readiness flag and the error log', () => {
  assert.deepEqual(inspectDom('<body data-ready="1"><div id="errlog" aria-hidden="true"></div>'), { ready: '1', errors: '' });
  assert.deepEqual(inspectDom('<body><div id="errlog">ERROR: x\n</div>'), { ready: null, errors: 'ERROR: x' });
});

test('the dev page renders the samples without errors in light and dark', { skip: !browser && 'no headless browser available' }, async () => {
  const server = await serve(ROOT, 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    for (const theme of ['light', 'dark']) {
      const r = await renderCheck(base, { theme, browser });
      assert.equal(r.errors, '', `errors in ${theme}`);
      assert.equal(r.ready, '1', `not ready in ${theme}`);
      assert.match(r.html, /class="card kpi hero"/);
    }
  } finally {
    server.close();
  }
});
