// Spike: turn a PDF into lines the way `pdftotext -raw` does, using the vendored pdf.js in Node.
//   node scripts/spike/extract.mjs <file.pdf> [--debug]
// Prints one line per reconstructed text line. With --debug prints x/y per item.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const VENDOR = new URL('../../vendor/', import.meta.url);
const pdfjs = await import(new URL('pdf.min.mjs', VENDOR).href);
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', VENDOR).href;

export async function pdfToLines(data, { debug = false } = {}) {
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let cur = '';
    let lastY = null;
    let lastX = null;
    let lastH = 0;
    for (const it of content.items) {
      if (!('str' in it)) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      const h = it.height || lastH;
      if (debug) console.log(JSON.stringify({ x: +x.toFixed(1), y: +y.toFixed(1), w: +it.width.toFixed(1), h: +h.toFixed(1), eol: it.hasEOL, s: it.str }));
      const newLine = lastY !== null && Math.abs(y - lastY) > Math.max(1, h * 0.3);
      if (newLine) { lines.push(cur); cur = ''; lastX = null; }
      if (it.str !== '') {
        if (cur && lastX !== null && x - lastX > 0.2 * h && !cur.endsWith(' ') && !it.str.startsWith(' ')) cur += ' ';
        cur += it.str;
        lastX = x + it.width;
      } else if (it.hasEOL === false && it.width > 0) {
        lastX = x + it.width;
      }
      if (it.hasEOL) { lines.push(cur); cur = ''; lastX = null; lastY = null; continue; }
      lastY = y;
      lastH = h;
    }
    if (cur) lines.push(cur);
    lines.push('\f');
  }
  await doc.destroy();
  return lines.map((l) => l.replace(/\s+/g, ' ').trim());
}

if (process.argv[2]) {
  const data = new Uint8Array(await readFile(process.argv[2]));
  const lines = await pdfToLines(data, { debug: process.argv.includes('--debug') });
  if (!process.argv.includes('--debug')) console.log(lines.join('\n'));
}
