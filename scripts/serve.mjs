#!/usr/bin/env node
// Minimal static dev server. ES modules do not load from file:// in Chrome, so development
// runs over HTTP. No caching, no directory listing, no dependencies.
//
//   node scripts/serve.mjs [port]      default port 8080, 0 picks a free one
//
// It listens on 127.0.0.1 only and serves only what the page loads (index.html and the folders
// in SERVED). Hidden files, tasks/ and tests/ stay out of reach, and requests for any host name
// other than localhost are refused, so a web page that rebinds its own name to 127.0.0.1 (DNS
// rebinding) cannot read files from the working copy while the server runs.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

const SERVED = new Set(['index.html', 'src', 'vendor', 'rules', 'samples', 'dist', 'docs']);
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** True for a path the page needs: first segment in SERVED and no hidden segment anywhere. */
export function isServedPath(path) {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 0 && SERVED.has(parts[0]) && !parts.some((p) => p.startsWith('.'));
}

export function serve(root, port = 8080) {
  const server = createServer(async (req, res) => {
    if (!LOCAL_HOST.test(req.headers.host || '')) { res.writeHead(403); res.end('forbidden'); return; }
    const url = new URL(req.url, 'http://localhost');
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end('bad request'); return; }
    if (path.endsWith('/')) path += 'index.html';
    const full = normalize(join(root, path));
    if (!full.startsWith(normalize(root + sep)) && full !== normalize(root)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    if (!isServedPath(path.replace(/\\/g, '/'))) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    try {
      const st = await stat(full);
      if (st.isDirectory()) { res.writeHead(301, { Location: path + '/' }); res.end(); return; }
      const body = await readFile(full);
      res.writeHead(200, { 'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*\//, ''))) {
  const root = process.cwd();
  const port = Number(process.argv[2] || 8080);
  const server = await serve(root, port);
  console.log(`serving ${root} at http://localhost:${server.address().port}/`);
}
