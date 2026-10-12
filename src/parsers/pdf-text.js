// PDF to text lines, reproducing `pdftotext -raw`: items in content-stream order, a new line
// whenever pdf.js flags an end of line or the baseline moves. Verified line for line against
// pdftotext on real Air Bank statements (see tasks/plan.md, T2).
//
// The pdf.js library is passed in: the browser bundle uses the inlined global, Node tests load
// vendor/pdf.min.mjs. pdf.js detaches the buffer it is given, so a copy is made here.

// pdf.js is forced onto its main-thread "fake worker": a statement is small, the result is needed
// right away, and a real Worker cannot start from a file:// page in every browser. Hiding the Worker
// constructor while getDocument() creates its PDFWorker makes pdf.js take that path itself.
function withoutWebWorker(fn) {
  const g = globalThis;
  const hadWorker = Object.prototype.hasOwnProperty.call(g, 'Worker') || 'Worker' in g;
  const RealWorker = g.Worker;
  if (hadWorker) { try { g.Worker = undefined; } catch { /* read-only, fall through */ } }
  try { return fn(); } finally { if (hadWorker) { try { g.Worker = RealWorker; } catch { /* ignore */ } } }
}

/**
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {object} pdfjs the pdf.js library namespace (getDocument, GlobalWorkerOptions, ...)
 * @returns {Promise<string[]>} lines; a lone "\f" marks a page break
 */
export async function pdfToLines(bytes, pdfjs) {
  // a plain Uint8Array copy: pdf.js rejects Node Buffers and detaches whatever it gets
  const data = new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const doc = await withoutWebWorker(() => pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 })).promise;
  const lines = [];
  try {
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
        if (lastY !== null && Math.abs(y - lastY) > Math.max(1, h * 0.3)) { lines.push(cur); cur = ''; lastX = null; }
        if (it.str !== '') {
          if (cur && lastX !== null && x - lastX > 0.2 * h && !cur.endsWith(' ') && !it.str.startsWith(' ')) cur += ' ';
          cur += it.str;
          lastX = x + it.width;
        } else if (it.width > 0) {
          lastX = x + it.width;
        }
        if (it.hasEOL) { lines.push(cur); cur = ''; lastX = null; lastY = null; continue; }
        lastY = y;
        lastH = h;
      }
      if (cur) lines.push(cur);
      lines.push('\f');
    }
  } finally {
    await doc.destroy();
  }
  return lines.map((l) => (l === '\f' ? l : l.replace(/\s+/g, ' ').trim()));
}
