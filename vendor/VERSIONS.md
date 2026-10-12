# Vendored libraries

Unmodified copies. Update by downloading the same path with a new version number.

| File | Library | Version | Source |
|---|---|---|---|
| `chart.umd.js` | Chart.js | 4.4.4 | https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js |
| `pdf.min.mjs` | pdf.js (legacy build) | 4.10.38 | https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs |
| `pdf.worker.min.mjs` | pdf.js worker (legacy build) | 4.10.38 | https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs |

## How pdf.js is loaded

- Everywhere, pdf.js runs its "fake worker" on the main thread: `src/parsers/pdf-text.js` hides
  the `Worker` constructor while `getDocument()` sets up, so pdf.js imports `workerSrc` as a
  module instead of starting a thread. A real Worker cannot start from `file://` in every
  browser, and headless Chrome never let one finish under a virtual time budget.
- In Node (tests, CLI) and in development: `GlobalWorkerOptions.workerSrc` is the URL of
  `pdf.worker.min.mjs`.
- In the browser bundle: the worker source is inlined in a `<script type="text/plain">` element,
  turned into a Blob URL and used as `workerSrc`; dynamic import of a `blob:` module works from
  `file://` (origin `null`) in Chrome and Edge. Firefox is untested (not installed on the
  development machine).
- pdf.js transfers (detaches) the `ArrayBuffer` it is given and rejects Node `Buffer`s. Always
  pass it a plain `Uint8Array` copy.
