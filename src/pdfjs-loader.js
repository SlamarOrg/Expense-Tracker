// Loads pdf.js for the browser. In development (ES modules over the dev server) the vendored
// library is imported directly and `workerSrc` points at the vendored worker file, which pdf.js
// imports onto the main thread (see pdf-text.js: the "fake worker" path is forced everywhere).
// The release bundle replaces this module: the library is inlined and `workerSrc` is a Blob URL
// made from the inlined worker source.

let lib = null;

export async function loadPdfjs() {
  if (lib) return lib;
  lib = await import('../vendor/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return lib;
}
