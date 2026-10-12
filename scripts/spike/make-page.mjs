// Spike: write a small statement-like PDF with Czech text, extract it in Node, and build a
// self-contained file:// page that extracts the same PDF in the browser with inlined pdf.js and
// an inlined worker (Blob URL). Output goes to scripts/spike/out/ (gitignored).
//   node scripts/spike/make-page.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { writePdf } from '../pdf-writer.mjs';
import { pdfToLines } from './extract.mjs';

const OUT = new URL('out/', import.meta.url);
await mkdir(OUT, { recursive: true });

// Mimic the real geometry: date column at x=60, type/code at 108, name/account at 186,
// amount at 502, fee at 548; rows 11.6pt apart, blocks 27.7pt apart.
const cells = [];
let y = 760;
const put = (x, text, size) => cells.push({ x, y, text, size });
put(60, 'Číslo účtu: 1234567890 / 3030', 9); y -= 12;
put(60, 'Počáteční zůstatek: 1 000,00 Připsáno na účet: 2 500,00', 8); y -= 12;
put(60, 'Konečný zůstatek: 1 388,00 Odepsáno z účtu: 2 112,00', 8); y -= 20;
for (const row of [
  ['22.09.2025', '22.09.2025', 'Příchozí úhrada', '1234567001', 'NOVÁKOVÁ TEREZA', '19-0000000123 / 0100', '2 500,00', '0,00'],
  ['23.09.2025', '24.09.2025', 'Platba kartou', '1234567002', 'ŽLUŤOUČKÝ KŮŇ s.r.o.', '516844******4400', '-1 012,00', '0,00'],
  ['25.09.2025', '25.09.2025', 'Odchozí úhrada', '1234567003', 'Příliš dlouhé jméno', '12-3456789012 / 0800', '-1 100,00', '0,00'],
]) {
  const [d1, d2, type, code, name, acct, amt, fee] = row;
  cells.push({ x: 60, y, text: d1 }); cells.push({ x: 60, y: y - 11.6, text: d2 });
  cells.push({ x: 108, y, text: type }); cells.push({ x: 108, y: y - 11.6, text: code });
  cells.push({ x: 186, y, text: name }); cells.push({ x: 186, y: y - 11.6, text: acct });
  cells.push({ x: 502, y, text: amt }); cells.push({ x: 548, y, text: fee });
  y -= 27.7;
}
const pdf = writePdf([cells]);
await writeFile(new URL('sample.pdf', OUT), pdf);

// pdf.js transfers (detaches) the buffer it is given, so hand it a copy
const nodeLines = (await pdfToLines(pdf.slice())).filter((l) => l && l !== '\f');
console.log('--- node extraction ---');
console.log(nodeLines.join('\n'));

const lib = await readFile(new URL('../../vendor/pdf.min.mjs', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../vendor/pdf.worker.min.mjs', import.meta.url), 'utf8');
const b64 = Buffer.from(pdf).toString('base64');
const extractSrc = (await readFile(new URL('extract.mjs', import.meta.url), 'utf8'))
  .replace(/^import[^\n]*\n/gm, '').replace(/^const VENDOR[^\n]*\n/m, '').replace(/^const pdfjs[^\n]*\n/m, '')
  .replace(/^pdfjs\.GlobalWorkerOptions[^\n]*\n/m, '').replace(/^if \(process\.argv\[2\]\) \{[\s\S]*$/m, '').replace('export async function', 'async function');

const libInline = lib.replace(/<\/script/g, '<\/script').replace(/export\s*\{[^}]*\}\s*;?\s*$/, (m) => 'const pdfjs = {' + m.replace(/^export\s*\{/, '').replace(/\};?\s*$/, '').split(',').map((p) => { const [a, b] = p.trim().split(/\s+as\s+/); return (b || a) + ': ' + a; }).join(', ') + '};');
const pageScript = [
  "window.addEventListener('unhandledrejection', (e) => { document.getElementById('err').textContent += 'REJ ' + (e.reason && e.reason.stack || e.reason) + String.fromCharCode(10); });",
  "window.onerror = (m) => { document.getElementById('err').textContent += m + String.fromCharCode(10); };",
  "console.log('module start');",
  libInline,
  "const workerBlob = new Blob([document.getElementById('worker').textContent], { type: 'text/javascript' });",
  "pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);",
  "console.log('workerSrc', pdfjs.GlobalWorkerOptions.workerSrc, 'version', pdfjs.version);",
  extractSrc,
  "const bytes = Uint8Array.from(atob('" + b64 + "'), (c) => c.charCodeAt(0));",
  "try {",
  "  const lines = (await pdfToLines(bytes)).filter((l) => l && l !== String.fromCharCode(12));",
  "  document.getElementById('out').textContent = lines.join(String.fromCharCode(10));",
  "  document.documentElement.setAttribute('data-ready', '1');",
  "} catch (e) {",
  "  document.getElementById('err').textContent += String(e && e.stack || e);",
  "  document.documentElement.setAttribute('data-ready', 'error');",
  "}",
].join('\n');
const html = '<!doctype html><meta charset="utf-8"><title>pdf.js file:// spike</title>\n<pre id="out">loading</pre><pre id="err"></pre>\n'
  + '<script type="text/plain" id="worker">' + worker.replace(/<\/script/g, '<\/script') + '</script>\n'
  + '<script type="module">\n' + pageScript + '\n</script>\n';
await writeFile(new URL('spike.html', OUT), html);
console.log('wrote', new URL('spike.html', OUT).pathname);
