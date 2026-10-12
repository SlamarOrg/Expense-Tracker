#!/usr/bin/env node
// Minimal static dev server. ES modules do not load from file:// in Chrome, so development
// runs over HTTP. No caching, no directory listing, no dependencies.
//
//   node scripts/serve.mjs [port]      default port 8080, 0 picks a free one

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

export function serve(root, port = 8080) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const full = normalize(join(root, path));
    if (!full.startsWith(normalize(root + sep)) && full !== normalize(root)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    try {
      const st = await stat(full);
      if (st.isDirectory()) { res.writeHead(301, { Location: path + '/' }); res.end(); return; }
      const body = await readFile(full);
      res.writeHead(200, { 'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + path);
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
