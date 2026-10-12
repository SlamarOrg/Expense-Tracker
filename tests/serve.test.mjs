import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '../scripts/serve.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('dev server serves files with the right content type and blocks path traversal', async () => {
  const server = await serve(ROOT, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const pkg = await fetch(`${base}/package.json`);
    assert.equal(pkg.status, 200);
    assert.match(pkg.headers.get('content-type'), /application\/json/);
    assert.equal((await pkg.json()).name, 'bank-statement-dashboard');

    const mjs = await fetch(`${base}/scripts/serve.mjs`);
    assert.match(mjs.headers.get('content-type'), /text\/javascript/);

    const missing = await fetch(`${base}/does-not-exist.html`);
    assert.equal(missing.status, 404);

    const traversal = await fetch(`${base}/..%2F..%2Fwindows%2Fwin.ini`);
    assert.ok(traversal.status === 403 || traversal.status === 404);
  } finally {
    server.close();
  }
});
