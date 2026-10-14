import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { serve } from '../scripts/serve.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Raw GET so the Host header can be set freely. */
function get(port, path, host = `127.0.0.1:${port}`) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { Host: host } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end();
  });
}

test('dev server serves files with the right content type and blocks path traversal', async () => {
  const server = await serve(ROOT, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const json = await fetch(`${base}/rules/default-cz.json`);
    assert.equal(json.status, 200);
    assert.match(json.headers.get('content-type'), /application\/json/);
    assert.ok((await json.json()).categories);

    const mjs = await fetch(`${base}/vendor/pdf.min.mjs`);
    assert.equal(mjs.status, 200);
    assert.match(mjs.headers.get('content-type'), /text\/javascript/);
    await mjs.arrayBuffer();

    const missing = await fetch(`${base}/src/does-not-exist.js`);
    assert.equal(missing.status, 404);

    const traversal = await fetch(`${base}/..%2F..%2Fwindows%2Fwin.ini`);
    assert.ok(traversal.status === 403 || traversal.status === 404);
  } finally {
    server.close();
  }
});

test('dev server serves only the app folders, refuses hidden files, foreign hosts and broken URLs', async () => {
  const server = await serve(ROOT, 0);
  const port = server.address().port;
  try {
    assert.equal(await get(port, '/index.html'), 200);
    assert.equal(await get(port, '/'), 200);
    assert.equal(await get(port, '/index.html', `localhost:${port}`), 200);
    // DNS rebinding: a page on another name that resolves to 127.0.0.1 must not read local files
    assert.equal(await get(port, '/index.html', 'attacker.example'), 403);
    for (const path of ['/.private-denylist', '/.git/config', '/src/.hidden', '/tasks/todo.md', '/tests/serve.test.mjs', '/package.json']) {
      assert.equal(await get(port, path), 404, path);
    }
    assert.equal(await get(port, '/%E0%A4%A'), 400, 'a malformed escape is a 400, not a crash');
    assert.equal(await get(port, '/index.html'), 200, 'still serving after the bad request');
  } finally {
    server.close();
  }
});
