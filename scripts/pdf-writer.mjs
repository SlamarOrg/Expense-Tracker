// Dependency-free writer for text-only PDFs. Used to generate the synthetic Air Bank statement
// sample. Helvetica (base-14) with a custom single-byte encoding so Czech letters survive text
// extraction: WinAnsi covers the acute vowels, the carons and the ring are mapped through
// /Differences to standard glyph names that pdf.js and pdftotext both know.
//
// Text is written cell by cell in the order given, which is the order pdf.js and pdftotext -raw
// return it. Each page is an array of { x, y, text, size } (PDF points, origin bottom-left).

const PAGE_W = 595;
const PAGE_H = 842;

// Glyph names for the Czech letters WinAnsi lacks, assigned codes from 128 upward.
const DIFFERENCES = [
  ['Č', 'Ccaron'], ['č', 'ccaron'], ['Ď', 'Dcaron'], ['ď', 'dcaron'], ['Ě', 'Ecaron'], ['ě', 'ecaron'],
  ['Ň', 'Ncaron'], ['ň', 'ncaron'], ['Ř', 'Rcaron'], ['ř', 'rcaron'], ['Š', 'Scaron'], ['š', 'scaron'],
  ['Ť', 'Tcaron'], ['ť', 'tcaron'], ['Ů', 'Uring'], ['ů', 'uring'], ['Ž', 'Zcaron'], ['ž', 'zcaron'],
];
const CODE_OF = new Map(DIFFERENCES.map(([ch], i) => [ch, 128 + i]));

export function encodeText(text) {
  const bytes = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (CODE_OF.has(ch)) bytes.push(CODE_OF.get(ch));
    else if (cp < 128 || (cp >= 0xa0 && cp <= 0xff)) bytes.push(cp); // ASCII and Latin-1 are WinAnsi
    else bytes.push(0x3f); // '?' for anything else
  }
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function contentStream(cells) {
  const ops = ['BT'];
  for (const c of cells) {
    ops.push(`/F1 ${c.size || 8} Tf 1 0 0 1 ${c.x.toFixed(1)} ${c.y.toFixed(1)} Tm <${encodeText(c.text)}> Tj`);
  }
  ops.push('ET');
  return ops.join('\n');
}

/** @param {Array<Array<{x:number,y:number,text:string,size?:number}>>} pages */
export function writePdf(pages) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding ' + (objects.length + 2) + ' 0 R >>');
  add('<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [ 128 ' + DIFFERENCES.map(([, g]) => '/' + g).join(' ') + ' ] >>');
  const pageIds = [];
  for (const cells of pages) {
    const stream = contentStream(cells);
    const contents = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [ ${pageIds.map((i) => i + ' 0 R').join(' ')} ] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

export { PAGE_W, PAGE_H };
