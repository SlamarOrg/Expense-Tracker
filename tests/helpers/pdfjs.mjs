// Loads the vendored pdf.js for Node tests and scripts. The worker runs on the main thread
// ("fake worker") from the vendored worker file.
const VENDOR = new URL('../../vendor/', import.meta.url);

let lib;
export async function loadPdfjs() {
  if (!lib) {
    lib = await import(new URL('pdf.min.mjs', VENDOR).href);
    lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', VENDOR).href;
  }
  return lib;
}
